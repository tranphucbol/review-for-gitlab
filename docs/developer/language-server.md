---
stage: Create
group: Editor Extensions
info: To determine the technical writer assigned to the Stage/Group associated with this page, see https://about.gitlab.com/handbook/product/ux/technical-writing/#assignments
---

# Language server development and debugging

This document explains how to run the Workflow Extension and the
[GitLab Language Server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions)
side-by-side. It covers both debug mode, and how to see your changes in
Language Server in the extension.

## Update your VS Code settings

To work with Language Server, add these properties to your VSCode's user or
workspace settings (`settings.json`):

```json
{
  "gitlab.featureFlags.languageServer": true,
  "gitlab.aiAssistedCodeSuggestions.enabled": true
}
```

## Link the Language Server node module

Use [`yalc`](https://github.com/wclr/yalc) to link to your local language server project, rather than using the published NPM module.
Avoid using `npm link` as it causes issues where the language server is using a different version of the npm dependency
than the extension.

Prerequisite:

- Check `.tool-versions` in your Workflow Extension project and the Language
  Server project. Ensure the Node version is the same in both projects. The link
  cannot be created if you have a version mismatch.
- Install `yalc` globally running `npm i yalc -g`

1. Go to a folder where you cloned the
   [GitLab Language Server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions) project.
1. Run `npm run bundle && npm run compile` to create the Language Server bundle file used by the Workflow extension.
1. Run `asdf install`
1. Run `yalc publish`
1. Go to the folder with the Workflow Extension project
1. Run `yalc add @gitlab-org/gitlab-lsp`

## Run both projects

1. After every change to the Language Server project, run `npm run bundle` to
   bundle the latest Language Server version and `yalc push` to update the LS dependency in the extension.
1. [Start the extension](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/8a6f12ba3ec92ac059856f7e663eb6dc37b6d668/CONTRIBUTING.md#step-4-running-the-extension-in-desktop-vs-code)
   in debug mode.
1. In the workspace where you run the development version of the extension, set the `gitlab.ls.debug` settings to `true`.
   - The debugger uses port `6010`, so we can only have one debugging session running.
     If you enable the `gitlab.ls.debug` setting in multiple projects, only one Language Server can use the port.
   - Use the workspace settings (as opposed to the user settings).
     The command: `Preferences: Open Workspace Settings (JSON)`.
1. [Connect debugger to the running Language server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/-/blob/main/README.md#debugging-the-server)
1. Profit!
1. Once you're done with testing run `yalc remove @gitlab-org/gitlab-lsp`.
