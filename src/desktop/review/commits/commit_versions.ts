import { getGitLabService } from '../../gitlab/get_gitlab_service';
import { CachedMr, mrCache } from '../../gitlab/mr_cache';
import { ProjectInRepository } from '../../gitlab/new_project';
import { ReviewParams } from '../review_uri';

/**
 * fork-only: one commit of a merge request, shaped as a merge request version so the
 * existing diff, position and side-by-side code takes it unchanged. See docs/plans/014.
 */
export interface CommitVersion extends RestMrVersion {
  /** `parentSha..sha`; `..sha` for a root commit */
  scope: string;
  commit: RestCommitDetail;
}

export const toCommitScope = (base: string | undefined, head: string): string =>
  `${base ?? ''}..${head}`;

export const getScope = (version: RestMrVersion): string | undefined =>
  (version as Partial<CommitVersion>).scope;

/** `!42` for the merge request, `a1b2c3d · !42` for one of its commits */
export const diffTitleSuffix = (mr: RestMr, version: RestMrVersion): string =>
  getScope(version) ? `${version.head_commit_sha.slice(0, 7)} · !${mr.iid}` : `!${mr.iid}`;

export const isMergeCommit = (version: CommitVersion): boolean =>
  version.commit.parent_ids.length > 1;

/** A root commit has nothing to compare with, so GitLab can't place a note on it. */
export const isReadOnlyVersion = (version: RestMrVersion): boolean => !version.base_commit_sha;

export const toCommitVersion = (
  base: string | undefined,
  head: string,
  diffs: RestDiffFile[],
  id: number,
): RestMrVersion & { scope: string } => ({
  id,
  base_commit_sha: base ?? '',
  start_commit_sha: base ?? '',
  head_commit_sha: head,
  diffs,
  scope: toCommitScope(base, head),
});

// commits are immutable, so an entry never goes stale
const cache = new Map<string, CommitVersion>();
const cacheKey = (mrId: number, scope: string) => `${mrId}:${scope}`;
const headKey = (mrId: number, sha: string) => `${mrId}:head:${sha}`;

export const getCachedCommitVersion = (mrId: number, scope: string): CommitVersion | undefined =>
  cache.get(cacheKey(mrId, scope));

/** Loads the commit's parents and diff; a merge commit is compared with its first parent. */
export const loadCommitVersion = async (
  mr: RestMr,
  mrVersion: RestMrVersion,
  projectInRepository: ProjectInRepository,
  sha: string,
): Promise<CommitVersion> => {
  const cached = cache.get(headKey(mr.id, sha));
  if (cached) return cached;
  const service = getGitLabService(projectInRepository);
  const [commit, diffs] = await Promise.all([
    service.getCommit(mr.project_id, sha),
    service.getCommitDiff(mr.project_id, sha),
  ]);
  const version: CommitVersion = {
    ...toCommitVersion(commit.parent_ids[0], sha, diffs, mrVersion.id),
    commit,
  };
  cache.set(headKey(mr.id, sha), version);
  cache.set(cacheKey(mr.id, version.scope), version);
  return version;
};

/**
 * The one place a review URI picks its version: the merge request's cached version, or
 * the commit's when the URI carries a scope. Undefined until the sidebar has loaded it.
 */
export const getCachedMrForReviewUri = (
  params: ReviewParams,
  projectInRepository: ProjectInRepository,
): CachedMr | undefined => {
  const cachedMr = mrCache.getMr(params.mrId, projectInRepository);
  if (!cachedMr || !params.scope) return cachedMr;
  const mrVersion = getCachedCommitVersion(params.mrId, params.scope);
  return mrVersion && { mr: cachedMr.mr, mrVersion };
};

export const clearCommitVersionsForTests = (): void => cache.clear();
