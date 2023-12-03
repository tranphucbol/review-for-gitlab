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
import { CodeSuggestionsGutterIcon } from './code_suggestions_gutter_icon';

export class CodeSuggestions {
  stateManager: CodeSuggestionsStateManager;

  statusBarItem: CodeSuggestionsStatusBarItem;

  #gutterIcon: CodeSuggestionsGutterIcon;

  toggleSuggestionsCommand?: vscode.Disposable;

  providerDisposable?: vscode.Disposable;

  activeTextEditorChangeDisposable?: vscode.Disposable;

  legacyApiFallbackConfig: LegacyApiFallbackConfig;

  constructor(context: vscode.ExtensionContext, manager: GitLabPlatformManager) {
    this.stateManager = new CodeSuggestionsStateManager(manager);
    this.toggleSuggestionsCommand = vscode.commands.registerCommand(
      COMMAND_TOGGLE_CODE_SUGGESTIONS,
      () => toggleCodeSuggestions({ stateManager: this.stateManager }),
    );

    const platformManagerForCodeSuggestions = new GitLabPlatformManagerForCodeSuggestions(manager);

    this.statusBarItem = new CodeSuggestionsStatusBarItem(this.stateManager);
    this.#gutterIcon = new CodeSuggestionsGutterIcon(context, this.stateManager);

    this.legacyApiFallbackConfig = new LegacyApiFallbackConfig(platformManagerForCodeSuggestions);

    const updateCodeSuggestionsStateForEditor = (editor?: vscode.TextEditor) => {
      if (!editor) return;

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
      const disabledByUser = this.stateManager.isDisabledByUser();
      if (disabledByUser) {
        log.debug('Disabling code completion');
        this.providerDisposable?.dispose();
        this.activeTextEditorChangeDisposable?.dispose();
      } else {
        log.debug('Enabling code completion');
        register();
      }
    };

    this.stateManager.onDidChangeDisabledByUserState(enableOrDisableSuggestions);
    enableOrDisableSuggestions();
  }

  async init() {
    await this.stateManager.init();
  }

  dispose() {
    this.statusBarItem?.dispose();
    this.#gutterIcon.dispose();
    this.providerDisposable?.dispose();
    this.activeTextEditorChangeDisposable?.dispose();
    this.toggleSuggestionsCommand?.dispose();
    this.stateManager.dispose();
  }
}
