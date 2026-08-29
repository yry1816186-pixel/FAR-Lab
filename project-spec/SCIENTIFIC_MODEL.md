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

## 11. Non-goals

- LLM output is never a scientific source by itself.
- Evidence graph is not a generic knowledge-graph product.
- The experiment execution subsystem serves falsification of Direction-A hypotheses (D-081); it does not turn FAR-Lab into a Direction-B instrument-control product, a general ML platform, or a foundation-model training system.
- The protocol layer does not turn FAR-Lab into an ELN/LIMS replacement: it represents real-world work honestly (preregistration + human-attested ledger + outcome feedback), it does not claim to run it.
- Software green tests do not prove scientific validity.
