import * as vscode from 'vscode';
import { asMock } from '../test_utils/as_mock';
import {
  securityReport,
  projectInRepository,
} from '../test_utils/entities';
import { SecurityFindingWebviewController } from './security_finding_controller';
import { createExtensionContext } from '../../common/test_utils/entities';

jest.mock('../../common/utils/webviews/wait_for_webview');
jest.mock('../../common/utils/webviews/prepare_webview_source', () => ({
  prepareWebviewSource: jest.fn().mockReturnValue('preparedWebviewSource'),
}));

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

  it('creates and updates panel correctly', async () => {
    const panel = await controller.open(finding, projectInRepository);
    expect(panel.title).toBe(finding.title);

    const webviewHtml = panel.webview.html;
    expect(webviewHtml).toBe('preparedWebviewSource');
  });
});
