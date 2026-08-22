# PRODUCT.md — FAR-Lab Product Truth

## Mission

FAR-Lab is a research workbench for **evidence-constrained, falsifiable, revisable scientific hypothesis generation and research-plan design**. It helps a researcher turn a concrete scientific question into multiple inspectable hypotheses and executable plans whose evidence, counter-evidence, uncertainty, revision history and provenance can be independently checked.

It is not a chatbot, generic RAG, literature summarizer, paper generator, generic coding agent, fake multi-agent demo or Direction-B instrument-control platform. Its experiment execution subsystem (D-081) executes real datasets/models/statistics to test generated hypotheses — never theatrical demos.

## Primary users and jobs

Primary user: researcher/student/team working on a concrete scientific question.

Core jobs:
1. define the question, scope and constraints;
2. collect and inspect trustworthy sources/data;
3. see claims, supporting/counter evidence, conflicts and unknowns;
4. generate and compare genuinely distinct hypotheses;
5. understand what would falsify/test each hypothesis;
6. produce an executable research plan;
7. incorporate new evidence/tool/human feedback and understand exactly what changed;
8. export a reproducible, traceable research package.

## Canonical product loop

`Question -> Scope -> Retrieval/Source Verification -> Claim/Evidence Graph -> Candidate Hypotheses -> Critique/Falsification -> Ranking -> Research Plan -> Experiment Execution (opt-in; datasets/models/matrices/statistics) -> Feedback -> Revision/Version Diff -> Provenance/Reproducibility Export`

Every stage must preserve partial/failed state and be recoverable where practical.

## Product surfaces

- **CLI**: complete scriptable research flow, diagnostics, structured output and recovery controls.
- **Web workbench**: professional information architecture for evidence inspection, hypothesis comparison, plan editing, version/provenance browsing and long-running run control.
- **API**: stable programmatic boundary only where it serves CLI/Web/integration; no API theater.
- **Artifacts**: human-readable report plus machine-readable provenance/reproducibility bundle.
- Desktop/remote wrappers are later deployment surfaces unless evidence makes them critical; semantics stay shared with Web/CLI/API.

## Model/provider policy

- Competition release must have a **first-class live path on the model route required by the current official rules**.
- Provider interfaces are model-agnostic by design: the product goal is to support access to all models worldwide, and each provider is a pluggable adapter.
- Production failures never silently fall back to fixture/synthetic/demo success.

## Scientific truth rules

- A citation existing is not enough; it must resolve and support the claim actually made.
- Evidence retrieval must deliberately search counter-evidence/contradiction, not only support.
- Unknown/conflicting evidence stays visible.
- Hypotheses must be distinguishable beyond paraphrase and have falsification/testability semantics.
- Research plans must encode variables/controls/data/method/metrics/decision or stopping rules/resources/risks as applicable.
- Feedback produces a traceable revision, not an unrelated regeneration.
- Provenance is captured from execution, not invented afterward.

## Product-quality invariants

- Real capability over demo surfaces; no fake progress, fake graph, fake success or dead controls.
- User-visible state maps to real runtime state.
- Failure/cancel/retry/resume/partial result are first-class behavior.
- Human experience follows `project-spec/policies/PRODUCT_HCI.md`; software/scientific validation follow their separate policies.
- Architecture complexity must be earned by measured requirements.

## Release horizons

### R1 — first real release
A narrow but complete Direction-A loop on a representative problem set, a live model path on the officially required route, real source retrieval, real provenance/recovery, mature CLI/Web workflow and reproducible evaluation. Scope may be narrow; truth may not be.

### Later evolution
The experiment execution subsystem (datasets, domain models, experiment matrices, device/env/gateway/scheduling) is activated by the 2026-08-22 user mandate (D-081) as an in-scope build with its own acceptance criteria. Broader disciplines/sources, collaboration and richer extension ecosystems follow after the core loop proves their need; instrument control and foundation-model training remain out of scope.
