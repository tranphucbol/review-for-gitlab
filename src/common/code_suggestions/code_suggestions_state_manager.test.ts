import * as vscode from 'vscode';
import {
  CodeSuggestionsStateManager,
  VisibleCodeSuggestionsState,
  TemporaryCodeSuggestionsState,
} from './code_suggestions_state_manager';
import {
  createActiveTextEditorChangeTrigger,
  createConfigurationChangeTrigger,
  createFakeWorkspaceConfiguration,
} from '../test_utils/vscode_fakes';
import { createFakePartial } from '../test_utils/create_fake_partial';

describe('Code suggestions state manager', () => {
  let triggerSettingsRefresh: () => void;
  let triggerActiveTextEditorChange: (te: vscode.TextEditor) => void;
  let stateManager: CodeSuggestionsStateManager;

  beforeEach(() => {
    vscode.window.activeTextEditor = undefined; // pretend that there is no active editor

    // these triggers need to be created BEFORE state manager adds listeners to VS Code API
    triggerSettingsRefresh = createConfigurationChangeTrigger();
    triggerActiveTextEditorChange = createActiveTextEditorChangeTrigger();

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

  describe('constructor', () => {
    it('reads settings and sets the disabled in settings property', () => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: false }));

      stateManager = new CodeSuggestionsStateManager();

      expect(stateManager.getVisibleState()).toBe(
        VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS,
      );
    });

    it('reads active document language and checks if it is supported', async () => {
      vscode.window.activeTextEditor = createFakePartial<vscode.TextEditor>({
        document: { languageId: 'json' },
      });

      stateManager = new CodeSuggestionsStateManager();

      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE);
    });
  });

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
        mutation: () => {
          // sets unsupported language
          triggerActiveTextEditorChange(
            createFakePartial<vscode.TextEditor>({ document: { languageId: 'json' } }),
          );
        },
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
