import * as vscode from 'vscode';
import { createStatusBarItem } from '../desktop/utils/create_status_bar_item';
import { CodeSuggestionsStateManager, CodeSuggestionsState } from './code_suggestions_state';

const CODE_SUGGESTIONS_STATUSES = {
  [CodeSuggestionsState.DISABLED]: {
    text: '$(gitlab-code-suggestions-disabled)',
    tooltip: 'Code suggestions are disabled',
  },
  [CodeSuggestionsState.OK]: {
    text: '$(gitlab-code-suggestions-enabled)',
    tooltip: 'Code suggestions are enabled',
  },
};

export class CodeSuggestionsStatusBarItem {
  codeSuggestionsStatusBarItem?: vscode.StatusBarItem;

  #codeSuggestionsStateSubscription?: vscode.Disposable;

  updateCodeSuggestionsItem(state: CodeSuggestionsState) {
    if (!this.codeSuggestionsStatusBarItem) return;

    const newUiState = CODE_SUGGESTIONS_STATUSES[state];

    this.codeSuggestionsStatusBarItem.text = newUiState.text;
    this.codeSuggestionsStatusBarItem.tooltip = newUiState.tooltip;
  }

  constructor(state: CodeSuggestionsStateManager) {
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
