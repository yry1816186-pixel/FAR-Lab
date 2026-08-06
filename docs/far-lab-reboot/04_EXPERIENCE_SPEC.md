---
status: reviewed
owner_role: product-design-lead
last_verified: 2026-08-05
scope: detailed Web information architecture, pages, content, states, accessibility, and UX acceptance
authoritative_for: [detailed Web interface contracts, component and accessibility behavior]
evidence_level: mixed
related_decisions: [DEC-002, DEC-008]
related_requirements: [REQ-UX-001, REQ-UX-002]
supersedes: []
superseded_by: null
---

# FAR-Lab experience specification

| Field | Value |
|---|---|
| Status | `TARGET_CONTRACT; NOT_IMPLEMENTED` |
| Owner | Product design owner + accessibility owner (unassigned) |
| Evidence level | A for current-state findings; D/E for target choices and user hypotheses |
| Last verified | 2026-08-05 |
| Authority | Target information architecture, Web behavior, content and accessibility; implementation details remain subordinate |

## 1. Experience outcome

The target experience helps one author make a bounded verification receipt and a different reviewer understand, reproduce, challenge and supersede it. It must reduce uncertainty without manufacturing confidence. The primary interface is the CLI; the Web application is a local-first receipt builder/viewer and review surface over the same domain core.

The experience is successful when a reviewer can answer, without author coaching:

1. What exact claim and scope is being checked?
2. Which materials are original, transformed, derived or missing?
3. Which policy and verifier versions ran?
4. What passed, failed, was skipped, or remains unknown—and why?
5. What did each of provenance, integrity, identity/authorization, process conformance, execution reproduction and scientific verdict establish or leave unknown?
6. What safe next action is available: rerun, request evidence, challenge, correct, export or stop?

## 2. Current experience disposition

Current interface facts are in `02_REPOSITORY_FORENSICS.md`. The following is a design decision, not a code-change instruction.

| Current surface | Evidence-based issue | Target disposition |
|---|---|---|
| `/integrity` | Strongest real vertical slice; backend proof plus browser recomputation | Retain mechanics inside receipt “Integrity” tab; add verification-policy limits and text/table equivalent |
| `/viz` | D3 graph is useful but mouse-only and lacks accessible name/keyboard navigation | Make optional relationship view; table/tree is primary equivalent |
| `/overview`, `/honesty`, `/versions` | Real API data but global/latest semantics and scattered mental model | Consolidate into receipt list/detail/timeline |
| `/wizard` | Real POST, simulated stages, no bundle export, incomplete command and overstated sealing | Replace with explicit draft/preflight/compile task; never simulate progress |
| `/hero`, `/demo` | Browser/fixture theatre presented close to live verification | Move to clearly labeled static education outside authenticated/product flow or remove |
| `/court`, `/arena`, `/leaderboard`, `/ablation` | Fixture/showcase metaphors imply adjudication/competition | Remove from core navigation; conformance corpus is developer documentation |
| `/report` | Arbitrary run ID labels global DB content | Block until receipt/run isolation exists; replace with receipt-scoped export preview |
| `/about` | Mixed truth/integrity language | Replace with “How verification works / what it cannot prove” |
| API-backed shell | Good skip link, landmarks, focus trap/restoration; incomplete titles/i18n | Retain patterns, require route/title and complete localization gates |

## 3. Core journeys

| Journey | Trigger and goal | Cognitive/trust risk | Wait/notification | Failure recovery | Success metric |
|---|---|---|---|---|---|
| Author first receipt | A claim is ready for handoff; package it correctly | Confusing evidence with proof; exposing sensitive data | Preflight is synchronous; compile becomes durable task | Draft autosave; remove unsafe material; retry from checkpoint | First valid receipt without expert help; no undeclared disclosure |
| Author routine update | New run/result should supersede prior receipt | Overwrite history or reuse stale policy | Diff available before compile | Fork from prior version; cancel at a safe point before atomic seal; export/distribution stays separate | Correct version link and reason in under 10 minutes |
| Reviewer verification | Receipt arrives; identify what can be trusted | “Pass” read as truth | Local progress with stages and resource use | Quarantine unsafe component; verify remaining components; report partial | Correct bounded interpretation and next action |
| Evidence request | Reviewer finds a gap | Vague email and lost context | Due date and local notification/export | Reopen request; add component; supersede receipt | Gap linked to check and resolved or explicitly refused |
| Contest/correction | Author disputes a check or source | Power imbalance and silent reversal | Acknowledgement after accountable owner exists | Independent review; preserve old state; distribute an attributed correction notice separately | Complete trace and accurate current-state comprehension |
| Restricted/offline | No network or material cannot leave machine | Hidden network access or unresolved references | Explicit offline capabilities and skipped resolvers | Import cached reference; mark unverifiable | Zero network attempts without consent; honest partial result |
| Incident/exit | Corruption, exposure, unsupported upgrade or tool exit | Loss of evidence or false deletion belief | Status/diagnostic ID; no SLA until staffed | Read-only safe mode; verified export; revoke anchor/key | Portable export opens independently; deletion limitations clear |

## 4. Target information architecture

### 4.1 Domain hierarchy

```text
Local workspace
└── Project
    ├── Receipt drafts
    │   ├── Claim and scope
    │   ├── Materials and versions
    │   ├── Policy and check plan
    │   └── Disclosure preview
    ├── Receipts
    │   ├── Verification summary
    │   ├── Materials / provenance
    │   ├── Checks / methods
    │   ├── Integrity / identity / verification policy
    │   ├── Review / evidence requests
    │   └── Timeline / supersession
    ├── Tasks
    └── Exports
Policies
Review inbox
Diagnostics and help
Settings / data and privacy
```

`Case`, `Decision`, `Organization`, multi-user administration and legal hold are reserved institutional concepts and must not appear in the initial local product as empty navigation.

### 4.2 Stable URLs

| Object | Canonical URL | Required behavior |
|---|---|---|
| Project | `/w/local/projects/{projectId}` | Deep-linkable; missing, forbidden, read-only-filesystem and temporarily unavailable conditions distinct; no v0 project-archive state/op |
| Receipt list | `/w/local/projects/{projectId}/receipts` | Filters in URL; stable cursor, not raw offset |
| Draft | `/w/local/projects/{projectId}/drafts/{draftId}/{step}` | Resume-safe; unsaved/invalid state explicit |
| Receipt | `/w/local/projects/{projectId}/receipts/{receiptId}/{tab}` | ID and version always visible; old/current distinction |
| Task | `/w/local/projects/{projectId}/tasks/{taskId}` | Survives refresh/restart; events reconnectable; project scope is explicit |
| Review inbox | `/w/local/reviews?status=...` | Local/imported review tasks; no hidden global “latest” |
| Policy | `/w/local/policies/{policyId}/versions/{version}` | Immutable version and applicability |
| Help/diagnostic | `/w/local/help/{topic}` and `/w/local/diagnostics/{diagnosticId}` | Redacted export; no secret-bearing URL |

Browser back returns to prior list/filter/tab state. Archived and superseded URLs remain resolvable in read-only form. Deleted-local-data URLs show a tombstone only if retention policy permits; otherwise a generic unavailable response avoids disclosure.

### 4.3 Search and discovery

Initial search is exact/local over receipt ID, claim text, artifact filename/hash, policy ID, check ID and reviewer-supplied tag. Semantic search, cross-tenant search and remote indexing are out of scope. Results must be permission-filtered before ranking in any future institutional mode. The UI states index freshness and offers exact identifier lookup. Search history is local, off by default and independently clearable.

## 5. Interface contracts

### IF-WEB-001 — Receipt list

| Contract field | Specification |
|---|---|
| Purpose / roles / JTBD | Author or reviewer locates a receipt and sees its current standing; JTBD-01/02/03 |
| Entry/precondition | Local workspace initialized; no authentication in loopback single-user mode |
| Primary action | Open a project receipt; drafts use the separate draft list |
| Hierarchy | Scope-aware title → filters → receipt rows → standing/last verified/scientific profile/verification policy → pagination |
| Data/permission | Receipt summaries scoped by project; local owner. External packages are opened transiently through their static viewer or safe CLI inspect/verify and are never silently registered/imported |
| States | Loading skeleton; empty with “Create receipt or open an external package without adding it”; partial index; stale; read-only; preservation-archived; unavailable dependency; corruption quarantine |
| Recovery | Rebuild local index without mutating receipts; open package viewer/CLI diagnostic without registration; retry |
| Audit/analytics | Local project-open audit only where required; transient external-package viewing is not claimed as an imported project event; analytics off by default |
| Accessibility | Real table/list toggle; caption; sortable header state; keyboard row actions; status text beyond color |
| Responsive/performance | Cards on narrow screen; no horizontal critical content; first 50 rows under 200 ms after local data ready |
| Security/privacy | Claim snippet can be hidden; no hover-only sensitive preview; imported active content never executes |
| Acceptance | Filter survives URL/refresh; superseded item points to current; corrupt index cannot change receipt bytes |

### IF-WEB-002 — Draft and disclosure preflight

| Contract field | Specification |
|---|---|
| Purpose / roles / JTBD | Author defines claim/scope/materials/policy and previews exactly what leaves the machine; JTBD-01 |
| Steps | Claim → materials → method/policy → disclosure → preflight; steps are URL-addressable and resumable |
| Primary action | Run preflight; “Compile receipt” appears only after explicit inclusion confirmation |
| Input rules | Units, comparator, thresholds, evidence mode, artifact role, license and sensitivity are explicit; defaults are visible and sourced |
| Validation | Immediate format checks plus authoritative server/core validation; summary links to fields; unknown fields preserved only in compatibility mode |
| Draft/recovery | Local autosave with version; leaving warns only for unsaved sensitive fields; crash recovery shows timestamp/diff |
| Files | Keyboard file picker; checksum/dedupe; archive bomb/path/symlink quarantine; partial file failure; no default upload |
| Privacy | Each component labeled local-only, embedded, referenced or externally resolved; network actions require named-host preview |
| Accessibility | `fieldset`/`legend`, error summary, focus to first invalid field, 400% reflow, no drag-only operation |
| Acceptance | Compile cannot start with ambiguous evidence mode, missing required policy version or undisclosed remote fetch |

### IF-WEB-003 — Durable compile/verify task

| Contract field | Specification |
|---|---|
| Purpose | Show real task state, not timer theatre |
| Primary action | Cancel while cancellable; resume/retry only when safe |
| Hierarchy | State and elapsed time → actual stage/check → completed/partial outputs → resource/network disclosure → ordered `task.events` presentation and separate diagnostic bundle |
| Events | Ordered SSE with cursor; polling fallback; duplicate events idempotently ignored; refresh resumes from server state |
| States | `QUEUED`, `PREPARING`, `RUNNING`, `PAUSED`, `CANCEL_REQUESTED`, `CANCELED`, `SUCCEEDED`, `SUCCEEDED_WITH_GAPS`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `EXPIRED` |
| Recovery | Explain checkpoint; retry creates attempt under same logical task; never duplicate sealed receipt |
| Accessibility | `aria-live=polite` for stage, assertive only for terminal failure; native progress when determinate; textual event log |
| Performance | UI input response <200 ms; event batch <=100; event-list virtualization after 1,000 rows; no shadow `task.logs` resource/raw-worker-log authority |
| Acceptance | Close/reopen browser shows same task; Ctrl+C via CLI and cancel via Web converge on one state; simulated delays forbidden |

### IF-WEB-004 — Receipt detail and verification summary

| Contract field | Specification |
|---|---|
| Purpose / roles | Reviewer understands bounded result and chooses a safe next action; JTBD-02 |
| Primary action | Verify locally/reverify; secondary: request evidence, compare version, export, challenge |
| Fixed header | Receipt ID/version/currentness; claim/scope; evidence mode; scientific profile, verification policy and verifier versions; last checked; standing; preservation status |
| Tabs | Summary, Materials, Checks, Provenance, Integrity, Review, Timeline; each deep-linkable |
| Summary | Counts and named gaps by dimension; no aggregate trust percentage or universal traffic light |
| Assurance vector | Six separate rows: provenance, integrity, identity/authorization, process conformance, execution reproduction and scientific verdict. Each uses its typed enum, policy/profile/version, evidence link and limitation; review summary, standing and preservation are separate |
| Uncertainty | Applicability, missingness, conflicting evidence, calibration state, CI/units where valid, refusal reason and reviewer requirement |
| Task/result projection | No-result-yet is presentation only; an active verification links the canonical `TaskAttempt` state; a terminal immutable result exposes six typed dimensions plus compatibility/mismatch/quarantine reasons, never a `verified-with-gaps` receipt state |
| Review projection | `reviewSummary=UNREVIEWED/REVIEWED_NO_OPEN_CHALLENGE/CONTESTED/RESOLVED_WITH_HISTORY`; correction history remains a lineage/event view |
| Receipt standing | `ACTIVE`, `SUPERSEDED` or `WITHDRAWN` only |
| Preservation | `AVAILABLE`, `ARCHIVED` or `PAYLOAD_REMOVED` only; retrieval failure is a separate observation |
| Security | Render untrusted Markdown/HTML/PDF in isolated, non-scripted context; safe filenames/download headers; no external resource loading by default |
| Accessibility | Heading hierarchy; definition lists; check results as text/icons/patterns; graph has table/tree equivalent; copyable anchors |
| Acceptance | In critical comprehension test, ≥90% identify what was and was not proven; zero participants infer misconduct or truth from check-pass wording |

### IF-WEB-005 — Materials and provenance

| Contract field | Specification |
|---|---|
| Purpose | Trace each claim/check input to versioned material and transformation |
| Primary action | Inspect or compare a selected material version |
| Hierarchy | Original source → captured version/hash → transformations → derived outputs → consumers/checks |
| Views | Accessible table/tree primary; graph optional; diff for metadata/text; binary download only after warning |
| States | Available, referenced-not-embedded, access-required, hash-mismatch, omitted, redacted, expired, license-restricted, superseded |
| Acceptance | Every check input resolves to a material version or explicit missing reason; graph filters reflected in text/table |

### IF-WEB-006 — Review, evidence request and challenge

| Contract field | Specification |
|---|---|
| Purpose | Record human opinion without changing machine evidence; support correction and appeal |
| Primary action | Submit evidence request or review statement; high-risk decision remains outside initial product |
| Required fields | Scope/check, statement type, rationale, evidence references, conflict declaration, reviewer identity class and visibility |
| Concurrency | ETag/version required; stale form produces diff/merge choice, never last-write-wins |
| Case states | `DRAFT`, `SUBMITTED`, `RESPONSE_NEEDED`, `RESPONDED`, `RESOLVED`, `WITHDRAWN` only |
| Resolution outcome | Exactly one of `UPHELD`, `AMENDED`, `REJECTED_WITH_REASON`, `UNRESOLVED` only when case state is `RESOLVED` |
| Assignment/work metadata | Assignee, in-review/escalation and conflict are events/metadata/errors; none is a case state or outcome |
| Permissions | Local mode records asserted identity, not verified identity; institutional mode requires scoped reviewer and separation of duties |
| Audit | Append event; amendments supersede and link; original remains visible to authorized users |
| Accessibility/content | Plain-language limitation; labels say “Record review,” not “Approve truth”; confirmation names effect |
| Acceptance | Reviewer opinion cannot mutate check output; affected author can view basis and submit response/export |

### IF-WEB-007 — Compare, correction and timeline

| Contract field | Specification |
|---|---|
| Purpose | Explain why current receipt differs and preserve historical context |
| Primary action | Create/open superseding receipt or acknowledge correction |
| Diff dimensions | Claim/scope, materials, policies, methods, checks/results, trust anchors, review statements and lifecycle |
| Comparison projection | No difference, partial comparison and incompatible schema are typed comparison results, not receipt states |
| Lifecycle projections | Correction is lineage/event history; standing is only `ACTIVE/SUPERSEDED/WITHDRAWN`; contention is only `reviewSummary`; preservation is separate |
| Accessibility | Semantic change table with added/removed/changed labels; no color-only diff; downloadable machine diff |
| Acceptance | Old URL clearly identifies current successor; correction never erases earlier receipt; incompatible comparison refuses false equivalence |

### IF-WEB-008 — Policies and compatibility

| Contract field | Specification |
|---|---|
| Purpose | Let experts inspect the exact rule set without editing it in a receipt |
| Hierarchy | ID/version/status/owner → applicability → required inputs → checks → refusal rules → validation evidence → change history |
| Actions | Select for new draft; export; compare versions. Editing/publishing is not initial-scope UI |
| States | Current, deprecated, withdrawn, unsupported, locally added/untrusted, signature/anchor mismatch |
| Acceptance | Receipt always links immutable policy version; deprecated version does not silently upgrade |

## 6. Cross-interface state contract

| State family | User sees | Allowed action | System record | Recovery/notification |
|---|---|---|---|---|
| Not started/draft | Missing fields and why needed | Edit, discard, import | Draft versions only | Autosave/local recovery |
| Loading/refreshing | Existing data remains with stale marker when safe | Navigate, cancel fetch | Request diagnostic | Retry without duplicate mutation |
| Empty | Cause-specific empty content | Create/import/change filter | None | Never fabricate demo data |
| Partial data/success | Completed and unavailable components separately | Continue safe subset, export partial, retry | Component statuses | Export/distribution cannot claim the receipt is complete |
| Recoverable error | Cause, impact, completed work, retry safety, diagnostic ID | Retry/resume/change input | Failed attempt | Backoff and dependency status |
| Terminal error | Preserved artifacts and non-retry reason | Export diagnostic/start new task | Terminal attempt | Support path after owner exists |
| Offline/dependency down | Cached vs unresolved explicitly | Use cached/import/stop | Resolver skipped/failed | No hidden online fallback |
| No permission/session change | Object may be hidden; unsaved safe data preserved | Reauthenticate/export draft if allowed | Denial/session event | Do not reveal object existence |
| Conflict/duplicate | Competing version/idempotency result | Compare/merge/open existing | Conflict event | Never silently overwrite |
| Cancel/pause/resume/retry | Safe point, current attempt and partial outputs | Resume only `PAUSED`; request cancel while eligible; retry only from doc 19's terminal eligibility and creates a new attempt | Full immutable attempt transition/history | Cleanup may remove uncommitted temp output only; no attempt discard/reopen |
| Stale/old compatibility | Producer/verifier/policy versions | Verify in compatibility mode or upgrade copy | Compatibility decision | Original bytes preserved |
| Contested/corrected/withdrawn | Banner, reason, current successor | Inspect history/respond/export | Append lifecycle event | No green success styling |
| Archived/payload removed/legal hold | Read-only/tombstone or non-disclosing unavailable | Export what remains or contact the named custody/privacy owner; no O/L v0 restore/remove button | Governed preservation/rights event from external authority | Hold/denial shows owner and appeal/action without claiming deletion |
| Maintenance/incident | Affected capabilities and safe mode | Read-only/export/stop | Incident reference | Status not implied from static page |

## 7. Evidence and content language

### 7.1 Semantic types

| Type | Label and non-color cue | Permitted assertion | Forbidden shortcut |
|---|---|---|---|
| Source assertion | “Source says” + quotation/document icon | What a source declares | “Fact” |
| Observed material | “Captured input” + hash/version | Bytes/metadata observed by this run | “Authentic” |
| Derived measurement | “Computed value” + method symbol | Result of named code/method on named input | “Correct” without validation |
| Automated signal | “Signal” + detector icon | Condition was detected | “Evidence of misconduct” |
| Policy check | “Check passed/failed/skipped/unknown” + rule ID | Conformance to versioned rule | “Confirmed/refuted science” |
| Human review | “Reviewer statement” + identity/COI | Attributed opinion with basis | System fact |
| Accountable decision | “External decision” + authority | Decision recorded from owner | Automated verdict |
| Correction/appeal | “Contested/corrected/superseded” + timeline | Lifecycle fact | Erasing old result |

Machine and cross-interface vocabulary remains the canonical `scientificVerdict`: `CONFIRMED`, `REFUTED`, `INCONCLUSIVE`, `DEGRADED_SCOPE`, `UNTESTED`. Human UI pairs each code one-to-one with bounded explanatory text such as “criteria satisfied under this scientific profile” or “not evaluated”; it does not serialize a second five-value enum. Legacy values appear only in compatibility/raw trace views with a warning.

### 7.2 Error template

Every error renders: stable code and plain title; what happened; object/task/check affected; completed/preserved work; retryability; safest next action; diagnostic ID; and redacted details. Example wording specification: “Verification stopped: policy version is unsupported. Receipt bytes were not changed. Install an approved verifier or export the package for another reviewer. Diagnostic: …” Buttons say the action (“Open compatibility report”, “Retry from checkpoint”), never only “OK”.

### 7.3 High-risk confirmations

Sharing or external public posting, network resolving, superseding, withdrawing, deleting, force-overwriting and running code require an impact preview. Public posting is an external distribution action, not a hidden FAR operation. The confirm action names the effect. Typed phrase confirmation is reserved for irreversible or high-blast-radius institutional actions, not routine friction. Dry-run and export precede bulk actions.

## 8. Visual and component system contract

Use versioned semantic tokens, not product-status colors embedded in pages:

- `surface`, `text`, `border`, `focus`, `link` plus `status-info`, `status-attention`, `status-danger`, `status-neutral`, each with text/icon/pattern redundancy;
- typography optimized for long evidence reading: base 16 px equivalent, line height ≥1.5, content measure 45–80 characters; monospace only for identifiers/code;
- spacing based on one documented scale; touch target at least 24×24 CSS px and preferably 44×44 for primary actions;
- motion respects `prefers-reduced-motion`; no status meaning depends on animation;
- high contrast and dark themes use the same semantic contract; charts pass contrast and provide nonvisual equivalents.

Required governed components: `EvidenceTypeLabel`, `CheckResult`, `TrustPolicyTimePanel`, `ScopeAndVersionHeader`, `GapList`, `LifecycleBanner`, `TaskProgress`, `DiagnosticError`, `ProvenanceTable`, `AccessibleRelationTree`, `VersionDiff`, `DisclosurePreview`, `PolicyReference`, `ReviewStatement` and `AuditTimeline`. `TrustPolicyTimePanel` presents `trustPolicyId` and `VerificationTimeContext`; it is not a profile/schema. Domain decisions remain outside components.

HTML uses native landmarks, headings, buttons, links, forms, details, progress and tables. ARIA supplements rather than repairs nonsemantic divs. Without CSS, document order remains meaningful; without JavaScript, exported receipt HTML remains readable and exposes verification commands/limits, although interactive local-app actions may require JavaScript.

## 9. Accessibility, responsive and internationalization gates

Target: WCAG 2.2 AA for all core tasks, plus tested high-contrast/reduced-motion behavior. Release evidence must combine static scanning, component tests, keyboard-only completion, NVDA+Firefox and VoiceOver+Safari tasks, 200% and 400% zoom/reflow, contrast checks, touch checks and participants using assistive technology. Automated scan success alone is insufficient.

Critical accessibility acceptance:

- all receipt creation, verification, evidence request, challenge and export tasks complete without a pointer;
- focus follows route, error, dialog and task-state changes predictably;
- dynamic task updates are announced without flooding;
- every graph/chart has a fully operable textual/table equivalent and identical filter scope;
- no outcome, diff or current/old state depends only on hue/position;
- errors associate to fields and a summary; timeouts can be extended where applicable;
- 400% zoom at 1280 CSS px produces one-dimensional flow without loss except intentionally scrollable data tables with named regions.

Responsive priority: author/reviewer tasks support desktop and tablet; narrow screens support reading, status, evidence requests and safe cancellation. Dense policy editing, large graph exploration and multi-version diff may switch to a simplified table and recommend a wider screen without blocking export. Print/PDF output includes scope, versions, trust limits and page-safe tables.

Initial locales are complete English and Simplified Chinese, not mixed strings. Locale affects presentation only; receipt canonical bytes and API enums remain stable. Show local time plus inspectable ISO 8601/UTC; localize numbers/units without changing raw values. Legal/policy translations carry version and approver. Bidirectional text and long-string layout are compatibility gates before claiming the locale.

PWA/service-worker caching is rejected for the first release because the primary value is already local/offline and sensitive receipt caching creates stale-version and deletion risk. Offline capability comes from the local core/CLI and static receipt viewer.

## 10. Frontend architecture constraints

- Keep a client-rendered local application; SSR/SEO is not justified for sensitive workspace pages. Public documentation can be static and separate.
- Pages depend on typed domain/application clients; UI never decides policy results or reimplements canonical hashes except an explicitly independent verifier module with cross-implementation vectors.
- Generate API types/validators from the authoritative contract; reject unvalidated critical responses. No double-cast escape hatch for receipt results.
- Classify state: server/task state in query/event layer; URL filters/tabs in URL; draft state in schema-backed form store; ephemeral UI locally; session/permission centrally; preferences separately.
- High-risk mutations use no optimistic final state. Cache invalidation keys are receipt/project scoped, never “latest globally.”
- Use SSE for ordered task progress, polling fallback, `AbortSignal` for local request cancellation and durable server cancellation for work. Timers never impersonate backend stages.
- Isolate untrusted content, disable external loads by default, apply a strict CSP, use safe downloads, redact browser diagnostics and avoid persistent browser tokens; future hosted mode uses secure HttpOnly session/BFF or equivalently reviewed pattern.
- Lazy-load relationship graphs and document renderers. Move proof/hash work that blocks >50 ms to a worker. Virtualize long logs/tables.

Target budgets, measured on a documented mid-tier device profile: app shell critical JavaScript ≤250 KiB gzip; route-specific visualization separate; LCP ≤2.5 s on slow-4G/4× CPU for local metadata screens; interaction response ≤200 ms; visible task event latency p95 ≤1 s after server emission; no single main-thread task >100 ms in core receipt reading; memory remains <200 MiB for a 10,000-item metadata view. Budgets can change only with user-value evidence and recorded decision.

## 11. Experience verification plan

| Test | Sample / condition | Pass threshold | Failure action |
|---|---|---|---|
| First receipt | 5 researchers with their own non-sensitive artifact | 4/5 complete; median ≤30 min after install; zero silent disclosure | Simplify or stop wedge |
| Independent verification | 3 reviewers not involved in receipt creation | 2/3 complete without author state; all identify limitations | Remove independent claim or redesign package |
| Critical comprehension | At least 10 across author/reviewer/affected roles | ≥90% per required trust question; zero truth/misconduct inference | Block release and rewrite semantics |
| Error recovery | Dependency outage, corrupt component, unsupported policy, interrupted task | ≥80% select safe action; no duplicate receipt | Redesign recovery/task contract |
| Appeal/correction | 5 contested scenarios including power imbalance | All locate basis and submit response; history preserved | Block high-stakes pilot |
| Accessibility | Keyboard and two screen-reader/browser pairs, plus disabled-user tasks | 100% critical task completion; no critical/serious issue | Block release |
| Responsive/i18n | 320–1280 CSS px; English/Chinese; 200–400% zoom | No loss of critical content/action; no mixed locale | Block locale/device claim |
| Trust calibration | Mixed valid, partial and corrupted receipts | Users discriminate states; confidence tracks evidence strength | Remove simplifying summary |

Instrumentation is local and opt-in during research: task completion, errors/recovery, time, mistaken interpretation and disclosure prevention. Never capture raw claims/materials in analytics.

## 12. Non-goals and rollback

No mobile app, PWA, generic dashboard, chat-first interface, autonomous decision, social leaderboard, real-time collaborative editor, visual workflow builder or plugin marketplace is authorized by this spec. If Web cannot meet the same semantic and trust gates as CLI, the safe rollback is a static accessible receipt viewer plus CLI; the domain core and packages remain usable.
