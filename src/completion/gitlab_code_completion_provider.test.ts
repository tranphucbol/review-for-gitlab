import * as vscode from 'vscode';
import crossFetch from 'cross-fetch';

import { getAiAssistedCodeSuggestionsConfiguration } from '../utils/extension_configuration';
import { GitLabCodeCompletionProvider } from './gitlab_code_completion_provider';

jest.mock('cross-fetch');
const crossFetchCallArgument = () => JSON.parse((crossFetch as jest.Mock).mock.calls[0][1].body);

describe('GitLabCodeCompletionProvider', () => {
  it('parses configuration correctly', () => {
    const expectedServer = 'https://codesuggestions.gitlab.com/v2/completions';
    const expectedModel = 'gitlab';
    const configuration = getAiAssistedCodeSuggestionsConfiguration();
    const glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider(configuration);
    expect(glcp.server).toBe(expectedServer);
    expect(glcp.model).toBe(expectedModel);
  });

  describe('getCompletions', () => {
    it('should construct a payload with line above, line below, file name, and prompt version', async () => {
      const configuration = getAiAssistedCodeSuggestionsConfiguration();
      const glcp: GitLabCodeCompletionProvider = new GitLabCodeCompletionProvider(configuration);

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
});
