import { codeSuggestionsTelemetry } from '../code_suggestions_telemetry';

// Used for telemetry
export const codeSuggestionAccepted = async () => {
  codeSuggestionsTelemetry.incAcceptCount();
};
