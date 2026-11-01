# 005 - A release tag publishes the VSIX as a generic package

**Status:** accepted - 2026-09-26
**Status:** release token replaced by `CI_JOB_TOKEN` by [014](014_the-release-is-created-with-the-job-token.md) - 2026-10-18
**Status:** Marketplace publishing added by [015](015_the-extension-is-published-to-the-marketplace.md) - 2026-10-18
**Status:** generic package and GitLab Release replaced by a GitHub Release by [023](023_the-fork-is-hosted-on-github.md) - 2026-11-01

## Context

[002](002_the-pipeline-runs-only-what-this-instance-can.md) left the `package`
job's artifact as the fork's only distribution. A job artifact is a poor
release: it expires after a year, it is found by browsing pipelines, and
nothing ties it to a version, a changelog entry, or a checksum. Cutting a
release was also a manual edit of the `CHANGELOG.md` entry that `npm version`
writes with gitlab.com links.

The Edith CLI (`pe/misc/edith-cli` on the same instance) already publishes
releases from a tag pipeline: a generic package holds the archive and its
checksum, and a GitLab Release links them.

The decision is constrained by:

- The instance is GitLab 13.12. The generic package registry
  (`PUT /projects/:id/packages/generic/:name/:version/:file`) and the Releases
  API both exist there; the registry accepts `CI_JOB_TOKEN`, but creating a
  Release needs a token with `api` scope.
- Nothing is published outside this instance: no Marketplace, no Open VSX
  ([002](002_the-pipeline-runs-only-what-this-instance-can.md)).
- The fork's `CHANGELOG.md` entry must say it is a fork release and link to
  this fork (AGENTS.md, "A fork release says it is one").

## Evidence

| Check                                                                                      | Result                                                                                  | Consequence                                                     |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `POST /projects/:id/ci/lint` on the new `.gitlab-ci.yml`                                   | valid                                                                                   | The pipeline uses only syntax 13.12 accepts                     |
| The `publish` release-body script run locally for `v3.101.2`                               | Body holds the CHANGELOG.md fork entry, the install section and both package links      | Release notes come from the entry the release commit wrote      |
| The same script for a version with no entry                                                | Falls back to `git log` since the previous tag                                          | A tag cut by hand still gets notes                              |
| `upload()` against a local mock registry: fresh, retried, changed bytes, unreachable       | Uploads; accepts the identical file; fails; fails                                       | A retried job is safe, and a package is never silently replaced |
| `scripts/release.mjs` in a sandbox clone pushing to a local bare repository                | Writes the fork entry, commits `chore(release): X`, pushes `main` and the annotated tag | The helper does the whole AGENTS.md release rule                |
| The same helper on a dirty tree, another branch, `main` behind origin, a version not newer | Refuses each before changing anything                                                   | A release is always cut from the pushed tip of `main`           |
| `GET /projects/:id/releases/:tag` on 13.12 for a tag with no release                       | 403, not 404                                                                            | `publish` looks for the tag in the release list instead         |
| Scratch tag pipeline on the real instance, then the `publish` job retried                  | Both files uploaded, Release created, download matched its checksum; retry changed none | The whole tag path works here; deleted afterwards               |

## Decision

A `vX.Y.Z` tag pipeline publishes the VSIX and its SHA-256 checksum to this
project's generic package registry and creates a GitLab Release that links
them.

- `package` writes `<vsix>.sha256` next to the VSIX and, on a tag, fails unless
  the tag is `v` plus `package.json`'s version, so the published file name and
  the tag agree.
- `publish` runs only on a semantic-version tag. It uploads to
  `packages/generic/gitlab-workflow/<version>/` with `CI_JOB_TOKEN`. A file
  already there is accepted only when it is byte-for-byte this build's; any
  other status fails the job.
- The Release description is the tag's `CHANGELOG.md` entry, falling back to
  `git log` since the previous tag, followed by install commands. It is
  created with the masked `CI_GIT_TOKEN` project variable (`api` scope), and
  skipped when the Release already exists. Without the variable the job fails.
- `scripts/release.mjs` cuts the release on `main`: it runs `npm version`,
  rewrites the new entry's links to `origin` and repeats the previous entry's
  "Fork release" paragraph, then commits, tags and pushes `main` and the tag
  atomically after a confirmation. Declining leaves the changes staged and
  prints the remaining commands.

```text
release.mjs -> chore(release) commit + vX.Y.Z tag -> package (vsix, sha256)
            -> publish -> generic package -> GitLab Release (links)
```

## Consequences

- A release has a permanent, versioned download and a checksum; the job
  artifact still exists for branch and merge request builds.
- Installing needs a token with read access to this private project; the
  Release lists the `curl` commands.
- The project needs a masked `CI_GIT_TOKEN` variable, and its owner's access
  decides who can publish.
- A pushed tag cannot be republished with different bytes; a fix is a new
  version.
- Revisit when the instance allows `CI_JOB_TOKEN` to create Releases, or when
  the extension is published to a marketplace.

## Alternatives rejected

- **Keep the job artifact as the release.** It expires, has no checksum, and is
  tied to a pipeline, not a version.
- **Create the Release with the `release:` keyword.** It needs the
  `release-cli` binary, which `node:18-slim` does not have, so a second image
  and job; one `curl` call to the Releases API does the same in the job that
  already has the files.
- **Release notes from `git log` only.** The CHANGELOG.md entry is already
  written and edited for each fork release; the log is only a fallback.
- **Tag by hand.** The CHANGELOG.md link rewrite and the version check are the
  steps most often forgotten, and the helper does them the same way each time.
