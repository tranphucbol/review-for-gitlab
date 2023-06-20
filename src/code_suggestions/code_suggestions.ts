import * as vscode from 'vscode';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../desktop/constants';
import { log } from '../common/log';
import { CodeSuggestionsProvider } from './code_suggestions_provider';
import { GitLabPlatformManager } from '../common/platform/gitlab_platform';
import { CodeSuggestionsState, CodeSuggestionsStateManager } from './code_suggestions_state';
import { CodeSuggestionsStatusBarItem } from './code_suggestions_status_bar_item';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  getAiAssistedCodeSuggestionsConfiguration,
} from '../common/utils/extension_configuration';

export class CodeSuggestions {
  stateManager = new CodeSuggestionsStateManager();

  statusBarItem: CodeSuggestionsStatusBarItem;

  providerDisposable?: vscode.Disposable;

  activeTextEditorChangeDisposable?: vscode.Disposable;

  constructor(manager: GitLabPlatformManager) {
    this.statusBarItem = new CodeSuggestionsStatusBarItem(this.stateManager);

    const updateCodeSuggestionsStateForEditor = (editor?: vscode.TextEditor) => {
      if (!editor) return;

      if (AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.includes(editor.document.languageId)) {
        this.stateManager.setState(CodeSuggestionsState.OK);
      } else {
        this.stateManager.setState(CodeSuggestionsState.UNSUPPORTED_LANGUAGE);
      }
    };

    const register = () => {
      this.providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
        AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
        new CodeSuggestionsProvider({ manager, stateManager: this.stateManager }),
      );
      updateCodeSuggestionsStateForEditor(vscode.window.activeTextEditor);
      this.activeTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
        updateCodeSuggestionsStateForEditor,
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
        this.activeTextEditorChangeDisposable?.dispose();
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
    this.activeTextEditorChangeDisposable?.dispose();
  }
}
