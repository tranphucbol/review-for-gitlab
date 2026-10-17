import * as vscode from 'vscode';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { GitLabService } from '../../gitlab/gitlab_service';
import { ProjectInRepository } from '../../gitlab/new_project';
import { gitlabProjectRepository } from '../../gitlab/gitlab_project_repository';
import { mrCache } from '../../gitlab/mr_cache';
import { getTrackingBranchName } from '../../git/get_tracking_branch_name';
import { issuableDataProvider } from '../../tree_view/issuable_data_provider';
import { currentBranchRefresher } from '../../current_branch_refresher';
import { toReviewUri } from '../../review/review_uri';
import { mrDiffPanelController } from '../../review/side_by_side/mr_diff_panel_controller';
import { createFakePartial } from '../../../common/test_utils/create_fake_partial';
import { asMock } from '../../test_utils/as_mock';
import { diffFile, mr, mrVersion } from '../../test_utils/entities';
import { getActiveProjectOrSelectOne } from '../run_with_valid_project';
import { mergeRequestActions } from './merge_request_actions';
import { runAction } from './run_action';
import { createApprovals, createMrDetail } from './test_entities';

jest.mock('../../gitlab/get_gitlab_service');
jest.mock('../../gitlab/gitlab_project_repository');
jest.mock('../../git/get_tracking_branch_name');
jest.mock('../../tree_view/issuable_data_provider');
jest.mock('../../current_branch_refresher');
jest.mock('../../review/side_by_side/mr_diff_panel_controller');
jest.mock('../run_with_valid_project');
jest.mock('./run_action');

describe('mergeRequestActions', () => {
  let service: GitLabService;
  const projectInRepository = createFakePartial<ProjectInRepository>({
    project: { namespaceWithPath: 'group/project' },
    pointer: { repository: { rawRepository: {} } },
  });
  const item = { mr, projectInRepository };
  const detail = createMrDetail();
  const approvals = createApprovals();

  const pickedLabels = () =>
    (asMock(vscode.window.showQuickPick).mock.calls[0][0] as vscode.QuickPickItem[]).map(
      i => i.label,
    );
  const pick = (label: string) =>
    asMock(vscode.window.showQuickPick).mockImplementationOnce(async items =>
      (items as vscode.QuickPickItem[]).find(i => i.label.endsWith(label)),
    );

  beforeEach(() => {
    service = createFakePartial<GitLabService>({
      getMrDetail: jest.fn().mockResolvedValue(detail),
      getMrApprovals: jest.fn().mockResolvedValue(approvals),
      fetchFromApi: jest.fn().mockResolvedValue([mr]),
    });
    asMock(getGitLabService).mockReturnValue(service);
    asMock(runAction).mockResolvedValue(true);
    asMock(mrDiffPanelController.activeTarget).mockReturnValue(undefined);
  });

  describe('resolving the merge request', () => {
    it('uses the merge request of a sidebar item', async () => {
      await mergeRequestActions(item);

      expect(getGitLabService).toHaveBeenCalledWith(projectInRepository);
      expect(service.getMrDetail).toHaveBeenCalledWith(mr);
      expect(service.getMrApprovals).toHaveBeenCalledWith(mr);
    });

    it('uses the cached merge request of a review URI', async () => {
      asMock(gitlabProjectRepository.getProjectOrFail).mockReturnValue(projectInRepository);
      jest.spyOn(mrCache, 'getMr').mockReturnValue({ mr, mrVersion });
      const uri = toReviewUri({
        path: '/a.ts',
        exists: true,
        repositoryRoot: '/repo',
        projectId: mr.project_id,
        mrId: mr.id,
      });

      await mergeRequestActions(uri);

      expect(gitlabProjectRepository.getProjectOrFail).toHaveBeenCalledWith('/repo');
      expect(mrCache.getMr).toHaveBeenCalledWith(mr.id, projectInRepository);
      expect(service.getMrDetail).toHaveBeenCalledWith(mr);
    });

    describe('without an argument', () => {
      beforeEach(() => {
        asMock(getActiveProjectOrSelectOne).mockResolvedValue(projectInRepository);
        asMock(getTrackingBranchName).mockResolvedValue('feature-a');
      });

      it('uses the merge request of the active side-by-side diff', async () => {
        asMock(gitlabProjectRepository.getProjectOrFail).mockReturnValue(projectInRepository);
        asMock(mrDiffPanelController.activeTarget).mockReturnValue({
          mr,
          mrVersion,
          file: diffFile,
          repositoryRoot: '/repo',
        });

        await mergeRequestActions();

        expect(gitlabProjectRepository.getProjectOrFail).toHaveBeenCalledWith('/repo');
        expect(service.fetchFromApi).not.toHaveBeenCalled();
        expect(service.getMrDetail).toHaveBeenCalledWith(mr);
      });

      it('uses the open merge request of the current branch', async () => {
        await mergeRequestActions();

        expect(service.fetchFromApi).toHaveBeenCalled();
        expect(service.getMrDetail).toHaveBeenCalledWith(mr);
      });

      it('says so when the branch has no open merge request', async () => {
        asMock(service.fetchFromApi).mockResolvedValue([]);

        await mergeRequestActions();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          'Branch feature-a has no open merge request in group/project.',
        );
        expect(service.getMrDetail).not.toHaveBeenCalled();
      });

      it('stops when no project is selected', async () => {
        asMock(getActiveProjectOrSelectOne).mockResolvedValue(undefined);

        await mergeRequestActions();

        expect(service.fetchFromApi).not.toHaveBeenCalled();
      });
    });
  });

  it('titles the pick with the state and lists unavailable actions under a separator', async () => {
    asMock(service.getMrApprovals).mockResolvedValue(createApprovals({ user_can_approve: false }));

    await mergeRequestActions(item);

    expect(asMock(vscode.window.showQuickPick).mock.calls[0][1]).toEqual(
      expect.objectContaining({ title: expect.stringMatching(/^!42 Add retries — opened/) }),
    );
    expect(pickedLabels()).toEqual([
      '$(git-merge) Merge…',
      '$(edit) Mark as draft',
      '$(close) Close merge request',
      'Not available',
      '$(check) Approve',
    ]);
  });

  it('runs the picked action and refreshes the views', async () => {
    pick('Approve');

    await mergeRequestActions(item);

    expect(runAction).toHaveBeenCalledWith('approve', item, { detail, approvals });
    expect(issuableDataProvider.refresh).toHaveBeenCalled();
    expect(currentBranchRefresher.refresh).toHaveBeenCalled();
    expect(mrDiffPanelController.refreshPanelsFor).toHaveBeenCalledWith(mr);
  });

  it('does not refresh when the action changed nothing', async () => {
    pick('Approve');
    asMock(runAction).mockResolvedValue(false);

    await mergeRequestActions(item);

    expect(issuableDataProvider.refresh).not.toHaveBeenCalled();
  });

  it('does nothing when the pick is dismissed', async () => {
    asMock(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await mergeRequestActions(item);

    expect(runAction).not.toHaveBeenCalled();
    expect(issuableDataProvider.refresh).not.toHaveBeenCalled();
  });

  it('does nothing when an unavailable action is picked', async () => {
    asMock(service.getMrApprovals).mockResolvedValue(createApprovals({ user_can_approve: false }));
    pick('Approve');

    await mergeRequestActions(item);

    expect(runAction).not.toHaveBeenCalled();
  });

  it('reloads and shows the pick again on refresh', async () => {
    asMock(service.getMrDetail).mockResolvedValue(createMrDetail({ merge_status: 'checking' }));
    pick('Refresh');

    await mergeRequestActions(item);

    expect(service.getMrDetail).toHaveBeenCalledTimes(2);
    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(2);
    expect(runAction).not.toHaveBeenCalled();
  });

  it('says there is nothing to do on a merged merge request', async () => {
    asMock(service.getMrDetail).mockResolvedValue(createMrDetail({ state: 'merged' }));

    await mergeRequestActions(item);

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      '!42 is merged; there is nothing to do on it.',
    );
  });
});
