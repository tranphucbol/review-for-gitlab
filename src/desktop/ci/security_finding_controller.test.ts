import * as vscode from 'vscode';
import { asMock } from '../test_utils/as_mock';
import { createExtensionContext, securityReport } from '../test_utils/entities';
import { SecurityFindingWebviewController } from './security_finding_controller';

const finding = securityReport.fixed[0];

describe('SecurityFindingWebviewController', () => {
  let controller: SecurityFindingWebviewController;

  beforeEach(async () => {
    asMock(vscode.window.createWebviewPanel).mockImplementation(() => ({
      webview: {},
      onDidDispose: jest.fn(),
      reveal: jest.fn(),
    }));

    controller = new SecurityFindingWebviewController();
    await controller.init(createExtensionContext());
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates and updates panel correctly', () => {
    const panel = controller.open(finding);
    expect(panel.title).toBe(finding.title);

    const webviewHtml = panel.webview.html;
    expect(webviewHtml).toContain(finding.title);
    expect(webviewHtml).toContain(finding.description);
    expect(webviewHtml).toContain(finding.severity);

    controller.open({ ...finding, title: 'test' });
    expect(panel.title).toBe('test');
  });
});
