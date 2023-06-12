import * as vscode from 'vscode';
import fetch from '../gitlab/fetch_logged';

import {
  TELEMETRY_HEADER_REQUESTS,
  TELEMETRY_HEADER_ERRORS,
  TELEMETRY_HEADER_ACCEPTS,
  codeSuggestionsTelemetry,
} from './code_suggestions_telemetry';

import { GitLabPlatformManager } from '../gitlab/gitlab_platform';
import { project } from '../test_utils/entities';
import { asMock } from '../test_utils/as_mock';
import { PROGRAMMATIC_COMMANDS } from '../command_names';
import { CIRCUIT_BREAK_INTERVAL_MS, CodeSuggestionsProvider } from './code_suggestions_provider';

jest.mock('../gitlab/fetch_logged');
const crossFetchCallArgument = () => JSON.parse(asMock(fetch).mock.calls[0][1].body);
const lastFetchCallHeaders = () =>
  asMock(fetch).mock.calls[asMock(fetch).mock.calls.length - 1][1].headers;

const mockPrompt = 'const areaOfCube = ';
const mockDocumentPartial: Partial<vscode.TextDocument> = {
  uri: vscode.Uri.parse('file:///file/path/test.js'),
  getText: () => mockPrompt,
  lineAt: () => ({ text: mockPrompt } as vscode.TextLine),
};
const mockDocument = mockDocumentPartial as unknown as vscode.TextDocument;
const choice = '(side) => ';
const mockCompletions = { choices: [{ text: choice }] };

const mockPosition = {
  line: 0,
  character: mockPrompt.length,
} as vscode.Position;

const manager: GitLabPlatformManager = {
  getForActiveProject: async () => ({
    project,
    fetchFromApi: async <T>(): Promise<T> =>
      ({
        access_token: '123',
        expires_in: 0,
        created_at: 0,
      } as unknown as T),
  }),
};

describe('CodeSuggestionsProvider', () => {
  describe('getCompletions', () => {
    it('should construct a payload with line above, line below, file name, and prompt version', async () => {
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider(manager);

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

      await glcp.getCompletions(testDocument, position);
      const inputBody = crossFetchCallArgument();
      expect(inputBody.prompt_version).toBe(1);
      expect(inputBody.current_file.content_above_cursor).toBe('before');
      expect(inputBody.current_file.content_below_cursor).toBe('after');
      expect(inputBody.current_file.file_name).toBe('test.js');
      expect(inputBody.prompt_version).toBe(1);
    });
  });

  describe('provideInlineCompletionItems', () => {
    const mockInlineCompletions = [] as vscode.InlineCompletionItem[];
    const mockContext = {
      triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
    } as vscode.InlineCompletionContext;
    jest.useFakeTimers();

    it('provides inline completions', async () => {
      const glcp: CodeSuggestionsProvider = new CodeSuggestionsProvider(manager, true);
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
      const glcp = new CodeSuggestionsProvider(manager);

      glcp.fetchCompletions = jest.fn().mockRejectedValue(new Error('test problem'));

      await turnOnCircuitBreaker(glcp);

      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const result = await glcp.getCompletions(mockDocument, mockPosition);
      expect(result).toEqual([]);
      expect(glcp.fetchCompletions).not.toHaveBeenCalled();
    });

    describe("after circuit breaker's break time elapses", () => {
      it('fetches completions again', async () => {
        const glcp = new CodeSuggestionsProvider(manager);
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

  describe('telemetry', () => {
    let glcp: CodeSuggestionsProvider;

    beforeEach(() => {
      codeSuggestionsTelemetry.resetCounts();
      glcp = new CodeSuggestionsProvider(manager, true);
    });

    it('includes telemetry headers', async () => {
      await glcp.getCompletions(mockDocument, mockPosition);
      const headers = lastFetchCallHeaders();

      [TELEMETRY_HEADER_ACCEPTS, TELEMETRY_HEADER_ERRORS, TELEMETRY_HEADER_REQUESTS].forEach(
        header => {
          expect(headers).toHaveProperty(header);
        },
      );
    });

    it('increases requests count for success request', async () => {
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      const headers = lastFetchCallHeaders();

      // We are always sending previous amount of requests, so it is off-by-one
      expect(headers[TELEMETRY_HEADER_REQUESTS]).toBe('1');
    });

    it('increases request count and request errors for failed requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      await glcp.getCompletions(mockDocument, mockPosition);
      const headers = lastFetchCallHeaders();

      expect(headers[TELEMETRY_HEADER_REQUESTS]).toBe('1');
      expect(headers[TELEMETRY_HEADER_ERRORS]).toBe('1');
    });

    it('does not reset request count and request errors for failed requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      await glcp.getCompletions(mockDocument, mockPosition);
      const headers = lastFetchCallHeaders();

      expect(headers[TELEMETRY_HEADER_REQUESTS]).toBe('2');
      expect(headers[TELEMETRY_HEADER_ERRORS]).toBe('2');
    });

    it('resets counters on successful requests', async () => {
      asMock(fetch).mockRejectedValueOnce(new Error());
      await glcp.getCompletions(mockDocument, mockPosition);

      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      const headers = lastFetchCallHeaders();

      expect(headers[TELEMETRY_HEADER_REQUESTS]).toBe('1');
      expect(headers[TELEMETRY_HEADER_ERRORS]).toBe('0');
    });

    it('includes correct command when completion is accepted', async () => {
      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const [completion] = await glcp.getCompletions(mockDocument, mockPosition);
      expect(completion.command?.command).toBe(PROGRAMMATIC_COMMANDS.CODE_SUGGESTION_ACCEPTED);
    });

    it('sends correct accepted value when it is increased in telemetry', async () => {
      codeSuggestionsTelemetry.incAcceptCount();
      await glcp.getCompletions(mockDocument, mockPosition);
      const headers = lastFetchCallHeaders();

      expect(headers[TELEMETRY_HEADER_REQUESTS]).toBe('0');
      expect(headers[TELEMETRY_HEADER_ACCEPTS]).toBe('1');
    });
  });
});
