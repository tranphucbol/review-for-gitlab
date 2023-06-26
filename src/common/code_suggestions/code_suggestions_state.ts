import * as vscode from 'vscode';

export const enum CodeSuggestionsState {
  LOADING = 'code-suggestions-loading',
  DISABLED = 'code-suggestions-disabled',
  OK = 'code-suggestions-ok',
  ERROR = 'code-suggestions-error',
  UNSUPPORTED_LANGUAGE = 'code-suggestions-unsupported-language',
}

export class CodeSuggestionsStateManager {
  #state: CodeSuggestionsState = CodeSuggestionsState.DISABLED;

  #changeStateEmitter = new vscode.EventEmitter<CodeSuggestionsState>();

  onDidChangeState = this.#changeStateEmitter.event;

  getState() {
    return this.#state;
  }

  setState(newState: CodeSuggestionsState) {
    if (this.#state !== newState) {
      if (
        this.#state === CodeSuggestionsState.UNSUPPORTED_LANGUAGE &&
        ![CodeSuggestionsState.OK, CodeSuggestionsState.DISABLED].includes(newState)
      ) {
        return;
      }

      this.#state = newState;
      this.#changeStateEmitter.fire(newState);
    }
  }
}
