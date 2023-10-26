---
stage: Create
group: Editor Extensions
info: To determine the technical writer assigned to the Stage/Group associated with this page, see https://about.gitlab.com/handbook/product/ux/technical-writing/#assignments
---

# Language server development and debugging

This document explains how to run the Workflow Extension and the [GitLab Language Server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions) side to side, both in debug mode and how to see your changes in Language Server in the extension.

## Linking up the Language Server node module

First, you want to use your local language server project rather than using the published node module. You do that with `npm link`.

1. Go to a folder where you cloned the [GitLab Language Server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions) project.
1. run `npm run bundle` to create the LS bundle file that's used by the Workflow extension
1. run `npm link`
1. Go to the folder with the Workflow Extension project
1. run `npm link @gitlab-org/gitlab-lsp`

_Make sure that the node version in `.tool-versions` is the same in both project, otherwise the link can't be created._

## Running both projects

1. After every change to the Language Server project, you have to run there `npm run bundle` to bundle the latest LS
1. [Start the extension](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/8a6f12ba3ec92ac059856f7e663eb6dc37b6d668/CONTRIBUTING.md#step-4-running-the-extension-in-desktop-vs-code) in debug mode
1. In the workspace where you run the development version of the extension, set the `gitlab.ls.debug` settings to `true`.
   - the debugger occupies port `6010` and so we can only have one debugging session running, if you enable the `gitlab.ls.debug` setting in multiple projects, only one LS can use the port
   - use the workspace settings (as opposed to the user settings) - Command: `Preferences: Open Workspace Settings (JSON)`
1. [Connect debugger to the running Language server](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/-/blob/main/README.md#debugging-the-server)
1. Profit
