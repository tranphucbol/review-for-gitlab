import * as vscode from 'vscode';
import { asMock } from '../test_utils/as_mock';
import { securityReport, projectInRepository, securityReportFinding } from '../test_utils/entities';
import { createFakeFetchFromApi } from '../../common/test_utils/create_fake_fetch_from_api';
import { GitLabService } from '../gitlab/gitlab_service';
import { getSecurityFinding } from '../gitlab/security_findings/api/get_security_finding';
import { getGitLabService } from '../gitlab/get_gitlab_service';
import { createFakePartial } from '../../common/test_utils/create_fake_partial';
import { SecurityFindingWebviewController } from './security_finding_controller';
import { createExtensionContext } from '../../common/test_utils/entities';

jest.mock('../../common/utils/webviews/wait_for_webview');
jest.mock('../../common/utils/webviews/prepare_webview_source', () => ({
  prepareWebviewSource: jest.fn().mockReturnValue('preparedWebviewSource'),
}));
jest.mock('../gitlab/get_gitlab_service');

const finding = securityReport.fixed[0];
const mockAPIRequest = getSecurityFinding(
  projectInRepository.project,
  finding.foundByPipelineIid,
  finding.uuid,
);

describe('SecurityFindingWebviewController', () => {
  let controller: SecurityFindingWebviewController;

  beforeEach(async () => {
    asMock(vscode.window.createWebviewPanel).mockImplementation(() => ({
      webview: {
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
      },
      onDidDispose: jest.fn(),
      reveal: jest.fn(),
    }));

    jest.mocked(getGitLabService).mockImplementation(() =>
      createFakePartial<GitLabService>({
        fetchFromApi: createFakeFetchFromApi({
          request: mockAPIRequest,
          response: securityReportFinding,
        }),
      }),
    );

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
