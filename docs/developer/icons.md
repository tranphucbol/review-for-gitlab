---
stage: Create
group: Ide
info: To determine the technical writer assigned to the Stage/Group associated with this page, see https://about.gitlab.com/handbook/product/ux/technical-writing/#assignments
---

# Extension Icons

## Adding new icons

If you're adding new icons to the extension, you will need to put SVG file named exactly with the name of the new icon in two places:

- [gitlab-org/editor-extensions/gitlab-ide-icons](https://gitlab.com/gitlab-org/editor-extensions/gitlab-ide-icons/-/tree/main/svg/) project
- `src/assets/icons` folder in this folder

Please use `./assets/gitlab_icons.woff` as `fontPath` for the icon in `package.json`. This font will be auto-generated

For example, consider you're adding a new icon to `contributes.icon` section of `package.json`:

```json
{
  "gitlab-new-icon": {
    "description": "GitLab New Icon",
    "default": {
      "fontPath": "./assets/gitlab_icons.woff",
      "fontCharacter": "\\eA05"
    }
  }
}
```

In that case you need to place icon SVG at `src/assts/icons/gitlab-new-icon.svg`.

The build process will fail if one of the referenced icons is missing.

## Updating icons

We've got `check-icons` job in our `.gitlab-ci.yml` CI configuration. This job verifies that all icons are up-to-date with the canonical [gitlab-org/editor-extensions/gitlab-ide-icons](https://gitlab.com/gitlab-org/editor-extensions/gitlab-ide-icons/-/tree/main/svg/) project.

### The `check-icons` job is failing. What should I do?

1. Make sure your repository doesn't have any un-committed changes.
1. Run `./scripts/check_icons_are_up_to_date.sh`.
1. Create a new branch `git checkout -b 2023-07-17-update-extension-icons`.
1. Add the changed icons `git add .`.
1. Commit `git commit -m "chore: update extension icons"`.
1. Push `git push main`
1. Create MR and paste the following snippet as a message:

   ```markdown
   This merge request is the result of running the script to update the extension icons. There is no manual editing in this commit. The content of `src/assets/icons` s synced with the canonical [gitlab-org/editor-extensions/gitlab-ide-icons](https://gitlab.com/gitlab-org/editor-extensions/gitlab-ide-icons/-/tree/main/svg/) project.

   Documentation: https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/docs/developer/icons.md

   A script generated this code change, so this merge request will merge without a second review.

   /label ~"devops::create" ~"group::ide" ~"VS Code" ~"section::dev" ~"type::maintenance"
   ```
