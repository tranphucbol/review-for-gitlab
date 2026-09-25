# NNN - Decision stated as an outcome

**Status:** accepted - YYYY-MM-DD

**Plan:** [docs/plans/NNN_short-plan-name.md](../plans/NNN_short-plan-name.md)
records the detailed investigation and implementation path.

<!--
Write this record after the decision has survived implementation and
verification. State what the repository now does, not what it might do.

Remove the Plan link when no separate plan exists. Keep credentials, tokens,
personal data, and other secrets out of the record.
-->

## Context

<!--
Describe the concrete problem or constraint that forced a choice. Include only
enough history for a future maintainer to understand why the obvious solution
was insufficient. Link to code and prior decisions instead of restating them.
-->

[Observed problem and its impact.]

The decision is constrained by:

- [Verified runtime, protocol, dependency, or product constraint.]
- [Existing invariant or behavior that must remain true.]

## Evidence

<!--
Optional. Keep this section when a probe, incident, benchmark, or compatibility
test is load-bearing. Record reproducible observations, versions, and outcomes;
do not paste secrets or transient credentials.
-->

| Check                             | Result            | Consequence                  |
| --------------------------------- | ----------------- | ---------------------------- |
| `[command, version, or scenario]` | [Observed result] | [How it shaped the decision] |

## Decision

<!--
Lead with one direct sentence stating the choice. Then define the enforceable
runtime behavior, ownership boundary, failure policy, and important invariants.
Use subsections only when the decision has several independently important parts.
-->

[State the chosen behavior.]

- [Where the behavior is implemented and which layer owns it.]
- [Success, failure, retry, fallback, or budget behavior.]
- [Security, compatibility, or data-integrity invariant.]

<!-- Include a small contract or flow only when prose would be ambiguous. -->

```text
input -> owner -> dependency -> output
```

## Consequences

<!-- Record both the benefit and the cost. Name a concrete revisit condition. -->

- [Capability or failure mode improved by the decision.]
- [Added complexity, dependency, asymmetry, or operational cost.]
- Revisit when [specific dependency, constraint, or product requirement changes].

## Alternatives rejected

- **[Alternative].** [Verified reason or tradeoff that made it unsuitable.]
- **[Alternative].** [Why it violated a constraint or cost more than the choice.]

<!--
Before finishing:
- Remove unused sections, placeholders, and guidance comments.
- Ensure the title and first Decision sentence describe the same choice.
- Ensure every rejected alternative explains why, not merely that it was rejected.
- Update AGENTS.md when the decision establishes a repository-wide rule.
-->
