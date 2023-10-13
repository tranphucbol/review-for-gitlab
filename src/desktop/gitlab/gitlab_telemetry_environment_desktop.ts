import * as vscode from 'vscode';
import { GitLabTelemetryEnvironment } from '../../common/platform/gitlab_telemetry_environment';

export class GitLabTelemetryEnvironmentDesktop
  implements GitLabTelemetryEnvironment, vscode.Disposable
{
  #isTelemetryEnabled: boolean;

  #disposable: vscode.Disposable;

  constructor() {
    this.#isTelemetryEnabled = vscode.env.isTelemetryEnabled;

    this.#disposable = vscode.env.onDidChangeTelemetryEnabled(() => {
      this.#isTelemetryEnabled = vscode.env.isTelemetryEnabled;
    });
  }

  isTelemetryEnabled(): boolean {
    return this.#isTelemetryEnabled;
  }

  // TODO: Do we want to actually have something listen to this disposable? We should probably initialize this in the entrypoint.
  dispose() {
    this.#disposable.dispose();
  }
}
