# 008 - Merge request actions are one quick pick over REST

**Status:** accepted - 2026-10-17

**Plan:** [docs/plans/004_merge-request-actions.md](../plans/004_merge-request-actions.md)
records the detailed investigation and implementation path.

## Context

Approving, merging or closing a merge request meant leaving VS Code for the
browser, even when the review had just happened in the editor.

The decision is constrained by:

- The instance is GitLab 13.12 CE. Approvals exist but return no rules or
  required counts; GraphQL has `mergeRequestSetDraft` but no approve or
  reviewers mutation.
- On 13.12 a refused action and a bad token answer with the same 401 body, and
  decision [001](001_a-missing-endpoint-is-not-a-bad-token.md) already says a
  status code alone must not be read as a bad credential.
- Every desktop API call goes through `GitLabService`.

## Evidence

Probed on project 12817 with a throwaway merge request, 2026-10-17.

| Check                                                | Result                                                         | Consequence                                            |
| ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `POST .../approve` with a bad token; `GET /user` too | both 401 `{"message":"401 Unauthorized"}`                      | the body cannot tell a refusal from a bad token        |
| `POST .../approve` twice                             | 201 both times                                                 | approving again is not an error                        |
| `POST .../approve` or `PUT .../merge`, stale `sha`   | 409 `SHA does not match HEAD of source branch`                 | 409 means new commits; every write explains it         |
| `PUT .../merge` on a draft or closed MR              | 405                                                            | re-read the MR and name the first blocker              |
| `POST .../cancel_merge_when_pipeline_succeeds`       | 201 even when nothing was set, body `"status":"error"`         | the body is read, not just the status                  |
| `POST .../unapprove` when not approved               | 404                                                            | "you had not approved" plus a refresh                  |
| `PUT` merge request with `{}`                        | 400                                                            | an unchanged edit sends nothing                        |
| `PUT` with `add_labels` naming an unknown label      | 200, label created on the project                              | the label picker offers existing labels only           |
| `mergeRequestSetDraft` on 13.12                      | works; `iid: String!`; errors in payload or top-level `errors` | draft and ready use GraphQL; the first error is shown  |
| Project `squash_option`                              | absent on 13.12                                                | the merge options pre-check the merge request's squash |

## Decision

`gl.mergeRequestActions` opens one quick pick of actions for one merge request,
and every action is a `GitLabService` call made on the host.

- The pick offers approve or revoke, merge, merge when the pipeline succeeds,
  cancel the automatic merge, mark as draft or ready, edit reviewers, assignees
  and labels, close and reopen. `availableActions()` decides what is offered
  from the merge request detail and its approvals; what is not offered is listed
  under "Not available" with the reason. Nothing is polled; while GitLab is
  still checking mergeability the pick offers Refresh.
- It opens from the sidebar, a review diff's title bar, the side-by-side view,
  the Overview and the palette. With no argument it uses the focused
  side-by-side view or Overview, then the current branch's merge request.
- Merge, cancelling the automatic merge, and close confirm in a modal. A merge
  always sends the `sha` the user saw.
- A 401 from an action is re-checked with a `GET` of the merge request: if the
  read succeeds the user is told they are not allowed; if it fails, the
  original error propagates. A 403 is a refusal. 5xx and network errors
  propagate unchanged.
- After a change the sidebar, the current-branch status, any side-by-side view
  and any Overview of that merge request reload; the merge request cache is not
  mutated.

## Consequences

- Reviewing and acting on a merge request no longer needs the browser.
- A refused action costs one extra `GET` before it is reported.
- The pick cannot show approval rules or required approvals; 13.12 CE does not
  return them.
- One command and five menu entries in `desktop.package.json` to carry across
  rebases.
- Revisit when the instance is upgraded past 13.12: newer GitLab adds
  `detailed_merge_status`, approval rules and GraphQL mutations that could
  replace parts of this.

## Alternatives rejected

- **Buttons in a merge request webview.** Another host–webview contract and a
  second place for state to go stale; the quick pick uses VS Code's own
  components.
- **GraphQL for everything.** 13.12 has no approve or reviewers mutation, so it
  would be two transports anyway.
- **Hiding unavailable actions.** The user would have to guess why Merge is
  missing; the reason is the point of doing this in the editor.
- **Treating every 401 from an action as a bad token.** On 13.12 that would
  report a bad token for an account whose token is fine, when the user only
  lacked permission for one action.
- **A command per action.** Many manifest entries and menu clutter for the same
  flow; thin wrappers can be added if anyone wants keybindings.
