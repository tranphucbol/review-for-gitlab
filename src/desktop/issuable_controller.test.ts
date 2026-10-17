import * as vscode from 'vscode';
import { createExtensionContext } from '../common/test_utils/entities';
import { createFakePartial } from '../common/test_utils/create_fake_partial';
import { getGitLabService } from './gitlab/get_gitlab_service';
import { GitLabService } from './gitlab/gitlab_service';
import { gitlabProjectRepository } from './gitlab/gitlab_project_repository';
import { issue, mr, projectInRepository } from './test_utils/entities';
import { waitForWebview } from '../common/utils/webviews/wait_for_webview';
import { issuableController, MR_OVERVIEW_ACTIVE_CONTEXT } from './issuable_controller';

jest.mock('../common/utils/webviews/prepare_webview_source', () => ({
  prepareWebviewSource: jest.fn().mockResolvedValue('preparedWebviewSource'),
}));
jest.mock('../common/utils/webviews/wait_for_webview', () => ({
  waitForWebview: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./gitlab/get_gitlab_service');
jest.mock('./gitlab/gitlab_project_repository');

describe('issuableController', () => {
  let gitlabService: GitLabService;
  let panels: vscode.WebviewPanel[];

  beforeEach(() => {
    panels = [];
    jest.mocked(vscode.window.createWebviewPanel).mockImplementation(() => {
      const panel = createFakePartial<vscode.WebviewPanel>({
        active: true,
        webview: createFakePartial<vscode.Webview>({
          onDidReceiveMessage: jest.fn(),
          postMessage: jest.fn().mockResolvedValue(true),
        }),
        onDidDispose: jest.fn(),
        onDidChangeViewState: jest.fn(),
        reveal: jest.fn(),
      });
      panels.push(panel);
      return panel;
    });
    jest.mocked(gitlabProjectRepository.getProjectOrFail).mockReturnValue(projectInRepository);
    gitlabService = createFakePartial<GitLabService>({
      getDiscussionsAndLabelEvents: jest.fn().mockResolvedValue([]),
      getMrDetail: jest.fn().mockResolvedValue({ ...mr, state: 'merged' }),
    });
    jest.mocked(getGitLabService).mockReturnValue(gitlabService);
    issuableController.init(createExtensionContext());
    issuableController.openedPanels = {};
  });

  describe('for the merge request actions', () => {
    it('marks an active merge request Overview so it shows the actions button', async () => {
      await issuableController.open(mr, '/repo');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        MR_OVERVIEW_ACTIVE_CONTEXT,
        true,
      );
    });

    it('does not mark an issue Overview', async () => {
      await issuableController.open(issue, '/repo');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        MR_OVERVIEW_ACTIVE_CONTEXT,
        false,
      );
    });

    it('returns the merge request of the active Overview', async () => {
      await issuableController.open(mr, '/repo');

      expect(issuableController.activeMergeRequest()).toEqual({ mr, repositoryRoot: '/repo' });
    });

    it('returns nothing for an issue or an inactive Overview', async () => {
      await issuableController.open(issue, '/repo');
      expect(issuableController.activeMergeRequest()).toBeUndefined();

      issuableController.openedPanels = {};
      await issuableController.open(mr, '/repo');
      Object.assign(panels[1], { active: false });
      expect(issuableController.activeMergeRequest()).toBeUndefined();
    });

    it('reloads the Overview of the changed merge request only', async () => {
      await issuableController.open(mr, '/repo');
      await issuableController.open(issue, '/repo');
      jest.mocked(panels[0].webview.postMessage).mockClear();

      await issuableController.refreshMergeRequest(mr);

      expect(gitlabService.getMrDetail).toHaveBeenCalledTimes(1);
      expect(gitlabService.getMrDetail).toHaveBeenCalledWith(mr);
      expect(panels[0].webview.postMessage).toHaveBeenCalledWith({
        type: 'issuableFetch',
        issuable: { ...mr, state: 'merged' },
        discussions: [],
      });
      expect(issuableController.activeMergeRequest()?.mr).toEqual({ ...mr, state: 'merged' });
    });

    it('posts to a loaded Overview without waiting for it to initialize again', async () => {
      await issuableController.open(mr, '/repo');
      Object.assign(panels[0], { active: false });
      jest.mocked(waitForWebview).mockClear();
      jest.mocked(panels[0].webview.postMessage).mockClear();

      await issuableController.refreshMergeRequest(mr);

      expect(waitForWebview).not.toHaveBeenCalled();
      expect(panels[0].webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'issuableFetch' }),
      );
    });
  });
});
