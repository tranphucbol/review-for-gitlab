import * as vscode from 'vscode';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from './constants';
import { log } from '../log';
import { CodeSuggestionsProvider } from './code_suggestions_provider';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { CodeSuggestionsStateManager } from './code_suggestions_state_manager';
import { CodeSuggestionsStatusBarItem } from './code_suggestions_status_bar_item';
import { COMMAND_TOGGLE_CODE_SUGGESTIONS, toggleCodeSuggestions } from './commands/toggle';
import { LegacyApiFallbackConfig } from './legacy_api_fallback_config';
import { GitLabPlatformManagerForCodeSuggestions } from './gitlab_platform_manager_for_code_suggestions';

export class CodeSuggestions {
  stateManager = new CodeSuggestionsStateManager();

  statusBarItem: CodeSuggestionsStatusBarItem;

  toggleSuggestionsCommand?: vscode.Disposable;

  providerDisposable?: vscode.Disposable;

  activeTextEditorChangeDisposable?: vscode.Disposable;

  legacyApiFallbackConfig: LegacyApiFallbackConfig;

  constructor(manager: GitLabPlatformManager) {
    this.toggleSuggestionsCommand = vscode.commands.registerCommand(
      COMMAND_TOGGLE_CODE_SUGGESTIONS,
      () => toggleCodeSuggestions({ stateManager: this.stateManager }),
    );

    const platformManagerForCodeSuggestions = new GitLabPlatformManagerForCodeSuggestions(manager);

    this.statusBarItem = new CodeSuggestionsStatusBarItem(this.stateManager);

    this.legacyApiFallbackConfig = new LegacyApiFallbackConfig(platformManagerForCodeSuggestions);

    const updateCodeSuggestionsStateForEditor = (editor?: vscode.TextEditor) => {
      if (!editor) return;

      this.stateManager.setUnsupportedLanguageDocument(
        !AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.includes(editor.document.languageId),
      );

      this.legacyApiFallbackConfig
        .verifyGitLabVersion()
        .catch(() => this.legacyApiFallbackConfig.flagLegacyVersion());
    };

    const register = () => {
      this.providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
        AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
        new CodeSuggestionsProvider({
          manager: platformManagerForCodeSuggestions,
          legacyApiFallbackConfig: this.legacyApiFallbackConfig,
          stateManager: this.stateManager,
        }),
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

    this.stateManager.onDidChangeEnabledState(enableOrDisableSuggestions);
    enableOrDisableSuggestions();
  }

  dispose() {
    this.statusBarItem?.dispose();
    this.providerDisposable?.dispose();
    this.activeTextEditorChangeDisposable?.dispose();
    this.toggleSuggestionsCommand?.dispose();
    this.stateManager.dispose();
  }
}
