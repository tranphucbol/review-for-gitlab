# Pitfalls

Each of these cost real time once. Symptom first, then the fix.

## Building and packaging

- **The `.vsix` disappeared.** `build:desktop`, `prepare:test:integration` and
  `package` all empty `dist-desktop/` first. Copy a `.vsix` you still need out
  of it before the next build.
- **"Is `.agents/` shipped in the `.vsix`?"** No. `.vscodeignore` does not list
  it, but packaging runs from `dist-desktop/` (`scripts/package.mjs:8`), which
  never contains it.
- **`lint` fails on a skill file.** Prettier's `**/*` glob covers `.agents/`
  (ESLint skips dot directories, Prettier does not); run
  `npx prettier --write .agents/` after editing the skill.
- **Local `lint` fails on files git does not track.** ESLint and Prettier read
  the working tree, so scratch scripts under `docs/plans/` break a local
  `npm run lint` while CI stays green. Delete scratch scripts once they have a
  home, or keep them out of the repository.

## Unit tests

- **`Illegal argument` from `new vscode.Location(...)`.** jest-mock-vscode's
  `Location` rejects any range that is not its own `Range`. Use the plain
  `Location` and `Hover` in `src/__mocks__/vscode.js`.
- **A `Uri.file` path has no leading slash.** The test double in
  `src/desktop/test_utils/uri.ts` keeps the path as given, so build expected
  URIs the same way the code under test does.

## Integration tests (layer 2)

- **A `.ts` fixture passed without the change.** The built-in TypeScript
  extension runs despite `--disable-extensions` and answers for in-memory
  documents such as `gl-review:` itself. It proves nothing about gopls or
  jdtls, which only serve `file:`; test those with a stub provider scoped to
  `scheme: 'file'`. tsserver also ignores the URI query, so the head and base
  of the same path collide.
- **State set in a test is invisible to the extension.** The bundled
  extension and the test's `require`d `src/` are two module copies; construct
  the class under test from the test's copy.
- **`Timeout of 3000ms exceeded`.** Mocha's default. Language features need a
  suite timeout (`this.timeout(60000)` in a `function`, not an arrow) and a
  poll until the provider answers.
- **An unrelated `after each` hook timed out once.** A flake in
  `run_with_valid_project`; rerun before investigating.

## Language extension runner (layer 3)

- **"GitLab Workflow can't access the OS Keychain".** Harmless in the runner's
  throwaway profile.
- **A result is missing although gopls is on `PATH`.** gopls needs a moment;
  poll the local `file:` document first, and only then ask review URIs.

## Real VS Code (layer 4)

- **`playwright-cli click` times out on a tree row** ("waiting for element to
  be visible, enabled and stable"). A VS Code window in the background
  throttles animation frames. Use `run-code` with `click({ force: true })`.
- **`locator.hover()` times out, even with `force`.** Move the real mouse twice
  with `page.mouse.move` over the symbol's bounding box.
- **A changed-file row cannot be found by name.** It has no accessible name;
  its child label is the path with a leading slash:
  `getByLabel('/src/...', { exact: true })`.
- **The status bar query returns nothing.** Read
  `[aria-label^="Ln "]`, not the text of `.statusbar-item`.
- **`.editor.modified` matches nothing.** The diff sides are
  `.modified-in-monaco-diff-editor` and `.original-in-monaco-diff-editor`.
- **`$S snapshot` runs nothing in zsh.** zsh does not word-split a variable;
  wrap the command in a function.
- **`playwright-cli` crashes with `ENOENT ... uv_cwd`.** Its working directory
  was deleted. `cd` out of the scratch directory before removing it.
- **`.playwright-cli/` appeared in the repository.** It is written into the
  current directory; attach from a scratch directory.
- **VS Code is still running after `detach`.** Detach only disconnects; kill
  the pid `launch.sh` printed.
- **A toast covers the bottom right of 1.139** ("install recommended
  extensions"). Dismiss it before clicking there.
- **The references peek starts normally, then goes blank.** Its embedded
  editor inherits `automaticLayout` from its parent. At fractional window
  zoom, that observer can repeatedly shrink the preview to 5×5px. Keep it
  disabled and resize only the main panes with `DiffView`'s observer. Run
  `scripts/side_by_side_peek.js` with `playwright-cli run-code --filename=...`
  on a merge request's `Example.java`; it waits before checking
  the preview, tests both Align modes, resizes the panes and follows a reference.
- **`test_workspace (no GitLab project)` in the GitLab sidebar.** The
  repository root contains layer 2's `test_workspace/` git repository. Ignore
  it.
- **Builds up to 3.107.1 are `GitLab.gitlab-workflow`, and 0.0.1 to 0.0.7
  are `tranphucbol.jetbrain-gitlab`.** Uninstall those before installing a
  newer one, which is `tranphucbol.review-for-gitlab`; two at once register the
  same commands and views.
- **`screencapture` fails.** macOS needs a screen-recording permission; use
  `playwright-cli screenshot`, which needs none. Its images are at twice the
  CSS pixel size.
- **Forwarding cannot be seen on a TypeScript-only merge request.** TypeScript
  answers review documents natively, so "local file differs" negatives look
  the same with or without the change. Use layer 3 for those.

## GitLab and CI

- **The `lint` job failed with `ECONNRESET` during `npm install`** in the
  `webviews/vue2` postinstall. A network flake; retry the job (ask first, it is
  visible to others).
- **A pasted image stays on the project after the comment is deleted.** GitLab
  13.12 has no API to delete an upload; paste a small, harmless image.
