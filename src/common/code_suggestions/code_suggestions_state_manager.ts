import * as vscode from 'vscode';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  getAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from './constants';

type ValueOf<T> = T[keyof T];

export type TemporaryCodeSuggestionsState = ValueOf<typeof TemporaryCodeSuggestionsState>;
export const TemporaryCodeSuggestionsState = {
  ERROR: 'code-suggestions-error',
  LOADING: 'code-suggestions-loading',
} as const;

export type VisibleCodeSuggestionsState = ValueOf<typeof VisibleCodeSuggestionsState>;
export const VisibleCodeSuggestionsState = {
  DISABLED_VIA_SETTINGS: 'code-suggestions-global-disabled-via-settings',
  READY: 'code-suggestions-global-ready',
  DISABLED_BY_USER: 'code-suggestions-disabled-by-user',
  ...TemporaryCodeSuggestionsState,
  UNSUPPORTED_LANGUAGE: 'code-suggestions-document-unsupported-language',
} as const;

const isSupportedLanguage = (editor: vscode.TextEditor) =>
  AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.includes(editor.document.languageId);

export class CodeSuggestionsStateManager {
  // //////////
  // boolean flags that indicate code suggestions are not on
  #disabledInSettings: boolean;

  #isDisabledByUserForSession = false;

  #isUnsupportedLanguageDocument = false;
  // //////////

  #subscriptions: vscode.Disposable[] = [];

  #temporaryState: TemporaryCodeSuggestionsState | null = null;

  #changeVisibleStateEmitter = new vscode.EventEmitter<VisibleCodeSuggestionsState>();

  onDidChangeVisibleState = this.#changeVisibleStateEmitter.event;

  #changeDisabledByUserStateEmitter = new vscode.EventEmitter<boolean>();

  onDidChangeDisabledByUserState = this.#changeDisabledByUserStateEmitter.event;

  constructor() {
    this.#disabledInSettings = !getAiAssistedCodeSuggestionsConfiguration().enabled;
    const checkIfLanguageSupported = (te?: vscode.TextEditor) => {
      this.#updateState(() => {
        this.#isUnsupportedLanguageDocument = te ? !isSupportedLanguage(te) : false;
      });
    };
    checkIfLanguageSupported(vscode.window.activeTextEditor);

    this.#subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(AI_ASSISTED_CODE_SUGGESTIONS_MODE)) {
          this.#updateState(() => {
            this.#disabledInSettings = !getAiAssistedCodeSuggestionsConfiguration().enabled;
          });
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(checkIfLanguageSupported),
    );
  }

  isDisabledByUser() {
    return this.#disabledInSettings || this.#isDisabledByUserForSession;
  }

  getVisibleState(): VisibleCodeSuggestionsState {
    if (this.#disabledInSettings) {
      return VisibleCodeSuggestionsState.DISABLED_VIA_SETTINGS;
    }

    if (this.#isDisabledByUserForSession) {
      return VisibleCodeSuggestionsState.DISABLED_BY_USER;
    }

    if (this.#isUnsupportedLanguageDocument) {
      return VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE;
    }

    return this.#temporaryState || VisibleCodeSuggestionsState.READY;
  }

  #updateState(handler: () => void) {
    const previousVisibleState = this.getVisibleState();
    const previousDisabledByUser = this.isDisabledByUser();
    handler();
    const newVisibleState = this.getVisibleState();
    const newDisabledByUser = this.isDisabledByUser();

    if (previousVisibleState !== newVisibleState) {
      this.#changeVisibleStateEmitter.fire(newVisibleState);
    }

    if (previousDisabledByUser !== newDisabledByUser) {
      this.#changeDisabledByUserStateEmitter.fire(newDisabledByUser);
    }
  }

  setTemporaryState(newState: TemporaryCodeSuggestionsState | null) {
    this.#updateState(() => {
      this.#temporaryState = newState;
    });
  }

  setTemporaryDisabled(newState: boolean) {
    this.#updateState(() => {
      this.#isDisabledByUserForSession = newState;
    });
  }

  dispose() {
    this.#subscriptions.forEach(s => s.dispose());
  }
}
