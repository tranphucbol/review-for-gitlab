# 016 - The Marketplace extension starts at 0.0.1

**Status:** accepted - 2026-10-18

## Context

Fork releases up to v3.107.1 continued upstream's numbering from v3.101.1.
They were built as `GitLab.gitlab-workflow`, the ID of GitLab's own extension.
[015](015_the-extension-is-published-to-the-marketplace.md) gave the fork its
own ID, `tranphucbol.jetbrain-gitlab`, and nothing has been published under it
yet.

The Marketplace never compares versions across extension IDs, so the new
extension does not need to continue the old numbers. Its first release can
say that it is new.

## Decision

`tranphucbol.jetbrain-gitlab` starts at 0.0.1 and counts from there.

The tags v3.101.1 to v3.107.1, with their Releases and generic packages, stay
where they are. `scripts/release.mjs` leaves that range out when it looks for
the latest release, so `patch`, `minor` and `major` count from the new line.
It still refuses a version whose tag already exists.

## Consequences

- A `.vsix` of 3.101.2 to 3.107.1 installed by hand carries the old ID. It is
  a different extension from the Marketplace one, not an older version of it,
  so VS Code does not replace it. Uninstall it first.
- A copy of `tranphucbol.jetbrain-gitlab` 3.107.1 built from source before
  this record has a higher version than the Marketplace releases, so VS Code
  never updates it. Uninstall it, then install from the Marketplace.
- `CHANGELOG.md` puts 0.0.1 above 3.107.1. Its compare link starts at
  v3.107.1, the last tag before it, so it lists the changes since then.
- The tag names v3.101.2 to v3.107.1 cannot be reused. If the new line ever
  reaches 3.101, the next free version is 3.107.2.

## Alternatives rejected

- **Continue at 3.108.0.** It keeps one sequence of numbers. But it implies
  an upgrade path from the old builds that does not exist, since they are a
  different extension.
- **Delete the old tags and Releases.** It frees the range, but it removes
  downloads that people may have installed from.
