---
status: reviewed
owner_role: product-strategy-council
last_verified: 2026-08-05
scope: problem selection, strategic candidates, positioning, anti-positioning, confidence, and stop conditions
authoritative_for:
  - strategic verdict
  - product positioning
  - strategy stop and fallback decisions
evidence_level: mixed
related_decisions: [DEC-001, DEC-002, DEC-003, DEC-006, DEC-007]
related_requirements: [REQ-PROD-001, REQ-PROD-003, REQ-ARCH-011]
supersedes: []
superseded_by: null
---

# 05 — Problem, market, and strategy

## 1. Final strategic judgment

**PIVOT.** Retain the deterministic kernel, FEC, evidence-chain/lifecycle concepts, CLI and portable-package work; retire the universal “AI4S lie detector,” broad research-integrity detection platform, autonomous-scientist and current production-readiness story.

- Core: **F — open verification-receipt protocol and CLI**.
- Adoption wedge: **E — local-first author self-check and reviewer handoff**.
- Conditional destination: **C — provenance/reproducibility evidence infrastructure**, only after external integration demand.
- Fallback if demand fails: **I — standards/dataset/evaluation assets** or **J — stop product and release bounded reusable assets**.

Confidence is **0.78** that the universal/truth framing must change, based on direct repository contradictions; confidence is only **0.58** in the proposed wedge because no real target-user, repeat-use, payer or independent-verifier evidence exists.

## 2. Problem selected

The initial problem is not “LLMs lie, therefore detect truth.” It is:

> When an author hands a computational claim to a reviewer, the input data, code, declared plan, environment, output, policy, deviations and limitations are fragmented or mutable. The reviewer spends time reconstructing what can be checked and cannot preserve a correction trail without trusting the author's machine or service.

Technically addressable: immutable identifiers, canonical manifests, versioned policies, typed evidence edges, deterministic checks, isolated bounded replay, explicit gaps/refusal, independent verification and append-only correction lineage.

Human/institutional: whether the method is adequate, evidence is complete/credible, an omission is culpable, a claim is true, an exception is justified, or an adverse action is fair. FAR-Lab supports but never owns those decisions.

## 3. Adjacent problems and boundary

| Adjacent problem | In scope | Out of scope |
|---|---|---|
| AI disclosure/citation | Carry declaration/source/version/digest and grounding status | Infer authorship, intent or semantic truth from text alone |
| Statistical quality | Apply one reviewed, predeclared method profile and expose assumptions/uncertainty | Universal method correctness or causal warrant |
| Data/code manipulation | Show provenance gaps, content changes, preregistration differences and imported specialist signals | Accuse fabrication, fraud or p-hacking |
| Reproducibility | Bind/replay declared inputs, code, environment, parameters, randomness and outputs | Claim reproduced result is scientifically valid |
| Policy compliance | Evaluate exact versioned, explainable machine rules | Let mutable policy silently change historical verdicts |
| Investigation/due process | Preserve challenge, review, correction and withdrawal records | Automated institutional investigation or sanction |
| Licensing/privacy | Record classification/license/consent and enforce product policy | Offer legal advice or accept sensitive use before approval |

## 4. Candidate score and sensitivity

Scores are synthesis, not market measurement. Weights: user value 20%, science validity 18%, workflow adoption 15%, defensibility 12%, feasibility/data 12%, safety/legal/privacy 10%, operations 8%, ecosystem 5%.

| Candidate | Score /100 | Confidence | Decision |
|---|---:|---|---|
| A AI-generated-content detector | 34.0 | medium | REJECT |
| B broad integrity-detection platform | 50.1 | low | PIVOT AWAY |
| C provenance/reproduction infrastructure | 71.7 | medium-low | CONDITIONAL DESTINATION |
| D institutional investigation workbench | 48.7 | low | DEFER/REJECT NOW |
| E local researcher receipt workflow | 72.5 | medium-low | CONDITIONAL WEDGE |
| F open receipt protocol/CLI | **73.5** | medium-low | CONDITIONAL CORE |
| G journal/funder gate | 61.2 | low | LATER PILOT ONLY |
| H research-asset operating system | 48.5 | low | REJECT SCOPE |
| I standards/dataset/evaluation only | 61.8 | medium-low | DEMAND-FAILURE FALLBACK |
| J stop product/release assets | 55.9 | medium | CONTROL OPTION |

Reasonable weight changes rotate F/E/C but do not rescue B unless missing safety, scientific and adoption evidence is simply assumed. If five real handoffs show no repeated downstream use, I/J becomes correct. Full rationale and counterfactuals are authoritative in `03_STRATEGY_PRODUCT_SERVICE.md`.

## 5. Positioning and anti-positioning

For computational authors and independent reviewers who need to exchange a bounded, reproducible scientific assertion without trusting the author's live system, FAR-Lab creates and verifies a versioned receipt that reports supplied materials, exact policy/checks, replay result, gaps, uncertainty and correction history.

It is not:

- a truth, fraud, misconduct, plagiarism, authorship or AI-text detector;
- a peer reviewer, causal-inference oracle or general scientific expert;
- an autonomous scientist, coding agent, agent gateway or orchestration platform;
- an enterprise investigation/case-management system;
- a hosted data platform in v0;
- a claim that hash, signature, provenance or reproducibility implies scientific validity.

## 6. Why this wedge can be defensible—and why it may not be

Potential defensibility is open protocol governance, conservative semantics, independent verifier implementations, conformance/adversarial corpora, one validated scientific profile, local/offline usability, procedural correction and integrations into existing workflows. File count, detector count, domain labels, model breadth, a proprietary score, a Merkle tree or a single benchmark are not durable moats.

Counterevidence remains serious: the protocol can be copied; incumbents can add receipts; local installation may be too costly; researchers may refuse new disclosure; policies may fragment by domain; institutions may require collaboration/security features the team cannot staff. Neutral interoperability has value only if real reviewers use it.

## 7. Business and adoption unknowns

Primary payer and budget owner are `UNKNOWN`. Possible sponsors—lab manager, journal/funder, open-science office or institutional IT—are hypotheses. No price, TAM, ROI, sales or production-support claim is permitted.

The smallest value test is behavioral: five authors hand real non-sensitive claims to different reviewers; at least three pairs repeat the workflow, and the receipt triggers a rerun, correction, conditional acceptance or specific evidence request. Time saved is useful but secondary to correct interpretation and avoided failure.

## 8. Strategy gates and stop rules

| Gate | Continue evidence | Pivot/stop response |
|---|---|---|
| Problem/demand | ≥5 completed real handoffs; ≥3 repeat; material downstream action | Move to standards/evaluation-only or stop product expansion |
| Semantic safety | ≥90% correct bounded interpretation; no subgroup <80%; no critical truth/misconduct inference | Rename/remove verdict/badges; block public product |
| Profile fit | ≥70% of 30 candidate tasks fit without semantic hacks and reviewers can adjudicate | Select a different task class or keep structure-only checks |
| Independence | Two implementations/clean-room teams verify without author-controlled state; all critical tamper caught | Withdraw “independent,” redesign verification policy and trust-time context |
| Science | Preregistered expert-reviewed holdout meets error/abstention/calibration gates | Withdraw profile; do not tune on held-out failures and relabel |
| Safety/rights | Isolation, authorization, privacy, appeal, correction and support owners proven | Local trusted demo only; no sensitive/adverse use |
| Sustainability | At least two maintainers and two funded/committed institutions before stable | Remain local OSS/standard or archive safely |

No feature expansion may substitute for a failed gate. The roadmap in `15_ROADMAP_AND_IMPLEMENTATION_HANDOFF.md` follows this strategy and contains explicit rescue paths.
