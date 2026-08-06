---
status: reviewed
owner_role: platform-release-and-open-source-council
last_verified: 2026-08-05
scope: deployment, reliability, recovery, observability, cost, release and supply-chain target specification
authoritative_for:
  - deployment and SRE gates
  - release-candidate contract
  - cost and supply-chain governance
evidence_level: mixed
related_decisions: [DEC-003, DEC-007, DEC-010]
related_requirements: [REQ-OPS-001, REQ-OPS-002, REQ-OPS-003, REQ-OPS-004, REQ-UX-003, REQ-TRUST-005, REQ-QUAL-001, REQ-GOV-003]
supersedes: []
superseded_by: null
---

# 13 — Platform, SRE, cost, and supply chain

## 1. Operational verdict

No production or stable-release claim is supported. The current worktree is not one immutable candidate; the full runtime was not executed; release checksums are stale; installer source is mutable; Docker build context can include `.env`; documented Compose binding conflicts with CLI safety; no live metrics/SLO/restore/on-call evidence exists; maintainership is effectively one person with placeholder contact (`OPS-0001`, `QUAL-0001`, `GOV-0001`).

The detailed platform specification is `09_PLATFORM_SRE_COST.md`; quality/release gates are `14_QUALITY_EVALUATION_AND_RELEASE.md`; this document owns the platform/release decision summary.

## 2. Supported deployment matrix

| Profile | Supported target | Reliability unit | Data boundary | Current status |
|---|---|---|---|---|
| O Offline verifier | Signed native/package artifact on declared Windows/Linux; no service/network | One package verification | Read-only receipt + local trust store | Designed, unqualified |
| L Local author | Loopback application + embedded store + isolated worker | One local project/owner | Local filesystem; explicit resolver egress only | Designed, unqualified |
| I Institution private | Single institution, scoped identities/projects, isolated workers | Service/tenant | Institution-controlled | Blocked through G5 |
| H Hosted multi-tenant | Managed tenant control/data plane | Region/service/tenant | Processor/subprocessor | Not approved |

The published support table names exact OS/architecture/shell/runtime/native-ABI/filesystem/container/isolation combinations and unsupported modes. Each tuple passes install→doctor→offline inspect/verify/tamper→upgrade→old-receipt verify→rollback/read compatibility→uninstall-preserve→reinstall→explicit purge. WSL success/failure is not silently generalized to Windows or Linux. No “best effort” environment is in a stable support matrix.

## 3. Environment and configuration

- Configuration precedence and sources are versioned and inspectable; secret values never print. Unknown/deprecated/unsafe settings fail with remediation.
- Development, test, release-build and user runtime are separate. Test fixtures and demo modes cannot activate in production profiles.
- Network bind defaults to loopback. Anonymous non-loopback is rejected; protected bind requires explicit identity/authorization profile.
- Build context uses explicit allowlist/excludes `.env`, keys, local databases, receipts, caches and user work. Runtime image is non-root/read-only where feasible and has no build secrets.
- `doctor` checks without installing/rebuilding unless a separately authorized command is invoked; it reports exact platform, native ABI, Python environment, isolation capability and candidate/version.

## 4. Immutable release candidate

One candidate manifest binds:

- source commit/tree and clean-state evidence;
- package/dependency locks and toolchain/platform images;
- receipt/API/CLI/event/database/profile/policy/canonicalization versions;
- governed test/benchmark datasets and oracle/scorer versions;
- all test/gate logs, counts, exclusions and environment facts;
- source/build artifacts, installers/images, SBOM/license/vulnerability disposition;
- checksums, in-toto/SLSA provenance, signatures/trust roots;
- approvers, docs/release notes/migrations/deprecations/known limits.
- distribution/support/docs/example manifests, install/data/config/cache/trust/temp paths and preserve/purge semantics.

No mutable branch/tag/download URL is an installation source. Two independent people build/verify from clean environments; every artifact checksum and provenance subject matches. Release happens only from that candidate and rollback selects a prior immutable candidate.

## 5. Delivery pipeline and source-control governance

```text
clean source candidate
→ static/type/lint/license/secret/dependency checks
→ unit/property/contract + canonical cross-language vectors
→ integration/E2E/accessibility/security/privacy/scientific tests
→ migration/backup/restore/upgrade/rollback and hostile-worker suites
→ reproducible build/SBOM/provenance/signing
→ two-person artifact/install/offline-verifier qualification
→ staged release with monitored stop/rollback
```

Remote required checks, protected branches/tags, CODEOWNERS, signed release and environment approvals must be observed through repository settings—not inferred from YAML files. Trust/science/security/privacy/migration/release owners are separate where conflicts matter. A retry cannot turn a critical failure green.

## 6. Reliability objectives

Targets remain provisional until pilot workload measurement.

| SLI | Profile O/L qualification target | Failure behavior |
|---|---|---|
| Canonical verify correctness | 100% golden/tamper/downgrade vectors; no silent partial | Fail closed with component/reason |
| Task durability/idempotency | 100% declared crash points recover without duplicate seal | New attempt, preserved terminal history |
| Run isolation | 100% adversarial concurrent scope set | Block release/shared mode |
| Local task success | ≥99% on supported clean qualification set excluding declared invalid input | Exact failure class and safe retry |
| Cancellation | Bounded worker/process termination and no partial current receipt | Cancelled/failed attempt remains visible |
| Data durability | RPO 0 for sealed local receipt metadata after success; draft target documented | Read-only safe mode/export if corruption |
| Restore | RTO target established from measured local/institution drill; integrity and lifecycle reverified | Failed restore never becomes authoritative |
| Offline | Zero undeclared network attempts | Resolver is skipped/unavailable, not hidden online fallback |

Profile I provisional service SLOs require real load/error-budget data, staffed on-call and institution agreement; none is a public commitment now.

## 7. Failure, backpressure and degradation

| Failure | Required behavior | Never do |
|---|---|---|
| Worker crash/timeout/resource breach | Kill scope, preserve attempt/events, release lease, retry only if policy permits | Mark success or reuse partial output |
| DB/object store disk full/corruption | Stop mutation, enter safe/read-only diagnostics, preserve verified exports | Continue sealing without durable commit |
| Queue/event duplicate/gap | Idempotent consume; detect gap; recover from source state | Apply transition twice or invent progress |
| Policy/trust store unavailable | Use explicitly pinned valid cache or return unavailable | Fetch mutable “latest” silently |
| Provider/resolver outage | Skip/degrade that dimension; core offline path remains | Change scientific verdict because network failed |
| Migration failure | Transaction/copy rollback and verified restore; block writer compatibility | Half-upgrade schema or edit old migration |
| Key/trust-root compromise | Freeze affected profile, revoke/rotate, enumerate receipts, notify/correct | Re-sign history invisibly |
| Backlog/overload | Per-project/user limits, bounded queue, fair admission, resource estimate | Unbounded spawning/retry storm |
| Release regression | Halt rollout, select prior candidate, publish known impact/correction | Rewrite tag/artifact/checksum |

## 8. Backup, restore and disaster recovery

Backup set includes transactional DB, immutable objects, policies/profiles/trust roots, lifecycle/review/audit as permitted, configuration metadata and candidate manifest—not secrets unless separately encrypted/recoverable. Backups are encrypted, access-limited, versioned and retention/deletion/legal-hold aware.

Quarterly before stable (and every release affecting schema/crypto): restore into an isolated copy; verify manifest/digests/schema/migrations/access/lineage/currentness; replay selected receipts; measure RPO/RTO; ensure withdrawn/superseded/deleted state is not resurrected; document irrecoverable external anchors/keys. A backup job exit 0 is not restore evidence.

Long-term evidence preservation is a separate doc 17 profile: canonical bytes alone are insufficient without historical schemas/contexts/profiles, algorithm/TCK definitions, trust roots, time/revocation/transparency material, reference snapshots and renewal chain. An air-gapped archive recovery must report each missing dimension, never a global pass.

Disaster plans cover local corruption/loss, institution store loss, signing compromise, release/supply-chain compromise, policy/detector scientific defect, privacy breach and maintainer/project disappearance.

## 9. Observability and incident operations

Separate:

- product/domain events (authoritative state transitions),
- security/privacy audit (access/policy/admin/key/rights decisions),
- operational logs/metrics/traces (diagnostic, not evidence),
- receipt evidence/attestations (portable trust material).

Required metrics: task queue/run/terminal outcomes and age; retries/cancel/timeout; verifier component failures; schema/profile compatibility; worker egress/resource denials; policy/refusal/abstention; storage/DB latency/capacity; backup/restore age/result; authz denials/cross-scope canaries; external dependency latency/error/cost; correction/appeal age; install/upgrade success; release adoption/rollback.

No raw claim/material/prompt/secret in telemetry. A versioned FAR semantic convention defines request→task→attempt→stage/check→receipt correlation, canonical state/reason fields, classification/redaction, sampling/drop disclosure, cardinality budget, retention and compatibility. Audit/evidence remain separate unsampled authorities. Alerts map to owned runbooks for data integrity, worker escape/egress, cross-scope access, key compromise, queue stall, disk/corruption, restore/archive failure, provider loss and scientific-policy defect. Every critical runbook is exercised before its SLO/response promise.

## 10. Cost and capacity

Report unit costs separately: receipt storage, local CPU/memory/disk, isolated replay minute, external resolver/model call, signing/transparency, transfer/egress, observability, backup, support and expert review. The deterministic/offline path cannot depend on a paid model/provider.

Capacity planning starts with measured pilot distributions and 10× forecast tests. Enforce per-task input/output/member/time/process/memory/disk/network budgets; queue/concurrency limits; cache validity/privacy; cost preview and cancellation. Add services only when measured SLO/isolation/cost cannot be met by the modular monolith.

No business margin/price claim is made; payer and support burden are unknown.

## 11. Supply chain and lifecycle

Inventory source/runtime/build/test dependencies, base images, native binaries, Python/Node toolchains, models/providers, scientific datasets/policies, tools/skills/plugins and release infrastructure. For each record source, exact version/digest, maintainer/signature, license, SBOM/transitives, vulnerability/EOL, build script/network behavior, platform, data access, replacement/rollback and owner.

Prohibit mutable branch installers, unpinned remote scripts, unreviewed install hooks in trust paths, archived dependencies without accepted risk, optional security-critical artifacts and unsigned/unattributed releases. Dependency/model/policy updates trigger targeted compatibility/security/science evaluation and affected-result analysis.

Feature lifecycle is `experimental → preview → stable → deprecated → removed`, each with evidence, owner, compatibility, migration, telemetry/privacy impact, support window and rollback. Installation never depends on a mutable release pointer for authority; uninstall preserves receipts/trust/config/audit unless an exact explicit purge is approved, and purge reports undeletable external/backup copies. Generated evidence belongs outside source authority or has deterministic regeneration/retention rules.

## 12. Governance and release blockers

Stable operation needs two people able to release/respond, real security/support channels, CODEOWNERS for trust/science/security/privacy/data/release, conflict/succession/archival rules and funded maintenance. Current bus factor/contact state blocks external stable release.

Immediate blockers are RB-01..RB-10 in `14_QUALITY_EVALUATION_AND_RELEASE.md`: clean runtime, receipt V2, run isolation, policy binding, OS isolation, shell scheduler, coherent release path, scientific oracle, rights/authorization and staffed governance. These are not waived by more tests, documentation, demo polish or competition deadline.
