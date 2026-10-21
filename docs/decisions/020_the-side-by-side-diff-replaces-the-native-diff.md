# 020 - The side-by-side diff replaces the native diff

**Status:** accepted - 2026-10-21

## Context

Decision [006](006_side-by-side-diff-is-an-opt-in-webview.md) shipped the
side-by-side webview behind `gitlab.mergeRequestDiff.viewer`, with the native
`vscode.diff` review as the default, so the new view could earn its place. It
did, and the two reviews side by side became the problem: a reviewer who chose
the webview still landed in VS Code's own comment widget whenever they clicked a
thread in the built-in **Comments** panel, because that panel knows only the
native comment threads and opens their `gl-review://` URI in a plain text
editor. The same discussion then looked like two different products.

The decision is constrained by:

- The **Comments** panel is VS Code's, and it lists only threads made by a
  `CommentController`. Removing the native threads empties the panel.
- No API intercepts a click in that panel. What an extension can see is the tab
  it opens: `window.tabGroups.onDidChangeTabs` reports a `TabInputText` with
  the thread's URI, and the editor that follows has the thread's line selected.
- The webview cannot show every file: a binary file or one larger than
  `MAX_FILE_BYTES` gets an error page, and images have no text to diff.
- Upstream's native review code is most of what a rebase carries. Deleting it
  makes every rebase a conflict.

## Decision

Every changed file opens in the side-by-side view; the native diff is a
fallback, not a choice.

- **No setting.** `gitlab.mergeRequestDiff.viewer`, the "Open in Side-by-Side
  View" context menu and diff title button, and the toolbar's "Open native diff"
  button are gone. A changed file in the sidebar, in a commit or in a
  comparison of two versions opens `gl.openMrFileSideBySide`.
- **The native diff stays where the view can't go.** A modified image still
  opens `vscode.diff`, and the error page for a binary or oversized file keeps
  its "Open native diff" button.
- **The Comments panel keeps its list.** The native threads are still created,
  unchanged, so the panel lists every discussion. `registerReviewTabRedirect()`
  watches for a plain tab of a `gl-review://` URI; it takes the line from the
  editor that opens with it, opens the side-by-side view of that file on that
  line (`{ command: 'reveal' }`, sent after the discussions so their cards have
  taken their height), and closes the plain tab. A thread on the version's base
  commit is revealed on the old side, any other on the new side. A diff tab is
  never touched, and if the view fails to open the plain tab stays, so the
  comment is still readable.
- **Opening a review file on purpose is announced.** Go to Source of a side
  with no local file opens the `gl-review://` URI in a plain editor on purpose;
  `expectPlainReviewEditor()` marks the URI for a second so the redirect lets
  it be.
- **Upstream's review code stays.** The comment controllers, `vscode.diff`
  commands and review URIs are untouched; only the sidebar's command and the
  new redirect differ from upstream.

```text
Comments panel click -> VS Code opens gl-review:// in a text tab
  -> registerReviewTabRedirect -> openReviewUriSideBySide(uri, line)
  -> MrDiffPanelController.open(target, { side, line }) -> 'reveal'
  -> close the text tab
```

## Consequences

- Every reviewer sees one review UI, whichever way they reach a discussion.
- Clicking a thread in the Comments panel flashes the plain editor for as long
  as the side-by-side view takes to open.
- A thread whose file the view can't show still opens, then lands on the error
  page with its "Open native diff" button.
- Reviewers who preferred the native diff lose it. If that turns out to matter,
  the setting can come back as a new record; the native code it needs is still
  here.
- Revisit if VS Code adds a way to handle a Comments panel click, which would
  remove the tab watching.

## Alternatives rejected

- **Delete the native review code.** Saves nothing at runtime, since the
  Comments panel needs the native threads, and turns every upstream rebase into
  conflicts in the files the fork never meant to own.
- **Stop creating native threads.** The Comments panel would be empty, and with
  it the one place that lists every discussion of a merge request.
- **Keep the setting and default it to `sideBySide`.** Leaves two reviews to
  keep working, and the Comments panel would still open the native widget for
  anyone on `native`.
- **A tree view of discussions of our own.** Duplicates a panel VS Code already
  has, and the built-in one would still open the native widget.
