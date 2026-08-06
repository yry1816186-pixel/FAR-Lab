---
status: reviewed
owner_role: product-and-domain-council
last_verified: 2026-08-05
scope: normative target product promise, domain language, requirements, lifecycle, and v0 boundary
authoritative_for:
  - product definition
  - assurance semantics
  - domain entities and states
  - requirement catalog
evidence_level: mixed
related_decisions: [DEC-001, DEC-002, DEC-003, DEC-004, DEC-005, DEC-006, DEC-007, DEC-009]
related_requirements: [REQ-PROD-001, REQ-TRUST-004, REQ-SCI-003, REQ-UX-003, REQ-QUAL-007]
supersedes: []
superseded_by: null
---

# 07 — Product definition, scope, and domain

## 1. Product definition

FAR-Lab is a **local-first, threat-bounded verification-receipt system for preregistered computational claims**. It helps an author disclose immutable materials and declared methods, helps an independent reviewer check integrity and bounded replay, and preserves challenge/correction history. A deterministic policy kernel reports whether supplied, typed evidence meets one versioned `verificationPolicy` under an applicable `scientificProfile`; it does not discover truth or decide misconduct.

Initial task class: one immutable tabular dataset, one preregistered two-group computational analysis, declared outcome/inclusion/transformation/missingness/test/effect/interval/multiplicity/seed/environment, and one human review context. The `scientificProfile` may refuse anything outside that schema.

Initial `deploymentProfile` values:

- `L` local single-user author/reviewer workflow;
- `O` offline, read-only independent verifier.

Institution-private `I` and hosted multi-tenant `H` are disabled until separate identity, authorization, tenancy, privacy, reliability, funding and governance gates pass.

## 2. Product promise and anti-promise

| ID | Promise | Evidence required before public claim |
|---|---|---|
| REQ-PROD-001 | State a bounded claim, `verificationPolicy`, `scientificProfile`, evidence scope, assurance vector, uncertainty and limitations without “truth detector” language | Comprehension test UR-02 and claim-policy review |
| REQ-PROD-002 | Keep provenance, integrity, identity, process conformance, execution reproduction and scientific verdict as independent typed outcomes | Cross-interface schema tests and orthogonality test vectors |
| REQ-PROD-003 | Default to `L_LOCAL_AUTHOR`/`O_OFFLINE_VERIFIER` deployment profiles; reject unsupported shared/hosted operation | Deployment-policy and startup negative tests |
| REQ-PROD-004 | Refuse unsupported, incomplete, unsafe or ambiguous work rather than invent evidence or silently degrade | Locked refusal/OOD/missing/tamper suite |
| REQ-PROD-005 | Preserve human authority for scientific interpretation, contested evidence, adverse decisions, appeal, disclosure and policy approval | Permission/RACI and end-to-end review tests |

The product never promises factual truth, fraud/misconduct detection, intent, authorship, causality, absence of omitted data, universal-domain validity, peer-review replacement, legal compliance, safety of arbitrary code, or authenticity without an exact external identity/time `trustPolicyId`, `VerificationTimeContext` and supporting material.

## 3. Six-dimensional assurance vector

| Dimension | Allowed target states | Question answered | Forbidden inference |
|---|---|---|---|
| `provenance` | `COMPLETE`, `PARTIAL`, `MISSING`, `CONFLICTING`, `NOT_EVALUATED` | Are declared entities/activities/agents and derivations present and internally consistent? | Source/content is true or complete in reality |
| `integrity` | `PASS`, `FAIL`, `UNSUPPORTED`, `NOT_EVALUATED` | Do current bytes, required members, digests and canonical links match? | Original author, authorized signer, good science |
| `identity` | `VERIFIED_AUTHORIZED`, `VERIFIED_UNAUTHORIZED`, `REVOKED`, `UNKNOWN`, `NOT_PRESENT` | Who signed and does the selected policy authorize that identity? | Signer was honest or result is valid |
| `processConformance` | `CONFORMANT`, `NONCONFORMANT`, `LIMITED`, `OUT_OF_SCOPE`, `NOT_EVALUATED` | Did the bound execution meet the exact declared `verificationPolicy` and `scientificProfile`? | Either the policy or scientific profile is scientifically adequate |
| `executionReproduction` | `MATCH`, `BOUNDED_MATCH`, `DIVERGED`, `NOT_COMPARABLE`, `NOT_RUN`, `UNAVAILABLE` | Did independent execution reproduce under one N0–N4 `numericalEquivalenceProfile`? | Reproduced computation is unbiased/correct; numeric match implies same scientific decision |
| `scientificVerdict` | `CONFIRMED`, `REFUTED`, `INCONCLUSIVE`, `DEGRADED_SCOPE`, `UNTESTED` plus policy/version/scope | Does typed evidence satisfy one validated policy's bounded rule? | Universal truth, misconduct or cross-domain validity |

Hard rule: no state in one dimension automatically promotes another. Missing data never defaults to pass. Operational failure changes task/replay status, not an already recorded scientific verdict. Human review is a separate append-only case/outcome resource. A derived `reviewSummary` may be `UNREVIEWED`, `REVIEWED_NO_OPEN_CHALLENGE`, `CONTESTED` or `RESOLVED_WITH_HISTORY`; it never overwrites machine output. `SUPERSEDED`/`WITHDRAWN` belong only to receipt standing; `ARCHIVED`/`PAYLOAD_REMOVED` belong only to preservation status.

## 4. Ubiquitous language

| Term | Normative meaning | Not synonymous with |
|---|---|---|
| Claim | Atomic, scoped proposition with declared subject, context and measurable interpretation | Paper, truth, accusation |
| Qualified profile type | A specifically named `deploymentProfile`, `scientificProfile`, `numericalEquivalenceProfile`, or `disclosureProfile`; these types are not interchangeable | Bare `profile`, domain name or model prompt |
| Policy/FEC | Canonical falsifiability and decision rules bound to a `scientificProfile` and version | Expert consensus or executable result alone |
| Material | Input data, code, environment, plan, source or output candidate | Evidence until provenance/review status is known |
| Evidence edge | Typed claim–material/check derivation with locator, digest, source and scope | Citation text alone |
| Check | Deterministic or explicitly non-deterministic assessment with method/version/input | Overall verdict |
| Receipt | Immutable content-addressed package of declaration, bindings, results, assurance and lineage | Certificate of truth |
| Verification | Evaluation of specified receipt properties under a named `VerificationPolicy` and `VerificationTimeContext` | Endorsement |
| Review | Attributed human statement about evidence/method/decision | Machine verification |
| Challenge | Specific, attributable contest tied to a claim/evidence/check/policy edge | Accusation |
| Correction | Successor record that changes content or standing while preserving lineage | In-place edit |
| Withdrawal | Append-only lifecycle state that discourages current reliance and preserves auditable existence | Cryptographic deletion |
| Refusal/abstention | Expected result when applicability/evidence/safety/uncertainty gates are unmet | System error |

## 5. Core entities and identities

| Entity | Required identity/scope | Owner/authority | Immutable portion | Mutable derived view |
|---|---|---|---|---|
| Project | `projectId`, local owner, `deploymentProfile` | Local owner | creation/initial deployment profile | settings under audit |
| Claim | `claimId`, project | Author until published | published text/scope version | current successor pointer |
| Draft | `draftId`, project | Author | checkpoints | editable before seal |
| Material/Artifact | content digest + media/schema/source class | Provider/author declaration | bytes and declared metadata in snapshot | availability/access status |
| Verification policy | `verificationPolicyId@version` + digest; optional exact `trustPolicyId` reference | Protocol/trust governance | released version | current/deprecated status |
| Scientific profile | `scientificProfileId@version` + digest | Science governance | released applicability/method contract | current/deprecated/withdrawn status |
| Run | `runId`, project/claim/policy | Application service | input snapshot and attempts | current task view |
| Task/Attempt | `taskId` / `attemptId`, run | Scheduler/worker | events and terminal fact | current aggregate state |
| Check result | `checkId`, run/policy/input | Deterministic evaluator | canonical result/reason/trace | display grouping |
| Receipt | `receiptId` + canonical root + schema, `verificationPolicy`, `scientificProfile`, `numericalEquivalenceProfile` and `disclosureProfile` digests where applicable | Author/signing policy | sealed bytes | current lifecycle/assurance view |
| Review case | `reviewId`, receipt, actor | Reviewer/product ops | statements/events | current resolution status |
| Lifecycle event | `eventId`, object, actor, expected version | Authorized role | append-only | materialized timeline |
| External anchor/signature | digest, issuer/subject/time/log identity | Trust policy | verification material | revocation/status cache |

All request-path reads and writes name explicit scope. Process-global “latest” rows are prohibited. Derived views can be rebuilt from authoritative immutable records and are invalidated by exact version/lineage.

## 6. Lifecycle contracts

Draft lifecycle is `EDITABLE | DISCARDED`; discard is terminal. `PREFLIGHT_BLOCKED | PREFLIGHT_READY` belongs to a separate immutable preflight result bound to the exact draft version and canonical `ContractBindingSet` digest defined in doc 19. Compilation accepts one ready result and snapshots all bindings; failure remains a task outcome and does not create a receipt.

Task/attempt states are `QUEUED`, `PREPARING`, `RUNNING`, `PAUSED`, `CANCEL_REQUESTED`, `SUCCEEDED`, `SUCCEEDED_WITH_GAPS`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `CANCELED`, and `EXPIRED`, with the exact legal-transition graph in doc 19 §3.2. Retry creates a new attempt and never changes a terminal attempt. Timeout is a reason code attached to a terminal state.

Receipt: an immutable receipt exists only as `SEALED`; its separate reliance standing is `ACTIVE | SUPERSEDED | WITHDRAWN`. Orthogonal `preservationStatus` is `AVAILABLE | ARCHIVED | PAYLOAD_REMOVED`; it never overwrites standing. Export/share/publication are distribution events, not standing. Contention is a review summary, not a receipt mutation.

Review: `DRAFT → SUBMITTED → RESPONSE_NEEDED ↔ RESPONDED → RESOLVED | WITHDRAWN`, with optional attributed outcome `UPHELD | AMENDED | REJECTED_WITH_REASON | UNRESOLVED`.

`19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md` owns the canonical target state vocabulary, legacy alias mapping and profile type separation. Machine schemas must implement that vocabulary rather than copying older lifecycle prose.

Only declared transitions are valid. Every transition records actor/service, time source, expected prior version, reason, input/output digests and correlation/run/task/attempt IDs. Crash/retry must be idempotent at the application boundary.

## 7. Requirement catalog

| Requirement | Target behavior | Acceptance authority |
|---|---|---|
| REQ-WF-001 | Author can preflight, inspect disclosure, compile/cancel/resume and atomically seal one bounded receipt | WF-01 scenarios + author study |
| REQ-WF-002 | Reviewer safely inspects and independently verifies/replays without author service/state | WF-02 + independent verifier study |
| REQ-WF-003 | Reviewer/affected party can request evidence or challenge a precise edge with attributable history | WF-03 and permission tests |
| REQ-WF-004 | Correction creates a signed/attributed successor, preserves old bytes and enumerates affected consumers | WF-04 and lineage tests |
| REQ-WF-005 | Authorized withdrawal changes current standing without deleting history; machine/human views agree | WF-05 and notification tests |
| REQ-WF-006 | Export, restore, retention, deletion and legal hold have explicit scope and honest completion status | WF-06 and restore/privacy tests |
| REQ-TRUST-001 | V2 mandates manifest, canonicalization and full bindings; missing/unknown critical content fails closed | Tamper/downgrade vectors and verifier conformance |
| REQ-TRUST-002 | At least one verifier implementation is organizationally and technically independent of producer state | Clean-room study UR-04 |
| REQ-TRUST-003 | Signatures/anchors have explicit issuer/identity/authorization/revocation/downgrade policy | Cryptographic negative suite |
| REQ-TRUST-004 | Selective disclosure creates a separately rooted derived receipt, proves only disclosed inclusion, and prevents ordinary low-entropy digests/linkability from leaking hidden values | Disclosure/commitment/privacy vectors and independent verifier conformance |
| REQ-TRUST-005 | Receipt trust remains interpretable offline across expiry, revocation, algorithm/trust-root change and append-only renewal under versioned time/crypto policies | Historical/current/renewal TCK plus archival recovery drill |
| REQ-DATA-001 | Canonical project/claim/run/task/attempt/receipt/actor identity is a storage and authorization constraint | Concurrency/isolation/property tests |
| REQ-DATA-002 | Every evidence/result edge binds origin, transformations, versions, digests, access and uncertainty | Lineage constraint and round-trip tests |
| REQ-DATA-003 | Every external reference binds resolver/version, redirects/content negotiation, capture time, expected bytes, license/access and typed availability without mutable-latest substitution | Offline resolver/drift/access-expiry corpus |
| REQ-SCI-001 | Only a preregistered, expert-reviewed two-group `scientificProfile` can produce bounded scientific verdicts in v0 | Locked scientific study |
| REQ-SCI-002 | OOD, insufficient, contradictory, unsafe or invalid input yields refusal/abstention/degraded scope | Negative/OOD calibration suite |
| REQ-SCI-003 | Replay names an N0–N4 `numericalEquivalenceProfile`, full environment/randomness fingerprint, preregistered comparison rule and machine-readable divergence distinct from inferential/scientific agreement | Cross-platform/cross-runner numeric and threshold vectors |
| REQ-SEC-001 | Untrusted computation is fail-closed and OS-isolated with enforced process/file/network/time/CPU/memory bounds | Escape/egress/resource adversarial suite |
| REQ-SEC-002 | Local mode has one explicit owner and safe filesystem defaults; shared/remote mode is rejected | Startup/authz negative tests |
| REQ-PRIV-001 | Data has purpose/class/access/retention/export/deletion/backup/legal-hold rules and auditable rights handling | Privacy scenarios and DPIA/legal review |
| REQ-PRIV-002 | Public packages/logs disclose only approved metadata and use privacy-reviewed digest/commitment/linkability classes for low-entropy or sensitive values | Dictionary/correlation/side-channel assessment and DPIA |
| REQ-UX-001 | All interfaces show six assurance dimensions, source scope, limitations, next action and recoverable error | Cross-interface comprehension/contract tests |
| REQ-UX-002 | Core author/reviewer/correction tasks meet WCAG 2.2 AA targets and work keyboard/screen-reader/zoom/reduced-motion | Independent accessibility audit |
| REQ-UX-003 | One candidate-bound offline first-success path teaches inspect vs verify vs replay and all six dimensions without legacy truth/certification inference | Clean-machine timed onboarding and critical comprehension study |
| REQ-CLI-001 | CLI has stable human and JSONL output, stderr discipline, exit codes, signals, dry-run and compatibility | Golden contract and TTY/non-TTY tests |
| REQ-API-001 | API exposes versioned resources, durable tasks, idempotency, pagination, authz and machine error schema | Consumer-driven and failure tests |
| REQ-ARCH-001 | CLI/API/Web use one domain/application core, state model and policy engine | Architecture dependency and golden scenario tests |
| REQ-ARCH-002 | Optional agent/tools are untrusted adapters outside the deterministic decision root | Taint/provenance/permission/eval tests |
| REQ-ARCH-011 | MCP/ACP/A2A/skills remain N/A/deferred until a pilot blocker and protocol gate are recorded | Scope/release review |
| REQ-OPS-001 | Every release binds one immutable revision, locks, schemas, policies, datasets, tests, artifacts and provenance | Candidate manifest and two-party verify |
| REQ-OPS-002 | Backup/restore, crash/retry/cancel, upgrade/rollback, incident and correction are rehearsed | Fault and operational drills |
| REQ-OPS-003 | Each supported platform has immutable install/doctor/upgrade/rollback/uninstall-preserve/explicit-purge semantics that protect receipts and report residual copies | Full distribution-lifecycle qualification matrix |
| REQ-OPS-004 | Versioned telemetry semantics correlate request/task/attempt/check/receipt while keeping evidence authority separate and enforcing redaction, retention, sampling and cardinality limits | Semantic-convention conformance, privacy corpus and runbook drill |
| REQ-QUAL-001 | G0–G6 block stronger claims/releases and cannot be bypassed by retries or weaker tests | Release audit |
| REQ-QUAL-006 | Comparative claims require same-condition repeated benchmark and independent review | Benchmark protocol |
| REQ-QUAL-007 | Receipt, disclosure, replay, viewer, crypto and migration conformance is defined by a public versioned TCK and at least one clean-room verifier without producer-core dependencies | Public/sealed vectors, differential report and independence declaration |
| REQ-QUAL-008 | “Match,” “exceed,” “world-class,” and leadership claims remain prohibited until all applicable parity dimensions and preregistered non-inferiority/superiority evidence pass on an immutable candidate | Independent qualification and benchmark report |
| REQ-GOV-001 | Repository agent/change rules protect users, trust boundaries and evidence | Approved governance + compliance checks |
| REQ-GOV-002 | High-risk/multi-file work uses evidence-gated plans with recovery/rollback | Plan audit |
| REQ-GOV-003 | Contributions, maintainership, security response, decisions and release have staffed transparent governance | Governance audit/tabletop |

## 8. v0 functional scope

Must: local preflight; safe material inventory; versioned qualified policy/profile selection; durable compile/check; explicit refusal/gaps; immutable V2 seal/export; offline inspect/verify/diff; bounded replay; static accessible viewer; review request/challenge; correction/supersession/withdrawal; policy explain; machine CLI/API contracts; diagnostics; governed retention/export/delete.

Conditional: human review events in a local pilot, an external signature/anchor contract referenced by `trustPolicyId`, static Web served locally, one import adapter.

Deferred: batch verification until its manifest/order/checkpoint/aggregate-exit contract and pilot demand exist; institutional identity/tenancy, collaboration server, hosted UI, remote notifications, agent assistant, MCP/ACP/A2A, skills/plugins, SDK packages, more scientific profiles.

Excluded: autonomous science, generic agent, IDE coding, browser automation, marketplace, messaging gateway, real-time collaboration, automated misconduct/adverse decision, universal domain verdict and hidden cloud dependency.

## 9. Version and compatibility

Receipt schema, each qualified profile type, verification/trust policies, canonicalization algorithm, verifier, API, CLI machine schema and event schema version independently. Major versions reject unknown incompatible semantics; minor additions never change a sealed result. V1 is import/read-only with explicit degraded assurance; conversion creates a linked V2 successor and cannot manufacture missing evidence. Compatibility tables state reader/writer behavior, downgrade visibility and support window.

## 10. Product release test

The minimum product is not “pages and commands present.” It is five observed author–reviewer loops in which a second machine independently verifies, at least one evidence request and correction complete without history loss, a tamper is caught, an unsupported task is correctly refused, a crash resumes without false success, and participants correctly explain the six assurance dimensions. Until then the product remains `DESIGNED_UNVALIDATED`.
