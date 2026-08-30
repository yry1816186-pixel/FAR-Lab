# SCIENTIFIC_MODEL.md — Canonical Scientific Semantics

Concrete class/table names may change; these meanings must not drift without an explicit decision.

## 1. Core object graph

```text
ResearchQuestion + ResearchScope + ConstraintSet
  -> ResearchRun
     -> CorpusSnapshot -> SourceDocument -> ScientificClaim
     -> EvidenceRelation (support / counter / conflict / unknown)
     -> HypothesisCandidate[] -> Assumption[] -> FalsificationSpec/TestabilitySpec
     -> HypothesisScorecard / Comparison
     -> ResearchPlan -> ValidationTask/DatasetRequirement/ToolRequirement
     -> ExperimentSpec -> ExperimentRun (DatasetRecord / ModelSpec) -> ResultSet -> StatReport
     -> ProtocolSpec -> ProtocolExecution (Measurements / Deviations / Approvals)
     -> FeedbackSignal -> Revision -> VersionDiff
     -> ProvenanceReceipt -> ReproducibilityBundle
```

## 2. Question and run

**ResearchQuestion/Scope/Constraints** capture the scientific question, domain/context, boundaries, assumptions, resource/data/ethical constraints and the type of scientific goal.

**ResearchRun** owns a persisted lifecycle and current stage. Durable mutable state belongs to the canonical persistence owner defined in `project-spec/ARCHITECTURE.md`; append-only events/receipts audit transitions. In-memory/UI/exported state is not authoritative.

## 3. Sources, claims and evidence

**CorpusSnapshot** records queries, source adapters, retrieval time, normalized results and immutable identifiers/hashes needed to inspect/reconstruct what the system actually saw.

**SourceDocument** records source type/identifier/version/access state/content depth (metadata/abstract/full text/data), retrieval timestamp, parsing status and content hash where possible.

**ScientificClaim** is a bounded proposition extracted/derived from specific retrieved content and points back to the supporting location/payload. The system must never claim support from content it did not retrieve.

**EvidenceRelation** links a claim/source to a hypothesis or plan as `support`, `counter`, `conflict`, `methodological_limit`, `unknown` or another justified relation. Evidence strength/quality and uncertainty remain inspectable rather than collapsed into certainty.

Citation/source resolution and content alignment fail closed: unresolved/misaligned evidence cannot be promoted to verified support.

## 4. Hypotheses

A **HypothesisCandidate** states a mechanism/explanation/prediction, its derivation path, assumptions, supporting/counter evidence, uncertainties and testable consequences.

A real run should generate multiple genuinely distinct candidates (normally at least three when the problem permits), then deduplicate/cluster paraphrases. A candidate may be novel speculation, but must be labelled as such rather than laundering novelty through weak evidence.

## 5. Falsifiability and testability

**FalsificationSpec/TestabilitySpec** defines what observation/data/test would discriminate or weaken the hypothesis. Where the science supports quantitative decision criteria, include observable, comparator, direction, threshold/decision rule and interpretation. Do not force arbitrary numeric thresholds onto questions where a qualitative/structured discriminating observation is more scientifically appropriate.

A hypothesis that cannot currently be falsified/tested may remain as `UNTESTED/INCONCLUSIVE`; it must not be presented as validated.

## 6. Comparison/ranking

**HypothesisScorecard/Comparison** may consider evidence coverage/quality, counter-evidence, plausibility, novelty limits, falsifiability, testability, data availability, methodological soundness, cost/risk and expected information gain as appropriate.

Scores are decision aids, not objective truth. Each score/rank must expose rationale, evidence and uncertainty; avoid false precision.

## 7. Research plan

A **ResearchPlan** encodes what is needed to test/discriminate candidates: objective, variables/observables, controls/baselines, data/sample requirements, methods/tasks, metrics/evaluation, decision/stopping rules, resources/cost, dependencies, risks/ethics and human approval points as applicable.

Each step has inspectable inputs/outputs/failure conditions. The experiment execution subsystem (D-081, user-mandated) makes selected plan steps machine-executable: dataset acquisition/splitting/preprocessing, domain-model building/training/evaluation, experiment matrices and statistical analysis. It is a first-class subsystem with its own acceptance criteria, but its authority is subordinate: it exists to test hypotheses, and the Direction-A loop (question → hypotheses → plan) remains the orchestrating core.

## 7.5 Research protocol (paradigm-honest execution; 2026-08-29 convergence)

A **ProtocolSpec** is the PREREGISTERED operationalization of a plan's real-world legs — bench, field, human-subjects, engineering, archive or theoretical work the software cannot execute itself: materials with hazards, instruments with calibration requirements, arms, a sampling plan, a code-committed randomization sequence (deterministic in the frozen plan hash — regenerated, never re-randomized), steps with explicit human-confirmation requirements, measurement variables with declarative QC, ethics gates and stop conditions. It freezes against the plan hash; a causally revised plan deserves a new registration.

A **ProtocolExecution** is the append-only, human-attested ledger of what actually happened. Semantics:

- every state transition comes from a HUMAN-recorded event; the software never advances, completes or fabricates execution;
- the ethics gate is fail-closed (no execution records until the declared approval is recorded);
- dependency order between steps is enforced deterministically;
- measurements are recorded values with deterministic QC verdicts — a failing value is kept and flagged, never silently dropped;
- recorded measurements are DATA, never hypothesis verdicts (StatReport semantics stay with the experiment subsystem);
- deviations are first-class (what/why/consequence), mirroring the plan's preregistration-deviation discipline;
- when the ledger completes (or the researcher publishes a partial outcome), it projects into a **FeedbackSignal** with source `experiment` — the physical world's evidence enters the SAME feedback → revise causal chain as every other executed result.

The model may propose inside a closed declarative space when drafting a protocol; ids, seeds, allocation sequences, collection forms and every validation verdict are owned by deterministic code. Adjustments the code makes to a draft are disclosed, never silent. A product run on the deterministic development wire is refused (template protocol ≠ preregistered science).

## 7.6 Scientific Problem Model + Method Selection (AOSSA convergence, 2026-08-30)
A run forms its **ScientificProblemModel** at the scope stage, BEFORE any
hypothesis exists: objectives, variables (role/unit/value-type), a
formalization (problem class, governing relations, boundary conditions,
well-posedness notes), a data inventory with access states, statistical/
causal premises, checkable metrics, stop conditions, and honest unknowns
(an empty unknown list on a frontier question is a defect). One per run;
absent on pre-AOSSA runs — never fabricated.
A **MethodSelection** decides method families per objective: 2–12 candidates
each, assessed `selected`/`viable_alternative`/`rejected_inappropriate`/
`insufficient_information` with rationale; every selected family MUST carry a
real validation plan (convergence order vs analytic rates, preregistered
test, held-out set, protocol QC rule, replication). Families form a closed
12-value enum (analytic_symbolic … archival_analysis). At most 2 selected per
objective; zero selected requires an undecidedReason.
Discipline (all deterministic, model proposals only fill draft schemas):
- Draft guards fire at the model-call boundary (callStructured) — a draft
  that cannot satisfy the guards fails there, never after persistence. Short
  placeholder validationPlans on non-selected candidates pass the draft and
  are stripped before the canonical parse (canonical min-lengths unchanged).
- Test-double output is refused in product runs via a MARKER SKIPPED stage
  outcome — resume reopens the whole scope stage (the run is never left
  permanently without a problem model).
- Hypothesis generation runs UNDER the model (objectives + selected families
  ride every strategy prompt and its cache fingerprint); plans must stay
  inside the selected families; execution routes by selection (below).
## 7.7 Method-selection routing + dataset auto-serialization (2026-08-30)
The execute stage drafts legs in a fixed cascade (tabular EEL → statistical
meta → theory identity → numerical PDE → frozen protocol). Method selection
hard-routes it: a leg whose every backing family was assessed
`rejected_inappropriate` at scope time is NOT drafted (an honest
`method_selection_routing` note records the skip); unmentioned families stay
reachable; pre-AOSSA runs keep the fixed order.
Auto-serialization closes data → execution: operator-registered CSV
dataset_records on the run ride the spec-draft payload as ids/columns only —
local paths NEVER enter a prompt. The draft binds one by `datasetRecordId`
(XOR `openmlDatasetId`); deterministic code resolves the local path after the
draft names the id and refuses unknown ids. Regression drafts (numeric
target) use the regression builder set with mse/r2 metrics, `below`
comparisons and plain random splits (stratified is wrong on continuous
targets). `allowLocalDatasets` is true exactly when a spec binds an
operator-registered record — the record IS the operator acquisition act.
The revise stage sees registered datasets in its causal analysis, so a
new_dataset feedback can force a PLAN revision (dataRequirements re-bound,
re-frozen); a stale execute-skip verdict predating the new freeze re-arms
(freeze-time discipline, same as the protocol gate).
## 8. Feedback and revision

**FeedbackSignal** identifies source/type (human, evidence, tool/validation), target object, content and provenance.

**Revision** records previous version, causal reason, affected objects and new version. **VersionDiff** exposes structural/semantic changes. A new generation without a traceable relationship to feedback is not a valid revision.

Improvement is a claim requiring evaluation evidence; some revisions may be neutral/worse/inconclusive and must be recorded honestly.

## 9. Provenance and reproducibility

**ProvenanceReceipt** captures execution facts needed to explain an output: source snapshots, provider/model/config, tool/version/parameters, stage/events, code/environment reference and artifact hashes. Sensitive raw prompts/data are redacted or retained only under an explicit secure policy.

**ReproducibilityBundle** packages the code/config/input/source references/artifacts/instructions necessary to replay/recompute to a declared evidence level. It must state anything external, inaccessible or non-deterministic that prevents exact reproduction.

## 10. Experiment execution semantics (D-081)

**ExperimentSpec** binds a plan step to the hypotheses it discriminates: it carries the independent/dependent/controlled variables, dataset references, model-builder configuration, metric definitions, the preregistered statistical analysis (test, α, multiple-testing policy), seeds and compute profile. The statistical analysis is frozen in the spec **before** execution; post-hoc analysis changes require a new spec version, not a silent mutation (anti p-hacking).

**DatasetRecord** identities external data immutably: resolver (e.g. OpenML dataset id), content hash, license, variable schema and lineage (acquisition → split → preprocessing recipe). Splits are seeded and deterministic; the same spec + seed must reproduce the same data partition. Leakage controls (stratification, group-awareness) are declared, not incidental.

**ModelSpec** identifies a registered model builder plus hyperparameters and seed. Trained models are artifacts with content hashes; training curves/logs are events.

**ResultSet/StatReport** record executed measurements and their statistical interpretation: effect sizes with uncertainty, tests applied under the preregistered policy, and a verdict per bound hypothesis — `supports` / `weakens` / `falsifies` / `inconclusive` — derived mechanically from the hypothesis' FalsificationSpec decision rule against measured values. A verdict never comes from an LLM judgment; LLMs may propose specs, never interpret results into verdicts. Inconclusive and negative outcomes are first-class results.

**ExperimentRun** owns a persisted lifecycle like ResearchRun (queued/running/checkpointed/completed/failed/canceled) with lease/cancel/resume semantics. Executed-once determinism: identical (spec, seed, environment hash) re-executions must reproduce identical results or report the divergence honestly.

## 10.1 Data-plane + numerical-leg semantics (2026-08-30)
**NetCDF acquisition** (operator act): raw bytes hashed (sha256), stored
content-addressed, xarray-profiled by the sidecar (dims/coords/units/attrs +
record-time QC: NaN/Inf/missing/monotonic time/structure hash), lineage
`acquired`. The profile's bytes are re-hashed after profiling and must match
(TOCTOU closed at acquisition); `sha256Expected` recorded then VERIFIED again
at feature extraction — bytes that changed between acquire and extract never
produce a derived record. Path defense is double-gated (TS boundary + op
layer): URIs rejected before libnetcdf's DAP can fire an outbound request;
relative paths rejected; FARLAB_DATA_ROOT fences reads when set.
**Derived features** are closed-enum aggregations (global mean timeseries /
monthly mean per gridpoint / flatten) — spatial structure is claimed only as
the named mode states; gridpoint coordinates come from the file's own
coordinate arrays, never fabricated from flat indices.
**Numerical PDE leg (FemSpec)**: a preregistered manufactured solution lives
as whitelisted-AST expression DATA; sympy derives the forcing and Neumann
fluxes exactly. P1 triangles, mixed Dirichlet/Neumann assembly (symmetric
elimination), uniform ladders and residual-driven adaptive refinement
(Dörfler marking, newest-vertex bisection with conformity closure; the
residual estimator carries the volume, edge-jump AND Neumann boundary terms).
Verdicts are mechanical against theory-fixed P1 rates (never model-chosen
thresholds), honestly scoped to the unit square; adaptive slope/effectivity
bands are predeclared.
**Bundle data-plane evidence**: dataset_records ride the reproducibility
bundle (`datasetEvidence`: id/name/format/contentRef/lineage kinds) and FEM
measurement tables join `experimentEvidence.artifactHashes`; verification
re-derives every field from the store and probes the artifacts (binary-safe —
content-addressed files are hashed as bytes, never round-tripped through a
text decode).
## 11. Non-goals

- LLM output is never a scientific source by itself.
- Evidence graph is not a generic knowledge-graph product.
- The experiment execution subsystem serves falsification of Direction-A hypotheses (D-081); it does not turn FAR-Lab into a Direction-B instrument-control product, a general ML platform, or a foundation-model training system.
- The protocol layer does not turn FAR-Lab into an ELN/LIMS replacement: it represents real-world work honestly (preregistration + human-attested ledger + outcome feedback), it does not claim to run it.
- Software green tests do not prove scientific validity.
