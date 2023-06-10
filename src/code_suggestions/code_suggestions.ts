import * as vscode from 'vscode';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../constants';
import { log } from '../log';
import { CodeSuggestionsProvider } from './code_suggestions_provider';
import { GitLabPlatformManager } from '../gitlab/gitlab_platform';
import { CodeSuggestionsState, CodeSuggestionsStateManager } from './code_suggestions_state';
import { CodeSuggestionsStatusBarItem } from './code_suggestions_status_bar_item';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  getAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';

export class CodeSuggestions {
  stateManager = new CodeSuggestionsStateManager();

  statusBarItem: CodeSuggestionsStatusBarItem;

  providerDisposable?: vscode.Disposable;

  constructor(manager: GitLabPlatformManager) {
    this.statusBarItem = new CodeSuggestionsStatusBarItem(this.stateManager);

    const register = () => {
      this.providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
        AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
        new CodeSuggestionsProvider(manager),
      );
    };

    const enableOrDisableSuggestions = () => {
      if (getAiAssistedCodeSuggestionsConfiguration().enabled) {
        log.debug('Enabling code completion');
        this.stateManager.setState(CodeSuggestionsState.OK);
        register();
      } else {
        log.debug('Disabling code completion');
        this.stateManager.setState(CodeSuggestionsState.DISABLED);
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
