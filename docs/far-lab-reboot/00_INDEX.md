---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: navigation, authority boundaries, deliverable status, and explicit exclusions for the FAR-Lab reboot package
authoritative_for:
  - document authority map
  - package navigation
evidence_level: mixed
related_decisions: [DEC-001, DEC-008, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# FAR-Lab reboot — authority index

## Status and reading order

Run: `RUN-20260805-1705-reboot`. Snapshot: branch `design/s0-safe-boot`, HEAD `a6edceb243796acce45e45b5dd1d21a7db6cb803`, dirty baseline preserved. Strategic verdict: **PIVOT**. Product/release status: **BLOCKED / NOT RELEASE-READY**. S0–S12 and the user-requested post-v3 `PX1` parity-closure extension are complete. PX1 did not invent a new v3 state or implement the target; it closed prose-level second-order design conflicts and left G2 `BLOCKED_SPECIFICATION_CLOSURE` until machine authorities are approved.

Read in this order:

1. `01_EXECUTIVE_VERDICT.md` — unique decision, score, fatal issues and stop gates.
2. `03_COVERAGE_AND_EVIDENCE_MAP.md` — what is supported, partial, blocked and unknown.
3. `04_REPOSITORY_FORENSICS.md` — observed repository reality.
4. `05_PROBLEM_MARKET_AND_STRATEGY.md` through `08_END_TO_END_WORKFLOWS.md` — why this product, for whom and how it closes.
5. `09_EXPERIENCE_AND_INTERFACE_SPEC.md` through `14_QUALITY_EVALUATION_AND_RELEASE.md` — target system contracts and gates.
6. `15_ROADMAP_AND_IMPLEMENTATION_HANDOFF.md` — future evidence-gated implementation sequence.
7. `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` — exact reproducibility, disclosure, reference, time/crypto, preservation and verifier-independence contract.
8. `18_WORLD_CLASS_PARITY_SCORECARD.md` — the only permitted parity dimensions, evidence states and comparison protocol.
9. `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` — canonical state/profile/operation/distribution slice and four pre-implementation machine authorities.
10. `IMPLEMENTATION_READINESS_GAP_MATRIX.md`, `13_ADVERSARIAL_REVIEW.md`, `TRACEABILITY_MATRIX.md`, `COVERAGE_MATRIX.md` — open closure gaps, red-team and completeness checks.

## Core authority set

| File | Sole/primary authority | Status at this checkpoint |
|---|---|---|
| `00_INDEX.md` | Navigation and authority boundaries | Reviewed |
| `01_EXECUTIVE_VERDICT.md` | Final strategic/readiness judgment | Reviewed |
| `02_RUN_STATE_AND_METHOD.md` | Audit method and state-machine exit | Reviewed / exit verified |
| `03_COVERAGE_AND_EVIDENCE_MAP.md` | Evidence/coverage synthesis | Reviewed |
| `04_REPOSITORY_FORENSICS.md` | Decision-level repository reality | Reviewed after adversarial review |
| `05_PROBLEM_MARKET_AND_STRATEGY.md` | Problem selection, positioning, candidate/stop strategy | Reviewed |
| `06_USERS_JTBD_AND_SERVICE_BLUEPRINT.md` | Roles, jobs, research and human service | Reviewed design; empirical evidence partial |
| `07_PRODUCT_DEFINITION_SCOPE_AND_DOMAIN.md` | Product promise, six assurances, domain and requirement catalog | Reviewed design |
| `08_END_TO_END_WORKFLOWS.md` | Normal/failure/challenge/correction/exit/batch workflows | Reviewed design |
| `09_EXPERIENCE_AND_INTERFACE_SPEC.md` | IA, cross-interface semantics, content/accessibility | Reviewed design |
| `10_ENGINEERING_AND_AGENT_ARCHITECTURE.md` | Architecture, deployment, agent/tool/protocol decisions | Reviewed design |
| `11_DATA_EVIDENCE_AND_SCIENCE.md` | Data/evidence invariants, V2/science profile and gates | Reviewed design; empirical evidence partial |
| `12_SECURITY_PRIVACY_LEGAL_ETHICS.md` | Threat/privacy/legal/ethics boundary and stop gates | Reviewed design |
| `13_PLATFORM_SRE_COST_AND_SUPPLY_CHAIN.md` | Deployment/release/SRE/cost/supply chain | Reviewed design; runtime blocked |
| `14_QUALITY_EVALUATION_AND_RELEASE.md` | Test/evaluation/release authority and blockers | Reviewed design |
| `15_ROADMAP_AND_IMPLEMENTATION_HANDOFF.md` | Future work packages, dependencies, experiments and governance | Reviewed design |
| `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` | Protocol-level reproducibility, disclosure, external-reference, time/crypto, preservation and TCK requirements | Reviewed target; machine authority and conformance absent |
| `18_WORLD_CLASS_PARITY_SCORECARD.md` | Scoped parity dimensions, claim rules and fair statistical protocol | Reviewed protocol; 0 dimensions proven |
| `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` | Cross-surface reference slice, canonical lifecycle/profile/operation vocabulary and specification-freeze inputs | Reviewed proposal; approval/schema/TCK absent |

## Detailed annex authority

The core files above do not duplicate line-level specifications. These annexes are authoritative for their narrower rows:

| Annex | Authority |
|---|---|
| `02_REPOSITORY_FORENSICS.md` | Path/symbol/line repository map and two detailed traces |
| `03_STRATEGY_PRODUCT_SERVICE.md` | Full candidate scoring, sensitivity, role hypotheses and service analysis |
| `04_EXPERIENCE_SPEC.md` | Detailed Web/page/component/state/accessibility contracts |
| `05_CLI_API_CONTRACT.md` | Command grammar, exit codes, API resources/tasks/errors/compatibility |
| `06_TARGET_ARCHITECTURE.md` | Detailed components, state machines, events, agent context/session/tools |
| `07_DATA_EVIDENCE_SCIENCE.md` | Detailed receipt/data/lineage/science/model governance |
| `08_SECURITY_PRIVACY_THREAT_MODEL.md` | Detailed threat register, controls and acceptance |
| `09_PLATFORM_SRE_COST.md` | Detailed SLO/failure/DR/observability/cost/RACI |
| `16_COMPETITIVE_BENCHMARK.md` | Dated official-source external comparison and fair benchmark protocol |
| `13_ADVERSARIAL_REVIEW.md` | Eight-view veto review and disposition |

If a summary conflicts with an annex row in its declared authority, record the conflict; do not silently choose one. Product requirements/domain semantics in core 07 and final verdict in core 01 take precedence over proposed annex prose.

## Registers and matrices

| File | Authority |
|---|---|
| `RUN_STATE.md`, `TASK_GRAPH.md`, `COMMAND_LOG.md` | Live checkpoint, dependency graph and command/query evidence |
| `INITIAL_GIT_BASELINE.md`, `INSTRUCTION_CONFLICTS.md` | Immutable pre-audit workspace and instruction decisions |
| `EVIDENCE_LEDGER.md`, `CLAIM_LEDGER.md` | Evidence propositions/limits and allowed claims |
| `HYPOTHESIS_REGISTER.md`, `OPEN_QUESTIONS.md` | Unknowns, falsifiers, owners and decision deadlines |
| `RISK_REGISTER.md`, `DECISION_LOG.md`, `NON_GOALS.md`, `ADR_INDEX.md` | Risks, decisions, exclusions and proposed ADRs |
| `DATA_INVENTORY.md`, `QUALITY_ATTRIBUTE_MATRIX.md` | Target data lifecycle and quality attributes |
| `INTERFACE_INVENTORY.md`, `STATE_AND_FAILURE_MATRIX.md`, `PERMISSION_MATRIX.md` | Interface, state/failure and role/action row contracts |
| `AGENT_RUNTIME_MATRIX.md`, `TOOL_AND_EXTENSION_INVENTORY.md` | Agent modes and tool/extension trust inventory |
| `BENCHMARK_GAP_MATRIX.md`, `IMPLEMENTATION_READINESS_GAP_MATRIX.md` | External capability gaps and design-to-implementation closure gaps |
| `TRACEABILITY_MATRIX.md`, `COVERAGE_MATRIX.md` | Requirement-to-release chains and 14-axis coverage statistics |
| `SUBAGENT_CONTRACTS.md` | Read-only delegation boundaries and verification |

## Governance drafts

Files under `drafts/` are **not active repository instructions**:

- `drafts/AGENTS_IMPLEMENTATION_DRAFT.md` — proposed future implementation-agent contract;
- `drafts/PLANS_IMPLEMENTATION_DRAFT.md` — proposed evidence-gated plan template;
- `drafts/CONTRIBUTING_GOVERNANCE_DRAFT.md` — proposed contribution/maintainer/release governance.

They require human approval and reconciliation with active root governance before relocation or use.

## What this package does not do

- No product code, tests, dependencies, lockfiles, build, CI, deploy, migration, infrastructure or project configuration was changed.
- No code patch, proof of concept, mock or generated implementation is included.
- No current full test/demo/package, scientific benchmark, security exploit, accessibility study, user study, independent verifier or release was run.
- No `.env`/secret, protected external system, branch settings or production data was accessed.
- No claim of complete product, scientific validity, security, production readiness, market fit or comparative leadership is made.
- No request to begin coding is part of the handoff.

## Exit summary

Coverage: 14/14 axes accounted; 11 covered, 2 partial, 1 blocked; zero silent unknown axes. Target catalog: 45 requirements, 20 unique trace chains, 43 canonical operations, 36 target interfaces plus one current-surface snapshot, 27 failure scenarios, 34 permission rows, 22 quality attributes, 5 optional agent modes, 17 tool/extension entries, 25 benchmark gaps, 29 risks and 30 implementation-readiness gaps. The parity scorecard has 15 dimensions and 0 `PROVEN`. PX1 validation found zero metadata, local-link, hierarchical-heading, table-column, core-ID or trace/evidence-reference errors under the checks recorded in `02_RUN_STATE_AND_METHOD.md`. All 57 changed paths are new Markdown files under this directory; outside-scope Git path hashes match the immutable initial baseline.
