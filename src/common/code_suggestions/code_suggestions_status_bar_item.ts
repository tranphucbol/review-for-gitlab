import * as vscode from 'vscode';
import { IStatus, createStatusBarItem } from '../utils/status_bar_item';
import {
  CodeSuggestionsStateManager,
  VisibleCodeSuggestionsState,
} from './code_suggestions_state_manager';
import { COMMAND_TOGGLE_CODE_SUGGESTIONS } from './commands/toggle';

export const CODE_SUGGESTIONS_STATUSES: Record<VisibleCodeSuggestionsState, IStatus> = {
  [VisibleCodeSuggestionsState.LOADING]: {
    text: '$(gitlab-code-suggestions-loading)',
    tooltip: 'Code suggestion is loading...',
  },
  [VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS]: {
    text: '$(gitlab-code-suggestions-disabled)',
    tooltip: 'Code suggestions are disabled',
  },
  [VisibleCodeSuggestionsState.READY]: {
    text: '$(gitlab-code-suggestions-enabled)',
    tooltip: 'Code suggestions are enabled',
  },
  [VisibleCodeSuggestionsState.ERROR]: {
    text: '$(gitlab-code-suggestions-error)',
    tooltip: 'There was an error fetching code suggestions. See extension logs',
  },
  [VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE]: {
    text: '$(gitlab-code-suggestions-disabled)',
    tooltip: 'Code suggestions are not supported for this language',
  },
  [VisibleCodeSuggestionsState.DISABLED_BY_USER]: {
    text: '$(gitlab-code-suggestions-disabled)',
    tooltip: 'Code suggestions are disabled per user request. Click to enable',
  },
};

export class CodeSuggestionsStatusBarItem {
  codeSuggestionsStatusBarItem?: vscode.StatusBarItem;

  #codeSuggestionsStateSubscription?: vscode.Disposable;

  updateCodeSuggestionsItem(state: VisibleCodeSuggestionsState) {
    if (!this.codeSuggestionsStatusBarItem) return;

    const newUiState = CODE_SUGGESTIONS_STATUSES[state];

    this.codeSuggestionsStatusBarItem.text = newUiState.text;
    this.codeSuggestionsStatusBarItem.tooltip = newUiState.tooltip;
  }

  constructor(state: CodeSuggestionsStateManager) {
    this.codeSuggestionsStatusBarItem = createCodeSuggestionStatusBarItem();
    this.updateCodeSuggestionsItem(state.getVisibleState());
    this.#codeSuggestionsStateSubscription = state.onDidChangeVisibleState(e =>
      this.updateCodeSuggestionsItem(e),
    );
  }

  dispose(): void {
    this.#codeSuggestionsStateSubscription?.dispose();
  }
}

function createCodeSuggestionStatusBarItem() {
  return createStatusBarItem({
    priority: 3,
    id: 'gl.status.code_suggestions',
    name: 'GitLab Workflow: Code Suggestions',
    initialText: '$(gitlab-code-suggestions-disabled)',
    command: COMMAND_TOGGLE_CODE_SUGGESTIONS,
  });
}
