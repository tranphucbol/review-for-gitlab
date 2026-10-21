# 018 - Typing @ suggests people from the issuable

**Status:** accepted - 2026-10-21

**Plan:**
[docs/plans/012_mention-autocomplete-in-comments.md](../plans/012_mention-autocomplete-in-comments.md)
records the detailed investigation and implementation path.

## Context

GitLab's own comment box opens a list of people after `@`. The extension's
three comment surfaces did not: the native review's comment input, the
side-by-side diff's comment box and the Overview's comment form. A mention had
to be typed from memory, and a misspelt username notified nobody.

The decision is constrained by:

- The instance is 13.12. The autocomplete endpoint GitLab's web UI uses
  (`/-/autocomplete_sources/members`) is a session route, not part of the API a
  token can call.
- The native comment input is a VS Code editor with the `comment` URI scheme;
  the two webview boxes are plain `<textarea>`s. The side-by-side box lives in
  a Monaco view zone whose ancestors hide their overflow, and Monaco listens to
  the same arrow, Enter and Escape keys.
- A webview gets no token and does every read through the host.

## Evidence

| Check (GitLab 13.12.10)                                  | Result                                              | Consequence                                  |
| -------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| `/-/autocomplete_sources/members` with a token           | 302 to the sign-in page                             | The web UI's source is out of reach          |
| `GET /projects/:id/merge_requests/:iid/participants`     | 200, `{id, username, name, state, avatar_url, ...}` | Participants are the first source            |
| `GET /projects/:id/issues/:iid/participants`             | 200, same shape                                     | Issues get the same treatment                |
| `GET /projects/:id/users?search=` with 1 or 2 characters | 200, always empty                                   | Short queries filter one cached page locally |
| `GET /projects/:id/users?search=` with 3+ characters     | 200, prefix and infix matches on username and name  | Longer queries search on the server          |
| VS Code 1.142, real merge request, all three surfaces    | List opens on `@`, narrows, inserts `@username `    | Native suggest works in the comment input    |
| Side-by-side box near a view zone's edge                 | List drawn over the next lines, not clipped         | A teleported, fixed-position list is enough  |

## Decision

Typing `@` in any comment box suggests the issuable's participants first, then
the project's members, and choosing one inserts `@username ` in place of the
partial name.

- The host owns the list. `getMentionCandidates(service, issuable, query)` in
  `src/desktop/mentions/mention_candidates.ts` reads through `GitLabService`
  (`getParticipants()` and `getProjectUsers()`) and returns at most 20
  `MentionCandidate`s, de-duplicated by username, with absolute avatar URLs.
- Participants are cached per instance and issuable for five minutes, blocked
  users are dropped, and they are filtered locally: username prefix, then name
  or name-word prefix, then substring.
- Members: a query of three or more characters is a server search of 20; a
  shorter one filters one cached page of 100 members per project, since the
  server returns nothing for it. Members can be missing from that page on a
  project with more than 100.
- Failure is quiet. A participants 404 means members only; any other failure
  is logged and the members still come. A members failure returns the
  participants plus the text `Could not load project members.`, which the
  webview list shows in place of results. No notification, and a failed read
  is not cached.
- The native input uses VS Code's own suggest widget:
  `registerCommentMentionProvider()` in
  `src/desktop/review/comment_mention_provider.ts` registers a completion
  provider for the `comment` scheme, triggered by `@`, and resolves the merge
  request from the comment's URI as the image paste provider does.
- Both webviews use one `MentionDropdown` in `webviews/vue/shared/`. It is
  teleported to `body` and positioned `fixed` at the caret, so a view zone
  cannot clip it; it takes its keys in the capture phase and stops them only
  while it is open, so Escape closes the list before it cancels the comment,
  and Enter or Tab picks a person rather than reaching the text or Monaco. It writes through an
  `input` event so `v-model` stays the source of truth.
- The side-by-side diff asks with `searchMentions` and gets the existing
  `result` back with `mentions` and `mentionsError`; the Overview posts
  `searchMentions` and gets `mentionsFound`. Its colours come from the
  `--gl-suggest-*` tokens, which read VS Code's suggest widget colours.

```text
@que -> provider | MentionDropdown -> host -> getMentionCandidates
  -> [participants (cached), members (cached page | server search)]
  -> MentionCandidate[] -> list -> "@username "
```

## Consequences

- A mention can be picked rather than remembered, in every comment box, and the
  people already on the issuable come first.
- One more host-webview message per webview. Until the third character an
  issuable costs two reads per five minutes, participants and one members
  page; after it, one members search per pause in typing.
- The order of members changes at the third character, from the cached page's
  order to the server's.
- Revisit when the instance is upgraded past the release that lets
  `/projects/:id/users` search one or two characters, or when a group-level
  mention (`@group`) is wanted; neither is listed today.

## Alternatives rejected

- **The web UI's autocomplete sources.** They need a browser session, not a
  token.
- **A quick pick command for the native input.** It works everywhere but takes
  the user out of the text; the suggest widget already works in the comment
  editor.
- **A list positioned inside the comment box.** The side-by-side view zone
  clips it, and the box is only a few lines tall.
- **Members only, searched on every key.** The server answers one- and
  two-character queries with nothing, and the people most likely to be
  mentioned are the participants.
