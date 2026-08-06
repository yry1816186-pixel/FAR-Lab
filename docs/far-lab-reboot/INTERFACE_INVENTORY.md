---
status: reviewed
owner_role: interface-architecture-lead
last_verified: 2026-08-05
scope: target and observed Web, CLI, API, notification, admin, SDK, and protocol surfaces
authoritative_for: [interface row inventory]
evidence_level: mixed
related_decisions: [DEC-007, DEC-008]
related_requirements: [REQ-UX-001, REQ-UX-003, REQ-CLI-001, REQ-API-001, REQ-ARCH-001]
supersedes: []
superseded_by: null
---

# Interface inventory

Status: target inventory unless a row says `CURRENT`. Detailed behavior authority is `04_EXPERIENCE_SPEC.md` and `05_CLI_API_CONTRACT.md`. “Required” means required for the bounded pilot, not implemented.

| ID | Type | Name / path / command | Role / JTBD | Inputs → outputs | States / recovery | Permission | Events / errors / audit | Accessibility / compatibility / tests | Owner / scope |
|---|---|---|---|---|---|---|---|---|---|
| IF-001 | Web | `/w/local/projects/:projectId/receipts` | Author/reviewer find work | filters/cursor → receipt summaries | loading, empty, partial, error; retry preserves filter | list authorized receipts only | `receipt.listed`; problem details | keyboard table/list, named filters; API contract/E2E | Product/Web; REQUIRED |
| IF-002 | Web | `/w/local/projects/:projectId/drafts`, `/new`, `/:draftId/:step` | Author list/resume/preflight/discard | filters or exact draft + bindings/assets → list/draft/preflight/discard result | loading/empty/dirty/invalid/conflict/blocked/discarded; save or terminal discard | author list/create/read/update/discard; no seal outside compile | validation/reason/stale-subject/discard events; no upload before consent | list/form/impact/error-summary/focus/accessibility tests | Product/Web; REQUIRED |
| IF-003 | Web | `/w/local/projects/:projectId/tasks/:taskId` | Author/reviewer observe long work | task ID → ordered progress/checkpoints | canonical task states; resume by event cursor | task participant | durable events; retry/cancel reasons | live region without chatter; event contract/chaos | Web/Platform; REQUIRED |
| IF-004 | Web | `/w/local/projects/:projectId/receipts/:receiptId/:tab` | Reviewer understand bounded result | receipt ID/verification policy → six-axis result | verifying, partial, incompatible; standing/preservation separate | invited/public disclosure | reason codes and verification event | no color-only verdict; comprehension study | Product/Trust; REQUIRED |
| IF-005 | Web | `/w/local/projects/:projectId/receipts/:receiptId/materials` | Reviewer trace provenance | evidence relation/filter → source/run edges | unavailable/redacted/expired/mismatch | disclosure policy | access audit; redaction reasons | graph has canonical equivalent table/text | Data/Web; REQUIRED |
| IF-006 | Web | `/w/local/reviews/:reviewId`, `/w/local/reviews/import` | Reviewer challenge/request/respond/import exchange | statement, target edge, evidence or package → case/event | canonical review states; invalid/duplicate exchange distinct | mapped participant/adjudicator role | append-only case/import events | labelled steps; notification/offline round-trip/E2E | Governance/Web; REQUIRED for pilot |
| IF-007 | Web | receipt `/compare`, `/correct`, `/withdraw` routes | All parties compare/correct/withdraw | exact receipt(s), draft/reason/version → diff/successor/event | compatible/partial/incompatible/conflict/governed withdrawal | receipt read plus action-specific role | supersession/withdrawal audit | semantic diff, impact preview, keyboard navigation | Trust/Web; REQUIRED |
| IF-008 | Web | `/w/local/policies/:policyId/versions/:version` | Author/reviewer understand rules | immutable version → rule scope/limits | active/deprecated/withdrawn/unavailable | public/read; governed publish | policy lifecycle events | stable anchors; schema/link tests | Science/Gov; REQUIRED |
| IF-009 | CLI | `far receipt init\|inspect` | Author start and preflight | files/stdin + qualified policy/profile selectors → draft/inventory/`ContractBindingSet` | clean/invalid/quarantined; no partial overwrite | workspace read/write as declared | structured warning/error envelope | TTY and non-TTY; Windows/POSIX path tests | CLI; REQUIRED |
| IF-010 | CLI | `far receipt compile` | Author produce candidate | ready preflight ID + exact subject/binding digest → task/receipt | stale binding refused; resumable; atomic seal or no receipt | ask for writes/compute; no implicit network | task/event/receipt IDs; audit | JSON/JSONL + exit codes; contract/E2E | CLI/Trust; REQUIRED |
| IF-011 | CLI | `far receipt verify` | Independent reviewer verify | package/stdin + verification policy + trust-time context → per-dimension report | pass/fail/partial/incompatible/error | read-only; network off unless explicit anchor | stdout schema; stderr diagnostics; audit optional local | broken pipe/SIGINT/corrupt package tests | CLI/Trust; REQUIRED |
| IF-012 | CLI | `far receipt diff\|supersede\|withdraw\|export` | Parties correct/share | receipts/reason/`disclosureProfile` → diff/new event/package | conflict, incompatible, interrupted finalize | role + two-person for governed withdrawal | immutable lineage and disclosure event | no overwrite default; exit-code matrix | CLI/Gov; REQUIRED/conditional identity |
| IF-013 | CLI | `far policy list\|show\|explain\|check` | Author/reviewer choose/understand/evaluate policy | no subject for list/show/explain; exact draft/receipt + policy for check → catalog/definition/evaluation trace | unknown subject distinct from unavailable policy or execution error | read-only | stable policy/rule/reason IDs | machine/human parity tests | CLI/Science; REQUIRED |
| IF-014 | CLI | `far task show\|events\|cancel\|resume\|retry` | User control long work | task/version/cursor → state/events | idempotent cancel; verified-checkpoint resume; retry creates attempt | task participant | ordered events; conflict/deadline reason | signal/resume/duplicate tests | CLI/Platform; REQUIRED |
| IF-015 | CLI | `far doctor\|config\|version` | Operator diagnose safely | `deploymentProfile`/path → compatibility/provenance | degraded/unsupported; actionable next step | read-only default | no secret echo; diagnostics IDs | supported OS install matrix | CLI/Release; REQUIRED |
| IF-016 | API | project create/get; project receipt/draft lists; draft create/get/update/preflight/discard paths exactly as doc 19 | Author integrate project/intake/preflight | schema, exact bindings and idempotency → project/draft/preflight/list/discard | validation/conflict/discarded/stale subject | OAuth/local principal + ownership | RFC 9457-style problem; audit mutations | OpenAPI/schema/authorization tests | API; REQUIRED |
| IF-017 | API | `POST /api/v2/drafts/:draftId/compilations`, `POST /api/v2/verifications`, `GET /api/v2/verifications/:verificationId` | Author/reviewer compile/verify/read result | exact inputs/qualified policies → `202 task` or immutable result | asynchronous; duplicate key returns same task/result | scoped action; verifier may be anonymous only for public disclosure | trace/task/result IDs; no sensitive payload logs | contract/idempotency/load | API/Trust; REQUIRED |
| IF-018 | API | `GET /api/v2/receipts/:receiptId`, `/components`, `/components/:componentId` | Reviewer retrieve bounded data | ID/policy/range → metadata/component | redacted/expired/withdrawn/incompatible | disclosure policy and capability URL if used | access decision audited | content type/range/cache/version tests | API/Data; REQUIRED |
| IF-019 | API | `GET /api/v2/tasks/:taskId`, `/events`; `POST /cancellations`, `/resumptions`, `/retries` | Client monitor/control | ID/cursor/expected version → ordered state | reconnect, cursor expired, terminal conflict | participant | SSE event IDs, heartbeat, terminal reason | SSE cancellation/order/slow-client tests | API/Platform; REQUIRED |
| IF-020 | API | review CRUD/event endpoints plus `/api/v2/review-exchange-imports` | Parties complete or import procedure | receipt/case/version/body/package → immutable event/import result | canonical case state; conflict/duplicate/rejected package are errors and escalation is an event, never extra states | explicit mapped role; two-person exceptional actions | decision/import rationale and notification audit | authorization/state-machine/offline E2E | API/Gov; pilot REQUIRED |
| IF-021 | API | policy/schema/capabilities plus `/api/v2/policy-evaluations` | Client negotiate/evaluate compatibility | version/range/subject → immutable definitions or evaluation | unsupported/deprecated/not-applicable | public read; governed policy release | cache/ETag/reason and deprecation | compatibility/TCK | API/Gov; REQUIRED |
| IF-022 | Notification | in-app/email webhook adapter | Parties receive action-required changes | event + preference → notification | pending/sent/failed/suppressed | recipient consent; no receipt content by default | delivery attempt and redacted payload | accessible content; retry/dup tests | Service/Privacy; CONDITIONAL |
| IF-023 | Admin | private institution console/CLI | Admin manage policy, roles, retention | governed request → auditable change | proposed/approved/applied/rolled back | two-person for trust/retention/break-glass | immutable admin audit | keyboard/accessibility; authorization tests | Governance; BLOCKED before institution mode |
| IF-024 | SDK | generated typed API client | Integrator automate without semantic drift | OpenAPI/schema → typed calls/events | mirrors API | same bearer scope | no separate business logic | version matrix | API; DEFERRED until API frozen |
| IF-025 | MCP/ACP/A2A | none in v0 | — | — | — | — | — | `NOT_APPLICABLE`; versions stay in benchmark until HYP-009 trigger | Architecture; NON-GOAL |
| IF-026 | CLI | `far receipt list\|show\|preflight` | Author/reviewer locate and validate without compile | project/kind or exact receipt/draft + bindings → homogeneous list/view/preflight | stale index rebuild; blocked/refused explicit; receipt/draft results never mixed | read-only | canonical operation IDs and reason codes | machine schema, empty/error/compatibility cases | CLI/Product; REQUIRED |
| IF-027 | CLI | `far receipt replay` | Reviewer independently execute after verify | receipt + `numericalEquivalenceProfile`/environment policy + approval → replay task/divergence | unsupported containment or `numericalEquivalenceProfile` fails before execution | explicit compute/resource/network capability | no receipt mutation; stable divergence errors | hostile worker + N0–N4 contract | CLI/Science; REQUIRED for replay claim |
| IF-028 | Static viewer | `viewer/index.html` + `README.txt` | Package-only reviewer reads safely | bound summary/components → six-axis accessible presentation | scripts/styles unavailable, viewer tampered, unknown component | read-only/no hidden network | viewer integrity separate from machine authority | offline/no-script/CSP/path/screen-reader corpus | Protocol/UX; REQUIRED |
| IF-029 | API | `POST /api/v2/replays`, `GET /api/v2/replays/:replayId`, `POST /api/v2/comparisons` | Integrator replay/compare explicitly | exact receipt/policies/subjects → task or immutable result | unsupported, divergent, incompatible and canceled distinct | scoped replay/read capabilities | task IDs and divergence/problem schemas | OpenAPI/consumer/containment tests | API/Science; REQUIRED for replay claim |
| IF-030 | Web/CLI | `/w/local/projects/new`, `/w/local/projects/:projectId`; `far project init\|show\|export` | Author establish/read/export one scope | local metadata or exact project subject → project/export | conflict, unavailable, partial export; no implicit global project | project owner/read/export capability | project/export IDs and audit | form/keyboard + CLI machine contract/E2E | Product/CLI/Web; REQUIRED |
| IF-031 | CLI | `far review create\|show\|request-evidence\|respond\|challenge\|resolve\|withdraw\|import\|export` | Parties complete or exchange review procedure | exact case/subject/version/event, exchange package or export destination → event/timeline/import/package | canonical review transitions; import idempotent; export never mutates case | mapped review role; governed resolution/withdrawal | attributed event/import/export ID; conflict/reason | CLI schema/permission/state/offline-exchange E2E | CLI/Gov; pilot REQUIRED |
| IF-032 | API | receipt supersession/withdrawal and subject export endpoints | Integrator correct/withdraw/distribute | exact receipt/project/review subject + expected version/policy → lifecycle event/task/export | conflict, duplicate, interrupted finalize | subject capability; governed withdrawal | immutable lifecycle/export audit | OpenAPI/idempotency/authorization/atomicity | API/Gov; REQUIRED/conditional identity |
| IF-033 | Web | `/w/local/diagnostics/capabilities`, `/diagnostics`, `/settings/config` | Local operator inspect compatibility/config safely | local candidate/path → capabilities/doctor/config source/validation | degraded/unsupported/redacted/unavailable; no auto-install | local read; secrets always redacted | invocation/diagnostic IDs; no sensitive payload | keyboard/screen-reader/redaction/platform E2E | Web/Platform; REQUIRED |
| IF-034 | Web | subject-scoped receipt/project/review `/export` routes | Authorized user create one export | exact typed subject + `disclosureProfile`/destination → export task | preview/conflict/interrupted finalize/no overwrite | subject export capability | disclosure/export task audit | impact preview, focus, atomic/no-overwrite E2E | Web/Gov; REQUIRED |
| IF-035 | Web | `/w/local/projects/:projectId/drafts/:draftId/compile` | Author start exact ready compilation | ready `preflightResultId` + subject/binding digest → durable task | blocked/stale/conflict/queued; never creates partial receipt | author compile with explicit compute/write impact | preflight/task/invocation IDs and refusal reasons | keyboard/error-summary/idempotency/stale-binding E2E | Web/Trust; REQUIRED |
| IF-036 | CLI | `far receipt discard <draft>` | Author terminate abandoned draft safely | exact draft/version + impact preview → discarded state/cleanup report | active-task/version conflict; already discarded is idempotent; outside-workspace refused | draft owner; workspace-bounded cleanup only | discard/tombstone/cleanup audit | path/symlink/idempotency/version/machine-schema tests | CLI/Product; REQUIRED |
| CUR-001 | CURRENT Web/API/CLI | 15 routes / 17 HTTP routes / 24 CLI commands | Demo and mixed operations | heterogeneous | semantics diverge; report/global state risk | browser route auth absent; JWT not enforced at handlers | replay can exit 0 on broken verification | current facts only | `02_REPOSITORY_FORENSICS.md`; REPLACE/PRESERVE by route map |

No interface may present a single undifferentiated “verified” badge. Every projection must identify receipt version, verification policy, all six assurance dimensions, scientific profile/scope, last verified time, review summary, receipt standing and preservation status.

## Operation-ID crosswalk

The detailed row remains the interface inventory; this crosswalk binds each target row to doc 19's canonical semantic operations without adding a second operation definition.

| Interface row | Canonical operation ID(s) |
|---|---|
| IF-001 | `receipt.list` |
| IF-002 | `draft.list`, `draft.create`, `draft.get`, `draft.update`, `draft.preflight`, `draft.discard` |
| IF-003 | `task.get`, `task.events`, `task.cancel`, `task.resume`, `task.retry` |
| IF-004 | `receipt.get`, `receipt.verify`, `verification.get`, `receipt.replay`, `replay.get` |
| IF-005 | `receipt.components.list`, `receipt.component.get` |
| IF-006 | `review.create`, `review.get`, `review.request_evidence`, `review.respond`, `review.challenge`, `review.resolve`, `review.withdraw`, `review.import_exchange` |
| IF-007 | `receipt.diff`, `receipt.supersede`, `receipt.withdraw` |
| IF-008 | `policy.list`, `policy.get`, `policy.evaluate` |
| IF-009 | `draft.create`, `draft.get`, `receipt.components.list`, `receipt.component.get` |
| IF-010 | `draft.compile` |
| IF-011 | `receipt.verify` |
| IF-012 | `receipt.diff`, `receipt.supersede`, `receipt.withdraw`, `export.create` |
| IF-013 | `policy.list`, `policy.get`, `policy.evaluate` |
| IF-014 | `task.get`, `task.events`, `task.cancel`, `task.resume`, `task.retry` |
| IF-015 | `system.capabilities`, `system.doctor`, `system.config.get`, `system.config.explain`, `system.config.validate` |
| IF-016 | `project.create`, `project.get`, `receipt.list`, `draft.list`, `draft.create`, `draft.get`, `draft.update`, `draft.preflight`, `draft.discard` |
| IF-017 | `draft.compile`, `receipt.verify`, `verification.get` |
| IF-018 | `receipt.get`, `receipt.components.list`, `receipt.component.get` |
| IF-019 | `task.get`, `task.events`, `task.cancel`, `task.resume`, `task.retry` |
| IF-020 | `review.create`, `review.get`, `review.request_evidence`, `review.respond`, `review.challenge`, `review.resolve`, `review.withdraw`, `review.import_exchange` |
| IF-021 | `system.capabilities`, `policy.list`, `policy.get`, `policy.evaluate` |
| IF-022 | No v0 core operation; conditional notification adapter consumes domain events only |
| IF-023 | No v0 operation; institution administration is blocked |
| IF-024 | Mirrors the applicable OpenAPI operation IDs; no SDK-only operation |
| IF-025 | `NOT_APPLICABLE` in v0 |
| IF-026 | `receipt.list`, `draft.list`, `receipt.get`, `draft.preflight` |
| IF-027 | `receipt.replay` |
| IF-028 | `viewer.open` |
| IF-029 | `receipt.replay`, `replay.get`, `receipt.diff` |
| IF-030 | `project.create`, `project.get`, `export.create` |
| IF-031 | `review.create`, `review.get`, `review.request_evidence`, `review.respond`, `review.challenge`, `review.resolve`, `review.withdraw`, `review.import_exchange`, `export.create` |
| IF-032 | `receipt.supersede`, `receipt.withdraw`, `export.create` |
| IF-033 | `system.capabilities`, `system.doctor`, `system.config.get`, `system.config.explain`, `system.config.validate` |
| IF-034 | `export.create` |
| IF-035 | `draft.compile` |
| IF-036 | `draft.discard` |
| CUR-001 | Current heterogeneous surface; no V2 operation-ID conformance claim |
