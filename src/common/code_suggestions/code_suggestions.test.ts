import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { project } from '../test_utils/entities';
import { CodeSuggestions } from './code_suggestions';
import { VisibleCodeSuggestionsState } from './code_suggestions_state';

jest.mock('./code_suggestions_state');
jest.mock('./code_suggestions_status_bar_item');

const manager: GitLabPlatformManager = {
  getForActiveProject: async () => ({
    project,
    fetchFromApi: async <T>(): Promise<T> =>
      ({
        access_token: '123',
        expires_in: 0,
        created_at: 0,
      }) as unknown as T,
    getUserAgentHeader: () => ({}),
  }),
};

describe('CodeSuggestions', () => {
  let codeSuggestions: CodeSuggestions;

  beforeEach(() => {
    codeSuggestions = new CodeSuggestions(manager);
  });

  afterEach(() => {
    codeSuggestions.dispose();
  });

  describe('state updates', () => {
    it.each`
      isEnabledInSettings | codeSuggestionState
      ${false}            | ${VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS}
      ${true}             | ${VisibleCodeSuggestionsState.READY}
    `(
      'sets state to $codeSuggestionState when code suggestions setting is $isEnabledInSettings',
      ({ isEnabledInSettings, codeSuggestionState }) => {
        jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
          enabled: isEnabledInSettings,
        } as unknown as vscode.WorkspaceConfiguration);

        const [[configurationChangeListener]] = jest.mocked(
          vscode.workspace.onDidChangeConfiguration,
        ).mock.calls;
        configurationChangeListener({ affectsConfiguration: () => true });

        expect(codeSuggestions.stateManager.setGlobalState).toHaveBeenCalledWith(
          codeSuggestionState,
        );
      },
    );

    it('sets state to unsupported when switching to document with unsupported language', () => {
      const [[editorChangeListener]] = jest.mocked(vscode.window.onDidChangeActiveTextEditor).mock
        .calls;
      editorChangeListener({
        document: { languageId: 'some-unsupported' },
      } as unknown as vscode.TextEditor);

      expect(codeSuggestions.stateManager.setUnsupportedLanguageDocument).toHaveBeenCalledWith(
        true,
      );
    });
  });
});
