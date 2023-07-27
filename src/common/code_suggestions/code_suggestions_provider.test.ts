import * as vscode from 'vscode';
import fetch from '../fetch_logged';

import { codeSuggestionsTelemetry } from './code_suggestions_telemetry';

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
import {
  ExtensionConfiguration,
  getExtensionConfiguration,
} from '../utils/extension_configuration';
import { ApiRequest, fetchFromApi, PostRequest } from '../platform/web_ide';

jest.mock('../utils/extension_configuration');
jest.mock('../log');
jest.mock('../fetch_logged');

/**
 * @deprecated use jest.mocked() instead
 */
const asMock = (mockFn: unknown) => mockFn as jest.Mock;

const crossFetchCallArgument = () => JSON.parse(asMock(fetch).mock.calls[0][1].body);
const lastFetchCallBody = () =>
  JSON.parse(asMock(fetch).mock.calls[asMock(fetch).mock.calls.length - 1][1].body);

const mockPrompt = 'const areaOfCube = ';
const mockDocumentPartial: Partial<vscode.TextDocument> = {
  uri: vscode.Uri.parse('file:///file/path/test.js'),
  getText: () => mockPrompt,
  lineAt: () => ({ text: mockPrompt }) as vscode.TextLine,
};
const mockDocument = mockDocumentPartial as unknown as vscode.TextDocument;
const choice = '(side) => ';
const mockCompletions = {
  choices: [{ text: choice }],
  model: { name: 'ensemble', engine: 'codegen' },
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

const fetchFromApiMock = jest.fn(
  async <T>(): Promise<T> =>
    ({
      access_token: '123',
      expires_in: 0,
      created_at: 0,
    }) as unknown as T,
) as fetchFromApi;

function stubFeatureFlags(featureFlags = {}) {
  const flags = {
    debug: true,
    featureFlags: { ...featureFlags },
    customQueries: [],
  } as ExtensionConfiguration;
  jest.mocked(getExtensionConfiguration).mockReturnValue(flags);
}

function createManager(project: GitLabProject): GitLabPlatformManager {
  return {
    getForActiveProject: jest.fn(async () => ({
      project,
      fetchFromApi: fetchFromApiMock,
      getUserAgentHeader: () => ({}),
    })),
  };
}

let manager = createManager(project);
const cancellationToken = new vscode.CancellationTokenSource().token;

const stateManager = new CodeSuggestionsStateManager();

function getCompletionsWithDefaultArgs(glcp: CodeSuggestionsProvider) {
  return glcp.getCompletions({ document: mockDocument, position: mockPosition, cancellationToken });
}

describe('CodeSuggestionsProvider', () => {
  const testDocument = {
    getText(range: vscode.Range): string {
      if (range.start.character === 0 && range.start.line === 0) {
        return 'before';
      }
      return 'after';
    },
    uri: vscode.Uri.parse('file:///file/path/test.js'),
  } as vscode.TextDocument;

  const position = {
    line: 1,
    character: 1,
  } as vscode.Position;

  beforeEach(() => {
    stubFeatureFlags();
  });

  describe('getCompletions', () => {
    const projectForSelfManaged: GitLabProject = {
      gqlId: 'gid://my-gitlab/Project/5261717',
      restId: 5261717,
      name: 'test-project',
      description: '',
      namespaceWithPath: 'my-gitlab/Project',
      webUrl: 'https://gitlab.example.com/gitlab-org/gitlab-vscode-extension',
    };

    describe('without codeSuggestionsViaMonolith feature', () => {
      beforeEach(() => {
        stubFeatureFlags({ codeSuggestionsViaMonolith: false });
      });

      it('should construct a payload with line above, line below, file name, prompt version, project id and path', async () => {
        const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
          manager,
          stateManager,
        });
        await glcp.getCompletions({ document: testDocument, position, cancellationToken });

        const inputBody = crossFetchCallArgument();

        expect(inputBody.prompt_version).toBe(1);
        expect(inputBody.current_file.content_above_cursor).toBe('before');
        expect(inputBody.current_file.content_below_cursor).toBe('after');
        expect(inputBody.current_file.file_name).toBe('test.js');
        expect(inputBody.prompt_version).toBe(1);
        expect(inputBody.project_id).toBe(project.restId);
        expect(inputBody.project_path).toBe(project.namespaceWithPath);
      });
    });

    describe('with codeSuggestionsViaMonolith feature', () => {
      beforeEach(() => {
        stubFeatureFlags({ codeSuggestionsViaMonolith: true });
      });

      const filterCodeSuggestionRequest = ([request]: ApiRequest<unknown>[]) =>
        request.type === 'rest' &&
        request.method === 'POST' &&
        request.path === GITLAB_AI_ASSISTED_CODE_SUGGESTIONS_API_PATH;

      const codeSuggestionMonolithCalls = () =>
        jest
          .mocked(fetchFromApiMock)
          .mock.calls.filter(filterCodeSuggestionRequest) as unknown as PostRequest<unknown>[][];

      it('should add custom authorisation headers to request', async () => {
        const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
          manager,
          stateManager,
        });
        await glcp.getCompletions({ document: testDocument, position, cancellationToken });

        const calls = codeSuggestionMonolithCalls();
        const codeSuggestionRequest = calls[0][0];
        const headers = {
          'X-Gitlab-Authentication-Type': 'oidc',
          'X-Gitlab-Oidc-Token': '123',
        };

        expect(calls.length).toBe(1);
        expect(codeSuggestionRequest.headers).toMatchObject(headers);
      });

      it('should construct a payload with line above, line below, file name, prompt version, project id and path', async () => {
        const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
          manager,
          stateManager,
        });
        await glcp.getCompletions({ document: testDocument, position, cancellationToken });

        const calls = codeSuggestionMonolithCalls();
        const inputBody = calls[0][0].body as CodeSuggestionPrompt;

        expect(calls).toHaveLength(1);
        expect(inputBody.prompt_version).toBe(1);
        expect(inputBody.current_file.content_above_cursor).toBe('before');
        expect(inputBody.current_file.content_below_cursor).toBe('after');
        expect(inputBody.current_file.file_name).toBe('test.js');
        expect(inputBody.prompt_version).toBe(1);
        expect(inputBody.project_id).toBe(project.restId);
        expect(inputBody.project_path).toBe(project.namespaceWithPath);
      });

      it('should use model gateway API directly unless targeting SaaS', async () => {
        manager = createManager(projectForSelfManaged);
        const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({
          manager,
          stateManager,
        });
        await glcp.getCompletions({ document: testDocument, position, cancellationToken });

        expect(codeSuggestionMonolithCalls()).toHaveLength(0);
        expect(crossFetchCallArgument).not.toThrow();
      });
    });

    it('should not send project id and path unless targeting SaaS', async () => {
      manager = createManager(projectForSelfManaged);
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({ manager, stateManager });
      await glcp.getCompletions({ document: testDocument, position, cancellationToken });

      const inputBody = crossFetchCallArgument();

      expect(inputBody.project_id).toBe(undefined);
      expect(inputBody.project_path).toBe(undefined);
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

      expect(glcp.getCompletions).toHaveBeenCalled();
      jest.runAllTimers();
    });
  });

  describe(`circuit breaking`, () => {
    const turnOnCircuitBreaker = async (glcp: CodeSuggestionsProvider) => {
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
      await getCompletionsWithDefaultArgs(glcp);
    };

    it(`starts breaking after 4 errors`, async () => {
      const glcp = new CodeSuggestionsProvider({ manager, stateManager });

      glcp.fetchCompletions = jest.fn().mockRejectedValue(new Error('test problem'));

      await turnOnCircuitBreaker(glcp);

      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const result = await getCompletionsWithDefaultArgs(glcp);
      expect(result).toEqual([]);
      expect(glcp.fetchCompletions).not.toHaveBeenCalled();
    });

    describe("after circuit breaker's break time elapses", () => {
      it('fetches completions again', async () => {
        const glcp = new CodeSuggestionsProvider({ manager, stateManager });
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
      stateManager.setGlobalState(GlobalCodeSuggestionsState.READY);
      glcp = new CodeSuggestionsProvider({ manager, stateManager, noDebounce: true });
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

    it('sets state to error when completion is requested with no active project', async () => {
      asMock(manager.getForActiveProject).mockResolvedValueOnce(null);
      await getCompletionsWithDefaultArgs(glcp);
      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.ERROR);
    });
  });

  describe('telemetry', () => {
    let glcp: CodeSuggestionsProvider;

    beforeEach(() => {
      codeSuggestionsTelemetry.resetCounts();
      glcp = new CodeSuggestionsProvider({ manager, stateManager, noDebounce: true });
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
          'AI Assist: fetching completions ... (telemetry: [{"model_engine":"testEngine","model_name":"testModel","lang":"c","requests":0,"accepts":1,"errors":0}])',
        );
      });
    });
  });
});
