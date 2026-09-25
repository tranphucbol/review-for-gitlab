# 003 - Pasted images upload to the merge request's project

**Status:** accepted - 2026-09-13

## Context

A review comment is often a screenshot and one line. In the merge request
review, the comment box is a text document on the `comment:` URI scheme, and
pasting an image into it did nothing useful: VS Code's built-in Markdown paste
handler tries to save the image next to the document, and `comment:` has no
file system to save into. The reviewer had to open GitLab in a browser to
attach it.

The decision is constrained by:

- `engines.vscode` is `^1.82.0`, and the extension compiles against
  `@types/vscode` 1.82. `DocumentPasteEditProvider` became stable API only in
  1.97, and its kind type was renamed in 1.98.
- In Node, `cross-fetch` is `node-fetch@2`, which does not understand the
  global `FormData`.
- A note is created in the merge request's project, which is not always the
  project of the local checkout — a fork's merge request into its upstream is
  the common case.
- An upload returns project-relative Markdown, `![image](/uploads/<secret>/image.png)`,
  and VS Code renders only absolute URLs.
- The paste is a convenience. It may not break typing a comment, and it may not
  break anything on a VS Code that lacks the API.

## Decision

`CommentAttachmentProvider` in `src/desktop/review/` handles paste and drop on
the `comment:` scheme. It finds the merge request behind the box from the URI's
authority, which is the comment controller id; `CommentControllerProvider` now
keeps an `MrCommentContext` per controller for that lookup. It uploads every
image to `POST /projects/:mr.project_id/uploads` and inserts the Markdown
GitLab returns.

- **Where the bytes come from.** Image items in the data transfer (a clipboard
  image, named `image.<ext>` from its type); otherwise image files named in
  `text/uri-list`, recognised by extension — never both, so a pasted file is
  not uploaded twice.
- **Which project.** `mr.project_id`, because that is where the note lives and
  where its `/uploads/` link resolves.
- **Absolute links.** `makeMarkdownLinksAbsolute(markdown, projectWebUrl)` now
  takes the project URL. Fetched notes get it from `GitLabService` as before; a
  note just created or edited is rendered by `GitLabComment` against the
  project URL taken from the note's own URL, so the image shows without a
  reload.
- **The upload body.** `createMultipartFormBody()` writes a single-file
  `multipart/form-data` body with a random boundary and HTML-spec name
  escaping; `GitLabService.uploadFile()` sends it through the same
  `crossFetch` as every other REST call.
- **Newer VS Code API.** `document_paste_api.ts` declares the paste-edit types
  the extension uses and `getDocumentPasteApi()` looks them up on the `vscode`
  module at runtime, accepting either the 1.97 or the 1.98 kind. When they are
  absent, only the drop provider is registered and one info line says so.
- **Failure.** A box that is not a GitLab comment, a transfer with no image, a
  cancelled paste and a failed upload all return `undefined`, so VS Code's
  other providers get the paste. A failed upload also shows a
  `UserFriendlyError` naming the project.

```text
paste/drop in comment://gitlab-mr-<ref>/... -> MrCommentContext
  -> GitLabService.uploadFile(mr.project_id) -> upload.markdown -> insert
```

## Consequences

- Pasting or dropping a screenshot into a review comment uploads it and shows
  it in the thread, on VS Code 1.97 and later for paste and on every supported
  version for drop.
- Upload errors surface as a notification; the comment text is untouched.
- A fork-only provider and a local copy of API types now live in upstream's
  `review/` directory. When `engines.vscode` reaches 1.97,
  `document_paste_api.ts` can be replaced by the real types.
- Revisit if the extension moves off `node-fetch@2`: the hand-built multipart
  body can then become `FormData`.

## Alternatives rejected

- **Raise `engines.vscode` to 1.97 and use the typed API.** Drops users on older
  editors to save one small file of declarations.
- **Upload to the local checkout's project.** Its `/uploads/` link does not
  resolve from a note in another project, so the image breaks for everyone but
  the author.
- **Add a `form-data` dependency.** A package for one request whose body is a
  header, the bytes and a trailer.
- **Save the image to disk and insert a relative link.** The note is read on
  GitLab, where a path on the reviewer's machine means nothing.
