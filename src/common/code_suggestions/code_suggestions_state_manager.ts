import * as vscode from 'vscode';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  getAiAssistedCodeSuggestionsConfiguration,
} from '../utils/extension_configuration';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from './constants';

type ValueOf<T> = T[keyof T];

export type VisibleCodeSuggestionsState = ValueOf<typeof VisibleCodeSuggestionsState>;
export const VisibleCodeSuggestionsState = {
  DISABLED_VIA_SETTINGS: 'code-suggestions-global-disabled-via-settings',
  READY: 'code-suggestions-global-ready',
  DISABLED_BY_USER: 'code-suggestions-disabled-by-user',
  UNSUPPORTED_LANGUAGE: 'code-suggestions-document-unsupported-language',
  ERROR: 'code-suggestions-error',
  LOADING: 'code-suggestions-loading',
} as const;

const isSupportedLanguage = (editor: vscode.TextEditor) =>
  AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.includes(editor.document.languageId);

export class CodeSuggestionsStateManager {
  // //////////
  // boolean flags that indicate code suggestions are not on
  #disabledInSettings: boolean;

  #isDisabledByUserForSession = false;

  #isUnsupportedLanguage = false;
  // //////////

  // //////////
  // boolean flags and counters indicating temporary states
  #isInErrorState = false;

  // this can't be a boolean flag because it's possible that response from first
  // request comes after we send second request (which would incorrectly set loading to false)
  #loadingCounter = 0;
  // //////////

  #subscriptions: vscode.Disposable[] = [];

  #changeVisibleStateEmitter = new vscode.EventEmitter<VisibleCodeSuggestionsState>();

  onDidChangeVisibleState = this.#changeVisibleStateEmitter.event;

  #changeDisabledByUserStateEmitter = new vscode.EventEmitter<boolean>();

  onDidChangeDisabledByUserState = this.#changeDisabledByUserStateEmitter.event;

  constructor() {
    this.#disabledInSettings = !getAiAssistedCodeSuggestionsConfiguration().enabled;
    const checkIfLanguageSupported = (te?: vscode.TextEditor) => {
      this.#setUnsupportedLanguage(te ? !isSupportedLanguage(te) : false);
    };
    checkIfLanguageSupported(vscode.window.activeTextEditor);

    this.#subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(AI_ASSISTED_CODE_SUGGESTIONS_MODE)) {
          this.#setDisabledInSettings(!getAiAssistedCodeSuggestionsConfiguration().enabled);
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

    if (this.#isUnsupportedLanguage) {
      return VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE;
    }

    if (this.#isInErrorState) {
      return VisibleCodeSuggestionsState.ERROR;
    }

    if (this.#loadingCounter !== 0) {
      return VisibleCodeSuggestionsState.LOADING;
    }

    return VisibleCodeSuggestionsState.READY;
  }

  #updateStateWrapper = (handler: (v: boolean) => void) => (value: boolean) => {
    const previousVisibleState = this.getVisibleState();
    const previousDisabledByUser = this.isDisabledByUser();
    handler(value);
    const newVisibleState = this.getVisibleState();
    const newDisabledByUser = this.isDisabledByUser();

    if (previousVisibleState !== newVisibleState) {
      this.#changeVisibleStateEmitter.fire(newVisibleState);
    }

    if (previousDisabledByUser !== newDisabledByUser) {
      this.#changeDisabledByUserStateEmitter.fire(newDisabledByUser);
    }
  };

  #setDisabledInSettings = this.#updateStateWrapper(isDisabled => {
    this.#disabledInSettings = isDisabled;
  });

  #setUnsupportedLanguage = this.#updateStateWrapper(isUnsupportedLanguage => {
    this.#isUnsupportedLanguage = isUnsupportedLanguage;
  });

  setError = this.#updateStateWrapper(isError => {
    this.#isInErrorState = isError;
  });

  setLoading = this.#updateStateWrapper(isLoading => {
    if (isLoading) {
      this.#loadingCounter += 1;
    } else {
      this.#loadingCounter -= 1;
    }
  });

  setTemporaryDisabled = this.#updateStateWrapper(isDisabled => {
    this.#isDisabledByUserForSession = isDisabled;
  });

  dispose() {
    this.#subscriptions.forEach(s => s.dispose());
  }
}
