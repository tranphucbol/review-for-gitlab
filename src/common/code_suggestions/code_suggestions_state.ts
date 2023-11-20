import * as vscode from 'vscode';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  getAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';

type ValueOf<T> = T[keyof T];

export type GlobalCodeSuggestionsState = ValueOf<typeof GlobalCodeSuggestionsState>;
export const GlobalCodeSuggestionsState = {
  DISABLED_VIA_SETTINGS: 'code-suggestions-global-disabled-via-settings',
  READY: 'code-suggestions-global-ready',
} as const;

export type TemporaryCodeSuggestionsState = ValueOf<typeof TemporaryCodeSuggestionsState>;
export const TemporaryCodeSuggestionsState = {
  ERROR: 'code-suggestions-error',
  LOADING: 'code-suggestions-loading',
} as const;

export type VisibleCodeSuggestionsState = ValueOf<typeof VisibleCodeSuggestionsState>;
export const VisibleCodeSuggestionsState = {
  ...GlobalCodeSuggestionsState,
  DISABLED_BY_USER: 'code-suggestions-disabled-by-user',
  ...TemporaryCodeSuggestionsState,
  UNSUPPORTED_LANGUAGE: 'code-suggestions-document-unsupported-language',
} as const;

export class CodeSuggestionsStateManager {
  #subscriptions: vscode.Disposable[] = [];

  #disabledInSettings: boolean;

  #isDisabledByUserForSession = false;

  #temporaryState: TemporaryCodeSuggestionsState | null = null;

  #isUnsupportedLanguageDocument = false;

  #changeVisibleStateEmitter = new vscode.EventEmitter<VisibleCodeSuggestionsState>();

  onDidChangeVisibleState = this.#changeVisibleStateEmitter.event;

  #changeEnabledStateEmitter = new vscode.EventEmitter<boolean>();

  onDidChangeEnabledState = this.#changeEnabledStateEmitter.event;

  constructor() {
    this.#disabledInSettings = !getAiAssistedCodeSuggestionsConfiguration().enabled;

    this.#subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(AI_ASSISTED_CODE_SUGGESTIONS_MODE)) {
          this.#disabledInSettings = !getAiAssistedCodeSuggestionsConfiguration().enabled;
        }
      }),
    );
  }

  isEnabled() {
    return !(this.#disabledInSettings || this.#isDisabledByUserForSession);
  }

  getVisibleState(): VisibleCodeSuggestionsState {
    if (this.#disabledInSettings) {
      return GlobalCodeSuggestionsState.DISABLED_VIA_SETTINGS;
    }

    if (this.#isDisabledByUserForSession) {
      return VisibleCodeSuggestionsState.DISABLED_BY_USER;
    }

    if (this.#isUnsupportedLanguageDocument) {
      return VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE;
    }

    return this.#temporaryState || GlobalCodeSuggestionsState.READY;
  }

  updateState(handler: () => void) {
    const previousVisibleState = this.getVisibleState();
    const previousEnabled = this.isEnabled();
    handler();
    const newVisibleState = this.getVisibleState();
    const newEnabled = this.isEnabled();

    if (previousVisibleState !== newVisibleState) {
      this.#changeVisibleStateEmitter.fire(newVisibleState);
    }

    if (previousEnabled !== newEnabled) {
      this.#changeEnabledStateEmitter.fire(newEnabled);
    }
  }

  setTemporaryState(newState: TemporaryCodeSuggestionsState | null) {
    this.updateState(() => {
      this.#temporaryState = newState;
    });
  }

  setTemporaryDisabled(newState: boolean) {
    this.updateState(() => {
      this.#isDisabledByUserForSession = newState;
    });
  }

  setUnsupportedLanguageDocument(newState: boolean) {
    this.updateState(() => {
      this.#isUnsupportedLanguageDocument = newState;
    });
  }

  dispose() {
    this.#subscriptions.forEach(s => s.dispose());
  }
}
