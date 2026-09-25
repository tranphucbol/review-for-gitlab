# Decision records

Why the code is the way it is. The code says what it does; these say what else
was tried and why it lost.

A record exists so that the next person to look at a piece of code with a
puzzled expression finds the argument instead of re-running it. That is worth
paying for only when the reasoning is non-obvious and the alternatives were
plausible — which is the test for whether to write one at all.

This directory belongs to the fork. It records why the fork differs from
upstream, and why a fork-only feature is built the way it is. Upstream's
reasoning lives in its own merge requests and in `docs/developer/`; do not write
records for code the fork did not write. When a fork change is later taken
upstream or dropped in a rebase, supersede its record rather than deleting it.

## The rules

**Append-only.** You may add a new numbered record. You may never edit, rename
or delete a committed one. This is the rule everything else depends on: a record
that can be quietly revised is a record you cannot cite, and the reasoning that
was true in March is evidence about March even after it stops being policy.

Typo fixes and dead-link repairs are the only edits. Anything that changes the
argument is a new record.

**Supersede, do not overwrite.** When a decision changes, write a new record
stating the new behaviour and why the old reasoning no longer holds, and add one
line to the old record's Status:

```md
**Status:** superseded by [007](007_the-new-thing.md) - 2026-03-14
```

That line is the single permitted append. The original argument stays visible
underneath it, because "we already tried that and here is what happened" is the
most expensive thing in this directory to reconstruct.

**Write it after, not before.** A record states what the repository _does_, in
the present tense, and it is written once the decision has survived
implementation and verification. The thinking that happens beforehand belongs in
`docs/plans/` — see below. A record written in advance is a proposal wearing a
decision's clothes, and the first time it is wrong nobody trusts the directory
again.

**No secrets.** Tokens, passwords, personal data and internal customer
identifiers do not go in a record, an evidence table, or a pasted log line.
These files are the most-copied text in the repository.

## Naming

```
docs/decisions/NNN_short-kebab-title.md
```

`NNN` is the next free three-digit number — they are allocated in order and
never reused, including for a record that ends up superseded. The title is the
_outcome_, stated as a claim, not the topic:

```
good   001_a-missing-endpoint-is-not-a-bad-token.md
good   002_the-pipeline-runs-only-what-this-instance-can.md
bad    001_token-scopes.md
bad    002_ci.md
```

A reader scanning `ls docs/decisions/` should be able to reconstruct most of the
architecture from the filenames alone. A title that is a noun phrase tells them
only that the subject came up.

## Writing one

Copy [`TEMPLATE.md`](TEMPLATE.md). It is structured around the three things that
make a record worth keeping:

- **Context** — the constraint that forced a choice. Not history for its own
  sake; enough that a future reader understands why the obvious answer was
  insufficient.
- **Evidence** — optional, and load-bearing when present. A probe, a benchmark,
  an incident, a compatibility test, with versions and commands. A decision
  backed by a measurement is a decision that can be re-checked when the
  measurement stops being true.
- **Alternatives rejected** — each with _why_. An alternative listed without a
  reason is a decision that will be relitigated.

Delete every section and guidance comment the record does not need. A template
left half-filled reads as a record nobody finished.

## When a decision sets a repository-wide rule

Add it to the **Rules** section of [`AGENTS.md`](../../AGENTS.md) as one line
linking back here. That file is what a reader — human or agent — loads first;
a rule that lives only in a numbered file three directories down is a rule that
gets broken by someone acting in good faith.

## Relationship to `docs/plans/`

|          | `docs/plans/`           | `docs/decisions/`        |
| -------- | ----------------------- | ------------------------ |
| Written  | before the work         | after it ships           |
| Tense    | what we will do         | what the repository does |
| Lifetime | working document, local | permanent, append-only   |
| Tracked  | only `TEMPLATE.md`      | every record             |

Plans are deliberately untracked — see `docs/plans/.gitignore`. They are
scratch: investigation notes, phase ordering, things that turned out to be
wrong. What survives contact with the implementation gets distilled into a
decision record, and the plan is linked from it for anyone who wants the long
version.
