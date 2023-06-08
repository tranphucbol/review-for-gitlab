export class CodeCompletionTelemetry {
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

export const codeCompletionTelemetry = new CodeCompletionTelemetry();
