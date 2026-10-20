# 017 - The Overview reloads on request

**Status:** accepted - 2026-10-20

**Plan:** [docs/plans/010_overview-reload-button.md](../plans/010_overview-reload-button.md)
records the detailed investigation and implementation path.

## Context

An Overview read its issue or merge request once, when it opened. A comment,
an approval or a push made in the browser or by a teammate stayed invisible
until the panel was closed and opened again, which also threw away any comment
being typed.

The decision is constrained by:

- The panel is created with `retainContextWhenHidden`, so the webview never
  sends `appReady` again; upstream's `onDidChangeViewState` re-read cannot post
  to it after the first load and was left as upstream wrote it.
- `App.vue` shows its skeleton while `isLoading`, and the skeleton unmounts the
  layout, the comment form and every reply draft with it.
- A merge request action already refreshed its Overview through
  `refreshMergeRequest()`, with its own copy of the read.

## Decision

An Overview reloads its issuable, discussions and label events when asked, from
a Reload button in its header, from **GitLab: Reload Overview** in the Command
Palette, or from the same command in the webview's context menu and on the
merge request's **Overview** item in the sidebar.

- The host owns the read. `reloadPanel()` in
  `src/desktop/issuable_controller.ts` posts `issuableReloading`, reads the
  merge request detail and the discussions in parallel (an issue reads only its
  discussions), posts the usual `issuableFetch` on success, and always ends
  with `issuableReloaded { ok }`.
- A reload is all or nothing. Any failed read is one `handleError()`
  notification and no `issuableFetch`; the page keeps what it showed rather
  than an empty discussion list.
- One read per panel at a time. A request while one is in flight waits for it.
  `refreshMergeRequest()` waits for that read and then starts its own, since
  the earlier read may predate the change it is refreshing for.
- The webview never sets `isLoading` on a reload. It shows the thin progress
  bar and a busy, disabled button, so the layout, the comment form and reply
  drafts stay mounted.
- `gl.reloadOverview` acts on the active Overview and does nothing without
  one. The webview's context menu passes the view type, not a panel, so that
  argument is ignored. The menu entry is the fork's first `webview/context`
  contribution and leaves VS Code's own entries in place.
- On the sidebar's **Overview** item (`contextValue` `mr-overview-item`) the
  command acts on that merge request instead: it reveals and reloads its open
  Overview, or opens it, which reads it fresh. `src/desktop/commands/reload_overview.ts`
  tells the two arguments apart.

```text
button | command | context menu | sidebar item -> reloadPanel(panel)
  -> issuableReloading -> [getMrDetail, getDiscussionsAndLabelEvents]
  -> issuableFetch (success only) -> issuableReloaded { ok }
```

## Consequences

- An Overview can be brought up to date without losing a draft, and a failed
  read leaves it readable.
- Merge request actions and the Reload button share one read, so the two
  cannot race each other into an older result.
- The host and webview contract gains three messages, and `App.vue` gains a
  second loading state beside `isLoading`.
- Revisit when the Overview refreshes itself, by polling or on activation; the
  button would then become a fallback rather than the only way.

## Alternatives rejected

- **Close and reopen the panel.** It already worked and is what users did; it
  loses the scroll position and every draft.
- **Reuse `isLoading` for the reload.** It unmounts the comment form and the
  reply drafts it is meant to keep.
- **Post an empty discussion list when a read fails.** The page would show a
  merge request with no comments, which is worse than a stale one.
- **Fix the re-read on activation instead.** It changes upstream's behaviour on
  every tab switch and costs two reads per switch, where the user asked for an
  explicit control.
