import { compareBy } from '../desktop/utils/compare_by';
import { CodeSuggestionsTelemetry, Model, Telemetry } from './code_suggestions_telemetry';

describe('CodeSuggestionsTelemetry', () => {
  let telemetry: CodeSuggestionsTelemetry;

  const codegenModel: Model = {
    engine: 'gitlab-native',
    name: 'codegen-v2-1.0.0',
  };

  const codegenTelemetry: Telemetry = {
    model_name: codegenModel.name,
    model_engine: codegenModel.engine,
    accepts: 0,
    errors: 0,
    requests: 0,
  };

  beforeEach(() => {
    telemetry = new CodeSuggestionsTelemetry();
  });

  it('increases request count', () => {
    telemetry.incRequestCount(codegenModel);

    expect(telemetry.toArray()).toEqual([{ ...codegenTelemetry, requests: 1 }]);
  });

  it('increases accept count', () => {
    telemetry.incAcceptCount(codegenModel);

    expect(telemetry.toArray()).toEqual([{ ...codegenTelemetry, accepts: 1 }]);
  });

  it('increases error count', () => {
    telemetry.incErrorCount(codegenModel);

    expect(telemetry.toArray()).toEqual([{ ...codegenTelemetry, errors: 1 }]);
  });

  it('handles multiple models', () => {
    const bisonModel: Model = {
      engine: 'code-bison',
      name: 'v2-1.0.0',
    };

    telemetry.incRequestCount(codegenModel);
    telemetry.incAcceptCount(codegenModel);

    telemetry.incRequestCount(bisonModel);
    telemetry.incErrorCount(bisonModel);

    expect(telemetry.toArray().sort(compareBy('model_engine'))).toEqual([
      {
        model_engine: bisonModel.engine,
        model_name: bisonModel.name,
        requests: 1,
        errors: 1,
        accepts: 0,
      },
      { ...codegenTelemetry, requests: 1, accepts: 1 },
    ]);
  });
});
