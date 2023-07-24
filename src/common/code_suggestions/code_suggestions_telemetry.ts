export interface Model {
  engine: string;
  name: string;
  lang?: string;
}

export interface Telemetry {
  model_engine: string;
  model_name: string;
  lang?: string;
  requests: number;
  accepts: number;
  errors: number;
}

type ModelKey = string;

const DELIMITER = '\u200B'; // zero width space minimises chance of conflict with model name or engine characters

const modelToKey = (m: Model): ModelKey => `${m.engine}${DELIMITER}${m.name}${DELIMITER}${m.lang}`;

const createEmptyTelemetry = (m: Model): Telemetry => ({
  model_engine: m.engine,
  model_name: m.name,
  lang: m.lang,
  requests: 0,
  accepts: 0,
  errors: 0,
});

export class CodeSuggestionsTelemetry {
  #telemetryByModel: Record<ModelKey, Telemetry> = {};

  incRequestCount(model: Model) {
    this.#getTelemetry(model).requests += 1;
  }

  incErrorCount(model: Model) {
    this.#getTelemetry(model).errors += 1;
  }

  incAcceptCount(model: Model) {
    this.#getTelemetry(model).accepts += 1;
  }

  resetCounts() {
    this.#telemetryByModel = {};
  }

  #getTelemetry(model: Model) {
    if (this.#telemetryByModel[modelToKey(model)] === undefined) {
      this.#telemetryByModel[modelToKey(model)] = createEmptyTelemetry(model);
    }
    return this.#telemetryByModel[modelToKey(model)];
  }

  toArray() {
    return Object.values(this.#telemetryByModel);
  }
}

export const codeSuggestionsTelemetry = new CodeSuggestionsTelemetry();
