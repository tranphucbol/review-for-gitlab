import * as vscode from 'vscode';
import { GitLabTelemetryEnvironmentDesktop } from './gitlab_telemetry_environment_desktop';

describe('GitLabTelemetryEnvironmentDesktop', () => {
  let subject: GitLabTelemetryEnvironmentDesktop;
  describe('isTelemetryEnabled', () => {
    it.each`
      telemetryStatus
      ${true}
      ${false}
    `(
      'returns $telemetryStatus when vscode.env.isTelemetryEnabled is $telemetryStatus',
      ({ telemetryStatus }) => {
        Object.assign(vscode.env, { isTelemetryEnabled: telemetryStatus });
        subject = new GitLabTelemetryEnvironmentDesktop();

        expect(subject.isTelemetryEnabled()).toBe(telemetryStatus);
      },
    );
  });
});
