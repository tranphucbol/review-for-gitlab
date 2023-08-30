import * as vscode from 'vscode';
import { Snowplow } from './snowplow/snowplow';

export function setupTelemetry(): Snowplow {
  let { isTelemetryEnabled } = vscode.env;
  vscode.env.onDidChangeTelemetryEnabled(() => {
    isTelemetryEnabled = vscode.env.isTelemetryEnabled;
  });

  const snowplow = Snowplow.getInstance({
    appId: 'gitlab_ide_extension',
    endpoint: 'https://snowplow.trx.gitlab.net',
    timeInterval: 5000,
    maxItems: 10,
    enabled: () => isTelemetryEnabled,
  });

  return snowplow;
}
