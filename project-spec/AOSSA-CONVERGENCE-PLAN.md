# AOSSA Convergence Plan — next-phase refactor disposition (2026-08-30)

Owner directive: converge FAR-Lab into a trustworthy **AOSSA research operating
environment: Scientific Second Brain + Research Execution + Auditable Research
Record**. North star (no feature may be deleted that strengthens this chain):

`Question -> knowledge/data -> Scientific Problem Model -> hypotheses ->
evidence/uncertainty -> prediction -> design -> experiment/protocol ->
execution -> QC/processing -> analysis -> validation/replication -> conclusion
-> feedback/revision -> paper/code/data/repro bundle -> new question.`

Track 1-A (XH-202619) is a hard release constraint, not the capability ceiling.
Canonical semantics changes propagate spec -> schema -> API -> UI -> tests -> docs.
This file records the KEEP/REDESIGN/MERGE/REPLACE/DELETE dispositions and the
3-5 highest-leverage problems. Status of dynamic work lives in `.control/`.

## 1. What the system already is (verified 2026-08-30)

A complete Direction-A loop exists and is tested (2380+ root tests; live hosted-CI status is tracked in FINAL_ACCEPTANCE.json, never claimed here):
12-stage orchestrator (scope→retrieve→verify→build_evidence→generate_hypotheses
→critique/falsify→rank→plan→execute→feedback→revise→export) with bounded
iteration controller, honest truth-plane (live/mixed/replay/synthetic), claim
verbatim binding, counter-evidence search, causal revision chains, replay
bundles (`far verify`), cross-run memory (FTS5+ACT-R, single far.db), lineage
edges, agent kernel with resident conversation + approvals + skills/MCP/plugins,
Python experiment sidecar (pinned env, lockfile-hash provenance, preregistered
stats with mechanical verdicts), and (in flight, sibling lane) a paradigm-honest
ProtocolSpec/ProtocolExecution layer for work the software cannot execute
itself. The 2026-08-29 owner directive removed demo content product-wide; the
in-process test double is quarantined behind FARLAB_TEST_DOUBLE=1 (879cea1).

Honest statement of the two structural gaps this plan closes:

1. **The pipeline is LLM-first.** Every question — including well-posed
   computational ones — walks the same literature→hypothesis path. There is no
   Scientific Problem Model (variables/units, governing relations, boundary/
   initial conditions, statistical/causal premises, metrics, stop conditions,
   unknowns register) and no method selection (analytic/symbolic vs numerical
   vs statistical/causal vs optimization vs ML vs retrieval vs theorem proving
   vs domain software vs LLM). `scope.ts` refines domain/phenomena/constraints
   only (`src/pipeline/stages/scope.ts:13`, `src/domain/question.ts:33`).
2. **The execution plane is tabular-ML-only.** Sidecar ops are `dataset_audit`,
   `train_eval`, stats (`src/experiment/executor.ts:311,365,406`); dataset
   identity covers OpenML + local CSV/ARFF (`src/experiment/datasets.ts`); the
   ingest profiler covers CSV/TSV/XLSX/JSON (`src/ingest/dataset.ts`). No
   numerical/PDE leg (FEM, convergence verification), no gridded scientific
   data (NetCDF/xarray), no derived-dataset versioning with processing lineage.

## 2. Layer dispositions

| Layer | Verdict | Evidence & action |
|---|---|---|
| Domain model | **KEEP + EXTEND** | Core object graph matches the north star (SCIENTIFIC_MODEL.md §1). Protocol layer (sibling, in flight) completes the non-executable leg. ADD: `ScientificProblemModel` + `MethodSelection` (see §3). Do not touch verdict semantics (mechanical, D-081). |
| Persistence | **KEEP** | Single SQLite far.db + append-only events/receipts + content-addressed artifacts (ARCHITECTURE.md §3). New object kinds ride the same store; no second truth plane, no second memory DB (ACC-39). |
| Orchestration/workflow | **KEEP** | Stage machine + deterministic iteration controller with round/budget/no-material-delta caps; "no LLM decides whether research continues" is load-bearing (ARCHITECTURE.md §7). Problem model slots in as a scope-stage extension, not a new workflow engine. External workflow engines (AiiDA/Snakemake/Nextflow) REJECTED for the in-process loop: single-machine, single-writer lease model already proven; revisit only on real multi-node/HPC demand. |
| Agent kernel | **KEEP** | Kernel loop, tool plane, approvals, skills/MCP/plugins landed and tested (EXTENSIBILITY-PLAN 2026-08-29). Problem-model/method-selection are domain objects the kernel may PROPOSE into; deterministic code validates and freezes. |
| Memory/retrieval | **KEEP** | FTS5 + ACT-R activation, own_* trust fences, poisoning gates. Scientific-state drift under compaction already fenced (agent/compaction.ts). |
| Research runtime | **KEEP + EXTEND** | Python sidecar with thread/env pinning and lockfile-hash identity (src/experiment/python.ts). EXTEND: (a) numerical ops (FEM/ODE solvers with a-priori/a-posteriori error + convergence-order verification), (b) NetCDF/xarray dataset family, (c) runtime failure detectors (NaN/Inf, divergence, OOM) feeding the existing pause→checkpoint→resume path. |
| Experiment/protocol | **KEEP** | EEL semantics (preregistered stats, mechanical verdicts, executed-once determinism) + Protocol layer for bench/field/human-subjects/engineering/theory/archive legs with human-recorded events only. |
| Data plane | **REDESIGN (extend, not replace)** | Keep immutable DatasetRecord identity (content hash + lineage). ADD: local scientific-file acquisition (NetCDF/HDF5, xarray semantics: dims/coords/units/attrs), QC verdicts at record time, derived DatasetVersion with processing lineage. CSV/ARFF paths unchanged. |
| UI | **KEEP spine, ADD surfaces** | StudyMap spine (evidence/hypotheses/state band/actions/revisions/graph) is the audited core (IA-DECISIONS 2026-08-29). LANDED 2026-08-30: problem-model band on the map (ProblemModelBand), dataset/fem-spec surfaces in ExperimentsTab, problem model in the paper projection (Methods section). Terminal = global panel (879cea1), conversation = dock. |
| Eval | **KEEP + EXTEND** | W4R baseline contrast, rediscovery, adjudication-accuracy instruments exist (eval/). EXTEND: scenario A/B/C runs enter the same predeclared-metric discipline; no cherry-picking. |

Post-exploration FACT amendments (backend inventory, 2026-08-30): conclusion grading already exists as layered enums (5-class ExperimentVerdict, 9-band log-LR, Carneades proof standards, ScientificStateKind) — CPS-AOSSA-5 is a UNIFICATION task, not a build-from-zero; SimulationSpec (Monte-Carlo CRN) has a real executor but is CLI-only and outside the execute cascade — the numerical leg (CPS-AOSSA-2) should ride the same pattern (sidecar op + deterministic executor + mechanical verdict); the multimodal ingest lane (ingest/dataset.ts) is NOT bridged into EEL dataset_records — confirms the data-plane disposition; objects-table history is INSERT-OR-REPLACE current-state with append-only events (stateAtSeq discloses the limit) — DatasetVersion must lean on events + content-addressed archives, not table history.

DELETE list: nothing load-bearing identified at this pass beyond what the
2026-08-29 real-content purge already removed (template content in exports,
demo wording, test-double as product route). Remaining registered cleanups
(dead i18n keys done @4b7d508; api.ts ACH filter landed) are closed.

## 3. New canonical semantics — Scientific Problem Model + Method Selection

Spec owner: SCIENTIFIC_MODEL.md gains a section when the sibling protocol commit
lands (file under active edit; do not double-write). Semantics decided here:

- **ScientificProblemModel** (one per run, formed at/after scope, BEFORE
  hypothesis generation): objectives; variables with role/unit/value-type;
  formalization (problem class; governing relations with kind and assumptions;
  domain geometry; boundary/initial conditions; well-posedness notes);
  data inventory (available/partial/unavailable/unknown per item);
  statistical premises (assumptions, causal claims, identification strategy);
  metrics with definitions; stop conditions; unknowns register with
  blocking flags and resolution paths.
- **MethodSelection** (per objective): ≥2 candidate method families assessed
  `selected | viable_alternative | rejected_inappropriate | insufficient_information`
  with rationale; the selected family names its REAL validator (e.g. FEM
  convergence-order check, preregistered stat test, held-out test protocol).
  LLM proposes inside the closed schema; deterministic code owns ids,
  enum space and validation; researcher may override (recorded).
- Downstream bindings (enforced incrementally, disclosure first, then
  referential integrity): hypotheses state the objective/variables they
  address; plan methods stay inside selected families or must justify the
  deviation; ExperimentSpec metrics must exist in the problem model;
  ProtocolSpec measurement variables reconcile against the variable list.
- It is NOT a second truth plane: one owner (the run), stored like every
  canonical object, revised only through the causal Revision path.

## 4. Proof scenarios (owner-mandated, predeclared)

| # | Scenario | What it proves | Blocking gaps |
|---|---|---|---|
| A | 2D Poisson, mixed Dirichlet/Neumann BCs; FEM + adaptive refinement; weak form → implementation → convergence-order study → explanation → reproduction | method selection picks numerical, not LLM-hypothesis; real domain validator (error norms, convergence order); full provenance of a computational study | numerical sidecar ops; problem model |
| B | ~10 papers + NetCDF data: extraction → QC → baseline → split → train → validation → bounded tuning → untouched test → uncertainty → report → reproduction | real data plane end-to-end with held-out discipline and honest uncertainty | NetCDF family; dataset versioning/QC |
| C | Non-ML plan → protocol (real records) → data → analysis → revision | paradigm-honest loop for work the software cannot execute | protocol layer (sibling, in flight) |

## 5. Critical problem set (3-5 only)

1. **CPS-AOSSA-1 (P0, this lane)**: Scientific Problem Model + Method Selection
   absent — the LLM-first structural gap. Land schema + scope-stage formation +
   downstream disclosure first.
2. **CPS-AOSSA-2 (P0)**: numerical execution leg absent (FEM/ODE sidecar ops +
   convergence verification). Blocks scenario A.
3. **CPS-AOSSA-3 (P0)**: scientific data plane (NetCDF/xarray acquisition, QC
   verdicts, derived versions with lineage). Blocks scenario B.
4. **CPS-AOSSA-4 (P1)**: runtime failure detection protocol (NaN/Inf/OOM/
   divergence → pause→checkpoint→diagnose→repair→validate→approve/resume) —
   extend existing executor diagnostics, do not build a second supervisor.
5. **CPS-AOSSA-5 (P1)**: conclusion grading vocabulary (speculation/
   exploratory/supported/replicated/confirmatory/falsified/inconclusive +
   stale/superseded) unified across state band, export and paper — currently
   verdicts exist per-hypothesis but run-level conclusion grading is partial.

## 6. Lane coordination (live)

- Sibling lane: ProtocolSpec/ProtocolExecution subsystem (staged, uncommitted as
  of this pass) — owns protocol*, execute.ts, export.ts, StudyMap, dict, api.ts,
  store.ts, ids/index domain exports, SCIENTIFIC_MODEL.md. This lane does not
  touch those files until their commit lands.
- This lane: problem-model domain file (new), scope-stage extension, later the
  map surface. Shared-file edits (domain/index.ts, ids.ts) wait for the
  sibling commit.

