import * as vscode from 'vscode';
import {
  TemporaryCodeSuggestionsState as TemporaryState,
  CodeSuggestionsStateManager,
  VisibleCodeSuggestionsState,
} from './code_suggestions_state';
import {
  createConfigurationChangeTrigger,
  createFakeWorkspaceConfiguration,
} from '../test_utils/vscode_fakes';

describe('Code suggestions state manager', () => {
  let triggerSettingsRefresh: () => void;
  let stateManager: CodeSuggestionsStateManager;

  function itShouldIgnoreAnyTemporaryStateAndReturn(state: VisibleCodeSuggestionsState) {
    it('should ignore any temporary state', () => {
      Object.values(TemporaryState).forEach(temporaryState => {
        stateManager.setTemporaryState(temporaryState);

        expect(stateManager.getVisibleState()).toBe(state);
      });
    });
  }

  beforeEach(() => {
    triggerSettingsRefresh = createConfigurationChangeTrigger();
    stateManager = new CodeSuggestionsStateManager();
  });

  describe('state updates', () => {
    it.each`
      isEnabledInSettings | codeSuggestionState
      ${false}            | ${VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS}
      ${true}             | ${VisibleCodeSuggestionsState.READY}
    `(
      'sets state to $codeSuggestionState when code suggestions setting is $isEnabledInSettings',
      ({ isEnabledInSettings, codeSuggestionState }) => {
        jest
          .mocked(vscode.workspace.getConfiguration)
          .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: isEnabledInSettings }));
        triggerSettingsRefresh();

        const [[configurationChangeListener]] = jest.mocked(
          vscode.workspace.onDidChangeConfiguration,
        ).mock.calls;
        configurationChangeListener({ affectsConfiguration: () => true });

        expect(stateManager.getVisibleState()).toBe(codeSuggestionState);
      },
    );
  });

  describe('when suggestions are disabled in settings', () => {
    beforeEach(() => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: false }));
      triggerSettingsRefresh();
    });

    it('should ignore unsupported document', () => {
      stateManager.setUnsupportedLanguageDocument(true);

      expect(stateManager.getVisibleState()).toBe(
        VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS,
      );
    });

    it('should ignore temporary disabled flag', () => {
      stateManager.setTemporaryDisabled(true);

      expect(stateManager.getVisibleState()).toBe(
        VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS,
      );
    });

    itShouldIgnoreAnyTemporaryStateAndReturn(VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS);
  });

  describe('when the extension is enabled in settings and no other flags are present', () => {
    beforeEach(() => {
      jest
        .mocked(vscode.workspace.getConfiguration)
        .mockReturnValue(createFakeWorkspaceConfiguration({ enabled: true }));
      triggerSettingsRefresh();
    });

    describe('when is temporary disabled', () => {
      beforeEach(() => {
        stateManager.setTemporaryDisabled(true);
      });

      it('should report as temporary disabled', () => {
        expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.DISABLED_BY_USER);
      });

      itShouldIgnoreAnyTemporaryStateAndReturn(VisibleCodeSuggestionsState.DISABLED_BY_USER);
    });

    describe('when in document with unsupported language', () => {
      beforeEach(() => {
        stateManager.setUnsupportedLanguageDocument(true);
      });

      it('should report as unsupported language', () => {
        expect(stateManager.getVisibleState()).toBe(
          VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE,
        );
      });

      itShouldIgnoreAnyTemporaryStateAndReturn(VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE);
    });

    it('should report state as ready', () => {
      expect(stateManager.getVisibleState()).toBe(VisibleCodeSuggestionsState.READY);
    });

    it.each(Object.values(TemporaryState))('when temporary state is %s', tempState => {
      stateManager.setTemporaryState(tempState);
      expect(stateManager.getVisibleState()).toBe(tempState);
    });
  });
});
