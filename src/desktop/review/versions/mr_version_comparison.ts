import { FetchError } from '../../errors/fetch_error';
import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { ProjectInRepository } from '../../gitlab/new_project';
import { reviewedVersionStore } from './reviewed_version_store';

/** what the picker calls the target branch, the base of the newer version */
export const BASE_LABEL = 'base';

export const REBASED_MESSAGE =
  'Rebased since your review; some changes may come from the target branch.';

export const READ_ONLY_VERSION_MESSAGE =
  'This version is read-only; comment on the latest version.';

export const VANISHED_MESSAGE = "Your review's version is no longer in this merge request.";

/** One version of a merge request as GitLab's web UI numbers it: the oldest is v1. */
export interface MrVersionChoice {
  label: string;
  versionId: number;
  headSha: string;
  baseSha: string;
  createdAt: string;
  state: string;
  isLatest: boolean;
}

/** A merge request with the latest version the extension loaded for it. */
export interface MrVersionsRef {
  mr: RestMr;
  projectInRepository: ProjectInRepository;
  mrVersion: RestMrVersion;
}

/** The changes between two versions; without `from`, those of `to` against the target branch. */
export interface MrVersionComparison {
  from?: MrVersionChoice;
  to: MrVersionChoice;
  /** chosen in the picker, rather than started at the reviewer's last review */
  picked: boolean;
}

export interface LoadedComparison {
  ref: MrVersionsRef;
  comparison: MrVersionComparison;
  /** base is the older head, head the newer: what the review URIs and the panes show */
  version: RestMrVersion;
  /** GitLab stopped comparing before it finished, so files may be missing */
  compareTimeout: boolean;
}

export const isNotFound = (e: unknown): boolean => e instanceof FetchError && e.status === 404;

/**
 * Newest first, numbered as GitLab numbers them. 13.12 adds a version when the target branch
 * moves, so several can share a head; the newest of them stands for all.
 */
export const toVersionChoices = (versions: RestMrVersionSummary[]): MrVersionChoice[] => {
  const seen = new Set<string>();
  return versions.flatMap((version, index) => {
    if (seen.has(version.head_commit_sha)) return [];
    seen.add(version.head_commit_sha);
    return [
      {
        label: `v${versions.length - index}`,
        versionId: version.id,
        headSha: version.head_commit_sha,
        baseSha: version.base_commit_sha,
        createdAt: version.created_at,
        state: version.state,
        isLatest: index === 0,
      },
    ];
  });
};

export const comparisonLabel = ({ from, to }: MrVersionComparison): string =>
  `${from?.label ?? BASE_LABEL} → ${to.label}`;

export const isRebased = ({ from, to }: MrVersionComparison): boolean =>
  from !== undefined && from.baseSha !== to.baseSha;

/** What the side-by-side view needs to show a loaded comparison. */
export const toDiffComparison = ({ comparison, version }: LoadedComparison) => ({
  version,
  label: comparisonLabel(comparison),
  rebased: isRebased(comparison),
});

/** a version that is `without_files` or `overflow` doesn't list every file it changes */
const listsAllFiles = (choice: MrVersionChoice) =>
  choice.state !== 'without_files' && choice.state !== 'overflow';

/**
 * Keeps the files that either version of the merge request changes. That drops a file only
 * the target branch changed between the two heads, and keeps a change the author reverted.
 * When a version doesn't list all its files, nothing can be dropped safely.
 */
export const filterComparedDiffs = (
  compared: RestDiffFile[],
  versionFiles: (RestDiffFile[] | undefined)[],
): RestDiffFile[] => {
  if (versionFiles.some(files => files === undefined)) return compared;
  const paths = new Set(
    versionFiles.flatMap(files => (files ?? []).flatMap(d => [d.old_path, d.new_path])),
  );
  return compared.filter(d => paths.has(d.old_path) || paths.has(d.new_path));
};

const keyOf = ({ mr, projectInRepository }: Pick<MrVersionsRef, 'mr' | 'projectInRepository'>) =>
  `${projectInRepository.account.id}|${mr.project_id}|${mr.iid}`;

const comparisonKey = (ref: MrVersionsRef, { from, to }: MrVersionComparison) =>
  [
    ref.mrVersion.id,
    ref.mrVersion.head_commit_sha,
    from?.headSha ?? BASE_LABEL,
    to.headSha,
    to.versionId,
  ].join('|');

interface PickedVersions {
  fromHead?: string;
  toHead: string;
}

/**
 * The versions of each merge request, the comparison the reviewer picked for it, and the
 * comparisons loaded so far. Everything is fetched on demand and kept until the merge request
 * has a new version.
 */
export class MrVersionComparisons {
  readonly #versions = new Map<string, { latestId: number; choices: Promise<MrVersionChoice[]> }>();

  readonly #picked = new Map<string, PickedVersions>();

  readonly #loaded = new Map<string, { key: string; loaded: Promise<LoadedComparison> }>();

  /** settled loads, to find the comparison a review URI belongs to */
  readonly #settled = new Map<string, LoadedComparison>();

  async versions(ref: MrVersionsRef): Promise<MrVersionChoice[]> {
    const key = keyOf(ref);
    const cached = this.#versions.get(key);
    if (cached && cached.latestId === ref.mrVersion.id) return cached.choices;
    const choices = getGitLabService(ref.projectInRepository)
      .getMrVersions(ref.mr)
      .then(toVersionChoices);
    this.#versions.set(key, { latestId: ref.mrVersion.id, choices });
    choices.catch(() => this.#versions.delete(key));
    return choices;
  }

  pick(ref: Pick<MrVersionsRef, 'mr' | 'projectInRepository'>, picked: PickedVersions): void {
    this.#picked.set(keyOf(ref), picked);
  }

  clear(ref: Pick<MrVersionsRef, 'mr' | 'projectInRepository'>): void {
    this.#picked.delete(keyOf(ref));
  }

  /**
   * The comparison to show under the merge request: the one picked, or else the changes since
   * the reviewer's last review. `'vanished'` when that review's head is no longer a version.
   */
  async current(ref: MrVersionsRef): Promise<MrVersionComparison | 'vanished' | undefined> {
    const picked = this.#picked.get(keyOf(ref));
    const reviewed = reviewedVersionStore.get(ref.projectInRepository.account, ref.mr);
    const reviewedHead = reviewed?.headSha;
    if (!picked && (!reviewedHead || reviewedHead === ref.mrVersion.head_commit_sha)) {
      return undefined;
    }
    const choices = await this.versions(ref);
    const byHead = (head?: string) => choices.find(c => c.headSha === head);
    if (picked) {
      const to = byHead(picked.toHead);
      const from = picked.fromHead ? byHead(picked.fromHead) : undefined;
      if (to && (from || !picked.fromHead)) return { from, to, picked: true };
      this.clear(ref);
    }
    if (!reviewedHead || reviewedHead === ref.mrVersion.head_commit_sha) return undefined;
    const from = byHead(reviewedHead);
    const to = choices[0];
    if (!from || !to) return 'vanished';
    if (from === to) return undefined;
    return { from, to, picked: false };
  }

  /** The files and commits the comparison shows, loaded once per version of the merge request. */
  async load(ref: MrVersionsRef, comparison: MrVersionComparison): Promise<LoadedComparison> {
    const mrKey = keyOf(ref);
    const key = comparisonKey(ref, comparison);
    const cached = this.#loaded.get(mrKey);
    if (cached?.key === key) return cached.loaded;
    const loaded = MrVersionComparisons.#fetch(ref, comparison);
    this.#loaded.set(mrKey, { key, loaded });
    loaded.then(
      result => this.#settled.set(mrKey, result),
      () => this.#loaded.get(mrKey)?.key === key && this.#loaded.delete(mrKey),
    );
    return loaded;
  }

  static async #fetch(
    ref: MrVersionsRef,
    comparison: MrVersionComparison,
  ): Promise<LoadedComparison> {
    const { mr, projectInRepository, mrVersion } = ref;
    const { from, to } = comparison;
    const service = getGitLabService(projectInRepository);
    const versionOf = async (choice: MrVersionChoice) =>
      choice.headSha === mrVersion.head_commit_sha && choice.versionId === mrVersion.id
        ? mrVersion
        : service.getMrVersion(mr, choice.versionId);
    if (!from) return { ref, comparison, version: await versionOf(to), compareTimeout: false };
    const filesOf = async (choice: MrVersionChoice) =>
      listsAllFiles(choice) ? (await versionOf(choice)).diffs : undefined;
    const [compared, fromFiles, toFiles] = await Promise.all([
      service.compareCommits(mr.project_id, from.headSha, to.headSha),
      filesOf(from),
      filesOf(to),
    ]);
    return {
      ref,
      comparison,
      version: {
        id: to.versionId,
        base_commit_sha: from.headSha,
        start_commit_sha: from.headSha,
        head_commit_sha: to.headSha,
        diffs: filterComparedDiffs(compared.diffs, [fromFiles, toFiles]),
      },
      compareTimeout: Boolean(compared.compare_timeout),
    };
  }

  /** The loaded comparison whose panes are these commits; any base matches when it's unknown. */
  findLoaded(mrId: number, headSha?: string, baseSha?: string): LoadedComparison | undefined {
    return [...this.#settled.values()].find(
      ({ ref, version }) =>
        ref.mr.id === mrId &&
        version.head_commit_sha === headSha &&
        (baseSha === undefined || version.base_commit_sha === baseSha),
    );
  }
}

export const mrVersionComparisons = new MrVersionComparisons();
