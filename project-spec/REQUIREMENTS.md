# REQUIREMENTS.md — Canonical Requirements

Dynamic status is tracked only in `.control/ACCEPTANCE_STATUS.json`.

## Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | Capture ResearchQuestion, scope, constraints and assumptions explicitly | P0 |
| FR-02 | Retrieve real literature/facts/data through pluggable source adapters; snapshot source/version/retrieval metadata | P0 |
| FR-03 | Resolve citations/source IDs and bind claims to content actually retrieved; unresolved support fails closed | P0 |
| FR-04 | Represent supporting evidence, counter-evidence, conflicts, unknowns and uncertainty | P0 |
| FR-05 | Generate multiple genuinely distinct HypothesisCandidates and deduplicate/cluster paraphrases | P0 |
| FR-06 | Critique each candidate for assumptions, plausibility, novelty limits, evidence coverage and counter-evidence | P0 |
| FR-07 | Produce FalsificationSpec/TestabilitySpec with observable variables and decision criteria where scientifically meaningful | P0 |
| FR-08 | Rank/compare hypotheses with inspectable rationale; model-generated scores must not masquerade as objective truth | P0 |
| FR-09 | Produce an executable ResearchPlan with variables/controls/data/method/metrics/stopping/resources/risks as applicable | P0 |
| FR-10 | Accept structured feedback from evidence, tools and humans and create causal revisions with version diff | P0 |
| FR-11 | Persist run state, immutable evidence/source snapshots, revision chain and provenance | P0 |
| FR-12 | Support checkpoint/resume/cancel/partial failure without pretending restart is resume | P0 |
| FR-13 | Export human-readable result + machine-verifiable ReproducibilityBundle/receipt | P0 |
| FR-14 | Provide a complete scriptable CLI over the same canonical domain/runtime | P0 |
| FR-15 | Provide a real Web workbench for the primary research workflow; no disconnected/fake controls | P0 |
| FR-16 | Competition release LIVE_VERIFIES the officially required model-calling route with provenance | P0 |
| FR-17 | Expose stable API/protocol boundaries where needed by first-party clients/integrations | P1 |
| FR-18 | Allow future provider/source/tool adapters without coupling the domain model to one framework/provider | P1 |

## Non-functional requirements

| ID | Requirement | Verification principle |
| --- | --- | --- |
| NFR-01 | Truthfulness/fail-closed | no silent synthetic/demo success; failure states inspectable |
| NFR-02 | Deterministic ownership | one source of truth per invariant; idempotent state transitions |
| NFR-03 | Reliability | bounded retries, cancellation propagation, checkpoint/recovery tests |
| NFR-04 | Performance | measure representative workload; define budgets from evidence; no unbounded model/tool/concurrency loops |
| NFR-05 | Security/privacy | least privilege, secret scan, injection/path/SSRF/sandbox review, sensitive-data minimization |
| NFR-06 | Observability | structured run/tool/state/error timing and correlation without leaking secrets |
| NFR-07 | Reproducibility | pinned/configured environment, source snapshots/hashes, replay/recompute evidence |
| NFR-08 | HCI quality | coherent IA/workflow, responsive/accessibility/keyboard/error/long-run UX; real states/actions |
| NFR-09 | Maintainability | minimal sufficient dependencies/abstractions; no duplicate engines or stale paths |
| NFR-10 | Portability | avoid unnecessary OS/provider lock-in; cross-platform claims only after real verification |

## Acceptance linkage

`project-spec/ACCEPTANCE.md` defines observable criteria. `.control/ACCEPTANCE_STATUS.json` is the only live status ledger. A requirement may be implemented without being verified; never collapse those states.
