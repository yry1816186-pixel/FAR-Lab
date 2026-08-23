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
| ACC-21 | ExperimentSpec derives from plan steps + hypothesis FalsificationSpec with preregistered statistical analysis and passes deterministic validation before any execution (D-081) | tested |
| ACC-22 | Dataset layer acquires real external datasets (checksum/license/lineage persisted) with seeded reproducible splits and declared leakage controls | live_verified |
| ACC-23 | Model lab builds/trains/evaluates real domain models; identical (spec, seed, env) executions reproduce identical results | live_verified |
| ACC-24 | Executed experiments produce ResultSet + StatReport with effect sizes/uncertainty under the preregistered multiple-testing policy; verdicts derive mechanically from hypothesis decision rules, never LLM judgment | live_verified |
| ACC-25 | Execution infrastructure: per-experiment environment pinning (lockfile hash), local execution with cancel/checkpoint/resume, remote device via gateway on a real Linux target | live_verified |
| ACC-26 | Experiment results feed FeedbackSignal → traceable revision and appear in export/bundle with artifact hashes | live_verified |
| ACC-27 | Adaptive quality gate: deterministic post-rank detection of weak hypothesis sets triggers exactly one bounded regeneration round with critique injection and a paraphrase guard; attempt counts stay honest in the timeline | tested |
| ACC-28 | Run-level token budget: receipts are the only spend authority; exhausted budget skips stages with a truthful reason, never gates export, and re-opens exactly the skipped stages when the cap is raised | tested |
| ACC-29 | Researcher direct hypothesis edit enters the same causal revision chain (human_expert feedback → Revision → version bump → staleness uncertainty disclosure) without a full model round-trip | live_verified |
| ACC-30 | Export produces research products: deterministic IMRaD paper projection, limitations synthesized from real counts only, BibTeX from stored metadata only, bundled reproducibly | live_verified |
| ACC-31 | Model control plane v2: explicit failover chains with source-verified semantics (fail-over error classes, cooldown, serving-route visible in every receipt) and a receipt-derived usage ledger with no invented prices | tested |
| ACC-32 | Confirmatory binding: researcher binds drafted comparisons to hypotheses with declared MDE; approval snapshots the current falsification decision rule; spec re-validation is fail-closed; StatReports disclose implied power | tested |
| ACC-33 | Research supervisor observes stage boundaries idempotently (exactly one note per boundary) as a read-only view that never becomes a second authority | tested |
| ACC-34 | Evaluator family and evaluations projection expose run-quality signals through the API deterministically | tested |
| ACC-35 | In-run iteration controller closes the falsification cascade experiment→feedback→revise(re-freeze)→re-experiment under bounded rounds/budget/no-material-delta, with one experimentLegStatus owner shared by the execute gate and the controller | tested |
| ACC-36 | Cognitive-security baseline: untrusted external content is channel-separated and explicitly marked (spotlighting) on every ingestion path, kernel trust boundaries are marked, and the loopback guard is regression-locked | tested |
| ACC-37 | Resident-agent conversation plane runs on the agent kernel with a read-tool plane, propose_action approval cards, and automated turns whose remembered grants are void (proposals always gate on the human) | tested |
| ACC-38 | Continuous verification substrate: CI green on a real hosted runner, desktop application real build, TUI package tests plus piped smoke on the real workspace | tested |
| ACC-39 | Cross-run memory substrate: far.db is the single authoritative store (no second memory DB); deterministic governance (lifecycle zod + SQL CHECK mirrors, poisoning fences own_verified to resolvable provenance, external content never derives own_* trust); retrieval is deterministic zero-LLM (FTS5 + ACT-R activation); supersession is append-only; terminal runs consolidate idempotently | tested |
| ACC-40 | Lineage storage single authority: lineage_edges + event_tags (migration v5) with adjacency + read-time traversal, deterministic backfill from existing payloads, vocabulary owned by one domain module | tested |
| ACC-41 | Exploratory CodeAct execution: TS static gate verdict computed and enforced before any process spawn (fail-closed); gated analysis runs in the sidecar restricted namespace; runtime failures inside the sandbox are visible candidate findings, never exceptions; outputs are candidate findings only — promotion stays behind deterministic confirmatory gates | tested |


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
