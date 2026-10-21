import { toReviewUri } from '../review/review_uri';
import { getCachedMrForReviewUri } from '../review/commits/commit_versions';
import { gitlabProjectRepository } from '../gitlab/gitlab_project_repository';
import { mrDiffPanelController } from '../review/side_by_side/mr_diff_panel_controller';
import { diffFile, mr, mrVersion, projectInRepository } from '../test_utils/entities';
import { openReviewUriSideBySide } from './open_mr_file_side_by_side';

jest.mock('../gitlab/gitlab_project_repository');
jest.mock('../review/commits/commit_versions');
jest.mock('../review/side_by_side/mr_diff_panel_controller');

describe('openReviewUriSideBySide', () => {
  const threadUri = (commit: string, path: string) =>
    toReviewUri({
      path,
      exists: true,
      commit,
      repositoryRoot: '/repo',
      projectId: mr.project_id,
      mrId: mr.id,
    });

  beforeEach(() => {
    jest.mocked(gitlabProjectRepository.getProjectOrFail).mockReturnValue(projectInRepository);
    jest.mocked(getCachedMrForReviewUri).mockReturnValue({ mr, mrVersion });
  });

  it('opens a thread on the head on its line of the new side', async () => {
    await openReviewUriSideBySide(threadUri(mrVersion.head_commit_sha, diffFile.new_path), 7);

    expect(mrDiffPanelController.open).toHaveBeenCalledWith(
      expect.objectContaining({ file: diffFile, comparison: undefined }),
      { side: 'new', line: 7 },
    );
  });

  it('opens a thread on the base on its line of the old side', async () => {
    await openReviewUriSideBySide(threadUri(mrVersion.base_commit_sha, diffFile.old_path), 3);

    expect(mrDiffPanelController.open).toHaveBeenCalledWith(
      expect.objectContaining({ file: diffFile, comparison: undefined }),
      { side: 'old', line: 3 },
    );
  });

  it('refuses a file the merge request does not change', async () => {
    await expect(
      openReviewUriSideBySide(threadUri(mrVersion.head_commit_sha, 'other.js'), 1),
    ).rejects.toThrow('other.js is not in the merge request.');
  });
});
