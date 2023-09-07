import * as vscode from 'vscode';
import { Snowplow } from '../common/snowplow/snowplow';
import { snowplowBaseOptions } from '../common/snowplow/snowplow_options';

export function setupTelemetry(): Snowplow {
  let { isTelemetryEnabled } = vscode.env;

  vscode.env.onDidChangeTelemetryEnabled(() => {
    isTelemetryEnabled = vscode.env.isTelemetryEnabled;
  });

  const snowplow = Snowplow.getInstance({
    ...snowplowBaseOptions,
    enabled: () => isTelemetryEnabled,
  });

  return snowplow;
}
