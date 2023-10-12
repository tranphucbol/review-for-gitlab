import { Snowplow } from '../common/snowplow/snowplow';
import { snowplowBaseOptions } from '../common/snowplow/snowplow_options';
import { getWebIdeExports } from './get_web_ide_exports';

export function setupTelemetry(): Snowplow {
  const webIdeExtension = getWebIdeExports();

  const snowplow = Snowplow.getInstance({
    ...snowplowBaseOptions,
    enabled: () => gitlabPlatform,
  });

  return snowplow;
}
