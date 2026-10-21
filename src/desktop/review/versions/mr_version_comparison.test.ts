import { InMemoryMemento } from '../../../../test/integration/test_infrastructure/in_memory_memento';
import { FetchError } from '../../errors/fetch_error';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { asMock } from '../../test_utils/as_mock';
import { diffFile, mr, mrVersion, projectInRepository } from '../../test_utils/entities';
import {
  MrVersionComparisons,
  comparisonLabel,
  filterComparedDiffs,
  isNotFound,
  isRebased,
  toVersionChoices,
} from './mr_version_comparison';
import { reviewedVersionStore } from './reviewed_version_store';

jest.mock('../../gitlab/get_gitlab_service');

const summary = (
  id: number,
  head: string,
  base = 'base1',
  state = 'collected',
): RestMrVersionSummary => ({
  id,
  head_commit_sha: head,
  base_commit_sha: base,
  start_commit_sha: base,
  created_at: `2026-10-0${id}T10:00:00Z`,
  state,
});

const file = (path: string, oldPath = path): RestDiffFile => ({
  ...diffFile,
  old_path: oldPath,
  new_path: path,
  renamed_file: oldPath !== path,
});

// newest first, as GitLab lists them; v3 and v4 share a head because the target branch moved
const versions = [
  summary(5, 'head5', 'base2'),
  summary(4, 'head3', 'base2'),
  summary(3, 'head3'),
  summary(2, 'head2'),
  summary(1, 'head1'),
];

const latest: RestMrVersion = {
  ...mrVersion,
  id: 5,
  head_commit_sha: 'head5',
  base_commit_sha: 'base2',
  start_commit_sha: 'base2',
  diffs: [file('a.ts'), file('b.ts')],
};

const ref = { mr, projectInRepository, mrVersion: latest };

describe('toVersionChoices', () => {
  it('numbers versions as GitLab does and keeps the newest of those sharing a head', () => {
    expect(toVersionChoices(versions).map(c => [c.label, c.versionId, c.isLatest])).toEqual([
      ['v5', 5, true],
      ['v4', 4, false],
      ['v2', 2, false],
      ['v1', 1, false],
    ]);
  });
});

describe('comparisonLabel and isRebased', () => {
  const [v5, v4, v2] = toVersionChoices(versions);

  it('labels a comparison by its versions, or the base when it starts at the target branch', () => {
    expect(comparisonLabel({ from: v2, to: v5, picked: false })).toBe('v2 → v5');
    expect(comparisonLabel({ to: v4, picked: true })).toBe('base → v4');
  });

  it('calls a comparison rebased when the two versions have different bases', () => {
    expect(isRebased({ from: v2, to: v5, picked: false })).toBe(true);
    expect(isRebased({ from: v4, to: v5, picked: false })).toBe(false);
    expect(isRebased({ to: v5, picked: true })).toBe(false);
  });
});

describe('filterComparedDiffs', () => {
  const compared = [file('a.ts'), file('target-only.ts'), file('renamed.ts', 'b.ts')];

  it('keeps the files either version changes, by old or new path', () => {
    expect(filterComparedDiffs(compared, [[file('a.ts')], [file('b.ts')]])).toEqual([
      compared[0],
      compared[2],
    ]);
  });

  it('keeps every file when a version does not list all of its files', () => {
    expect(filterComparedDiffs(compared, [[file('a.ts')], undefined])).toEqual(compared);
  });
});

describe('isNotFound', () => {
  it('is true only for a 404', () => {
    const fetchError = (status: number) =>
      new FetchError({ status, url: 'https://example.com' } as Response, 'comparison');
    expect(isNotFound(fetchError(404))).toBe(true);
    expect(isNotFound(fetchError(401))).toBe(false);
    expect(isNotFound(new Error('offline'))).toBe(false);
  });
});

describe('MrVersionComparisons', () => {
  let comparisons: MrVersionComparisons;
  let service: {
    getMrVersions: jest.Mock;
    getMrVersion: jest.Mock;
    compareCommits: jest.Mock;
  };

  const markReviewed = (headSha: string) =>
    reviewedVersionStore.record(projectInRepository.account, mr, headSha);

  beforeEach(() => {
    reviewedVersionStore.init(new InMemoryMemento());
    comparisons = new MrVersionComparisons();
    service = {
      getMrVersions: jest.fn().mockResolvedValue(versions),
      getMrVersion: jest.fn(async (_mr: RestMr, id: number) => ({
        ...latest,
        id,
        diffs: [file('a.ts'), file('old-only.ts')],
      })),
      compareCommits: jest.fn().mockResolvedValue({
        diffs: [file('a.ts'), file('old-only.ts'), file('target-only.ts')],
        compare_timeout: false,
      }),
    };
    asMock(getGitLabService).mockReturnValue(service);
  });

  describe('current', () => {
    it('is nothing without a review, and fetches no versions', async () => {
      expect(await comparisons.current(ref)).toBeUndefined();
      expect(service.getMrVersions).not.toHaveBeenCalled();
    });

    it('is nothing when the review is of the latest head', async () => {
      await markReviewed('head5');

      expect(await comparisons.current(ref)).toBeUndefined();
      expect(service.getMrVersions).not.toHaveBeenCalled();
    });

    it('compares the reviewed version with the latest', async () => {
      await markReviewed('head2');

      const current = await comparisons.current(ref);

      expect(current).toMatchObject({ from: { label: 'v2' }, to: { label: 'v5' }, picked: false });
    });

    it("is 'vanished' when the reviewed head is no longer a version", async () => {
      await markReviewed('force-pushed-away');

      expect(await comparisons.current(ref)).toBe('vanished');
    });

    it('prefers the picked comparison, and falls back when its versions are gone', async () => {
      await markReviewed('head2');
      comparisons.pick(ref, { toHead: 'head3' });

      expect(await comparisons.current(ref)).toMatchObject({ to: { label: 'v4' }, picked: true });

      comparisons.pick(ref, { fromHead: 'gone', toHead: 'head5' });

      expect(await comparisons.current(ref)).toMatchObject({ from: { label: 'v2' } });
    });

    it('forgets the pick when cleared', async () => {
      comparisons.pick(ref, { fromHead: 'head1', toHead: 'head3' });
      comparisons.clear(ref);

      expect(await comparisons.current(ref)).toBeUndefined();
    });

    it('fetches the versions once per latest version', async () => {
      await markReviewed('head2');

      await comparisons.current(ref);
      await comparisons.current(ref);
      await comparisons.current({ ...ref, mrVersion: { ...latest, id: 6 } });

      expect(service.getMrVersions).toHaveBeenCalledTimes(2);
    });

    it('fetches the versions again after a failure', async () => {
      await markReviewed('head2');
      service.getMrVersions.mockRejectedValueOnce(new Error('offline'));

      await expect(comparisons.current(ref)).rejects.toThrow('offline');
      expect(await comparisons.current(ref)).toMatchObject({ from: { label: 'v2' } });
    });
  });

  describe('load', () => {
    const [v5, v4, v2] = toVersionChoices(versions);

    it('builds a version from the older head to the newer one with the filtered files', async () => {
      const loaded = await comparisons.load(ref, { from: v2, to: v5, picked: false });

      expect(service.compareCommits).toHaveBeenCalledWith(mr.project_id, 'head2', 'head5');
      expect(service.getMrVersion).toHaveBeenCalledWith(mr, 2);
      expect(service.getMrVersion).not.toHaveBeenCalledWith(mr, 5);
      expect(loaded.version).toEqual({
        id: 5,
        base_commit_sha: 'head2',
        start_commit_sha: 'head2',
        head_commit_sha: 'head5',
        diffs: [file('a.ts'), file('old-only.ts')],
      });
      expect(loaded.compareTimeout).toBe(false);
    });

    it("doesn't filter by a version that lists no files", async () => {
      const withoutFiles = { ...v2, state: 'without_files' };

      const loaded = await comparisons.load(ref, { from: withoutFiles, to: v5, picked: false });

      expect(service.getMrVersion).not.toHaveBeenCalled();
      expect(loaded.version.diffs.map(d => d.new_path)).toContain('target-only.ts');
    });

    it('reports a comparison GitLab stopped early', async () => {
      service.compareCommits.mockResolvedValue({ diffs: [], compare_timeout: true });

      const loaded = await comparisons.load(ref, { from: v2, to: v5, picked: false });

      expect(loaded.compareTimeout).toBe(true);
    });

    it('shows the real version when the comparison starts at the base', async () => {
      const loaded = await comparisons.load(ref, { to: v4, picked: true });

      expect(service.compareCommits).not.toHaveBeenCalled();
      expect(service.getMrVersion).toHaveBeenCalledWith(mr, 4);
      expect(loaded.version.id).toBe(4);
    });

    it('reuses the loaded latest version', async () => {
      const loaded = await comparisons.load(ref, { to: v5, picked: true });

      expect(service.getMrVersion).not.toHaveBeenCalled();
      expect(loaded.version).toBe(latest);
    });

    it('loads a comparison once and finds it by its commits', async () => {
      const comparison = { from: v2, to: v5, picked: false };
      await comparisons.load(ref, comparison);
      await comparisons.load(ref, comparison);

      expect(service.compareCommits).toHaveBeenCalledTimes(1);
      expect(comparisons.findLoaded(mr.id, 'head5', 'head2')?.comparison).toBe(comparison);
      expect(comparisons.findLoaded(mr.id, 'head5')?.comparison).toBe(comparison);
      expect(comparisons.findLoaded(mr.id, 'head5', 'base2')).toBeUndefined();
      expect(comparisons.findLoaded(mr.id + 1, 'head5')).toBeUndefined();
    });

    it('loads again after a failure', async () => {
      const comparison = { from: v2, to: v5, picked: false };
      service.compareCommits.mockRejectedValueOnce(new Error('offline'));

      await expect(comparisons.load(ref, comparison)).rejects.toThrow('offline');
      await comparisons.load(ref, comparison);

      expect(service.compareCommits).toHaveBeenCalledTimes(2);
    });
  });
});
