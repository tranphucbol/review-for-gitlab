# The headless box

Layers 2, 3 and 4 start a real VS Code. On the host that window opens in front
of whatever the user is doing, takes the keyboard when it gets focus, and shares
the user's clipboard; two sessions testing at once trip over each other. The
headless box is a Linux container with its own virtual display, so none of that
reaches the user ([025](../../../../docs/decisions/025_live-tests-run-in-a-headless-linux-box.md)).
Agents and plan sessions use it by default.

## Files

- `test/docker/Dockerfile` - `node:<.tool-versions>-bookworm` on the host's
  architecture (arm64 on Apple silicon, so VS Code is never emulated), Xvfb,
  openbox, dbus and gnome-keyring, the libraries VS Code's Electron needs, and
  Go with gopls for layer 3.
- `test/docker/entrypoint.sh` - copies the checkout from `/src` (read-only) to
  `/work`, runs `npm ci` into the box's volumes when a lockfile changed, starts
  Xvfb `:99`, openbox and an unlocked keyring, then the command. The root
  install skips keytar's build (vsce needs it only to publish, and it has no
  linux-arm64 prebuild) and Chromium's download.
- `test/docker/compose.yml` - the `box` service: checkout at `/src:ro`,
  `node_modules` (root and both webviews), `.vscode-test` and the npm cache in
  named volumes, `shm_size: 1gb`, `init: true`.
- `test/docker/vscode.mjs` - layer 4 inside the box: downloads a VS Code,
  installs one `.vsix` into a throwaway profile, starts it with DevTools
  forwarded to the published port.
- `scripts/headless.mjs` - the host-side runner; it passes the Node version,
  builds the image (`--build`, cached after the first time) and removes the
  container afterwards.

## Commands

```sh
npm run test:integration:headless       # layer 2: npm run test:integration in the box
npm run test:go:headless                # layer 3: prepare, then run_go.js in the box
node scripts/headless.mjs shell         # bash in the box, for debugging a run
```

The host checkout is never written: the box builds `dist-desktop/`,
`test_workspace/` and `.vscode-test/` in its own copy, so a host `npm run
watch:desktop` keeps running undisturbed. The first run builds the image and
fills the volumes (several minutes, keytar compiles from source on arm64);
later runs start in seconds plus the suite's own time.

`docker compose -f test/docker/compose.yml down --volumes` throws the volumes
away when an install goes wrong; the next run fills them again.

## Layer 4 in the box

```sh
npm run package && cp dist-desktop/review-for-gitlab-*.vsix ~/Downloads/
node scripts/headless.mjs vscode --vsix ~/Downloads/review-for-gitlab-<version>.vsix \
  --folder <checkout-with-a-gitlab-remote> [--version 1.84.2] [--port 9333]
playwright-cli -s=vsc attach --cdp=http://localhost:9333
...                                     # drive it as in real-vscode-playwright.md
node scripts/headless.mjs stop --port 9333
```

`vscode` starts a detached container named `review-for-gitlab-vscode-<port>`,
publishes the DevTools port on `127.0.0.1` only, and returns when the workbench
answers. `--version` takes anything `@vscode/test-electron` downloads: `stable`
(the default) or an exact version such as `1.84.2`. The folder is mounted
read-only at `/workspace/<name>`, so a test that edits local files needs a copy.
The account comes from `$GITLAB_HOST` and `$GITLAB_TOKEN`, passed to the
container by name, never on a command line. `stop` removes the container and
with it the profile.

Screenshots taken with `playwright-cli screenshot` are written on the host, in
playwright-cli's working directory, as on the host flow.

## What stays on the host

- macOS-only behaviour: the native title bar and menus, the macOS keychain,
  `Meta+` shortcuts, `osascript` clipboard tricks. In the box the modifier is
  `Control`, and the clipboard is the box's own X clipboard.
- A person who wants to watch: the host flow in
  [real-vscode-playwright.md](real-vscode-playwright.md) still works.

Evidence from the box is Linux evidence: fonts, the custom title bar and the
emoji font differ from macOS. Name such screenshots
`linux-<vscode-version>-<nn>-<what>.png`.
