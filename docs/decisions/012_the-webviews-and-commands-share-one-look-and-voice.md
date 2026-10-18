# 012 - The webviews and commands share one look and voice

**Status:** accepted - 2026-10-18

**Plan:**
[docs/plans/007_consistent-webview-and-command-ux.md](../plans/007_consistent-webview-and-command-ux.md)
records the detailed investigation and implementation path.

## Context

The fork added the Overview, the side-by-side diff and a set of commands at
different times, and each picked its own conventions. The same merge request
thread was a 6px card with a **Resolved** pill, a relative date and a composer
without preview in the Overview, and a 3px card with a text badge, a
`toLocaleString()` date and a composer with preview, paste and Escape in the
side-by-side diff. `mr_diff/src/styles.css` read `--vscode-*` directly, 62 times
without a fallback. A failed image upload was a notification in the native
review and inline text in the side-by-side card, although decision
[003](003_pasted-images-upload-to-the-merge-request-project.md) says it is a
notification. `open_jira_issue.ts` swallowed a 401 that the identical lookup in
the merge request actions let through. Command titles, categories, menus and
setting descriptions mixed styles.

The decision is constrained by:

- Both webview CSPs and the side-by-side `messages.ts` contract stay as they
  were (decisions [006](006_side-by-side-diff-is-an-opt-in-webview.md),
  [010](010_the-overview-is-themed-by-vs-code-tokens.md)).
- `webviews/vue` and `webviews/vue2` are independent packages; `issuable` and
  `mr_diff` are two Vite builds of one package and may share source.
- The native review, the `native` viewer default and the off-by-default local
  change buttons (decision
  [007](007_local-change-buttons-are-off-until-turned-on.md)) are untouched.
- Upstream commands, settings and messages are not renamed.

## Evidence

Node 18.17.0, Vite 4, Vitest, root Prettier 3.0.3, 2026-10-18.

| Check                                                                        | Result                                                                          | Consequence                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `@shared` alias in `vite.config.shared.js` and `vitest.config.js`            | both builds and a probe spec resolve `@shared/...`                              | one folder, no per-webview copies                           |
| ESLint `import/no-unresolved` on `@shared/...`                               | resolved by `eslint_shared_resolver.cjs`, which defers to the node resolver     | the import rules keep working on shared files               |
| Built Overview CSS after moving `tokens.scss` and `_mixins.scss`             | byte-identical                                                                  | the move changed no styles                                  |
| `var(--vscode-` outside `shared/styles/tokens.scss`; hex or `rgb(` in styles | no match in `webviews/vue/*/src` or `webviews/vue/shared`                       | one file maps VS Code tokens for both webviews              |
| Four themes, both webviews, headless Chromium                                | same card, badge, date, avatar, Reply and alert in both; diff colours preserved | the side-by-side diff reads like the Overview               |
| `npm run test:unit`, `vitest run`                                            | 1463 and 255 tests pass                                                         | label changes are asserted, not loosened                    |
| `.vsix` size                                                                 | 8,263,151 bytes                                                                 | the shared code adds no dependency; `dayjs` was already one |

## Decision

The Overview and the side-by-side diff render each shared concept from one set
of tokens, styles and components, and host flows and fork commands follow one
error, notification and copy policy.

### Webviews

- **Tokens.** `webviews/vue/shared/styles/tokens.scss` is the one file that
  reads `--vscode-*`, with the fallback chain of decision 010; it now also
  declares the `--gl-diff-*` line, word, gutter and fill colours, still sourced
  from `--vscode-diffEditor-*`. `_mixins.scss` holds the text button, toolbar
  button, focus ring, section heading, tint and composer tab mixins. Monaco's
  TypeScript theme in `mr_diff/src/view/diff_view.ts` keeps its literal
  fallbacks, since Monaco reads colours, not CSS.
- **Shared code.** `shared/styles/markdown.scss` styles every comment body and
  Jira link; `shared/utils/date.js` formats relative, absolute
  (`MMM D, YYYY h:mma [GMT]ZZ`) and ISO dates; `shared/utils/keyboard.js` gives
  the visible submit shortcut; `shared/components/` holds `UserAvatar.vue`,
  `TimeAgo.vue` and `ResolvedBadge.vue`. The composers (`CommentForm.vue`,
  `CommentBox.vue`) and the thread cards (`Discussion.vue`, `ThreadCard.vue`)
  stay separate and share styles and helpers only.
- **Thread.** A 6px card with a neutral border; a resolved thread is dimmed when
  folded. A resolvable thread shows a **Resolved** pill with the `pass` codicon
  or an **Unresolved** pill. Dates are relative text in a `<time datetime>`,
  with the absolute date in the tooltip. Avatars are 20px on the first note and
  16px on replies, with `alt=""` beside the visible name.
- **Composer.** Write and Preview tabs, paste and drop of images, Escape cancels
  a reply, and a visible `⌘+Enter` or `Ctrl+Enter` hint. A reply submits with
  **Reply**, a new comment with **Comment**. The Overview gained the one host
  message this needs, `uploadImage`, which calls `uploadAttachments()` for the
  merge request's project as decision 003 requires.
- **States.** A save error is a boxed alert from the `--gl-error-*` tokens with
  the host's message, and the draft is kept. Loading is `role="status"` with
  `aria-busy` and reads `Loading…`. Icons are codicons: inline SVG in the
  Overview, the codicon font `mr_diff` already ships elsewhere; no text glyphs
  such as `▸`, `→` or `×`.

### Host

- **Errors.** A failed image upload is a notification through `handleError` on
  every surface; the side-by-side card also keeps its inline message. A 401 is
  checked by `src/desktop/gitlab/is_unauthorized.ts` and reported through
  `handleError` everywhere, including the Jira lookup, which still falls back
  to the branch's keys.
- **Merge requests.** A merge GitLab refuses with 405 or 406 is a warning with
  **Open in GitLab**. Picking an unavailable action shows its reason instead of
  closing silently. Local-only commits left on the checked-out branch are a
  warning. The side-by-side panel has the merge request icon, and copying or
  reverting a local change shows a status bar message.
- **Quick picks.** Placeholders start with **Select**, and every fork quick pick
  sets `ignoreFocusOut`. Jira items read `Open KEY in Jira` with their source as
  the description, capped by `MAX_JIRA_ITEMS` in `jira_keys.ts` in the sidebar,
  the actions pick and the command.

### Commands and copy

- **Commands.** Fork command titles are Title Case, end in `…` when they ask for
  more input, and use `"category": "GitLab"`. **Open Changed File in
  Side-by-Side View** is inline on a changed file. **Open Jira Issue** appears
  only when `gitlab.jira.url` is set, in the palette and on merge request items.
  **Merge Request Actions…** sits at the same `navigation` position on the
  review diff, the side-by-side panel and the Overview.
- **Settings.** Fork settings use `markdownDescription` in full sentences ending
  in a period; the README documents both `gitlab.mergeRequestDiff.*` settings.
- **Copy.** Messages are sentences in sentence case ending in a period, spell
  out "merge request", write `!42` and branch names bare, use "can't",
  "couldn't" and "didn't", use `…` (U+2026), and the link out is always **Open
  in GitLab**. Strings written by upstream keep upstream's wording.

## Consequences

- One thread reads the same in both webviews, and a new webview starts from
  `shared/` rather than its own palette.
- The Overview's host contract grows by one message, `uploadImage`; no token
  reaches the webview.
- Shared components tie the Overview and the side-by-side diff together: a
  change to a badge or date now changes both, and both test suites cover it.
- Mermaid's failure line now reads `The diagram couldn't be rendered: …`, and
  the side-by-side diff's tokens live outside `issuable/`; decisions 010 and 011
  describe the earlier text and path.
- Revisit when `webviews/vue` is split into packages, when a webview needs a
  different look on purpose, or when upstream ships its own design system for
  these views.

## Alternatives rejected

- **One composer and one thread component for both.** The Overview posts
  through `postMessage` and the side-by-side diff through request ids; the cards
  differ in actions and layout. Sharing the leaves (avatar, date, badge,
  markdown, mixins) gave the same look without a contract change.
- **A separate npm package for shared code.** A third `package.json` and
  install for files two Vite builds of one package can already import through
  an alias.
- **Copying the Overview's tokens into `mr_diff`.** Two token files drift, as
  `styles.css` already had.
- **Sentence case for command titles.** The fork's titles sit beside
  upstream's Title Case ones in the palette; mixing the two would add one more
  inconsistency.
