---
status: reviewed
owner_role: product-design-and-interface-lead
last_verified: 2026-08-05
scope: canonical experience outcomes and mapping to detailed Web, CLI, and API contracts
authoritative_for:
  - cross-interface experience principles
  - information architecture
  - content and accessibility acceptance
evidence_level: mixed
related_decisions: [DEC-002, DEC-008]
related_requirements: [REQ-UX-001, REQ-UX-002, REQ-CLI-001, REQ-API-001]
supersedes: []
superseded_by: null
---

# 09 — Experience and interface specification

## 1. Outcome and current-state warning

The target experience lets an author or reviewer answer, within one screen or one machine response:

1. What exact claim, receipt, version and lifecycle state is this?
2. What materials, scientific profile and verification policy were used?
3. Which of the six assurance dimensions were evaluated, and what did each prove?
4. What is missing, conflicting, out of scope, failed or not run?
5. What safe next action can this role take, and how is it recovered/audited?

This specification is **not implemented or usability-validated**. The observed Web has 15 routes and useful shell/accessibility patterns, but also simulated/fixture-heavy routes, a mouse-dependent D3 view, incomplete localization/titles, no procedural-redress closure and no browser resource authorization. The CLI/API breadth similarly does not establish a shared contract. Current facts are in `02_REPOSITORY_FORENSICS.md`; detailed target Web UX is in `04_EXPERIENCE_SPEC.md`; CLI/API mechanics are in `05_CLI_API_CONTRACT.md`.

## 2. Target information architecture

```text
Workspace (local)
├── Projects
│   ├── Drafts: claim · materials · method/policy · disclosure · preflight
│   ├── Receipts
│   │   ├── Summary / six assurances / limitations
│   │   ├── Materials and provenance
│   │   ├── Checks and methods
│   │   ├── Integrity and identity
│   │   ├── Review and evidence requests
│   │   └── Timeline, correction and withdrawal
│   ├── Durable tasks
│   └── Exports
├── Review inbox
├── Policies and compatibility
├── Diagnostics/help
└── Local privacy and data settings
```

Case management, organization administration, legal hold UI, hosted collaboration, agents, marketplaces and showcase pages do not occupy v0 navigation. Existing routes with no target journey are retired or kept development-only; no empty nav placeholders.

Canonical Web routes use opaque IDs and stable deep links under `/w/local/projects/{projectId}`: `/drafts/{draftId}/{step}`, `/receipts/{receiptId}/{tab}`, and `/tasks/{taskId}`. Workspace-level routes are `/w/local/reviews`, `/w/local/policies/{policyId}/versions/{version}` and `/w/local/diagnostics/{id}`. Browser back/refresh preserves filter/tab/task state; superseded/withdrawn URLs remain safely resolvable. `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` owns the operation-to-route source map.

## 3. Interface responsibility map

| Surface | Primary users/outcome | Required scope | Must not own |
|---|---|---|---|
| Static receipt viewer | Reviewer reads package safely without installation/service | Six assurances, components/checks, limitations, timeline, machine download | Script execution, mutation, live hidden fetch |
| CLI | Author/reviewer/integrator reference workflow | List/init/inspect/preflight/compile/show/verify/replay/diff/supersede/withdraw/export/policy/task/review/doctor; TTY + JSONL | Duplicate business rules, automatic install/fix, composite “verified” |
| HTTP API v2 | Local Web and controlled adapters | Versioned resources, durable task/events, idempotency, authz, pagination, errors | Process-global latest data, synchronous long task, undocumented side effects |
| Focused local Web | Non-CLI author/reviewer | Receipt list/draft/task/detail/material/review/compare/policy journeys | Scientific adjudication, admin theatre, feature showcase |
| Admin/notification/SDK | Deferred/conditional | Only after institutional/integration demand and owner exist | Placeholder interface or implicit hosted mode |

The authoritative line-item inventory is `INTERFACE_INVENTORY.md`; target command/API schema is `05_CLI_API_CONTRACT.md`.

## 4. Cross-interface semantic contract

- Web text, CLI human output, JSONL/API fields, exports and static viewer use the same receipt/task/review states and reason IDs.
- A visible “pass” is always qualified by dimension, verification policy, scientific profile/version, scope and time. There is no aggregate confidence/trust percentage or universal traffic light.
- `UNKNOWN`, `NOT_EVALUATED`, `UNAVAILABLE`, `OUT_OF_SCOPE`, `INCONCLUSIVE`, refusal, partial, contested, superseded and withdrawn are designed outcomes, not generic errors.
- Task failure, network failure, missing dependency and cancellation cannot create or mutate a scientific verdict.
- Machine results and attributed human reviews occupy separate components/fields. “Endorsed” never rewrites deterministic bytes.
- Every error contains stable code, summary, cause/scope, completed/preserved work, retry safety, next action, diagnostic/correlation ID and documentation link.

## 5. Required page and command journeys

| Journey | Canonical operation IDs | Web | CLI | API/event | Key failure/recovery |
|---|---|---|---|---|---|
| Establish project | `project.create`, `project.get` | New-project and project shell | `project init/show` | project create/get | Duplicate/local-path conflict is explicit; no implicit global project |
| Locate/resume | `project.get`, `receipt.list`, `draft.list`, `receipt.get`, `draft.get`, `task.get`, `task.events` | Separate receipt/draft lists and filters | `project show`, `receipt list --kind receipt|draft`, `receipt show`, `task show/events` | homogeneous receipt/draft lists plus exact resources/tasks with cursor | Corrupt index rebuilds without touching receipt bytes; result kinds never mix |
| Choose/understand policy | `policy.list`, `policy.get`, `policy.evaluate` | Catalog/version/rule trace | `policy list/show/explain/check` | immutable policies + subject evaluation | Explain has no subject; check names exact subject/policy and reports unknown separately |
| Preflight/discard | `draft.create`, `draft.get`, `draft.update`, `draft.preflight`, `draft.discard` | Five-step draft, disclosure preview and explicit discard impact | `receipt init/inspect/preflight/discard` | draft/preflight resources, material inventory and terminal discard | Unsafe/partial file quarantined; discard stays workspace-bounded; no silent upload/delete |
| Compile | `draft.compile`, `task.get`, `task.events`, `task.cancel`, `task.resume`, `task.retry` | Exact draft compile step → durable task view | `receipt compile`, `task show/events/cancel/resume/retry` | `202` task + ordered reconnectable events | Stale binding refuses before task; crash/cancel/retry produces distinct attempts, no duplicate seal |
| Verify/replay | `receipt.get`, `receipt.components.list`, `receipt.component.get`, `viewer.open`, `receipt.verify`, `verification.get`, `receipt.replay`, `replay.get` | Receipt summary/detail and static viewer | `receipt show/inspect/verify`; `receipt replay` only after separate approval | receipt/component/verification/replay resources/tasks | Viewer/inspect/verify never execute research code; replay is separately approved and isolated |
| Compare/correct | `receipt.diff`, `receipt.supersede` | Semantic diff/timeline | `receipt diff/supersede` | comparison/successor + lifecycle events | Stale/concurrent successor shows conflict, never last-write-wins |
| Review/challenge | `review.create`, `review.get`, `review.request_evidence`, `review.respond`, `review.challenge`, `review.resolve`, `review.withdraw`, `review.import_exchange` | Review case, evidence request and exchange import | `review create/show/request-evidence/respond/challenge/resolve/withdraw/import`; export is the next journey | review resources/events/exchange import | Package integrity, duplicate, unauthorized, sensitive and conflicted states distinct |
| Withdraw/distribute/exit | `receipt.withdraw`, `export.create` | Subject-scoped withdrawal/export and read-only preservation/rights explanation | `receipt withdraw/export`, `project export`, `review export` | lifecycle/export tasks; governed rights/preservation transitions have no O/L v0 surface | Show standing, preservation, retained/backup/external-copy limits and owner route; no false deletion/restore button |
| Diagnose | `system.capabilities`, `system.doctor`, `system.config.get`, `system.config.explain`, `system.config.validate` | Redacted diagnostic | `doctor/config/version` | capabilities only where enabled | Never rebuild/install or print secrets automatically |

## 6. Normal, empty, loading, partial and failure states

Every component and route specifies all applicable states:

- loading/reconnecting with stale-data disclosure;
- true empty with cause-specific action and no injected demo content;
- partial data/success with component-level statuses;
- invalid/unsupported/out-of-scope/refused;
- offline, dependency unavailable, policy/trust-store unavailable;
- unauthorized/forbidden/not-found without cross-scope disclosure;
- `QUEUED`/`PREPARING`/`RUNNING`/`PAUSED`/`CANCEL_REQUESTED`/`CANCELED`/`SUCCEEDED`/`SUCCEEDED_WITH_GAPS`/`FAILED_RETRYABLE`/`FAILED_TERMINAL`/`EXPIRED`; deadline expiry carries a registered phase-specific reason such as `TASK_QUEUE_DEADLINE_EXCEEDED` or `TASK_EXECUTION_DEADLINE_EXCEEDED`, never a second timeout state;
- schema incompatible, tampered/quarantined, signature unknown/revoked;
- contested/corrected review history; superseded/withdrawn standing; archived/payload-removed preservation status with tombstone and retrieval limits;
- disk full, read-only filesystem, broken pipe, event gap, stale version and duplicate request.

`STATE_AND_FAILURE_MATRIX.md` is authoritative for trigger, visible response, allowed action, retry/cancel/resume/timeout/compensation/audit/notification/test details.

## 7. Content and visual language

- Say “receipt,” “check,” “evidence supplied,” “policy conformance,” “replay matched,” “not evaluated” and “human review.”
- Never say “truth,” “lie,” “fraud detected,” “scientist verified,” “certified,” “safe,” “authentic,” “independent” or “reproducible” without the exact bounded property and passed gate.
- Lead with claim/scope/currentness, then six assurance rows, then gaps/limits, evidence, and next action. Counts/charts cannot precede meaning.
- Color is redundant; icons have text; graphs always have an equivalent ordered table/tree; differences label added/removed/changed.
- Evidence locators and reason IDs are copyable and deep-linkable. Restricted content reveals minimal metadata only.
- Chinese/English strings are complete per shipped locale; receipt canonical bytes are locale-neutral. Dates/numbers/units show explicit standard and timezone.

## 8. Accessibility and responsive gates

Target is WCAG 2.2 AA for core workflows, verified through automated checks plus keyboard, NVDA+Firefox, VoiceOver+Safari, 200% and 400% zoom, high contrast, reduced motion and disabled-user task testing.

Required: skip link/landmarks/unique titles; logical headings; native controls; visible focus; focus restoration; error summary to first invalid input; status text beyond color; live-region restraint; dialog focus trap/return; no drag/hover/mouse-only action; accessible table alternative for every visualization; 44×44 CSS-pixel target where feasible; reflow without lost critical content; no time limit without extension; static viewer usable with scripts disabled.

Critical author, verify, challenge and correction tasks require 100% completion in the release test set and zero critical/serious accessibility defects. Automated axe results alone do not qualify.

## 9. Performance and privacy experience targets

- Locally indexed receipt list first 50 rows ≤200 ms after data ready; input response ≤200 ms; virtualize event logs after 1,000 rows.
- Long tasks show real stages/events, not fake timers or deterministic demo animation. Unknown ETA is stated as unknown.
- Analytics is off by default in Profile L/O. No claim text, raw material, prompt/response, path or identity leaves the device without an exact preview and approval.
- URL, logs, diagnostic export, clipboard and notification content minimize sensitive data; diagnostics are redacted and previewable.
- Offline never silently falls back online. Remote resolver/download actions name destination, material and credential scope.

## 10. Experience acceptance

An interface is releasable only if its complete workflow passes semantic parity, all-state coverage, interruption/recovery, permission, accessibility, responsive, localization, privacy and comprehension tests. Unimplemented surfaces are removed from navigation, not mocked. If Web cannot preserve the core contract, the CLI plus static viewer is the valid rescue path.
