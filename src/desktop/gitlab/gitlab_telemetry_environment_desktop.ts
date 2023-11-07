import * as vscode from 'vscode';
import { GitLabTelemetryEnvironment } from '../../common/platform/gitlab_telemetry_environment';

export class GitLabTelemetryEnvironmentDesktop implements GitLabTelemetryEnvironment {
  // eslint-disable-next-line class-methods-use-this
  isTelemetryEnabled(): boolean {
    return vscode.env.isTelemetryEnabled;
  }
}
