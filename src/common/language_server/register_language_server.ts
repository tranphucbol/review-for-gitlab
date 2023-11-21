import vscode from 'vscode';
import { IConfig, SUGGESTION_ACCEPTED_COMMAND, TRACKING_EVENTS } from '@gitlab-org/gitlab-lsp';
import {
  BaseLanguageClient,
  DidChangeConfigurationNotification,
  LanguageClientOptions,
} from 'vscode-languageclient';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../code_suggestions/constants';
import { LanguageClientFactory } from './client_factory';
import { getClientContext } from './get_client_context';
import { createCodeSuggestionAcceptedCommand } from '../code_suggestions/commands/ls_suggestion_accepted';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabPlatformManagerForCodeSuggestions } from '../code_suggestions/gitlab_platform_manager_for_code_suggestions';

export const LANGUAGE_CLIENT_OPTIONS: LanguageClientOptions = {
  documentSelector: AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
};

// 1. starts the VS Code client
// 2. synchronizes settings when VS Code settings change
// 3. performs token check
export function registerLanguageServer(
  context: vscode.ExtensionContext,
  clientFactory: LanguageClientFactory,
  gitlabPlatformManager: GitLabPlatformManager,
) {
  const client = clientFactory.createLanguageClient(context, {
    ...LANGUAGE_CLIENT_OPTIONS,
    initializationOptions: getClientContext(),
  });
  client.registerProposedFeatures();
  context.subscriptions.push(
    vscode.commands.registerCommand(
      SUGGESTION_ACCEPTED_COMMAND,
      createCodeSuggestionAcceptedCommand(client),
    ),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (!e.affectsConfiguration('gitlab')) {
        return;
      }

      await syncConfig(client, gitlabPlatformManager);
    }),

    // TODO: export `NotificationType`s from LSP
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/-/blob/v1.0.1/src/common/connection.ts#L61
    client.onNotification(
      '$/gitlab/token/check',
      (/* { message, reason }: TokenCheckResponse */) => {
        // TODO: set status to API error
      },
    ),
    gitlabPlatformManager.onAccountChange(() => syncConfig(client, gitlabPlatformManager)),

    start(client, gitlabPlatformManager),
  );
}

async function syncConfig(
  client: BaseLanguageClient,
  gitlabPlatformManager: GitLabPlatformManager,
) {
  const suggestionManager = new GitLabPlatformManagerForCodeSuggestions(gitlabPlatformManager);
  const platform = await suggestionManager.getGitLabPlatform();
  if (!platform) {
    // TODO handle errors like these in one place, don't spread the error handling throughout the LS logic
    // This should notify the sate manager that will be implemented in https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/1052
    await vscode.window.showErrorMessage(
      'There is no GitLab account available with access to suggestions',
    );
    return;
  }
  const settings: IConfig = {
    baseUrl: platform.account.instanceUrl,
    token: platform.account.token,
    telemetry: {
      actions: [{ action: TRACKING_EVENTS.ACCEPTED }],
    },
  };

  await client.sendNotification(DidChangeConfigurationNotification.type, {
    settings,
  });
}

function start(client: BaseLanguageClient, gitlabPlatformManager: GitLabPlatformManager) {
  const started = client.start().then(() => syncConfig(client, gitlabPlatformManager));

  return {
    dispose: async () => {
      await started;
      await client.stop();
    },
  };
}
