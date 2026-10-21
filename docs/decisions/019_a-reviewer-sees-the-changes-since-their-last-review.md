# 019 - A reviewer sees the changes since their last review

**Status:** accepted - 2026-10-21

**Plan:** [docs/plans/013_changes-since-last-review.md](../plans/013_changes-since-last-review.md)
records the detailed investigation and implementation path.

## Context

`GitLabService.getMrDiff()` read only the newest entry of a merge request's
versions, so after the author pushed again a reviewer could only reread the
whole merge request. GitLab's web UI offers "Compare with version N"; the
extension had nothing like it.

The decision is constrained by:

- The instance is GitLab 13.12 CE. It has no per-user "reviewed" state and no
  route that diffs two merge request versions; it does have the versions list,
  each version's base, head and start SHAs, and `repository/compare`.
- A new comment must be positioned against a real merge request version with
  `buildDiffPosition()`; positions on an older version could not be verified
  without writing to the instance.
- The side-by-side diff is opt-in and must leave the native review alone
  (decisions 006 and 007).
- VS Code shows a comment thread only in an editor whose URI equals the
  thread's.

## Evidence

| Check (GitLab 13.12.10, VS Code 1.142.0)                | Result                                                                             | Consequence                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET .../merge_requests/:iid/versions`                  | Newest first; `id`, three SHAs, `created_at`, `state`, `real_size`                 | The picker and the record need no other route                    |
| Versions of one open merge request                      | Consecutive versions share a head when only the target branch moved                | Versions with the same head collapse into the newest             |
| Older versions of closed merge requests                 | `state: without_files`, detail has no diffs                                        | The file filter skips a side it can't read                       |
| `GET .../repository/compare?from&to&straight=true`      | 200; `diffs` have the `RestDiffFile` shape, plus `compare_timeout`                 | An interdiff is a compare of two heads                           |
| Compare across a rebase                                 | 1 of 1 files, or 39 of 51, came only from the target branch                        | Keep only files in either version's own diff                     |
| Old heads after rebases                                 | `repository/commits/:sha` still 200                                                | An old head's files can still be read                            |
| Existing threads in the native diff, before this change | None rendered, not even on the latest version; the side-by-side viewer showed them | Thread URIs lacked the `change` that diff URIs carry; fixed here |

## Decision

A reviewer marks a merge request as reviewed, and from then on the merge
request lists the files changed since that version; any two versions can also
be compared on request. Everything lives in `src/desktop/review/versions/`,
except the small seams listed below.

- **The record is local.** `globalState` key `gitlab.reviewedVersions`, keyed by
  account (instance and user), project and merge request IID, holding the head
  SHA and the time; at most 500 entries, the oldest dropped. Nothing is sent to
  GitLab.
- **It advances only when the reviewer says so:** **GitLab: Mark as Reviewed**
  records the head the reviewer loaded, not GitLab's current one, and a
  successful Approve in **Merge Request Actions** records the SHA it sent.
- **A comparison is a synthetic version** `{ base = start = older head, head =
newer head, diffs }` built from `GitLabService.compareCommits()`, so
  `ChangedFileItem`, `gl-review` URIs and both viewers show it unchanged. Files
  are kept only if either version's own diff lists them, which drops
  target-branch files after a rebase; a side whose version is `without_files`
  or `overflow` is not filtered. `getMrDiff()` keeps its signature, now built
  from `getMrVersions()` and `getMrVersion()`.
- **The tree shows one folder** between the Overview and the full file list:
  `Changes Since Your Review (v3 → v5)`, or `Comparing v2 → v5` after
  **Compare Merge Request Versions…**, which has an inline **Clear Version
  Comparison**. The merge request item reads `updated since your review`.
  Versions are numbered as GitLab numbers them, oldest first.
- **Comments are new only where the position is known.** A comparison ending at
  the latest head accepts new comments on its right side, positioned against
  the real latest version with the unchanged `buildDiffPosition()`. Every other
  side is read-only: `CommentingRangeProvider` offers no range for a commit
  other than the latest base or head, and `createNewComment` refuses one.
- **A thread URI carries the diff's `change`.** Thread and diff URIs both take
  it from the latest version's diff for that path, `modified` when the path is
  not in it, so a thread shows in every diff of its commit, as upstream has done
  since `763b823d`.
- **The side-by-side diff gains one optional field.** `MrDiffTarget.comparison`
  selects the text it reads, its panel key and title include the comparison,
  and `DiffFileModel.comparison { label, rebased }` is the only change to
  `messages.ts`. Local change buttons are off in a comparison.
- **Failures degrade.** A 404 from the versions or compare route hides the
  folder; a recorded head no longer in the merge request shows `Your review's
version is no longer in this merge request.`; a rebase says so in a tooltip
  and banner. 401, 5xx and network failures go through `handleError()` as
  every other review request does (decision 001).

```text
Mark as Reviewed | Approve -> gitlab.reviewedVersions[account|project|iid] = head
expand merge request -> versions -> record or picked pair
  -> compareCommits(older head, newer head) + both versions' files
  -> synthetic version -> ChangedFileItem -> native diff | side-by-side
```

## Consequences

- A reviewer rereads only what changed, in either viewer, and existing threads
  now show in the native diff.
- Expanding a comparison costs one compare call and up to two version detail
  calls, cached until the merge request reloads.
- The record is per machine; another machine starts without one.
- Inside a kept file, hunks can still include target-branch changes after a
  rebase, and a comparison's tab badge shows the merge request's change type.
- Revisit when the instance is upgraded to a GitLab that diffs versions itself
  or stores a reviewer's progress, or when commenting on an older version is
  needed.

## Alternatives rejected

- **Raw compare without a filter.** Across a rebase it listed mostly
  target-branch files.
- **Range-diff of the two versions' patches.** Needs both versions' full diffs,
  which closed and overflowing merge requests don't have, and an engine the
  fork would carry alone.
- **`workspaceState`.** Loses the record when the same merge request is
  reviewed from another checkout or worktree.
- **Advance the record on open, or to GitLab's current head.** Marks pushes the
  reviewer never saw.
- **Store "reviewed" on GitLab** as a note, label or award. Visible to
  everyone, and 13.12 has no per-user field for it.
- **Drop `change` from diff URIs** to match threads. Loses the tab's change
  badge, which upstream added on purpose.
