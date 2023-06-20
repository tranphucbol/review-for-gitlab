import {
  CodeSuggestionsState as State,
  CodeSuggestionsStateManager,
} from './code_suggestions_state';

describe('Code suggestions state manager', () => {
  it.each`
    from                          | to                | result
    ${State.UNSUPPORTED_LANGUAGE} | ${State.LOADING}  | ${State.UNSUPPORTED_LANGUAGE}
    ${State.UNSUPPORTED_LANGUAGE} | ${State.ERROR}    | ${State.UNSUPPORTED_LANGUAGE}
    ${State.UNSUPPORTED_LANGUAGE} | ${State.OK}       | ${State.OK}
    ${State.UNSUPPORTED_LANGUAGE} | ${State.DISABLED} | ${State.DISABLED}
  `('transition from $from to $to results in $result', ({ from, to, result }) => {
    const stateManager = new CodeSuggestionsStateManager();
    stateManager.setState(from);
    stateManager.setState(to);
    expect(stateManager.getState()).toBe(result);
  });
});
