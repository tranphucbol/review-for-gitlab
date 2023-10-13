import { Snowplow } from './snowplow';
import { snowplowBaseOptions } from './snowplow_options';
import type { GitLabTelemetryEnvironment } from '../platform/gitlab_telemetry_environment';

export function setupTelemetry(telemetryEnv: GitLabTelemetryEnvironment): Snowplow {
  const snowplow = Snowplow.getInstance({
    ...snowplowBaseOptions,
    enabled: () => telemetryEnv.isTelemetryEnabled(),
  });

  return snowplow;
}
