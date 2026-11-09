# 024 - Reactions on comments are read per note over REST

**Status:** accepted - 2026-11-09

**Plan:** [docs/plans/016_react-to-comments.md](../plans/016_react-to-comments.md)
records the detailed investigation and implementation path.

## Context

A reviewer wanted to react to a comment with an emoji, as on the GitLab web
page, from the merge request Overview and from the side-by-side diff, and to
choose from every emoji GitLab offers.

The decision is constrained by:

- GitLab 13.12's GraphQL `Note` has no `awardEmoji` field, so the discussions
  query the views already use cannot carry reactions.
- Comments must not wait for reactions: a merge request with many notes would
  otherwise open slower than it does today.
- The webviews get no token; every read and write goes through `GitLabService`
  on the host.
- The emoji set and its characters should match what GitLab shows, without the
  extension carrying its own copy.

## Evidence

| Check (GitLab 13.12.10)                                   | Result                                                                   | Consequence                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| GraphQL `Note` fields                                     | No `awardEmoji`                                                          | Reactions are read over REST, one request per note.                |
| `GET .../notes/:note_id/award_emoji`                      | 200 for every user note, `DiffNote` included; awards carry name and user | One read per note, at most six at a time.                          |
| `userPermissions { awardEmoji }` in the discussions query | Accepted; `true` on system notes too                                     | A note can be reacted to only when it allows it and is not system. |
| GraphQL `awardEmojiAdd` / `awardEmojiRemove`              | Mounted; take the note's global ID and the emoji name                    | Writes need no award ID, which REST `DELETE` would.                |
| `/-/emojis/1/emojis.json`                                 | 200 with and without a token; 1,793 names with character and category    | The picker's list comes from the instance, not from the bundle.    |
| Packaged `.vsix` against the instance, Overview and diff  | Added and removed a reaction from each view; GitLab left as it was       | Shipped.                                                           |
| Account from `GITLAB_WORKFLOW_TOKEN`                      | Stores the placeholder username `environment_variable_credentials`       | The current user's name is read from GitLab once per account.      |

## Decision

Reactions are read after the comments render, one REST request per note, and
written through GraphQL by emoji name.

- **Read.** `readReactions()` in `src/desktop/reactions/note_reactions.ts`
  reads every non-system note's awards, six at a time, groups them by name,
  marks the current user's, and the host posts them to the webview as a
  `reactions` message after the discussions. A note whose read fails is left
  without reactions and logged; nothing is shown to the user.
- **Write.** `setReaction()` calls `awardEmojiAdd` or `awardEmojiRemove` with
  the note's global ID, then re-reads that one note. The webview toggles the
  pill at once and reverts it if the write fails, which `handleError` reports as
  "Couldn't add the reaction." or "Couldn't remove the reaction."
- **Emoji list.** `getEmojiList()` reads the instance's `emojis.json` once per
  instance and keeps it; a failed read is not kept, and the picker falls back to
  eight common emoji with "Only common emoji are available."
- **Who reacted.** The current user's name comes from `GET /user`, cached per
  account, so an account added from environment variables still sees its own
  reactions as its own.
- **One look.** `ReactionBar`, `AddReactionButton` and `EmojiPicker` live in
  `webviews/vue/shared/` and serve both views.

```text
discussions -> render comments -> readReactions (6 at a time) -> reactions message
click pill  -> toggle at once -> setReaction (GraphQL) -> re-read one note | revert
```

## Consequences

- Opening a merge request costs one extra request per user note, after the
  comments are already on screen.
- Reactions do not update live; they refresh when the discussions do.
- The native comment threads in the editor show no reactions.
- A later GitLab whose `Note` exposes `awardEmoji` could read them in the
  discussions query and drop the per-note reads.

## Alternatives rejected

- **Bundling the emoji list.** About 128 KB in every webview, and it would drift
  from the instance's set.
- **Reading reactions before rendering the comments.** Simpler state, but every
  merge request would open slower.
- **REST `POST` and `DELETE` for writes.** `DELETE` needs the award's ID, which
  would need a read first; the GraphQL mutations take the name.
- **Reactions in the native comment threads.** VS Code's comment API could show
  them, but the native threads are upstream's review code, which the fork leaves
  alone ([020](020_the-side-by-side-diff-replaces-the-native-diff.md)); the
  side-by-side diff is where the fork's reviewers read comments.
