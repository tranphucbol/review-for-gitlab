import * as vscode from 'vscode';
import { issuableController } from '../issuable_controller';
import { MrItemModel } from '../tree_view/items/mr_item_model';
import { mr, projectInRepository } from '../test_utils/entities';
import { reloadOverview } from './reload_overview';

jest.mock('../issuable_controller');
jest.mock('../gitlab/mr_cache', () => ({
  mrCache: { reloadMr: jest.fn().mockResolvedValue({ mrVersion: { diffs: [] } }) },
}));
jest.mock('../gitlab/get_gitlab_service', () => ({
  getGitLabService: () => ({
    getDiscussions: jest.fn().mockResolvedValue([]),
    canUserCommentOnMr: jest.fn().mockResolvedValue(false),
  }),
}));

describe('reloadOverview', () => {
  beforeEach(() => {
    jest
      .mocked(vscode.comments.createCommentController)
      .mockReturnValue({ dispose: jest.fn() } as unknown as vscode.CommentController);
  });

  it("reloads the merge request of the sidebar's Overview item", async () => {
    const [overviewItem] = await new MrItemModel(mr, projectInRepository).getChildren();

    await reloadOverview(overviewItem);

    expect(issuableController.reloadOverview).toHaveBeenCalledWith(
      mr,
      projectInRepository.pointer.repository.rootFsPath,
    );
    expect(issuableController.reloadActiveOverview).not.toHaveBeenCalled();
  });

  it('reloads the active Overview from its context menu', async () => {
    await reloadOverview({ webview: 'glWorkflow' });

    expect(issuableController.reloadActiveOverview).toHaveBeenCalled();
    expect(issuableController.reloadOverview).not.toHaveBeenCalled();
  });

  it('reloads the active Overview from the command palette', async () => {
    await reloadOverview();

    expect(issuableController.reloadActiveOverview).toHaveBeenCalled();
  });
});
