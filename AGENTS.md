# AGENTS.md

A fork of GitLab Workflow, the GitLab extension for VS Code (TypeScript, built
with esbuild, tested with Jest). Upstream is
`gitlab.com/gitlab-org/gitlab-vscode-extension` (`upstream`); this fork lives at
`github.com/tranphucbol/review-for-gitlab` (`origin`).

The fork exists for one reason: the GitLab it talks to is **13.12**, and
upstream assumes a much newer one. It is built from upstream `v3.101.1` and
carries the changes that make the extension work against that instance —
adding an account without `personal_access_tokens/self`, merge request
actions over 13.12's REST API — plus features the team wanted on top, such as
pasting images into merge request comments. Everything else is upstream's
code, and should stay recognisably so.

## Layout

The dependency arrow points one way: **desktop → common ← browser**. Code in
`src/common/` runs in desktop VS Code and in the WebIDE, so it imports nothing
from `src/desktop/` or `src/browser/` and calls no Node.js or browser API;
`import/no-restricted-paths` in `.eslintrc.json` enforces it. Upstream's
[architecture](docs/developer/architecture.md) is the long version.

- `src/desktop/extension.ts` — desktop entry point: `activate()` wires every
  command, tree view, provider and refresher
- `src/desktop/accounts/` — token and OAuth accounts, the account service, and
  `getUserForCredentialsOrFail()`, which vets a token before it is stored
- `src/desktop/gitlab/` — `GitLabService` (every desktop API call, GraphQL
  first, REST through `cross-fetch` otherwise), `getGitLabService()`, the
  project repository, and `createMultipartFormBody()`, the hand-built upload
  body
- `src/desktop/review/` — merge request review: the comment controllers, the
  comments and threads, the paste/drop provider that uploads images typed
  into a comment box, and the providers that lend a diff the local file's
  code navigation
- `src/desktop/review/side_by_side/` — the side-by-side diff: the panel
  controller, the panel that serves its webview, `messages.ts` (the whole
  host–webview contract), the local hunk applier, and the redirect that turns
  a Comments panel click into this view
- `src/desktop/mentions/` — the people `@` suggests in a comment box,
  participants first, then project members
- `src/desktop/tree_view/` — the sidebar of issues and merge requests
- `src/desktop/ci/`, `src/desktop/commands/`, `src/desktop/remotefs/` — pipeline
  views, command-palette commands, the `gitlab-remote://` file system
- `src/desktop/constants.ts` — `MINIMUM_VERSION` (13.6.0), the oldest GitLab
  the extension claims to support
- `src/desktop/types.d.ts` — ambient `Rest*` response types
- `src/common/` — code shared with the WebIDE: Duo Chat, code suggestions,
  logging, the `GitLabPlatform` abstraction, telemetry
- `src/browser/` — the WebIDE build's platform implementation
- `src/__mocks__/vscode.js` — the `vscode` module every unit test imports
- `webviews/vue/` (Vue 3) and `webviews/vue2/` (Vue 2) — independent npm
  packages for the issuable view, the side-by-side diff (`vue/mr_diff/`, Monaco
  panes over a plain TypeScript diff model) and Duo Chat; they share nothing
  with the extension or with each other. Inside `webviews/vue/`, `shared/`
  (alias `@shared`) holds the tokens, mixins, Markdown styles, date helpers and
  components the Overview and the side-by-side diff both use
- `test/integration/` — integration tests, run inside a downloaded VS Code
- `scripts/` — the esbuild builds, packaging and workspace helpers behind the
  npm scripts
- `.github/workflows/ci.yml` — the fork's pipeline on GitHub Actions: lint,
  unit tests, the `.vsix`, the GitHub Release and the Marketplace. Upstream's
  `.gitlab/` templates and `Dangerfile` stay as they came, unused
- `docs/developer/`, `docs/user/` — upstream's documentation, kept as it came
- `docs/decisions/` — the fork's append-only architectural rationale. Start at
  its [README](docs/decisions/README.md)
- `docs/plans/` — working plans. Local by default; only the template is tracked
- `.agents/skills/local-testing/` — how to test the extension, from unit tests
  to real VS Code against the real GitLab, and how to build a beta

## Documents

Two directories, and they are not interchangeable.

|          | `docs/plans/`      | `docs/decisions/`        |
| -------- | ------------------ | ------------------------ |
| Written  | before the work    | after it ships           |
| Tense    | what we will do    | what the repository does |
| Lifetime | working document   | permanent, append-only   |
| Tracked  | only `TEMPLATE.md` | every record             |

**Decision records are append-only.** Add a new numbered record; never edit,
rename or delete a committed one. When a decision changes, write a new record
that supersedes it and append one `**Status:** superseded by ...` line to the
old one — so the original reasoning stays visible. The full convention,
including naming and when a record is worth writing at all, is in
[`docs/decisions/README.md`](docs/decisions/README.md).

**Plans are untracked scratch.** `docs/plans/.gitignore` versions the policy and
the template and nothing else. Copy `TEMPLATE.md` to `NNN_short-plan-name.md`,
work in it, and distil what survives implementation into a decision record that
links back to it.

**A repository-wide rule goes in two places.** The decision record holds the
argument; the **Rules** section below holds one line linking to it. A rule that
exists only in a numbered file three directories down is a rule that gets broken
by someone acting in good faith.

**No secrets in either.** Tokens, passwords, personal data and customer
identifiers do not go in a record, an evidence table, or a pasted log line.
These are the most-copied files in the repository.

`docs/decisions/` records the fork's choices, not upstream's. Upstream's own
reasoning lives in its merge requests and in `docs/developer/`; do not
backfill records for code the fork did not write.

## Commands

**Node 24.22.1** (`.tool-versions`), matching `node:24-slim` in CI. That is the
toolchain's Node; the extension runs on VS Code's own, Node 18 in 1.82.

```sh
npm ci
npm run watch:desktop     # esbuild watch into dist-desktop/
npm run test:unit         # jest over src/
npm run test:unit -- --coverage
npm run lint              # eslint, prettier --check, and both webview lints
npm run autofix           # eslint --fix and prettier --write
npm run build:desktop     # one-off build into dist-desktop/
npm run package           # build, then the .vsix in dist-desktop/
npm run test:integration  # builds, then runs VS Code; slow, not in CI
```

`npm run lint` recurses into `webviews/vue` and `webviews/vue2`, so run
`npm ci` in both once before it. Prettier checks every `*.md`, including this
file and every decision record.

To run the extension, open the repository in VS Code and start **Run
Extension** from `.vscode/launch.json`; its pre-launch task is the desktop
watcher.

CI is GitHub Actions. On every pull request and push to `main` it runs `lint`
and `test-unit` in parallel, then `package`, which keeps the `.vsix` and its
checksum as a workflow artifact. A `vX.Y.Z` tag adds `publish`: a GitHub
Release carries the `.vsix` and its checksum as assets. An `X.Y.Z` tag, not a
prerelease, also adds `publish-marketplace`: the Visual Studio Marketplace as
`tranphucbol.review-for-gitlab`, signed in through a federated Azure identity
in the `marketplace` environment with no stored secret. Nothing goes to Open
VSX.

```sh
node scripts/release.mjs patch --dry-run   # or minor, major, prerelease --pre beta, X.Y.Z
node scripts/release.mjs patch             # changelog, commit, tag, push after a prompt
```

## Rules

- **`src/common/` imports nothing from `src/desktop/` or `src/browser/`.** It
  runs in both, so it may call only the VS Code API and the `GitLabPlatform`
  abstraction. ESLint fails the build otherwise.

- **Every desktop API call goes through `GitLabService`.** Obtain one with
  `getGitLabService(projectInRepository)` or `getGitLabServiceForAccount()`,
  not `new GitLabService(...)`, so an OAuth account refreshes its token first.
  The two exceptions cannot go through a refresh: `getUserForCredentialsOrFail()`
  runs before the account exists, and `TokenExchangeService` is the refresh.

- **The GitLab to satisfy is 13.12, not gitlab.com.** A REST route, GraphQL
  field or response key added after 13.12 is unavailable here until proven
  otherwise. Code that needs one checks for it and degrades — it does not
  assume, and it does not fail a feature that could have worked without it.

- **A missing endpoint is not a bad credential.** A 404 from an endpoint newer
  than the instance means "not supported here"; 401, 5xx and network failures
  still propagate unchanged.
  [001](docs/decisions/001_a-missing-endpoint-is-not-a-bad-token.md)

- **A 401 from a merge request action is re-checked before it is called a bad
  token.** 13.12 answers a refused action and a bad token with the same 401;
  re-read the merge request, and let the error propagate only if that fails.
  [008](docs/decisions/008_merge-request-actions-are-one-quick-pick-over-rest.md)

- **The pipeline runs only what the fork can run.** It is
  `.github/workflows/ci.yml`; upstream's GitLab CI is not carried. A job that
  needs upstream's infrastructure or credentials the fork does not have is left
  out, not left failing. The only credential is the Marketplace's, and it is an
  Azure federated identity scoped to the `marketplace` environment.
  [002](docs/decisions/002_the-pipeline-runs-only-what-this-instance-can.md),
  [023](docs/decisions/023_the-fork-is-hosted-on-github.md)

- **VS Code API newer than `engines.vscode` is declared locally and
  feature-detected.** The extension compiles against `@types/vscode` 1.82, so
  anything later — the paste-edit API, for one — is described in a local
  interface, looked up on the `vscode` module at runtime, and simply not
  registered when absent.
  [003](docs/decisions/003_pasted-images-upload-to-the-merge-request-project.md)

- **An image in a comment belongs to the merge request's project.** Uploads go
  to `mr.project_id` — the project the note is created in — not to the project
  of the local checkout, and `/uploads/` links are made absolute against that
  project before VS Code renders them. A failed upload is a notification and
  an unhandled paste, never a broken comment.
  [003](docs/decisions/003_pasted-images-upload-to-the-merge-request-project.md)

- **Multipart bodies are built by hand.** In Node, `cross-fetch` is
  `node-fetch@2`, which does not understand the global `FormData`.
  `createMultipartFormBody()` is the one place that writes a boundary.
  [003](docs/decisions/003_pasted-images-upload-to-the-merge-request-project.md)

- **The side-by-side diff replaces the native diff and leaves the native review
  code alone.** Every changed file opens in it; `vscode.diff` stays only for
  media and for files the view can't show, and a plain `gl-review://` tab, such
  as the Comments panel opens, is redirected to it unless
  `expectPlainReviewEditor()` announced it. The native comment threads are
  still created, so the Comments panel lists them. The webview gets no tokens,
  does every write through `GitLabService` on the host, and shares
  `buildDiffPosition()` and `uploadAttachments()` with the native review rather
  than copying them. A local file is changed only when
  `gitlab.mergeRequestDiff.showLocalChangeButtons` is on, and only by an
  unsaved `WorkspaceEdit` after its content is checked.
  [006](docs/decisions/006_side-by-side-diff-is-an-opt-in-webview.md),
  [007](docs/decisions/007_local-change-buttons-are-off-until-turned-on.md),
  [020](docs/decisions/020_the-side-by-side-diff-replaces-the-native-diff.md)

- **A comparison of two merge request versions is read-only except where the
  position is known.** The "reviewed" record stays in `globalState` and moves
  only on **Mark as Reviewed** or Approve; a comparison is a synthetic
  `RestMrVersion` built from `repository/compare`; a new comment goes only on
  the right side of one ending at the latest head, positioned against the real
  latest version; a thread URI carries the same `change` as the diff that shows
  it.
  [019](docs/decisions/019_a-reviewer-sees-the-changes-since-their-last-review.md)

- **Jira links are built on the host from `gitlab.jira.url`.**
  `src/desktop/jira/jira_keys.ts` is the one matcher; webviews only append a
  matched key to the prefix the host sends. Nothing calls Jira, a stored comment
  body never gains a generated link, and code and existing links are never
  rewritten.
  [009](docs/decisions/009_jira-keys-link-to-a-configured-jira.md)

- **People to mention come from `getMentionCandidates()` on the host.** Every
  comment box asks it, the native one through a completion provider and the
  webviews through a message; a failed read degrades to fewer people, never a
  notification.
  [018](docs/decisions/018_typing-at-suggests-people-from-the-issuable.md)

- **Reactions are read after the comments render, one REST read per note.**
  13.12's GraphQL `Note` has no `awardEmoji`; reads run six at a time and fail
  quietly, writes go through `awardEmojiAdd`/`awardEmojiRemove` by name, and the
  emoji list is the instance's `/-/emojis/1/emojis.json`, never a bundled copy.
  [024](docs/decisions/024_reactions-on-comments-are-read-per-note-over-rest.md)

- **No literal colours in webviews; use `--vscode-*` tokens with a fallback.**
  In `webviews/vue/` only `shared/styles/tokens.scss` reads `--vscode-*`; the
  Overview and the side-by-side diff use its `--gl-*` tokens, and a concept both
  show (thread, note, date, badge, composer, error) comes from `shared/`.
  [010](docs/decisions/010_the-overview-is-themed-by-vs-code-tokens.md),
  [012](docs/decisions/012_the-webviews-and-commands-share-one-look-and-voice.md)

- **Fork commands, messages and quick picks share one voice.** Title Case
  command titles under `"category": "GitLab"`, `…` when more input follows;
  messages are sentences ending in a period; failures go through `handleError`;
  quick picks start with **Select** and set `ignoreFocusOut`. Upstream's own
  strings stay as they are.
  [012](docs/decisions/012_the-webviews-and-commands-share-one-look-and-voice.md)

- **A webview's lazy chunks are written under its own `assets/`; anything
  outside `dist/<webview>/` is not shipped.** `vite.config.shared.js` sets
  `chunkFileNames` and turns `modulePreload` off, since a preload path is
  absolute and a webview cannot resolve it.
  [011](docs/decisions/011_mermaid-renders-lazily-in-the-overview.md)

- **The toolchain's Node is not the extension's.** Builds and tests run on
  Node 24; the bundle runs in VS Code 1.82's Node 18. esbuild's
  `--target=node16.13`, `tsconfig.json`'s `ES2019` and `@types/node@13` keep
  the source to what that runtime has; raising them is a decision about which
  VS Code the fork supports, not a toolchain upgrade.
  [021](docs/decisions/021_the-toolchain-runs-on-node-24.md)

- **Stay close to upstream.** Prefer the smallest change in upstream's file
  over a parallel copy of it, keep upstream's naming and structure, and keep
  fork-only modules few and obvious. Every line that differs from upstream is a
  line someone has to carry across the next rebase.

- **Commits are Conventional Commits.** CI no longer lints them, but
  `npm version` builds `CHANGELOG.md` from them with the Angular preset, so an
  unconventional message is a change the changelog never mentions.

- **A fork release says it is one.** `npm version` bumps `package.json` and
  writes the `CHANGELOG.md` entry; `scripts/release.mjs` points any upstream
  link in it at the fork's own project, repeats the "Fork release" paragraph,
  and tags `vX.Y.Z` on the default branch; the tag's workflow run creates the
  GitHub Release with the `.vsix` attached using `GITHUB_TOKEN` alone, and
  publishes an `X.Y.Z` to the Marketplace. Only an admin can create, move or
  delete a `v*` tag. The Marketplace line started at 0.0.1; the tags v3.101.1
  to v3.107.1 belong to the old ID and are not the latest release.
  [005](docs/decisions/005_a-release-tag-publishes-the-vsix-as-a-generic-package.md),
  [014](docs/decisions/014_the-release-is-created-with-the-job-token.md),
  [015](docs/decisions/015_the-extension-is-published-to-the-marketplace.md),
  [016](docs/decisions/016_the-marketplace-extension-starts-at-0-0-1.md),
  [023](docs/decisions/023_the-fork-is-hosted-on-github.md)

- **The extension is `tranphucbol.review-for-gitlab`, "Review for GitLab".**
  Code that looks itself up with `vscode.extensions.getExtension()` or builds a
  `vscode://` URI uses that ID, not upstream's `GitLab.gitlab-workflow` or the
  retired `tranphucbol.jetbrain-gitlab`; commands, views and `gitlab.*`
  settings keep upstream's names. The name, description and README use no
  third-party brand except to credit upstream and to say the extension is not
  affiliated with GitLab Inc. or JetBrains s.r.o.
  [015](docs/decisions/015_the-extension-is-published-to-the-marketplace.md),
  [022](docs/decisions/022_the-extension-is-review-for-gitlab.md)
