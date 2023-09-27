import vscode from 'vscode';
import { IConfig, TokenCheckResponse } from '@gitlab-org/gitlab-lsp';
import {
  BaseLanguageClient,
  DidChangeConfigurationNotification,
  LanguageClientOptions,
} from 'vscode-languageclient';
import { VisibleCodeSuggestionsState } from '../code_suggestions/code_suggestions_state';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../code_suggestions/constants';
import { GITLAB_COM_URL } from '../constants';
import { setStatusBar } from '../utils/status_bar_item';
import { CODE_SUGGESTIONS_STATUSES } from '../code_suggestions/code_suggestions_status_bar_item';
import { IAccountService } from '../accounts';

export const LANGUAGE_SERVER_ID = 'gitlab-lsp';
export const LANGUAGE_SERVER_NAME = 'GitLab Language Server';
export const LANGUAGE_CLIENT_OPTIONS: LanguageClientOptions = {
  documentSelector: AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
};

export function registerLanguageServer(
  context: vscode.ExtensionContext,
  client: BaseLanguageClient,
  statusBar: vscode.StatusBarItem,
  accounts?: IAccountService,
) {
  context.subscriptions.push(
    statusBar,

    vscode.window.onDidChangeActiveTextEditor((editor?: vscode.TextEditor) => {
      if (!editor) return;

      const state = AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.includes(editor.document.languageId)
        ? VisibleCodeSuggestionsState.READY
        : VisibleCodeSuggestionsState.UNSUPPORTED_LANGUAGE;

      setStatusBar(statusBar, CODE_SUGGESTIONS_STATUSES[state]);
    }),

    vscode.workspace.onDidChangeConfiguration(async e => {
      if (!e.affectsConfiguration('gitlab')) {
        return;
      }

      await syncConfig(client, accounts);
    }),

    // TODO: export `NotificationType`s from LSP
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/-/blob/v1.0.1/src/common/connection.ts#L61
    client.onNotification('$/gitlab/token/check', ({ message, reason }: TokenCheckResponse) => {
      // TODO: more granular (auth-specific) status?
      setStatusBar(statusBar, CODE_SUGGESTIONS_STATUSES[VisibleCodeSuggestionsState.ERROR]);
      return vscode.window.showErrorMessage(`Token check: [${reason}] ${message}`);
    }),

    start(client, accounts),
  );
}

async function syncConfig(client: BaseLanguageClient, accounts?: IAccountService) {
  const baseUrl = vscode.workspace.getConfiguration().get<string>('gitlab.baseUrl', GITLAB_COM_URL);

  const settings: IConfig = {
    baseUrl,
    // TODO: how do we pick the "right" account?
    ...accounts?.getOneAccountForInstance(baseUrl),
  };

  return client.sendNotification(DidChangeConfigurationNotification.type, {
    settings,
  });
}

function start(client: BaseLanguageClient, accounts?: IAccountService) {
  const started = client.start().then(() => syncConfig(client, accounts));

  return {
    dispose: async () => {
      await started;
      await client.stop();
    },
  };
}
