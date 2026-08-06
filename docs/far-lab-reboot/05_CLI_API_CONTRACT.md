---
status: reviewed
owner_role: cli-api-lead
last_verified: 2026-08-05
scope: detailed CLI grammar, machine output, API resources, tasks, errors, authorization, and compatibility
authoritative_for: [CLI command and exit contracts, HTTP API wire contracts]
evidence_level: mixed
related_decisions: [DEC-007, DEC-008]
related_requirements: [REQ-CLI-001, REQ-API-001, REQ-ARCH-001, REQ-UX-003]
supersedes: []
superseded_by: null
---

# FAR-Lab CLI, API and developer contract

| Field | Value |
|---|---|
| Status | `TARGET_CONTRACT; NOT_IMPLEMENTED` |
| Owner | Developer-experience owner + API owner (unassigned) |
| Evidence level | A current inventory; D target choices |
| Last verified | 2026-08-05 |
| Authority | External command/API semantics and compatibility; domain rules remain in the shared core |

## 1. One core, multiple projections

CLI, Web and optional HTTP API invoke the same application services for receipt draft validation, compilation, verification, policy evaluation, task lifecycle, review events/exchange import, supersession and export. They share identifiers, permissions, errors, audit events, compatibility rules and outcome vocabulary. A browser hash check may be an independent verifier implementation, but it must consume the same published receipt specification rather than a private Web DTO.

Initial supported surfaces:

| Surface | Initial status | Purpose | Authority boundary |
|---|---|---|---|
| CLI | REQUIRED | Local author/reviewer automation and canonical reference UX | Stable command/machine contract |
| Static receipt viewer | REQUIRED | Accessible no-write inspection | Never performs hidden network or domain decisions |
| Local Web app | CONDITIONAL | Guided drafting/review over loopback core | Same services as CLI; can be removed without receipt loss |
| Embedded loopback API | REQUIRED for Web/SDK internals | Resource/task access | Not a hosted API claim |
| Public/institution API | DEFERRED | Integration after authorization/tenancy gates | Separate `deploymentProfile` approval |
| TypeScript SDK | DEFERRED until API stabilizes | Generated contract client plus ergonomic helpers | No duplicated rules |
| Python SDK | NOT INITIAL SCOPE | Only after independent demand and verifier strategy | Avoid shallow parity package |
| MCP server, Agent Client/A2A gateway | NOT APPLICABLE at Gate 0–1 | No validated JTBD beyond ordinary CLI/API | May consume receipts read-only in a later threat review |
| Skills/plugins/hooks/marketplace | NOT APPLICABLE at Gate 0–1 | Expansion would enlarge code execution/supply-chain risk | No empty extension framework |
| Webhooks | DEFERRED | Institutional events only | Requires signing, delivery and privacy operations |

## 2. Current CLI/API forensic baseline

- Current CLI dispatches 24 top-level commands (`src/cli/far.ts:38-176`), but mixes product, demo, competition, admin and unsafe automation semantics.
- Current API registers 17 routes including probes/OpenAPI and 14 `/api/v1` endpoints (`src/api/server.ts:77-136`). Only the hypothesize request has Zod runtime validation; frontend types are hand-copied and critical JSON is cast.
- `POST /hypothesize` is synchronous, has no idempotency/task/cancel contract and defaults to offline fixture behavior (`src/api/routes/hypothesize.ts:39-91`; `src/api/internal/loop_runner.ts:133-164`).
- `runId` is not a persistence boundary, and report/latest-record helpers are global (`src/report/types.ts:20-29`; `src/report/generator.ts:64-123`; `src/api/internal/hypothesis_helpers.ts:19-44`).
- Current Web sends no bearer credentials and routes do not use attached roles for authorization.
- Current `replay` can return exit zero despite integrity/trace mismatch, whereas `verify` uses exit 7; automation semantics are inconsistent.
- Current scheduler invokes stored strings through a shell (`src/cli/commands/schedule.ts:154-173`) and is excluded from the target surface.

No target contract below is evidence that implementation already exists.

## 3. CLI grammar

Resource-first grammar is used for durable objects; action-first verbs are reserved for global diagnostics. Initial top-level commands:

```text
far receipt list|init|inspect|preflight|compile|discard|show|verify|replay|diff|supersede|withdraw|export
far policy list|show|check|explain
far task show|events|cancel|resume|retry
far review create|show|request-evidence|respond|challenge|resolve|withdraw|import|export
far project init|show|export
far doctor
far version
far config show|explain|validate
```

There is no default command that invokes an LLM. Optional upstream authoring assistants, if retained, live under an experimental namespace and cannot seal or distribute a receipt without the same compile gates.

### 3.1 Command contracts

| ID / command | Inputs | Observable output | Mutation / idempotency | Failure and recovery | Initial status |
|---|---|---|---|---|---|
| CLI-013 `receipt list/show` | List requires explicit project and `--kind receipt\|draft`; show requires exact receipt/path | One homogeneous receipt/draft page or one six-axis/lifecycle view | Read-only; stable cursor/kind/filter echo; no mixed resource array | Corrupt index is rebuildable; never falls back to global latest or guesses kind | REQUIRED |
| CLI-001 `receipt init` | Project path; optional stdin manifest | Draft ID/path and next required fields | Creates local draft only; `--from` repeat yields new draft unless explicit key | Input collision leaves prior files intact; `--dry-run` previews | REQUIRED |
| CLI-002 `receipt inspect` | Draft/package/path/`-` | Component inventory, evidence modes, disclosure and compatibility | Read-only | Quarantines unsafe shapes; partial inspection expressible | REQUIRED |
| CLI-014 `receipt preflight` | Exact draft version + canonical `ContractBindingSet` | Validation, required gaps, network/disclosure/default-absence preview | Read-only result or durable task; idempotent by subject digest | Refusal/block is typed; no receipt exists | REQUIRED |
| CLI-003 `receipt compile` | Exact ready `preflightResultId` + subject/binding digest | Task/receipt result and component manifest | Idempotency key or content-derived request identity; atomic seal | Changed draft/binding fails stale-subject check; resume safe checkpoint; no partial sealed receipt | REQUIRED |
| CLI-004 `receipt verify` | Package/path/`-`; verification policy; optional external trust material | Six-axis verification report without executing research code | Read-only except cache explicitly approved | Integrity mismatch exit 7; unsupported version 16; partial 15 | REQUIRED |
| CLI-015 `receipt replay` | Verified receipt; `numericalEquivalenceProfile`; isolated execution approval | Replay task and divergence result | Durable isolated task; never implicit in inspect/verify | Unsupported containment or numerical-equivalence contract fails before execution; output cannot rewrite receipt | REQUIRED for replay claim |
| CLI-005 `receipt diff` | Exactly two receipt IDs/paths | Machine/human diff by dimension | Read-only | Incompatible schema returns bounded partial result | REQUIRED |
| CLI-006 `receipt supersede` | Prior ID, corrected draft, reason | New receipt + immutable link | Never updates prior bytes; reason required | Conflict shows current successor; no force overwrite | REQUIRED |
| CLI-007 `receipt withdraw` | Receipt ID, reason, authority assertion | Append-only lifecycle event/derived export | Idempotent on event key; no deletion | Local mode labels identity unverified; future protected mode authorizes | CONDITIONAL |
| CLI-008 `receipt/project/review export` | Exactly one typed subject and applicable `disclosureProfile` | Receipt package, project export bundle or review-exchange package | Writes only named output; default refuses overwrite; never mutates subject | Temp + verified finalize; clean partial on interrupt | REQUIRED |
| CLI-009 `policy list/show/explain/check` | List filters; exact policy for show/explain; exact receipt/draft + policy for check | Catalog, immutable definition/human rule explanation, or subject evaluation trace | Read-only | Explain never accepts a subject; check reports missing subject inputs as explicit unknown, not operational error | REQUIRED |
| CLI-010 `task *` | Task ID | State/events/cancel/resume/retry result | Actions use expected state/version; retry creates a new attempt | Second interrupt forces process exit but does not claim task canceled | REQUIRED |
| CLI-011 `review create/show/request-evidence/respond/challenge/resolve/withdraw/import` | Receipt/check/case IDs, expected version, statement/evidence/outcome, or one exchange package | Timeline, attributed event, or verified idempotent imported event | Append-only legal state transition; import applies the packaged event's ordinary permission; never changes machine result | Integrity/compatibility/deduplication/conflict/identity/permission/illegal transition distinct | CONDITIONAL local pilot |
| CLI-012 `doctor/config/version` | `deploymentProfile`/path | Compatibility, provenance and safe next action | Read-only by default | No dependency install/rebuild unless a separately confirmed command exists | REQUIRED |
| CLI-016 `project init/show` | Explicit local root/name or exact project ID/path | Created project identity or scoped metadata | Init uses idempotency key; show is read-only; neither selects global/latest | Path/ID collision reports existing object and leaves bytes intact | REQUIRED |
| CLI-017 `receipt discard` | Exact editable draft ID/path, expected version and impact preview | Terminal discarded state plus bounded cleanup/tombstone report | Idempotent; never deletes source paths outside draft workspace or an existing task/receipt | Active referencing task/wrong version/out-of-workspace path refuses; partial cleanup is explicit | REQUIRED |

### 3.2 Common options and I/O

Every applicable command supports `--help`, `--version`, `--json`, `--ndjson`, `--no-color`, `--quiet`, `--verbose`, `--debug`, `--timeout`, `--offline` and `--diagnostic-out`. Qualified selectors are used where relevant: `--deployment-profile`, `--verification-policy`, `--scientific-profile`, `--numerical-equivalence-profile`, and `--disclosure-profile`. Bare `--profile` is not emitted by V2 because it erases type; a legacy alias must resolve one unambiguous type or fail. Mutating/high-risk commands also support `--dry-run`; `--yes` is permitted only with a complete noninteractive impact manifest; `--force` never bypasses integrity, authorization, legal hold, policy version or schema checks.

`--timeout` limits only the CLI invocation/request wait. If a durable task was accepted, client timeout neither cancels it nor changes its state; the terminal envelope returns exit 13 plus the known `taskId`/`invocationId` and directs the caller to `far task show/events`. A task-creating command may separately accept `--task-deadline <RFC3339-or-duration>` only as part of the validated `TaskRequest` impact preview, not as an ambient/scientific policy. The service resolves a duration once from durable `acceptedAt`, stores/echoes the absolute deadline, and returns that same value on idempotency replay; only its registered phase transition may produce `TaskAttempt.state=EXPIRED`. No adapter infers task expiry from transport silence.

Paths may be files, directories or `-` where streaming is defined. Globs are expanded by the shell and must be documented as such; URLs require explicit resolver permission. Non-TTY mode never prompts, animates or emits ANSI unless requested. TTY progress goes to stderr. Machine data goes only to stdout. Diagnostics, warnings and progress go only to stderr. Secrets, raw sensitive claims and access tokens never enter command arguments, process titles or diagnostic bundles.

Configuration precedence is:

`explicit CLI option > named environment reference > project config > user config > system config > built-in default`.

`far config explain` prints each effective non-secret value, source, schema version and deprecation; secret values show reference and availability only. Unknown configuration fields fail by default; compatibility mode preserves and reports them without applying them.

### 3.3 Machine output envelope

JSON mode emits one object; NDJSON mode emits an initial metadata event, ordered events and exactly one terminal event. Required envelope fields:

| Field | Meaning |
|---|---|
| `schemaVersion` | Output contract version, never inferred from CLI version |
| `commandId` | Versioned CLI command ID from the generated `CliCommandRegistry`, e.g. `far.receipt.inspect@2`; distinct from semantic operation |
| `operationId` | Canonical semantic operation ID from doc 19; stable across CLI/API/Web projections |
| `invocationId` | Unique identifier for this invocation and diagnostic correlation; never a receipt/task/operation ID |
| `invocationStatus` | CLI invocation outcome: `succeeded`, `succeeded_with_gaps`, `failed`, `canceled`; never a domain/task state |
| `result` | Command-specific validated value or null |
| `gaps` | Structured unknown/skipped/partial items |
| `warnings` | Stable codes; prose may localize |
| `error` | Stable error object or null |
| `versions` | CLI, core, receipt schema, policy and verifier where applicable |
| `startedAt`/`finishedAt` | RFC 3339 UTC; not canonical receipt inputs unless specified |

Streaming event fields add `sequence`, `eventId`, `eventType`, `taskId`, `attemptId`, `attemptNumber`, `occurredAt`, `data` and optional `previousEventId`. Consumers deduplicate by event ID and order by sequence within one task attempt.

`CliCommandRegistry` is part of the Surface Contract Set. Every exact grammar command maps one `commandId` to its allowed subject types and canonical `operationId` set. A polymorphic command resolves both from the validated subject: for example `far.receipt.inspect@2` emits `draft.get`, `receipt.components.list`, or `receipt.component.get`; it cannot emit an unregistered fourth meaning. `far.receipt.export@2`, `far.project.export@2`, and `far.review.export@2` are distinct command IDs that all project `export.create`. Generated help, JSON Schema and golden envelopes must agree with this registry.

Envelope success means the requested command interaction completed. Fetching a task whose domain state is `FAILED_TERMINAL`, `CANCELED` or `EXPIRED` therefore returns `invocationStatus=succeeded` with that state in `result`; `invocationStatus=failed` never becomes or rewrites a `TaskAttempt` state.

### 3.4 Exit codes

| Code | Meaning | Retry expectation |
|---:|---|---|
| 0 | Operation succeeded and requested policy/integrity condition is satisfied | No |
| 1 | Internal unclassified failure | No until diagnosed |
| 2 | CLI usage error | Correct invocation |
| 3 | Configuration invalid | Correct configuration |
| 4 | Input/schema invalid | Correct input |
| 5 | Resource not found | Check ID/path/qualified policy or profile ID |
| 6 | Version/state/idempotency conflict | Fetch current state, compare, then retry |
| 7 | Integrity/anchor mismatch or tamper indication | Never blind retry; quarantine/investigate |
| 8 | Policy checks not satisfied | Expected domain outcome, not service failure |
| 9 | Required conclusion unknown/incomplete/not evaluated | Supply evidence or accept abstention |
| 10 | Authentication failed | Reauthenticate |
| 11 | Permission/approval denied | Request authorized action; no automatic retry |
| 12 | Dependency/network temporarily unavailable | Retry with backoff or offline input |
| 13 | Invocation/request wait deadline exceeded; durable task may still run | Use returned task ID to inspect events/state; do not blind retry |
| 14 | Canceled | Resume/restart if safe |
| 15 | Partial success/gaps when caller required complete | Inspect component statuses |
| 16 | Receipt/policy/API compatibility unsupported | Use compatible verified version or migrate copy |
| 17 | Resource/cost limit exceeded | Change approved budget/input |
| 70 | Fatal local environment/distribution error | Run `doctor`; reinstall verified version |

The current exit-7 tamper convention is preserved. `replay`/inspection never claims success if its requested verification condition failed.

### 3.5 Interrupt and recovery

For a command that created or is explicitly following a cancellable durable task, first Ctrl+C sends its idempotent cancellation request and waits up to the documented grace period; second Ctrl+C exits the client and prints whether cancellation remains pending. For a read-only local/HTTP invocation with no such task, Ctrl+C only stops the client/request and never manufactures task cancellation. SIGTERM performs bounded cleanup and leaves a checkpoint or terminal diagnostic. Subprocess trees and temporary paths are owned by a task attempt. Every non-atomic command documents which outputs are complete, quarantined or safe to delete. Resume validates receipt/input/policy/environment hashes before continuing.

## 4. HTTP style and version

Use REST resources plus SSE for task events. The receipt domain is resource-oriented and benefits from standard caching, ETags and offline tooling; GraphQL adds no demonstrated value. Large binary transfer uses preflighted content resources only if later required. The target incompatible redesign starts at `/api/v2`; existing `/api/v1` remains explicitly experimental or is removed before public release—never silently changes semantics.

OpenAPI 3.1 plus referenced JSON Schemas is the machine authority for every request, response, enum, problem detail and SSE event. Generated server validators and client types derive from it. Examples are contract-tested. The receipt schema, API schema, policy schema and CLI output schema version independently.

## 5. Resource model and endpoint contract

Initial local-mode endpoints are scoped by stable IDs, never global “latest.” Collection pagination is cursor-based with a stable sort and upper bound. Every mutable resource carries `version` and `ETag`.

| Method/path | Purpose | Success | Concurrency/idempotency | Required scope |
|---|---|---|---|---|
| `GET /api/v2/capabilities` | Supported schemas, qualified policy/profile types and limits | 200 | Cacheable, ETag | local/read |
| `POST /api/v2/projects` | Create local project | 201 | `Idempotency-Key`; replay returns same project | local/write |
| `GET /api/v2/projects/{projectId}` | Project metadata | 200 | ETag | project/read |
| `GET /api/v2/projects/{projectId}/receipts` | Receipt list only | 200 | Cursor and immutable filter echo | project/read |
| `GET /api/v2/projects/{projectId}/drafts` | Draft list only | 200 | Cursor and immutable filter echo | project/read |
| `POST /api/v2/projects/{projectId}/drafts` | Create/import draft | 201 | Idempotency key | project/write |
| `GET/PATCH /api/v2/drafts/{draftId}` | Read/update draft | 200 | `If-Match` mandatory for PATCH | draft/read/write |
| `DELETE /api/v2/drafts/{draftId}` | Terminally discard one editable draft | 204/200 prior result | `If-Match` + idempotency; workspace-bounded cleanup | draft/write |
| `POST /api/v2/drafts/{draftId}/preflights` | Validate exact draft version + canonical `ContractBindingSet` digest | 200 or 202 if expensive | Idempotent by the complete preflight subject digest | draft/read |
| `POST /api/v2/drafts/{draftId}/compilations` | Compile exact ready `preflightResultId` + subject/binding digest | 202 + task location | Idempotency key; stale/mismatched subject refused; exact replay same task/result | draft/compile |
| `GET /api/v2/receipts/{receiptId}` | Receipt summary/current lifecycle | 200 | Immutable receipt body; lifecycle view ETag | receipt/read |
| `GET /api/v2/receipts/{receiptId}/components` | Manifest/material metadata | 200 | Cursor; redaction policy | receipt/read |
| `GET /api/v2/receipts/{receiptId}/components/{componentId}` | One manifest-declared component | 200/206 | Immutable component ETag; range where safe | receipt/read |
| `POST /api/v2/verifications` | Verify receipt against one verification policy | 202 | Idempotency over receipt+verifier+policy+trust inputs | receipt/verify |
| `GET /api/v2/verifications/{verificationId}` | Structured verification result | 200 | Immutable once terminal | receipt/read |
| `POST /api/v2/replays` | Execute one verified receipt under a numerical/environment policy | 202 | Idempotency over receipt+runner+numeric/environment policy | receipt/replay |
| `GET /api/v2/replays/{replayId}` | Replay attestation and divergence object | 200 | Immutable once terminal | receipt/read |
| `POST /api/v2/comparisons` | Compare two explicitly named receipts by compatible dimensions | 200/202 | Idempotency over ordered subject roots and comparison policy | receipt/read |
| `POST /api/v2/receipts/{receiptId}/supersessions` | Compile/link corrected successor | 202 | If-Match lifecycle + idempotency | receipt/supersede |
| `POST /api/v2/receipts/{receiptId}/withdrawals` | Append withdrawal event | 201 | If-Match; repeat key returns same event | receipt/withdraw |
| `POST /api/v2/reviews` | Record review/evidence request | 201 | Idempotency + receipt version | review/write |
| `GET /api/v2/reviews/{reviewId}` | Review and response timeline | 200 | ETag | review/read |
| `POST /api/v2/reviews/{reviewId}/responses` | Append an attributed response | 201 | Idempotency; no overwrite | review/respond |
| `POST /api/v2/reviews/{reviewId}/requests` | Append an evidence request | 201 | Idempotency; exact target/remedy required | review/request |
| `POST /api/v2/reviews/{reviewId}/challenges` | Append a targeted challenge | 201 | Idempotency; subject/version required | review/challenge |
| `POST /api/v2/reviews/{reviewId}/resolutions` | Resolve with attributed outcome/reason | 201 | If-Match + idempotency; separation policy | review/resolve |
| `POST /api/v2/reviews/{reviewId}/withdrawals` | Withdraw review case | 201 | If-Match + idempotency | review/withdraw |
| `POST /api/v2/review-exchange-imports` | Verify/import one offline packaged review event | 201/200 duplicate | Package deduplication key + target If-Match; mapped event permission | review/import |
| `GET /api/v2/tasks/{taskId}` | Task state/checkpoint/result links | 200 | ETag; task-scoped | task/read |
| `GET /api/v2/tasks/{taskId}/events` | SSE ordered event stream | 200 | `Last-Event-ID`; replay window | task/read |
| `POST /api/v2/tasks/{taskId}/cancellations` | Request cancel | 202/200 terminal | Idempotent; expected task version | task/cancel |
| `POST /api/v2/tasks/{taskId}/resumptions` | Resume a paused task from a verified checkpoint | 202 | If-Match + idempotency; same binding check | task/resume |
| `POST /api/v2/tasks/{taskId}/retries` | New attempt | 202 | Explicit retry token; safe-state gate | task/retry |
| `GET /api/v2/policies` | Compatible policy catalog | 200 | Cursor; exact version filters | policy/read |
| `GET /api/v2/policies/{policyId}/versions/{version}` | Immutable policy | 200 | Content ETag | policy/read |
| `POST /api/v2/policy-evaluations` | Check/evaluate one exact policy against a named draft/receipt and return its rule trace | 200/202 | Idempotent over subject and policy digests | policy/evaluate |
| `POST /api/v2/exports` | Create verified export task for one explicit receipt/project/review subject | 202 | Idempotency + `disclosureProfile` | subject/export |

No endpoint accepts an arbitrary caller-supplied `runId` as a label over global data. IDs are generated/validated by the service and every query is project/receipt/task scoped. “Current” is a lifecycle relationship resolved from an explicit receipt, never database recency.

## 6. Long-task contract

`TaskAttempt` states and transitions are exactly doc 19 §3.2: the active path is `QUEUED → PREPARING → RUNNING ↔ PAUSED`; eligible nonterminal states may enter `CANCEL_REQUESTED`; terminal attempt states are `SUCCEEDED`, `SUCCEEDED_WITH_GAPS`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `CANCELED`, and `EXPIRED`. No arrow notation in a generated contract may imply that `CANCEL_REQUESTED` follows a success/failure state.

Only documented transitions are accepted with expected version. Cancellation is cooperative at declared safe points; a terminal sealed receipt is never rolled back by cancel, and any later distribution remains a separate event. Retry follows doc 19's exact source-state/reason eligibility, atomically creates the sole new current attempt and reuses only artifacts whose content/policy/environment bindings still match. Results and partial outputs have explicit retention and cleanup state.

SSE semantics:

- events are at-least-once, ordered within a task attempt and may duplicate across reconnect;
- `Last-Event-ID` replays within the advertised replay-retention window; beyond it, the client refreshes task snapshot;
- heartbeats contain no business state; event absence is not task failure;
- stage events describe actual committed state, never progress guessed by time;
- terminal event is followed by a fetchable immutable result or structured failure;
- permission revocation closes the stream without leaking later events.

Initial local implementation may serialize compute-heavy tasks; it must still expose queue/backpressure. Multi-worker or distributed queue is not authorized until load evidence requires it.

## 7. Error contract

Every non-2xx response uses `application/problem+json` with:

| Field | Requirement |
|---|---|
| `type`, `title`, `status`, `detail`, `instance` | RFC-style problem identity and user-readable summary |
| `code` | Stable FAR code, e.g. `RECEIPT_INTEGRITY_MISMATCH` |
| `diagnosticId` | Redacted correlation identifier |
| `retryable` | Boolean derived by server, not guessed by client |
| `safeActions` | Stable action codes with optional links |
| `fieldErrors` | JSON Pointer + code + message for validation |
| `taskId`/`resourceVersion` | Present when failure is tied to durable state |
| `details` | Schema-defined, redacted and optional; never stack/secrets by default |

Status mapping: 400 invalid syntax, 401 authentication, 403 permission without revealing inaccessible resources, 404 absent/non-disclosing, 409 state/idempotency conflict, 412 ETag mismatch, 413/422 size/semantic validation, 429 quota with retry information, 503 retryable dependency, 504 request/gateway wait deadline. HTTP 504 never implies `TaskAttempt=EXPIRED`; if a task was durably accepted, its ID remains retrievable through the idempotency record and the client queries it. Only the task engine's explicit bound deadline emits `EXPIRED` with a registered phase reason. A policy/check failure is normally a successful verification resource with a nonconformant outcome, not HTTP 500.

## 8. Identity, authorization and local mode

Local mode is explicitly single-user, loopback-only, one local workspace and no identity assurance. It does not convert user-entered reviewer names into authenticated identities. Any non-loopback bind requires an approved protected `deploymentProfile`; no permissive fallback exists.

Institutional mode is blocked until the architecture supplies:

- OIDC/OAuth2 or equivalent SSO, short sessions, revocation and high-risk reauthentication;
- machine identities/service accounts with rotation and least scope;
- project/receipt/review object authorization, not route authentication alone;
- roles plus attributes: author, reviewer, policy owner, records/privacy owner, operator, auditor; affected-party access and conflict-of-interest constraints;
- deny-by-default permission matrix and separation of policy publication, receipt authorship and high-risk review;
- audit of access/denial/role changes, emergency access and revocation;
- tenant isolation tests across queries, caches, events, exports, logs and object storage.

Browser credentials are not persisted in local storage. Future hosted Web uses a reviewed secure-session/BFF pattern or equivalent, CSRF controls and restrictive CORS. API keys/tokens never appear in URL, CLI argument or receipt.

## 9. Compatibility and lifecycle

| Artifact | Version rule | Compatibility promise | Deprecation/retirement |
|---|---|---|---|
| Receipt format | Receipt V2 schema URI/version + canonicalization algorithm ID | Verifier declares readable and fully verifiable ranges separately | Old bytes remain inspectable; unsupported checks become explicit unknown, never guessed |
| Policy | Immutable ID + semantic version + digest | Receipt pins exact version; no “latest” substitution | Withdrawal stops new use but preserves historical verification |
| API | `/api/v2` plus schema revision | Additive fields only within published window; clients ignore only marked extensible fields | At least one published migration/tooling window after real stable release |
| CLI human text | May improve within compatible release | Not script authority | No guarantee beyond documented labels |
| CLI machine schema | Independent version | Stable fields/enums; additive only where declared | Capability negotiation and fixtures |
| Task event | Event schema version | Consumers handle unknown noncritical event types | Critical unknown state forces snapshot refresh |
| SDK | Generated against exact API contract | Published client/server matrix | Warning then sunset with migration test |

Before a first stable release, do not promise a calendar deprecation window that the team cannot staff. Mark interfaces experimental and version them honestly. After stable, breaking changes require a new major Receipt schema, API or CLI-machine version as applicable, plus migration specification, compatibility tests and rollback path.

## 10. Integrations and extension restraint

Initial integrations are filesystem/Git references and generic content-addressed URLs, because they enable the core handoff without privileged SaaS access. DOI/Crossref/ORCID, repositories, experiment trackers, cloud drives, notification systems and model platforms require a connector card before adoption:

`user/JTBD; exact auth scopes; inbound/outbound fields; local/remote retention; rate and cache; incremental sync; conflict semantics; delete propagation; license/terms; failure isolation; test tenant; owner; vendor-exit export; security/privacy review`.

No connector may convert a remote mutable identifier into immutable provenance without capturing version/content hash and retrieval context. Loss of a provider degrades resolution while leaving embedded receipt verification possible.

MCP, skills, plugins, arbitrary tools and hooks are rejected from the initial product because the core receipt workflow does not require general extension execution and the current “sandbox” is not OS isolation. A future read-only MCP server could expose `receipt.components.list`, `receipt.verify`, `verification.get`, `policy.get` and `task.get` after schema, prompt-injection, access-control and output-exfiltration reviews; mutation, sealing, distribution and withdrawal operations stay unavailable until explicit human-authorization contracts exist.

## 11. Security, privacy, observability and limits

- Request bodies and raw materials are not logged. Audit records stable IDs, action, actor class, policy/version, result and diagnostic link under retention rules.
- Default body/receipt/component limits are published by capability discovery; archive expansion, path traversal, symlink, parser and active-content defenses fail closed.
- Rate/fair-use limits are per identity/project in protected mode and separate read from compute/write; 429 states retry time.
- Each request propagates a redacted trace/diagnostic ID; task stages emit structured duration, resource and dependency metrics without content.
- Metrics: request/task latency and outcomes, queue depth/age, cancellations, retries, duplicate idempotency hits, SSE reconnects, compatibility failures, integrity mismatches, policy unknowns and export failures. Labels never contain claim text, receipt IDs or user-supplied high-cardinality content.
- SLOs and alerts are defined in the platform spec; `/health` is liveness, `/ready` tests essential dependencies, `/metrics` is protected/operational—not a public promise from this spec.
- Every network resolver declares host, purpose, data sent, cache, timeout and offline behavior in preflight.

## 12. Acceptance matrix

| Area | Required scenarios | Pass gate | Monitor | Rollback |
|---|---|---|---|---|
| CLI human/machine I/O | TTY/non-TTY, pipes, redirected stderr, JSON/NDJSON, no color, large output | Machine output validates and contains no UI text/noise | Schema errors and consumer fixtures | Retain prior machine schema |
| Exit semantics | Valid, integrity failure, policy failure, unknown, cancel, timeout, dependency, compatibility | Exact code and error object agree across OS | Exit-code distribution | Compatibility shim for documented code only |
| Idempotency | Retry before/after timeout, concurrent duplicate, changed body with same key | One logical mutation; mismatch yields conflict | Duplicate/replay/conflict counts | Disable mutation endpoint, keep read/export |
| Run isolation | Parallel projects/receipts/tasks, adversarial IDs and caches | Zero cross-association or existence leak | Isolation canaries/security tests | Single-user serialized local mode |
| Task lifecycle | Refresh, reconnect, duplicate event, cancel race, worker crash, retry | Legal transitions only; no duplicate receipt | Queue age, stuck state, attempts | Read-only safe mode/export partial |
| Contract | Server validation, generated client, docs/examples, unknown fields | OpenAPI/JSON Schema tests agree; no unsafe casts | Contract drift gate | Pin prior API version |
| Authz | Every action/object/tenant, revocation and permission change | Default deny and isolation matrix | Denials, emergency access, anomaly | Disable protected/shared `deploymentProfile` |
| Compatibility | Old receipt/policy/client/event, tampered downgrade | Honest inspect/unknown/fail; no silent upgrade | Compatibility failures by version | Ship verified standalone old verifier |
| Interrupt/recovery | Ctrl+C×1/×2, SIGTERM, crash, full disk, temp collision | State and cleanup accurately reported | Abandoned tasks/temp bytes | Manual recovery guide and read-only mode |
| Distribution | Clean install, offline install, upgrade/downgrade/uninstall on claimed OS | Version-bound checksum/signature; no mutable fallback | Install failure/doctor reports | Withdraw broken artifact and pin last good |
| Diagnostics/privacy | Error bundle, malformed inputs, secrets, raw content | Useful diagnosis with zero prohibited fields | Redaction test/incident count | Disable bundle collection |

## 13. Explicit non-goals

No GraphQL, generic RPC framework, public SaaS endpoint, plugin marketplace, general MCP tool server, webhook bus, multi-language SDK matrix, shell-command scheduler, interactive chat/TUI, automatic updater or remote telemetry is authorized for the first strategy-validation release. Each requires observed demand and a new threat/operations decision.
