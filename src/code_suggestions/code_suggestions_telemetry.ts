export const TELEMETRY_HEADER_REQUESTS = 'X-GitLab-CS-Requests';
export const TELEMETRY_HEADER_ERRORS = 'X-GitLab-CS-Errors';
export const TELEMETRY_HEADER_ACCEPTS = 'X-GitLab-CS-Accepts';

export class CodeSuggestionsTelemetry {
  requestCount = 0;

  errorCount = 0;

  acceptCount = 0;

  incRequestCount() {
    this.requestCount += 1;
  }

  incErrorCount() {
    this.errorCount += 1;
  }

  incAcceptCount() {
    this.acceptCount += 1;
  }

  resetCounts() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.acceptCount = 0;
  }
}

export const codeSuggestionsTelemetry = new CodeSuggestionsTelemetry();
