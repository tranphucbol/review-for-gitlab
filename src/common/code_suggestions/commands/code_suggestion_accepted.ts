import { Model, codeSuggestionsTelemetry } from '../code_suggestions_telemetry';

export const COMMAND_CODE_SUGGESTION_ACCEPTED = 'gl.codeSuggestionAccepted';
// Used for telemetry
export const codeSuggestionAccepted = async (model: Model) => {
  codeSuggestionsTelemetry.incAcceptCount(model);
};
