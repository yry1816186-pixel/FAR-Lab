# EV-Layer Plan: Real Experiment Execution Layer (EEL)

- **Version**: v1.1 (2026-08-22)
- **Status**: APPROVED by user 2026-08-22 (all decision points). **P0 + P1 vertical slice EXECUTED and gate-green same day**; P2-P4 pending. Red-team: APPROVED WITH CONDITIONS — all 3 P0 rulings adopted (D-085: binding approvals + threshold provenance, state authority matrix + transactional transitions, separate far-scheduler.db + logs-as-artifacts; D-086: 10 hardening items).
- **P1 evidence**: live OpenML iris → real sklearn → CI-gated mechanical verdict → FeedbackSignal; vitest 638/638 (20 EEL tests incl. determinism double-run); tsc/eslint/secret-scan/path-hygiene green. See `.control/ACCEPTANCE_STATUS.json` ACC-21..25.
- **Canonical location note**: `.planning/PLAN.md` currently holds the near-closed Wave-Aesthetics plan (P5/P6/P7 deferred to a parallel session). This file is the staged candidate; on promotion it becomes the canonical active plan.
- **Mandate source**: user directive 2026-08-22 — an AI4S-grade research project must cover model building, experiment design & computation, dataset sourcing/composition/splitting/post-processing, ablation & comparison experiments, plus devices, dependency installation, remote gateway connection & control, and task scheduling. Current state: all "experiments" are LLM inference only.

---

## 1. Problem statement (facts first)

The product today is an 11-stage LLM pipeline (`src/app/orchestrator.ts`) that ends at `export`: question → retrieve → verify → evidence → hypotheses → falsify → rank → plan → feedback → revise → export. **Nothing after plan generation is executed.** Verified inventory (2026-08-22, all paths inspected):

| Capability area | Status | Key facts |
|---|---|---|
| Dataset pipeline (find/compose/split/process/version) | **ABSENT** | `DatasetRequirement` (`src/domain/plan.ts:42-47`) is free text; zero dataset fetch/split/preprocess code; artifact store exists but unused for data |
| Domain-model building (train/fit/simulate) | **ABSENT** | Zero sklearn/torch/numpy/pandas deps in repo; `statistics`/`metrics` plan fields are string labels validated non-empty (`src/pipeline/stages/plan.ts:86-150`), never interpreted |
| Experiment execution (ablation/comparison/matrix/stats) | **ABSENT** (eval-metrics infra partial) | `PlanStep.kind` includes `experiment`/`simulation` (`src/domain/plan.ts:8`) — display-only enum; no grid/sweep/statistical-test code; eval layer (`eval/metrics.mjs`) measures pipeline output quality, not experiment outcomes |
| Execution infra (devices/env/gateway/scheduling) | **ABSENT** (pipeline lease/checkpoint partial) | No GPU/device/SSH/venv/docker code anywhere; orchestrator has reusable lease, cancel, and intra-stage checkpoint mechanics (`src/app/orchestrator.ts:147-166,284-291`; `src/persistence/store.ts:127-173`) |

The `FalsificationSpec` (`src/domain/hypothesis.ts:36-58`) describes what would test a hypothesis; nothing performs the test. The feedback loop (`FeedbackSourceKind` already includes `experiment`/`simulation`, `src/domain/feedback.ts:6-7`) has no machine source feeding it.

**Consequence**: the core scientific loop (falsifiability → feedback → revision) terminates in prose. For an AI4S research platform this is the single largest capability gap.

## 2. Positioning and red lines

- Direction-A core (question → hypotheses → ranked falsifiable plan) stays **the orchestrating authority**. EEL is the execution subsystem that closes the loop: plan → executable experiment specs → real runs → real results → evidence → causal revision (`src/pipeline/stages/revise.ts` already consumes feedback signals).
- Constitution amendment (user-mandated, recorded properly): specs currently cap Direction-B adapters as subordinate (`AGENTS.md` §1, `project-spec/COMPETITION.md:32`, `SCIENTIFIC_MODEL.md:59,79-80`). User directive expands scope: EEL is a **first-class subsystem** with its own acceptance criteria, still servant to the Direction-A loop (experiments exist to falsify/support hypotheses, not to be the product). Amendment lands in P0 via spec updates + `DECISIONS.jsonl`.
- Scope guards: no foundation-model training; not a general ML platform; no lab instrument control; every experiment must bind to a hypothesis' FalsificationSpec or be explicitly labeled exploratory.
- Truth rules unchanged: production paths never fake/mock results; UI shows only real queue/run states; negative results and uncertainty are preserved, never summarized away.
- Compliance: EEL does not touch the model-calling route (Qwen/Bailian submission constraint, B-QWEN-LIVE-ROUTE remains user-side). EEL compute is deterministic-side (datasets/models/stats), not LLM-route-dependent.

## 3. Target architecture (E1–E6)

One invariant, one authoritative owner: domain truth in `far.db` objects table (new kinds), immutable heavy data in the content-addressed artifact store, audit in `events`, provenance in receipts. No second tracker/DB competes with these.

### E1 Experiment Spec layer (TS, `src/experiment/spec/`)
- `ExperimentSpec`: binds plan step + hypothesis `FalsificationSpec` → variables (independent/dependent/controlled), dataset refs, model-builder refs, metric definitions, statistical plan (test, α, `multipleTestingPolicy` — schema enum already exists), seeds, compute profile.
- New domain kinds in `KIND_SCHEMAS` (`src/persistence/store.ts:12-27`): `experiment_run`, `dataset_record`, `model_spec`, `result_set`, `stat_report` — Zod-validated, persisted via existing generic object API (zero DB migration).
- `checkPlanExecutability` extended: classify each plan step `runnable_now | runnable_with_data | human_required` from real registry contents, not text plausibility.

### E2 Dataset layer (TS orchestrates, Python sidecar computes)
- `DatasetRegistry` with resolvers (thin adapters, one file each): OpenML, Hugging Face datasets, PMLB, Zenodo/figshare DOI, URL+sha256, local path. Acquisition → artifact store (content hash) + `dataset_record` (source, license, checksum, variable schema).
- Composition & splitting: seeded deterministic splits (train/val/test, stratified, group-aware anti-leakage); split spec is data, fingerprinted and reproducible.
- Post-processing: declarative recipe (ordered steps JSON) executed in sidecar; every transform recorded as lineage into the provenance receipt system (new receipt kind `dataset_lineage`).
- Versioning = content hash + recipe hash; no DVC (its Git-coupled data model would compete with the artifact store).

### E3 Model Lab (Python sidecar, `experiment-runtime/`)
- uv-managed sidecar package. `ModelBuilder` registry: classical ML (scikit-learn), statistical models (scipy/statsmodels), simulation (SciPy/SymPy-defined systems), optional small-neural (torch, deferred until a real need).
- `ModelSpec` = builder id + hyperparams + seed → trained artifact + metric curves into the artifact store; training logs stream back as run events.
- Experiment code generated per ExperimentSpec from reviewed templates + LLM-drafted parameterization (LLM proposes, deterministic schema validates, human-in-the-loop on first use per template) — never free-form LLM code execution without a validation gate.

### E4 Experiment matrix & statistics layer
- Matrix generator (build-thin, full-factorial over declared factors ~150 LOC; Optuna deferred until smart search earns it): ablation = auto-derived factor-removal matrix from mechanism-tagged components; comparison = baseline suite per domain.
- Multi-seed discipline (seed list is part of the spec); results aggregate into `result_set`.
- Statistics module (statsmodels/scipy, deterministic): effect sizes, CIs, paired tests, `multipleTestingPolicy` enforcement — closes the loop between plan-level statistical design (already validated as text) and executed analysis. Output `stat_report` bound to hypotheses: supports / weakens / falsifies / inconclusive, with uncertainty preserved.

### E5 Execution infrastructure layer
- **DeviceRegistry**: `local` executor (child processes, CPU/RAM caps; Windows + Linux) + `remote` executors. Capability probe: Python version, cores, GPU presence/VRAM, disk.
- **EnvManager**: per-experiment env via uv (spec → lockfile hash → cached venv); Podman reproducibility mode optional later. Lockfile hash recorded in `experiment_run` for exact re-execution.
- **Gateway**: ssh2 (Node, MIT; verify CVE-2025-70034 patched version) — dispatch, SFTP code/data sync, heartbeat/health, log streaming; remote auto-provision via uv bootstrap. Security: key-based auth only, strict host-key verification, credentials in `.far-run/secrets.env` never in repo, gateway treated as a security boundary (least privilege user on remote).
- **Scheduler**: durable SQLite queue (same DB, new tables via migration v5): priorities, per-device concurrency, cancel/pause/resume; long-running jobs reuse lease fencing + checkpoint mechanics (epoch/step checkpoints via the `step_outputs` pattern under stage `execute`). Observability: run events + streaming logs; no invented progress percentages (real checkpoints only).
- **Entry points**: new conditional stage `execute` after `plan` (opt-in per run: requires executable specs + user enable; never silently burns compute) + `far experiment run/status/logs/cancel/compare` CLI + web `ExperimentTab` (real states: queued/running/checkpoint/resumed/failed/canceled).

### E6 Closed-loop integration
- Results → `FeedbackSignal(source: experiment|simulation)` → existing revise stage → hypothesis versioning → re-rank → plan update. Export includes experiment results, stat reports, artifact hashes in `ReproducibilityBundle.finalArtifactHashes`.
- Eval layer gains experiment-outcome metrics (effect sizes, replication rate under re-seeds) alongside existing pipeline-quality metrics.

## 4. Build vs reuse (recommendations; ratified via architecture-convergence in P0)

| Need | Recommendation | Rejected alternative & why |
|---|---|---|
| Parallel execution | joblib inside sidecar (BSD-3) | Parsl (SSH channels removed 2024, remote model in transition); Ray/Flyte (weight, service/cluster paradigm) |
| Experiment tracking | **Build thin**: extend far.db objects/events/artifacts (~300 LOC) | MLflow/DVC/Guild (second source of truth, ~100MB+, duplicate what far.db+artifacts+receipts already do) |
| Dataset resolvers | Thin HTTP adapters (OpenML/HF/Zenodo REST) | DVC data model (Git-coupled, competes with artifact store) |
| Stats/DoE | scipy+statsmodels now; thin factorial generator; Optuna later | scikit-optimize (superseded by Optuna when needed) |
| Remote exec | ssh2 (Node) + Fabric fallback inside sidecar (BSD) | Modal (hosted-only), Runhouse (daemon lock-in, early-stage) |
| Env mgmt | uv (MIT/Apache-2.0, lockfiles, fast) | conda (paid-tier ambiguity, slower); pip-tools (superseded) |
| Loop design references | MLR-Copilot decomposition, BORA hybrid LLM+optimizer loop, Sakana AI Scientist execution wrapper | — (patterns, not vendored code) |

## 5. Phases (each ends in a hard checkpoint gate)

**P0 — Convergence & governance** (no product code)
- Must: this plan approved; architecture-convergence pass on E1–E6 seams (esp. execute-stage placement, sidecar protocol stdio vs HTTP, scheduler table design); spec amendments (SCIENTIFIC_MODEL/PRODUCT/COMPETITION/EVALUATION/ACCEPTANCE: new ACC-21…ACC-2x); DECISIONS.jsonl entries; architecture-critic red-team on EEL design.
- Depends on: user approval + coordination with parallel session (owns `src/cli`, `desktop/`, DECISIONS.jsonl writer).

**P1 — Vertical slice, local-only E2E** (the proof)
- Must: one reference domain (tabular ML via OpenML/HF: programmatic datasets, CPU-cheap, quantitative FalsificationSpec fit): plan w/ experiment step → ExperimentSpec → dataset fetch+seeded split → sklearn train/eval → metrics + one statistical test → `result_set`+`stat_report` → FeedbackSignal → revise runs → export includes results. CLI experiment commands (coordinate with parallel session for src/cli). Determinism gate: same seed → identical results (green test).
- Explicitly: real path only, zero mocks; failure/cancel paths tested.

**P2 — Experiment matrix & statistics**
- Must: ablation matrix (auto-derived), baseline comparison suite, multi-seed aggregation, full statistics module with multiple-testing policy enforcement, `far experiment compare` + result tables. One real ablation study executed end-to-end, negative results honestly rendered.

**P3 — Remote execution, env & scheduling**
- Must: DeviceRegistry + uv EnvManager + ssh2 gateway + durable scheduler (priority/concurrency/cancel/resume/checkpoint) + security hardening (secret-scan, host-key verify, least privilege). Gate: real remote box executes a real experiment; kill-mid-run → resume from checkpoint works; logs stream.

**P4 — Productization & closeout**
- Must: web ExperimentTab + desktop surface (after Wave-Aesthetics P5/P6 land — avoid collision), HCI policy compliance (real states, failure UX), EVALUATION.md experiment-outcome metrics, ACCEPTANCE evidence + adversarial audit + completion-gate green.

## 6. Sequencing vs in-flight streams

- Wave-Aesthetics P5/P6/P7 (deferred, parallel session owns src/cli + desktop): EEL P1 CLI and P4 UI work coordinate behind that session; no overlapping writes.
- Submission 2026-09-05: B-QWEN-LIVE-ROUTE is user-side; EEL is not submission-blocking. Optional pre-submission slice: P1 demo-able end-to-end strengthens the AI-Scientist story if time allows — decided at P0, never at the cost of submission-critical work.
- Live re-measurement debts (W5/W9, NOVA-Test): independent of EEL; remain queued on funded routes.

## 7. Risks & anti-goals

- Scope explosion → guard: every experiment binds to a hypothesis; no general ML platform features without a Direction-A caller.
- Fake-experiment theater → guard: no mock paths in production; UI states map to real queue/exec truth; stat reports carry uncertainty.
- Infra weight → minimal-sufficient; frameworks rejected above stay rejected until evidence.
- Security → SSH boundary discipline; secrets never cross into repo/logs/prompts.
- Cross-platform (Windows host, Linux remotes) → path/shell/encoding defensiveness from day one (uv on Windows verified in P1).

## 8. User decision points (blocking P0)

1. Approve EEL scope & positioning (first-class subsystem, servant to Direction-A loop; constitution amendment).
2. Reference domain for P1: tabular ML (recommended) vs simulation/ODE first.
3. Ratify build-vs-reuse table (esp. thin-tracker instead of MLflow; ssh2+uv core).
4. Remote target reality: confirm at least one reachable Linux box (SSH key) exists for P3, or P3 stays local-cluster-simulated until hardware is provided.
5. Pre-submission P1 slice: yes/no (default no — submission safety first).
