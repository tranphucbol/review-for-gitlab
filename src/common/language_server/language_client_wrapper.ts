import vscode from 'vscode';
import {
  API_ERROR_NOTIFICATION,
  API_RECOVERY_NOTIFICATION,
  IConfig,
  TELEMETRY_NOTIFICATION,
  TRACKING_EVENTS,
  TokenCheckResponse,
} from '@gitlab-org/gitlab-lsp';
import { BaseLanguageClient, DidChangeConfigurationNotification } from 'vscode-languageclient';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabPlatformManagerForCodeSuggestions } from '../code_suggestions/gitlab_platform_manager_for_code_suggestions';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { log } from '../log';
import { FeatureFlag, isEnabled } from '../feature_flags';

// note: Temporary until new gitlab-lsp version bumps with IConfig updated
type LspConfig = IConfig | { featureFlags: Record<string, boolean> };

export class LanguageClientWrapper {
  #client: BaseLanguageClient;

  #gitlabPlatformManager: GitLabPlatformManager;

  #stateManager: CodeSuggestionsStateManager;

  #subscriptions: vscode.Disposable[] = [];

  constructor(
    client: BaseLanguageClient,
    platformManager: GitLabPlatformManager,
    stateManager: CodeSuggestionsStateManager,
  ) {
    this.#client = client;
    this.#gitlabPlatformManager = platformManager;
    this.#stateManager = stateManager;
  }

  async initAndStart() {
    this.#client.registerProposedFeatures();
    this.#subscriptions.push();
    // TODO: export `NotificationType`s from LSP
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/-/blob/v1.0.1/src/common/connection.ts#L61
    this.#client.onNotification(
      '$/gitlab/token/check',
      ({ message, reason }: TokenCheckResponse) => {
        log.warn(
          `Token validation failed in Language Server: (${message} - ${reason}). This can happen with OAuth token refresh. If the rest of the extension works, this won't be a problem.`,
        );
      },
    );

    this.#client.onNotification(API_ERROR_NOTIFICATION, () => this.#stateManager.setError(true));
    this.#client.onNotification(API_RECOVERY_NOTIFICATION, () =>
      this.#stateManager.setError(false),
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
      log.warn('There is no GitLab account available with access to suggestions');
      return;
    }
    const settings: LspConfig = {
      baseUrl: platform.account.instanceUrl,
      token: platform.account.token,
      telemetry: {
        actions: [{ action: TRACKING_EVENTS.ACCEPTED }],
      },
      featureFlags: {
        [FeatureFlag.CodeSuggestionsClientDirectToGateway]: isEnabled(
          FeatureFlag.CodeSuggestionsClientDirectToGateway,
        ),
      },
    };

    log.info(`Configuring Language Server - baseUrl: ${platform.account.instanceUrl}`);
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
