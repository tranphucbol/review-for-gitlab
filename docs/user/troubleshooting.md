---
stage: Create
group: Editor
info: To determine the technical writer assigned to the Stage/Group associated with this page, see https://about.gitlab.com/handbook/product/ux/technical-writing/#assignments
---

# Troubleshooting the GitLab extension

## Settings for self-signed certificates

To use self-signed certificates to connect to your GitLab instance, configure them using the following settings. These are community contributed because the GitLab team uses a public CA.

These settings don't work with [`http.proxy` setting for VS Code](https://code.visualstudio.com/docs/setup/network#_legacy-proxy-server-support) (see [open issue](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/314)).

**`gitlab.ca`** _(required: false, default: null)_

_Deprecated. Please see [the SSL setup guide](https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/docs/user/ssl.md) for more information on how to set up your self-signed CA._

**`gitlab.cert`** _(required: false, default: null)_

**Unsupported** - See [&6244](https://gitlab.com/groups/gitlab-org/-/epics/6244). _If your self-managed GitLab instance requires a custom cert/key pair you would probably need to set this option in to point your certificate file. Please also see `gitlab.certKey` option._

**`gitlab.certKey`** _(required: false, default: null)_

**Unsupported** - See [&6244](https://gitlab.com/groups/gitlab-org/-/epics/6244). _If your self-managed GitLab instance requires a custom cert/key pair you would probably need to set this option in to point your certificate key file. Please also see `gitlab.cert` option._

**`gitlab.ignoreCertificateErrors`** _(required: false, default: false)_

**Unsupported** - See [&6244](https://gitlab.com/groups/gitlab-org/-/epics/6244). _If you are using a self-managed GitLab instance with no SSL certificate or having certificate issues and unable to use the extension you may want to set this option to `true` to ignore certificate errors._

## Disable code suggestions

By default, code completion is enabled and usable as long as you
[have access to the Code Suggestions](https://docs.gitlab.com/ee/user/project/repository/code_suggestions/#start-using-code-suggestions).

If you would like to disable code completion:

1. On the left sidebar, select **Extensions > GitLab Workflow**.
1. Click the **Manage** cogwheel icon (next to "Uninstall" button), and then select **Extension Settings**.
1. In **GitLab > AI Assisted Code Suggestions**, disable the **Enable code completion** checkbox.

## Disable streaming

By default, code generation streams AI-generated code. When streaming is
enabled, the suggested code is generated and sent to your editor incrementally rather than
waiting for the full code snippet to be complete before sending the suggestions.
This allows for a more interactive and responsive experience.

If you prefer to only see code generation results printed in their entirety, you can turn off streaming.
Disabling streaming means that code generation requests may be _perceived_
as taking longer to resolve. To disable streaming:

1. Edit your `settings.json` file.
1. Add this line, or edit it if it already exists, to disable code suggestions streaming:

   ```json
   "gitlab.featureFlags.streamCodeGenerations": false,
   ```

1. Save your changes.
