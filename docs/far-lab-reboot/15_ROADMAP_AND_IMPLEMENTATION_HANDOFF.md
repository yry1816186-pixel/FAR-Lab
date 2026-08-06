---
status: reviewed
owner_role: implementation-program-lead
last_verified: 2026-08-05
scope: evidence-gated roadmap and atomic handoff for a future implementation team
authoritative_for:
  - milestone order
  - implementation work packages
  - implementation entry and exit gates
evidence_level: mixed
related_decisions: [DEC-001, DEC-002, DEC-003, DEC-004, DEC-005, DEC-006, DEC-007, DEC-008, DEC-009, DEC-010, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016]
related_requirements: [REQ-PROD-001, REQ-TRUST-001, REQ-TRUST-004, REQ-TRUST-005, REQ-SCI-001, REQ-SCI-003, REQ-SEC-001, REQ-UX-003, REQ-OPS-003, REQ-QUAL-001, REQ-QUAL-007, REQ-QUAL-008]
supersedes: []
superseded_by: null
---

# 15 — Roadmap and implementation handoff

## 1. Handoff verdict

This is an implementation specification, not authorization to implement and not evidence that the target exists. The future team starts from a **PIVOT**: keep the deterministic kernel, evidence-chain concepts, CLI and portable package assets; replace the broad “truth/fraud detector” framing with a threat-bounded receipt protocol and a local author–reviewer workflow. Institutional and hosted modes remain closed.

The roadmap is gate-driven. “0–30 / 31–90 / 91–180 days” indicates sequencing and planning horizon, not a promised ship date. A work package moves only when its observable exit evidence exists for one immutable candidate.

## 2. Entry conditions and frozen invariants

Before any implementation branch is opened, the implementation lead must:

1. create a clean branch from an agreed revision and inventory every inherited change;
2. reproduce typecheck, lint, the full tests, demo, native Node path, Python science path, frontend build/test, and packaging in declared clean environments;
3. decide the disposition of the 253-entry dirty baseline without overwriting user work;
4. approve or reject ADR-001 through ADR-016 with named product, science, security, privacy and release owners;
5. preserve all current public formats as legacy inputs until a compatibility decision exists; do not silently relabel V1 as V2;
6. prohibit public truth, fraud, misconduct, authorship, causality, universal-domain, “independent,” “sandboxed,” or “production-ready” claims unless their exact gates pass.
7. close or explicitly defer every P0 `IMPLEMENTATION_READINESS_GAP_MATRIX.md` row and approve the four machine-authority sets in doc 19; prose direction alone is not a specification freeze.

Frozen target invariants are QI-01..QI-12 in `14_QUALITY_EVALUATION_AND_RELEASE.md`. Most important: provenance, integrity, signer identity/authorization, policy conformance, execution reproduction and scientific judgment remain independent typed results.

## 3. Dependency graph

```text
WP-00 clean baseline and authority
  ├─> WP-01 vocabulary + assurance semantics
  ├─> WP-02 identity/run/state foundation
  └─> WP-03 release-candidate evidence

WP-01 + WP-02
  └─> SC-01 domain/state/profile/reason + operation schema freeze

SC-01 + WP-03
  ├─> SC-02 canonicalization/numeric/disclosure/time/crypto/standards TCK freeze
  └─> SC-03 distribution/viewer/docs/support/telemetry contract freeze

SC-01 + SC-02
  ├─> WP-04 receipt V2 + independent verifier
  ├─> WP-05 policy/FEC/execution binding
  └─> WP-06 correction/withdrawal/appeal lifecycle

WP-03 + WP-04 + WP-05
  └─> WP-07 isolated execution + scientific profile

SC-01 + SC-03 + WP-02 + WP-04 + WP-06
  └─> WP-08 CLI/API/Web conformance and accessibility

WP-04 + WP-05 + WP-07 + WP-08
  └─> WP-09 five real author–reviewer pilots

WP-09 + independent security/science/privacy review
  └─> WP-10 institutional decision; hosted mode remains a separate gate
```

No protocol/plugin/agent-platform work is on this critical path. MCP, ACP, A2A, subagents, marketplaces, messaging, desktop, and hosted multitenancy require a separate user-evidence trigger.

## 4. Milestone map

| Horizon | Milestone / outcome | Required packages | Exit gate | Explicit stop |
|---|---|---|---|---|
| 0–10 days | M0 — one attributable baseline | WP-00 | Full clean run archived or exact environment blocker owned; authority map approved | Stop if existing changes cannot be separated without loss or if no supported environment can be named. |
| 0–30 days | M1 — semantics and candidate trust root frozen | WP-01, WP-02, WP-03, SC-01 | G0 final; approved state/profile/reason/operation schemas and candidate authority | Stop public demo if wording still causes truth/misconduct inference or two surfaces emit different semantics. |
| 15–45 days | M1.5 — protocol and distribution specifications frozen | SC-02, SC-03 | G2 only after all four doc 19 machine-authority sets, TCK plan, support/docs/distribution contract and P0 decisions are approved | Stop parallel implementation if any canonical bytes, state, policy/profile, URL/command, viewer or install contract remains prose-ambiguous. |
| 31–70 days | M2 — independently checkable bounded receipt | WP-04, WP-05 | Mandatory-manifest/numeric/disclosure/time/renewal/downgrade TCK; clean-room verifier agrees | Stop “independent” claim if verifier needs author DB/state, producer core or shared mutable service. |
| 45–100 days | M3 — safe local service loop | WP-06, WP-07, WP-08 | G1 and G3; isolated worker; shared contract; correction/refusal/viewer/distribution paths pass | Stop external data intake on any critical sandbox, privacy, isolation, data-loss or false-success failure. |
| 91–140 days | M4 — observed value and science validity | WP-09 | G4 plus preregistered pilot/science reports | Stop scale work if fewer than 3 of 5 pilots use a receipt twice or any high-risk false confirmation remains unresolved. |
| 141–180+ days | M5 — institutional decision, not automatic launch | WP-10 | G5 evidence and funded/staffed ownership | Select local OSS continuation or stop if demand, legal basis, maintainership, restore or security gate fails. |

## 5. Work-package contracts

### WP-00 — Clean evidence baseline and authority

| Field | Contract |
|---|---|
| Purpose | Establish one attributable source/runtime/release baseline before fixing anything. |
| Inputs | Initial Git snapshot, current HEAD, dependency locks, CI definitions, release artifacts, governance files. |
| Observable outputs | Candidate manifest; clean working tree; platform matrix; archived raw logs; disposition ledger for every inherited change; approved authority map. |
| Acceptance | Typecheck, lint, full test sets, frontend, demo, packaging, native Node and Python paths run in named clean environments; every result binds commit/lock/platform. |
| Failure/stop | Never “repair the environment” in place without recording the mutation; no subsequent claim uses an unattributable mixed tree. |
| Owner/dependencies | Release lead + repository steward; no dependency. |

### WP-01 — Vocabulary, assurance dimensions, and product promise

| Field | Contract |
|---|---|
| Purpose | Prevent deterministic consistency from being interpreted as scientific truth or misconduct judgment. |
| Inputs | DEC-001/002/006, claim ledger, UX language, ACM badge taxonomy, scientific/legal review. |
| Observable outputs | Versioned glossary; six non-implicative assurance states; public claim policy; refusal/reason codes; tested receipt interpretation copy. |
| Acceptance | ≥90% target participants distinguish what each state can/cannot prove; no subgroup below 80%; no critical false-certainty interpretation. |
| Failure/stop | Do not ship `CONFIRMED` language externally if users still infer truth, innocence/guilt or misconduct. |
| Owner/dependencies | Product + science + legal + UX; WP-00. |

### WP-02 — Identity, run scope, lifecycle, and durable state

| Field | Contract |
|---|---|
| Purpose | Make cross-run association, concurrency and false-success structurally impossible. |
| Inputs | API-0001, target domain model, interface/state/permission matrices. |
| Observable outputs | Canonical IDs and constraints; doc 19 draft/task/receipt-standing/distribution/review state machines; qualified profile types; idempotency policy; typed audit events; local-owner policy; migration specification. |
| Acceptance | Parallel/cross-run property tests show 100% isolation; illegal transitions fail; kill/restart/cancel/redelivery never reports incomplete work as success. |
| Failure/stop | Shared or hosted mode stays disabled while principal/tenant/run is only a label rather than a storage/authorization constraint. |
| Owner/dependencies | Data/API + security; WP-00 and ADR-008/009 approval. |

### WP-03 — Immutable release candidate and supply chain

| Field | Contract |
|---|---|
| Purpose | Bind every quality claim to one source, dependency, schema, policy, dataset and artifact set. |
| Inputs | release audit, QI-01/QI-08, SLSA/in-toto/Sigstore decisions. |
| Observable outputs | Candidate schema; deterministic artifact inventory; signed provenance; two-person release checklist; immutable installer pinning; support/distribution/docs/example manifests; preserve/purge, deprecation and rollback policy. |
| Acceptance | Two clean builders independently reproduce or explain bounded differences; all checksums verify; clean install→doctor→verify→upgrade→rollback→uninstall-preserve→reinstall→purge drill succeeds; mutable branch install is rejected. |
| Failure/stop | No stable tag/release if any artifact lacks origin, digest, license/security disposition or owning candidate. |
| Owner/dependencies | Release + security + OSS governance; WP-00. |

### WP-04 — Receipt V2 and independent verifier

| Field | Contract |
|---|---|
| Purpose | Upgrade self-consistency into explicit, fail-closed, threat-profiled verification. |
| Inputs | TRUST-0001, ADR-003, docs 17/19, approved SC-01/02 machine authorities. |
| Observable outputs | Mandatory manifest; canonical payload; all-member digests; source/data/code/env/policy bindings; N0–N4 replay/divergence; derived disclosure and external-reference semantics; signature/time/renewal/archive policies; standards projections; viewer; public TCK; clean-room verifier. |
| Acceptance | Independent verifiers produce identical canonical roots, six-axis results and reason codes; 100% finite required-member/numeric/disclosure/time/renewal/mutation/substitution/predicate/signature/downgrade vectors are rejected or explicitly typed. |
| Failure/stop | Never call V1 or same-code verification independent; never infer signer authorization or scientific truth from valid signature/hash. |
| Owner/dependencies | Trust protocol + independent verification team; WP-01/02/03. |

### WP-05 — Executed policy/FEC binding

| Field | Contract |
|---|---|
| Purpose | Prove which declared plan, dataset, parameters, environment, deviations and checks produced a result. |
| Inputs | SCI-0002, ADR-004/010, detector-card and lineage specs. |
| Observable outputs | Versioned policy registry; executable plan; immutable bindings; applicability and refusal rules; deviation/contradiction ledger; affected-result index. |
| Acceptance | Empty/placeholder hashes and missing plan/deviation data fail closed; policy mutation deterministically enumerates affected receipts; unsupported data abstains. |
| Failure/stop | No scientific output label when plan execution, source identity or applicability cannot be demonstrated. |
| Owner/dependencies | Science + trust + data; WP-01/02. |

### WP-06 — Procedural lifecycle and privacy rights

| Field | Contract |
|---|---|
| Purpose | Close the reviewer challenge, correction, supersession, withdrawal, deletion and legal-hold loop. |
| Inputs | ADR-006, permission matrix, data inventory, privacy/legal assessment. |
| Observable outputs | Role/RACI policy; evidence-request and appeal objects; append-only lineage; tombstone/scoped erasure; notifications; retention and audit policy. |
| Acceptance | E2E scenarios prove visibility, deadlines, two-person high-risk decisions, export, deletion/legal-hold conflict handling, and no silent mutation. |
| Failure/stop | No adverse institutional decision use while appeal, authority, privacy rights or accountable human review is missing. |
| Owner/dependencies | Product ops + privacy/legal + security; WP-01/02/04. |

### WP-07 — Isolated execution and first scientific profile

| Field | Contract |
|---|---|
| Purpose | Validate one bounded method under enforced execution controls. |
| Inputs | SEC-0002, first task-class protocol, expert gold/holdout data, power analysis. |
| Observable outputs | OS-isolated unprivileged worker; immutable environment; egress/resource/filesystem/process controls; randomness manifest and N0–N4 replay attestation; two-group profile; detector cards; locked evaluation report. |
| Acceptance | Escape/DoS/egress corpus passes; null/negative/OOD/leakage/confounding/malformed cases meet preregistered thresholds; no critical false confirmation; uncertainty and abstention reported. |
| Failure/stop | Stop the profile if independent reviewers cannot produce stable labels or validity thresholds require uninterpretable domain forks. |
| Owner/dependencies | Platform security + scientific lead + independent experts; WP-03/04/05. |

### WP-08 — One user contract across CLI, API, and Web

| Field | Contract |
|---|---|
| Purpose | Deliver the author–reviewer loop without semantic drift across interfaces. |
| Inputs | experience spec, CLI/API contract, interface and failure matrices. |
| Observable outputs | Local CLI as reference; operation-source map; API v2 resource/task/error schemas; focused accessible Web journeys; no-script static viewer; machine JSONL; compatibility table; diagnostics, versioned telemetry semantics and offline behavior. |
| Acceptance | Golden scenarios yield identical state/reason/scope; keyboard/screen-reader/200%-zoom/reduced-motion tasks pass; interrupt/retry/resume/broken-pipe/read-only-FS tests pass. |
| Failure/stop | Do not retain an interface merely because code exists; disable any surface that cannot preserve core semantics or recover safely. |
| Owner/dependencies | Product/UX + CLI/API/frontend; WP-01/02/04/06. |

### WP-09 — Real workflow and scientific validation

| Field | Contract |
|---|---|
| Purpose | Determine whether the receipt changes a real research decision and whether the profile is scientifically defensible. |
| Inputs | five author–reviewer pairs; locked profile; support and incident paths; blinded study protocol. |
| Observable outputs | Consented recordings; task/time/error/interpretation metrics; expert agreement; calibration and error slices; open failure report; correction drills. |
| Acceptance | ≥5 real handoffs, ≥3 pairs repeat use, target comprehension passes, reviewer time/clarification outcome meets preregistered benefit, all P0 failures resolved. |
| Failure/stop | If adoption or comprehension thresholds fail, select standards-only/open-verifier path or stop; do not add surfaces to compensate. |
| Owner/dependencies | Independent product research + science/evaluation; WP-04..08. |

### WP-10 — Institutional readiness decision

| Field | Contract |
|---|---|
| Purpose | Decide whether a supported private deployment is warranted; not to default into hosted SaaS. |
| Inputs | pilot, threat/privacy/legal reviews, accessibility report, SLO/load/restore/cost results, named staffing and funding. |
| Observable outputs | Go/no-go record; deployment profile; DPA/DPIA/legal basis as applicable; runbooks; support/SLA; deprecation; funded ownership. |
| Acceptance | G5 passes, two accountable maintainers exist, restore and incident exercises succeed, and at least two institutions commit to bounded use. |
| Failure/stop | Keep Profile I/H disabled when tenancy, legal basis, on-call, restore, cost or demand is unresolved. |
| Owner/dependencies | Governance council + institutions; WP-09. |

## 6. Specification-closure backlog

These are governance/specification deliverables, not product code. No dependent `IMPL-*` plan is approved until its `SPEC-*` inputs are reviewed and machine-testable.

| Task | Atomic specification outcome | Depends | Approval / evidence |
|---|---|---|---|
| SPEC-001 | Freeze canonical IDs, doc 19 state machines, six-axis enums, qualified profile types, reason/event registries and legacy mappings | WP-01/02 | Product/data/protocol/UX approval; zero enum conflict |
| SPEC-002 | Freeze operation source map, OpenAPI, CLI envelope/events, problem/capabilities schemas and Web route manifest | SPEC-001 | Independent client generation and golden journey review |
| SPEC-003 | Decide canonicalization preprocessing/JCS boundary, decimals/integers/Unicode/paths/archive and algorithm registry | SPEC-001 | Cross-language hostile vectors; no ambiguity |
| SPEC-004 | Freeze numerical equivalence and randomness manifests, N0–N4 comparison/divergence and threshold semantics | SPEC-001/003 | Science/platform review and runner-independent vectors |
| SPEC-005 | Freeze source/disclosure roots, low-entropy privacy classes, external-reference snapshots and availability states | SPEC-003 | Privacy/legal attack review and disclosure vectors |
| SPEC-006 | Freeze signed subject/predicate/authorization, trusted-time, revocation, crypto-suite/renewal and `preservationPolicy` contracts | SPEC-003/005 | Security/archival review and offline vectors |
| SPEC-007 | Freeze separate RO-Crate/WRROC and PROV/RDF projections, canonical byte boundaries and mapping-loss registry | SPEC-003/005 | External validator/parser fixtures and exact loss report |
| SPEC-008 | Publish Receipt V2/disclosure/replay/viewer schemas, normative clauses and complete public/sealed TCK plan | SPEC-003..007 | Protocol + independent verifier review; clause-to-test trace |
| SPEC-009 | Approve clean-room verifier independence charter, shared-dependency disclosure and disagreement adjudication | SPEC-008 | Independent team accepts without producer source/library |
| SPEC-010 | Freeze platform distribution/support/docs/example manifest, first-success path and preserve/purge lifecycle | WP-03 + SPEC-001/002/008 | Release/security/support/UX approval; no placeholder/mutable authority |
| SPEC-011 | Freeze accessible relation-view model, task timeouts/replay/retention constants, diagnostic schema and telemetry semantic/privacy convention | SPEC-001/002 | Accessibility/platform/privacy review and finite test matrix |
| SPEC-012 | Preregister real two-group data/oracle, author–reviewer/usability/accessibility and parity benchmark protocols | SPEC-001/004/010/011 | Independent science/research/benchmark owners; power and stop rules |

## 7. Atomic implementation backlog

Every task below must become its own reviewed plan with old-behavior reproducer, same-class search, test evidence, documentation impact, rollback, and exact changed-file inventory. A task may be split further but not merged across trust boundaries for convenience.

| Task | Atomic outcome | Depends | Acceptance owner | Gate / stop |
|---|---|---|---|---|
| IMPL-001 | Produce clean candidate and reconcile all test entry points | WP-00 | Release | G3; no code work on mixed baseline |
| IMPL-002 | Implement the approved canonical glossary, assurance/profile/reason enums | SPEC-001 | Product+science | G2; schema and comprehension required |
| IMPL-003 | Implement run/receipt/task/attempt/review IDs and DB constraints | SPEC-001 | Data+security | G3; cross-run tests |
| IMPL-004 | Replace global/latest reads with explicit scoped queries | IMPL-003 | API+data | G3; concurrent adversarial tests |
| IMPL-005 | Generate/use approved shared state, reason, error and event schemas | SPEC-001/002 + IMPL-002/003 | API+UX | G3; Web/CLI/API golden cases |
| IMPL-006 | Implement and migrate Receipt V2 without V1 masquerade | SPEC-003..008 | Protocol | G3; compatibility and downgrade corpus |
| IMPL-007 | Make integrity manifest and component digests mandatory by profile | IMPL-006 | Trust | G3; omission/substitution tests |
| IMPL-008 | Bind source/data/code/env/policy/plan/deviation identities | WP-05 | Science+trust | G3; placeholder rejection |
| IMPL-009 | Build independent verifier from published V2 contract | SPEC-009 + IMPL-006/007/008 | Independent team | G3; clean-room verification |
| IMPL-010 | Implement external signer/anchor/time/renewal policy and key lifecycle | SPEC-006 + IMPL-006 | Security+trust | G5; revocation/replay/downgrade tests |
| IMPL-011 | Replace shell-string scheduling contract or remove surface | WP-00 | Security | G3; injection corpus or feature absent |
| IMPL-012 | Put computation in enforced isolated worker | WP-07 | Platform security | G3; egress/path/resource/DoS tests |
| IMPL-013 | Add migration checksum/atomicity/compatibility authority | IMPL-003 | Data+release | G3; drift/failure/restore tests |
| IMPL-014 | Implement policy/detector registry and affected-result index | IMPL-008 | Science governance | G4; impact query exactness |
| IMPL-015 | Implement correction/supersession/withdrawal audit lineage | WP-06 | Product governance | G4; no silent mutation |
| IMPL-016 | Implement retention/deletion/legal-hold workflow | WP-06 | Privacy/legal | G5; rights scenarios |
| IMPL-017 | Implement approved CLI grammar, JSONL, exit codes and signals | SPEC-002/010/011 + IMPL-005 | CLI | G3; contract and pipe/signal tests |
| IMPL-018 | Expose approved API v2 durable task/resource lifecycle | SPEC-002 + IMPL-005/003 | API | G3; idempotency/pagination/auth tests |
| IMPL-019 | Implement focused Web IA and static viewer journeys | SPEC-002/008/011 + IMPL-005/015 | UX | G4; state/accessibility tests |
| IMPL-020 | Create five governed test-data tiers | SPEC-012 + WP-07 | Evaluation+privacy | G4; cards/license/consent/lineage |
| IMPL-021 | Validate two-group scientific profile and locked holdout | IMPL-008/012/020 | Independent science | G5; preregistered report |
| IMPL-022 | Build immutable attested distribution and installer flow | SPEC-010 + WP-03 | Release+security | G3; two-party clean lifecycle verification |
| IMPL-023 | Exercise backup/archive restore, incident and correction drills | SPEC-006/010 + IMPL-003/015/022 | SRE+governance | G5; measured RTO/RPO and semantic recovery |
| IMPL-024 | Conduct author–reviewer, first-success and comprehension study | SPEC-012 + WP-09 | Independent research | G4/G5; stop thresholds |
| IMPL-025 | Make institutional go/no-go decision | WP-10 | Governance council | G6; no automatic expansion |
| IMPL-026 | Implement derived disclosure, privacy commitments and external-reference snapshots | SPEC-005/008 + IMPL-006 | Privacy+trust | G3/G5; attack/availability corpus |
| IMPL-027 | Implement `numericalEquivalenceProfile`/randomness/environment contracts and divergence attestations | SPEC-004/008 + IMPL-012 | Science+runner | G3/G5; cross-runner vectors |
| IMPL-028 | Implement algorithm-suite renewal and long-term archival verification | SPEC-006/008 + IMPL-010/023 | Security+archive | G5/G6; offline renewal/recovery drill |
| IMPL-029 | Implement no-script bound static viewer and accessible relation model | SPEC-008/011 + IMPL-006 | UX+protocol | G3/G4; malicious/offline/AT corpus |
| IMPL-030 | Implement versioned telemetry/diagnostic conventions without evidence coupling | SPEC-011 + IMPL-003/005 | SRE+privacy | G3/G5; completeness/drop/leak tests |
| IMPL-031 | Qualify candidate docs/support/install/upgrade/uninstall lifecycle | SPEC-010/012 + IMPL-017/019/022 | Release+UX+support | G4/G5; clean-machine/user/channel evidence |

## 8. Validation experiments before scale

| Experiment | Hypothesis | Population/data | Success | Failure decision |
|---|---|---|---|---|
| EXP-01 Receipt handoff | HYP-001 | 5 author–reviewer pairs using real non-sensitive analyses | ≥3 pairs repeat use and receipt reduces preregistered clarification/reproduction burden | Choose standards-only/verifier-only or stop product expansion |
| EXP-02 Semantic comprehension | HYP-002/012 | ≥30 researchers/reviewers, stratified by role | ≥90% correct distinction; no subgroup <80%; lower false certainty than composite badge | Rename/remove verdict presentation; block public launch |
| EXP-03 Task-profile fit | HYP-003 | 8 experts + 30 candidate tasks | ≥70% fit without semantic hacks; stable method profile and reviewer agreement | Change first task class or stop cross-domain plan |
| EXP-04 Clean-room independence | HYP-004/005 | Independent team, two verifier stacks, ≥50 seeded attacks | All required tamper/downgrade cases caught; no author-controlled state required | Remove “independent”; redesign verification policy and trust-time context |
| EXP-05 Agent value/safety | HYP-007 | Crossover evidence-assembly tasks | ≥30% median time reduction; no rise in critical omissions, unsafe actions or false evidence | Keep agent disabled/remove from roadmap |

## 9. Roles and decision rights

| Decision | Accountable | Required independent concurrence | Cannot be self-approved by |
|---|---|---|---|
| Scientific profile/threshold | Scientific lead | Two domain reviewers + evaluation lead | Detector author alone |
| Receipt verification policy and trust-time semantics | Protocol owner | Security + independent verifier | Exporter implementer alone |
| Privacy/legal lifecycle | Privacy/legal owner | Product ops + security | Feature implementer |
| Release candidate | Release owner | Security and second maintainer | Sole current maintainer |
| Public claim | Product owner | Science + legal + evidence owner | Marketing/demonstrator alone |
| Institutional deployment | Governance council | Institution, privacy, security, SRE | Engineering team alone |

Every trust-kernel, policy, schema, migration, permission, privacy, cryptographic or release change requires two-person review and a linked ADR/decision/evidence update.

## 10. Rollback and migration rules

- Rollback means selecting a prior immutable candidate, never editing a sealed receipt or published release tag in place.
- V1 remains readable only with explicit missing/degraded assurance dimensions and a legacy compatibility label; migration creates a new V2 receipt with lineage and must not fabricate absent evidence.
- Policy/detector defects trigger affected-result search, freeze, public limitation where relevant, correction/supersession/withdrawal, and rerun under a new version.
- Schema migration requires checksum, backup, forward compatibility window, rehearsal on a copy, failure atomicity and verified restore.
- An agent/tool/skill/provider can be disabled without preventing deterministic local verification of existing receipts.

## 11. Implementation reporting contract

Each future implementation report must state: user outcome; exact scope/non-goals; baseline revision and dirty state; changed paths; requirement/decision/risk IDs; failure reproducer; tests and raw counts; security/privacy/science review; generated artifacts; migration/rollback; unresolved evidence; and release-gate impact. “Tests pass” without command, revision, environment, counts and logs is insufficient.

## 12. Top implementation blockers

1. No clean, fully executed current baseline (`RUN-0002/0003`, RB-01).
2. G2 is blocked: state/profile/operation/canonicalization/numeric/disclosure/time/standards/distribution machine authorities are missing (`IMPLEMENTATION_READINESS_GAP_MATRIX.md`).
3. Product semantics still risk equating evidence consistency with truth (R-001/R-008).
4. V1 receipt is self-referential and downgradeable; no public V2 TCK/clean-room verifier exists (R-002/R-003/R-027).
5. Run identity is not an isolation constraint (R-021).
6. FEC/policy is not bound to executed work, and numeric/randomness equivalence is unqualified (R-022/R-024).
7. Untrusted execution is not OS-contained (R-023) and scheduler executes a shell string (R-005).
8. Scientific benchmark is fixture-only/unreviewed (R-007).
9. Authorization, privacy lifecycle, selective-disclosure leakage, appeal and legal decision rights are absent (R-004/R-006/R-013/R-025).
10. Long-term trust material can decay without a tested renewal/preservation path (R-026).
11. Release evidence, installer inputs, docs and support are not one immutable verified candidate (R-009/R-010/R-011/R-028).
12. Telemetry semantics/privacy and operational evidence are unproven (R-029).
13. Bus factor, security contact and real demand are not established (R-014/R-016/R-017).

## 13. What the implementation team must not infer

This audit did not authorize code changes, validate a runtime release, validate market demand, establish legal compliance, certify a scientific method, prove independent authenticity, or approve hosted deployment. The target design is a testable hypothesis set. If an experiment rejects it, the roadmap must change rather than changing the metric.
