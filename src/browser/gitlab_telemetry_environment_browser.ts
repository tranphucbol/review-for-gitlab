import * as vscode from 'vscode';
import { GitLabTelemetryEnvironment } from '../common/platform/gitlab_telemetry_environment';
import { WebIDEExtension } from '../common/platform/web_ide';

export class GitLabTelemetryEnvironmentBrowser implements GitLabTelemetryEnvironment {
  readonly #webIdeExtension: WebIDEExtension | undefined;

  constructor() {
    this.#webIdeExtension =
      vscode.extensions.getExtension<WebIDEExtension>('gitlab.gitlab-web-ide')?.exports;
  }

  isTelemetryEnabled(): boolean {
    return this.#webIdeExtension?.isTelemetryEnabled() || false;
  }
}
