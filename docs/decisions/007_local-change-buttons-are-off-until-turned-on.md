# 007 - Local change buttons are off until turned on

**Status:** accepted - 2026-10-05

Amends the **Local file arrows** part of decision
[006](006_side-by-side-diff-is-an-opt-in-webview.md); the rest of 006 stands.

## Context

Decision 006 put → and ← buttons in the side-by-side view's gutter whenever the
local file matched the base or the head. Both panes are read-only, so a reviewer
who opened the view to read a merge request saw buttons that edit a file and
asked why a read-only view offers them. A misclick changes the working copy of
someone who only wanted to review.

## Decision

`gitlab.mergeRequestDiff.showLocalChangeButtons` (boolean, default `false`)
turns the buttons on. While it is off the view is read-only: the host sends
`localState` with `enabled: false`, the webview shows no arrows, no × and no
"Local: …" status, and the host refuses an `applyHunk` message with a message
that names the setting. Changing the setting updates every open view through
`MrDiffPanelController.refreshLocalStates()`.

With the setting on, everything 006 describes still holds: `LocalHunkApplier`
checks the file first and the edit is an unsaved, undoable `WorkspaceEdit`.

## Consequences

- Reading a merge request in the side-by-side view cannot change a local file
  unless the user asked for the buttons.
- The applier, the file watcher and the tests stay; only their output is
  gated, so turning the setting on needs no reload.

## Alternatives rejected

- **Remove the buttons.** Some reviewers do want to try a change locally; the
  code is tested and isolated behind one setting.
- **A toolbar toggle remembered per user, like Align.** It would still show a
  control that edits files in a read-only view; a setting keeps the default
  view free of it and is where VS Code users look for behaviour switches.
