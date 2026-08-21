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

Each step has inspectable inputs/outputs/failure conditions. Simulation/public-data/scientific-tool adapters may validate executability while remaining subordinate to the Direction-A product core.

## 8. Feedback and revision

**FeedbackSignal** identifies source/type (human, evidence, tool/validation), target object, content and provenance.

**Revision** records previous version, causal reason, affected objects and new version. **VersionDiff** exposes structural/semantic changes. A new generation without a traceable relationship to feedback is not a valid revision.

Improvement is a claim requiring evaluation evidence; some revisions may be neutral/worse/inconclusive and must be recorded honestly.

## 9. Provenance and reproducibility

**ProvenanceReceipt** captures execution facts needed to explain an output: source snapshots, provider/model/config, tool/version/parameters, stage/events, code/environment reference and artifact hashes. Sensitive raw prompts/data are redacted or retained only under an explicit secure policy.

**ReproducibilityBundle** packages the code/config/input/source references/artifacts/instructions necessary to replay/recompute to a declared evidence level. It must state anything external, inaccessible or non-deterministic that prevents exact reproduction.

## 10. Non-goals

- LLM output is never a scientific source by itself.
- Evidence graph is not a generic knowledge-graph product.
- Execution adapters do not turn FAR-Lab into Direction B.
- Software green tests do not prove scientific validity.
