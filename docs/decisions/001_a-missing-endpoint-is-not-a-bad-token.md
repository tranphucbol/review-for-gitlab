# 001 - A missing endpoint is not a bad token

**Status:** accepted - 2026-09-13

## Context

Adding a token account runs `getUserForCredentialsOrFail()`, which first reads
`GET /personal_access_tokens/self` to check that the token has the `api` scope,
then reads the current user. That endpoint arrived in GitLab 15.5; the
extension claims to support 13.6 and up (`MINIMUM_VERSION` in
`src/desktop/constants.ts`), and the instance this fork serves is 13.12.

On 13.12 the route does not exist, so Grape answers 404, and the extension
reported it as "Check your instance URL and network connection". Both were
fine. No token account could be added at all — the fork's first and blocking
problem.

The decision is constrained by:

- An invalid token must still be refused when it is added, not discovered on
  the first failed call afterwards.
- The scope check is worth keeping where the instance can answer it: an
  under-scoped token fails later in confusing, feature-shaped ways.

## Evidence

| Check                                                          | Result                                  | Consequence                                             |
| -------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| GitLab API docs, personal access tokens                        | `GET /personal_access_tokens/self` 15.5 | Every instance from 13.6 to 15.4 lacks it               |
| Add a token account against the 13.12 instance, before the fix | 404, reported as a URL or network error | The failure blamed the user's input for a version limit |

## Decision

`fetchTokenScopes()` treats a `FetchError` with status 404 from that one request
as "this instance cannot tell us", logs a warning naming the instance and the
15.5 requirement, and returns `undefined`. `getUserForCredentialsOrFail()` then
skips the scope comparison and goes on to `GET /user`.

- The fallback is exactly one status on exactly one request. 401, 5xx and
  network failures propagate unchanged, so a wrong token or a wrong URL still
  fails where it did, with the message it had.
- `GET /user` still runs, so a token that cannot authenticate at all is still
  refused before it is stored.
- Where the endpoint exists, the scope check is unchanged.

## Consequences

- Token accounts can be added on every instance from 13.6 to 15.4.
- On those instances a token without `api` is accepted, and the first call that
  needs the scope fails instead. The warning in the extension log says why the
  check was skipped.
- Revisit when the instance is upgraded to 15.5 or later: the fallback becomes
  dead code and can be dropped in the next rebase.

## Alternatives rejected

- **Gate the scope check on the instance version.** Needs a version request
  first, and a version string is a worse witness than the endpoint itself:
  asking the route whether it exists is the check.
- **Drop the scope check.** Loses a useful early failure on every newer
  instance to fix a problem that only older ones have.
- **Swallow any failure of the scope request.** Would let a 401 through to
  `GET /user` and turn a clear "bad token" into a later, vaguer error — or, on
  an unreachable instance, hide the network problem behind the next one.
