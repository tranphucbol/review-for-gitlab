import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../gitlab/gitlab_platform';
import { project } from '../test_utils/entities';
import { asMock } from '../test_utils/as_mock';
import { CodeSuggestions } from './code_suggestions';
import { CodeSuggestionsState } from './code_suggestions_state';

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
      } as unknown as T),
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
      ${false}            | ${CodeSuggestionsState.DISABLED}
      ${true}             | ${CodeSuggestionsState.OK}
    `(
      'sets state to $codeSuggestionState when code suggestions setting is $isEnabledInSettings',
      ({ isEnabledInSettings, codeSuggestionState }) => {
        asMock(vscode.workspace.getConfiguration).mockReturnValue({
          enabled: isEnabledInSettings,
        });

        const [[configurationChangeListener]] = asMock(vscode.workspace.onDidChangeConfiguration)
          .mock.calls;
        configurationChangeListener({ affectsConfiguration: () => true });

        expect(codeSuggestions.stateManager.setState).toHaveBeenCalledWith(codeSuggestionState);
      },
    );
  });
});
