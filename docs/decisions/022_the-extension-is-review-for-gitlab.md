# 022 - The extension is Review for GitLab

**Status:** accepted - 2026-11-01
**Status:** project links moved to GitHub by [023](023_the-fork-is-hosted-on-github.md) - 2026-11-01

## Context

[015](015_the-extension-is-published-to-the-marketplace.md) published the
extension as `tranphucbol.jetbrain-gitlab`, displayed as "Jetbrain GitLab".
The Visual Studio Marketplace removed it for impersonation: its name carried a
brand the fork does not own, and nothing on the listing said it was
unofficial.

The decision is constrained by:

- An extension ID cannot be renamed on the Marketplace; a new name is a new
  extension, and its users do not move to it on their own.
- Users' `gitlab.*` settings, keybindings and command IDs must keep working
  after they switch, as they did when 015 left upstream's ID.

## Decision

The extension is `tranphucbol.review-for-gitlab`, displayed as "Review for
GitLab", with the description "Unofficial merge request review for self-hosted
GitLab 13.x, with a side-by-side diff. Not affiliated with GitLab Inc. or
JetBrains s.r.o."

- Code that looks the extension up by ID, and the OAuth redirect URI, use the
  new ID. Commands, views, context keys and `gitlab.*` settings keep upstream's
  names, as 015 decided.
- The README opens with the statement that the extension is unofficial and not
  affiliated with GitLab Inc. or JetBrains s.r.o., and still credits GitLab
  Workflow as the project it is forked from. The listing compares itself to no
  other vendor's product.
- The `.vsix` and the generic package are named `review-for-gitlab-*`.
- Publishing stays as 015 describes it: a protected `X.Y.Z` tag publishes with
  the federated Azure identity, and nothing is stored.
- The version line continues from 0.0.7; [016](016_the-marketplace-extension-starts-at-0-0-1.md)
  still holds for the tags before it.

## Consequences

- Users of `tranphucbol.jetbrain-gitlab` must uninstall it and install the new
  ID; the README and `CHANGELOG.md` say so. Their settings carry over.
- Earlier `.vsix` files and generic packages stay under `jetbrain-gitlab`, and
  the project is still hosted at `gitlab.com/tranphucbol/vscode-jetbrain-gitlab`.
- Revisit when the GitLab project is renamed: the repository, issue and
  release links in `package.json`, the README and `CHANGELOG.md` follow it.

## Alternatives rejected

- **Keep the ID and change only the display name.** The ID is part of the
  listing's URL and of every install command, so the brand would stay visible.
- **Rename the commands, views and settings too.** It changes nothing on the
  listing and breaks every user's settings and keybindings, the cost 015
  already declined.
