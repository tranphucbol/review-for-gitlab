---
stage: Create
group: Editor
info: To determine the technical writer assigned to the Stage/Group associated with this page, see https://about.gitlab.com/handbook/product/ux/technical-writing/#assignments
---

# Release process

We release irregularly (see the dates in the [CHANGELOG](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/CHANGELOG.md)).

We release when there is a fix or user facing feature that will provide value to the users.

If there are multiple features/fixes, we try to release no more than once per week. This is because part of the release is a manual process.

If you are not a maintainer, ask [one of the maintainers](https://gitlab-org.gitlab.io/gitlab-roulette/?currentProject=gitlab-vscode-extension&mode=show&hidden=reviewer) to release the extension.

## Perform release

This process is recorded in a YouTube video: [GitLab Workflow VS Code Extension - Release and Rollback](https://www.youtube.com/watch?v=anW0R9AtH5k).

Perform the following steps to release a new version of the extension.

1. (Optional.) Do a quick test of the extension in your local development. At this stage, you
   are only verifying there is no complete failure of the extension.
1. Update the package version in `npm version <type>`. This automatically generates a changelog entry. Specify the `type` as:
   - `patch` - if you only released bug fixes
   - `minor` - if you released any new `feature: `
   - `major` - we haven't changed major version yet, do this if you introduce severe breaking changes
1. If there have been community contributions:

   1. Manually add attribution to the `CHANGELOG.md` and `CONTRIBUTORS.md`. For example:

      ```plaintext
      (Implemented|Fixed) by [@flood4life](https://gitlab.com/flood4life) with [MR !90](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/90) 👍
      ```

1. Run the command `git push origin main` and `git push origin v3.65.0` (assuming you created version `3.65.0`).
1. Trigger the **Publish** steps (`publish_marketplace` and `publish_open_vsx`) on the tag pipeline that you created by pushing the new tag.
1. When the extension updates in your VS Code, check that the extension works.
1. Add a message to our `#f_vscode_extension` slack channel (replace `3.0.0` with the released version):

   ```plaintext
   :vscode:  [GitLab Workflow](https://marketplace.visualstudio.com/items?itemName=gitlab.gitlab-workflow) `3.0.0` has been released :rocket:
   See [CHANGELOG.md](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/CHANGELOG.md).
   ```

## Rollback

This process is recorded in a YouTube video: [GitLab Workflow VS Code Extension - Release and Rollback - YouTube](https://www.youtube.com/watch?v=anW0R9AtH5k&t=956s).

You released a critical issue and you need to return to a working version. Don't panic.

1. Rollback

   1. Assuming that the faulty version is `3.65.0` and the one before that worked well is `3.64.0`
   1. Checkout the tag of the latest working version `git checkout v3.64.0`
   1. Create a new version by incrementing `patch` version on the **faulty** version and push the tag: `npm version 3.65.1`
      - You are releasing `3.65.1` because that will be the latest available version (replacing `3.65.0`). `3.65.1` will be virtually identical to `3.64.0`.
   1. Push the new tag `git push origin v3.65.1`
   1. Trigger the **Publish** steps (`publish_marketplace` and `publish_open_vsx`) on the tag pipeline that you created by pushing the new tag.
   1. **Relax.** The marketplaces will release the change in a few minutes.
   1. Verify the rollback version works.

1. Update `CHANGELOG.md` (you'll create an entry like [this one](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/CHANGELOG.md#3682-2023-07-13))

   1. Make sure you still have the rollback tag checked out `git checkout v3.65.1`
   1. Copy the empty version header from the `CHANGELOG.md`

      ```md
      ## [3.65.1](https://gitlab.com/gitlab-org/gitlab-vscode-extension/compare/v3.64.0...v3.65.1) (2023-07-13)
      ```

   1. Checkout `main`: `git checkout main`
   1. Add the empty header to the `CHANGELOG.md` and add a line about this being a rollback release. Your result should look similar to:

      ```md
      ## [3.65.1](https://gitlab.com/gitlab-org/gitlab-vscode-extension/compare/v3.64.0...v3.65.1) (2023-07-13)

      This is a rollback release because `3.65.0` broke > **add the reason here** <. This version is identical to `3.64.0`.
      ```

   1. Commit `git add . && git ci -m "chore: update changelog with rollback release"`
   1. Push `git push`

1. You are done.

This new tag and commit are detached from `main` branch and are not to be merged to `main`. The side effect is that when you make the next release from `main`, you need to **manually specify the version** (`npm version 3.65.2`), otherwise `npm version patch` results in the already-released `3.65.1`.

## Access tokens for Marketplaces

_This section applies once a year when the Microsoft VS Code Marketplace token automatically expires._

Our [CI/CD jobs](https://gitlab.com/gitlab-org/gitlab-vscode-extension/blob/e80e5798dbac5944ebaa52dc0dc2cb861509588e/.gitlab-ci.yml#L110-124) use the access tokens for publishing packaged extension to market places.

### How to generate tokens

#### Open VSX

1. Log in to [github.com](https://github.com/) with `GitHub vscode account`
   credentials from the "VS Code Extension" 1Password Vault.
1. Log in to [open-vsx.org](https://open-vsx.org/) with the GitHub account.
1. Go to the [Access Tokens Settings page](https://open-vsx.org/user-settings/tokens).
1. Create a new token.

#### Microsoft VS Code Marketplace

1. Sign in to [Microsoft Azure](https://azure.microsoft.com/) with `VScode Marketplace`
   credentials from the "VS Code Extension" 1Password Vault.
1. Go to **Personal Access Tokens**.
   ([Official VS Code publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token)).
1. You can either:
   - Extend the expiration date of an existing token. **This solution is the best one when you receive token expiration email.**
   - Generate a new token. Assign it the least privileges possible - it probably only
     needs **Marketplace - publish**.
