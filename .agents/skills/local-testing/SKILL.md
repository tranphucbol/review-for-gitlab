---
name: local-testing
description: Test this GitLab Workflow fork (a VS Code extension) locally and end to end - unit and integration gates, a real language extension runner, real VS Code driven by playwright-cli against the real GitLab, and beta builds for manual testing. Use for "local testing", "e2e testing", "test the extension", "test in real VS Code", "run the Go runner", "build a beta".
---

# Local Testing

This repository is a VS Code extension, not a service. There is no
`local/run-dev.sh`, no HTTP API and no Postman collection: the thing under test
runs inside VS Code, and the "backend" is either a mock GitLab (integration
tests) or the real GitLab 13.12 instance (end to end). Pick the lowest layer that
proves the change; go up a layer only for what the lower one cannot show.

| Layer | Proves                                                   | Reference                                                               |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1     | Types, lint, unit behaviour                              | [gates-and-integration.md](references/gates-and-integration.md)         |
| 2     | Extension inside VS Code 1.84.2 against a mock GitLab    | [gates-and-integration.md](references/gates-and-integration.md)         |
| 3     | A real third-party language extension (golang.go/gopls)  | [language-extension-runner.md](references/language-extension-runner.md) |
| 4     | The packaged `.vsix` in real VS Code against real GitLab | [real-vscode-playwright.md](references/real-vscode-playwright.md)       |
| 5     | The user tries it themselves                             | [beta-build.md](references/beta-build.md)                               |

Read [pitfalls.md](references/pitfalls.md) before layer 2 or above; each entry
cost real time once.

Layers 2 to 4 start a real VS Code. Agents run them in the **headless box**, a
Linux container with its own display, so no window takes the user's screen,
keyboard or clipboard: [headless-box.md](references/headless-box.md). The host
commands stay for macOS-only checks and for a person who wants to watch.

## Quick start

```sh
source ~/.nvm/nvm.sh && nvm use 24.22.1 >/dev/null   # every shell, every layer
npm run lint && npm run test:unit                     # layer 1, on the host
npm run test:integration:headless                     # layer 2 in the box
npm run test:go:headless                              # layer 3 in the box
node scripts/headless.mjs vscode --vsix <file> --folder <checkout>  # layer 4 in the box
```

Layer 4 then drives VS Code with `playwright-cli attach --cdp=...`; see its
reference. On the host, layer 4 starts VS Code with `scripts/launch.sh`.

## Proving a test means something

A new integration or runner test must fail without the change. Comment out the
feature's registration (for example `registerReviewLanguageFeatures(context);`
at `src/desktop/extension.ts:248`), run the suite, confirm exactly the new tests
fail, then restore the line. Record the red and green counts.

## Safety

- The token is never typed, printed, logged or written to a file. Layer 4 signs
  in through `GITLAB_WORKFLOW_INSTANCE_URL`/`GITLAB_WORKFLOW_TOKEN`
  (`src/desktop/accounts/account_service.ts:38`), filled from `$GITLAB_HOST` and
  `$GITLAB_TOKEN` by `launch.sh` or `scripts/headless.mjs vscode`. Never echo
  those variables.
- Ask before anything other people can see on GitLab: pushing a branch, opening
  a merge request, posting a comment or upload, retrying a CI job.
- Delete every test comment you post, through the API, before finishing.
- Every VS Code you start gets a throwaway profile; kill it and delete the
  profile afterwards. `playwright-cli detach` does not stop VS Code; in the
  box, `node scripts/headless.mjs stop --port <port>` does both.
- Screenshots go under `docs/plans/` (ignored). Check them for tokens or
  personal data before sharing.
- A beta version bump in `package.json` is never committed.
