---
status: reviewed
owner_role: service-and-domain-operations-lead
last_verified: 2026-08-05
scope: target normal, failure, collaboration, challenge, correction, disclosure, longevity, distribution, exit, and deferred batch workflows
authoritative_for:
  - end-to-end workflow contracts
  - workflow acceptance scenarios
evidence_level: D
related_decisions: [DEC-003, DEC-005, DEC-006, DEC-009, DEC-011, DEC-012, DEC-013, DEC-016]
related_requirements: [REQ-WF-001, REQ-WF-002, REQ-WF-003, REQ-WF-004, REQ-WF-005, REQ-WF-006, REQ-TRUST-004, REQ-TRUST-005, REQ-SCI-003, REQ-UX-003, REQ-OPS-003]
supersedes: []
superseded_by: null
---

# 08 — End-to-end workflows

Every workflow below is a target contract, not current behavior. Interface details live in `04_EXPERIENCE_SPEC.md` and `05_CLI_API_CONTRACT.md`; common states/failures live in `STATE_AND_FAILURE_MATRIX.md`.

## WF-01 — Author creates and hands off a receipt

**Given:** ROLE-01 under `deploymentProfile=L_LOCAL_AUTHOR`, an approved two-group `scientificProfile`, non-sensitive materials, no existing sealed receipt for this draft version.

1. `init` creates a local draft and states that nothing is uploaded or verified.
2. Import quarantines paths/archive members, inventories bytes, classifies source/disclosure and refuses unsafe shapes without execution.
3. Preflight shows required/missing/conflicting fields, inferred values, exact disclosure, selected `verificationPolicy`, `scientificProfile`, `disclosureProfile`, their versions and what cannot be proven.
4. Author explicitly accepts disclosure and starts an idempotent durable compile task.
5. System snapshots immutable inputs, records deviations, runs approved computation in an isolated worker, records task/attempt events and computes each assurance dimension.
6. Failure, cancellation or timeout produces no receipt and supplies a safe resume/retry path with a new attempt.
7. If seal requirements pass, author previews canonical summary and seals atomically; external signature/anchor is applied only when the selected `verificationPolicy` references an approved `trustPolicyId`, using an explicit `VerificationTimeContext`.
8. Export verifies its temporary package before atomic finalize and produces machine receipt plus accessible static viewer.

**Forbidden:** silent upload, overwrite, inferred field represented as author fact, partial output reported as sealed/distributed, model text deciding verdict, or a missing manifest accepted when the selected `verificationPolicy` requires it.

**Acceptance:** AC-WF-01A happy path; 01B missing required field/refusal; 01C malicious archive; 01D cancel/timeout/crash/resume; 01E disclosure change invalidates compilation; 01F seal/export disk failure; 01G duplicate request/idempotency.

## WF-02 — Reviewer independently inspects, verifies and replays

**Given:** ROLE-02 under `deploymentProfile=O_OFFLINE_VERIFIER`, only package bytes, explicit trust store/policy cache and a clean supported machine.

1. Inspect parses metadata and static content without executing package code, following unsafe links or requiring network.
2. Compatibility reports schema/profile/verifier support and refuses unknown critical fields/major versions.
3. Verification returns six independent assurance dimensions, component/edge results, identity policy, limitations, current receipt standing and preservation status.
4. Reviewer may separately authorize replay in an isolated environment; `executionReproduction` is `MATCH`, `BOUNDED_MATCH`, `DIVERGED`, `NOT_COMPARABLE`, `NOT_RUN` or `UNAVAILABLE`, backed by one N0–N4 divergence object and a separate inferential-decision result.
5. Reviewer records an attributed review statement separately from machine output and chooses accept bounded evidence, request evidence, challenge or stop.

**Forbidden:** “verified” composite pass, implicit network/download, author DB/service dependency, code execution during inspect, signature-to-science promotion, reproduction-to-truth promotion.

**Acceptance:** AC-WF-02A offline clean-room; 02B every seeded mutation/substitution/removal; 02C consistent rehash/downgrade; 02D revoked/unauthorized signer; 02E unavailable dependency; 02F bounded numeric divergence; 02G withdrawn/superseded receipt.

## WF-03 — Evidence request, challenge and contested result

**Given:** a sealed/distributed receipt and ROLE-02 or ROLE-04 with permitted visibility.

1. Actor selects a specific claim, material, evidence edge, check, policy or review statement; writes requested remedy and visibility.
2. Authorization and conflict/identity status are shown before submission; sensitive content is minimized/redacted.
3. A durable case opens with owner, deadline, immutable statement, evidence locators and notifications; machine result remains unchanged.
4. Author responds with clarification, new material or refusal. New bytes never enter the old receipt.
5. Reviewer resolves, leaves contested, escalates to qualified human review, or recommends correction/withdrawal. Reasons and conflicts are recorded.
6. Expired/unavailable owner invokes documented escalation, never automatic guilt or adverse outcome.

**Acceptance:** AC-WF-03A request/response/resolve; 03B unauthorized access; 03C sensitive evidence restriction; 03D reviewer conflict; 03E missed deadline/escalation; 03F irreducible scientific disagreement remains contested; 03G affected party export.

## WF-04 — Correction and supersession

**Given:** a defect/new evidence/policy change affects a receipt.

1. Impact query enumerates affected checks, receipts, reviews and known consumers by exact policy/detector/data/code range.
2. Authorized actor creates a correction proposal with reason, disclosure changes and prior receipt link.
3. Compile and review occur as a new receipt; high-risk policy/scientific changes require qualified independent approval.
4. Atomic seal and successor linkage create the new receipt and append-only lifecycle events; distribution is a separate event. Prior bytes/root/signatures remain verifiable.
5. Default views show current standing and the full timeline; CLI/API/static export expose the same relationship.
6. Known consumers receive a bounded notification; unavailable recipients remain recorded, not marked notified.

**Acceptance:** AC-WF-04A single successor; 04B concurrent successor conflict; 04C policy-wide correction; 04D failed new compile leaves prior current; 04E privacy redaction/tombstone; 04F downstream cache invalidation; 04G rollback freezes new publication but never restores false standing silently.

## WF-05 — Withdrawal and appeal

**Given:** an authorized party seeks to discourage reliance or contests an adverse human decision.

1. Withdrawal records authority, reason category, public/private text, effective time and affected scope; it does not delete cryptographic history.
2. Verification returns integrity of historical bytes, separate `WITHDRAWN` current standing and the actual preservation status; removed payload becomes a typed gap, never a fabricated integrity pass.
3. An affected party may appeal the human decision or evidence access; a different qualified reviewer handles conflict-sensitive appeals.
4. Appeal resolves with attributed outcome `UPHELD`, `AMENDED`, `REJECTED_WITH_REASON` or `UNRESOLVED`; it never edits old evidence or machine results.
5. Emergency freeze can temporarily block new reliance/publication, is time-bound/two-person/audited, and receives retrospective review.

**Acceptance:** AC-WF-05A authorized withdrawal; 05B unauthorized/duplicate request; 05C withdrawn package offline; 05D appeal/conflict reassignment; 05E emergency freeze expiry; 05F appeal changes human standing only; 05G notification failure.

## WF-06 — Export, retention, deletion, legal hold and project exit

**Given:** ROLE-01/04/07/08 exercises portability or rights under a declared authority.

1. System previews categories, receipts, audits, backups, anchors, keys, third parties, retention and consequences.
2. Export builds a content manifest, verifies it, writes atomically and includes compatibility/verification instructions.
3. Deletion authenticates/authorizes requester, resolves legal hold and shared evidence, then erases or tombstones only approved scope.
4. Result states what was deleted, retained, detached, in backup, externally anchored or impossible to recall and when backup expiry occurs.
5. Restore uses a copy, verifies manifests/lineage/access, and never promotes a withdrawn/superseded receipt.
6. End-of-life publishes final versions/trust roots, migration/export window, archive verification and support closure.

**Acceptance:** AC-WF-06A full export/offline verify; 06B interrupted export; 06C scoped deletion; 06D legal hold conflict; 06E backup expiry/restore; 06F lost key/trust root; 06G service end without vendor dependency.

## WF-07 — Batch verification and policy impact

**Status:** `DEFERRED_WITH_TRIGGER`. The flow below is retained as a future design hypothesis, not a v0 required surface. It re-enters only after pilot demand and an approved input-manifest/order/concurrency/checkpoint/per-item/aggregate-exit contract (`IRG-024`).

**Given:** ROLE-05/06/08 has a local set of receipts and a pinned verification policy plus trust-time context.

1. Dry-run inventories count, versions, disclosure and estimated resource cost; no receipt is executed or changed.
2. Actor approves explicit input/output paths, concurrency and isolation budget.
3. Each item gets independent task/attempt/result; one failure does not relabel another or abort without report.
4. Machine output streams versioned JSONL in stable input order or includes explicit sequence/correlation keys.
5. Summary reports all success, partial, incompatible, failed, cancelled and not-run items; exit code reflects worst declared class without losing per-item state.
6. A policy/detector defect query identifies affected receipts but correction remains a governed workflow.

**Acceptance:** AC-WF-07A mixed batch; 07B duplicate receipts; 07C crash/resume; 07D bounded concurrency/backpressure; 07E disk full/broken pipe; 07F policy unavailable; 07G no cross-item/run leakage.

## WF-08 — Optional agent-assisted evidence assembly

**Status:** deferred; allowed only after HYP-007 passes.

The agent may search approved local scope, propose mappings, surface conflicts and draft a disclosure checklist. Each tool call uses allow/ask/deny policy and immutable event logging; untrusted/memory/compacted sources retain taint. The author must accept every candidate binding. The agent cannot execute unapproved code, network, sign, seal, publish, delete, notify, change policy, resolve a challenge or select scientific verdict. Cancellation/budget/loop limits terminate as agent failure, not scientific evidence.

**Acceptance:** AC-WF-08A taint survives derivation/compaction; 08B denied path/network; 08C malicious material/tool output; 08D budget/loop stop; 08E stale context conflict; 08F author rejection leaves receipt unchanged; 08G agent-off path remains complete.

## WF-09 — Derived selective disclosure and protected opening

**Given:** ROLE-01 controls a sealed source receipt; disclosure policy classifies at least one sensitive/low-entropy member; ROLE-02 needs a bounded subset.

1. Author selects an exact disclosure policy and sees paths, metadata, values/digests, linkability, external-log destination and omitted categories before export.
2. Export creates a new disclosure manifest/root linked to `sourceReceiptRoot`; redaction/transformation is recorded and cannot masquerade as source bytes.
3. Verifier checks the disclosure root and each inclusion/derivation proof, then reports only `DISCLOSED_SUBSET` and explicit omissions/unknown dimensions.
4. Public high-entropy bytes may expose domain-separated content digests. Low-entropy/sensitive items are restricted, withheld with no public digest, or use an approved commitment/keyed-token class.
5. An authorized opening is a separate scoped event; nonce/key/value is never written to a public log or generic telemetry.
6. Policy error or leakage freezes further disclosure, enumerates recipients/log exposure and triggers correction/notification; the source receipt remains immutable.

**Acceptance:** AC-WF-09A valid subset; 09B omitted/changed member; 09C wrong source root; 09D dictionary/correlation attack; 09E unauthorized/expired opening; 09F public-log metadata leak; 09G disclosure successor/withdrawal.

## WF-10 — Long-term offline verification and renewal

**Given:** a receipt and archival package whose certificate, algorithm, trust root, external references or verifier stack may age.

1. Archive inventory fixes canonical bytes, schemas/contexts/profiles/TCK, trust roots, time/revocation/transparency material, reference snapshots, verifier recipe and custody/fixity policy.
2. Offline verification reports `VALID_AT_SEALING_POLICY`, `VALID_AT_RENEWAL_POLICY`, `VALID_UNDER_CURRENT_POLICY`, `INVALID` or `INDETERMINATE` separately.
3. Before an approved suite retires, authorized two-person renewal binds the old root/evidence to the new suite in an append-only statement; old bytes/root never rewrite.
4. Missing or changed external material yields its exact availability state and affected assurance dimension; mutable latest never substitutes.
5. Air-gapped recovery from a new empty environment reconstructs semantics and trust as far as archived evidence permits, listing each missing dependency.
6. Compromise before trustworthy renewal, prohibited retention or unrecoverable material remains invalid/indeterminate; renewal cannot invent a safe past.

**Acceptance:** AC-WF-10A expired certificate with trusted sealing time; 10B pre/post-signing revocation; 10C root/suite migration and downgrade; 10D missing schema/TCK; 10E external drift/403/404; 10F lawful payload deletion; 10G offline custody/fixity recovery.

## WF-11 — Distribution, first success, support and uninstall

**Given:** an immutable candidate for one declared platform tuple and a first-time ROLE-02 reviewer.

1. Reviewer obtains a named artifact, verifies digest/signature/provenance and installs without mutable fallback or undeclared prerequisite.
2. `far doctor --deployment-profile O_OFFLINE_VERIFIER --offline` reports candidate/platform/native ABI/storage/trust/time compatibility without installing or leaking data.
3. Reviewer inspects and verifies the bundled synthetic V2 sample, reads six dimensions/limitations, and learns that inspect never verifies and replay is not run here because it needs separate verified-input plus isolated-execution approval; the sample proves protocol behavior only.
4. Upgrade from last-supported preserves and verifies old receipts; rollback/read compatibility is explicit at migration boundaries.
5. Uninstall preserves receipts/trust/config/audit by default. Explicit purge previews exact paths, obeys holds/retention, resists path/symlink attacks and reports backup/external copies.
6. Product, method, security/privacy and appeal/correction issues route to distinct real descriptors; offline review request/response remains portable.

**Acceptance:** AC-WF-11A clean offline first success; 11B native ABI/missing dependency; 11C artifact/provenance mismatch; 11D upgrade/rollback interruption; 11E preserve/reinstall; 11F purge/hold/residual copy; 11G broken/private support-channel routing.

## Cross-workflow invariants

- Every visible state has an equivalent machine state/reason and a next/recovery action.
- Retry is never silent; attempts remain distinct and idempotency prevents duplicate sealing.
- Inspect is read-only. Verify is read-only except an explicitly approved local cache. Replay is a separately approved isolated action.
- Human review and machine assurance are visually, semantically and cryptographically distinct.
- Audit contains identity/authorization decision and metadata/digests, not unnecessary secrets or raw sensitive content.
- Offline, incompatible, partial, refused, `CANCELED`, deadline-exceeded, contested, superseded and withdrawn are normal designed outcomes/states; serialized vocabulary follows doc 19.
