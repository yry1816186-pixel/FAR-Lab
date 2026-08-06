---
status: reviewed
owner_role: product-protocol-integration-council
last_verified: 2026-08-05
scope: canonical implementation handoff slice, state/profile vocabulary, operation surface map, static viewer contract, and integration acceptance
authoritative_for:
  - canonical target state vocabulary
  - profile type separation
  - canonical operation and surface mapping
  - reference vertical slice and integration sequence
  - static viewer package contract
evidence_level: D
related_decisions: [DEC-003, DEC-005, DEC-008, DEC-011, DEC-014, DEC-016]
related_requirements: [REQ-ARCH-001, REQ-WF-001, REQ-WF-002, REQ-UX-001, REQ-UX-002, REQ-UX-003, REQ-CLI-001, REQ-API-001, REQ-QUAL-007]
supersedes: []
superseded_by: null
---

# 19 — Reference vertical slice and conformance handoff

Status: `SPECIFICATION_CLOSURE / NOT IMPLEMENTED`. This document resolves design-level vocabulary and surface conflicts. It does not authorize code work or claim that the target schemas already exist.

## 1. Integration verdict

The reboot is ready for a staffed architecture council to freeze specifications, but it is **not yet safe to hand independently to disconnected CLI, API, Web, viewer, installer and verifier teams**. At PX1 entry, read-only cross-review found incompatible state words, mixed profile types, mismatched commands/endpoints/routes, and a “required” static viewer without a package entry contract. PX1 reconciles those conflicts at the prose-design level below; it does not create or approve the machine authorities required for parallel implementation.

| Classification | Conclusion | Evidence |
|---|---|---|
| BASELINE FACT / PROSE RECONCILED | At PX1 entry, receipt/draft/task/review states differed across target documents. | `DESIGN-0001`, IRG-015; current prose now points to §3, while schema approval remains absent. |
| BASELINE FACT / PROSE RECONCILED | At PX1 entry, target journeys and CLI grammar differed on list/show/replay/task operations. | `DESIGN-0001`, IRG-017; current prose now uses the §5 map and crosswalk, while generated contracts remain absent. |
| BASELINE FACT / PROSE RECONCILED | At PX1 entry, interface inventory endpoints differed from the detailed API resource contract. | `DESIGN-0001`, IRG-017; current endpoint prose is reconciled, OpenAPI/consumer evidence is absent. |
| BASELINE FACT / PROSE RECONCILED | At PX1 entry, the required static viewer lacked a fixed entry, active-content rule and viewer manifest. | `DESIGN-0001`, IRG-019; §6 now proposes the contract, but schema/vectors/implementations are absent. |
| INFERENCE | Parallel implementation against the current prose would generate incompatible public contracts even if each team acted in good faith. | The conflicts affect serialized enums, URLs, CLI automation and package layout. |
| RECOMMENDATION | Freeze the four machine authorities in §2 and use the vertical slice as the only first integration target. | This is the smallest path that tests every trust/user boundary without platform sprawl. |

## 2. Four artifacts required before implementation plans can be approved

| Freeze artifact | Sole authority after approval | Required content | Approval gate |
|---|---|---|---|
| `Domain Contract Set` | Domain/state/qualified-type/reason schemas | IDs, state machines, assurance vector, qualified policy/profile types, events, compatibility aliases | Product + protocol + data + UX; zero conflicting enum definitions |
| `Receipt V2 TCK` | Receipt, disclosure, replay and viewer bytes/semantics | Normative spec, schemas, vectors, hostile corpus and independent-verifier contract from doc 17 | Protocol + security + privacy + independent verifier |
| `Surface Contract Set` | Operations and projections | OpenAPI 3.1, CLI command registry/envelope/events, problem schema, operation map, Web route manifest | API + CLI + Web + accessibility; generated contract diff is zero |
| `Distribution Contract Set` | Install/support/docs lifecycle | Candidate/artifact/support matrix, install/upgrade/uninstall data semantics, docs/example manifest | Release + security + support + legal; clean-machine exercise |

Prose may explain these artifacts but cannot redefine them. Until they exist and are approved, G2 remains `BLOCKED_SPECIFICATION_CLOSURE`; the proposed prose is `SPECIFIED_UNAPPROVED`, not a frozen machine contract.

## 3. Canonical target state model

Pre-seal work, immutable receipt standing, preservation status, distribution, verification and human review are different objects. This separation replaces overloaded lifecycle strings.

### 3.1 Draft lifecycle and preflight result

Draft lifecycle state is only `EDITABLE | DISCARDED`, with the sole lifecycle edge `EDITABLE → DISCARDED`. Discard is idempotent and terminal, invalidates current preflight results for new work, preserves the minimum governed audit/tombstone where required, and never deletes source material outside the declared draft workspace. It conflicts while any nonterminal compilation references the draft; the user cancels/waits for that task first. A terminal task or sealed receipt remains immutable and addressable—discard removes only the working draft, never its already snapshotted result. A `PreflightResult` is a separate immutable evaluation of one exact `(draftId, draftVersion, contractBindingSetDigest)` subject and has `PREFLIGHT_BLOCKED | PREFLIGHT_READY`; it is not a draft lifecycle state.

`ContractBindingSet` is a versioned canonical object, never ambient configuration. At minimum it binds exact ID/version/digest values for `deploymentProfile`, `verificationPolicy`, `scientificProfile`, `disclosureProfile`, every output selector→`numericalEquivalenceProfile` mapping, `canonicalizationAlgorithmId`, `externalReferencePolicy`, `executionContainmentPolicy`, `preservationPolicy`, and any planned `trustPolicyId`/signature-anchor suite. A non-applicable entry is an explicit typed value with rationale; absence/default/latest is invalid. Actual execution environment, trusted time and anchor evidence remain result attestations and cannot be predicted into a pass by this set.

- A draft remains editable while any preflight result exists; a mutation increments `draftVersion` and makes the old result non-current without deleting it.
- A compilation task accepts only the exact ready `preflightResultId` and its subject/binding digest, then snapshots them. The draft or any policy/profile may later change without altering the task or receipt.
- Failed compilation is a task/attempt outcome, not a draft or receipt state.
- No receipt exists before an atomic seal succeeds.

### 3.2 Task and attempt state

The serialized state belongs to `TaskAttempt`. The complete legal outgoing edges are:

| From | Allowed next state(s) | Constraint |
|---|---|---|
| `QUEUED` | `PREPARING`, `CANCEL_REQUESTED`, `EXPIRED` | `EXPIRED` requires queue/task deadline reason; no direct success |
| `PREPARING` | `RUNNING`, `CANCEL_REQUESTED`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `EXPIRED` | Failure names capability/setup reason before user code runs |
| `RUNNING` | `PAUSED`, `CANCEL_REQUESTED`, `SUCCEEDED`, `SUCCEEDED_WITH_GAPS`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `EXPIRED` | Success requires a committed immutable result; gaps are typed |
| `PAUSED` | `RUNNING`, `CANCEL_REQUESTED`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `EXPIRED` | Resume validates the same input/policy/environment/checkpoint bindings |
| `CANCEL_REQUESTED` | `CANCELED`, `SUCCEEDED`, `SUCCEEDED_WITH_GAPS`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `EXPIRED` | A safe-point race may finish/fail; result records that cancellation was not applied |
| Any terminal state | — | `SUCCEEDED`, `SUCCEEDED_WITH_GAPS`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `CANCELED`, `EXPIRED` never transition |

`Task` is a logical container and has no independently mutable lifecycle. Its API/view projection exposes exactly one `currentAttemptId`, monotonic `attemptNumber`, and `state` equal to that current attempt's serialized state; cancellation intent is the `CANCEL_REQUESTED` transition, never a hidden boolean. `FAILED_RETRYABLE` is terminal for that attempt. `task.retry` is accepted only for `FAILED_RETRYABLE`, or for `EXPIRED` when the registered reason explicitly declares `retryAllowed=true`; it compare-and-swaps the expected terminal attempt/version and creates a new current `attemptId` in `QUEUED` under the same logical `taskId`. Every other source state fails `TASK_RETRY_NOT_ALLOWED`, and an old attempt is never reopened. `CANCELED` is the sole serialized spelling; localized prose may say “cancelled.” A deadline produces `EXPIRED` with `TASK_QUEUE_DEADLINE_EXCEEDED`, `TASK_EXECUTION_DEADLINE_EXCEEDED`, or another registered phase-specific reason; `TIMED_OUT` is never a state.

### 3.3 Receipt existence and standing

A receipt begins as an immutable `SEALED` object with standing `ACTIVE`. Standing records reliance/correction semantics and has this complete transition table:

| From | Allowed next standing | Constraint |
|---|---|---|
| `ACTIVE` | `SUPERSEDED`, `WITHDRAWN` | Supersession requires one immutable successor link; withdrawal requires attributed authority/reason |
| `SUPERSEDED` | `WITHDRAWN` | Later withdrawal does not erase the successor link or prior standing event |
| `WITHDRAWN` | — | Terminal; a later correction is a new linked receipt, never reactivation |

Storage/retention is the orthogonal `preservationStatus`: `AVAILABLE | ARCHIVED | PAYLOAD_REMOVED`. `AVAILABLE ↔ ARCHIVED`; either may move to terminal `PAYLOAD_REMOVED` only through an authorized privacy/legal-retention action that preserves the permitted tombstone, roots, events and honest verification gap. Temporary I/O failure is an observation/error, not a preservation transition.

In v0 O/L, preservation status is read-only product data: no ordinary Web/CLI/API archive, restore or payload-removal operation exists. `AVAILABLE ↔ ARCHIVED` is appended only by the Distribution Contract's verified custody job; `PAYLOAD_REMOVED` only by a completed governed privacy/legal rights case. Their event schemas, authority, dry-run/affected-copy report and two-person conditions belong to the Domain/Distribution Contract Sets. Institution surfaces remain blocked, and local uninstall/purge emits a deletion report rather than pretending a now-absent application can mutate every receipt afterward.

- `COMPILED`, `READY_TO_SEAL`, `ISSUED` and `PUBLISHED` are not receipt standing values.
- `EXPORTED`, `SHARED` and `PUBLISHED` are append-only distribution events with audience/disclosure information.
- `CONTESTED` is a review summary, not a mutation of receipt standing.
- A withdrawn or superseded receipt remains byte-addressable whenever `preservationStatus` and privacy/access policy permit; standing never claims that removed payload is retrievable.

### 3.4 Review and challenge

Review case legal edges are:

| From | Allowed next state(s) | Constraint |
|---|---|---|
| `DRAFT` | `SUBMITTED`, `WITHDRAWN` | Submission binds exact subject edges, actor and visibility |
| `SUBMITTED` | `RESPONSE_NEEDED`, `RESOLVED`, `WITHDRAWN` | Direct resolution requires attributed rationale and authority |
| `RESPONSE_NEEDED` | `RESPONDED`, `RESOLVED`, `WITHDRAWN` | Deadline closure uses outcome `UNRESOLVED`, never silent success |
| `RESPONDED` | `RESPONSE_NEEDED`, `RESOLVED`, `WITHDRAWN` | A new request is a new append-only event |
| `RESOLVED`, `WITHDRAWN` | — | Appeal or later evidence opens a linked new case; it never reopens history |

Every `RESOLVED` case has exactly one attributed outcome: `UPHELD | AMENDED | REJECTED_WITH_REASON | UNRESOLVED`. Here `RESOLVED` means the procedure is closed; `UNRESOLVED` means it closed without a substantive determination. Non-resolved cases have no resolution outcome.

`CONTESTED` is a derived summary when at least one unresolved challenge applies. A review never rewrites an assurance result or scientific verdict.

### 3.5 Verification and replay

Verification and replay use the generic task state. Their immutable terminal results are separate resources. A verification result contains the six assurance outcomes; a replay result adds the `numericalEquivalenceProfile` and divergence object from doc 17. Operational failure never creates `CONFIRMED`, `REFUTED`, or any other scientific verdict.

### 3.6 Legacy term mapping

| Existing target term | Canonical handling | Migration meaning |
|---|---|---|
| `DRAFT` | Draft lifecycle `EDITABLE` | Legacy draft identity/version must be preserved |
| `PREFLIGHT_READY` | `PreflightResult=PREFLIGHT_READY` | Requires exact draft version and reconstructable `ContractBindingSet`; otherwise fail `LEGACY_PREFLIGHT_SUBJECT_INCOMPLETE` |
| `PREFLIGHT_FAILED` | `PreflightResult=PREFLIGHT_BLOCKED` | Reason list and exact subject tuple are required; otherwise fail `LEGACY_PREFLIGHT_SUBJECT_INCOMPLETE` |
| `COMPILING`, `FINALIZING`, `VERIFYING` | Task stage/event | Never a receipt state |
| `COMPILED`, `ISSUED`, `READY_TO_SEAL`, `SEALED` | Only successfully atomic output becomes receipt `SEALED` | No public partially compiled receipt |
| `PUBLISHED`, `SHARED` | Distribution events | Do not serialize in receipt standing |
| `UNDER_REVIEW` | Review case `SUBMITTED` | Only when the legacy record identifies the review case; otherwise fail `LEGACY_REVIEW_SUBJECT_MISSING` |
| `REVIEW_RECORDED` | Review case `SUBMITTED` plus imported statement event | Preserve original actor/time/source; absent attribution fails `LEGACY_REVIEW_ATTRIBUTION_MISSING` |
| `CONTESTED` | Derived `reviewSummary=CONTESTED` | Requires at least one imported unresolved challenge; otherwise fail `LEGACY_REVIEW_BASIS_MISSING` |
| `ARCHIVED` as receipt standing | `preservationStatus=ARCHIVED`; standing resolved separately | Import standing from signed lineage/withdrawal events; otherwise fail `LEGACY_STANDING_UNKNOWN` rather than infer `ACTIVE` |
| `CANCELLING`, `CANCELLED` | `CANCEL_REQUESTED`, `CANCELED` | Aliases accepted only in an explicit legacy reader |
| `TIMED_OUT` | `EXPIRED` plus a registered phase-specific deadline reason | Map only when the legacy record proves the phase/deadline; otherwise fail `LEGACY_TIMEOUT_PHASE_UNKNOWN` |
| `AWAITING_AUTHOR`, `EVIDENCE_REQUESTED` | Review case `RESPONSE_NEEDED` | Request target, requester and requested remedy are mandatory; missing fields fail `LEGACY_REVIEW_REQUEST_INCOMPLETE` |
| `OPEN` | No unconditional mapping | Import fails `LEGACY_REVIEW_STATE_AMBIGUOUS`; an authorized migration decision selects `SUBMITTED`, `RESPONSE_NEEDED` or `RESPONDED` and appends the source value and rationale |

Legacy aliases MUST NOT be emitted by V2. A migration report enumerates every mapped/unmappable value.

## 4. Profile types and assurance result

Every serialized field, schema type and CLI selector containing the word `profile` MUST be qualified. Human prose may use “Profile O/L/I/H” only as a display label for the exact `deploymentProfile` values below; the one-letter labels are never V2 API/CLI values or compatibility fallbacks.

| Type | Purpose | Initial values / identity | Relationship to outcome |
|---|---|---|---|
| `deploymentProfile` | Where/how FAR-Lab runs | `O_OFFLINE_VERIFIER`, `L_LOCAL_AUTHOR`; `I_INSTITUTION_PRIVATE` blocked, `H_HOSTED` not approved | Constrains capabilities; never an assurance result |
| `verificationPolicy` | Which checks/trust material are required for this verification | Stable policy ID/version/digest with required dimensions and failure behavior | Selects requirements; never a pass badge |
| `scientificProfile` | Applicability/method/evidence/refusal contract | `scientificProfileId@version` + digest; only approved two-group scientific profile in v0 | May produce a bounded scientific verdict only after its validity gate |
| `numericalEquivalenceProfile` | How replay outputs compare | N0–N4 plus policy ID/version/digest | Produces replay/divergence result only |
| `disclosureProfile` | Which components/metadata may be exported | ID/version/digest and source/disclosure roots | Limits what can be verified; cannot improve assurance |

Every verification result always returns the six independent dimensions defined in core product doc 07: `provenance`, `integrity`, `identity`, `processConformance`, `executionReproduction`, and `scientificVerdict`, plus separate `reviewSummary`, receipt `standing` and `preservationStatus`. Named policies may require a subset, but no policy collapses the vector into one “verified” state.

`verificationPolicy` is not a synonym for trust policy. It declares required dimensions and failure behavior and MAY reference a versioned `trustPolicyId` for authorized identities, roots, signature/time suites, revocation/log freshness and historical/current validation rules. A `VerificationTimeContext` is a request/result object naming evaluation time, trusted evidence time, clock uncertainty and freshness inputs; it is neither a profile nor mutable ambient clock state. The trust store supplies governed material but does not select policy implicitly.

The previous `STRUCTURE_ONLY…SCIENTIFIC_PROFILE` ladder and `CORE_INTEGRITY_V2…DOMAIN_VALIDATED` list are design aliases, not two runtime enums. Before schema freeze they must be replaced by one registry of verification-policy documents whose required dimension predicates are explicit.

## 5. Canonical operation and surface map

The operation ID is the semantic authority. CLI, API and Web are projections; absence of an applicable projection is explicit.

| Operation ID | CLI | HTTP API v2 | Local Web | Mutation / task |
|---|---|---|---|---|
| `system.capabilities` | `far version --json` | `GET /api/v2/capabilities` | `/w/local/diagnostics/capabilities` | read-only/cacheable |
| `project.create` | `far project init` | `POST /api/v2/projects` | `/w/local/projects/new` | project mutation; idempotent |
| `project.get` | `far project show` | `GET /api/v2/projects/{projectId}` | `/w/local/projects/{projectId}` | read-only |
| `receipt.list` | `far receipt list --project <id> --kind receipt` | `GET /api/v2/projects/{projectId}/receipts` | `/w/local/projects/{projectId}/receipts` | read-only/cursor; explicit homogeneous kind |
| `draft.list` | `far receipt list --project <id> --kind draft` | `GET /api/v2/projects/{projectId}/drafts` | `/w/local/projects/{projectId}/drafts` | read-only/cursor; never mixed with receipts |
| `draft.create` | `far receipt init` | `POST /api/v2/projects/{projectId}/drafts` | `/w/local/projects/{projectId}/drafts/new` | draft mutation |
| `draft.get` | `far receipt inspect <draft>` | `GET /api/v2/drafts/{draftId}` | `/w/local/projects/{projectId}/drafts/{draftId}/materials` | read-only |
| `draft.update` | —; edit declared local manifest/material then preflight | `PATCH /api/v2/drafts/{draftId}` | same draft step routes | versioned mutation/`If-Match` |
| `draft.discard` | `far receipt discard <draft>` | `DELETE /api/v2/drafts/{draftId}` | same draft route with exact impact preview | idempotent terminal transition; workspace-bounded cleanup |
| `draft.preflight` | `far receipt preflight` | `POST /api/v2/drafts/{draftId}/preflights` | `/w/local/projects/{projectId}/drafts/{draftId}/preflight` | result or task |
| `draft.compile` | `far receipt compile` | `POST /api/v2/drafts/{draftId}/compilations` | `/w/local/projects/{projectId}/drafts/{draftId}/compile` | durable task |
| `receipt.get` | `far receipt show` | `GET /api/v2/receipts/{receiptId}` | `/w/local/projects/{projectId}/receipts/{receiptId}/summary` | read-only |
| `receipt.components.list` | `far receipt inspect <receipt>` | `GET /api/v2/receipts/{receiptId}/components` | `/w/local/projects/{projectId}/receipts/{receiptId}/materials` | read-only/cursor |
| `receipt.component.get` | `far receipt inspect <receipt> --component <id>` | `GET /api/v2/receipts/{receiptId}/components/{componentId}` | `/w/local/projects/{projectId}/receipts/{receiptId}/materials/{componentId}` | read-only/range where safe |
| `viewer.open` | open package `viewer/index.html`; `far receipt inspect` remains machine authority | —; static package only | `viewer/index.html` under `file://` | read-only/no network or mutation |
| `receipt.verify` | `far receipt verify` | `POST /api/v2/verifications` | `/w/local/projects/{projectId}/receipts/{receiptId}/verification` | durable task; no execution of research code |
| `verification.get` | —; result link from `far task show` | `GET /api/v2/verifications/{verificationId}` | `/w/local/projects/{projectId}/receipts/{receiptId}/verifications/{verificationId}` | immutable result |
| `receipt.replay` | `far receipt replay` | `POST /api/v2/replays` | `/w/local/projects/{projectId}/receipts/{receiptId}/replay` | separately approved isolated task |
| `replay.get` | —; result link from `far task show` | `GET /api/v2/replays/{replayId}` | `/w/local/projects/{projectId}/receipts/{receiptId}/replays/{replayId}` | immutable result |
| `receipt.diff` | `far receipt diff` | `POST /api/v2/comparisons` | `/w/local/projects/{projectId}/receipts/{receiptId}/compare` | read-only/result resource |
| `receipt.supersede` | `far receipt supersede` | `POST /api/v2/receipts/{receiptId}/supersessions` | `/w/local/projects/{projectId}/receipts/{receiptId}/correct` | durable task + lifecycle event |
| `receipt.withdraw` | `far receipt withdraw` | `POST /api/v2/receipts/{receiptId}/withdrawals` | `/w/local/projects/{projectId}/receipts/{receiptId}/withdraw` | governed lifecycle event |
| `export.create` | `far receipt export`, `far project export`, or `far review export` with one explicit subject | `POST /api/v2/exports` | subject-scoped `/export` route | durable atomic task |
| `task.get` | `far task show` | `GET /api/v2/tasks/{taskId}` | `/w/local/projects/{projectId}/tasks/{taskId}` | read-only |
| `task.events` | `far task events` | `GET /api/v2/tasks/{taskId}/events` | same task route | read-only/reconnectable |
| `task.cancel` | `far task cancel` | `POST /api/v2/tasks/{taskId}/cancellations` | same task route | idempotent mutation |
| `task.resume` | `far task resume` | `POST /api/v2/tasks/{taskId}/resumptions` | same task route | same-attempt verified-checkpoint mutation |
| `task.retry` | `far task retry` | `POST /api/v2/tasks/{taskId}/retries` | same task route | new attempt |
| `review.create` | `far review create` | `POST /api/v2/reviews` | `/w/local/projects/{projectId}/receipts/{receiptId}/review/new` | append-only |
| `review.get` | `far review show` | `GET /api/v2/reviews/{reviewId}` | `/w/local/reviews/{reviewId}` | read-only |
| `review.request_evidence` | `far review request-evidence` | `POST /api/v2/reviews/{reviewId}/requests` | same review route | append-only; moves to response-needed |
| `review.respond` | `far review respond` | `POST /api/v2/reviews/{reviewId}/responses` | `/w/local/reviews/{reviewId}` | append-only |
| `review.challenge` | `far review challenge` | `POST /api/v2/reviews/{reviewId}/challenges` | same review route | append-only targeted statement |
| `review.resolve` | `far review resolve` | `POST /api/v2/reviews/{reviewId}/resolutions` | same review route | governed terminal transition |
| `review.withdraw` | `far review withdraw` | `POST /api/v2/reviews/{reviewId}/withdrawals` | same review route | governed terminal transition |
| `review.import_exchange` | `far review import <exchange-package>` | `POST /api/v2/review-exchange-imports` | `/w/local/reviews/import` | verified/idempotent append under packaged event's legal operation |
| `policy.list` | `far policy list` | `GET /api/v2/policies` | `/w/local/policies` | read-only/cursor |
| `policy.get` | `far policy show` or `far policy explain` | `GET /api/v2/policies/{policyId}/versions/{version}` | `/w/local/policies/{policyId}/versions/{version}` | read-only/immutable |
| `policy.evaluate` | `far policy check` | `POST /api/v2/policy-evaluations` | policy page check panel | immutable result or durable task |
| `system.doctor` | `far doctor` | —; local process only | `/w/local/diagnostics` | read-only; never auto-installs |
| `system.config.get` | `far config show` | —; local process only | `/w/local/settings/config` | read-only; secrets redacted |
| `system.config.explain` | `far config explain` | —; local process only | same settings route | read-only source/precedence view |
| `system.config.validate` | `far config validate` | —; local process only | same settings route | read-only validation result |

Rules:

- `inspect`, `verify`, and `replay` are three actions: safe shape/metadata read; protocol/trust evaluation; isolated computation.
- CLI aliases such as legacy `task status` may exist for one compatibility window but emit canonical operation ID `task.get`; documentation uses only the canonical command.
- Every CLI grammar entry has a versioned `commandId`; doc 05's generated registry constrains its subject types and allowed canonical `operationId` values. Command ID, operation ID and invocation/diagnostic ID are never aliases.
- Interface inventories and journeys reference operation IDs, not hand-written alternate URLs.
- OpenAPI operation IDs, CLI machine envelopes and Web route manifests MUST be generated or validated against this source map.
- Batch verification is deferred until a complete operation/manifest/order/checkpoint/aggregate-exit contract is approved; it is not silently implied by WF-07.

## 6. Static viewer contract

Every portable V2 package intended for human exchange contains:

```text
README.txt
support/
  descriptor.json
viewer/
  index.html
  manifest.json
  styles.css
  summary.json
```

| Field | Contract |
|---|---|
| Authority | Canonical receipt components and verifier report are machine authority; viewer is a deterministic presentation component |
| Entry/fallback | `viewer/index.html` is the fixed entry; `README.txt` is mandatory plain-text fallback, not an alternative |
| Active content | Mandatory viewer uses no JavaScript, plugins, forms, service workers, remote fonts, remote images or external URLs that auto-fetch |
| Network | No hidden/network request; links requiring network are inert text or explicit user navigation with destination visible |
| Assets | All viewer files are manifest-listed and digest-bound; receipt verification reports their integrity separately from scientific content |
| Rendering | All untrusted text is escaped; unsafe markup is displayed as text; filenames/paths are safe normalized identifiers |
| Security declaration | HTML carries restrictive CSP where supported; the package still states that browser/file-scheme enforcement varies and verifier integrity is authoritative |
| Accessibility | Semantic headings/landmarks/tables, skip link, visible focus, 400% reflow, high contrast, no color-only result; relation table is complete without a graph |
| Unknown/tampered state | Unknown critical content or viewer digest mismatch produces a visible `UNVERIFIED_PRESENTATION` warning from the verifier; viewer cannot turn itself green |
| Versioning | `viewer/manifest.json` binds viewer schema/version, source receipt/disclosure root, generator digest/version and locale; canonical receipt bytes stay locale-neutral |

Acceptance includes offline `file://`, scripts disabled, styles disabled, Windows/POSIX path extraction, screen-reader navigation, unknown component, malicious text/URI and viewer tamper. Two independent viewers MUST select the same assurance/result fields even if presentation differs.

## 7. Distribution, diagnostics and first-success contract

### 7.1 One first ten-minute path

The only v0 quickstart is:

```text
install immutable candidate
→ verify artifact/signature
→ far doctor --deployment-profile O_OFFLINE_VERIFIER --offline
→ far receipt inspect <bundled-v2-sample>
→ far receipt verify <bundled-v2-sample> --offline
→ read six assurance dimensions and limitations
→ read the inspect/verify/replay boundary; replay is not run and always needs separate verified-input plus isolated-execution approval
```

The bundled sample is explicitly synthetic and demonstrates protocol behavior only. It cannot be used as scientific-validation or independent-certification evidence. Candidate-generated expected output and stable failure branches accompany every command. No model, service, credential or network is required.

Qualification target: representative first-time reviewers on clean supported machines complete this path within ten minutes under a preregistered usability protocol, and none of the critical comprehension sample interprets the result as truth, misconduct detection, scientific certification or proof that no evidence was omitted. Sample size and confidence target are set by the study plan; five formative users locate defects but cannot establish a population success rate.

### 7.2 Distribution lifecycle

For each supported OS/architecture, the distribution manifest freezes artifact name/digest/signature/provenance, runtime/native prerequisites, install/data/config/cache/trust-store/temp paths, PATH changes, offline behavior, update channel and support window.

Required qualification sequence begins on every declared tuple with `clean install → doctor → sample verify/tamper`. Under `L_LOCAL_AUTHOR`, the fixture then creates and seals one user-controlled receipt. Under read-only `O_OFFLINE_VERIFIER`, it instead imports/copies a separately signed preservation fixture into the declared user-data location without create/compile authority. Both continue `→ upgrade from last-supported → verify old/new receipt → rollback/read compatibility → uninstall --preserve-data → reinstall/verify → explicit purge preview → purge`. A profile is never failed for an operation it intentionally forbids; it is failed if its declared preservation path loses or silently rewrites the fixture.

Uninstall preserves receipts, trust store, configuration and audit records by default. Purge requires an exact preview and explicit confirmation, obeys legal/retention constraints and reports external/backup copies it cannot delete. An updater never consumes a mutable `latest` script as authority.

### 7.3 Doctor and diagnostic bundle

Each doctor check returns `checkId`, `status`, `observed`, `required`, `reasonCode`, `safeActions`, `docsVersion`, `candidateDigest` and redaction class. Minimum checks: artifact/provenance, OS/arch/filesystem, runtime/native ABI, storage/write/lock, isolation capabilities, network/offline policy, trust store/time, receipt/schema compatibility, temp/disk and prior data migration state.

Diagnostics are allowlisted, previewable, local by default and never include raw claim/material/prompt, secrets, private keys or credentials. Timeouts, cancellation grace, event replay window, checkpoint retention and temp cleanup are candidate configuration values exposed through capabilities—not prose placeholders.

### 7.4 Support descriptor and offline review exchange

Every installed candidate and portable export includes a digest-bound `support/descriptor.json`. It names `schemaVersion`, candidate/protocol compatibility, `lastVerifiedAt`, expiry/revalidation rule, and one entry for each `PRODUCT_FAULT`, `SCIENTIFIC_METHOD_DISPUTE`, `SECURITY_PRIVACY_INCIDENT`, and `REVIEW_APPEAL_CORRECTION` class. Each entry contains channel type/locator, online requirement, identity strength, availability and explicit SLA or `NO_SLA`, accountable owner/escalation, audit-retention class, expected disclosure, privacy notice and safe public-disclosure rule. A placeholder, expired descriptor or public-only security channel blocks a new external release; unreachability is shown as `SUPPORT_CHANNEL_UNAVAILABLE`, never silent abandonment. Descriptor expiry does not invalidate historical receipt bytes or assurance results: it removes any current-support claim. A separately signed, candidate/protocol-bound current descriptor may overlay the historical copy for routing without rewriting the receipt/export root, and both versions remain visible.

`far review export` creates a signed/digest-bound offline exchange package containing exact receipt root, review case ID/version, event IDs, actor assertion, targeted component/edge, requested remedy or response, disclosure root, schema/protocol range, creation/expiry and replay/deduplication key. `review.import_exchange` verifies integrity, compatibility, subject access, mapped event permission and legal transition before one idempotent append; its result identifies the underlying request/response/challenge action and imported event. It never auto-resolves a case, imports undisclosed payload, or treats actor assertion as verified identity without the named trust policy. Request and response packages round-trip across two clean offline installations in qualification.

## 8. Reference vertical slice

### 8.1 Two evidence tracks

| Track | Input | What it can prove | What it cannot prove |
|---|---|---|---|
| `VS-CONFORMANCE-V2` | Public synthetic two-group sample and fixed mutations | Protocol, interface, state, containment and deterministic conformance | Scientific validity or real workflow value |
| `VS-PILOT-TWO-GROUP-V1` | Preregistered, licensed, non-sensitive real dataset selected and locked by independent science owner | Bounded `scientificProfile` and author–reviewer study evidence | Other domains, causality or universal truth |

The real dataset is currently `UNKNOWN`; it MUST be selected before scientific implementation qualification, with data card, license, estimand, sampling frame, reviewers, power and holdout. Synthetic data never substitutes for that gate.

### 8.2 Happy path with authoritative outputs

| Step | Actor / operation | Required durable output | User-visible proof boundary |
|---:|---|---|---|
| 0 | Reviewer installs candidate, `system.doctor` | Candidate/support tuple and doctor report | Environment is supported; product behavior not yet proven |
| 1 | Author `project.create`, `draft.create` | Scoped IDs, draft version and local classification | No receipt/evidence yet |
| 2 | Author imports exact material and `draft.preflight` | Material digests, canonical `ContractBindingSet`, disclosure preview and refusals/gaps | Declared inputs/default absence are inspectable; origin/science not inferred |
| 3 | Author `draft.compile` | Task/attempt/events, isolated execution attestation, results or refusal | Operational result separate from scientific result |
| 4 | Producer atomically seals | Receipt root, mandatory manifest/components, six-dimension producer preflight | Self-check under named `verificationPolicy`; no independent claim |
| 5 | Author `export.create` with receipt subject | Verified export, disclosure root, static viewer and limitations | Exact disclosed subset and omissions visible |
| 6 | Reviewer `receipt.components.list` and `viewer.open` offline | Safe inventory and compatibility result | No code execution |
| 7 | Independent `receipt.verify` | Verifier report, exact TCK/version/trust inputs | Integrity/identity/process dimensions separated |
| 8 | Reviewer approves `receipt.replay` | Isolated replay attestation and divergence object | N0–N4 result; no automatic science upgrade |
| 9 | Reviewer `review.create` targeting one edge | Review case/event and support/offline exchange record | Human concern does not mutate receipt |
| 10 | Author responds and, when material, `receipt.supersede` | Response, affected set, successor and immutable link | Old receipt remains visible and current standing changes |
| 11 | Authorized actor optionally calls `receipt.withdraw` | Withdrawal event, notice status and exported lifecycle update | Discourages reliance; cannot erase copies |
| 12 | Operator exports/backups/uninstalls | Verified preservation/report and explicit residual copies | Data exit is testable and bounded |

### 8.3 Mandatory golden and failure scenarios

| ID | Scenario | Required result |
|---|---|---|
| VS-01 | Clean package on both independent verifiers | Same canonical root, six-axis result and stable reason codes |
| VS-02 | Required component byte flip | Integrity `FAIL`, exit/problem code for mismatch, quarantine; no replay |
| VS-03 | Manifest removed or a required `verificationPolicy`/`trustPolicyId` stripped | Hard downgrade failure; no legacy auto-detection |
| VS-04 | Unknown critical schema/field/algorithm | Same fail-closed compatibility result across implementations |
| VS-05 | Exact deterministic output | N0/N1 match under declared `numericalEquivalenceProfile` |
| VS-06 | BLAS/thread/hardware difference within frozen rule | N2 bounded result with full environment/delta |
| VS-07 | Numerically bounded result crosses science decision boundary | Bounded numeric result plus `DIFFERENT_DECISION`; no science-pass wording |
| VS-08 | Seed/PRNG/substream/call-order changed | Explicit randomness/environment divergence |
| VS-09 | Partial disclosure of sensitive member | New disclosure root, inclusion proof/omission limitation; source never shown complete |
| VS-10 | Low-entropy hidden value | No public dictionary-testable raw digest/nonce or correlation token |
| VS-11 | External reference moves, changes, denies access or disappears | Exact availability status; no mutable-latest substitution |
| VS-12 | Certificate expired/revoked or algorithm renewed | Historical/current/renewal dimensions remain separate and agree |
| VS-13 | Worker escape/egress/resource attempt | Fail-closed task, zero forbidden effect in governed corpus |
| VS-14 | Crash/cancel/duplicate request at each durable boundary | No false success/duplicate receipt; recovery and attempts exact |
| VS-15 | Challenge, concurrent correction and withdrawal | Version conflict/append history/affected set; no overwrite |
| VS-16 | Viewer corrupt, scripts/styles unavailable or malicious text embedded | Machine verification unchanged; accessible safe fallback and visible warning |
| VS-17 | Upgrade, rollback, uninstall-preserve and purge | Old receipt remains readable; deletion scope and residuals honest |
| VS-18 | Unsupported scientific input | Typed refusal/OOD result; no generic error or coerced verdict |

## 9. Parallel team contracts and integration order

| Workstream | May start from | Must deliver before downstream | Independence / stop rule |
|---|---|---|---|
| Domain/schema council | Docs 07, 17, 19 | Domain Contract Set + alias/migration table | Stop on any unresolved state/qualified-type/assurance collision |
| Protocol/TCK team | Approved domain set | Receipt/disclosure/viewer specs and public/sealed vectors | Does not implement producer; spec ambiguity is logged |
| Clean-room verifier team | Normative spec + prereview vectors only | Independent conformance report and shared-dependency declaration | No producer source/library; disagreement freezes protocol |
| Producer/storage team | Approved TCK and data invariants | Atomic producer/export and candidate reports | Cannot self-award verifier conformance |
| Isolated runner/science team | Approved `numericalEquivalenceProfile` and `scientificProfile` | Enforcement/replay attestations and locked science study | Synthetic track cannot pass science gate |
| Surface contract team | Domain set + operation map | OpenAPI/CLI/events/viewer schemas and generators | No business-rule fork by surface |
| CLI/API/Web teams | Approved Surface Contract Set | Consumer conformance and accessible journeys | Any added operation updates source map first |
| Distribution/release team | Stable slice artifacts | Install/upgrade/uninstall/docs/support candidate | No mutable source or placeholder channel |
| Independent quality/security/research | Frozen candidate and study protocols | Raw reports, failures, limitations and claim decision | Cannot be feature team self-score |

Dependency order:

```text
domain/state/qualified-type freeze
→ protocol/TCK + surface/distribution contract freeze
→ independent verifier and producer/runner in parallel
→ CLI/API/Web/viewer projections
→ candidate distribution and clean-machine qualification
→ conformance/adversarial/accessibility/user/science studies
→ scoped claim decision
```

## 10. Slice exit criteria

The reference slice is `PROVEN` only when all VS-01..18 pass on one immutable candidate, every declared platform, and both verifier paths; raw reports include failures and exclusions; the real science track independently passes its study; users complete author/reviewer/correction tasks; and install/upgrade/uninstall/support paths work without privileged project knowledge.

Until then, the correct handoff status is `SPECIFICATION_CLOSURE_REQUIRED`, not “implementation-ready” and not “world-class.”
