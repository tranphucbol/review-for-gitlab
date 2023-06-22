import { Model, codeSuggestionsTelemetry } from '../code_suggestions_telemetry';

// Used for telemetry
export const codeSuggestionAccepted = async (model: Model) => {
  codeSuggestionsTelemetry.incAcceptCount(model);
};
