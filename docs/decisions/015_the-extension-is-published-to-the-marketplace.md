# 015 - The extension is published to the Marketplace

**Status:** accepted - 2026-10-18

## Context

Until now a release reached users only as a `.vsix` in this project's generic
package registry ([005](005_a-release-tag-publishes-the-vsix-as-a-generic-package.md)),
installed by hand and never updated by VS Code.
[002](002_the-pipeline-runs-only-what-this-instance-can.md) dropped
Marketplace publishing because the fork had no credentials for it.

The extension still carried upstream's identity, `GitLab.gitlab-workflow`.
Only GitLab can publish under the `GitLab` publisher, and the display name
"GitLab Workflow" is already taken on the Marketplace.

Azure DevOps personal access tokens, the usual `VSCE_PAT`, are long-lived
secrets, and global ones are retired on 2026-12-01. `vsce` can instead sign in
with any Azure credential that is a member of the publisher.

## Evidence

| Check                                                                                   | Result                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `sub` of a gitlab.com ID token in a protected tag pipeline, after the setting below     | `project_id:87777232:ref_type:tag:ref_protected:true`   |
| Scratch protected tag pipeline: `vsce verify-pat --azure-credential tranphucbol`        | "The Personal Access Token verification succeeded"      |
| The same job used `AZURE_FEDERATED_TOKEN_FILE`, `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` | `DefaultAzureCredential` signs in without the Azure CLI |

The scratch tag and its pipeline were deleted afterwards.

## Decision

The extension is `tranphucbol.jetbrain-gitlab`, displayed as "Jetbrain GitLab".
Code that looks the extension up by ID, and the OAuth redirect URI that VS Code
routes by ID, use the new one. Commands, views, the `gitlab.*` settings and the
user agent keep upstream's names, so upstream's code and the user's settings
carry over unchanged.

A tag `vX.Y.Z` runs `publish-marketplace`, which publishes the `.vsix` that
`package` built with `vsce publish --azure-credential`. Nothing is stored:

- The Azure managed identity `vsce-publisher` (resource group `vsce-publish`),
  already a member of the `tranphucbol` publisher, has a federated credential
  for issuer `https://gitlab.com`, audience `api://AzureADTokenExchange` and
  subject `project_id:87777232:ref_type:tag:ref_protected:true`.
- The project sets `ci_id_token_sub_claim_components` to `project_id`,
  `ref_type` and `ref_protected`. The default subject ends in the tag name,
  which changes every release, and Azure matches the subject exactly. The
  project ID survives a rename of the project.
- Tags matching `v*` are protected: only Maintainers create them.
- `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` are protected, unmasked project
  variables. They identify the identity; they are not secrets.

A prerelease tag publishes only to the package registry: the Marketplace
accepts `X.Y.Z` versions and nothing else.

## Consequences

- VS Code installs and updates the extension from the Marketplace; the package
  registry and its Release remain for prerelease builds and direct downloads.
- Anyone who can create a protected `v*` tag can publish. An unprotected ref,
  a branch or a merge request pipeline gets a token Azure does not accept.
- The `.vsix` and the generic package are now named `jetbrain-gitlab-*`;
  earlier releases stay under `gitlab-workflow`.
- Installing it next to GitLab Workflow clashes, since both register the same
  commands, views and settings. The README says so rather than renaming them.
- OAuth sign-in to GitLab.com uses upstream's OAuth application, whose
  redirect URI names `gitlab.gitlab-workflow`; it no longer completes. A
  personal access token works as before. An OAuth application of the fork's
  own, with its client ID in `OAUTH_CLIENT_ID`, would restore it.
- The publish job uses `vsce` 3, which needs Node 20 or later, so it runs on
  `node:22-slim` while the rest of the pipeline stays on Node 18.

## Alternatives rejected

- **A `VSCE_PAT` CI variable.** A long-lived secret to create and rotate, and
  the kind Azure DevOps is retiring.
- **The default `sub` with one federated credential per release.** Every
  release would need an Azure change before its tag.
- **Rename every command, view and setting.** It would let both extensions be
  installed together, but it touches hundreds of upstream lines and every
  user's settings.
