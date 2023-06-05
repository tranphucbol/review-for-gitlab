import * as vscode from 'vscode';
import fetch from '../gitlab/fetch_logged';

import {
  GitLabCodeCompletionProvider,
  CIRCUIT_BREAK_INTERVAL_MS,
} from './gitlab_code_completion_provider';
import { GitLabPlatform, GitLabPlatformProject } from '../gitlab/gitlab_platform';

jest.mock('../gitlab/fetch_logged');
const crossFetchCallArgument = () => JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);

const mockPrompt = 'const areaOfCube = ';
const mockDocumentPartial: Partial<vscode.TextDocument> = {
  fileName: 'test.js',
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

const platform: GitLabPlatform = {
  getProject: async () => ({ project: 'gitlab' } as GitLabPlatformProject),
  fetchFromApi: async <T>(): Promise<T> =>
    ({
      access_token: '123',
      expires_in: 0,
      created_at: 0,
    } as unknown as T),
};

describe('GitLabCodeCompletionProvider', () => {
  describe('getCompletions', () => {
    it('should construct a payload with line above, line below, file name, and prompt version', async () => {
      const glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider(platform);

      const testDocument = {
        getText(range: vscode.Range): string {
          if (range.start.character === 0 && range.start.line === 0) {
            return 'before';
          }
          return 'after';
        },
        fileName: 'test.js',
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
      const glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider(platform, true);
      glcp.getCompletions = jest.fn().mockResolvedValue(mockInlineCompletions);

      jest.runAllTimers();
      await glcp.provideInlineCompletionItems(mockDocument, mockPosition, mockContext);
      jest.runAllTimers();

      expect(glcp.getCompletions).toHaveBeenCalled();
      jest.runAllTimers();
    });
  });

  describe(`circuit breaking`, () => {
    const turnOnCircuitBreaker = async (glcp: GitLabCodeCompletionProvider) => {
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
      await glcp.getCompletions(mockDocument, mockPosition);
    };

    it(`starts breaking after 4 errors`, async () => {
      const glcp = new GitLabCodeCompletionProvider(platform);

      glcp.fetchCompletions = jest.fn().mockRejectedValue(new Error('test problem'));

      await turnOnCircuitBreaker(glcp);

      glcp.fetchCompletions = jest.fn().mockResolvedValue(mockCompletions);

      const result = await glcp.getCompletions(mockDocument, mockPosition);
      expect(result).toEqual([]);
      expect(glcp.fetchCompletions).not.toHaveBeenCalled();
    });

    describe("after circuit breaker's break time elapses", () => {
      it('fetches completions again', async () => {
        const glcp = new GitLabCodeCompletionProvider(platform);
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
});
