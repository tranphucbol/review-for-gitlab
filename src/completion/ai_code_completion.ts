import * as vscode from 'vscode';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../constants';
import { log } from '../log';
import { GitLabCodeCompletionProvider } from './gitlab_code_completion_provider';
import { GitLabPlatformManager } from '../gitlab/gitlab_platform';
import { CodeCompletionState, CodeCompletionStateManager } from './code_completion_state';
import { CodeSuggestionsStatusBarItem } from '../status_bar/code_suggestions_status_bar_item';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  getAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';

export class AiCodeCompletion {
  stateManager = new CodeCompletionStateManager();

  statusBarItem: CodeSuggestionsStatusBarItem;

  providerDisposable?: vscode.Disposable;

  constructor(manager: GitLabPlatformManager) {
    this.statusBarItem = new CodeSuggestionsStatusBarItem(this.stateManager);

    const register = () => {
      this.providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
        AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
        new GitLabCodeCompletionProvider(manager),
      );
    };

    const enableOrDisableSuggestions = () => {
      if (getAiAssistedCodeSuggestionsConfiguration().enabled) {
        log.debug('Enabling code completion');
        this.stateManager.setState(CodeCompletionState.OK);
        register();
      } else {
        log.debug('Disabling code completion');
        this.stateManager.setState(CodeCompletionState.DISABLED);
        this.providerDisposable?.dispose();
      }
    };

    enableOrDisableSuggestions();
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(AI_ASSISTED_CODE_SUGGESTIONS_MODE)) {
        enableOrDisableSuggestions();
      }
    });
  }

  dispose() {
    this.statusBarItem?.dispose();
    this.providerDisposable?.dispose();
  }
}
