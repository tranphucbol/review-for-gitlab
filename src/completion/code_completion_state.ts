import * as vscode from 'vscode';

export const enum CodeCompletionState {
  DISABLED = 'code-completion-disabled',
  OK = 'code-completion-ok',
}

export class CodeCompletionStateManager {
  #state: CodeCompletionState = CodeCompletionState.DISABLED;

  #changeStateEmitter = new vscode.EventEmitter<CodeCompletionState>();

  onDidChangeState = this.#changeStateEmitter.event;

  getState() {
    return this.#state;
  }

  setState(newState: CodeCompletionState) {
    if (this.#state !== newState) {
      this.#state = newState;
      this.#changeStateEmitter.fire(newState);
    }
  }
}
