---
status: reviewed
owner_role: specification-freeze-council
last_verified: 2026-08-05
scope: unresolved design, machine-authority, implementation-evidence, and world-class qualification gaps
authoritative_for:
  - implementation readiness gaps
  - specification-freeze blockers
evidence_level: mixed
related_decisions: [DEC-005, DEC-008, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015]
related_requirements: [REQ-ARCH-001, REQ-TRUST-001, REQ-TRUST-004, REQ-TRUST-005, REQ-SCI-003, REQ-UX-003, REQ-OPS-003, REQ-OPS-004, REQ-QUAL-007, REQ-QUAL-008]
supersedes: []
superseded_by: null
---

# Implementation-readiness gap matrix

## 1. Status semantics

This matrix prevents “designed” from being read as “ready to code” or “proven.”

| Status | Meaning |
|---|---|
| `OPEN_DECISION` | Target semantics still require a named human/standards decision. Parallel implementation is blocked. |
| `SPECIFIED_UNAPPROVED` | This reboot now proposes one coherent contract, but the authority/schema/TCK has not been approved. |
| `MACHINE_AUTHORITY_OPEN` | Prose is directionally closed; executable schema/vector/registry authority does not exist yet. |
| `IMPLEMENTATION_EVIDENCE_OPEN` | Contract can be planned, but no candidate-bound implementation result exists. |
| `EMPIRICAL_EVIDENCE_OPEN` | Runtime/user/science/security/comparative evidence—not more prose—is required. |
| `DEFERRED_WITH_TRIGGER` | Explicitly excluded now; re-entry condition is recorded. |
| `CLOSED` | Design, machine authority and required evidence all pass. No row is currently closed. |

## 2. Gap inventory

| ID / priority | Gap and classification | Current evidence / ambiguity | Closure introduced in reboot extension | Remaining artifact or evidence | Owner / gate | Status |
|---|---|---|---|---|---|---|
| IRG-001 / P0 | Numerical equivalence is underdefined. FACT + inference | Existing prose permits bounded divergence; fixture has only `toleranceFrozen`; no universal formula/edge semantics. `07_DATA_EVIDENCE_SCIENCE.md:324-331`; `tests/fixtures/anti_theater/golden_vectors.ts:284-288,523-526` | N0–N4, frozen rule and divergence object in doc 17 §3 | Approved `numericalEquivalenceProfile` schema; ±0/NaN/Inf/ULP/array/order/threshold vectors; two independent results agree | Science + protocol; G2/G5 | `MACHINE_AUTHORITY_OPEN` |
| IRG-002 / P0 | Seed is not a random-process contract. FACT + inference | Seeded `mulberry32` is deterministic for its implementation, but receipt design does not bind PRNG family/state/substreams/call order/parallel schedule. `src/statistics/permutation_test.ts:147-171` | Execution fingerprint and N1/N3 distinction in doc 17 §3 | `RandomnessManifest` schema, stream-derivation rules, trace-vs-distribution vectors | Science + runner; G2/G5 | `MACHINE_AUTHORITY_OPEN` |
| IRG-003 / P0 | JCS target and Unicode normalization can conflict. FACT | Annex targets JCS while current Proof V2 normalizes claim text to NFC; RFC 8785 does not normalize strings and restricts JSON-number semantics. `07_DATA_EVIDENCE_SCIENCE.md:173-181`; `src/proof_envelope/v2/proof_hash.ts:29-41` | Doc 17 requires one explicit preprocessing/canonicalization boundary and leaves selection open | Decide `canonicalizationAlgorithmId`; preserve/reject/normalize per field; large integer/decimal, `-0`, surrogate, duplicate-key vectors | Protocol council; G2 | `OPEN_DECISION` |
| IRG-004 / P0 | Selective disclosure can leak low-entropy values/linkage. FACT + inference | Existing annex acknowledges dictionary-testable hashes but has no disclosure construction. `07_DATA_EVIDENCE_SCIENCE.md:237-245` | Derived disclosure receipts, commitment classes and linkability rules in doc 17 §4 | Privacy-reviewed disclosure schema, nonce/key lifecycle, side-channel inventory and attack corpus | Privacy + protocol + legal; G2/G5 | `MACHINE_AUTHORITY_OPEN` |
| IRG-005 / P0 | External reference resolution is not reproducible. INFERENCE | Bindings lack a normative redirect/content-negotiation/resolver/access-expiry snapshot. | Exact reference/availability vocabulary in doc 17 §5 | `ExternalReferenceSnapshot` schema and offline vectors for 302/content drift/403/404/Accept/auth/license | Data + legal; G2/G3 | `MACHINE_AUTHORITY_OPEN` |
| IRG-006 / P0 | Signing time, certificate expiry, revocation and verifier time lack one decision table. INFERENCE | Security prose names issuer/time/revocation but not time-context outcomes. `12_SECURITY_PRIVACY_LEGAL_ETHICS.md:75-80` | Historical/current/renewal outcomes in doc 17 §6 | Approved trust-policy/time-context schema; stale revocation/log/future-clock vectors | Security + archival owner; G2/G5 | `MACHINE_AUTHORITY_OPEN` |
| IRG-007 / P0 | Algorithm rotation lacks a cross-generation state machine. INFERENCE | Algorithm IDs/migration are mentioned, but legacy validity, stop-sign/stop-verify dates and renewal downgrade behavior were not fixed. | Suite registry and append-only renewal in doc 17 §6 | Initial suite, dates/policies, old↔new vectors, trust-root continuity and compromise drill | Security + protocol; G2/G6 | `OPEN_DECISION` |
| IRG-008 / P1 | Backup does not guarantee semantic preservation. INFERENCE | Backup/restore covers bytes/stores but not every historical schema/context/trust/verifier dependency. `13_PLATFORM_SRE_COST_AND_SUPPLY_CHAIN.md:112-120` | Archival verification package in doc 17 §6 | Preservation profile, fixity/format monitoring, isolated no-network decade-simulation drill | Archive + privacy + SRE; G5/G6 | `MACHINE_AUTHORITY_OPEN` |
| IRG-009 / P0 | “Two verifiers” can share a common-mode defect. INFERENCE | Existing gate says independent but does not enumerate shared parser/canonicalizer/test authorship dependencies. | Independence classes and disclosure in doc 17 §7 | Clean-room charter, dependency matrix, sealed shadow corpus, differential fuzz adjudication | Independent verifier council; G3 | `IMPLEMENTATION_EVIDENCE_OPEN` |
| IRG-010 / P1 | RO-Crate 1.3 and Workflow Run Crate 0.5/RO-Crate 1.1 semantics are not reconciled. FACT + unknown | Existing mapping notes version issue but no exact projection object. `11_DATA_EVIDENCE_AND_SCIENCE.md:89-101` | FAR receipt remains authority; mapping loss required | Freeze base/context/profile versions and `conformsTo`; two explicit fixtures; round-trip loss report | Interop + data; G3 | `OPEN_DECISION` |
| IRG-011 / P1 | PROV/RDF graph semantics and signed-byte boundary are ambiguous. INFERENCE | File-byte digest, RDF canonical dataset digest and PROV constraint validity are not separated. | Doc 17 keeps canonical receipt subject separate; full projection decision remains open | Versioned JSON↔PROV mapping, RDF canonicalization/resource limits, raw-vs-semantic digest fields, hostile vectors | Data/interoperability; G3 | `OPEN_DECISION` |
| IRG-012 / P0 | Attestation maps do not fix predicate/subject/authorization. INFERENCE | Standards are listed, but exact FAR root subject, predicate type and issuer/repo/workflow threshold policy are not frozen. | Typed signed subject and suite policy in doc 17 §2/6 | in-toto/DSSE/Sigstore profile, sensitive-log policy, unauthorized-valid-signer/predicate-swap/offline vectors | Security + release/protocol; G3/G5 | `MACHINE_AUTHORITY_OPEN` |
| IRG-013 / P0 | No unique first ten-minute path teaches the pivot. FACT | Current quickstarts teach old demo/V1 semantics; target docs had only separate 15/30-minute goals. | One offline verifier path in doc 19 §7 | Candidate-generated quickstart/output/failures; clean-machine usability and critical comprehension study | Docs + UX + release; G4 | `EMPIRICAL_EVIDENCE_OPEN` |
| IRG-014 / P0 | Install, upgrade, rollback, uninstall and data preservation are not one executable contract. FACT | Current mutable release/install patterns conflict with target immutable candidate; uninstall preservation is undefined. | Distribution lifecycle and preserve/purge sequence in doc 19 §7 | Per-platform signed artifact/support manifest and full clean qualification | Release + data + security; G3/G5 | `MACHINE_AUTHORITY_OPEN` |
| IRG-015 / P0 | Receipt/task/review state vocabularies conflicted at PX1 entry. BASELINE FACT | Pre-PX1 core, architecture, failure and interface prose serialized incompatible states; PX1 prose is now reconciled. | Object-separated standing/preservation/review/task models, exact legal edges, retry projection and fail-closed migration aliases in doc 19 §3 | Approved domain schemas and generated enums/transition validators | Domain + API + UX; G2 | `SPECIFIED_UNAPPROVED` |
| IRG-016 / P0 | Deployment, verification/science/numeric/disclosure types and assurance outcomes were mixed at PX1 entry. BASELINE FACT | Pre-PX1 core and annex used ladder/non-ladder and bare-profile vocabularies; PX1 prose is now qualified. | Five qualified types, separate trust/time objects and six-axis result in doc 19 §4 | Registry/schema, compatibility table and orthogonality vectors | Product + protocol + science; G2 | `SPECIFIED_UNAPPROVED` |
| IRG-017 / P0 | CLI commands, API endpoints and Web routes conflicted at PX1 entry. BASELINE FACT | Pre-PX1 `receipt list`, replay, task verbs and compile/verify paths differed; PX1 prose now has one map/crosswalk. | Canonical operation/surface map in doc 19 §5 | Approved source map plus generated CLI help/OpenAPI/route manifest; consumer contracts | Surface council; G2/G3 | `SPECIFIED_UNAPPROVED` |
| IRG-018 / P0 | Claimed machine authorities do not exist for target V2. FACT | Repository schemas cover existing types, not approved Receipt V2/OpenAPI/CLI/event/problem/capabilities contracts. | Four freeze artifacts and canonical `ContractBindingSet` enumerated in doc 19 §2–3 | Actual versioned schemas with normative/non-schema constraints, generators and conformance reports | Domain + protocol + surface; G2 | `MACHINE_AUTHORITY_OPEN` |
| IRG-019 / P0 | Static viewer is required without a stable package/security contract. FACT | Conceptual layout says accessible HTML/README but no fixed entry/assets/CSP/JS/authority behavior. | Fixed no-script viewer package and tamper/accessibility behavior in doc 19 §6 | Viewer schema/vectors, two implementations, offline/malicious/accessibility results | Protocol + UX + security; G3/G4 | `MACHINE_AUTHORITY_OPEN` |
| IRG-020 / P0 | User documentation IA/examples still encode pre-pivot claims. FACT | Existing quickstart/judge documents use truth/independence language; quality doc only lists future categories. | Role/task/version IA and synthetic/fixture/real example rules in docs 18/19 | Candidate docs registry, generated snippets, legacy redirect/warning and docs-as-code report | Docs + claim owner; G3/G4 | `IMPLEMENTATION_EVIDENCE_OPEN` |
| IRG-021 / P0 | Product/method/security/privacy/appeal support routes are not live or portable offline. FACT | Current channels/owners are placeholders; offline package challenge exchange is undefined. `GOV-0001` | Required support descriptor fields and fail-closed offline review exchange in doc 19 §7.4 | Real tested channels, signed/versioned descriptor/schema, two-install round trip and response ownership | Support + governance; G4/G6 | `MACHINE_AUTHORITY_OPEN` |
| IRG-022 / P1 | Accessible relation-view equivalence and release threshold conflict. FACT | “Graph has table/tree” lacks traversal/filter/deep-link semantics; 90% vs 100% thresholds differ across design docs. | Doc 19 requires canonical accessible relation semantics and slice acceptance | Relation-view schema, exact edge-set tests, unified threshold and disabled-user evaluation | UX/accessibility; G2/G5 | `OPEN_DECISION` |
| IRG-023 / P1 | Doctor/recovery constants and diagnostic retention are placeholders. FACT | Grace period, SSE replay window, checkpoint/temp retention and bundle schema are not fixed values/capabilities. | Diagnostic result fields and candidate capability values in doc 19 §7 | Defaults/override matrix, error corpus and native ABI/offline/disk/cursor/signal qualification | Platform + CLI/API; G3 | `MACHINE_AUTHORITY_OPEN` |
| IRG-024 / P2 | Batch workflow had a Must-like flow but no surface contract. FACT | WF-07 exists while CLI/API have no batch operation. | Explicitly deferred in doc 19 §5 | Re-enter only after pilot demand with manifest/order/concurrency/checkpoint/per-item/aggregate-exit design | Product council; post-G4 | `DEFERRED_WITH_TRIGGER` |
| IRG-025 / P1 | Telemetry has no versioned semantic convention/privacy budget. INFERENCE | Logs/OTel projections exist; correlation/completeness/drop/cardinality/redaction are not candidate-qualified. | PS-13 target in doc 18 and REQ-OPS-004 | Semantic conventions, field classification, cardinality budget, completeness/drop tests and runbook drill | SRE + privacy; G3/G5 | `MACHINE_AUTHORITY_OPEN` |
| IRG-026 / P0 | “World-class parity” lacks candidate-bound proof. FACT | 15/15 applicable dimensions have 0 `PROVEN`; no same-condition run occurred. | Claim state machine and statistical protocol in doc 18 | All applicable PS gates, two releases, independent qualification and non-inferiority/superiority study | Independent benchmark council; G6/claim gate | `EMPIRICAL_EVIDENCE_OPEN` |
| IRG-027 / P0 | Cross-platform candidate qualification is absent. FACT | Current WSL native and Python probes fail; no clean immutable platform matrix run. `RUN-0002`, `RUN-0003` | Exact qualification concept in docs 18/19 | Immutable candidate on every declared tuple with raw install/runtime/tamper/upgrade results | Release/platform; G3/G5 | `EMPIRICAL_EVIDENCE_OPEN` |
| IRG-028 / P0 | Trust/security/science/release governance is not staffed. FACT | Bus factor one, placeholder security/contact and unassigned target roles. `GOV-0001` | PS-09/12 and roadmap separation-of-duty gates | Two maintainers, real channels, observed protections, release/incident/correction/succession drills | Governance council; G4/G6 | `EMPIRICAL_EVIDENCE_OPEN` |
| IRG-029 / P0 | No real scientific oracle/locked two-group validation exists. FACT | Current 30-case corpus is all fixture/unreviewed (`SCI-0001`). | Real and synthetic tracks separated in doc 19 §8 | Preregistered real dataset/profile, blinded experts, powered study, holdout and published failures | Independent science/evaluation; G5 | `EMPIRICAL_EVIDENCE_OPEN` |
| IRG-030 / P0 | Untrusted execution is not OS-contained. FACT | Current sandbox lacks enforced network/CPU/memory boundary (`SEC-0002`). | Fail-closed containment gates in docs 18/19 | Each supported backend passes escape/egress/secret/resource hostile corpus and emits enforcement attestation | Security/platform; G3 | `EMPIRICAL_EVIDENCE_OPEN` |

## 3. Readiness result

| Result | Count |
|---|---:|
| Total gaps | 30 |
| P0 | 23 |
| P1 | 6 |
| P2 | 1 |
| `OPEN_DECISION` | 5 |
| `SPECIFIED_UNAPPROVED` | 3 |
| `MACHINE_AUTHORITY_OPEN` | 13 |
| `IMPLEMENTATION_EVIDENCE_OPEN` | 2 |
| `EMPIRICAL_EVIDENCE_OPEN` | 6 |
| `DEFERRED_WITH_TRIGGER` | 1 |
| `CLOSED` | 0 |

The design extension closes many prose ambiguities, but five IRG rows are classified `OPEN_DECISION` and thirteen are `MACHINE_AUTHORITY_OPEN`; these are row statuses, not a count of atomic choices. Doc 17 separately enumerates seven protocol decision items, several of which map into machine-authority or empirical rows below rather than one-to-one `OPEN_DECISION` rows. Even after those freeze, implementation and empirical gates remain. Therefore the current truthful state is **`SPECIFICATION_CLOSURE_REQUIRED / PRODUCT_AND_PARITY_UNPROVEN`**.

## 4. Protocol-decision counting crosswalk

| Doc 17 open protocol item | Readiness-gap destination | Why the counts differ |
|---|---|---|
| Canonical JSON and number handling | IRG-003 `OPEN_DECISION` | One atomic protocol choice maps directly to one row |
| Merkle/disclosed-subset construction; sensitive commitment/linkability | IRG-004 `MACHINE_AUTHORITY_OPEN` | Two named choices close together through one disclosure schema/vector authority |
| Initial signature/time suite and offline trust bundle | IRG-006 `MACHINE_AUTHORITY_OPEN`; IRG-007 `OPEN_DECISION` | Decision plus executable trust/time and rotation authority |
| N1 fingerprints and N2/N3 policies | IRG-001/002 `MACHINE_AUTHORITY_OPEN` | Numeric and randomness contracts/vectors, not only a vote |
| External-reference mirror/licensing | IRG-005 `MACHINE_AUTHORITY_OPEN` | Technical resolver schema plus legal evidence |
| TCK governance, badge authority and appeals | IRG-009 `IMPLEMENTATION_EVIDENCE_OPEN`; IRG-028 `EMPIRICAL_EVIDENCE_OPEN` | Independence/staffing must be demonstrated, not closed by prose |

The other `OPEN_DECISION` rows (IRG-010, IRG-011 and IRG-022) concern interoperability and accessibility outside doc 17's seven-item protocol list.
