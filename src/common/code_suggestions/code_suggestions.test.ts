import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { project } from '../test_utils/entities';
import { CodeSuggestions } from './code_suggestions';
import { VisibleCodeSuggestionsState } from './code_suggestions_state';

jest.mock('./code_suggestions_state', () => ({
  ...jest.requireActual('./code_suggestions_state'),
  CodeSuggestionsStateManager: function CodeSuggestionsStateManager() {
    return {
      isEnabled: jest.fn().mockResolvedValue(true),
      setGlobalState: jest.fn(),
      onDidChangeEnabledState: jest.fn(),
      setUnsupportedLanguageDocument: jest.fn(),
    };
  },
}));

jest.mock('./code_suggestions_provider');
jest.mock('./code_suggestions_status_bar_item');

const apiClientMock = jest.fn().mockResolvedValue({
  access_token: '1123',
  expires_in: 0,
  created_at: 0,
});

const manager: GitLabPlatformManager = {
  getForActiveProject: async () => ({
    type: 'project' as const,
    project,
    fetchFromApi: apiClientMock,
    getUserAgentHeader: () => ({}),
  }),
  getForActiveAccount: jest.fn(async () => ({
    type: 'account' as const,
    fetchFromApi: apiClientMock,
    getUserAgentHeader: () => ({}),
  })),
  getForAllAccounts: jest.fn(),
};

describe('CodeSuggestions', () => {
  let codeSuggestions: CodeSuggestions;

  beforeEach(() => {
    codeSuggestions = new CodeSuggestions(manager);
  });

  afterEach(() => {
    codeSuggestions.dispose();
  });

  describe('code suggestions registration', () => {
    let changeListener: (enabled: boolean) => void;

    beforeEach(() => {
      [[changeListener]] = jest.mocked(
        codeSuggestions.stateManager.onDidChangeEnabledState,
      ).mock.calls;
    });

    it('registers code suggestion provider when state becomes enabled', () => {
      jest.mocked(codeSuggestions.stateManager.isEnabled).mockReturnValue(true);
      jest.mocked(vscode.languages.registerInlineCompletionItemProvider).mockClear();

      changeListener(true);

      expect(vscode.languages.registerInlineCompletionItemProvider).toHaveBeenCalled();
    });

    it('unregisters code suggestion provider when state becomes disabled', () => {
      jest.mocked(codeSuggestions.stateManager.isEnabled).mockReturnValue(false);

      changeListener(false);

      expect(codeSuggestions.providerDisposable?.dispose).toHaveBeenCalled();
    });
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

    it('request GitLab version check when switching document', () => {
      codeSuggestions.legacyApiFallbackConfig.verifyGitLabVersion = jest.fn(async () => {});
      expect(codeSuggestions.legacyApiFallbackConfig.verifyGitLabVersion).toHaveBeenCalledTimes(0);

      const [[editorChangeListener]] = jest.mocked(vscode.window.onDidChangeActiveTextEditor).mock
        .calls;
      editorChangeListener({
        document: { languageId: 'ruby' },
      } as unknown as vscode.TextEditor);

      expect(codeSuggestions.legacyApiFallbackConfig.verifyGitLabVersion).toHaveBeenCalledTimes(1);
    });
  });
});
