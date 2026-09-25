# NNN - concise plan title

**Status:** planned - YYYY-MM-DD

<!--
Copy this file to `NNN_short-plan-name.md`.

Write the plan before implementation. Record facts that were checked, not facts
that are merely expected. Keep credentials and other secrets out of the plan.
Delete optional sections and all guidance comments that do not help the reader.
-->

**Follows:** [NNN](NNN_previous-plan.md), implemented and recorded as
[decision NNN](../decisions/NNN_previous-decision.md).

<!-- Use `Supersedes`, `Related`, or remove this relationship block as needed. -->

## Purpose

<!--
State the problem, why it matters now, and the outcome this work should produce.
Use a concrete request, failure, or runtime flow. Explain why the problem needs
this design rather than only describing the proposed code.
-->

## Goals

- [Observable outcome this plan must deliver.]
- [Correctness, operability, or user-facing outcome.]

## Non-goals

- [Related work deliberately excluded.]
- [Behavior that must remain unchanged.]

## Verified facts

<!--
Record the code, typings, documentation, or live probes that constrain the
decision. Include exact paths, APIs, payload shapes, versions, or measurements
when they affect correctness. Never include tokens, passwords, or credentials.

Name the GitLab and VS Code versions a fact holds for. This fork targets GitLab
13.12 and `engines.vscode` ^1.82; a fact checked against gitlab.com or the latest
VS Code is a fact about somewhere else.
-->

### [Constraint or finding]

- **Checked:** `[command, source path, documentation, or probe]`
- **Observed:** [What was actually found.]
- **Consequence:** [How this fact shapes the design.]

### [Second constraint or finding]

[Evidence and consequence.]

## Decision

<!--
Describe the chosen design as enforceable behavior. Use subsections for the
runtime flow, boundaries, data contracts, failure policy, budgets, and delivery
behavior where relevant. Put important types or payload examples here.
-->

### 1. [First design decision]

[Decision and rationale.]

```ts
// Include only contracts that make the boundary unambiguous.
type Example = {
  value: string;
};
```

### 2. [Second design decision]

[Decision and rationale.]

### Failure behavior

<!-- State partial-success, retry, timeout, fallback, and user-visible behavior. -->

- [Failure case]: [Required behavior.]
- [Budget exhaustion]: [Required degraded behavior.]

### Invariants

<!-- List rules that must stay true across every implementation phase. -->

- [Security, data-integrity, dependency-direction, or compatibility invariant.]
- [Existing behavior that must not regress.]
- [Upstream files this touches, and why a smaller change would not do.]

## File changes

### Add

- `path/to/new-file.ts` - [Responsibility.]

### Modify

- `path/to/existing-file.ts` - [Smallest required change.]

### Remove

- `path/to/obsolete-file.ts` - [Why it no longer has a consumer.]

<!-- Remove empty Add, Modify, or Remove subsections. -->

## Implementation phases

<!--
Each phase should be independently verifiable and leave the repository green.
Put compatibility spikes and high-risk assumptions before broad implementation.
-->

### Phase 1 - Prove the risky seam

1. [Minimal implementation or compatibility probe.]
2. [Verification proving the assumption.]
3. Stop and revise this plan if [explicit failure condition].

### Phase 2 - Implement the core behavior

1. [Core change.]
2. [Integration change.]
3. [Phase gate.]

### Phase 3 - Integrate and document

1. [Transport or entry-point change.]
2. [Operational/documentation change.]
3. [Complete verification gate.]

## Verification

<!-- Use this repository's actual commands. Do not invent unavailable test gates. -->

### Build and static checks

```bash
node --version         # must be v18.17.0
npm run lint
npm run test:unit
npm run package
git diff --check
```

### Runtime checks

- [Command and expected observable result.]
- [Failure or timeout path.]
- [Regression check for preserved behavior.]

### Manual checks

- [Client/environment]: [What must be observed.]

## Risks and controls

### [Risk]

**Control:** [Specific design constraint, probe, guard, or rollback condition.]

### [Second risk]

**Control:** [Specific mitigation.]

## Acceptance criteria

- [Externally observable behavior, stated as pass/fail.]
- [Correctness or safety invariant, stated as pass/fail.]
- [Verification command or probe that must pass.]
- [Documentation or operational requirement.]

## Consequences

- [Cost, complexity, dependency, latency, or maintenance consequence.]
- [Known limitation that remains after implementation.]

## Alternatives rejected

- **[Alternative].** [Why it does not satisfy the verified constraints.]
- **[Alternative].** [Tradeoff that made it worse than the decision.]

## Open questions

- **[Question].** [What evidence or decision will close it, and by when.]

<!-- Remove this section when every question is closed or explicitly deferred. -->
