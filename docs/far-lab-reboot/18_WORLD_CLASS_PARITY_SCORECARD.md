---
status: reviewed
owner_role: independent-benchmark-and-release-council
last_verified: 2026-08-05
scope: world-class open-source parity dimensions, proof states, benchmark claim rules, and non-applicable capability boundaries
authoritative_for:
  - world-class parity scorecard
  - match and exceed claim thresholds
  - parity denominator and exclusions
evidence_level: mixed
related_decisions: [DEC-001, DEC-007, DEC-010, DEC-015]
related_requirements: [REQ-QUAL-001, REQ-QUAL-006, REQ-QUAL-008, REQ-OPS-001, REQ-OPS-003, REQ-GOV-003]
supersedes: []
superseded_by: null
---

# 18 — World-class parity scorecard

## 1. Direct answer and claim boundary

**The redesign makes a world-class, domain-specific implementation plausible; it does not make it true.** Design can eliminate ambiguity, define a competitive baseline, and make evidence falsifiable. Only an immutable implementation candidate that passes the gates below—and a fair independent comparison against frozen competitor versions—can establish parity or superiority.

Current result under this scorecard:

| Measure | Result |
|---|---:|
| Applicable parity dimensions | 15 |
| Dimensions with current repository evidence of some relevant asset | 13 |
| Dimensions represented only by target design | 2 |
| Dimensions proven for an immutable candidate | **0** |
| Applicable dimensions fairly benchmarked against a competitor | **0** |
| Allowed overall “world-class parity” claim | **NO** |

`CURRENT` below means an artifact, code path, test, or prose exists—not that it passes. `DESIGNED` means the reboot specifies direction but current qualifying evidence is absent. `PROVEN` requires candidate-bound execution, failure paths, all claimed platforms, retained raw evidence, and independent review. `UNKNOWN` is not coerced into pass/fail. `NOT_APPLICABLE` is excluded only with a documented re-entry trigger.

## 2. What “world-class” means for FAR-Lab

FAR-Lab is not required to copy the surface area of a coding agent. Its relevant comparison has two parts:

1. **Commodity engineering floor:** installability, recovery, containment, predictable interfaces, cross-platform qualification, release integrity, documentation, compatibility, security response, observability and maintainership must be as credible as mature open-source tools.
2. **Domain-specific proof:** portable receipt semantics, independent conformance, disclosure/privacy, long-term verification, scientific refusal and correction must be demonstrably stronger than an ordinary agent log or provenance export.

A beautiful demo, a large test count, one successful run, many supported scientific labels, a signed artifact, or an average score cannot substitute for either part.

## 3. Fifteen-dimension evidence scorecard

External comparison observations and versions remain frozen to the official-source review dated 2026-08-05 in `16_COMPETITIVE_BENCHMARK.md`. This table audits FAR-Lab, not the truth of every competitor claim.

| ID | Applicable world-class baseline | Evidence state / current verdict | Observed FAR-Lab evidence | Minimum proof gate for one immutable candidate |
|---|---|---|---|---|
| PS-01 | Clean install and first safe value | `CURRENT / BLOCKED` | Installation/release scripts and offline smoke artifacts exist; clean-machine provenance is not established. | Every declared OS/arch tuple installs from immutable signed artifacts without undeclared prerequisites/cache; `doctor` passes; a new reviewer verifies the bundled V2 sample, reads all six assurance dimensions and does not infer truth/independent certification. Record setup failures, time and network. |
| PS-02 | Upgrade, migration, rollback, restore and uninstall | `CURRENT / BLOCKED` | Migration code/tests and backup concepts exist; no released N-1 candidate or complete destructive-failure matrix exists. | Last-supported→N and rollback/read-compatibility matrix; kill/disk-full/corruption at every persistent transition; old receipts remain verifiable; uninstall preserves evidence by default and `purge` enumerates/deletes only explicit targets; restore is measured and reverified. |
| PS-03 | Cross-platform qualification | `DESIGNED / BLOCKED` | Target support profiles are specified, while the current WSL native/Python environment fails (`RUN-0002/3`). | Freeze OS version, architecture, shell, filesystem, runtime/native ABI and isolation backend tuples; each passes install→doctor→inspect→verify→tamper→upgrade→rollback. Unsupported tuples fail early with stable remediation. |
| PS-04 | Public Receipt V2 specification, TCK and independent verifier | `CURRENT / BLOCKED` | Canonicalization, tamper and same-repository cross-language seeds exist. | Versioned normative TCK from `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md`; at least one clean-room verifier shares no producer parser/canonicalizer/validation/hash wrapper; public and sealed corpora agree on bytes, decisions and reason codes. |
| PS-05 | Property, fuzz, mutation and differential assurance | `CURRENT / PARTIAL` | Boundary/property/tamper and selected cross-language tests exist. | Candidate-bound target list, generators, seed corpus, budget, maximum input, shrink/reproducer and coverage report; zero surviving critical-invariant mutations; every implementation discrepancy becomes a minimal spec issue, never silent normalization. |
| PS-06 | Fault injection, crash consistency and idempotency | `CURRENT / PARTIAL` | Resume/crash/database-corruption test assets exist, but no complete durable-transition campaign is evidenced. | Inject kill, deadline, disk full, duplicate/reordered event, stale lease and partial upload at every durable transition; no false success or duplicate seal; measured recovery over a preregistered run count on every supported `deploymentProfile`. |
| PS-07 | OS containment and unified permission enforcement | `CURRENT / FAIL` | The current science runner explicitly lacks enforced network/CPU/memory isolation (`SEC-0002`); target permission matrix exists. | Fail closed if isolation is unavailable; enforce process, filesystem, network, time, CPU, memory and PID bounds below every adapter; zero critical escape, secret read or undeclared egress in the finite hostile corpus on each supported backend. |
| PS-08 | Reproducible release, complete SBOM, provenance and signing | `CURRENT / BLOCKED` | Release workflow/checksum/SBOM-like artifacts exist, while 7/11 observed release checksums were stale and no signed candidate was qualified. | Define exact vs allowed build differences; complete Node/frontend/Python/native/container inventory; provenance subjects equal uploaded bytes; two independent builders/verifiers; signature, revocation, withdrawal and download verification drill. |
| PS-09 | Operational security response | `CURRENT / FAIL` | Policy prose exists; security contact/owners are placeholders (`GOV-0001`). | Real private intake tested end-to-end; supported-version and severity policy; acknowledgement/triage/mitigation/disclosure ownership; release/key compromise, privacy breach and false-verdict correction tabletop with retained evidence. |
| PS-10 | Task-based docs, onboarding and support | `CURRENT / PARTIAL` | README/quickstarts/API prose exist, but current user docs still carry pre-pivot semantics and are not candidate-generated. | Role/task/version IA; examples tagged synthetic/fixture/real; commands/schema/output generated or tested from candidate; all links and failure recovery pass; product, method, security/privacy and appeal routes are live and distinct; representative users complete tasks. |
| PS-11 | Compatibility and deprecation | `DESIGNED / BLOCKED` | General lifecycle policy is designed; no historical client/receipt/event/policy corpus proves it. | Separate read/write windows for receipt, DB, API, CLI JSON, event and policy; last-supported/N-1 tests; unknown-critical handling, warning, migration, removal, rollback, withdrawal and affected-result behavior verified. |
| PS-12 | Maintainer and community health | `CURRENT / FAIL` | Governance files exist but bus factor is one and critical owners are unassigned (`GOV-0001`). | At least two people independently complete release and incident drills; observed branch/tag protection and CODEOWNERS; conflict, succession, archive and DCO/CLA decisions; public triage/response evidence over a meaningful operating window. Stars are not evidence. |
| PS-13 | Observability/audit/evidence separation | `CURRENT / PARTIAL` | Logs, OTel projection and session artifacts exist; no live SLO/runbook evidence or canonical telemetry contract exists. | Versioned semantic conventions correlate request→task→attempt→check→receipt; required-span/event completeness; drop/sampling/cardinality/retention behavior; zero secret/raw-sensitive-value leakage in the governed corpus; alerts drive exercised runbooks. |
| PS-14 | Cost, performance and capacity | `CURRENT / PARTIAL` | Budget/latency mechanisms exist; candidate p95/p99, stable memory, end-to-end unit cost and limits are unknown. | Frozen reference hardware and small/medium/maximum workloads; distributions/CI for latency, peak RSS, CPU, disk, egress, model and human review; cancellation/failure cost; budget-stop correctness; 10× forecast and an explicit maximum supported envelope. |
| PS-15 | One CLI/API/Web/viewer semantic contract | `CURRENT / BLOCKED` | Current surfaces diverge; PX1 reconciles target prose, but no approved/generated operation, state, OpenAPI, CLI, event or viewer authority exists. | One versioned operation/resource/state/reason/permission/event source; cross-surface golden journeys have zero semantic differences; generated OpenAPI/CLI/event/viewer contracts; consumer-driven compatibility tests without server-source access. |

### 3.1 Gate arithmetic

This scorecard is intentionally not averaged. A high documentation or performance score cannot compensate for an escape, false scientific confirmation, corrupt upgrade, unverifiable receipt, or dead security channel.

The phrase **“world-class engineering parity for the declared FAR-Lab scope”** becomes eligible only when:

- all 15 applicable dimensions are `PROVEN`, or a dimension is reclassified `NOT_APPLICABLE` through a reviewed decision with no broken user journey;
- every P0 risk and release blocker is closed on the same candidate;
- at least one complete author–reviewer vertical slice passes on every declared platform;
- one independent team reruns the candidate qualification from published artifacts;
- the result remains true across two consecutive candidate releases including upgrade/rollback;
- a separate same-condition benchmark supports any named comparator claim.

The phrase **“world-leading scientific verification”** additionally requires powered independent scientific validation and an independently demonstrated FAR-specific advantage. Engineering parity alone cannot earn it.

## 4. Deliberate `NOT_APPLICABLE` capabilities

The following generic-agent capabilities are outside the v0 parity denominator. They are not “missing features” unless a real receipt workflow proves otherwise:

- repository map, LSP, code generation/edit/patch, Git auto-commit/undo and coding lint/fix loops;
- IDE-native editing, code-diff approval, worktree/subagent merging and coding-agent boards;
- browser/computer use, desktop/mobile control and multi-channel personal-assistant messaging;
- always-on gateway, persona, long-term personal memory, self-improvement or automatic skill creation;
- SWE-bench or other coding leaderboard scores;
- provider/plugin/marketplace breadth and generic subagent orchestration;
- hosted hostile multi-tenancy before institutional identity, isolation, law, support and on-call gates;
- MCP before an observed external tool/resource blocker, ACP before an approved IDE pilot, and A2A before a federated-verifier pilot;
- executable Agent Skills before a specific workflow need and supply-chain/domain review.

An LLM, skill or agent deciding the final scientific verdict is not `NOT_APPLICABLE`; it is **PROHIBITED inside the deterministic trust root**.

## 5. Match and exceed benchmark protocol

### 5.1 Common design

Every comparative study MUST preregister:

- competitor and FAR candidate versions/digests;
- primary task set, held-out policy, contamination checks and user/science strata;
- environment, model, tools, filesystem/network, time, turns, tokens, cost, retry and human-assistance budgets;
- primary metric, safety/integrity guardrails, estimand, exclusion rule, missing/failure handling and multiplicity plan;
- paired/randomized design, sample-size/power analysis, non-inferiority or superiority margin, confidence level and stop rules;
- artifact/trajectory retention, blinded adjudication and independent rerun owner.

Setup failures, timeouts, refusals, retries, human takeovers and unsafe attempts remain in the denominator. Architecture differences are stratified, not normalized away. Public reports include all prespecified metrics, worst cases, costs, exclusions and failures.

### 5.2 “Matches”

A named match claim uses a non-inferiority design. Let the paired difference be `FAR - comparator`, with positive better. The lower bound of the prespecified confidence interval MUST exceed `-delta`, and all safety/integrity guardrails MUST remain within their own non-inferiority bounds. At least 30 independent trials are required for a stochastic condition unless prospective power analysis specifies another number.

### 5.3 “Exceeds”

A named exceed claim uses a positive superiority margin. The confidence-interval lower bound MUST exceed `+delta`; `p < 0.05`, a higher mean, or one successful demo is insufficient. Multiple comparators/metrics/slices require a prespecified primary comparison and multiplicity control. User/scientific outcomes require at least two blinded reviewers, agreement reporting and adjudication. An independent rerun must also clear the margin.

### 5.4 Zero failures and finite corpora

For a deterministic finite TCK/tamper corpus, the allowed statement is “candidate X passed 100% of corpus Y on platform matrix Z.” It does not imply zero unknown risk.

For independent Bernoulli trials with zero observed failures, the one-sided 95% upper bound is `1 - 0.05^(1/n)`:

| Observation | Approximate upper failure-rate bound | What it means |
|---|---:|---|
| 0 failures / 30 | 9.5% | Far too weak for a low security-failure claim |
| 0 failures / 299 | <1% | Supports only the stated trial population/independence assumptions |
| 0 failures / 2,995 | <0.1% | Still not proof of absence or adversarial coverage |

Canonicalization, mandatory members, downgrade rejection and run isolation remain zero-tolerance invariants across the declared finite corpus/platform matrix; average success cannot compensate for one failure.

### 5.5 Only permitted comparative wording

> On `<date>`, against `<competitor version>`, using `<frozen tasks/data>`, `<model>`, `<environment>` and `<budget>`, FAR-Lab `<candidate>` met/exceeded the preregistered `<metric>` margin `<delta>`; the 95% confidence interval was `<interval>`, setup failures and safety events were included, and no conclusion is made outside these conditions.

Repository-level, permanent, universal, “best,” “first,” “safer,” or “more scientific” claims remain prohibited without separately scoped proof.

## 6. Decision states and owner action

| State | Public meaning | Required next action |
|---|---|---|
| `CLAIM_PROHIBITED` | No candidate-bound proof | Implement only from reviewed atomic plans; retain failures |
| `DIMENSION_PROVEN` | One PS dimension passed on a named candidate/platform scope | Publish raw report and limitation; do not generalize |
| `SCOPED_PARITY_PROVEN` | All applicable dimensions plus a comparator non-inferiority study passed | Use only §5.5 wording |
| `SCOPED_ADVANTAGE_PROVEN` | Superiority and domain-specific validity independently repeated | Use only metric/task/version-bounded wording |
| `EVIDENCE_EXPIRED` | Comparator, support matrix, candidate, or policy changed materially | Re-run affected claims; old report stays historical |

Current FAR-Lab state is `CLAIM_PROHIBITED`. The redesign is an executable route to evidence, not the evidence itself.
