import { BaseLanguageClient } from 'vscode-languageclient';
import { TRACKING_EVENTS } from '@gitlab-org/gitlab-lsp';
import { createFakePartial } from '../../test_utils/create_fake_partial';
import { createCodeSuggestionAcceptedCommand } from './ls_suggestion_accepted';

describe('createCodeSuggestionAcceptedCommand', () => {
  it('creates command that sends telemetry event', async () => {
    const client = createFakePartial<BaseLanguageClient>({
      sendNotification: jest.fn(),
    });
    const command = createCodeSuggestionAcceptedCommand(client);

    await command('tracking id test');

    expect(client.sendNotification).toHaveBeenCalledWith('$/gitlab/telemetry', {
      category: 'code_suggestions',
      action: TRACKING_EVENTS.ACCEPTED,
      context: { trackingId: 'tracking id test' },
    });
  });
});
