import { codeCompletionTelemetry } from '../completion/code_completion_telemetry';

// Used for telemetry
export const codeSuggestionAccepted = async () => {
  codeCompletionTelemetry.incAcceptCount();
};
