---
status: reviewed
owner_role: platform-sre-release-lead
last_verified: 2026-08-05
scope: detailed deployment, release, SLO, failure, DR, observability, cost, supply-chain, and RACI specification
authoritative_for: [detailed platform and SRE contracts, cost and supply-chain registry policy]
evidence_level: mixed
related_decisions: [DEC-003, DEC-007, DEC-010]
related_requirements: [REQ-OPS-001, REQ-OPS-002, REQ-OPS-003, REQ-OPS-004, REQ-UX-003, REQ-TRUST-005]
supersedes: []
superseded_by: null
---

# FAR-Lab platform, reliability, cost and supply-chain specification

| Field | Value |
|---|---|
| Status | `TARGET_CONTRACT; CURRENT RELEASE/OPERATIONS UNVERIFIED` |
| Owner | Platform/SRE owner + release owner + dependency owners (unassigned) |
| Evidence level | A current repository/run evidence; D provisional objectives |
| Last verified | 2026-08-05 |
| Authority | Environments, delivery, SLO/DR/observability/cost/supply-chain and operating accountability |

## 1. Operational judgment

FAR-Lab has meaningful CI, backup and release source, but not one authoritative current delivery or operating proof. Static quality gates passed in this worktree; the full runtime is blocked by incompatible installed native/Python artifacts. There is no observed production service, metrics/alerting, restore exercise, staffed incident channel or verified current release package. Platform maturity is L2–L3; no “production ready,” “fully supported,” release-SLA or availability claim is permitted.

Immediate evidence:

- Current `.far-release/SHA256SUMS.txt` verification reports 7/11 mismatches: package, lockfile, both installers, SBOM, benchmark and FEC schema. It is stale, not a release candidate.
- `v1.0.0` exists locally, while prose/version authorities conflict and live GitHub Release/GHCR status remains unknown.
- The latest 30 inspected commits show signature status `N`; all are authored `Claude Code AI`. This is a provenance fact, not proof of poor review, but it cannot establish accountable human approval.
- The installer clones/updates a mutable default branch and falls back from frozen to mutable dependency install (`scripts/install.sh:57-73`).
- Release automation pushes a container before GitHub Release creation; despite comments, GHCR failure has no nonblocking handling (`.github/workflows/release.yml:110-178`).
- Docker Compose advertises an anonymous API at `0.0.0.0`, while the CLI refuses that exact unsafe configuration (`docker-compose.yml:19-27`; `src/cli/commands/api.ts:81-94`).
- `/health`, DB-backed `/ready`, graceful close and an integrity-checked SQLite backup exist. Native metrics, alerting and restore command/test evidence were not found. Exported OTel is a projection, not operational tracing (`src/far_proof/exporter.ts:15-24`).
- Root test and coverage globs are selected rather than complete; current CI/evidence-quality directories are outside the root test command, and current runtime tests were not run (`package.json:44-69`; `scripts/coverage_gate.mjs:21-80`).

## 2. Supported deployment matrix

| Profile | Release channel | Runtime responsibility | Availability model | Data/backup | Status |
|---|---|---|---|---|---|
| O offline verifier | Signed/version-bound standalone or source package | User device, read-only | No service availability promise; deterministic release qualification | User-supplied packages; no hidden state | First target |
| L local authoring | Version-bound CLI + optional loopback Web/API | User device and filesystem | Operation-level success/performance on supported matrix, not 24×7 SLO | Local DB/CAS; user-controlled verified backup/export | First target |
| I institution private | Single-node/VM initially; worker isolation | Institution + documented support boundary | Measured service SLO, on-call and DR required | Institution storage/identity/keys/backup | Blocked |
| H hosted multi-tenant | No channel | FAR-Lab operator | Full regional/tenant SLO and compliance | Provider-controlled processing | Not approved |
| Air-gapped O/L/I | Offline media and trust/withdrawal update bundle | User/institution | Update staleness made visible | Offline backup/export and clock limits | Conditional after update/revocation tests |

Operating-system support is evidence-based: a platform enters the matrix only after the doc 19 sequence—clean install, doctor, offline sample inspect/verify/tamper, compile only under `L_LOCAL_AUTHOR` (signed preservation-fixture import under read-only `O_OFFLINE_VERIFIER`), cancellation/recovery where applicable, last-supported upgrade, old-receipt verification, rollback/read compatibility, uninstall-preserve, reinstall and explicit purge—on one named OS/architecture/shell/filesystem/runtime/native-ABI/isolation tuple. “Docker fallback” is not platform validation.

## 3. Environments and configuration

| Environment | Data | Network/secrets | Purpose and restrictions |
|---|---|---|---|
| Development | Synthetic or approved local samples | Developer-scoped; no production keys | Iteration; dirty tree allowed but no release evidence |
| Test | Deterministic synthetic/golden/adversarial data | Network denied unless tagged integration; fake credentials | Automated correctness/failure tests |
| Evaluation | Locked licensed real evaluation set | Minimal approved external access; blinded labels | Scientific/product gate; no tuning on final set |
| Isolated security lab | Malicious corpus, canary secrets | Contained/no egress except capture | Parser/worker/agent/supply red-team |
| Staging/Profile I | Synthetic or irreversibly deidentified | Separate identity/keys | Deployment/migration/DR rehearsal; never default production clone |
| Production/Profile I/H | User data by approved scope | Managed secrets/egress | Only after security/privacy/SRE gates |

Configuration has schema, version, owner, source explanation, environment constraints and secret references. Precedence follows `05_CLI_API_CONTRACT.md`. Unknown fields fail. Production data never enters lower environments without documented purpose, minimization, approval, retention and deletion. Feature flags have owner/expiry/default/rollback; a flag cannot bypass schema, permission, privacy or trust policy. Startup validates incompatible/missing/drifted configuration and fails before writes.

## 4. Delivery and release pipeline

### 4.1 Candidate construction

One immutable candidate commit/tag is selected from a clean tree. Staged, unstaged, untracked and generated evidence are either intentionally included through reviewed source or excluded by policy. Generated release evidence records candidate digest and is stored outside self-referential source authority. No release is cut from the current mixed snapshot.

### 4.2 Required pipeline

```text
source/rule authority check
→ formatting + lint + static/type checks for every maintained language/surface
→ unit/property/negative/tamper tests
→ DB/schema/migration and API/CLI/receipt contract tests
→ integration + independent verifier + cross-language/platform vectors
→ Web accessibility/E2E/performance and CLI clean-install flows
→ scientific locked evaluation and claim-ledger gate
→ secret/SAST/dependency/license/malware/image/IaC scans as applicable
→ deterministic build + SBOM + build provenance + artifact checksums/signatures
→ isolated clean install/smoke/upgrade/rollback/restore
→ human two-person approval for release/trust-policy changes
→ immutable channel publication and post-publication verification
```

Skipping is machine-visible with owner/reason/expiry and prevents any claim depending on that axis. Fixture, mocked provider and real external axes are named separately.

### 4.3 Source-control governance

- Protected default/release branches, required current check names, PR reviews and CODEOWNERS are externally verified—not inferred from files.
- Trust kernel, canonicalization, receipt/profile, migrations, release and security controls require two independent human approvals; AI-generated change is disclosed and reviewed by accountable owners.
- Commits/tags/releases use the selected signature/provenance policy; signature absence is visible. Emergency changes remain reviewed, scoped, time-bounded and followed by full gates/postmortem.
- Large changes are split by invariant/vertical behavior, not arbitrary line count. Backports and release branches have ownership and compatibility tests.

### 4.4 Artifact/release contract

- Version/tag/component manifests agree. `stable`, `beta` and `dev` channels are distinct; mutable `latest` is convenience only and never receipt authority.
- Installers download/checkout the exact signed release, verify checksum/signature before execution, use frozen dependencies and never fall back to a mutable branch/install.
- Container bases and Actions are digest/SHA pinned according to policy; image runs non-root with minimal runtime dependencies, explicit context allowlist, no secrets, health, persistence, resource and read-only-filesystem contracts.
- Produce complete multi-ecosystem SBOM, license report, vulnerability disposition, build provenance and release manifest; independently verify them after upload.
- Publish compatibility/migration/security/known-limit notes and rollback/withdrawal. Release keys and receipt-signing keys are separate.
- Publish a machine-readable support/distribution manifest binding artifact, platform tuple, install/data/config/cache/trust/temp paths, offline behavior, update/support window, documentation/example versions and real product/method/security/privacy/appeal channels.
- Uninstall preserves user receipts, trust store, configuration and audit by default. Explicit purge shows exact targets, obeys retention/hold rules and reports backup/external copies it cannot delete.

### 4.5 Release rollback

Code/config can roll back only where data/profile compatibility permits. Database/receipt/policy changes prefer roll-forward or restored copy; archived receipt bytes never rewrite. A bad release is withdrawn from channel, update metadata marks it, prior compatible artifact remains available and affected receipts/tasks are queryable. No automatic update without rollback/revocation path.

## 5. Quality-gate authority gaps to close

| Current finding | Risk | Target authority |
|---|---|---|
| Root `test` prepares/rebuilds dependencies and fixed globs omit current `tests/ci`/`tests/evidence_quality` | Current pass count incomplete/environment-mutating | Declarative test registry with owner/type/real-vs-fixture/required environment, and non-mutating check mode |
| Root lint scans only `src`; Python “typecheck” is compile-only; frontend separate | Green gate does not cover all maintained code | Per-ecosystem explicit type/lint/static gates aggregated by one manifest |
| `test_registry` and `repro_check` CI jobs rerun broad suites as fallback | Gate name overstates distinct evidence | Real registry/reproduction commands or accurately named jobs |
| Coverage covers selected core directories and no frontend gate | “Coverage” can imply whole product | Publish exact denominator/scope; behavioral risk gates dominate percentage |
| Historical pass logs/counts are not commit-bound and conflict | Test volume becomes narrative | Raw candidate-bound machine report with failed/skipped/environment axes |
| Untracked supply-chain workflow/controls | Local tree may be stronger than committed CI | Only candidate-committed, protected and observed remote controls count |
| Static security claims exceed scanner coverage | False assurance | Requirement-to-control-to-test trace with bounded claim language |

## 6. Reliability objectives

Objectives below are provisional design thresholds, not achieved evidence or public SLA. Gate owners must benchmark hardware/workload and revise through a decision record before launch.

### 6.1 Profile O/L release qualification SLIs

| User outcome / SLI | Provisional objective/window | Measurement point | Exclusions and error budget |
|---|---|---|---|
| Valid supported receipt verifies correctly | 100% across locked conformance and independent-verifier corpus per release | CLI terminal result + expected oracle | Unsupported profile is separate, not success; any false integrity pass blocks release |
| Seeded corruption/downgrade is rejected | 100% per release/adversarial suite | Verification result/exit 7 | No exclusion for known vector; zero error budget |
| Compile seals atomically or creates no receipt | 100% fault-injection states | DB/CAS/package reconciliation | User cancellation may yield no receipt; never a partial sealed receipt |
| Task crash/cancel recovery preserves truth | ≥99.9% over 1,000 deterministic fault-injection trials per supported platform | Task state/result/orphan scan | Harness failure reported separately |
| CLI receipt inspect/verify latency | p95 ≤5 s for a 100 MiB/1,000-component no-execution package on published reference hardware | End-to-end monotonic clock | Slow external anchor/resolver excluded and separately measured |
| Task event visibility | p95 ≤1 s from committed local event to connected UI; no lost terminal event in corpus | Event store to client | Client disconnected interval excluded; snapshot recovery required |
| Clean install to first safe verification | Median ≤10 min; completion lower-confidence target and sample size preregistered for the target-user study | Candidate-generated offline doc 19 path | Developer checkout/formative five-user result is not end-user qualification; any critical truth/certification inference blocks wording |
| Verified local restore | 100% quarterly/release rehearsal from documented backup set | Restored integrity + task/receipt checks | Missing user-selected external references disclosed |

### 6.2 Profile I provisional service SLOs

Only activate after staffing and load/DR evidence:

- monthly read API availability 99.9%; write/compile-control availability 99.5%; maintenance is announced and bounded, not silently excluded;
- synchronous metadata API p95 ≤500 ms and p99 ≤1 s at declared load; compute is asynchronous;
- admitted task queue-start p95 ≤2 minutes and terminal event delivery p99 ≤5 seconds after commit;
- zero tolerated cross-tenant/object unauthorized disclosure and zero silent receipt corruption;
- RPO ≤15 minutes for metadata/audit and ≤1 hour for content objects, RTO ≤4 hours for critical read/verify and ≤8 hours for authoring, subject to validated cost/needs;
- error-budget burn policies: 2%/1-hour fast burn pages, 5%/6-hour escalates, exhausted monthly budget freezes risky releases.

These values must be changed if user research/cost/architecture show different needs; no external promise precedes measurement and an on-call owner.

## 7. Failure-mode and degradation matrix

| Failure | Detection | User impact/data state | Recovery | Degrade/stop |
|---|---|---|---|---|
| SQLite corruption/lock/disk I/O | readiness, integrity check, write errors | Writes stop; receipts/CAS may remain intact | Read-only mode; restore copy; reconcile CAS | Offline verify existing packages |
| CAS missing/corrupt/orphan | scrub/reference/hash mismatch | Affected receipt unavailable/invalid; no silent fallback | Restore object/backup or mark gap; orphan GC after retention | Metadata/export-only where honest |
| Disk full | capacity/readiness/write preflight | No new compile/export; prior reads continue | Free owned cache/temp; expand; retry | Load shedding and read-only |
| Worker crash/hang/escape signal | heartbeat, timeout, OS audit/resource | Attempt fails; partial quarantined | Kill group, inspect, retry safe checkpoint | Disable execution; structural checks |
| Queue stuck/retry storm | age/depth/attempt/idempotency | Long wait/cost | Stop admission, cancel/backoff, repair poison task | Lower concurrency/read-only |
| Resolver/model/anchor outage | dependency probes and error rates | Only dependent dimension unknown | Cached explicit data or retry | Offline core; no semantic fallback |
| Auth/identity outage | issuer/token/session errors | Protected operations unavailable | Existing safe session policy or stop | Offline verifier/export; never anonymous fallback |
| Event/SSE interruption | disconnect/sequence gap | Progress stale; task continues | Snapshot + Last-Event-ID reconnect | Polling |
| Telemetry collector outage | exporter queue/drop | Operations visibility reduced | Bounded buffer/reconnect | Disable telemetry; audit/evidence unaffected |
| Audit/evidence persistence failure | append failure/invariant | Consequential action blocked | Repair/restore then explicit retry | Read-only; no seal/distribution/review decision |
| Bad policy/model/verifier | correction/drift/complaint/eval | Incorrect/unsafe result | Disable/withdraw, impact query, reverify/correct/notify | Prior validated policy/manual review |
| Schema/migration failure | preflight/checksum/validation | Startup/write blocked at known version | Restore copy/forward repair | Prior release read-only |
| Bad release/config | smoke/canary/SLO/security event | Platform/task errors | Halt rollout, withdraw, rollback/roll-forward | Pin last good artifact |
| Clock/DNS/TLS/key issue | skew/resolve/certificate/revocation | Anchor/provider/auth may fail | Correct trusted source/rotate/retry | Core local result with dimension unknown |

## 8. Backpressure and capacity

Profile L defaults to one atomic receipt-seal transaction and bounded compute concurrency based on measured host capability. Distribution is a later append-only event. Admission checks disk, component/archive size/count/depth, expected expansion, memory/CPU/PID/time, task count, external request budget and output/log caps before work. Cancellation and idempotency prevent retry amplification. Reviews/metadata reads remain responsive via bulkheads from execution.

Profile I requires per-tenant/identity/project quotas, fair scheduling, priority only by explicit policy, queue-age/load-shed thresholds, connector bulkheads/circuit breakers and no unlimited batch. Expensive re-verification/migration/export jobs are resumable, rate-limited and scheduled outside critical workload when safe. The system returns typed capacity errors and never silently drops accepted work.

Capacity test axes: 1/10/100 GiB receipts as safe limits allow, 10/1,000/100,000 components, many small files, archive ratio/depth, concurrent tasks/readers, slow disk, low memory, full disk, retry storm, provider throttling, policy-wide reverify and restore. Published supported limits come only from results and safe cost.

## 9. Backup, restore and disaster recovery

### 9.1 Backup set

Metadata/event DB; CAS/receipt packages; immutable policy/check registry; configuration without plaintext secrets; trust store/public keys/revocation data; encrypted secret/key backup according to separate ceremony; audit; release/schema/migration versions; and an inventory binding all components.

Operational backup is not long-term evidence preservation. A `preservationPolicy` also preserves original canonical bytes; historical schemas, contexts, qualified policies/profiles and algorithm definitions; public TCK vectors; trust-root/time/revocation/transparency evidence; external-reference snapshots; renewal chain; format/fixity policy; and lawful deletion/custody records as specified in doc 17. Privacy/legal deletion can override preservation of payload but must leave an honest typed gap.

### 9.2 Procedure and invariants

1. Obtain a consistent SQLite snapshot using supported backup/VACUUM mechanism and integrity-check it.
2. Snapshot CAS/packages with a reference inventory and component digests; record files added during backup.
3. Encrypt, access-control and isolate backup; at least one offline/immutable copy for Profile I.
4. Restore into a new empty location/environment, never over the only original.
5. Verify DB integrity/migration/checksums, CAS references, receipt independent verification, lifecycle/current links, tasks, audit sequence and secrets/trust capability.
6. Reapply deletions/holds according to policy and document external unresolved references.
7. Record actual RPO/RTO, gaps and owner sign-off; destroy test restore safely.

Local release qualification performs a restore scenario; Profile I conducts at least quarterly partial restore and annual full disaster/region or infrastructure-loss exercise, plus after material storage/migration change. A backup without successful restore evidence does not satisfy the gate.

Disaster scenarios include corrupt/deleted DB, lost CAS subset, ransomware/credential/key loss, bad migration, compromised release, unavailable resolver/identity, loss of primary host/site and restored backup containing data later deleted. Communications and receipt/policy correction are part of recovery.

## 10. Observability and diagnostics

### 10.1 Signal separation

| Signal | Purpose | Content/retention | Failure effect |
|---|---|---|---|
| Structured logs | Debug operation/dependency | Allowlisted metadata, diagnostic IDs; short | Degraded diagnosis; never evidence |
| Metrics | SLI/capacity/cost/security trend | Bounded labels, no claim/receipt/raw IDs | SLO visibility degraded |
| Traces | Request/task dependency latency | Sampled, versioned semantics, safe references | Debug visibility degraded |
| Audit | Accountability/high-risk operations | Minimal actor/action/subject/result, unsampled | Consequential actions block if persistence required |
| Evidence/receipt | Scientific/trust proof | Exact typed provenance/components | Trust operation blocks on failure |
| Frontend/CLI diagnostics | User recovery | Opt-in redacted bundle with `invocationId`/`diagnosticId`; canonical `operationId` only as action type | Local error still visible |

Current call-record-to-OTel export is labeled a projection and cannot satisfy live tracing/metrics. A future implementation publishes a FAR telemetry semantic-convention version and compatibility window. Required correlation is `requestId → taskId → attemptId → stage/checkId → receiptId` through scope-limited opaque references; event/state/reason names derive from the domain contract. Sampling/drop/queue overflow is measured, never silent; audit/evidence are unsampled separate authorities. Attribute classification, cardinality budget, retention and redaction are testable per field. Provider-native OpenTelemetry fields may be projected but cannot redefine FAR semantics.

### 10.2 Required metrics

Receipt compile/verify/replay outcomes and duration by qualified policy/profile version; six assurance results; task queue/age/state/attempt/cancel/checkpoint/orphan; DB latency/locks/integrity; CAS bytes/objects/missing/orphans/scrub; disk/memory/CPU/PID/worker kill; SSE lag/reconnect/gap; connector latency/error/rate/bytes; authz denial/emergency access; import quarantine/parser/resource; policy/model/version distribution/correction/withdrawal; backup and archive-fixity age/result; restore RPO/RTO; release/installer versions; cost units; and SLO burn.

No raw claim, filename, email, token, tool args/output or unbounded receipt/tenant label. Correlation uses pseudonymous, scope-limited IDs and propagates request→task→attempt→check plus release/policy/verifier.

### 10.3 Alerts/runbooks

Page only actionable user-impact/security/integrity/SLO events: corruption or cross-scope canary, audit/evidence append failure, sustained fast burn, queue stuck, disk emergency, backup/restore overdue/fail, key/release/secret incident, worker escape/egress, policy false-pass incident. Ticket lower urgency trends. Each alert has owner, severity, threshold/window, dedupe/suppression, diagnostic query, containment, recovery, user communication and verification. Alert accuracy is reviewed after incidents; no placeholder on-call target.

## 11. Incident response

| Severity | Example | Target internal action (not public SLA until staffed) |
|---|---|---|
| SEV-0 | Active cross-tenant/sensitive exfiltration, signing/release compromise, worker host escape | Immediate kill switch/containment and command; preserve evidence; legal/privacy/science comms |
| SEV-1 | Receipt integrity false pass, destructive corruption, bad policy causing harmful decisions | Contain within 30 min target; disable/withdraw and identify affected receipts |
| SEV-2 | Major authoring outage, restore failure, widespread task loss without disclosure | Same business day command; degrade/read-only and recover |
| SEV-3 | Localized recoverable defect/performance | Owned backlog/runbook; no emergency communication unless user impact warrants |

Named incident commander, operations, security, privacy/legal, scientific/policy and communications roles are required. Process: detect/declare → contain/kill/revoke → preserve evidence → assess scope/data/receipts → communicate/notify → recover/verify → correct/withdraw affected results → blameless postmortem with owned deadlines → effectiveness review. Placeholder `security@far-lab.example.com` must be replaced and tested before publication.

## 12. Cost model and controls

Total cost per receipt is not token price. Track:

`C = local/worker CPU-time + peak memory-time + disk/CAS bytes-month + backup bytes-month + network egress/requests + resolver/model/API units + observability bytes + security/release/support labor allocation`.

Record by deployment profile, task/check, component size/count, policy/verifier/model version and success/failure/retry—without sensitive high-cardinality labels. Fixed costs include cross-platform releases, scientific labeling/review, security/privacy/legal work, incident/restore drills and support.

Baseline before pricing/scale: representative small/medium/upper-supported packages; structure-only vs reproduction vs model-assisted; clean vs error/retry/cancel; local and institutional reference hardware. Report median/p95/p99, distributions and uncertainty. Current benchmark token totals from fixtures are not product cost evidence.

Controls: preflight estimate/range; soft warning and hard user/org/task budgets; disk/queue/concurrency/connector/model quotas; cancellation; cache only content/version-safe results; batch where it preserves latency/fairness; retention tiers; model off by default and cheaper/no-model baseline; anomaly/loop/retry kill switch; cost owner and monthly variance review. Cost overrun never silently weakens integrity/scientific checks—operation stops or explicitly changes scope before execution.

## 13. Supply-chain registry and policy

Inventory direct/transitive npm/pnpm, frontend npm, Python, native addons/system libraries, container bases, Actions, install/build tools, scientific data/models/providers, fonts/assets, schemas/standards and any future extension. Each entry has exact version/digest/source, purpose/runtime class, owner, criticality, license/terms, maintenance/EOL, vulnerability/update cadence, alternatives, build scripts/native/network behavior and last review.

Controls:

- lock every ecosystem; inspect lock drift; deny unreviewed lifecycle/postinstall where feasible;
- pin Actions by immutable commit and base images by digest with update automation that opens reviewed changes;
- build from a clean minimal context in an isolated builder with no production secrets and bounded network;
- generate SPDX/CycloneDX-equivalent complete SBOM and SLSA-style provenance or current equivalent from the actual artifact, not stale repository snapshots;
- scan dependencies/images/secrets/licenses, but require disposition and behavior review for critical dependencies; scan success is not trust;
- sign checksums/artifacts/provenance, publish transparency record where appropriate and verify after download/install;
- two-person release/key operation, revocation/withdrawal/runbook, last-good artifact and offline verification;
- license/terms cover code, transitive packages, models, data/databases, assets/fonts, docs/examples and output/republication rights.

Critical native/database, canonicalization, archive/parser, crypto/signing, installer and CI dependencies require named owner and tested alternative/exit. A dependency without a maintainable license/source/update path blocks stable release.

## 14. Governance and RACI

| Activity | Accountable | Responsible | Required independent review |
|---|---|---|---|
| Trust kernel/receipt/profile | Protocol owner | Core maintainers | Scientific + security + independent verifier |
| Scientific policy/threshold | Scientific owner | Domain/evaluation team | Independent domain/method reviewer |
| Migration/data storage | Data owner | Platform engineer | Core/release + restore witness |
| Security/privacy control | Security/privacy owners | Engineering/operations | External high-risk audit/counsel as applicable |
| Release | Release owner | Release engineers | Two-person approval; protocol/security for trust changes |
| Incident | Incident commander | Ops/security/product/science roles | Postmortem reviewer |
| Dependency/license | Supply owner | Component owners | Security/legal for critical/new terms |
| SLO/capacity/cost | SRE/product owner | Platform/finance-support roles | User-impact review |

Current bus factor one and placeholder owners fail this table. Stable release requires names, backups/delegates, escalation/contact tests and succession.

## 15. Platform release blockers

Any of these blocks the applicable profile: dirty/unidentified candidate; full current gates unavailable; integrity false pass/silent downgrade; missing V2/TCK/independent verifier; cross-scope authorization; sensitive third-party transmission; unsafe parser/execution; secret/image/install leak; stale/incorrect SBOM/checksum/provenance; version-mutable installer; undefined preserve/purge behavior; untested migration/restore/archive recovery or unmet RPO/RTO; missing incident/support owner/contact; critical dependency/license without disposition; unsupported platform claim; unbounded queue/resource/cost; semantic telemetry leak/drift; or public/scientific/comparative claim exceeding the claim ledger.

## 16. Platform acceptance and rollback matrix

| Gate | Acceptance evidence | Monitor | Rollback/degrade |
|---|---|---|---|
| Clean candidate | Zero unexplained tree changes; component/version/claim authority | Release manifest drift | Abort release |
| Cross-platform | Clean install/verify/tamper/cancel/restore/uninstall on named OS/arch | Doctor/install failures | Remove platform from matrix |
| Delivery provenance | Reproducible artifact, complete SBOM, provenance/signature/checksums and post-upload verify | Vulnerability/provenance/key alerts | Withdraw artifact, pin last good |
| Data durability | Fault-injection atomicity, scrub/reconciliation and restore drill | Integrity/orphan/backup age | Read-only/restore copy |
| Reliability | Qualification SLI corpus and, for Profile I, load/error budget/canary | SLO burn/capacity | Freeze rollout, shed/degrade |
| Incident | Tabletop for leak/forgery/bad policy/release/key/restore | Action expiry/contact test | No SLA/stable release |
| Cost | p50/p95/p99 workload model and enforced budgets | Unit cost/variance/anomaly | Disable model/reproduction; structural core |
| Supply | Full multi-ecosystem registry, license and critical-owner/alternative | Update/EOL/CVE | Pin/replace/withdraw feature |
| Operations exit | Verified portable export and uninstall/cleanup without hidden dependency | Export/exit failures | CLI/offline verifier only |
