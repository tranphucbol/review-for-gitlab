import * as vscode from 'vscode';
import {
  CodeSuggestionsStateManager,
  VisibleCodeSuggestionsState,
  TemporaryCodeSuggestionsState,
} from './code_suggestions_state_manager';
import {
  createConfigurationChangeTrigger,
  createFakeWorkspaceConfiguration,
} from '../test_utils/vscode_fakes';

describe('Code suggestions state manager', () => {
  let triggerSettingsRefresh: () => void;
  let stateManager: CodeSuggestionsStateManager;

  beforeEach(() => {
    triggerSettingsRefresh = createConfigurationChangeTrigger();
    // ensure the suggestions are enabled in settings
    jest
      .mocked(vscode.workspace.getConfiguration)
      .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: true }));
    stateManager = new CodeSuggestionsStateManager();
  });

  const disableViaSettings = () => {
    jest
      .mocked(vscode.workspace.getConfiguration)
      .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: false }));
    triggerSettingsRefresh();
  };

  describe('visible state', () => {
    type StateMutation = () => void;
    const mutationsFromLeastImportant: {
      mutation: StateMutation;
      expectedState: VisibleCodeSuggestionsState;
    }[] = [
      {
        mutation: () => stateManager.setTemporaryState(TemporaryCodeSuggestionsState.ERROR),
        expectedState: VisibleCodeSuggestionsState.ERROR,
      },
      {
        mutation: () => stateManager.setUnsupportedLanguageDocument(true),
        expectedState: VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE,
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

    it('more important state takes precedence over less important state', () => {
      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.READY);

      mutationsFromLeastImportant.forEach(scenario => {
        scenario.mutation();
        expect(stateManager.getVisibleState()).toBe(scenario.expectedState);
      });
    });

    it('every state change triggers an event', async () => {
      const visibleStateChangeListener = jest.fn();
      stateManager.onDidChangeVisibleState(visibleStateChangeListener);
      mutationsFromLeastImportant.forEach(scenario => {
        visibleStateChangeListener.mockReset();
        scenario.mutation();
        expect(visibleStateChangeListener).toHaveBeenCalledWith(scenario.expectedState);
      });
    });
  });

  describe('isEnabled', () => {
    let enabledStateListener: jest.Func;

    beforeEach(() => {
      enabledStateListener = jest.fn();
      stateManager.onDidChangeEnabledState(enabledStateListener);
    });

    it('is enabled', async () => {
      expect(stateManager.isEnabled()).toBe(true);
    });

    it('changes to disabled when disabling via settings', () => {
      disableViaSettings();

      expect(stateManager.isEnabled()).toBe(false);
      expect(enabledStateListener).toHaveBeenCalledWith(false);
    });

    it('changes to disabled when disabling temporarily for session', () => {
      stateManager.setTemporaryDisabled(true);

      expect(stateManager.isEnabled()).toBe(false);
      expect(enabledStateListener).toHaveBeenCalledWith(false);
    });
  });
});
