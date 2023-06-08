import { codeSuggestionAccepted } from './code_suggestion_accepted';
import { codeCompletionTelemetry } from '../completion/code_completion_telemetry';

describe('code suggestion accepted command', () => {
  it('updates codeCompletionTelemetry with the correct value', async () => {
    await codeSuggestionAccepted();

    expect(codeCompletionTelemetry.acceptCount).toBe(1);
  });
});
