import * as vscode from 'vscode';
import fetch from '../gitlab/fetch_logged';

import { GitLabCodeCompletionProvider } from './gitlab_code_completion_provider';

jest.mock('../gitlab/fetch_logged');
const crossFetchCallArgument = () => JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);

describe('GitLabCodeCompletionProvider', () => {
  describe('getCompletions', () => {
    it('should construct a payload with line above, line below, file name, and prompt version', async () => {
      const glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider();

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
    const mockPrompt = 'const areaOfCube = ';
    const mockDocument: Partial<vscode.TextDocument> = {
      getText: () => mockPrompt,
      lineAt: () => ({ text: mockPrompt } as vscode.TextLine),
    };
    const mockPosition = {
      line: 0,
      character: mockPrompt.length,
    } as vscode.Position;
    const mockInlineCompletions = [] as vscode.InlineCompletionItem[];
    const mockContext = {
      triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
    } as vscode.InlineCompletionContext;
    jest.useFakeTimers();

    it('provides inline completions', async () => {
      const glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider(true);
      glcp.getCompletions = jest.fn().mockResolvedValue(mockInlineCompletions);

      jest.runAllTimers();
      await glcp.provideInlineCompletionItems(
        mockDocument as unknown as vscode.TextDocument,
        mockPosition,
        mockContext,
      );
      jest.runAllTimers();

      expect(glcp.getCompletions).toHaveBeenCalled();
      jest.runAllTimers();
    });
  });
});
