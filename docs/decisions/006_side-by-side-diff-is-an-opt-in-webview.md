# 006 - The side-by-side diff is an opt-in webview

**Status:** accepted - 2026-10-05
**Status:** local file arrows amended by [007](007_local-change-buttons-are-off-until-turned-on.md) - 2026-10-05

**Plan:** [docs/plans/002_side-by-side-mr-diff-view.md](../plans/002_side-by-side-mr-diff-view.md)
records the detailed investigation and implementation path.

## Context

Reviewers wanted the merge request diff that JetBrains IDEs draw: both versions
in full, aligned row by row, with ribbons in a middle gutter that tie each
change on the left to its counterpart on the right, discussions inline, and an
arrow that copies a change into the local file. VS Code's native diff editor
cannot be extended to do any of that: extensions cannot draw between its panes,
add arrows to its gutter, or put a widget between its lines.

The decision is constrained by:

- The native review — `vscode.diff` over `gl-review://` URIs, comment
  controllers, decision [004](004_review-diffs-borrow-navigation-from-an-identical-local-file.md)'s
  code navigation — works and is what every user has today. It must stay the
  default and stay untouched.
- The extension talks to GitLab 13.12; discussions, note edits and uploads must
  use the same `GitLabService` calls as the native review.
- The webview is untrusted territory: it gets no tokens, and HTML it shows has
  to be sanitised.
- The look is borrowed from the JetBrains-style "intelli-git" extension, whose
  code is GPL. None of it is copied; this is a fresh implementation.
- A merge request whose diff GitLab truncates (`diff === ''`) still has to show
  something useful.

## Evidence

| Check                                                               | Result                                                                     | Consequence                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `monaco-editor` 0.52.2 with an inline editor worker under the CSP   | Renders, highlights, no CSP errors with `worker-src blob:; font-src data:` | Monaco is used; no plain-DOM fallback was needed                     |
| `npm run mr_diff` (Vite 4, Node 18.17.0)                            | `app.js` 2.95 MB (812 KB gzip), `index.css` 190 KB                         | Within the plan's +5 MB `.vsix` budget                               |
| `npm run package`, then `unzip -v` on the `.vsix`                   | `webviews/mr_diff/` adds 0.88 MB compressed to a 6.1 MB package            | Monaco costs every user under 1 MB, whether they opt in or not       |
| Monaco view zones for fillers and for Vue-rendered discussion cards | Rows stay aligned as cards grow; `ResizeObserver` resizes the zone         | Discussions live between the lines instead of in a side panel        |
| `waitForWebview()` with the 3 MB bundle                             | Its 2-second timeout fires before the app posts `appReady`                 | The panel answers `appReady` whenever it arrives instead of awaiting |

## Decision

The side-by-side view is a separate webview panel, opened by choice, that
reproduces the review features it needs on top of the existing services.

- **Opt-in.** `gitlab.mergeRequestDiff.viewer` (`native` by default,
  `sideBySide`) picks what selecting a changed file in the sidebar opens.
  "Open in Side-by-Side View" on a changed file's context menu and on the
  `gl-review` diff editor's title bar works regardless of the setting, and the
  view has an "Open native diff" button. Images still open with `vscode.open`.
- **Where it lives.** The host is `src/desktop/review/side_by_side/`:
  `MrDiffPanelController` keeps one panel per repository, merge request and
  file; `MrDiffPanel` loads both versions (local git first, then the API),
  filters discussions to text-diff notes on this file and version, and serves
  the webview's requests. `messages.ts` is the whole host–webview contract. The
  webview is `webviews/vue/mr_diff/`, built by Vite like `issuable/`; its diff
  model (`model/`) is plain TypeScript with Vitest specs.
- **The diff model.** The webview parses GitLab's unified diff into blocks; a
  run of removed lines followed by added lines is one modified block. When
  GitLab returned no diff, the blocks come from a line LCS of the two texts
  (capped at 250 000 cells, beyond which the changed middle is one block) and
  new comments are refused, because GitLab cannot place them.
- **Alignment.** Hatched filler zones keep rows aligned; the Align button turns
  them off, after which scrolling maps one pane onto the other through the
  block boundaries. The choice is kept in `globalState`.
- **Discussions.** Create, reply, edit, delete, resolve and image paste go
  through the same `GitLabService` calls as the native review;
  `buildDiffPosition()` is shared with `createNewComment()`, and image uploads
  reuse `uploadAttachments()` so they land in `mr.project_id` as decision
  [003](003_pasted-images-upload-to-the-merge-request-project.md) requires.
  Note HTML is GitLab's `bodyHtml`, links made absolute on the host and
  sanitised with DOMPurify in the webview. A failed write keeps the draft and
  offers Retry.
- **Local file arrows.** When the local file equals the base, → copies a
  change into it; when it equals the head, ← reverts one. `LocalHunkApplier`
  tracks applied blocks and checks the file before every edit; the edit is an
  unsaved, undoable `WorkspaceEdit`. If the file changed in any other way, the
  arrows disappear and the view says why. There are no arrows for a deleted
  file or a file outside the repository root.
- **Theme and accessibility.** Colours come only from `--vscode-*` variables;
  every control has a label, Ctrl/Cmd+Enter comments on the cursor's line, and
  F7 and Shift+F7 move between changes.

```text
sidebar item / title button -> openMrFileSideBySide -> MrDiffPanelController
  -> MrDiffPanel -> GitLabService, local git, WorkspaceEdit
  <-> messages.ts <-> webviews/vue/mr_diff (Monaco + Vue)
```

## Consequences

- Reviewers who opt in get aligned panes, connector ribbons, inline
  discussions and hunk arrows; everyone else sees no change.
- The `.vsix` carries Monaco, 3 MB unpacked and under 1 MB compressed, and the webview duplicates the
  native review's commenting UI. A change to how notes are created, edited or
  positioned now has two callers to keep right; `buildDiffPosition()` keeps the
  position logic in one place.
- The webview is fork-only code that upstream will never carry, which keeps it
  out of rebases but means nobody else maintains it.
- Revisit when VS Code lets extensions decorate between the panes of its diff
  editor, or if the Monaco dependency stops keeping up with VS Code's theming.

## Alternatives rejected

- **Make side-by-side the default.** Swaps a stable, native view for a new one
  on every user at once; opt-in lets it earn the default.
- **Decorate the native diff editor.** No API reaches between its panes or into
  its gutter, so neither ribbons nor arrows nor inline cards are possible.
- **A plain-DOM table instead of Monaco.** Loses syntax highlighting, search,
  selection and keyboard navigation that Monaco provides; kept as a fallback
  only if Monaco failed under the webview CSP, which it did not.
- **Copy intelli-git.** Its GPL licence is incompatible with this extension's
  MIT licence.
- **Parse the diff on the host and send hunks.** The webview needs the parser
  for collapsed diffs anyway; the host validates apply requests against its own
  copies of both texts instead.
- **Await `waitForWebview()` before loading.** Its timeout is shorter than the
  bundle's start-up, so the panel would report a failure that did not happen.
