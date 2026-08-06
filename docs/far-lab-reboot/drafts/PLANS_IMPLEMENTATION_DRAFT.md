---
status: draft
owner_role: implementation-program-lead
last_verified: 2026-08-05
scope: proposed template and lifecycle for future implementation plans; not active in this audit
authoritative_for:
  - proposed implementation plan structure
evidence_level: D
related_decisions: [DEC-010]
related_requirements: [REQ-GOV-002]
supersedes: []
superseded_by: null
---

# Draft future PLANS.md — evidence-gated implementation plans

> **DRAFT ONLY.** A future maintainer must approve its placement and reconcile it with active repository instructions.

## 1. When a plan is required

Create a versioned execution plan before work that is multi-file, longer than one bounded change, high-risk, schema/migration related, user-visible, security/privacy/science sensitive, cross-interface, release-facing, delegated, or dependent on unresolved evidence. Keep it live throughout implementation; never backfill it as a success narrative.

## 2. Required plan header

```yaml
plan_id: PLAN-YYYY-NNN
status: draft | approved | in_progress | blocked | complete | superseded
owner: <person/role>
reviewers: [<roles>]
created: YYYY-MM-DD
last_checkpoint: YYYY-MM-DDTHH:MM:SSZ
baseline_revision: <immutable commit>
workspace_snapshot: <status artifact/digest>
user_outcome: <observable outcome>
scope: [<paths/capabilities>]
non_goals: [<explicit exclusions>]
requirements: [REQ-*]
decisions: [DEC-*/ADR-*]
risks: [R-*]
release_gate: G0-G6 | none
```

## 3. Plan body template

### Purpose and observable user outcome

State who has which problem, trigger, action, expected outcome and evidence that the outcome occurred. Avoid implementation-first goals such as “add table” without user behavior.

### Context and current evidence

Record exact paths/symbols/lines, commands/results, environment, revision, interface/data/state flow, related historical decisions, unknowns and contradictory evidence. Distinguish fact, inference and hypothesis.

### Constraints and invariants

List write boundaries, protected user changes, compatibility, security/privacy/science requirements, performance/reliability targets, data/retention constraints, forbidden claims and what must remain unchanged.

### Alternatives and decision

Compare at least status quo, smallest coherent solution and one materially different alternative. State chosen option, evidence, trade-offs, reversibility, revisit trigger and who approved it. New service/database/protocol/language/agent/extension requires an ADR.

### Task graph

| Task ID | Purpose | Inputs | Outputs | Dependencies | Blockers | Parallel group | Owner | Budget | Retry | Stop condition | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|

Use `BACKLOG → READY → IN_PROGRESS → PRODUCED → VERIFIED`; exceptions are `BLOCKED`, `DEFERRED`, `REJECTED`, `CANCELLED`, `SUPERSEDED`. At most one owner writes a shared file at a time. Delegates receive objective, scope, inputs, expected output, evidence, budget and stop rule.

### Milestones and gates

| Milestone | User-visible outcome | Required tasks | Acceptance evidence | Owner | Gate | Failure decision |
|---|---|---|---|---|---|---|

Milestones are evidence transitions, not calendar labels. A missed gate changes the plan; it does not lower the gate.

### Atomic step contract

Each implementation step includes:

1. reproduce or characterize old behavior;
2. search same-class paths and failure modes;
3. define smallest change and non-goals;
4. add a meaningful failing regression/contract test;
5. implement without weakening a boundary;
6. run targeted tests and inspect actual output/diff;
7. run applicable full gates;
8. update docs/traceability/migration/rollback;
9. compare changed paths with baseline;
10. record residual risks and evidence IDs.

### Acceptance and test matrix

| Acceptance ID | Given / role / data | Trigger | Expected visible and machine state | Forbidden side effect | Failure/recovery | Test layer | Metric/threshold | Evidence artifact | Owner |
|---|---|---|---|---|---|---|---|---|---|

Include normal, empty, invalid, unauthorized, interrupted, timed-out, duplicated, concurrent, stale, partially written, downgraded, tampered, offline and rollback states where applicable. High-risk work includes adversarial and independent review.

### Data, migration and compatibility

Record schema/profile/API/CLI versions; input/output examples; forward/backward policy; checksums; backup; copy rehearsal; atomicity; old-client behavior; deprecation; affected-result query; correction; data retention/deletion and rollback. Migration is not approved without restore evidence.

### Security, privacy, science and abuse review

List assets, actors, boundaries, threats, data classes, legal/consent basis, scientific applicability, uncertainty/refusal, key/identity policy, unsafe-action cases, abuse/misuse and residual risk. Say what the change cannot prove.

### Operations and release

Define SLI/SLO impact, metrics/logs/traces, alerts, runbooks, capacity/backpressure, timeouts, retry/idempotency, backup/restore, incident handling, cost envelope, build provenance, installer/artifact verification, rollback and support/deprecation.

### Progress log and checkpoints

| Time | Task | State | Evidence produced | Commands/result | Changed paths | New risk/decision | Next atomic action |
|---|---|---|---|---|---|---|---|

Checkpoint after every coherent batch and before context handoff. Never erase a failed attempt; mark supersession and why.

### Recovery block

State repository/branch/revision, safe read-only checks, files owned by the plan, protected user paths, active task, last verified evidence, blocked conditions, rollback location and next atomic action. Do not rely on conversational memory.

### Final evidence report

Report user outcome, exact paths, requirement/decision/risk closure, commands/environments/counts, failure paths, migration/rollback/drills, security/privacy/science reviews, generated artifacts, unresolved unknowns, release-gate state and raw Git path audit. Use `DONE`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL` or `BLOCKED` literally.

## 4. Change control

- Scope expansion requires a plan revision with trigger, consequence, alternatives and approval.
- A requirement or threshold change requires a decision record; do not edit the oracle to fit observed output.
- A blocked dependency remains explicit. Work may continue only on independent tasks that cannot conceal the blocker.
- A destructive, external, deployment, release or data action requires separate current authorization even if listed in a plan.
- On cancellation, preserve evidence, identify partial state, provide safe rollback and state whether outputs can be reused.

## 5. Completion checklist

- User-observable outcome and non-goals hold.
- Every critical task is `VERIFIED`; exceptions have owner and decision deadline.
- All applicable tests/gates bind one immutable candidate.
- Failure, recovery, cancellation, compatibility and rollback are proven.
- Security/privacy/science and independent reviews are recorded.
- Docs, traceability, support and deprecation are updated.
- No unrelated/user path is overwritten.
- Final changed-path inventory and residual risk are explicit.

