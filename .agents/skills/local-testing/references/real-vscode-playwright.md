# Layer 4: real VS Code against real GitLab, driven by playwright-cli

This layer tests the packaged `.vsix` in the VS Code people actually use, against
the real GitLab 13.12 instance. VS Code is an Electron app, so starting it with
`--remote-debugging-port` lets `playwright-cli` attach over CDP and read the
workbench through its accessibility tree. The agent reads a snapshot, decides,
acts, reads again; no coordinates are hard-coded.

Run it on the installed VS Code (`/Applications/Visual Studio Code.app`) and on
the oldest supported one (`.vscode-test/vscode-darwin-1.84.2/Visual Studio Code.app`,
downloaded by layer 2).

## Before you start

- `$GITLAB_HOST` and `$GITLAB_TOKEN` are set in the shell. Do not print them.
- The change is pushed and has a merge request on `$GITLAB_HOST`, and the
  repository checkout is on that branch. Pushing and opening the MR need the
  user's approval first.
- A `.vsix` exists outside `dist-desktop/`: `npm run package` writes
  `dist-desktop/review-for-gitlab-<version>.vsix`, and the next build wipes that
  directory, so copy it somewhere else first (the examples use
  `~/Downloads/`).

## 1. Launch

```sh
E=$(mktemp -d)        # throwaway profile; any free port works
zsh .agents/skills/local-testing/scripts/launch.sh \
  "/Applications/Visual Studio Code.app" 9333 "$E" "$PWD" ~/Downloads/review-for-gitlab-<version>.vsix
sleep 20
curl -s localhost:9333/json/list    # wait for a page whose url ends in workbench.html
```

`launch.sh` writes isolated user settings (`gitlab.debug` on, no updates,
telemetry, AI features, or restored windows), installs only the given `.vsix`,
lists the profile's extensions, and starts VS Code in the background with the
account in the environment. It prints the pid; keep it for cleanup.

## 2. Attach

`playwright-cli` writes `.playwright-cli/` snapshot files into its working
directory, so run it from a scratch directory, not the repository:

```sh
W=$(mktemp -d) && cd "$W"
S() { playwright-cli -s=vsc "$@"; }   # a function: zsh does not word-split "$S"
S attach --cdp=http://localhost:9333
S snapshot --filename=start.yml
```

In the snapshot, look for `tab "GitLab Workflow"` in the activity bar and the
status bar items for the MR and pipeline; they prove the account works.
`S find --regex "Pipeline #\d+"` searches the snapshot without reading all of
it.

## 3. Drive the workbench

Clicks on tree rows need `force: true` (see [pitfalls.md](pitfalls.md)); use
`run-code` with Playwright locators:

```sh
S run-code "async page => { await page.getByRole('tab', { name: 'GitLab Workflow' }).click({ force: true }); }"
S run-code "async page => { await page.getByRole('treeitem', { name: /^!1 / }).click({ force: true }); }"
S run-code "async page => { await page.getByLabel('/src/desktop/review/review_language_features.ts', { exact: true }).click({ force: true }); }"
```

Changed-file rows have no accessible name of their own; their label child is
the file path with a leading slash, as above. `run-code` echoes the code and a
console summary; a failure shows as a line starting with `Error` or a
`Timeout`.

Keyboard goes to whatever has focus; click inside the editor first.

```sh
S run-code "async page => { await page.locator('.modified-in-monaco-diff-editor .view-lines').click({ force: true }); }"
S press Control+g      # go to line
S type "180:24"
S press Enter
S press F12            # go to definition
S press Meta+Shift+p   # command palette
```

## 4. Read the result

```sh
S --raw eval "document.querySelector('.tab.active')?.getAttribute('aria-label')"
S --raw eval "document.title"
S --raw eval "!!document.querySelector('.editor-instance .monaco-diff-editor')"
S --raw eval "document.querySelector('[aria-label^=\"Ln \"]')?.getAttribute('aria-label')"   # "Ln 32, Col 7"
S screenshot --filename=after-f12.png
```

The active tab's label differs by version: 1.139 says
`review_language_features.ts (!1) (review_language_features.ts), preview`,
1.84.2 says `review_language_features.ts, preview`.

For a hover, `locator.hover()` times out even with `force`; move the real mouse
onto the symbol twice (the first move only arms the hover), then read
`.monaco-hover`:

```sh
S run-code "async page => { const s = page.locator('.modified-in-monaco-diff-editor .view-line span', { hasText: /^getLocalUri\$/ }).first(); const b = await s.boundingBox(); await page.mouse.move(b.x + 2, b.y + 2); await page.waitForTimeout(300); await page.mouse.move(b.x + 5, b.y + 5); await page.waitForTimeout(2000); }"
S --raw eval "document.querySelector('.monaco-hover')?.textContent"
```

The `\$` keeps the shell from expanding the regex anchor inside double quotes.

The base side of a diff is `.original-in-monaco-diff-editor`, the head side
`.modified-in-monaco-diff-editor`, in both 1.84.2 and 1.139.

Assert on behaviour, not on the absence of errors: the cursor line changed,
the active tab is still the diff (or is the expected local file), exactly one
result, the hover text contains the expected type.

## 5. Comment regression (externally visible, ask first)

Posting a comment or pasting an image writes to the real merge request.

```sh
sips -Z 200 <some.png> --out "$W/paste.png"
osascript -e "set the clipboard to (read (POSIX file \"$W/paste.png\") as «class PNGf»)"
```

Select a changed line, run "GitLab: Add Comment on Current Selection" from the
command palette, type the text, press `Meta+v`: the box should get
`![image](/uploads/<hash>/image.png)`. Click the "Add Comment Now" button. The
rendered comment's `<img>` must point at an absolute `$GITLAB_HOST/.../uploads/`
URL.

Delete the note afterwards; find it by its body text:

```sh
curl -s -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$GITLAB_HOST/api/v4/projects/<project-id>/merge_requests/<iid>/notes?per_page=100"
curl -s -X DELETE -o /dev/null -w '%{http_code}\n' -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$GITLAB_HOST/api/v4/projects/<project-id>/merge_requests/<iid>/notes/<note-id>"   # expect 204
```

The uploaded file itself stays on the project; GitLab 13.12 has no API to
delete an upload.

## 6. Clean up

```sh
S detach          # leaves VS Code running
kill <pid>
cd "$OLDPWD"      # leave $W before deleting it, or playwright-cli fails on a missing cwd
rm -rf "$E" "$W"
playwright-cli list               # should show no sessions
```

Keep screenshots worth keeping under `docs/plans/<plan>_e2e/evidence/`
(ignored); name them `<vscode-version>-<nn>-<what>.png`.
