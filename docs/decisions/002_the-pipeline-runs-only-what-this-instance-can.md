# 002 - The pipeline runs only what this instance can run

**Status:** accepted - 2026-09-13

## Context

Upstream's `.gitlab-ci.yml` is written for gitlab.com. Pushed to the fork on
the 13.12 instance, it never started a job: the configuration was rejected at
validation, so the fork had no pipeline at all — not a red one, none.

The decision is constrained by:

- The fork still needs a gate: lint, unit tests, and a build that produces the
  `.vsix` people install.
- The fork has no Marketplace or Open VSX credentials, no gitlab.com runners,
  and no access to gitlab.com-only projects.
- Upstream's file is the one most likely to conflict on every rebase, so a
  partial edit of it would be a cost paid repeatedly.

## Evidence

| Check                                                  | Result                                     | Consequence                             |
| ------------------------------------------------------ | ------------------------------------------ | --------------------------------------- |
| `include: template: Jobs/*.latest.gitlab-ci.yml`       | Templates ship with GitLab 14.x and later  | 13.12 rejects the include; nothing runs |
| `include: project: gitlab-org/quality/pipeline-common` | Project does not exist on this instance    | Same: invalid configuration             |
| `default: tags: [gitlab-org]`                          | No runner on this instance carries the tag | Even a valid job would wait forever     |

## Decision

The fork replaces upstream's pipeline with its own, three jobs on
`node:18-slim`, and its header comment names what was removed and why.

- `lint` and `test-unit` in the `test` stage, then `package`, which keeps
  `dist-desktop/*.vsix` for a year. That artifact is the fork's distribution.
- Pipelines run for merge requests, tags, and the default branch.
- Security scanning, docs and commit linting, integration tests and the publish
  stage are gone. Each needs gitlab.com infrastructure or credentials the fork
  does not have.
- The file is replaced whole, not patched: a rebase conflict on it is resolved
  by keeping the fork's side.

## Consequences

- Every merge request gets a pipeline that 13.12 accepts and that finishes.
- Commit messages are no longer linted, though the changelog still depends on
  them being Conventional Commits.
- Integration tests run only when someone runs `npm run test:integration`
  locally.
- Revisit when the instance is upgraded past 14.x or gains a runner that can
  run VS Code for integration tests.

## Alternatives rejected

- **Patch upstream's file.** Removing the includes and tags job by job leaves a
  file that is neither upstream's nor small, and conflicts on every rebase.
- **Keep the dropped jobs with `allow_failure`.** A job that can never pass
  trains everyone to ignore red, and invalid includes fail validation
  regardless.
- **Vendor the missing templates.** Copies security tooling nobody here
  maintains, for scans nobody here reads.
