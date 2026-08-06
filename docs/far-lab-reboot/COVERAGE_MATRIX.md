---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: final fourteen-axis audit/design coverage with evidence, specification, acceptance, gaps, and ownership
authoritative_for:
  - coverage status
  - coverage statistics
evidence_level: mixed
related_decisions: [DEC-001, DEC-008, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# Coverage matrix

This matrix measures whether the audit/design axis is accounted for, **not whether the product is implemented or ready**.

- `COVERED`: repository evidence, target specification, acceptance/stop condition and owner are all explicit; it may still contain release blockers.
- `PARTIAL`: the design is explicit but a decision-critical evidence class is absent and cannot be closed by repository inspection.
- `BLOCKED`: required runtime/operational evidence could not safely be produced in this audit environment.
- `UNKNOWN`: silently unexamined; target at exit is zero.
- `NOT_APPLICABLE`: deliberately excluded with rationale and re-entry trigger; not counted as achievement.

## Fourteen required axes

| Axis | Status | Current evidence | Target specification | Acceptance / stop | Critical gap | Owner | Authority |
|---|---|---|---|---|---|---|---|
| 1 Roles | PARTIAL | Repository/user docs name roles; no observed users or demand | ROLE-01..10, decision rights, weak-party/affected-user inclusion | UR-01..06; five handoffs; comprehension and due-process tests | Payer, repeat use, workflow authority and real harms UNKNOWN | Product research | `06_USERS_JTBD_AND_SERVICE_BLUEPRINT.md` |
| 2 Lifecycle | COVERED | Current lifecycle/hash-chain mechanics partial; correction/redress absent | Separate draft/task/receipt standing/preservation/distribution/review/rights contracts plus disclosure/renewal | WF-01..07 and VS-01..18 including concurrency/crash/appeal/exit | Machine schemas/implementation unproven; R-013/R-026 BLOCK | Domain/product ops | `07_PRODUCT_DEFINITION_SCOPE_AND_DOMAIN.md`, `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` |
| 3 Interfaces | COVERED | 15 Web routes, 24 CLI modules, 17 API routes; semantics diverge | Static viewer + focused Web + CLI reference + API v2 generated from operation IDs | Golden cross-surface scenarios, machine schema, accessibility | Operation/OpenAPI/CLI/event/viewer authorities absent; IRG-017..019 | UX/API/CLI | `09_EXPERIENCE_AND_INTERFACE_SPEC.md`, `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` |
| 4 States | COVERED | Sync/global/latest, conflicting target enums and simulated progress observed | Canonical draft/task/receipt-standing/distribution/review + six-axis/profile/reason model | Invalid transition, legacy mapping, event gap, retry/idempotency and recovery | Proposed vocabulary unapproved; schema absent | Domain/API | `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md`, `STATE_AND_FAILURE_MATRIX.md` |
| 5 Data | COVERED | SQLite/evidence/report stores exist; no consistent run/tenant scope/lifecycle | Canonical identities, transactional + content-addressed stores, typed lineage | Concurrency constraints, round-trip, migration, retention/deletion/restore | R-006/R-012/R-021/R-022 | Data/trust | `11_DATA_EVIDENCE_AND_SCIENCE.md`, `DATA_INVENTORY.md` |
| 6 Permissions | COVERED | JWT principal unused; shell/worker/provider paths expose gaps | Deny/ask/allow/two-person matrix across roles/actions/zones | BOLA/cross-scope, bypass, break-glass and separation tests | Shared/institution mode blocked | Security/governance | `PERMISSION_MATRIX.md`, `12_SECURITY_PRIVACY_LEGAL_ETHICS.md` |
| 7 Failures | COVERED | Native/Python runtime, global queries, proof and deployment failure paths evidenced | Normal/empty/partial/offline/refused/tampered/canceled/failed/recovered plus numeric/disclosure/time/renewal/install failures | 26 scenario families, WF acceptance and VS-01..18 | No current runtime execution of target behavior | Quality/SRE | `STATE_AND_FAILURE_MATRIX.md`, `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` |
| 8 Quality attributes | COVERED | Type/lint pass; full runtime and current quality authority incomplete | 22 quality attributes, QI-01..12, TCK/parity layers and G0..G6 | Blocking thresholds, negative/independent tests, rollback | G2 specification closure and most metrics unmeasured | Quality/evaluation | `QUALITY_ATTRIBUTE_MATRIX.md`, `14_QUALITY_EVALUATION_AND_RELEASE.md` |
| 9 Operational stages | BLOCKED | Full test/demo forbidden by write boundary; native/Python incompatibility; no metrics/restore/on-call | Candidate/build/install/run/observe/incident/backup/restore/upgrade/rollback/EOL | Two-party clean build/install; failure/restore/incident/correction drills | No clean immutable candidate or current runtime evidence | Release/SRE | `13_PLATFORM_SRE_COST_AND_SUPPLY_CHAIN.md`, `09_PLATFORM_SRE_COST.md` |
| 10 Agent runtime | COVERED | Existing agent/session assets are outside validated product loop | OFF-default evidence assembly; scoped modes/tools/context/session/budget/taint | Poisoning, bypass, cancellation, replay and crossover eval | Agent value/safety UNKNOWN; therefore deferred | Agent/security | `10_ENGINEERING_AND_AGENT_ARCHITECTURE.md`, `AGENT_RUNTIME_MATRIX.md` |
| 11 Scientific evidence | PARTIAL | Fixture-only unreviewed benchmark; weak FEC/execution binding | One preregistered two-group profile, five dataset tiers, N0–N4/randomness contract, expert oracle and abstention | Locked study, numeric/threshold vectors, calibration/error/CI/reviewer agreement/reproduction gates | No real gold/holdout/domain validity or independent replay | Science/evaluation | `11_DATA_EVIDENCE_AND_SCIENCE.md`, `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` |
| 12 Security/privacy | COVERED | Shell execution, absent OS isolation/authz/lifecycle and plaintext data evidenced | Threat zones, isolated worker, local boundary, identity/authz, derived disclosure/privacy commitments, trust renewal and rights/incident | Hostile file/command/egress/secret/BOLA/dictionary/linkability/time/downgrade/deletion/restore and DPIA review | Current capability limited to trusted non-sensitive local demo | Security/privacy/legal | `12_SECURITY_PRIVACY_LEGAL_ETHICS.md`, `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` |
| 13 Compatibility/migration | COVERED | V1/V2 split, unchecksummed migrations and release drift evidenced | Independent semantic versions, legacy alias mapping, V1 degraded import, V2 fail closed, suite/renewal/archive and atomic migration | Cross-version/downgrade/drift/partial-upgrade/crypto-renewal/archive restore | No frozen V2/TCK or migration/renewal evidence | Protocol/data/release | `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md`, `15_ROADMAP_AND_IMPLEMENTATION_HANDOFF.md` |
| 14 Open source/maintenance | COVERED | Bus factor one, placeholder contact and config-only governance observed | Two maintainers, CODEOWNERS/decision/conflict/succession/security/release/deprecation policy | Settings observation, tabletop, signed release and archival exercise | Named people/funding/enforcement absent | Governance council | `drafts/CONTRIBUTING_GOVERNANCE_DRAFT.md`, `14_QUALITY_EVALUATION_AND_RELEASE.md` |

## Cross-cutting extension decisions

| Capability | Status | Rationale | Re-entry trigger | Authority |
|---|---|---|---|---|
| MCP tool/resource interoperability | NOT_APPLICABLE v0 | First receipt loop completes via files/CLI/API; protocol adds host auth/sandbox risks | ≥3 pilots blocked by the same external tool/resource integration | BG-015 / ADR-005 |
| ACP editor-agent sessions | NOT_APPLICABLE v0 | IDE workflow is not a validated user job | Accepted IDE pilot with capability/permission mapping | BG-016 / ADR-005 |
| A2A remote agents | NOT_APPLICABLE v0 | Federation/hosted verifier is deferred | Cross-organization verifier pilot with identity/webhook/TCK needs | BG-017 / ADR-005 |
| Agent Skills | DEFERRED | Packaging format has no signing/lock/containment/science guarantee | Approved skill need plus pinning, provenance, permissions and domain validation | BG-018 / REQ-ARCH-011 |
| Hosted multitenancy | NOT_APPLICABLE v0 | No demand, tenancy, legal, SRE or staffing evidence | G5 plus separate product/ADR and two institutions | TR-015 / DEC-003 |

## Coverage statistics

Axis-level status, denominator 14:

| Status | Count | Share |
|---|---:|---:|
| COVERED | 11 | 78.6% |
| PARTIAL | 2 | 14.3% |
| BLOCKED | 1 | 7.1% |
| UNKNOWN | 0 | 0.0% |
| NOT_APPLICABLE | 0 | 0.0% |

Accounting coverage: **14/14 axes, 100%, zero silent blanks**. This is not readiness: G2 is now blocked on specification closure, G3–G6 are blocked, and 0/20 traceability chains have implemented-and-verified release evidence.

Additional audited inventories:

- 45 target requirements;
- 20 end-to-end trace chains;
- 43 canonical operations, each present in both journey and interface crosswalk;
- 36 target interface inventory rows plus 1 current-state summary row;
- 27 state/failure scenario rows;
- 34 permission rows;
- 5 agent-runtime modes;
- 17 tool/extension entries;
- 25 benchmark-gap rows (11 P0, 8 P1, 3 P2, 3 P3);
- 22 quality-attribute rows;
- 29 risks and 10 adversarial-review dispositions;
- 30 implementation-readiness gaps (23 P0, 6 P1, 1 P2);
- 15 parity dimensions, with 0 currently proven.
