# 013 - The fork is hosted on gitlab.com

**Status:** accepted - 2026-10-18
**Status:** `CI_GIT_TOKEN` made unnecessary by [014](014_the-release-is-created-with-the-job-token.md) - 2026-10-18
**Status:** superseded by [023](023_the-fork-is-hosted-on-github.md) - 2026-11-01

## Context

The fork was developed on a private GitLab 13.12 instance, in a project that
only people with access to that instance could reach. Its features are not tied
to that instance: every one of them works against any GitLab from 13.6 up, and
the one configurable link target, Jira, is off until `gitlab.jira.url` is set.

## Decision

The fork lives at `gitlab.com/tranphucbol/vscode-jetbrain-gitlab`, and that
project is `origin`. GitLab 13.12 stays the version the extension must satisfy;
only the place the code is kept has moved.

- The history was carried over from `v3.101.1` onwards, rewritten once before
  the first push: the fork's commits carry the maintainer's public identity,
  merge commits no longer cite merge requests of the old project, and internal
  host names in files became `gitlab.com/tranphucbol/vscode-jetbrain-gitlab` or
  `jira.example.com`. Upstream's commits and tags, up to and including
  `v3.101.1`, are untouched and keep their signatures.
- The fork's release tags were moved to their rewritten commits, so every tag
  builds the tree it built before.
- `CHANGELOG.md` links point at the new project. `scripts/release.mjs` already
  takes the fork's URL from `origin`, so it needed no change.
- The pipeline in `.gitlab-ci.yml` is unchanged; it uses no runner tags and no
  instance-specific includes, so it runs on gitlab.com's shared runners as it
  did on 13.12. The tag pipeline needs a new masked `CI_GIT_TOKEN` there.

## Consequences

- Anyone can read, fork and report against the fork without access to a
  private network.
- Commit hashes changed for every fork commit. Older clones and the old
  project's merge requests refer to hashes that no longer exist here.
- Release artifacts published before the move stay in the old project's
  package registry; new releases publish here.
- Revisit if the fork moves again or is taken upstream.

## Alternatives rejected

- **Push the old history unchanged.** It would publish internal host names and
  an employee identity in every commit.
- **Squash the fork into one commit on `v3.101.1`.** It would lose the history
  that the decision records and the changelog refer to.
- **A GitLab fork of upstream.** A fork relationship invites merge requests
  against `gitlab-org/gitlab-vscode-extension`, which this fork is not meant to
  send.
