---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: decision-level repository reality, maturity, runtime evidence, and claim gaps
authoritative_for:
  - forensic verdict
  - maturity assessment
  - top repository failure chain
evidence_level: A
related_decisions: [DEC-001, DEC-005, DEC-008, DEC-010]
related_requirements: [REQ-PROD-001, REQ-TRUST-001, REQ-DATA-001, REQ-OPS-001]
supersedes: []
superseded_by: null
---

# 04 — Repository forensics

## 1. Forensic verdict

The observed worktree is a substantial but internally inconsistent research/prototype integration snapshot, **not an attributable release candidate**. It contains real deterministic-kernel, evidence-chain, CLI/API/Web and test assets, alongside fixture-led science claims, a bounded self-verifying proof format, incomplete identity/lifecycle controls, unsafe execution assumptions and contradictory release/progress evidence.

This core document owns the decision-level finding. `02_REPOSITORY_FORENSICS.md` is the detailed path/symbol/line evidence annex; `EVIDENCE_LEDGER.md` owns evidence IDs; `INITIAL_GIT_BASELINE.md` owns the raw pre-audit Git snapshot.

## 2. Snapshot and runnable evidence

| Item | Fact | Interpretation |
|---|---|---|
| Repository | Git root `/mnt/c/users/richardyuan/desktop/far-lab`; branch `design/s0-safe-boot`; HEAD `a6edceb243796acce45e45b5dd1d21a7db6cb803` | Every finding is pinned to this dirty snapshot, not “the project” timelessly. |
| Initial workspace | 253 porcelain entries: 189 unstaged paths, 13 staged paths, 82 untracked paths (`REPO-0002`) | Current capabilities cannot be attributed to a clean commit or coherent change set. |
| v3 package | Core/master/monolithic/audit, 12 modules and 8 templates match manifest; manifest-declared root README does not (`REPO-0003`) | Modular execution package usable; “complete package matches” is false. |
| Static gates | `pnpm run typecheck && pnpm run lint` exited 0 (`RUN-0001`) | Narrow current static evidence only. |
| Node runtime | `better-sqlite3` probe fails `invalid ELF header` under WSL (`RUN-0002`) | Full Node tests/demo cannot be claimed in observed environment. |
| Python runtime | Windows NumPy dependency path fails on Linux via missing `os.add_dll_directory` (`RUN-0003`) | Science/runtime execution cannot be claimed. |
| Full tests/demo | Not run: bootstrap may rebuild/install, violating exclusive write boundary | `BLOCKED`, not failed and not passed. |

## 3. Physical and logical map

| Layer | Observed assets | Forensic result |
|---|---|---|
| Domain/trust | FEC, R0–R9 verdict rules, proof envelope/export/verifier, evidence ledger/hash chain, lifecycle | Real logic exists; input, authenticity and science guarantees are materially weaker than naming/marketing. |
| Application | Hypothesis/research orchestration, report generation, science harness, scheduler | Multiple flows exist; global/latest data access, empty bindings/plans and shell execution violate target boundaries. |
| Interfaces | 15 observed Web routes, 24 CLI command modules, 17 HTTP route registrations | Breadth is real; shared lifecycle/error/permission contract is not. Some hero/demo routes are fixture theatre. |
| Data | SQLite migrations, evidence/claims/runs/reports/sessions/artifacts | `runId` is not a consistent storage key; tenancy/ownership/retention/migration checksums are absent. |
| Platform | Docker/Compose, CI workflows, installer/release artifacts, test suites | Configurations exist; build context, binding, mutable installer, stale checksums and selective gate authority conflict. |
| Generated evidence | `.far-implementation`, benchmark/release/progress artifacts | Large tracked historical/generated corpus creates churn and cannot substitute for current candidate evidence. |

No nested repository, submodule, tracked symlink or Git LFS object was found in the audited topology. Ignored frontend dependency symlinks point to temporary storage and make the physical runtime environment non-portable. The `.far-implementation` tree alone contains 1,594 tracked files and roughly 43 MB of evidence-like artifacts; authority and regeneration rules are unclear.

## 4. Two critical vertical traces

### Claim to verdict

`HTTP/CLI/Web intake → hypothesis/FEC orchestration → source resolution/compiler → evidence/check records → verdict stages → report/view`.

Critical breaks: active FEC orchestration can emit empty deviation/contradiction sets and treats non-empty source/hash strings as resolved (`src/fec/orchestrator.ts:320-407`); the legacy adapter supplies zero freeze hashes (`src/falsifiability/legacy_kernel_adapter.ts:270-334`); observed compiler paths can hold empty execution plans (`src/fec/compiler.ts:127-149,243-247`); literature support/refutation labels map into verdict votes. Determinism therefore proves repeatability of the supplied representation, not that a declared experiment ran or the policy is scientifically valid (`SCI-0002`).

### Ledger to portable verification

`records/events → content/hash chain → proof export → package manifest/components → bundle verifier → verification report`.

Critical breaks: full integrity is conditional on manifest presence; code is referenced rather than embedded; active proof hashing is TypeScript V1 self-consistency; third-party certification is explicitly disclaimed (`src/far_proof/bundle_verifier.ts:23-35,179-189,230-232`; `src/far_proof/exporter.ts:489-550`; `src/proof_envelope/proof_hash.ts:4-18`). A consistent rehash forgery remains outside the keyless threat boundary, also admitted by `README.md:263-265,318-320` (`TRUST-0001`).

## 5. Claim/evidence gap

| Claim family | Direct counterevidence | Allowed statement |
|---|---|---|
| “AI4S lie detector / true or false” | README itself disclaims scientific truth (`README.md:5,115-122`); benchmark is fixture-only/unreviewed | Deterministic policy/check research prototype |
| 28-domain validity | All 30 benchmark rows use `offline_replay(fixture)`, `oracleReviewStatus=unreviewed`, null commit (`benchmark/benchmark_report.json`) | 28 labels exercise engineering fixtures |
| Independent portable proof | Optional full manifest, omitted code, same-stack V1 verifier, no external identity root | Bounded package self-consistency under stated inputs |
| Safe sandbox | Runner clears proxies and validates declared ceilings but does not impose OS network/CPU/memory isolation (`repro/science_harness/sandbox_runner.py:18-21,91-113,187-219`) | Trusted local subprocess with timeout cleanup |
| Platform/multi-user readiness | JWT principal unused for resource auth; schema lacks tenant/owner; global/latest queries (`API-0001`) | Restricted single-user local prototype only |
| Production/release readiness | Current runtime blocked, 7 of 11 listed release checksums fail, installer follows mutable branch, bus factor one | Historical engineering work; no current release candidate |

## 6. Maturity by dimension

| Dimension | Evidence-based state | Why |
|---|---|---|
| Deterministic kernel mechanics | `SUBSTANTIAL / UNVALIDATED SCIENTIFICALLY` | Real rules/tests; weak executed-input and cross-domain validity binding. |
| Receipt/integrity mechanics | `PROTOTYPE / THREAT-BOUNDARY INCOMPLETE` | Hashing/tamper logic exists; mandatory manifest, identity, independent verifier and downgrade resistance absent. |
| Scientific evidence | `FIXTURE CONFORMANCE ONLY` | No reviewed oracle, real dataset protocol, calibration or external reproduction. |
| CLI | `BROAD PROTOTYPE` | Many commands and real flows; machine semantics and failure/compatibility not unified or currently run. |
| Web | `SHOWCASE + PARTIAL APPLICATION` | 15 routes; simulated/fixture paths, missing redress/accessibility evidence and API-backed closure. |
| API/data isolation | `UNSAFE FOR CONCURRENCY/SHARING` | No durable job contract, authorization ownership or run-scoped storage invariants. |
| Security/privacy | `LOCAL TRUSTED-DEMO ONLY` | Shell string execution, no OS sandbox, plaintext records, no lifecycle/tenancy proof. |
| SRE/release/governance | `NOT RELEASE-READY` | No immutable candidate, reliable release evidence, live SLO/restore/on-call or staffed stewardship. |

## 7. Root-cause chain

1. **Surface:** demos, reports and labels present stronger completion than runtime/science evidence.
2. **Same class:** progress, roadmap, release, API and Web artifacts each have independent authority and stale/global shortcuts.
3. **Root:** the repository optimizes showcase breadth and internal deterministic consistency without one explicit threat-bounded product contract, candidate identity or evidence hierarchy.
4. **Impact:** judges/users may mistake reproducible formatting for authenticity or scientific truth; concurrency, unsafe execution and missing redress can cause material harm.
5. **Alternative:** narrow to receipt protocol + local reviewer loop; define six orthogonal assurances; bind one scientific profile; block every stronger mode behind evidence gates.

## 8. Five fatal failures for the current thesis

1. No real user/demand evidence and no observed author–reviewer decision loop.
2. No expert-reviewed scientific benchmark or defensible cross-domain validity.
3. No independently authenticated, mandatory, self-contained, downgrade-resistant receipt.
4. No safe shared execution/data boundary or procedural/privacy lifecycle.
5. No attributable clean candidate, full current gate run or staffed release/governance system.

These failures do not erase the reusable kernel/evidence/CLI assets. They do veto current universal, independent, secure, production-ready and leadership claims.
