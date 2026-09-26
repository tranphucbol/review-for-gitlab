# Layer 3: real language extension runner

Layer 2 runs with `--disable-extensions`, so it can only stub a language server.
When a change depends on how a real one behaves (its document selector, its
startup time, its result shapes), run the Go runner: the same downloaded VS Code
1.84.2, plus a pinned `golang.go` and a local `gopls`, in an extensions folder of
its own.

## Files

- `scripts/go/run_go.js` - builds the Go workspace, installs the extension,
  launches VS Code through `vscode-test`'s `runTests`.
- `scripts/go/suite/index.js` - mocha entry; reuses
  `dist-desktop/test/integration/test_infrastructure/initialize_test_environment`
  so the fake account and extension activation match layer 2.
- `scripts/go/suite/go_navigation.test.js` - the tests.

## Prerequisites

- `go` and `gopls` on `PATH`, or `GOPLS=/path/to/gopls`.
- `dist-desktop/` built with test files: `npm run prepare:test:integration`
  (or a finished `npm run test:integration`).

## Run

```sh
source ~/.nvm/nvm.sh && nvm use 18.17.0 >/dev/null
npm run prepare:test:integration
node .agents/skills/local-testing/scripts/go/run_go.js
```

Expected: `10 passing`. It prints the installed extensions first; only
`golang.go@0.46.1` should appear.

## What it sets up

- `.vscode-test/e2e-go-workspace/`: a fresh git repo with the fixture remote,
  a base commit (`go.mod`, `greet.go`, `main.go`) and a head commit that adds
  `Hello()` to `main.go`. Its SHAs and the `main.go` diff reach the tests through
  `E2E_BASE_SHA`, `E2E_HEAD_SHA`, `E2E_MAIN_DIFF`.
- `.vscode-test/e2e-ext/` and `.vscode-test/e2e-ud/`: extensions and user data
  for this runner only. `golang.go` is installed there with `--force`; nothing
  touches your own VS Code profile.
- `.vscode/settings.json` in the workspace points `go.alternateTools.gopls` at
  the local gopls and turns off tool updates and surveys.

## What the tests cover

- gopls answers for the local `main.go` (polls until the server is up).
- A `gl-review:` document opens with `languageId` `go`.
- Same-file definition and references land in the review document; a
  cross-file definition lands in the local `greet.go`; hover shows the gopls
  signature.
- An unsaved local edit makes the review document return nothing.
- Base side: an unchanged line maps to the head document, a changed line
  returns nothing. It fills `mrCache` from the test's own module copy and
  serves `versions` endpoints from the mock server (see the two-copies note in
  [gates-and-integration.md](gates-and-integration.md)).

`golang.go` registers for `{language: 'go', scheme: 'file'}`, so without the
fork's forwarding providers the review-document tests fail; that is the red
run for this layer.

## Adding another language

Copy the pattern: a `run_<lang>.js` that pins one marketplace extension, a
workspace generator with a base and a head commit, and a suite that polls the
local file until the server answers before asserting anything on review URIs.
