import { diffFile, mr, mrVersion, projectInRepository } from '../../test_utils/entities';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { mrCache } from '../../gitlab/mr_cache';
import { asMock } from '../../test_utils/as_mock';
import { buildDiffPosition } from '../diff_position';
import { ReviewParams } from '../review_uri';
import {
  clearCommitVersionsForTests,
  diffTitleSuffix,
  getCachedMrForReviewUri,
  getScope,
  isMergeCommit,
  isReadOnlyVersion,
  loadCommitVersion,
  toCommitVersion,
} from './commit_versions';

jest.mock('../../gitlab/get_gitlab_service');
jest.mock('../../gitlab/mr_cache');

const commit = (id: string, parentIds: string[]): RestCommitDetail => ({
  id,
  short_id: id.slice(0, 8),
  title: `commit ${id}`,
  message: `commit ${id}\n`,
  author_name: 'Jane Doe',
  authored_date: '2026-10-01T10:00:00.000Z',
  created_at: '2026-10-01T10:00:00.000Z',
  parent_ids: parentIds,
});

const params: ReviewParams = {
  path: '/new_file.js',
  exists: true,
  commit: 'c0ffee0',
  repositoryRoot: '/repo',
  projectId: mr.project_id,
  mrId: mr.id,
};

describe('commit versions', () => {
  let service: { getCommit: jest.Mock; getCommitDiff: jest.Mock };

  beforeEach(() => {
    clearCommitVersionsForTests();
    service = {
      getCommit: jest.fn(async (projectId: number, sha: string) => commit(sha, ['parent1'])),
      getCommitDiff: jest.fn().mockResolvedValue([diffFile]),
    };
    asMock(getGitLabService).mockReturnValue(service);
    asMock(mrCache.getMr).mockReturnValue({ mr, mrVersion });
  });

  describe('toCommitVersion', () => {
    it('puts a position on the parent and the commit, on both sides', () => {
      const modified = { ...diffFile, diff: '@@ -1,2 +1,2 @@\n-a\n+b\n c\n' };
      const version = toCommitVersion('parent1', 'c0ffee0', [modified], 3);

      ['old', 'new'].forEach(side => {
        const position = buildDiffPosition(version, modified, side as 'old' | 'new', 1);
        expect(position).toMatchObject({
          baseSha: 'parent1',
          startSha: 'parent1',
          headSha: 'c0ffee0',
        });
      });
    });

    it('scopes a root commit without a base and makes it read-only', () => {
      const version = toCommitVersion(undefined, 'c0ffee0', [diffFile], 3);

      expect(getScope(version)).toBe('..c0ffee0');
      expect(isReadOnlyVersion(version)).toBe(true);
    });
  });

  it('leaves the merge request version unscoped', () => {
    expect(getScope(mrVersion)).toBeUndefined();
    expect(isReadOnlyVersion(mrVersion)).toBe(false);
    expect(diffTitleSuffix(mr, mrVersion)).toBe('!2000');
  });

  describe('loadCommitVersion', () => {
    it('compares the commit with its first parent', async () => {
      service.getCommit.mockResolvedValue(commit('c0ffee0', ['parent1', 'parent2']));

      const version = await loadCommitVersion(mr, mrVersion, projectInRepository, 'c0ffee0');

      expect(service.getCommit).toHaveBeenCalledWith(mr.project_id, 'c0ffee0');
      expect(service.getCommitDiff).toHaveBeenCalledWith(mr.project_id, 'c0ffee0');
      expect(version).toMatchObject({
        base_commit_sha: 'parent1',
        head_commit_sha: 'c0ffee0',
        diffs: [diffFile],
        scope: 'parent1..c0ffee0',
      });
      expect(isMergeCommit(version)).toBe(true);
      expect(diffTitleSuffix(mr, version)).toBe('c0ffee0 · !2000');
    });

    it('asks GitLab once per commit', async () => {
      await loadCommitVersion(mr, mrVersion, projectInRepository, 'c0ffee0');
      await loadCommitVersion(mr, mrVersion, projectInRepository, 'c0ffee0');

      expect(service.getCommit).toHaveBeenCalledTimes(1);
    });

    it('propagates a failure', async () => {
      service.getCommitDiff.mockRejectedValue(new Error('401'));

      await expect(
        loadCommitVersion(mr, mrVersion, projectInRepository, 'c0ffee0'),
      ).rejects.toThrow('401');
    });
  });

  describe('getCachedMrForReviewUri', () => {
    it('returns the merge request version for a URI without a scope', () => {
      expect(getCachedMrForReviewUri(params, projectInRepository)).toEqual({ mr, mrVersion });
    });

    it('returns the commit version for a scoped URI', async () => {
      const version = await loadCommitVersion(mr, mrVersion, projectInRepository, 'c0ffee0');

      expect(
        getCachedMrForReviewUri({ ...params, scope: 'parent1..c0ffee0' }, projectInRepository),
      ).toEqual({ mr, mrVersion: version });
    });

    it('returns nothing for a commit that is not loaded', () => {
      expect(
        getCachedMrForReviewUri({ ...params, scope: 'parent1..c0ffee0' }, projectInRepository),
      ).toBeUndefined();
    });
  });
});
