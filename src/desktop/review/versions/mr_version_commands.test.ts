import * as vscode from 'vscode';
import { InMemoryMemento } from '../../../../test/integration/test_infrastructure/in_memory_memento';
import { resolveTarget } from '../../commands/merge_request_actions/merge_request_actions';
import { currentBranchRefresher } from '../../current_branch_refresher';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { mrCache } from '../../gitlab/mr_cache';
import { asMock } from '../../test_utils/as_mock';
import { mr, mrVersion, projectInRepository } from '../../test_utils/entities';
import { issuableDataProvider } from '../../tree_view/issuable_data_provider';
import { compareMrVersions, markMrAsReviewed } from './mr_version_commands';
import { mrVersionComparisons } from './mr_version_comparison';
import { reviewedVersionStore } from './reviewed_version_store';

jest.mock('../../commands/merge_request_actions/merge_request_actions');
jest.mock('../../current_branch_refresher');
jest.mock('../../gitlab/get_gitlab_service');
jest.mock('../../gitlab/mr_cache');
jest.mock('../../tree_view/issuable_data_provider');

const summary = (id: number, head: string): RestMrVersionSummary => ({
  id,
  head_commit_sha: head,
  base_commit_sha: 'base',
  start_commit_sha: 'base',
  created_at: '2026-10-01T10:00:00Z',
  state: 'collected',
});

describe('merge request version commands', () => {
  const latest = { ...mrVersion, id: 3, head_commit_sha: 'head3' };
  const ref = { mr, projectInRepository, mrVersion: latest };
  let getMrVersions: jest.Mock;

  beforeEach(() => {
    reviewedVersionStore.init(new InMemoryMemento());
    mrVersionComparisons.clear(ref);
    asMock(resolveTarget).mockResolvedValue({ mr, projectInRepository });
    asMock(mrCache.getMr).mockReturnValue({ mr, mrVersion: latest });
    getMrVersions = jest
      .fn()
      .mockResolvedValue([summary(3, 'head3'), summary(2, 'head2'), summary(1, 'head1')]);
    asMock(getGitLabService).mockReturnValue({ getMrVersions });
    asMock(vscode.window.withProgress).mockImplementation((_, task) => task());
  });

  describe('markMrAsReviewed', () => {
    it('remembers the loaded head and refreshes both merge request trees', async () => {
      await markMrAsReviewed();

      expect(reviewedVersionStore.get(projectInRepository.account, mr)?.headSha).toBe('head3');
      expect(issuableDataProvider.refresh).toHaveBeenCalled();
      expect(currentBranchRefresher.refresh).toHaveBeenCalled();
      expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
        'Marked !2000 as reviewed at head3.',
        5000,
      );
    });

    it('does nothing without a merge request', async () => {
      asMock(resolveTarget).mockResolvedValue(undefined);

      await markMrAsReviewed();

      expect(reviewedVersionStore.get(projectInRepository.account, mr)).toBeUndefined();
    });
  });

  describe('compareMrVersions', () => {
    const labelsOf = (call: number) =>
      asMock(vscode.window.showQuickPick).mock.calls[call][0].map(
        (item: vscode.QuickPickItem) => item.label,
      );

    it('picks an older version, then a newer one', async () => {
      await reviewedVersionStore.record(projectInRepository.account, mr, 'head2');
      asMock(vscode.window.showQuickPick)
        .mockImplementationOnce(async items => items[1])
        .mockImplementationOnce(async items => items[0]);

      await compareMrVersions();

      expect(labelsOf(0)).toEqual(['v2', 'v1', 'base']);
      expect(labelsOf(1)).toEqual(['v3', 'v2']);
      expect(asMock(vscode.window.showQuickPick).mock.calls[0][1]).toMatchObject({
        placeHolder: 'Select the older version',
        ignoreFocusOut: true,
      });
      expect(asMock(vscode.window.showQuickPick).mock.calls[0][0][0].description).toContain(
        'your review',
      );
      expect(await mrVersionComparisons.current(ref)).toMatchObject({
        from: { label: 'v1' },
        to: { label: 'v3' },
        picked: true,
      });
    });

    it('goes back to the whole merge request for the base and the latest version', async () => {
      mrVersionComparisons.pick(ref, { fromHead: 'head1', toHead: 'head2' });
      asMock(vscode.window.showQuickPick)
        .mockImplementationOnce(async items => items[items.length - 1])
        .mockImplementationOnce(async items => items[0]);

      await compareMrVersions();

      expect(await mrVersionComparisons.current(ref)).toBeUndefined();
    });

    it('says so when the merge request has one version', async () => {
      // a new latest version, so the versions cached by earlier tests don't apply
      asMock(mrCache.getMr).mockReturnValue({ mr, mrVersion: { ...latest, id: 4 } });
      getMrVersions.mockResolvedValue([summary(4, 'head3')]);

      await compareMrVersions();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        '!2000 has only one version.',
      );
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });
  });
});
