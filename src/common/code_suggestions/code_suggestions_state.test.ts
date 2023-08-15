import {
  GlobalCodeSuggestionsState as GlobalState,
  TemporaryCodeSuggestionsState as TemporaryState,
  CodeSuggestionsStateManager,
  VisibleCodeSuggestionsState,
} from './code_suggestions_state';

describe('Code suggestions state manager', () => {
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
    stateManager = new CodeSuggestionsStateManager();
  });

  describe.each([GlobalState.DISABLED_VIA_SETTINGS])('when global state is %s', state => {
    beforeEach(() => {
      stateManager.setGlobalState(state);
    });

    it('should ignore unsupported document', () => {
      stateManager.setUnsupportedLanguageDocument(true);

      expect(stateManager.getVisibleState()).toBe(state);
    });

    it('should ignore temporary disabled flag', () => {
      stateManager.setTemporaryDisabled(true);

      expect(stateManager.getVisibleState()).toBe(state);
    });

    itShouldIgnoreAnyTemporaryStateAndReturn(state);
  });

  describe('when global state is ready', () => {
    beforeEach(() => {
      stateManager.setGlobalState(GlobalState.READY);
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
