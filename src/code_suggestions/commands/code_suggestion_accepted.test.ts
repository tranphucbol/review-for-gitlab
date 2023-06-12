import { codeSuggestionAccepted } from './code_suggestion_accepted';
import { codeSuggestionsTelemetry } from '../code_suggestions_telemetry';

describe('code suggestion accepted command', () => {
  it('updates codeSuggestionsTelemetry with the correct value', async () => {
    await codeSuggestionAccepted();

    expect(codeSuggestionsTelemetry.acceptCount).toBe(1);
  });
});
