import { GitLabTelemetryEnvironment } from '../platform/gitlab_telemetry_environment';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { setupTelemetry } from './setup_telemetry';
import { Snowplow } from './snowplow';

describe('setupTelemetry', () => {
  it('initializes snowplow with a GitLabTelemetryEnvironment object', async () => {
    const isTelemetryEnabled = jest.fn();
    const telemetryEnvironment = createFakePartial<GitLabTelemetryEnvironment>({
      isTelemetryEnabled,
    });
    const spy = jest.spyOn(Snowplow, 'getInstance');

    setupTelemetry(telemetryEnvironment);

    expect(spy).toHaveBeenCalled();

    const initializationOptions = spy.mock.calls[0][0];

    [true, false].forEach(telemetryStatus => {
      isTelemetryEnabled.mockReturnValueOnce(telemetryStatus);

      expect(initializationOptions?.enabled()).toBe(telemetryStatus);
    });

    await Snowplow.getInstance().stop();
  });
});
