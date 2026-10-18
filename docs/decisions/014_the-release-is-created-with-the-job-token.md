# 014 - The release is created with the job token

**Status:** accepted - 2026-10-18

## Context

[005](005_a-release-tag-publishes-the-vsix-as-a-generic-package.md) uploads
the VSIX with `CI_JOB_TOKEN` but creates the GitLab Release with a masked
`CI_GIT_TOKEN` project variable, because on GitLab 13.12 the job token could
not create a Release. It named the condition for revisiting it: the instance
allowing `CI_JOB_TOKEN` to create Releases.

Since [013](013_the-fork-is-hosted-on-gitlab-com.md) the project, and so the
pipeline, is on gitlab.com. A personal token stored in a CI variable is a
long-lived credential tied to one person, with `api` scope over everything
that person can reach; it has to be created, rotated and kept out of logs.

## Evidence

| Check                                                                         | Result | Consequence                                |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------ |
| Scratch tag pipeline on gitlab.com: `GET /projects/:id/releases` with the job | 200    | `publish` can find an existing Release     |
| The same job: `GET /projects/:id/releases/:tag` for a tag with no release     | 404    | gitlab.com no longer answers 403 here      |
| The same job: `POST /projects/:id/releases` for the pipeline's tag            | 201    | The job token creates the Release          |
| The Release's author                                                          | pusher | It is attributed to whoever pushed the tag |

The scratch tag, its Release and its pipelines were deleted afterwards.

## Decision

`publish` sends `JOB-TOKEN: ${CI_JOB_TOKEN}` to the Releases API, as it already
does to the package registry. The `CI_GIT_TOKEN` check and variable are gone;
the pipeline needs no project variable at all.

The release list lookup stays: it costs one request, and it is correct on both
the old and the new instance.

## Consequences

- No personal token is stored in the project; anyone who can push a release
  tag can publish, and the Release is attributed to them.
- The publish job no longer runs on GitLab 13.12, where the job token cannot
  create a Release. The extension itself still targets 13.12; only its own
  release pipeline does not.
- Revisit if the project moves to an instance whose job token cannot create
  Releases.

## Alternatives rejected

- **Keep `CI_GIT_TOKEN`.** It works, but it stores a personal `api` token for
  something the job token now does with the job's own, short-lived permissions.
- **Use a project access token instead.** Better than a personal token, but
  still a secret to create and rotate for no gain over the job token.
