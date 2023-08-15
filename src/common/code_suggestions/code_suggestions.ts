import * as vscode from 'vscode';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from './constants';
import { log } from '../log';
import { CodeSuggestionsProvider } from './code_suggestions_provider';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { CodeSuggestionsStateManager, GlobalCodeSuggestionsState } from './code_suggestions_state';
import { CodeSuggestionsStatusBarItem } from './code_suggestions_status_bar_item';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  getAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';
import { COMMAND_TOGGLE_CODE_SUGGESTIONS, toggleCodeSuggestions } from './commands/toggle';

export class CodeSuggestions {
  stateManager = new CodeSuggestionsStateManager();

  statusBarItem: CodeSuggestionsStatusBarItem;

  toggleSuggestionsCommand?: vscode.Disposable;

  providerDisposable?: vscode.Disposable;

  activeTextEditorChangeDisposable?: vscode.Disposable;

  constructor(manager: GitLabPlatformManager) {
    this.toggleSuggestionsCommand = vscode.commands.registerCommand(
      COMMAND_TOGGLE_CODE_SUGGESTIONS,
      () => toggleCodeSuggestions({ stateManager: this.stateManager }),
    );

    this.statusBarItem = new CodeSuggestionsStatusBarItem(this.stateManager);

    const updateCodeSuggestionsStateForEditor = (editor?: vscode.TextEditor) => {
      if (!editor) return;

      this.stateManager.setUnsupportedLanguageDocument(
        !AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.includes(editor.document.languageId),
      );
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
      const enabled = this.stateManager.isEnabled();
      if (enabled) {
        log.debug('Enabling code completion');
        register();
      } else {
        log.debug('Disabling code completion');
        this.providerDisposable?.dispose();
        this.activeTextEditorChangeDisposable?.dispose();
      }
    };
    const syncExtensionGlobalState = () => {
      const newState = getAiAssistedCodeSuggestionsConfiguration().enabled
        ? GlobalCodeSuggestionsState.READY
        : GlobalCodeSuggestionsState.DISABLED_VIA_SETTINGS;
      this.stateManager.setGlobalState(newState);
    };

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(AI_ASSISTED_CODE_SUGGESTIONS_MODE)) {
        syncExtensionGlobalState();
      }
    });
    syncExtensionGlobalState();

    this.stateManager.onDidChangeEnabledState(enableOrDisableSuggestions);
    enableOrDisableSuggestions();
  }

  dispose() {
    this.statusBarItem?.dispose();
    this.providerDisposable?.dispose();
    this.activeTextEditorChangeDisposable?.dispose();
    this.toggleSuggestionsCommand?.dispose();
  }
}
