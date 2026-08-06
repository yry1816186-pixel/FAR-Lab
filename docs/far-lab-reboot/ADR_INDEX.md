---
status: reviewed
owner_role: architecture-council
last_verified: 2026-08-05
scope: proposed architecture decision inventory and authority links
authoritative_for: [ADR inventory]
evidence_level: D
related_decisions: [DEC-001, DEC-003, DEC-004, DEC-005, DEC-007, DEC-008, DEC-009, DEC-010, DEC-011, DEC-012, DEC-013, DEC-014, DEC-016]
related_requirements: [REQ-ARCH-001]
supersedes: []
superseded_by: null
---

# Architecture decision index

These are decision specifications, not implemented ADRs. Detailed rationale is authoritative in the linked audit documents.

| ADR | Title | Status | Date | Owner | Components | Supersedes | Authority |
|---|---|---|---|---|---|---|---|
| ADR-001 | Local-first modular monolith plus isolated worker | PROPOSED | 2026-08-05 | Architecture/platform | Web, CLI, API, storage, queue, worker | Current mixed deployment assumptions | `06_TARGET_ARCHITECTURE.md` |
| ADR-002 | Optional agent outside deterministic trust root | PROPOSED | 2026-08-05 | Trust/agent | Agent runtime, tools, review | Agent-loop verdict coupling | `06_TARGET_ARCHITECTURE.md` |
| ADR-003 | Fail-closed receipt V2 with qualified verification policies | PROPOSED | 2026-08-05 | Trust | Export, verifier, manifest, signatures | Active V1 for new production receipts | `07_DATA_EVIDENCE_SCIENCE.md` |
| ADR-004 | One preregistered two-group scientific profile | PROPOSED | 2026-08-05 | Science | FEC, methods, benchmark | Cross-domain validity framing | `07_DATA_EVIDENCE_SCIENCE.md` |
| ADR-005 | File/CLI/API interoperability first | PROPOSED | 2026-08-05 | Architecture | Interfaces, protocols | Broad plugin/protocol ambition | `05_CLI_API_CONTRACT.md` |
| ADR-006 | Append-only correction, withdrawal, and scoped erasure | PROPOSED | 2026-08-05 | Governance/privacy | Receipt lineage, audit, deletion | In-place verdict mutation | `03_STRATEGY_PRODUCT_SERVICE.md`, `08_SECURITY_PRIVACY_THREAT_MODEL.md` |
| ADR-007 | Immutable, attested release candidate | PROPOSED | 2026-08-05 | Release engineering | CI, artifacts, installers, evidence | Mutable-branch installer/release evidence | `14_QUALITY_EVALUATION_AND_RELEASE.md` |
| ADR-008 | Shared state/reason/error model across Web/CLI/API | PROPOSED | 2026-08-05 | Product/API | UI, CLI, API, events | Interface-specific semantics | `04_EXPERIENCE_SPEC.md`, `05_CLI_API_CONTRACT.md` |
| ADR-009 | Tenant/run identity is a storage constraint | PROPOSED | 2026-08-05 | Data/security | Schema, queries, object store, events | Logical `runId` labels | `06_TARGET_ARCHITECTURE.md` |
| ADR-010 | Versioned policy and detector registries | PROPOSED | 2026-08-05 | Science/governance | Kernel, detectors, impact correction | Implicit code-version coupling | `07_DATA_EVIDENCE_SCIENCE.md` |
| ADR-011 | Typed numerical execution and randomness profiles | PROPOSED | 2026-08-05 | Science/protocol/platform | Runner, replay, receipt, verifier | Boolean reproduced/global epsilon | `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` |
| ADR-012 | Derived disclosure receipts and privacy-classed commitments | PROPOSED | 2026-08-05 | Privacy/trust | Manifest, Merkle proofs, export, logs | In-place redaction/plain public digest | `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` |
| ADR-013 | Algorithm agility, trusted-time context and archival renewal | PROPOSED | 2026-08-05 | Security/archive | Signature, trust store, lifecycle, preservation | Timeless Boolean signature validity/history rewrite | `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` |
| ADR-014 | Public TCK and producer-independent verifier conformance | PROPOSED | 2026-08-05 | Protocol/quality | Schemas, vectors, producer, verifier, projections | Producer library as executable specification | `17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md` |
| ADR-015 | Immutable distribution lifecycle and semantic telemetry | PROPOSED | 2026-08-05 | Release/SRE/privacy | Install, upgrade, uninstall, docs, support, diagnostics, telemetry | Mutable installer/prose-only operational semantics | `13_PLATFORM_SRE_COST_AND_SUPPLY_CHAIN.md`, `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` |
| ADR-016 | Generated domain state, profile and operation authority | PROPOSED | 2026-08-05 | Product architecture | Domain schemas, CLI, API, Web, viewer | Surface-specific enums/routes/commands | `19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` |
