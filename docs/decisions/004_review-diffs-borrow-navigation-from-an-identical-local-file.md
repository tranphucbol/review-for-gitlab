# 004 - Review diffs borrow navigation from an identical local file

**Status:** accepted - 2026-09-26

**Plan:**
[docs/plans/001_review-diffs-borrow-local-code-navigation.md](../plans/001_review-diffs-borrow-local-code-navigation.md)
records the detailed investigation and implementation path.

## Context

A merge request diff opens both sides as `gl-review:` documents, served by
`ReviewFileSystem` from git or the GitLab API. Go to Definition, Find
References and hover did nothing on them for most languages: gopls, jdtls and
most other language servers register their providers for `file:` documents
only. A reviewer had to leave the diff and open the local file to follow a
symbol.

The decision is constrained by:

- The `gl-review:` URI carries the MR, the commit and the repository root in
  its query; comment threads, commenting ranges and new comment positions all
  decode it. Changing the scheme of the diff documents would spread through
  upstream's review code.
- The local checkout is the only place a language server can resolve imports,
  and it matches the MR only when the MR branch is checked out and unchanged.
- A jump to the wrong line is worse than no jump.
- Some language servers already serve review documents themselves: the
  built-in TypeScript extension treats a non-`file:` document as an in-memory
  file and answers for it.

## Evidence

| Check                                                                                                                           | Result                                                                                                                                            | Consequence                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `vscode.executeDefinitionProvider` on a `gl-review:` `.ts` document, VS Code 1.84.2, `--disable-extensions`, no fork provider   | One location, on the review URI, from the built-in TypeScript server                                                                              | TypeScript cannot demonstrate the bug; the integration test uses a stub provider for `file:` only |
| Same, with a forwarding provider that does not check for other answers                                                          | Two identical locations                                                                                                                           | The provider asks the other providers first and steps in only when none answered                  |
| `test/integration/review_code_navigation.test.js` with a `file:`-only stub provider, registration line commented out / present  | Definition, references and hover on the review URI fail / pass                                                                                    | The forwarding is what makes `file:`-only language servers work in the diff                       |
| Same test, local file edited so it differs; base-side line the MR removed                                                       | `[]` on the review URI                                                                                                                            | Nothing is forwarded unless the content is identical                                              |
| Same test, base-side unchanged line shifted by a removed line above it                                                          | Definition on the head URI; hover range on the base line                                                                                          | Unchanged base lines borrow the head's navigation through the line mapping                        |
| Scratch runner (plan, Phase 2b): VS Code 1.84.2 with `golang.go` 0.46.1 (selector `{language: 'go', scheme: 'file'}`) and gopls | Head-side definition, cross-file definition, references and hover work; base-side unchanged line lands on the head; unsaved local edit gives `[]` | The mechanism works with a real `file:`-only language server, not just the stub                   |

## Decision

`ReviewLanguageFeatures` in `src/desktop/review/review_language_features.ts`
answers definition, type definition, implementation, references and hover for
`gl-review:` documents by forwarding the request to the local file at the same
position, when — and only when — that file has the same content.

- **Which file.** `path.join(repositoryRoot, path)` from the review URI. Empty
  file URIs (the missing side of an added or deleted file) are never forwarded.
- **Same content.** The review document and the local document, opened with
  `openTextDocument` so unsaved edits count, are compared line by line, so a
  CRLF checkout still matches. The verdict is cached per review URI and the
  version pair of both documents.
- **Other providers first.** Before forwarding, the provider runs the same
  `vscode.execute*Provider` command on the review URI while its own entry
  point returns nothing for that command and URI. If any other provider
  answered, it adds nothing, so the TypeScript server's results are not
  doubled.
- **Results.** Locations and location links in the local file are moved to
  the review URI, so a same-file jump stays in the diff; locations in other
  files are left as they are and open the local file. Hovers are merged into
  one.
- **Failure.** No local file, different content, a cancelled request or a
  forwarded command that throws all return `undefined` with a debug log line,
  never a notification.
- **Base side.** When the base document is not itself identical to the local
  file, a request on a line the MR left unchanged goes through the head: the
  line is mapped with `getNewLineForOldUnchangedLine` from the MR version in
  `mrCache`, and forwarded only if the head document is identical to the local
  file. Same-file results land on the head review URI, the side that matches
  the code they point at; a hover's range is moved back to the base line.
  Removed and changed lines, deleted files and MRs not in the cache are not
  forwarded.

```text
F12 in gl-review:/path?{commit,repositoryRoot,...}
  -> other providers answer? -> yes: nothing added
  -> local file:<root>/path identical? -> yes: same line
     -> no, base side: unchanged line -> head line, head identical to local?
     -> otherwise: nothing
  -> vscode.executeDefinitionProvider(file:<root>/path, mapped position)
  -> same-file results rewritten to the gl-review: URI (head for the base side)
```

## Consequences

- With the MR branch checked out, F12, Shift+F12 and hover work on the head
  side of a review diff, and on the unchanged lines of the base side, for any
  language whose extension serves the local file.
- A reviewer who has not checked out the branch, or has local edits to the
  file, sees no change: nothing is forwarded.
- Every forwarded request costs one extra provider round-trip on the review
  URI. A generic provider that answers for every scheme (a hover from another
  extension, for one) stops the forwarding for that request.
- A base-side jump into the same file opens the head document, not the base.
- The base side needs the MR in `mrCache`, which the MR tree view fills when
  it lists changed files; a diff opened any other way gets no base-side
  forwarding.
- One fork-only module and one line in `extension.ts` to carry across rebases.

## Alternatives rejected

- **Make the head side a `file:` URI when the checkout matches the MR.** Full
  language support, but threads, commenting ranges and comment positions all
  decode the `gl-review:` query; the change would touch five upstream files,
  and MR comment ranges would show in the regular editor for that file.
- **Forward regardless of other providers.** Doubles every TypeScript and
  JavaScript result in peek and references.
- **Skip a hard-coded list of languages (TypeScript, JavaScript).** Cheaper per
  request, but the list is a guess about which extensions serve virtual
  documents today, and it goes stale silently.
- **Map positions when the content differs.** Needs a diff between the review
  blob and the working tree on every request; error-prone, and not needed for
  the common case of a checked-out branch.
- **A status bar hint when the local file differs.** It would have to follow
  the active editor and compare contents on every switch, for a message most
  reviewers who have not checked out the branch do not need; the debug log
  says why a request was not forwarded.
- **Ask language extensions to support `gl-review:`.** Out of the fork's
  control, and a repository-relative path would still not resolve imports.
