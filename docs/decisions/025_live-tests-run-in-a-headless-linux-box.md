# 025 - Live tests run in a headless Linux box

**Status:** accepted - 2026-11-09

## Context

Three kinds of test start a real VS Code: the integration tests
(`npm run test:integration`), the language-extension runner
(`.agents/skills/local-testing/scripts/go/run_go.js`) and the end-to-end checks
that drive the packaged `.vsix` with playwright-cli. On the host, each opens a
window in front of whatever the user is doing, takes the keyboard when it gets
focus and shares the user's clipboard. Agent sessions run these tests on their
own, sometimes several at once, so the user loses the machine while they run
and the sessions trip over each other's windows.

On Apple silicon the integration tests also ran an emulated VS Code. VS Code
1.84.2 printed "You are running an emulated version of Visual Studio Code":
the retired `vscode-test@1.6.1` hard-codes the `darwin` (x64) platform on macOS
and `linux-x64` on Linux, so every download ran under Rosetta.

The decision is constrained by:

- The host checkout must not change under the user: a box that writes
  `dist-desktop/` or `node_modules/` would break a running `watch:desktop` or
  swap macOS binaries for Linux ones.
- The token must reach an end-to-end VS Code without appearing on a command
  line, in a file or in a log.
- CI does not run these tests
  ([002](002_the-pipeline-runs-only-what-this-instance-can.md)), so nothing in
  the pipeline changes.

## Evidence

| Check                                                            | Result                                                                                                                                                      | Consequence                                                                                                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file` on `.vscode-test/vscode-darwin-1.84.2/.../Electron`       | Mach-O x86_64                                                                                                                                               | The emulation warning came from the download, not from the machine.                                                                                 |
| `vscode-test@1.6.1` source                                       | `systemDefaultPlatform` is `darwin` or `linux-x64`, never arm64                                                                                             | Replaced by `@vscode/test-electron@2.5`, which picks the machine's architecture.                                                                    |
| `docker info` on the development Mac (OrbStack)                  | `linux/arm64`, 10 CPUs, 8 GB                                                                                                                                | A `node:24-bookworm` image runs natively; VS Code has linux-arm64 builds.                                                                           |
| `npm ci` in the box                                              | keytar 7.7.0 has no linux-arm64 prebuild and does not compile with Debian 12 gcc                                                                            | The root installs with `--ignore-scripts` and rebuilds only esbuild and msw.                                                                        |
| `npm run test:integration:headless`                              | VS Code 1.84.2 linux-arm64 starts under Xvfb; 59 passing, 1 pending, 10 failing                                                                             | The failures are the suite's, not the box's: it predates the fork's Commits and comparison items and the side-by-side diff, and CI does not run it. |
| `npm run test:go:headless`                                       | golang.go 0.46.1 and gopls v0.23.0 in VS Code 1.84.2 linux-arm64: 10 passing                                                                                | The language-extension runner needs nothing from the host.                                                                                          |
| `scripts/headless.mjs vscode` with the reactions `.vsix`, stable | VS Code 1.145.2 `Linux aarch64`; playwright-cli attached from the host, opened a merge request's Overview, read its reactions and searched the emoji picker | The end-to-end layer works off-screen; DevTools listens on the container's `127.0.0.1:19222`, so `socat` publishes it.                              |

## Decision

Agents and plan sessions run every test that starts VS Code in a Docker
container that draws on a virtual display, the headless box. The host commands
stay for macOS-only behaviour and for a person who wants to watch.

- **Linux on the host's architecture.** `test/docker/Dockerfile` starts from
  `node:<.tool-versions>-bookworm` with no platform pinned, so Apple silicon
  runs arm64 VS Code natively. It carries the libraries VS Code's Electron
  needs, Go and gopls for the language-extension runner, and an emoji font.
- **Xvfb, openbox and an unlocked keyring.** `test/docker/entrypoint.sh` starts
  Xvfb `:99`, a window manager for focus, and `gnome-keyring` inside a
  `dbus-run-session` with a throwaway password, so VS Code's SecretStorage
  works as on a Linux desktop.
- **The checkout is read-only.** It is mounted at `/src:ro` and copied to
  `/work` on each run; `node_modules` (root and both webviews), `.vscode-test`
  and the npm cache live in named volumes, reinstalled when a lockfile's hash
  changes. The host's `dist-desktop/`, `test_workspace/` and `node_modules/`
  are never touched.
- **One runner.** `scripts/headless.mjs` builds the image with the Node version
  from `.tool-versions` and runs `integration`, `go`, `shell`, or `vscode` and
  `stop` for end-to-end checks. `npm run test:integration:headless` and
  `npm run test:go:headless` wrap the first two.
- **End-to-end VS Code is reached over CDP on loopback.** `vscode` starts a
  detached container that installs one `.vsix` into a throwaway profile,
  forwards DevTools to a port published on `127.0.0.1` only, and passes
  `GITLAB_WORKFLOW_INSTANCE_URL` and `GITLAB_WORKFLOW_TOKEN` to the container
  by name from the host's environment. playwright-cli attaches from the host as
  before; `stop` removes the container and the profile with it.
- **Every VS Code download is native.** `test/runTest.ts` and `run_go.js` use
  `@vscode/test-electron`; on the host that is
  `.vscode-test/vscode-darwin-arm64-1.84.2/`.

## Consequences

- An agent's test run no longer opens a window or uses the keyboard or
  clipboard, and several sessions can run at once.
- Running the box needs Docker. The first run builds the image and fills the
  volumes; later runs add seconds to the suite.
- Box evidence is Linux evidence: fonts, the custom title bar and the emoji font
  differ from macOS, and the shortcut modifier is `Control`. Screenshots taken
  in the box are named `linux-<vscode-version>-<nn>-<what>.png`.
- macOS-only behaviour — the native title bar and menus, the keychain, `Meta`
  shortcuts — is still checked on the host.
- keytar is not built in the box; `vsce` needs it only for `login` and
  `publish`, which never run there.

## Alternatives rejected

- **Keep testing on the host.** It is the problem: the window, the keyboard and
  the clipboard are the user's.
- **`xvfb-run` on the host.** macOS has no X server for VS Code to draw on.
- **A macOS virtual machine.** It would keep the native chrome, but costs a
  licence per host and minutes per boot.
- **Mounting the checkout read-write.** A Linux `npm ci` or build in the box
  would replace the host's macOS `node_modules` and `dist-desktop/`.
- **Exposing VS Code's DevTools endpoint directly.** It listens on the
  container's `127.0.0.1`, which a published port cannot reach; `socat` forwards
  the published port to it instead, and the host side of that port is bound to
  `127.0.0.1` only.
