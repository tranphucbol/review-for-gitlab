import * as vscode from 'vscode';

export const enum CodeSuggestionsState {
  DISABLED = 'code-completion-disabled',
  OK = 'code-completion-ok',
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
      this.#state = newState;
      this.#changeStateEmitter.fire(newState);
    }
  }
}
