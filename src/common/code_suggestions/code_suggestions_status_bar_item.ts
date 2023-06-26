import * as vscode from 'vscode';
import { createStatusBarItem } from '../utils/create_status_bar_item';
import { CodeSuggestionsStateManager, CodeSuggestionsState } from './code_suggestions_state';

type CodeSuggestionsStatuses = Record<CodeSuggestionsState, { text: string; tooltip: string }>;

const CODE_SUGGESTIONS_STATUSES: CodeSuggestionsStatuses = {
  [CodeSuggestionsState.LOADING]: {
    text: '$(gitlab-code-suggestions-loading)',
    tooltip: 'Code suggestion is loading...',
  },
  [CodeSuggestionsState.DISABLED]: {
    text: '$(gitlab-code-suggestions-disabled)',
    tooltip: 'Code suggestions are disabled',
  },
  [CodeSuggestionsState.OK]: {
    text: '$(gitlab-code-suggestions-enabled)',
    tooltip: 'Code suggestions are enabled',
  },
  [CodeSuggestionsState.ERROR]: {
    text: '$(gitlab-code-suggestions-error)',
    tooltip: 'There was an error fetching code suggestions. See extension logs',
  },
  [CodeSuggestionsState.UNSUPPORTED_LANGUAGE]: {
    text: '$(gitlab-code-suggestions-disabled)',
    tooltip: 'Code suggestions are not supported for this language',
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
