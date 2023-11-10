import * as vscode from 'vscode';
import { GitLabTelemetryEnvironmentBrowser } from './gitlab_telemetry_environment_browser';
import { WebIDEExtension } from '../common/platform/web_ide';
import { createFakePartial } from '../common/test_utils/create_fake_partial';

describe('GitLabTelemetryEnvironmentBrowser', () => {
  describe('isTelemetryEnabled', () => {
    let subject: GitLabTelemetryEnvironmentBrowser;
    let webIDEExtensionMock: WebIDEExtension;

    beforeEach(async () => {
      webIDEExtensionMock = createFakePartial<WebIDEExtension>({
        isTelemetryEnabled: jest.fn(),
      });
      jest.mocked(vscode.extensions.getExtension).mockReturnValueOnce(
        createFakePartial<vscode.Extension<WebIDEExtension>>({
          exports: webIDEExtensionMock,
        }),
      );
      subject = new GitLabTelemetryEnvironmentBrowser();
    });

    it.each`
      telemetryStatus
      ${true}
      ${false}
    `(
      'returns telemetry $telemetryStatus when the Web IDE extension isTelemetryEnabled returns $telemetryStatus',
      async ({ telemetryStatus }) => {
        jest.mocked(webIDEExtensionMock.isTelemetryEnabled).mockReturnValueOnce(telemetryStatus);

        expect(subject.isTelemetryEnabled()).toBe(telemetryStatus);
      },
    );
  });
});
