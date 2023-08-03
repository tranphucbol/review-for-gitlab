export class LegacyApiFallbackConfig {
  #tryAgainAfterTimestamp = 0;

  readonly #retryDelayMS = 60 * 60 * 1000;

  fallbackToModelGateway() {
    this.#tryAgainAfterTimestamp = Date.now() + this.#retryDelayMS;
  }

  shouldUseModelGateway() {
    return Date.now() < this.#tryAgainAfterTimestamp;
  }
}
