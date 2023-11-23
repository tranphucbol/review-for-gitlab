import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { gitlabPlatformForAccount, gitlabPlatformForProject } from '../test_utils/entities';
import { CodeSuggestions } from './code_suggestions';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { CodeSuggestionsStateManager } from './code_suggestions_state_manager';

jest.mock('./code_suggestions_state_manager', () => ({
  ...jest.requireActual('./code_suggestions_state_manager'),
  CodeSuggestionsStateManager: function ConstructorFunc() {
    return createFakePartial<CodeSuggestionsStateManager>({
      isDisabledByUser: jest.fn().mockReturnValue(false),
      onDidChangeDisabledByUserState: jest.fn(),
      dispose: jest.fn(),
    });
  },
}));

jest.mock('./code_suggestions_provider');
jest.mock('./code_suggestions_status_bar_item');

const apiClientMock = jest.fn().mockResolvedValue({
  access_token: '1123',
  expires_in: 0,
  created_at: 0,
});

const manager: GitLabPlatformManager = createFakePartial<GitLabPlatformManager>({
  getForActiveProject: async () => ({
    ...gitlabPlatformForProject,
    fetchFromApi: apiClientMock,
  }),
  getForActiveAccount: jest.fn(async () => ({
    ...gitlabPlatformForAccount,
    fetchFromApi: apiClientMock,
  })),
  getForSaaSAccount: jest.fn(async () => ({
    ...gitlabPlatformForAccount,
    fetchFromApi: apiClientMock,
  })),
  getForAllAccounts: jest.fn(),
});

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
        codeSuggestions.stateManager.onDidChangeDisabledByUserState,
      ).mock.calls;
    });

    it('registers code suggestion provider when state becomes enabled', () => {
      jest.mocked(codeSuggestions.stateManager.isDisabledByUser).mockReturnValue(false);
      jest.mocked(vscode.languages.registerInlineCompletionItemProvider).mockClear();

      changeListener(false);

      expect(vscode.languages.registerInlineCompletionItemProvider).toHaveBeenCalled();
    });

    it('unregisters code suggestion provider when state becomes disabled', () => {
      jest.mocked(codeSuggestions.stateManager.isDisabledByUser).mockReturnValue(true);

      changeListener(true);

      expect(codeSuggestions.providerDisposable?.dispose).toHaveBeenCalled();
    });
  });

  describe('state updates', () => {
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
