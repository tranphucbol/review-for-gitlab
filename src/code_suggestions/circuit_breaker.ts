export class CircuitBreaker {
  readonly #maxErrorsBeforeBreaking: number;

  readonly #breakTimeMs: number;

  #errorCount = 0;

  #tryAgainAfterTimestamp = 0;

  constructor(maxErrorsBeforeBreaking: number, breakTimeMs: number) {
    this.#maxErrorsBeforeBreaking = maxErrorsBeforeBreaking;
    this.#breakTimeMs = breakTimeMs;
  }

  error() {
    this.#errorCount += 1;
    if (this.#errorCount >= this.#maxErrorsBeforeBreaking) {
      this.#tryAgainAfterTimestamp = Date.now() + this.#breakTimeMs;
    }
  }

  isBreaking() {
    return Date.now() < this.#tryAgainAfterTimestamp;
  }

  success() {
    this.#errorCount = 0;
    this.#tryAgainAfterTimestamp = 0;
  }
}
