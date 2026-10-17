# 009 - Jira keys link to a configured Jira

**Status:** accepted - 2026-10-17

**Plan:**
[docs/plans/005_jira-issue-keys-link-to-a-configured-jira.md](../plans/005_jira-issue-keys-link-to-a-configured-jira.md)
records the detailed investigation and implementation path.

## Context

The team names Jira issues everywhere: in branch names, merge request titles,
descriptions and review comments. In VS Code those keys were dead text in the
places that mattered most, and nothing opened the issue a branch was for.

GitLab's Jira integration is enabled on this instance and links keys in the
HTML it renders, so the Overview description and the side-by-side notes already
carry links. It does nothing for what the extension renders itself: a native
review comment is the raw Markdown body in a `MarkdownString`, and the Overview
title is plain text.

The decision is constrained by:

- The extension has no Jira credentials and must not get any; a Jira URL is the
  only thing it can know.
- The comment body GitLab stores is what the user edits; it must never gain
  generated links.
- The webviews get no tokens and do every write through the host (decision
  [006](006_side-by-side-diff-is-an-opt-in-webview.md)).
- `src/common/` is untouched; the WebIDE build gains nothing.

## Evidence

Probed on project 12817 with a throwaway merge request, 2026-10-17, VS Code
1.142.0 unless stated.

| Check                                                                           | Result                                                                                                         | Consequence                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GraphQL `bodyHtml`, `titleHtml`, `descriptionHtml` with keys                    | keys, including `SHA-256` and `UTF-8`, are `<a class="gfm gfm-issue">` to Jira; code and fences are left alone | the webview linker must skip existing anchors, never nest them      |
| `services/jira` on the 100 projects the probe token maintains                   | active on all of them; titles of open merge requests elsewhere are linked too                                  | the integration is instance-wide; no project without it to test     |
| Click a plain `<a href>` to Jira in the Overview and the side-by-side diff      | opens the default browser directly                                                                             | no webview-to-host "open" message is needed                         |
| Click a Markdown link in a native comment, `isTrusted` unset                    | VS Code's standard "open the external website?" prompt, then the URL                                           | plain Markdown links are enough; no command links                   |
| `DocumentLinkProvider` for `{ scheme: 'scminput' }` and `git-commit`            | never invoked for the Source Control input box; invoked for a `COMMIT_EDITMSG` file                            | the commit-box links are not built                                  |
| Overview title and Jira items on VS Code 1.84.2 with the `.vsix`                | title linked; clicking it opens the browser; `Jira: …` items shown                                             | works on the oldest VS Code available locally                       |
| Change `gitlab.jira.url` with the Overview and the side-by-side diff open       | both relink, retarget and unlink without reopening                                                             | settings changes are pushed to open webviews, not applied on reopen |
| Change `gitlab.jira.url` during activation, before the extension state is ready | the current branch view refreshed early and raised "ExtensionState has not been initialized."                  | that listener is registered after `extensionState.init()`           |

## Decision

Jira issue keys link to `<gitlab.jira.url>/browse/<KEY>`, and every link is
built from that one setting on the host; the extension never calls Jira.

- **Settings.** `gitlab.jira.url` (empty, the default, turns everything off),
  `gitlab.jira.projectKeys` (an allowlist; also lets lowercase keys in branch
  names match) and `gitlab.jira.ignoredProjectKeys` (prefixes such as `SHA` and
  `UTF`, ignored when an allowlist is set). A URL that is not `http(s)` is
  treated as empty and logged once.
- **One matcher.** `src/desktop/jira/jira_keys.ts` turns the settings into a
  `JiraLinkConfig` — the `…/browse/` prefix and the key pattern — and owns every
  match: prose, branch names, Markdown. The webviews receive that config in a
  `jiraLinks` message and append a matched key to the prefix; they read no
  settings and build no other URL.
- **Native comments.** `GitLabComment.renderBody()` links keys as its last step,
  outside code spans, fences (an unclosed fence runs to the end), indented code,
  links, images, reference definitions, autolinks, inline HTML and bare URLs.
  `setOriginalBody()` is untouched, so editing shows the stored body.
- **Webviews.** The `safe_html` directive links text nodes after sanitising,
  skipping `a`, `code`, `pre`, `kbd`, `script`, `style` and `textarea`; GitLab's
  own links are kept. `JiraText.vue` renders the Overview title. Both webviews
  get the config before their first content and again whenever `gitlab.jira`
  changes, and relink what is on screen.
- **Opening the issue.** `gl.openJiraIssue` takes a key, or finds keys in the
  current branch name, then the title and description of its open merge
  request; one key opens, several give a pick, none says so. With the setting
  empty it offers **Configure Jira URL**. The merge request actions pick adds up
  to five `Open KEY in Jira` items; the current branch view shows up to three
  `Jira: KEY` items.

```text
gitlab.jira.* -> jira_keys.ts -> JiraLinkConfig -+-> renderBody() Markdown links
                                                 +-> jiraLinks message -> safe_html / JiraText
                                                 +-> gl.openJiraIssue, actions pick, branch view -> openUrl
```

## Consequences

- Keys open their issue from a native review comment, the Overview title, the
  current branch and the actions pick, with no credential and no request to
  Jira.
- On this instance GitLab already links the Overview and side-by-side bodies,
  so the webview linker adds nothing there; it matters on an instance or
  project without the integration and is proven only by unit tests.
- The key pattern travels to the webviews as a string, so the host and the
  webviews cannot disagree about what a key is — at the cost of a regular
  expression in a message contract.
- The Source Control input box gets no links: VS Code does not run document
  link providers for it.
- Revisit when VS Code runs link providers for `scminput`, when Jira moves to a
  URL scheme without `/browse/`, or when the instance drops its Jira
  integration.

## Alternatives rejected

- **Ask Jira.** Titles or status from the Jira API would need credentials the
  extension does not have and a request per key; a link needs neither.
- **Rely on GitLab's integration.** It links only the HTML GitLab renders; a
  native comment shows the raw Markdown body, the title is plain text, and
  nothing tells which issue a branch is for.
- **Let the webviews read the settings and match keys themselves.** A second
  matcher would drift from the host's, and the webviews would need settings they
  otherwise never see.
- **Send a webview-to-host "open this key" message.** Plain anchors already open
  the browser from both webviews.
- **Trusted Markdown with command links in native comments.** The standard link
  and its prompt already work; trusting the comment body would trust whatever a
  reviewer wrote.
- **Write the links into the comment GitLab stores.** Editing would show them
  and saving would keep them.
- **A commit-box `DocumentLinkProvider`.** VS Code never invokes it for the
  Source Control input box.
