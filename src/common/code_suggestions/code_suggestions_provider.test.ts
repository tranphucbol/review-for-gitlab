import * as vscode from 'vscode';
import fetch from '../fetch_logged';

import { codeSuggestionsTelemetry, Experiment } from './code_suggestions_telemetry';

import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { project } from '../test_utils/entities';
import { log } from '../log';
import {
  CIRCUIT_BREAK_INTERVAL_MS,
  CodeSuggestionPrompt,
  CodeSuggestionsProvider,
} from './code_suggestions_provider';
import {
  CodeSuggestionsStateManager,
  GlobalCodeSuggestionsState,
  VisibleCodeSuggestionsState,
} from './code_suggestions_state';
import { GitLabProject } from '../platform/gitlab_project';
import { COMMAND_CODE_SUGGESTION_ACCEPTED } from './commands/code_suggestion_accepted';
import { GITLAB_AI_ASSISTED_CODE_SUGGESTIONS_API_PATH } from './constants';
import { ApiRequest, PostRequest } from '../platform/web_ide';
import { LegacyApiFallbackConfig } from './legacy_api_fallback_config';
import { GitLabPlatformManagerForCodeSuggestions } from './gitlab_platform_manager_for_code_suggestions';
import {
  CodeSuggestionsTelemetryManager,
  CodeSuggestionTelemetryState,
} from './code_suggestions_telemetry_manager';

jest.mock('../log');
jest.mock('../fetch_logged');

jest.mock('./code_suggestions_telemetry_manager', () => ({
  CodeSuggestionsTelemetryManager: {
    updateSuggestionState: jest.fn(),
    createSuggestion: jest.fn().mockReturnValue('123'),
    rejectOpenedSuggestions: jest.fn(),
    setSuggestionModel: jest.fn(),
  },
  CodeSuggestionTelemetryState: {
    REQUESTED: 'REQUESTED',
    LOADED: 'LOADED',
    ACCEPTED: 'ACCEPTED',
    ERROR: 'ERROR',
    SHOWN: 'SHOWN',
  },
}));

const { updateSuggestionState, rejectOpenedSuggestions, setSuggestionModel } = jest.requireMock(
  './code_suggestions_telemetry_manager',
).CodeSuggestionsTelemetryManager;

/**
 * @deprecated use jest.mocked() instead
 */
const asMock = (mockFn: unknown) => mockFn as jest.Mock;

const crossFetchCalls = () => asMock(fetch).mock.calls;
const lastFetchCallBody = () =>
  JSON.parse(asMock(fetch).mock.calls[crossFetchCalls().length - 1][1].body);

const mockPrompt = 'const areaOfCube = ';
const mockDocumentPartial: Partial<vscode.TextDocument> = {
  uri: vscode.Uri.parse('file:///file/path/test.js'),
  getText: () => mockPrompt,
  lineAt: () => ({ text: mockPrompt }) as vscode.TextLine,
};
const mockDocument = mockDocumentPartial as unknown as vscode.TextDocument;
const choice = '(side) => ';
const experiments: Experiment[] = [
  {
    name: 'exp_truncate_suffix',
    variant: 0,
  },
  {
    name: 'exp_trim_completions',
    variant: 1,
  },
];
const mockCompletions = {
  choices: [{ text: choice }],
  model: { name: 'ensemble', engine: 'codegen' },
  experiments,
};
const telemetryModel = {
  name: 'testModel',
  engine: 'testEngine',
  lang: 'c',
};
const mockPosition = {
  line: 0,
  character: mockPrompt.length,
} as vscode.Position;

const token = {
  access_token: '123',
  expires_in: 0,
  created_at: 0,
};

function createManager(
  platformProject?: GitLabProject,
  fetchFromApiMock = jest.fn().mockResolvedValue(token),
): GitLabPlatformManagerForCodeSuggestions {
  const manager = new GitLabPlatformManagerForCodeSuggestions(
    {} as unknown as GitLabPlatformManager,
  );

  jest.spyOn(manager, 'getGitLabPlatform').mockResolvedValue(
    platformProject
      ? {
          type: 'project',
          project: platformProject,
          fetchFromApi: fetchFromApiMock,
          getUserAgentHeader: () => ({}),
        }
      : {
          type: 'account',
          fetchFromApi: fetchFromApiMock,
          getUserAgentHeader: () => ({}),
        },
  );

  return manager;
}

let manager = createManager(project);

function createLegacyApiFallbackConfig(shouldUseModelGateway: boolean): LegacyApiFallbackConfig {
  return {
    tryAgainAfterTimestamp: 0,
    retryDelayMS: 1,
    manager,
    isLegacyVersion: false,
    fallbackToModelGateway: jest.fn(),
    shouldUseModelGateway: jest.fn().mockReturnValue(shouldUseModelGateway),
    flagLegacyVersion: jest.fn(),
    verifyGitLabVersion: jest.fn(),
  } as unknown as LegacyApiFallbackConfig;
}

let legacyApiFallbackConfig: LegacyApiFallbackConfig;

const cancellationToken = new vscode.CancellationTokenSource().token;

const stateManager = new CodeSuggestionsStateManager();

function getCompletionsWithDefaultArgs(glcp: CodeSuggestionsProvider) {
  return glcp.getCompletions({ document: mockDocument, position: mockPosition, cancellationToken });
}

const filterCodeSuggestionRequest = ([request]: ApiRequest<unknown>[]) =>
  request.type === 'rest' &&
  request.method === 'POST' &&
  request.path === GITLAB_AI_ASSISTED_CODE_SUGGESTIONS_API_PATH;

const codeSuggestionMonolithCalls = (mocked: jest.Mock) =>
  jest
    .mocked(mocked)
    .mock.calls.filter(filterCodeSuggestionRequest) as unknown as PostRequest<unknown>[][];

describe('CodeSuggestionsProvider', () => {
  const testDocument = {
    getText(range: vscode.Range): string {
      if (range.start.character === 0 && range.start.line === 0) {
        return 'before';
      }
      return 'after';
    },
    lineAt: () => ({ text: mockPrompt }) as vscode.TextLine,
    fileName: 'test.js',
    languageId: 'javascript',
  } as unknown as vscode.TextDocument;

  const position = {
    line: 1,
    character: mockPrompt.length,
  } as vscode.Position;

  describe('getCompletions', () => {
    const projectForSelfManaged: GitLabProject = {
      gqlId: 'gid://my-gitlab/Project/5261717',
      restId: 5261717,
      name: 'test-project',
      description: '',
      namespaceWithPath: 'my-gitlab/Project',
      webUrl: 'https://gitlab.example.com/gitlab-org/gitlab-vscode-extension',
    };

    describe('without new GitLab monolith code suggestion API available', () => {
      const fetchFromApiMock = jest.fn().mockImplementation(request => {
        if (request.path === '/code_suggestions/tokens') {
          return Promise.resolve(token);
        }
        // eslint-disable-next-line prefer-promise-reject-errors
        return Promise.reject({ status: 403 });
      });

      it('after receiving 403 flags API as legacy and retries', async () => {
        legacyApiFallbackConfig = createLegacyApiFallbackConfig(false);
        const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
          manager: createManager(project, fetchFromApiMock),
          legacyApiFallbackConfig,
          stateManager,
        });

        expect(legacyApiFallbackConfig.fallbackToModelGateway).toHaveBeenCalledTimes(0);

        await glcp.getCompletions({ document: testDocument, position, cancellationToken });

        expect(codeSuggestionMonolithCalls(fetchFromApiMock).length).toBe(1);
        expect(crossFetchCalls().length).toBe(1);
        expect(legacyApiFallbackConfig.fallbackToModelGateway).toHaveBeenCalledTimes(1);
      });

      it('should use model gateway API directly when flagged as legacy', async () => {
        const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
          manager,
          legacyApiFallbackConfig: createLegacyApiFallbackConfig(true),
          stateManager,
        });
        await glcp.getCompletions({ document: testDocument, position, cancellationToken });

        expect(codeSuggestionMonolithCalls(fetchFromApiMock)).toHaveLength(0);
        expect(crossFetchCalls()).toHaveLength(1);
      });
    });

    describe('with new GitLab monolith code suggestion API available', () => {
      const fetchFromApiMock = jest.fn();
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
        manager: createManager(project, fetchFromApiMock),
        legacyApiFallbackConfig: createLegacyApiFallbackConfig(false),
        stateManager,
      });

      it('should construct a payload with line above, line below, file name, prompt version, project id and path', async () => {
        await glcp.getCompletions({ document: testDocument, position, cancellationToken });

        const calls = codeSuggestionMonolithCalls(fetchFromApiMock);
        const inputBody = calls[0][0].body as CodeSuggestionPrompt;

        expect(calls).toHaveLength(1);
        expect(inputBody.prompt_version).toBe(1);
        expect(inputBody.current_file.content_above_cursor).toBe('before');
        expect(inputBody.current_file.content_below_cursor).toBe('after');
        expect(inputBody.current_file.file_name).toBe('test.js');
        expect(inputBody.current_file.language_identifier).toBe('javascript');
        expect(inputBody.prompt_version).toBe(1);
        expect(inputBody.project_id).toBe(project.restId);
        expect(inputBody.project_path).toBe(project.namespaceWithPath);
      });
    });

    it('should not send project id and path unless targeting SaaS', async () => {
      const fetchFromApiMock = jest.fn();
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
        manager: createManager(projectForSelfManaged, fetchFromApiMock),
        legacyApiFallbackConfig: createLegacyApiFallbackConfig(false),
        stateManager,
      });

      await glcp.getCompletions({ document: testDocument, position, cancellationToken });

      const calls = codeSuggestionMonolithCalls(fetchFromApiMock);
      const inputBody = calls[0][0].body as CodeSuggestionPrompt;

      expect(inputBody.project_id).toBe(undefined);
      expect(inputBody.project_path).toBe(undefined);
    });

    describe('input prompt', () => {
      const fetchFromApiMock = jest.fn();
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
        manager: createManager(project, fetchFromApiMock),
        legacyApiFallbackConfig: createLegacyApiFallbackConfig(false),
        stateManager,
      });

      let testPrompt = '';

      const inputTestDocument = {
        getText(range: vscode.Range): string {
          if (range.start.character === 0 && range.start.line === 0) {
            return testPrompt;
          }
          return '';
        },
        lineAt: () => ({ text: testPrompt }) as vscode.TextLine,
      } as unknown as vscode.TextDocument;

      describe('doesnt request a code suggestion', () => {
        it('if content length is too short ', async () => {
          testPrompt = 'const';

          const inpMockPosition = {
            line: 0,
            character: testPrompt.length,
          } as vscode.Position;

          await glcp.getCompletions({
            document: inputTestDocument,
            position: inpMockPosition,
            cancellationToken,
          });

          expect(codeSuggestionMonolithCalls(fetchFromApiMock)).toHaveLength(0);
        });

        it('if non-ignorable chars after cursor', async () => {
          testPrompt = 'const testValue = "test"';

          const inpMockPosition = {
            line: 0,
            character: testPrompt.length - 4,
          } as vscode.Position;

          await glcp.getCompletions({
            document: inputTestDocument,
            position: inpMockPosition,
            cancellationToken,
          });

          expect(codeSuggestionMonolithCalls(fetchFromApiMock)).toHaveLength(0);
        });
      });

      describe('request a code suggestion', () => {
        it('if special characters are past the cursor', async () => {
          testPrompt = 'const newFunctionForValidatingEMail  = (inp) => {}';

          const inpMockPosition = {
            line: 0,
            character: testPrompt.length - 1,
          } as vscode.Position;

          await glcp.getCompletions({
            document: inputTestDocument,
            position: inpMockPosition,
            cancellationToken,
          });

          expect(codeSuggestionMonolithCalls(fetchFromApiMock)).toHaveLength(1);
        });
      });
    });
  });

  describe('provideInlineCompletionItems', () => {
    const mockInlineCompletions = [] as vscode.InlineCompletionItem[];
    const mockContext = {
      triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
    } as vscode.InlineCompletionContext;
    jest.useFakeTimers();

    it('provides inline completions', async () => {
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
        manager,
        stateManager,
        legacyApiFallbackConfig,
        noDebounce: true,
      });
      glcp.getCompletions = jest.fn().mockResolvedValue(mockInlineCompletions);

      jest.runAllTimers();
      await glcp.provideInlineCompletionItems(
        mockDocument,
        mockPosition,
        mockContext,
        cancellationToken,
      );
      jest.runAllTimers();

      expect(rejectOpenedSuggestions).toHaveBeenCalled();
      expect(glcp.getCompletions).toHaveBeenCalled();
      jest.runAllTimers();
    });
  });

  describe(`circuit breaking`, () => {
    beforeEach(() => {
      manager = createManager(project);
      legacyApiFallbackConfig = createLegacyApiFallbackConfig(true);
    });

    const turnOnCircuitBreaker = async (glcp: CodeSuggestionsProvider) => {
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
    };

    it(`starts breaking after 4 errors`, async () => {
      const glcp = new CodeSuggestionsProvider({ manager, stateManager, legacyApiFallbackConfig });

      glcp.fetchCompletions = jest.fn().mockRejectedValue(new Error('test problem'));

      await turnOnCircuitBreaker(glcp);

      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const result = await getCompletionsWithDefaultArgs(glcp);
      expect(result).toEqual([]);
      expect(rejectOpenedSuggestions).toHaveBeenCalled();
      expect(glcp.fetchCompletions).not.toHaveBeenCalled();
    });

    describe("after circuit breaker's break time elapses", () => {
      it('fetches completions again', async () => {
        const glcp = new CodeSuggestionsProvider({
          manager,
          stateManager,
          legacyApiFallbackConfig,
        });
        glcp.fetchCompletions = jest.fn().mockRejectedValue(new Error('test problem'));

        await turnOnCircuitBreaker(glcp);

        jest
          .useFakeTimers({ advanceTimers: true })
          .setSystemTime(new Date(Date.now() + CIRCUIT_BREAK_INTERVAL_MS));

        glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

        await getCompletionsWithDefaultArgs(glcp);

        expect(glcp.fetchCompletions).toHaveBeenCalled();
      });
    });
  });

  describe('state management', () => {
    let glcp: CodeSuggestionsProvider;

    beforeEach(() => {
      manager = createManager(project);
      stateManager.setGlobalState(GlobalCodeSuggestionsState.READY);
      glcp = new CodeSuggestionsProvider({
        manager,
        stateManager,
        noDebounce: true,
        legacyApiFallbackConfig: createLegacyApiFallbackConfig(true),
      });
    });

    it('sets state to loading on request', async () => {
      const stateTracker = jest.fn();
      const subscription = stateManager.onDidChangeVisibleState(stateTracker);

      await getCompletionsWithDefaultArgs(glcp);

      expect(stateTracker).toHaveBeenCalledWith(VisibleCodeSuggestionsState.LOADING);
      subscription.dispose();
    });

    it('sets state to ok on succesful request', async () => {
      await getCompletionsWithDefaultArgs(glcp);
      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.READY);
    });

    it('sets state to error on failed request', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await getCompletionsWithDefaultArgs(glcp);
      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.ERROR);
    });

    it('sets state to error when completion is requested with no active account', async () => {
      jest.spyOn(manager, 'getGitLabPlatform').mockResolvedValueOnce(undefined);

      await getCompletionsWithDefaultArgs(glcp);
      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.ERROR);
    });
  });

  describe('telemetry', () => {
    let glcp: CodeSuggestionsProvider;

    beforeEach(() => {
      codeSuggestionsTelemetry.resetCounts();
      manager = createManager(project);
      glcp = new CodeSuggestionsProvider({
        manager,
        stateManager,
        noDebounce: true,
        legacyApiFallbackConfig: createLegacyApiFallbackConfig(true),
      });
    });

    it('increases requests count for success request', async () => {
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();

      // We are always sending previous amount of requests, so it is off-by-one
      expect(body.telemetry[0].requests).toBe(1);
    });

    it('does not increase requests count for cancelled success request', async () => {
      const tokenSource = new vscode.CancellationTokenSource();
      tokenSource.cancel();
      const { token: cancelledToken } = tokenSource;

      await glcp.getCompletions({
        document: mockDocument,
        position: mockPosition,
        cancellationToken: cancelledToken,
      });

      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();

      expect(body.telemetry).toHaveLength(0);
    });

    it('sends model information with the telemetry', async () => {
      asMock(fetch).mockResolvedValue({ ok: true, json: async () => mockCompletions });
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);

      const body = lastFetchCallBody();

      expect(body.telemetry[0].model_engine).toBe('codegen');
      expect(body.telemetry[0].model_name).toBe('ensemble');
    });

    it('sends experiments information with the telemetry', async () => {
      asMock(fetch).mockResolvedValue({ ok: true, json: async () => mockCompletions });
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);

      const body = lastFetchCallBody();

      expect(body.telemetry[0].experiments).toStrictEqual(experiments);
    });

    it('increases requests count for success request', async () => {
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();
      // We are always sending previous amount of requests, so it is off-by-one
      expect(body.telemetry[0].requests).toBe(1);
      expect(body.telemetry[0].model_engine).toBe('codegen');
      expect(body.telemetry[0].model_name).toBe('ensemble');
    });

    it('increases request count and request errors for failed requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await getCompletionsWithDefaultArgs(glcp);

      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(1);
      expect(body.telemetry[0].errors).toBe(1);
    });

    it('increases request count and request errors for cancelled failed requests', async () => {
      const tokenSource = new vscode.CancellationTokenSource();
      tokenSource.cancel();
      const { token: cancelledToken } = tokenSource;

      jest.mocked(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions({
        document: mockDocument,
        position: mockPosition,
        cancellationToken: cancelledToken,
      });

      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(1);
      expect(body.telemetry[0].errors).toBe(1);
    });

    it('does not reset request count and request errors for failed requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await getCompletionsWithDefaultArgs(glcp);

      asMock(fetch).mockRejectedValueOnce(new Error());
      await getCompletionsWithDefaultArgs(glcp);

      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(2);
      expect(body.telemetry[0].errors).toBe(2);
    });

    it('resets counters on successful requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await getCompletionsWithDefaultArgs(glcp);

      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(1);
      expect(body.telemetry[0].errors).toBe(0);
    });

    it('includes correct command when completion is accepted', async () => {
      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const [completion] = await getCompletionsWithDefaultArgs(glcp);
      expect(completion.command?.command).toBe(COMMAND_CODE_SUGGESTION_ACCEPTED);
    });

    it('sends correct accepted value when it is increased in telemetry', async () => {
      codeSuggestionsTelemetry.incAcceptCount(telemetryModel);
      await getCompletionsWithDefaultArgs(glcp);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(0);
      expect(body.telemetry[0].accepts).toBe(1);
    });

    describe('logging', () => {
      const getLoggedMessage = () => jest.mocked(log.debug).mock.calls[1][0];

      it('logs the telemetry details', async () => {
        codeSuggestionsTelemetry.incAcceptCount(telemetryModel);
        await getCompletionsWithDefaultArgs(glcp);

        expect(getLoggedMessage()).toContain(
          'AI Assist: fetching completions ... (telemetry: [{"model_engine":"testEngine","model_name":"testModel","lang":"c","experiments":[],"requests":0,"accepts":1,"errors":0}])',
        );
      });
    });
  });

  describe('telemetryManager', () => {
    let glcp: CodeSuggestionsProvider;

    beforeEach(() => {
      manager = createManager(project);
      glcp = new CodeSuggestionsProvider({
        manager,
        stateManager,
        noDebounce: true,
        legacyApiFallbackConfig: createLegacyApiFallbackConfig(true),
      });
    });

    it('should call create suggestion on the manager', async () => {
      await getCompletionsWithDefaultArgs(glcp);
      expect(CodeSuggestionsTelemetryManager.createSuggestion).toBeCalled();
    });

    it('should call telemetry manager update suggestion state in the order of Loaded, Shown', async () => {
      await getCompletionsWithDefaultArgs(glcp);
      expect(updateSuggestionState.mock.calls[0]).toEqual([
        '123',
        CodeSuggestionTelemetryState.LOADED,
      ]);
      expect(updateSuggestionState.mock.calls[1]).toEqual([
        '123',
        CodeSuggestionTelemetryState.SHOWN,
      ]);
    });

    describe('when API does not provide any suggestion in its response', () => {
      it('should call telemetry manager and update suggestion state in the order of LOADED, NOT_PROVIDED', async () => {
        glcp.fetchCompletions = jest.fn().mockResolvedValue({ ...mockCompletions, choices: [] });

        await getCompletionsWithDefaultArgs(glcp);
        expect(updateSuggestionState.mock.calls[0]).toEqual([
          '123',
          CodeSuggestionTelemetryState.LOADED,
        ]);
        expect(updateSuggestionState.mock.calls[1]).toEqual([
          '123',
          CodeSuggestionTelemetryState.NOT_PROVIDED,
        ]);
      });
    });

    describe('when API responds with suggestion that contains empty string', () => {
      it('should call telemetry manager and update suggestion state in the order of LOADED, NOT_PROVIDED', async () => {
        glcp.fetchCompletions = jest
          .fn()
          .mockResolvedValue({ ...mockCompletions, choices: [{ text: '' }] });

        await getCompletionsWithDefaultArgs(glcp);
        expect(updateSuggestionState.mock.calls[0]).toEqual([
          '123',
          CodeSuggestionTelemetryState.LOADED,
        ]);
        expect(updateSuggestionState.mock.calls[1]).toEqual([
          '123',
          CodeSuggestionTelemetryState.NOT_PROVIDED,
        ]);
      });
    });

    it('should send a state of cancelled when suggestion is cancelled', async () => {
      const cancelToken = new vscode.CancellationTokenSource().token;
      cancelToken.isCancellationRequested = true;

      await glcp.getCompletions({
        document: mockDocument,
        position: mockPosition,
        cancellationToken: cancelToken,
      });

      expect(updateSuggestionState.mock.calls[0]).toEqual([
        '123',
        CodeSuggestionTelemetryState.LOADED,
      ]);
      expect(updateSuggestionState.mock.calls[1]).toEqual([
        '123',
        CodeSuggestionTelemetryState.CANCELLED,
      ]);
    });

    it('should set model details for suggestion', async () => {
      await getCompletionsWithDefaultArgs(glcp);

      expect(setSuggestionModel.mock.calls[0]).toEqual([
        '123',
        mockCompletions.model.name,
        mockCompletions.model.engine,
      ]);
    });

    it('should send a state of error when the request errors out', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await getCompletionsWithDefaultArgs(glcp);

      expect(updateSuggestionState.mock.calls[0]).toEqual([
        '123',
        CodeSuggestionTelemetryState.ERROR,
      ]);
    });
  });
});
