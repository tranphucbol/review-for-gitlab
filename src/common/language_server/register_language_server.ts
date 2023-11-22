import vscode from 'vscode';
import {
  IConfig,
  SUGGESTION_ACCEPTED_COMMAND,
  TELEMETRY_NOTIFICATION,
  TRACKING_EVENTS,
} from '@gitlab-org/gitlab-lsp';
import {
  BaseLanguageClient,
  DidChangeConfigurationNotification,
  LanguageClientOptions,
} from 'vscode-languageclient';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../code_suggestions/constants';
import { LanguageClientFactory } from './client_factory';
import { getClientContext } from './get_client_context';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabPlatformManagerForCodeSuggestions } from '../code_suggestions/gitlab_platform_manager_for_code_suggestions';
import { CONFIG_NAMESPACE } from '../constants';

const LANGUAGE_CLIENT_OPTIONS: LanguageClientOptions = {
  documentSelector: AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
};

export class LanguageClientWrapper {
  #client: BaseLanguageClient;

  #gitlabPlatformManager: GitLabPlatformManager;

  #subscriptions: vscode.Disposable[] = [];

  constructor(client: BaseLanguageClient, manager: GitLabPlatformManager) {
    this.#client = client;
    this.#gitlabPlatformManager = manager;
  }

  async initAndStart() {
    this.#client.registerProposedFeatures();
    this.#subscriptions.push();
    // TODO: export `NotificationType`s from LSP
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/-/blob/v1.0.1/src/common/connection.ts#L61
    this.#client.onNotification(
      '$/gitlab/token/check',
      (/* { message, reason }: TokenCheckResponse */) => {
        // TODO: set status to API error
      },
    );
    await this.#client.start();
    this.#subscriptions.push({ dispose: () => this.#client.stop() });
    await this.syncConfig();
  }

  syncConfig = async () => {
    const suggestionManager = new GitLabPlatformManagerForCodeSuggestions(
      this.#gitlabPlatformManager,
    );
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

    await this.#client.sendNotification(DidChangeConfigurationNotification.type, {
      settings,
    });
  };

  sendSuggestionAcceptedEvent = async (trackingId: string) =>
    this.#client.sendNotification(TELEMETRY_NOTIFICATION, {
      category: 'code_suggestions',
      action: TRACKING_EVENTS.ACCEPTED,
      context: { trackingId },
    });

  dispose = () => {
    this.#subscriptions.forEach(s => s.dispose());
  };
}

export const registerLanguageServer = async (
  context: vscode.ExtensionContext,
  clientFactory: LanguageClientFactory,
  gitlabPlatformManager: GitLabPlatformManager,
) => {
  const client = clientFactory.createLanguageClient(context, {
    ...LANGUAGE_CLIENT_OPTIONS,
    initializationOptions: getClientContext(),
  });
  const wrapper = new LanguageClientWrapper(client, gitlabPlatformManager);
  await wrapper.initAndStart();
  context.subscriptions.push(
    wrapper,
    vscode.commands.registerCommand(
      SUGGESTION_ACCEPTED_COMMAND,
      wrapper.sendSuggestionAcceptedEvent,
    ),
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration(CONFIG_NAMESPACE)) {
        return;
      }

      await wrapper.syncConfig();
    }),
    gitlabPlatformManager.onAccountChange(wrapper.syncConfig),
  );
};
