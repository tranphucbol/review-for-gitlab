# 021 - The toolchain runs on Node 24

**Status:** accepted - 2026-10-22

**Plan:** [docs/plans/015_upgrade-the-toolchain-to-node-24.md](../plans/015_upgrade-the-toolchain-to-node-24.md)
records the detailed investigation and implementation path.

## Context

The repository built, linted and tested on Node 18.17.0 (`.tool-versions`) and
`node:18-slim` in CI ([002](002_the-pipeline-runs-only-what-this-instance-can.md)).
Node 18 reached end of life in April 2025. `publish-marketplace` already ran on
a second image, `node:22-slim`, because `@vscode/vsce@3` needs Node 20 or later
([015](015_the-extension-is-published-to-the-marketplace.md)), and
[011](011_mermaid-renders-lazily-in-the-overview.md) parks `mermaid@12` until
CI reaches Node 22.12.

The extension does not run on the Node that builds it. It runs in VS Code's
extension host, on the Node that VS Code's Electron ships: VS Code 1.82, the
oldest `engines.vscode` allows, is Electron 25.8.0 with Node 18.15.0, and the
integration tests run VS Code 1.84.2, the same Node 18 line.

The decision is constrained by:

- The bundle must keep running on Node 18.15.
- Unit tests on a newer Node cannot show that; the compile-time guards and the
  integration run on VS Code 1.84.2 can.

## Evidence

Node 24.22.1 with npm 11.19.1, against a Node 18.17.0 (npm 9) baseline built
from the same commit, each in its own worktree.

| Check                                                            | Result                                                                                                                | Consequence                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm ci` on Node 24                                              | Passes; no lockfile changes, including the three that `postinstall` runs `npm install` on                             | No dependency or lockfile change                                                               |
| `npm ci` install-script notice                                   | npm 11 warns that `esbuild`, `keytar`, `msw`, `core-js`, `bootstrap-vue` and others are not covered by `allowScripts` | A warning only (`strict-allow-scripts` is off); the scripts still run and `keytar.node` exists |
| `npm run lint`, `npm run test:unit -- --coverage`                | Pass; 190 suites, 1644 tests                                                                                          | Jest 29 works on Node 24                                                                       |
| `npm test -- --run` in `webviews/vue`                            | Passes; 30 files, 295 tests                                                                                           | Vitest and Vite work on Node 24                                                                |
| `npm run package`, `.vsix` contents compared                     | 148 entries; all byte-identical except `extension.js` and its map. Every webview bundle is identical                  | Only the desktop bundle needed explaining                                                      |
| `extension.js` size                                              | 2,242,806 → 1,748,569 bytes; the missing sources are `encoding@0.1.13`, its `iconv-lite@0.6.3` and `safer-buffer`     | npm 11 does not install `encoding`, an optional peer of `node-fetch@2`; npm 9 did              |
| Node 18 build with `node_modules/encoding` removed               | `extension.js` and `extension.js.map` byte-identical to the Node 24 build                                             | The node version changes nothing else in the bundle                                            |
| `textConverted` in `src/`                                        | No caller; `node-fetch` requires `encoding` in a `try` and uses it only there                                         | The removed code was unreachable                                                               |
| `npm run test:integration` (VS Code 1.84.2), Node 24 and Node 18 | Node 24: 58 passing, 11 failing. Node 18: 57 passing, the same 11 failing, plus one 3 s hook timeout                  | No new failure; the 11 already fail on the default branch, which CI does not run               |
| `npm ci` in `node:24-slim`, `linux/amd64`, only `git` installed  | Passes with no `gcc`, `make` or `python3`; `keytar` installs from its N-API prebuild                                  | The image needs no build tools                                                                 |
| `npx jest` in that container with `--cpus=2`                     | 190 suites, 1644 tests pass                                                                                           | The `test-unit` job runs on the new image                                                      |

## Decision

Every tool that builds, lints, tests, packages or publishes the extension runs
on Node 24: `.tool-versions` pins `nodejs 24.22.1`, and `.gitlab-ci.yml` sets
`image: node:24-slim` once, for every job. `publish-marketplace` no longer
overrides it.

- The extension's runtime does not move with it. esbuild keeps
  `--target=node16.13`, `tsconfig.json` keeps `target` and `lib` at `ES2019`,
  `@types/node` stays at `^13.13.52`, and `engines.vscode` stays `^1.82.0`.
  A Node 20+ global or method in `src/` is still a type error.
- Raising any of those four is a decision about which VS Code the fork
  supports, made on its own and not as part of a toolchain upgrade.
- Locally the version is exact; in CI it is the major tag, as it was for
  Node 18.
- `encoding` stays out of the bundle. Nothing calls the one function that
  needs it.

## Consequences

- One supported Node for every job, maintained until April 2028.
- `mermaid@12` and other tooling that needs Node 22+ become possible, each as a
  change of its own.
- Contributors install Node 24.22.1 and reinstall `node_modules`; a Node 18
  `node_modules` builds a bundle that still carries `encoding`.
- Tests now run on a newer Node than the extension does, so a passing unit
  test says less about VS Code 1.82 than it did. The compile-time guards
  above and the integration run carry that weight. The integration suite's
  11 failing tests were already failing before this change.
- npm 11 prints an install-script notice on every install. An `allowScripts`
  policy in `package.json` would silence it and is left for its own change.
- Revisit when VS Code's minimum moves past 1.82, or when npm makes
  `allowScripts` an error by default.

## Alternatives rejected

- **Node 22.** Also LTS and already used by `publish-marketplace`, but it
  leaves maintenance in April 2027; Node 24 is supported a year longer for the
  same work.
- **Upgrade Node and the dependencies together.** A failure could not have
  been told apart from the Node change, and the `.vsix` comparison would have
  meant nothing.
- **Raise esbuild's target and `@types/node` to Node 24.** The build would
  accept APIs that VS Code 1.82's Node 18.15 does not have.
- **Pin `node:24.22.1-slim` in CI.** It would match `.tool-versions` exactly,
  but every patch release would need a manual bump; the pipeline has always
  followed the major tag.
