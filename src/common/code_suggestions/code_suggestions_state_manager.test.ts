import * as vscode from 'vscode';
import {
  CodeSuggestionsStateManager,
  VisibleCodeSuggestionsState,
} from './code_suggestions_state_manager';
import {
  createActiveTextEditorChangeTrigger,
  createConfigurationChangeTrigger,
  createFakeWorkspaceConfiguration,
} from '../test_utils/vscode_fakes';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabPlatformManagerForCodeSuggestions } from './gitlab_platform_manager_for_code_suggestions';
import { gitlabPlatformForProject } from '../test_utils/entities';

jest.mock('./gitlab_platform_manager_for_code_suggestions');

describe('Code suggestions state manager', () => {
  let triggerSettingsRefresh: () => void;
  let triggerActiveTextEditorChange: (te: vscode.TextEditor) => void;
  let stateManager: CodeSuggestionsStateManager;
  let platformManager: GitLabPlatformManager;
  let suggestionsPlatformManager: GitLabPlatformManagerForCodeSuggestions;

  beforeEach(async () => {
    vscode.window.activeTextEditor = undefined; // pretend that there is no active editor

    // these triggers need to be created BEFORE state manager adds listeners to VS Code API
    triggerSettingsRefresh = createConfigurationChangeTrigger();
    triggerActiveTextEditorChange = createActiveTextEditorChangeTrigger();

    // ensure the suggestions are enabled in settings
    jest
      .mocked(vscode.workspace.getConfiguration)
      .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: true }));

    platformManager = createFakePartial<GitLabPlatformManager>({
      onAccountChange: jest.fn(),
    });
    // pretend there is a GitLab account
    suggestionsPlatformManager = createFakePartial<GitLabPlatformManagerForCodeSuggestions>({
      getGitLabPlatform: jest.fn().mockResolvedValue(gitlabPlatformForProject),
    });
    jest
      .mocked(GitLabPlatformManagerForCodeSuggestions)
      .mockReturnValue(suggestionsPlatformManager);

    stateManager = new CodeSuggestionsStateManager(platformManager);
    await stateManager.init();
  });

  const disableViaSettings = () => {
    jest
      .mocked(vscode.workspace.getConfiguration)
      .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: false }));
    triggerSettingsRefresh();
  };

  describe('constructor', () => {
    it('reads settings and sets the disabled in settings property', () => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: false }));

      stateManager = new CodeSuggestionsStateManager(platformManager);

      expect(stateManager.getVisibleState()).toBe(
        VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS,
      );
    });

    it('reads active document language and checks if it is supported', async () => {
      vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
        document: { languageId: 'json' },
      });

      stateManager = new CodeSuggestionsStateManager(platformManager);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE);
    });
  });

  describe('init', () => {
    it('it checks if there is an account for suggestions', async () => {
      jest.mocked(suggestionsPlatformManager.getGitLabPlatform).mockResolvedValue(undefined);

      stateManager = new CodeSuggestionsStateManager(platformManager);
      await stateManager.init();

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.NO_ACCOUNT);
    });
  });

  describe('visible state', () => {
    type StateMutation = () => void | Promise<void>;
    const mutationsFromLeastImportant: {
      mutation: StateMutation;
      expectedState: VisibleCodeSuggestionsState;
    }[] = [
      {
        mutation: () => stateManager.setLoading(true),
        expectedState: VisibleCodeSuggestionsState.LOADING,
      },
      {
        mutation: () => stateManager.setError(true),
        expectedState: VisibleCodeSuggestionsState.ERROR,
      },
      {
        mutation: () => {
          // sets unsupported language
          triggerActiveTextEditorChange(
            createFakePartial<vscode.TextEditor>({ document: { languageId: 'json' } }),
          );
        },
        expectedState: VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE,
      },
      {
        mutation: async () => {
          jest.mocked(suggestionsPlatformManager.getGitLabPlatform).mockResolvedValue(undefined);
          await jest.mocked(platformManager.onAccountChange).mock.calls[0][0]();
        },
        expectedState: VisibleCodeSuggestionsState.NO_ACCOUNT,
      },
      {
        mutation: () => stateManager.setTemporaryDisabled(true),
        expectedState: VisibleCodeSuggestionsState.DISABLED_BY_USER,
      },
      {
        mutation: disableViaSettings,
        expectedState: VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS,
      },
    ];

    it('more important state takes precedence over less important state', async () => {
      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.READY);

      for (const scenario of mutationsFromLeastImportant) {
        // we want to ensure that we execute the mutations in series
        // eslint-disable-next-line no-await-in-loop
        await scenario.mutation();
        expect(stateManager.getVisibleState()).toBe(scenario.expectedState);
      }
    });

    it('every state change triggers an event', async () => {
      const visibleStateChangeListener = jest.fn();
      stateManager.onDidChangeVisibleState(visibleStateChangeListener);

      for (const scenario of mutationsFromLeastImportant) {
        visibleStateChangeListener.mockReset();
        // we want to ensure that we execute the mutations in series
        // eslint-disable-next-line no-await-in-loop
        await scenario.mutation();
        expect(visibleStateChangeListener).toHaveBeenCalledWith(scenario.expectedState);
      }
    });
  });

  describe('Loading state', () => {
    it('handles parallel operations', () => {
      stateManager.setLoading(true);
      stateManager.setLoading(true);
      stateManager.setLoading(false);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.LOADING);

      stateManager.setLoading(false);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.READY);
    });

    it('can never enter negative loading', () => {
      stateManager.setLoading(true);
      stateManager.setLoading(false);
      stateManager.setLoading(false);
      stateManager.setLoading(false);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.READY);

      stateManager.setLoading(true);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.LOADING);
    });

    it('can associate loading with a resource', () => {
      const resource1 = {};
      const resource2 = {};

      stateManager.setLoadingResource(resource1, true);
      stateManager.setLoadingResource(resource1, true);
      stateManager.setLoadingResource(resource2, false);
      stateManager.setLoadingResource(resource2, false);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.LOADING);

      stateManager.setLoadingResource(resource1, false);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.READY);

      stateManager.setLoadingResource(resource2, true);

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.LOADING);
    });
  });

  describe('disabled & active', () => {
    let disabledByUserListener: jest.Func;

    beforeEach(async () => {
      disabledByUserListener = jest.fn();
      stateManager.onDidChangeDisabledByUserState(disabledByUserListener);
      await stateManager.init();
    });

    it('by default is not disabled and it is active', async () => {
      expect(stateManager.isDisabledByUser()).toBe(false);
      expect(stateManager.isActive()).toBe(true);
    });

    it('changes to disabled and inactive when disabling via settings', () => {
      disableViaSettings();

      expect(stateManager.isDisabledByUser()).toBe(true);
      expect(disabledByUserListener).toHaveBeenCalledWith(true);

      expect(stateManager.isActive()).toBe(false);
    });

    it('changes to disabled and inactive when disabling temporarily for session', () => {
      stateManager.setTemporaryDisabled(true);

      expect(stateManager.isDisabledByUser()).toBe(true);
      expect(disabledByUserListener).toHaveBeenCalledWith(true);

      expect(stateManager.isActive()).toBe(false);
    });

    it('changes to inactive when document has unsupported language', () => {
      triggerActiveTextEditorChange(
        createFakePartial<vscode.TextEditor>({ document: { languageId: 'json' } }),
      );

      expect(stateManager.isActive()).toBe(false);
    });

    it('changes to inactive when there is no account', async () => {
      jest.mocked(suggestionsPlatformManager.getGitLabPlatform).mockResolvedValue(undefined);
      await jest.mocked(platformManager.onAccountChange).mock.calls[0][0]();

      expect(stateManager.isActive()).toBe(false);
    });
  });
});
