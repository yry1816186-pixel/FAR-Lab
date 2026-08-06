---
status: reviewed
owner_role: quality-evaluation-release-council
last_verified: 2026-08-05
scope: quality invariants, test/data governance, evaluation, release gates, documentation, and OSS lifecycle
authoritative_for: [quality and release gates, evaluation and test policy]
evidence_level: mixed
related_decisions: [DEC-006, DEC-007, DEC-010]
related_requirements: [REQ-QUAL-001, REQ-QUAL-006, REQ-QUAL-007, REQ-QUAL-008, REQ-OPS-001, REQ-OPS-003, REQ-OPS-004, REQ-SCI-003, REQ-TRUST-004, REQ-TRUST-005]
supersedes: []
superseded_by: null
---

# 14 — Quality, evaluation, and release authority

Status: `DESIGN_BASELINE / NOT IMPLEMENTED / NOT APPROVED`  
Authority: normative for target quality gates, evaluation protocol, release evidence, documentation, support, and OSS governance. Repository test counts or historical reports do not override this document.  
Evidence base: `RUN-0001..0003`, `SCI-0001..0002`, `TRUST-0001`, `API-0001`, `SEC-0001..0002`, `OPS-0001`, `QUAL-0001`, `GOV-0001`.

## 1. Quality thesis

The release unit is not a binary or a verdict alone. It is one immutable candidate containing source revision, dependency lock, schemas, policy/kernel version, test data versions, build provenance, verification receipt examples, and all gate results. A green result detached from that candidate is historical evidence only.

The target product makes three separable claims:

1. receipt integrity: required bytes, identities, versions, bindings, and history can be checked;
2. policy conformance: the declared computational plan was followed within a stated threat model;
3. scientific support: the observed result meets a predeclared domain method and uncertainty policy.

Passing one dimension MUST NOT imply another. An integrity-perfect receipt may carry an invalid experiment; a statistically valid result may be unsigned; a replay may reproduce the same biased computation.

## 2. Release invariants

| ID | Invariant | Blocking evidence |
|---|---|---|
| QI-01 | Every gate names one immutable Git revision, lock digest, schema set, policy/kernel version, dataset version, and build identity. | Machine-readable candidate manifest plus signature/attestation. |
| QI-02 | Required receipt members fail closed; no optional integrity manifest, zero placeholder digest, or silent V1 downgrade. | Negative contract suite and independent verifier report. |
| QI-03 | Runs, reports, artifacts, tasks, events, and access decisions share one tenant-scoped run identity. | Concurrency/isolation tests; database constraints; API contracts. |
| QI-04 | Untrusted computation is OS-isolated with enforced CPU, memory, time, filesystem, process, and egress budgets. | Adversarial escape tests on each supported platform. |
| QI-05 | Scientific labels and threshold claims are bound to reviewed, licensed, versioned data and named expert adjudication. | Data cards, adjudication log, frozen split, confidence intervals. |
| QI-06 | Correction, supersession, withdrawal, appeal, retention, and deletion are observable end-to-end. | Scenario tests plus audit/export evidence. |
| QI-07 | Human and machine interfaces express the same state, reason code, scope, and failure semantics. | Web/CLI/API conformance suite. |
| QI-08 | A release is reproducible or explicitly reports why not; installer and artifacts are immutable and independently verifiable. | Two-party rebuild/verify report and published checksums/attestations. |
| QI-09 | Replay declares N0–N4 numeric/randomness/environment semantics and reports divergence separately from inferential/scientific agreement. | Independent cross-runner numeric/randomness vectors including threshold crossings. |
| QI-10 | Selective disclosure, low-entropy commitments, external references, trusted time and crypto renewal cannot inherit stronger assurance than their exact evidence. | Privacy/availability/time/renewal hostile corpus and offline archive recovery. |
| QI-11 | Domain states, qualified profile types, operations, Receipt V2 and viewer are governed by machine authorities/TCK rather than conflicting prose or producer code. | Schema/source-map conformance plus clean-room verifier report. |
| QI-12 | Install, upgrade, rollback, uninstall-preserve, explicit purge, docs/examples and support routes bind the same immutable candidate. | Full distribution-lifecycle and first-success qualification on every supported platform. |

## 3. Test architecture

| Layer | Required focus | Failure-oriented examples | Release use |
|---|---|---|---|
| Unit/property | canonicalization, IDs, state transitions, policy rules, statistical primitives | Unicode/number boundaries, order permutations, illegal transitions, NaN/overflow, random seeds | Every change |
| Contract | receipt V2 schema/profile, API v2, CLI JSON/exit codes, events, migrations | omitted member, unknown enum, downgrade, duplicate ID, idempotency replay, cursor expiry | Every change |
| Integration | storage + queue + isolated worker + verifier + policy registry | worker loss, stale event, partial upload, policy unavailable, clock skew, cross-run association | Every candidate |
| End-to-end | author-reviewer correction loop | new receipt, independent verify, challenge, supersede, withdraw, export/delete | Every candidate |
| Frontend/accessibility | semantic state and recovery | keyboard-only, 200% zoom, screen reader, focus after error, reduced motion, no-color semantics | Every candidate |
| CLI | TTY/non-TTY, JSONL, signals, stdin/stdout discipline | SIGINT, broken pipe, timeout, corrupt receipt, read-only FS, incompatible schema | Every candidate |
| Security/privacy | capability and data boundaries | injection, path escape, symlink race, malicious archive, egress, secret leak, tenant crossover, retention bypass | Every candidate; independent before Beta |
| Reliability | restart and replay | crash at each durable transition, queue redelivery, verifier outage, disk full, backup restore | Beta and Stable |
| Scientific | method validity and abstention | null/negative controls, OOD data, missingness, multiplicity, leakage, implausible effect, contradictory signals | Domain-profile release |
| Protocol/TCK | canonical bytes, numeric/replay, disclosure, external reference, trust time/renewal, standards projections and viewer | ambiguity, unknown critical field, predicate/subject swap, low-entropy guessing, expired/revoked material, legacy downgrade | Every protocol release; clean-room implementation |
| Distribution/docs/support | install through preserve/purge and reachable remediation | cold cache, missing native ABI, offline, old receipt, broken channel, legacy example, unsafe purge | Every platform/candidate |

Mutation testing is required for the deterministic kernel and receipt verifier, but a mutation score is diagnostic rather than a substitute for branch-specific assertions. Snapshot tests cannot be the sole oracle for verdicts, reason codes, policy decisions, or accessibility.

## 4. Test-data governance

Five distinct sets are required and MUST be content-addressed: synthetic unit fixtures; adversarial/tamper corpus; de-identified workflow recordings with consent; expert-reviewed scientific gold set; and a locked holdout owned by a reviewer independent of feature development.

For every set record source, license/consent, permitted use, data class, profile, sampling frame, version, transformations, leakage checks, annotators, disagreement, retention, and withdrawal handling. Synthetic data MUST be labeled synthetic. A model replay or fixture cannot be relabeled as an empirical result. Current `benchmark/benchmark_report.json` is retained only as an engineering regression seed because all rows are `offline_replay(fixture)` and `unreviewed` (`SCI-0001`).

Gold-label adjudication requires at least two domain reviewers for high-risk items, blinded initial judgments, a recorded disagreement taxonomy, a third adjudicator for unresolved disagreement, and an explicit `UNRESOLVED` outcome. Reviewer agreement is reported with uncertainty; consensus is not treated as ground truth.

## 5. Agent evaluation

The target agent is an optional evidence-assembly assistant outside the trust root. Evaluate it on frozen tasks with identical model, prompt, tools, network, repository/data revision, token/turn/time/cost budgets, retry count, and machine class. Save full redacted trajectories, tool results, approvals, denials, patches, costs, and terminal reason.

Report distributions and worst cases for task success, first-pass success, evidence trace completeness, unauthorized action, unsafe-action attempt, approval burden, tool efficiency, loop rate, cancellation, resume, context precision/recall, human intervention, latency, and cost. Model self-grading is never the sole evaluator. Human adjudicators are blinded to system name when feasible.

No agent result may influence a deterministic receipt decision without becoming an explicit, reviewable input. Memory, compaction summaries, and subagent outputs are untrusted context, not evidence.

## 6. Scientific evaluation

The first supported task class is limited to a preregistered two-group computational analysis over immutable tabular data, with declared endpoint, inclusion/exclusion, transformation, missing-data rule, test/effect-size/interval, multiplicity rule, seed, environment, and decision boundary (`03_STRATEGY_PRODUCT_SERVICE.md`, `07_DATA_EVIDENCE_SCIENCE.md`).

The locked evaluation must include positive, null, negative, boundary, malformed, OOD, leakage, confounded, contradictory, and intentionally incomplete cases. It reports sensitivity/specificity where meaningful, false-confirmation and false-refutation rates, abstention correctness, calibration/reliability, subgroup/error slices, trace completeness, replay agreement, reviewer agreement, confidence intervals, and every exclusion.

Provisional pre-Beta thresholds, subject to prospective power analysis, are:

- 100% rejection or explicit degraded-scope outcome for seeded required-member, digest, binding, signature, and downgrade tampering;
- 100% run/tenant isolation across the declared concurrency test set;
- at least 95% correct abstention on the locked OOD/incomplete set, with the lower 95% confidence bound reported;
- no critical false confirmation in the locked high-risk negative set; if sample size cannot support a useful bound, the gate remains blocked;
- 100% trace presence for every required evidence edge; semantic correctness is separately reviewed;
- bit-identical canonical receipt payloads across supported verifier implementations, excluding explicitly noncanonical presentation;
- independent replay either matches the declared result or produces a machine-readable bounded divergence, never a silent pass.

These are target gates, not current results. Domain expansion requires a new profile, evidence set, expert owners, validity study, and release decision.

## 7. Regression and flaky-test policy

Every accepted defect receives a minimal reproducer, same-class search, regression test, affected-version range, and correction/withdrawal impact review. Baselines are immutable and versioned; threshold changes require a decision record and rerun against both development and holdout sets.

A flaky test is quarantined only with owner, issue, observed rate, risk classification, expiry of at most seven days, and a non-quarantined gate covering the same critical invariant. Retry may measure flakiness but cannot turn a failing critical test green. Deleted or weakened tests require two-person review and a traceability update.

## 8. Release gates

| Gate | Required evidence | Current status |
|---|---|---|
| G0 Strategy | PIVOT decision, non-goals, first task class, research plan, stop conditions | `CONDITIONAL`: design exists; demand not validated. |
| G1 Service closure | author/reviewer/admin responsibilities; challenge, correction, withdrawal, deletion | `DESIGNED_UNVALIDATED` |
| G2 Specification freeze | approved machine state/profile schemas; receipt/disclosure/viewer/numeric/crypto TCK; generated operation/API/CLI/Web contracts; distribution/support/docs manifests; ADRs | `BLOCKED_SPECIFICATION_CLOSURE`: 5 IRG `OPEN_DECISION` rows and 13 machine-authority gaps remain; doc 17's 7 protocol items map across several status classes (`IMPLEMENTATION_READINESS_GAP_MATRIX.md`). |
| G3 Verification-ready | clean candidate; full suite; independent verifier; isolation; migrations; traceability | `BLOCKED` |
| G4 Alpha | five author-reviewer loops; zero cross-run leakage; all P0 gates; support channel | `BLOCKED` |
| G5 Beta | powered scientific study; independent security/privacy review; restore drill; accessibility audit; reproducible release | `BLOCKED` |
| G6 Stable | two institutions, published limitations, staffed ownership/on-call, compatibility/deprecation evidence, correction drill | `BLOCKED` |

## 9. Immediate release blockers

`RB-01` no current full runtime suite in a clean supported environment (`RUN-0002`, `RUN-0003`); `RB-02` active V1 proof allows optional full integrity and referenced code (`TRUST-0001`); `RB-03` global/latest queries break run isolation (`API-0001`); `RB-04` active FEC bindings permit placeholder/empty execution evidence (`SCI-0002`); `RB-05` sandbox lacks OS resource/egress isolation (`SEC-0002`); `RB-06` scheduler uses `shell:true` (`SEC-0001`); `RB-07` container/release path is contradictory and release checksums are stale (`OPS-0001` plus repository release inspection); `RB-08` benchmark labels are unreviewed fixtures (`SCI-0001`); `RB-09` authorization, tenancy, retention, deletion, appeal, and legal ownership are not implemented/proven; `RB-10` bus factor and enforcement are unproven (`GOV-0001`).

Extension blockers: `RB-11` canonical state/profile/operation schemas are absent and older target documents conflict; `RB-12` numerical/randomness replay semantics and cross-runner vectors are not frozen; `RB-13` disclosure/low-entropy privacy, external-reference, trusted-time, renewal and preservation profiles lack machine authority; `RB-14` Receipt V2/viewer TCK and a producer-independent verifier do not exist; `RB-15` install/upgrade/uninstall-preserve/purge and first-success documentation are not candidate-qualified; `RB-16` real support/security/appeal routes and offline review exchange are absent; `RB-17` telemetry semantic/privacy conventions and live runbook evidence are absent; `RB-18` every world-class comparative dimension remains unproven.

Any P0 security, integrity, run-isolation, false-confirmation, or correction-path failure blocks release. Waivers require named accountable owner, bounded duration, affected users/data, compensating control, public limitation, and two-person approval; the five trust-root blockers above are non-waivable before external Alpha.

## 10. Documentation and support

The documentation set must include: one candidate-bound first-success path; task-based author/reviewer guides; receipt interpretation and limits; install/diagnostics/offline/upgrade/rollback/uninstall-preserve/purge; static viewer safety; admin auth/retention/backup/archive/restore/runbooks; API/CLI/schema compatibility; architecture/ADRs; detector/scientific/numeric/disclosure/trust policy cards; threat/privacy/legal basis; evaluation/TCK/independence reports; release notes; migration/deprecation; correction/withdrawal/renewal notices.

Docs-as-code gates check links, examples, schema/CLI snippets, version markers, terminology, accessibility, ownership and that each example is indelibly classified `synthetic`, `fixture`, or `real` with source/license/version and “does not prove.” Search/navigation must not lead users first to retired truth/V1 semantics. Support intake separates product fault, scientific-method dispute, security/privacy incident, and appeal/correction. Each class has a real reachable online or offline descriptor, identity strength, availability/SLA-or-no-SLA, escalation owner, audit retention, and safe public-disclosure rules. Security reports never use a placeholder/public-only contact in an external release.

## 11. OSS and lifecycle governance

Stable governance requires at least two maintainers able to release and respond to incidents, CODEOWNERS for trust/security/science, documented voting and conflict-of-interest rules, signed release provenance, a security policy with working private contact, DCO/CLA decision, license scanning, public compatibility policy, and a funded maintenance/archival plan.

Features progress `experimental → preview → stable → deprecated → removed`. Each transition records owner, evidence, compatibility, migration, telemetry/privacy impact, rollback, and support window. A repository branch, mutable installer target, or marketing date is not a release channel.

## 12. Acceptance scenarios

Each scenario uses: stable ID; given role/data/policy/revision; trigger; expected visible state and machine output; forbidden side effect; audit event; recovery; test layer; and owning gate. The mandatory scenario set is enumerated in `STATE_AND_FAILURE_MATRIX.md`, `TRACEABILITY_MATRIX.md`, and `BENCHMARK_GAP_MATRIX.md`.

## 13. What this quality system cannot prove

It cannot prove a scientific claim true, remove bias from source data, guarantee absence of undiscovered vulnerabilities, establish institutional demand, or convert provenance into authenticity without trusted identity/attestation. It can make narrower failures observable, reproducible, challengeable, and release-blocking.
