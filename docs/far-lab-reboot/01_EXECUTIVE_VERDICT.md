---
status: reviewed
owner_role: audit-and-product-council
last_verified: 2026-08-05
scope: unique final audit and strategic verdict for the observed repository and reboot
authoritative_for:
  - final verdict
  - readiness score
  - fatal defects
  - strategic confidence and stop conditions
evidence_level: mixed
related_decisions: [DEC-001, DEC-002, DEC-003, DEC-004, DEC-005, DEC-006, DEC-007, DEC-008, DEC-009, DEC-010, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016]
related_requirements: [REQ-PROD-001, REQ-TRUST-001, REQ-TRUST-004, REQ-TRUST-005, REQ-SCI-001, REQ-SCI-003, REQ-SEC-001, REQ-OPS-001, REQ-OPS-003, REQ-QUAL-007, REQ-QUAL-008]
supersedes: []
superseded_by: null
---

# 01 — Executive verdict

## One-sentence judgment

**FAR-Lab 应转向威胁有界的科研验证收据，而非继续宣称科学真伪裁决。**

Formal strategic verdict: **PIVOT**. Current product/release verdict: **BLOCKED / NOT RELEASE-READY**. Audit/redesign package status: **COMPLETE WITH EVIDENCE GAPS**; implementation handoff status is now more strictly **SPECIFICATION CLOSURE REQUIRED** because G2 lacks approved machine authorities. Final Git/path validation is recorded in `02_RUN_STATE_AND_METHOD.md`.

## Decision

- **Retain:** deterministic R0–R9 kernel, FEC concepts, evidence/content-addressing and lifecycle primitives, tamper/negative-test corpus, CLI and portable-package work.
- **Redesign:** active V1 proof into mandatory fail-closed Receipt V2; execution/FEC bindings; N0–N4 numeric/randomness replay; derived disclosure/privacy commitments; external-reference and long-term time/crypto renewal; public TCK/clean-room verifier; run/data identity; six-dimensional assurance; author–reviewer correction loop; isolated worker; generated state/operation contracts; static viewer; immutable distribution/support/docs authority.
- **Retire from product thesis:** “AI4S lie detector,” true/false or fraud/misconduct language, 28-domain validity, current independent-proof/sandbox/production/leadership claims, autonomous-scientist and generic-agent scope.
- **Defer:** institution/hosted modes, agents, MCP/ACP/A2A, skills/plugins, more scientific profiles and broad Web/platform surfaces.
- **Fallback:** if real handoff demand fails, publish a bounded open specification/verifier/evaluation corpus or stop product expansion.

Confidence: **0.78** that the universal/truth framing must be abandoned; **0.58** that receipt + local reviewer handoff is the right wedge. The first is based on direct code/artifact contradictions; the second remains a hypothesis without users.

## Observed-readiness score

Rubric: 0 absent/contradicted, 1 exploratory, 2 prototype, 3 repeatable internal, 4 independently validated, 5 operationally proven. Weight and score were frozen for this audit synthesis; this is not a competitive leaderboard.

| Dimension | Weight | Score /5 | Evidence judgment |
|---|---:|---:|---|
| User demand/adoption | 15% | 0.5 | No interviews, handoffs, repeat use, payer or budget evidence |
| Product/service closure | 10% | 2.0 | Broad interfaces/assets; current challenge/correction/rights loop missing |
| Receipt/trust guarantees | 15% | 2.0 | Real hash/tamper mechanics; active V1 self-check, optional manifest, no independent/authenticated profile |
| Scientific validity | 15% | 1.0 | Fixture conformance only; weak executed binding; no reviewed oracle/calibration |
| Security/privacy/legal | 15% | 1.0 | Direct shell/isolation/authz/lifecycle blockers; safe only as restricted local demo |
| Architecture/data | 10% | 2.5 | Significant modules and domain assets; global/latest/run scope and format authority broken |
| UX/accessibility | 5% | 1.5 | Real React/routes and some patterns; simulation, incomplete journeys and no user/accessibility evidence |
| Quality/release/SRE | 10% | 1.5 | Type/lint green and broad tests/config; full current runtime blocked, release/restore evidence stale/absent |
| Governance/sustainability | 5% | 1.0 | Files exist; bus factor/contact/enforcement/funding unproven |
| **Weighted observed readiness** | **100%** | **1.40 / 5** | Prototype assets with critical evidence and operational gaps |

This score does not mean 28% of work is done and must not be trended without the same rubric/evidence. The strategic candidate analysis separately ranks F/E/C at 73.5/72.5/71.7 out of 100 as design options—not current maturity (`05_PROBLEM_MARKET_AND_STRATEGY.md`).

## Five fatal issues

1. **Thesis/semantics:** repository language can turn deterministic conformance into truth or misconduct inference, while its own README disclaims that guarantee (`README.md:5,115-122`; R-001/R-008).
2. **Scientific validity:** all 30/28-label benchmark cases are unreviewed offline fixtures and active FEC/execution binding permits empty/placeholder evidence (`SCI-0001/0002`; R-007/R-022).
3. **Independent trust:** active proof is same-stack V1 self-consistency, full integrity is optional, code/environment are not self-contained and a consistent rehash remains out of scope (`TRUST-0001`; R-002/R-003).
4. **Safety/rights:** no OS-isolated execution, shell-string scheduling, no object/tenant authorization, plaintext sensitive records and no appeal/correction/deletion lifecycle block shared or sensitive use (`SEC-0001/0002`, `API-0001`; R-004/005/006/013/023).
5. **Attribution/readiness:** the 253-entry dirty snapshot has no full current runtime result, immutable verified release, restore/incident/on-call evidence, second maintainer or real user demand (`REPO-0002`, `RUN-0002/0003`, `OPS/QUAL/GOV`; R-009/010/014/016/017).

Any one vetoes the current universal/production thesis. Together they require a product pivot, not polishing.

## Strongest counterevidence

The negative verdict is not a claim that the repository is empty:

- a deterministic verdict kernel, refusal outcomes and structured FEC/evidence concepts are implemented;
- content addressing, hash-chain/Merkle, lifecycle and tamper-check mechanisms are real within their stated boundary;
- CLI/API/Web, reports, science harnesses and extensive tests show sustained engineering effort;
- static TypeScript typecheck and lint passed on the observed worktree (`RUN-0001`);
- current docs sometimes honestly state keyless proof and scientific-truth limits;
- the architecture can be simplified around assets that retain value without an LLM or hosted service.

These facts support **salvage and pivot**, not current validity, security, independence, market fit or release readiness.

## Target product

For an author and an independent reviewer of one preregistered two-group computational claim, FAR-Lab locally compiles and verifies an immutable receipt that reports separately:

`provenance → integrity → signer identity/authorization → process conformance → execution reproduction → bounded scientific verdict`.

No arrow implies the next result. A static viewer and CLI make limits visible; a focused Web/API supports durable tasks and challenge/correction only after shared contracts pass. An optional agent may assemble candidate evidence but remains untrusted and cannot decide, sign, publish, delete or transmit.

## Can the redesigned implementation truly match world-class open source?

**Plausibly yes as a scoped scientific-receipt system; demonstrably no at present.** The redesign now covers the relevant engineering floor and defines a distinctive protocol/science path. It deliberately does not copy generic coding-agent breadth. But 0/15 applicable parity dimensions are proven; G2 still has 5 IRG rows classified `OPEN_DECISION`, 13 `MACHINE_AUTHORITY_OPEN` rows and 7 separately enumerated/mapped protocol decision items; and no candidate, clean-room verifier, real scientific study, two-release operating record or same-condition competitor benchmark exists.

Therefore the strongest defensible conclusion is:

- the architecture/specification is capable of guiding a world-class attempt once SPEC-001..012 close;
- faithful implementation of prose alone cannot guarantee parity;
- passing FAR-Lab's own gates proves only those gates;
- “match” requires a preregistered non-inferiority study and “exceed” requires superiority with confidence bounds and an independent rerun under equal conditions (`18_WORLD_CLASS_PARITY_SCORECARD.md`);
- leadership remains a version/task/platform/metric-bounded empirical claim, never a permanent repository attribute.

## Minimum evidence before stronger claims

| Claim | Minimum gate |
|---|---|
| “Independent verification” | Public V2 TCK plus a clean-room verifier that shares no producer parser/canonicalizer/validation/hash wrapper; package-only operation and 100% finite critical corpus agreement |
| “Reproducible” | Named N0–N4 `numericalEquivalenceProfile`; frozen inputs/code/env/parameters/randomness/comparison; independent replay and full divergence plus separate threshold/scientific outcome |
| “Selective/private disclosure” | Separately rooted disclosure, explicit omissions, privacy-classed digests/commitments and dictionary/linkability assessment |
| “Long-term verifiable” | Declared preservation horizon, historical/current time/trust policy, append-only renewal, complete archival dependencies and air-gapped recovery |
| Scientific profile support | Preregistered expert-reviewed gold/holdout study with errors, abstention, calibration, agreement and confidence intervals |
| “Secure/sandboxed” | OS-enforced file/process/network/resource tests on every supported platform plus independent review |
| Accessible/usable | Disabled-user core-task tests, WCAG 2.2 AA audit and ≥90% assurance-comprehension target |
| Alpha | Five real author–reviewer/correction loops, all P0 gates, working support/security channel |
| Stable/institutional | G5/G6, two institutions, two maintainers, authz/privacy/legal/SRE/restore/incident/correction evidence |
| “Match/exceed competitor” | PS-01..15 applicable dimensions proven; same model/task/data/tools/network/budget/environment; preregistered non-inferiority/superiority margin; failures in denominator; confidence interval and independent rerun |

## Stop, pivot and rescue conditions

- Stop the receipt product if fewer than three of five pilot pairs repeat or most receipts cause no downstream action; publish standards/evaluation assets or archive.
- Stop a scientific profile on holdout leakage, post-hoc threshold repair, irreducible expert-label instability or any unresolved critical false confirmation.
- Withdraw “independent” if verifier needs author-controlled state/common mutable service or any critical mutation/downgrade silently passes.
- Keep institution/hosted modes disabled until object authorization, tenancy, privacy/legal basis, restore/SLO/on-call and funded ownership pass.
- Keep agent disabled if it does not reduce median assembly time by the preregistered target or increases critical omission/unsafe action.
- Stop stable release whenever a P0 trust, isolation, privacy, cross-run, false-success, migration/restore, correction or governance owner/gate is missing.
- Stop disconnected parallel implementation while canonical state/profile/operation schemas, V2 TCK or distribution contract is unresolved; spec ambiguity is not delegated to feature teams.
- Stop any “world-class,” “match,” or “exceed” claim if an applicable PS dimension is unproven, comparator conditions differ materially, or safety/cost/user-control guardrails worsen.

The eight-view adversarial review confirmed the pivot and left ten explicit veto/block dispositions (`13_ADVERSARIAL_REVIEW.md`). No adversarial finding was converted into an unsupported pass.
