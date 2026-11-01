# 023 - The fork is hosted on GitHub

**Status:** accepted - 2026-11-01

## Context

[013](013_the-fork-is-hosted-on-gitlab-com.md) moved the fork to
`gitlab.com/tranphucbol/vscode-jetbrain-gitlab`.
[022](022_the-extension-is-review-for-gitlab.md) renamed the extension to
`tranphucbol.review-for-gitlab` after the Marketplace flagged the old name, and
left the project's name behind: the Marketplace page, `package.json` and the
changelog still pointed at a project named after the retired ID.

The project was renamed by moving it rather than renaming it in place. The
maintainer's other extensions are on GitHub and publish to the Marketplace from
GitHub Actions through the same Azure identity, so one host and one pipeline
shape cover all of them.

The decision is constrained by:

- The release flow of [005](005_a-release-tag-publishes-the-vsix-as-a-generic-package.md),
  [014](014_the-release-is-created-with-the-job-token.md) and
  [015](015_the-extension-is-published-to-the-marketplace.md) must survive the
  move: a `vX.Y.Z` tag publishes the VSIX with a checksum and a release, an
  `X.Y.Z` tag publishes to the Marketplace, and no long-lived secret is stored.
- Upstream stays on gitlab.com as `upstream`; only the fork's own commits and
  tags move.
- `scripts/release.mjs` reads the fork's URL from `origin`, and `vsce` rewrites
  relative README links from `package.json`'s `repository`.

## Evidence

| Check                                                                       | Result                                                                                  | Consequence                                                                     |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `git ls-remote --tags` on the old project against the local tags            | 19 fork tags, `v0.0.1` to `v0.1.0` and `v3.101.1` to `v3.107.1`, same commits locally   | Only those tags were pushed; upstream's `v4.x` tags stay off the new project    |
| `gh api repos/tranphucbol/review-for-gitlab/actions/oidc/customization/sub` | `use_immutable_subject: true`                                                           | The Azure federated credential names the owner and repository IDs, not the name |
| `tranphucbol/vscode-search-everywhere` release workflow                     | `azure/login@v2` in a `marketplace` environment, then `vsce publish --azure-credential` | The same shape publishes this extension; no new Azure resource is needed        |
| First pull request run of `.github/workflows/ci.yml`                        | `lint`, `test-unit` and `package` passed on `ubuntu-latest`, Node from `.tool-versions` | The GitLab pipeline's jobs run unchanged on GitHub's hosted runners             |

## Decision

The fork lives at `github.com/tranphucbol/review-for-gitlab`, that repository is
`origin`, and its pipeline is `.github/workflows/ci.yml`. GitLab 13.12 stays the
version the extension must satisfy; only the place the code and its releases
are kept has moved.

- The history moved unchanged: `main` and the 19 fork tags were pushed as they
  were, so every hash and every changelog link resolves on the new host.
  `CHANGELOG.md`, `package.json` and the README point at the new repository.
- `.gitlab-ci.yml` is deleted. `ci.yml` keeps its jobs and their rules: `lint`
  and `test-unit` in parallel, then `package`, which uploads the `.vsix` and its
  `.sha256` as a workflow artifact on every pull request, `main` push and tag.
- A `vX.Y.Z` tag adds `publish`, which creates a GitHub Release with the
  `.vsix` and its checksum attached, using only the workflow's `GITHUB_TOKEN`
  with `contents: write`. The notes are the tag's `CHANGELOG.md` entry; a tag
  with a prerelease part makes a prerelease. A rerun compares any existing
  asset byte for byte and fails rather than replacing it.
- An `X.Y.Z` tag, not a prerelease, also adds `publish-marketplace`. It runs in
  the `marketplace` environment, which only `v*` tags and `main` can deploy to,
  signs in with `azure/login` as the `vsce-publisher` managed identity, and
  runs `vsce publish --azure-credential`. The environment holds the identity's
  client and tenant IDs, neither of which is a secret.
- The identity trusts the repository through a federated credential with
  issuer `https://token.actions.githubusercontent.com` and subject
  `repo:tranphucbol@36811577/review-for-gitlab@1441657367:environment:marketplace`.
  A manual run with `check-publishing` set signs in the same way and runs
  `vsce verify-pat`, without publishing.
- A tag ruleset lets only a repository admin create, move or delete a `v*` tag,
  as protected tags did on GitLab.

## Consequences

- One host and one pipeline shape for all of the maintainer's extensions; the
  Marketplace page's repository and issue links name the extension's own ID.
- Releases before 0.1.1 have no GitHub Release; their VSIX files stay in the
  old project's package registry, and the Marketplace keeps the published ones.
- GitHub Actions has no protected-variable scope; the environment's deployment
  rule and the federated credential's subject do that job.
- `CI_JOB_TOKEN`, the generic package registry and the GitLab federated
  credential no longer take part in a release.
- Revisit if the fork moves again or is taken upstream.

## Alternatives rejected

- **Rename the GitLab project in place.** It fixes the name, but keeps a
  second pipeline dialect to maintain next to the maintainer's other
  extensions.
- **Mirror GitLab to GitHub.** Two places that accept pushes, issues and
  releases, and one of them always stale.
- **Keep `.gitlab-ci.yml` next to the workflow.** A pipeline nothing runs is a
  file that silently stops matching the build.
- **Store a Marketplace personal access token as a secret.** It expires, and it
  is the long-lived secret [015](015_the-extension-is-published-to-the-marketplace.md)
  exists to avoid.
