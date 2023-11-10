import { TRACKING_EVENTS, TELEMETRY_NOTIFICATION } from '@gitlab-org/gitlab-lsp';
import { BaseLanguageClient } from 'vscode-languageclient';

export const createCodeSuggestionAcceptedCommand =
  (client: BaseLanguageClient) => async (trackingId: string) =>
    client.sendNotification(TELEMETRY_NOTIFICATION, {
      category: 'code_suggestions',
      action: TRACKING_EVENTS.ACCEPTED,
      context: { trackingId },
    });
