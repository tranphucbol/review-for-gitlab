import * as vscode from 'vscode';
import { createStatusBarItem } from './utils/create_status_bar_item';
import {
  CodeCompletionStateManager,
  CodeCompletionState,
} from '../completion/code_completion_state';

const CODE_SUGGESTIONS_STATUSES = {
  [CodeCompletionState.DISABLED]: {
    text: '$(gitlab-code-suggestions-disabled)',
    tooltip: 'Code suggestions are disabled',
  },
  [CodeCompletionState.OK]: {
    text: '$(gitlab-code-suggestions-enabled)',
    tooltip: 'Code suggestions are enabled',
  },
};

export class CodeSuggestionsStatusBarItem {
  codeSuggestionsStatusBarItem?: vscode.StatusBarItem;

  #codeSuggestionsStateSubscription?: vscode.Disposable;

  updateCodeSuggestionsItem(state: CodeCompletionState) {
    if (!this.codeSuggestionsStatusBarItem) return;

    const newUiState = CODE_SUGGESTIONS_STATUSES[state];

    this.codeSuggestionsStatusBarItem.text = newUiState.text;
    this.codeSuggestionsStatusBarItem.tooltip = newUiState.tooltip;
  }

  constructor(state: CodeCompletionStateManager) {
    this.codeSuggestionsStatusBarItem = createStatusBarItem({
      priority: 3,
      id: 'gl.status.code_suggestions',
      name: 'GitLab Workflow: Code Suggestions',
      initialText: '$(gitlab-code-suggestions-disabled)',
    });
    this.updateCodeSuggestionsItem(state.getState());
    this.#codeSuggestionsStateSubscription = state.onDidChangeState(e =>
      this.updateCodeSuggestionsItem(e),
    );
  }

  dispose(): void {
    this.#codeSuggestionsStateSubscription?.dispose();
  }
}
