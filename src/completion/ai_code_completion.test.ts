import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../gitlab/gitlab_platform';
import { project } from '../test_utils/entities';
import { asMock } from '../test_utils/as_mock';
import { AiCodeCompletion } from './ai_code_completion';
import { CodeCompletionState } from './code_completion_state';

jest.mock('./code_completion_state');
jest.mock('../status_bar/code_suggestions_status_bar_item');

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

describe('AiCodeCompletion', () => {
  let aiCodeCompletion: AiCodeCompletion;

  beforeEach(() => {
    aiCodeCompletion = new AiCodeCompletion(manager);
  });

  afterEach(() => {
    aiCodeCompletion.dispose();
  });

  describe('state updates', () => {
    it.each`
      isEnabledInSettings | codeSuggestionState
      ${false}            | ${CodeCompletionState.DISABLED}
      ${true}             | ${CodeCompletionState.OK}
    `(
      'sets state to $codeSuggestionState when code suggestions setting is $isEnabledInSettings',
      ({ isEnabledInSettings, codeSuggestionState }) => {
        asMock(vscode.workspace.getConfiguration).mockReturnValue({
          enabled: isEnabledInSettings,
        });

        const [[configurationChangeListener]] = asMock(vscode.workspace.onDidChangeConfiguration)
          .mock.calls;
        configurationChangeListener({ affectsConfiguration: () => true });

        expect(aiCodeCompletion.stateManager.setState).toHaveBeenCalledWith(codeSuggestionState);
      },
    );
  });
});
