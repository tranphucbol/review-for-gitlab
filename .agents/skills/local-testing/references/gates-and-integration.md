# Gates and integration tests

## Toolchain

Node 24.22.1 (`.tool-versions`), the same as `node:24-slim` in CI. Start every
shell command with:

```sh
source ~/.nvm/nvm.sh && nvm use 24.22.1 >/dev/null && <command>
```

Run `npm ci` in the root, `webviews/vue` and `webviews/vue2` once; `npm run lint`
recurses into both webviews.

## Layer 1: gates

```sh
npx tsc -p . --noEmit     # fastest type check while editing
npm run lint              # eslint, prettier --check on every md/js/ts/json, both webview lints
npm run test:unit         # jest over src/
npx jest src/desktop/review/review_language_features.test.ts   # one file
```

Unit tests import the `vscode` module from `src/__mocks__/vscode.js`, which
spreads `jest-mock-vscode` and overrides parts of it. A new VS Code API used in
`src/` usually needs a mock there first; jest-mock-vscode's own `Location`
rejects ranges that are not its `Range`, which is why the file has its own
`Location` and `Hover`.

## Layer 2: integration tests

```sh
npm run test:integration
```

What it does (`package.json:244-245`):

1. `build:desktop` compiles with `tsc` and bundles `dist-desktop/extension.js`.
2. Copies `node_modules` into `dist-desktop/`.
3. `scripts/create_test_workspace.mjs` creates `test_workspace/`, a git repo with
   a GitLab remote and one empty commit.
4. `test/runTest.ts:15-16` downloads VS Code 1.84.2 into `.vscode-test/` and runs
   it with `--disable-extensions --disable-workspace-trust test_workspace`.
   Built-in extensions, including TypeScript, still run.

Inside VS Code, `initialize_test_environment.js:48-59` sets a fake account
(`https://test.gitlab.com`) through the environment and activates the bundled
extension. Tests are plain `.js` under `test/integration/` and `require` the
tsc output of `src/` from `dist-desktop/`.

### Mock GitLab

`test/integration/test_infrastructure/mock_server.js` is an msw server. Build
one per suite with `getServer([...handlers])` and close it in `after`:

- `createJsonEndpoint(path, json)` and `createQueryJsonEndpoint(path, map)` for
  REST JSON; the query map keys are sorted query strings.
- `createTextEndpoint` and `createQueryTextEndpoint(path, {'?ref=<sha>': text})`
  for raw files. `ReviewFileSystem` reads MR files through
  `/projects/<id>/repository/files/<path>/raw?ref=<sha>` and asks
  `/projects/<id>/repository/files/<path>?ref=<sha>` for `{size}`.

Fixtures live in `test/integration/fixtures/`: `rest/open_mr.json` (project
278964, iid 33824), `rest/versions.json`, `rest/mr_version.json` (head and
base commit SHAs used in review URIs).

### Language features without a real language server

`--disable-extensions` means no gopls or jdtls. To test code that sits between
VS Code and a language server, register a stub provider in the test itself,
scoped the way real servers are:
`{scheme: 'file', pattern: '**/src/navigation.stub'}`
(`test/integration/review_code_navigation.test.js:79`). The built-in TypeScript
extension is still active, so a `.ts` file shows what a server that already
serves `gl-review:` documents does.

The bundled extension and the test's `require`d modules are separate copies:
state such as `mrCache` filled from the test is invisible to the bundled
extension. When a test needs that state, construct the class under test from
the `require`d copy and call it directly
(`review_code_navigation.test.js:259`).

### Useful commands

```sh
npm run prepare:test:integration                 # build without running
node ./dist-desktop/test/runTest.js              # rerun after prepare
```

To see one suite only, temporarily narrow the glob in
`test/integration/index.js`; do not commit it.
