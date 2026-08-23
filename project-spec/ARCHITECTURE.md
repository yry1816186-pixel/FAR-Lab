# ARCHITECTURE.md — FAR-Lab R1 Architecture Baseline

This is the current **reversible architecture baseline**, not an immutable technology decree. W0 must validate consequential assumptions with the smallest relevant real spikes before foundations become expensive to reverse.

## 1. Architecture principles

1. Domain/scientific semantics own the product; frameworks/providers do not.
2. One invariant has one authoritative owner.
3. R1 is a coherent single-product system, not a microservice collage.
4. Deterministic infrastructure handles state/validation/security; LLMs handle semantic reasoning.
5. Evidence actually retrieved bounds the claims the system may support.
6. Competition-release official-route compliance is first-class; the model/provider abstraction is the core and supports all models worldwide.
7. Failure/recovery/provenance/HCI are architecture, not post-processing.

## 2. Logical layers

```text
Web / CLI / API / Artifact adapters
        |
Application use-cases + orchestration
        |
Canonical scientific domain
(Question, Evidence, Hypothesis, Falsification, Plan, Revision)
        |
Evidence/retrieval | Model/tool adapters | Persistence/provenance
        |
External sources / model providers / scientific tools / filesystem
```

No layer may create a second interpretation of canonical domain objects merely for convenience.

## 3. Canonical ownership

| Concern | Authority | Non-authoritative projections |
| --- | --- | --- |
| Mutable run/domain state | transactional persistence store | UI state, caches, exported snapshots |
| State transitions/audit | append-only event/receipt log linked to run IDs | formatted timeline views |
| Source/evidence payloads | immutable/content-addressed artifacts + metadata | search index/cache |
| Revision/version history | canonical revision records | rendered diffs/reports |
| Provider/tool provenance | execution receipts with redacted metadata/hashes | UI summaries |
| Dynamic build status | `.control/ACCEPTANCE_STATUS.json` | reports/summaries |

**Do not make `.far-run/*/state.json` a competing authority.** Exported files are snapshots/artifacts unless explicitly designated otherwise.

## 4. W0 implementation candidates — not yet adopted

The following is only a **comparison/spike baseline** so W0 has concrete routes to test. It is not permission to skip alternative analysis or start large-scale implementation before evidence:

- Candidate A: **TypeScript + a current supported Node runtime** for core domain, application, CLI/API and shared contracts.
- Candidate Web route: **React-based workbench** after IA/state design; compare against the strongest simpler/current alternatives before locking it.
- Candidate persistence route: **SQLite** for an initial single-machine transactional store; W0 must prove ownership, concurrency/recovery and migration assumptions before adoption.
- Candidate artifact route: a **filesystem/object-style content-addressed area** for immutable source snapshots, exports and reproducibility bundles.
- Candidate scientific-tool boundary: **Python process/adapter only when a real scientific library/tool requires it**; do not create a dual-stack core preemptively.
- Single process or a small bounded worker model first; introduce queues/distribution only after measured workload requires them.

Adoption criteria/reversal triggers: real W0 evidence must beat viable alternatives on scientific ecosystem fit, reliability, simplicity, performance, portability and maintainability. If it does not, replace the candidate before code volume hardens the choice.

## 5. Model boundary

Define a narrow model interface around the semantics FAR-Lab needs (structured generation/review/tool calling/usage/receipt), not around every vendor feature.

R1 requirements:
- live path on the officially required model route;
- provider/model/version/config recorded in provenance;
- structured outputs validated deterministically;
- model failure is explicit;
- no fixture/demo fallback in production.

The boundary is model-agnostic by design: the project goal is to support access to all models worldwide. Multi-provider breadth is validated as real usage requires it.

## 6. Retrieval and evidence boundary

Source adapters are pluggable. OpenAlex/Crossref/arXiv are candidate source families for W0 evaluation, not adopted defaults or a closed list.

Pipeline:
`query -> source adapter -> immutable source snapshot -> normalization -> content available to system -> claim/evidence extraction -> citation resolution -> alignment/quality checks`.

Rules:
- A metadata/abstract-only retrieval can support only claims actually supported by that retrieved content.
- Full text/HTML/PDF or domain data should be used where legally and technically available when the claim requires it; absence becomes an explicit evidence limitation, not model-filled certainty.
- Retrieval must support contrary/negative/methodological searches, not only confirmation.
- Cache/index is a performance projection, never a source-of-truth replacement.

## 7. Scientific orchestration

Use an explicit stage/state machine for the research run. “Multiple roles” are semantic responsibilities, not a requirement to spawn many Agents.

Representative stages:
`scope -> retrieve -> verify_sources -> build_evidence -> generate_hypotheses -> critique/falsify -> rank -> plan -> execute -> feedback -> revise -> export`.

Independent search/critique branches may run concurrently with bounded fan-out and merge rules. The orchestrator owns state and lifecycle; LLM actors do not own durable workflow state.

**Research iteration rounds (2026-08-24).** One linear pass of the stage machine is not a closed research loop. After a pass fully completes, a deterministic iteration controller (`src/app/iteration.ts`) decides whether another bounded round has actionable work: it continues only on named falsification-loop legs (unconsumed feedback signals; an executable plan with no completed experiment) and stops on round cap / run-budget exhaustion / no-material-delta fingerprint / no actionable work, persisting an `iteration` record per decision plus audit events. Human-injected feedback on a completed run starts a fresh bounded iteration epoch. No LLM decides whether research continues — unbounded tree search was evaluated and rejected as data-dredging (see `research/oss-capability-diff-2026-08-23.md`); selection pressure stays at the hypothesis layer and iteration pressure stays on explicit loop legs.

## 8. Reliability model

- bounded retries with classification/backoff;
- idempotency around side effects;
- persisted checkpoints at meaningful stage boundaries;
- cancellation propagation and partial-result semantics;
- resume from persisted state rather than full restart;
- structured errors, run IDs, tool/provider receipts and timings;
- no unbounded concurrency/model/tool loops.

## 9. Provenance and sensitive payloads

Record enough to reconstruct a result: source IDs/hashes, retrieval time, provider/model/config, tool/version/parameters, commit/environment fingerprint, stage transitions and output hashes.

Do **not** blindly persist full prompts/responses if they may contain secrets/private data. Store redacted metadata/hashes by default; raw payload retention must be explicit, secured and justified.

## 10. Human-experience architecture

Web/CLI/API share domain vocabulary and application use-cases. The Web workbench is organized around researcher tasks (question/run/evidence/hypothesis/plan/revision/provenance), not generic dashboard KPIs. Long-running state, errors, cancel/resume and evidence drill-down come from real runtime state.

Read `project-spec/policies/PRODUCT_HCI.md` before implementing user-facing surfaces.

## 11. Explicit non-decisions for R1

Do not pre-adopt microservices, Kubernetes, Kafka, external workflow engines, graph databases, vector databases, agent frameworks, CRDT collaboration, HPC schedulers or heavy formal-verification stacks. They remain candidates only if a measured requirement makes them decision-relevant.

The cold pre-research corpus in `research/reference/` expands this candidate space but grants no adoption authority.
