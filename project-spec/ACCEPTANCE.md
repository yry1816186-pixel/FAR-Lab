# ACCEPTANCE.md — Product Acceptance Contract

This file defines **what must be proven**. Live status/evidence exists only in `.control/ACCEPTANCE_STATUS.json`; do not duplicate dynamic status here.

| ID | Acceptance criterion | Target evidence |
| --- | --- | --- |
| ACC-01 | Scope remains XH-202619 Track 1 / Direction 1 / A and current competition requirements are rechecked | live_verified |
| ACC-02 | Competition release runs the officially required model route with real provider/model provenance | live_verified |
| ACC-03 | ResearchQuestion/scope/constraints persist and drive downstream work | live_verified |
| ACC-04 | Real source retrieval produces immutable source snapshots with retrievable provenance | live_verified |
| ACC-05 | Citations/source IDs resolve and claims are aligned to content actually retrieved; failures are fail-closed | live_verified |
| ACC-06 | Supporting evidence, counter-evidence, conflict and uncertainty are represented and inspectable | live_verified |
| ACC-07 | A real run produces multiple genuinely distinct hypotheses with dedup/diversity evidence | live_verified |
| ACC-08 | Hypotheses receive scientifically meaningful falsifiability/testability specifications and critique | live_verified |
| ACC-09 | Hypothesis comparison/ranking is inspectable and does not present model scores as objective truth | live_verified |
| ACC-10 | ResearchPlan is executable: variables/controls/data/method/metrics/decision or stopping/resource/risk semantics as applicable | live_verified |
| ACC-11 | Structured feedback causes a traceable revision and meaningful version diff | live_verified |
| ACC-12 | Run lifecycle, partial failure, checkpoint/resume/cancel are persisted and verified on real paths | live_verified |
| ACC-13 | ProvenanceReceipt records real model/source/tool/environment/artifact facts without fabricating missing data | live_verified |
| ACC-14 | ReproducibilityBundle can be independently inspected/replayed/recomputed to its declared evidence level | live_verified |
| ACC-15 | CLI completes the canonical workflow with real state/errors and machine-readable automation mode | live_verified |
| ACC-16 | Web workbench completes the primary researcher workflow with real controls/states, mature HCI and accessibility checks | live_verified |
| ACC-17 | Security/privacy guardrails cover secrets, permissions, injection/path/network/subprocess boundaries and fail visibly | tested |
| ACC-18 | Representative scientific workloads are evaluated against runnable strong baselines with predeclared metrics and no result cherry-picking | live_verified |
| ACC-19 | Performance/resource behavior is measured on representative workloads; no unbounded concurrency/model/tool loops and budgets are evidence-based | live_verified + benchmark artifact |
| ACC-20 | Independent engineering/scientific adversarial audit finds no unresolved critical product/scientific truth failure | live_verified |


## Completion gate

A final completion claim is allowed only when all are true:

1. all non-optional acceptance items reach their target evidence level with paths/commands/artifacts;
2. no critical blocker is open and no production-path item is `blocked`/`failed` without explicit release scoping;
3. no stub/mock/fixture/demo/synthetic fallback masquerades as production capability;
4. the canonical real user workflow has been exercised end-to-end;
5. current official competition compliance has been rechecked;
6. independent adversarial audit has inspected real repository/runtime/evidence rather than Builder summaries;
7. reproducibility claims are independently exercised to the stated level;
8. repository truth, runtime truth, scientific truth and user-visible state agree.

Run `node zcode-harness/scripts/completion-gate.mjs`; passing that deterministic gate is necessary but not sufficient for scientific/independent acceptance.
