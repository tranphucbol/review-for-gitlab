import * as vscode from 'vscode';
import fetch from '../fetch_logged';

import { codeSuggestionsTelemetry } from './code_suggestions_telemetry';

import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { project } from '../test_utils/entities';
import { log } from '../log';
import { CIRCUIT_BREAK_INTERVAL_MS, CodeSuggestionsProvider } from './code_suggestions_provider';
import { CodeSuggestionsState, CodeSuggestionsStateManager } from './code_suggestions_state';
import { GitLabProject } from '../platform/gitlab_project';
import { COMMAND_CODE_SUGGESTION_ACCEPTED } from './commands/code_suggestion_accepted';

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
  lineAt: () => ({ text: mockPrompt } as vscode.TextLine),
};
const mockDocument = mockDocumentPartial as unknown as vscode.TextDocument;
const choice = '(side) => ';
const mockCompletions = {
  choices: [{ text: choice }],
  model: { name: 'ensemble', engine: 'codegen' },
};

const mockPosition = {
  line: 0,
  character: mockPrompt.length,
} as vscode.Position;

function createManager(project: GitLabProject): GitLabPlatformManager {
  return {
    getForActiveProject: jest.fn(async () => ({
      project,
      fetchFromApi: async <T>(): Promise<T> =>
        ({
          access_token: '123',
          expires_in: 0,
          created_at: 0,
        } as unknown as T),
      getUserAgentHeader: () => ({}),
    })),
  };
}

const manager = createManager(project);

const stateManager = new CodeSuggestionsStateManager();

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

  describe('getCompletions', () => {
    const projectForSelfManaged: GitLabProject = {
      gqlId: 'gid://my-gitlab/Project/5261717',
      restId: 5261717,
      name: 'test-project',
      description: '',
      namespaceWithPath: 'my-gitlab/Project',
      webUrl: 'https://gitlab.example.com/gitlab-org/gitlab-vscode-extension',
    };

    it('should construct a payload with line above, line below, file name, prompt version, project id and path', async () => {
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({ manager, stateManager });
      await glcp.getCompletions(testDocument, position);

      const inputBody = crossFetchCallArgument();

      expect(inputBody.prompt_version).toBe(1);
      expect(inputBody.current_file.content_above_cursor).toBe('before');
      expect(inputBody.current_file.content_below_cursor).toBe('after');
      expect(inputBody.current_file.file_name).toBe('test.js');
      expect(inputBody.prompt_version).toBe(1);
      expect(inputBody.project_id).toBe(project.restId);
      expect(inputBody.project_path).toBe(project.namespaceWithPath);
    });

    it('should not send project id and path unless targeting SaaS', async () => {
      const manager = createManager(projectForSelfManaged);
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider({ manager, stateManager });
      await glcp.getCompletions(testDocument, position);

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
      await glcp.provideInlineCompletionItems(mockDocument, mockPosition, mockContext);
      jest.runAllTimers();

      expect(glcp.getCompletions).toHaveBeenCalled();
      jest.runAllTimers();
    });
  });

  describe(`circuit breaking`, () => {
    const turnOnCircuitBreaker = async (glcp: CodeSuggestionsProvider) => {
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
    };

    it(`starts breaking after 4 errors`, async () => {
      const glcp = new CodeSuggestionsProvider({ manager, stateManager });

      glcp.fetchCompletions = jest.fn().mockRejectedValue(new Error('test problem'));

      await turnOnCircuitBreaker(glcp);

      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const result = await glcp.getCompletions(mockDocument, mockPosition);
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

        await glcp.getCompletions(mockDocument, mockPosition);

        expect(glcp.fetchCompletions).toHaveBeenCalled();
      });
    });
  });

  describe('state management', () => {
    let glcp: CodeSuggestionsProvider;

    beforeEach(() => {
      stateManager.setState(CodeSuggestionsState.OK);
      glcp = new CodeSuggestionsProvider({ manager, stateManager, noDebounce: true });
    });

    it('sets state to loading on request', async () => {
      const stateTracker = jest.fn();
      const subscription = stateManager.onDidChangeState(stateTracker);

      await glcp.getCompletions(mockDocument, mockPosition);

      expect(stateTracker).toHaveBeenCalledWith(CodeSuggestionsState.LOADING);
      subscription.dispose();
    });

    it('sets state to ok on succesful request', async () => {
      await glcp.getCompletions(mockDocument, mockPosition);
      expect(stateManager.getState()).toBe(CodeSuggestionsState.OK);
    });

    it('sets state to error on failed request', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);
      expect(stateManager.getState()).toBe(CodeSuggestionsState.ERROR);
    });

    it('sets state to error when completion is requested with no active project', async () => {
      asMock(manager.getForActiveProject).mockResolvedValueOnce(null);
      await glcp.getCompletions(mockDocument, mockPosition);
      expect(stateManager.getState()).toBe(CodeSuggestionsState.ERROR);
    });
  });

  describe('telemetry', () => {
    let glcp: CodeSuggestionsProvider;

    beforeEach(() => {
      codeSuggestionsTelemetry.resetCounts();
      glcp = new CodeSuggestionsProvider({ manager, stateManager, noDebounce: true });
    });

    it('increases requests count for success request', async () => {
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      const body = lastFetchCallBody();

      // We are always sending previous amount of requests, so it is off-by-one
      expect(body.telemetry[0].requests).toBe(1);
    });

    it('sends model information with the telemetry', async () => {
      asMock(fetch).mockResolvedValue({ ok: true, json: async () => mockCompletions });
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);

      const body = lastFetchCallBody();

      expect(body.telemetry[0].model_engine).toBe('codegen');
      expect(body.telemetry[0].model_name).toBe('ensemble');
    });
    it('increases requests count for success request', async () => {
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      const body = lastFetchCallBody();
      // We are always sending previous amount of requests, so it is off-by-one
      expect(body.telemetry[0].requests).toBe(1);
      expect(body.telemetry[0].model_engine).toBe('codegen');
      expect(body.telemetry[0].model_name).toBe('ensemble');
    });

    it('increases request count and request errors for failed requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      await glcp.getCompletions(mockDocument, mockPosition);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(1);
      expect(body.telemetry[0].errors).toBe(1);
    });

    it('does not reset request count and request errors for failed requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      await glcp.getCompletions(mockDocument, mockPosition);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(2);
      expect(body.telemetry[0].errors).toBe(2);
    });

    it('resets counters on successful requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(1);
      expect(body.telemetry[0].errors).toBe(0);
    });

    it('includes correct command when completion is accepted', async () => {
      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const [completion] = await glcp.getCompletions(mockDocument, mockPosition);
      expect(completion.command?.command).toBe(COMMAND_CODE_SUGGESTION_ACCEPTED);
    });

    it('sends correct accepted value when it is increased in telemetry', async () => {
      codeSuggestionsTelemetry.incAcceptCount({ name: 'testModel', engine: 'testEngine' });
      await glcp.getCompletions(mockDocument, mockPosition);
      const body = lastFetchCallBody();

      expect(body.telemetry[0].requests).toBe(0);
      expect(body.telemetry[0].accepts).toBe(1);
    });

    describe('logging', () => {
      const getLoggedMessage = () => jest.mocked(log.debug).mock.calls[1][0];

      it('logs the telemetry details', async () => {
        codeSuggestionsTelemetry.incAcceptCount({ name: 'testModel', engine: 'testEngine' });
        await glcp.getCompletions(mockDocument, mockPosition);

        expect(getLoggedMessage()).toContain(
          'AI Assist: fetching completions ... (telemetry: [{"model_engine":"testEngine","model_name":"testModel","requests":0,"accepts":1,"errors":0}])',
        );
      });
    });
  });
});
