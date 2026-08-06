---
status: reviewed
owner_role: repository-forensics-lead
last_verified: 2026-08-05
scope: detailed repository topology, source traces, maturity evidence, and failure analysis
authoritative_for: [path-level repository evidence, vertical source traces]
evidence_level: A
related_decisions: [DEC-001, DEC-008]
related_requirements: [REQ-PROD-001, REQ-OPS-001]
supersedes: []
superseded_by: null
---

# FAR-Lab repository forensics

| Field | Value |
|---|---|
| Status | `VERIFIED_WITH_RUNTIME_BLOCKERS` |
| Owner | Audit lead |
| Evidence level | A for repository facts; D for interpretations |
| Last verified | 2026-08-05, Asia/Shanghai |
| Authority | Current-worktree reality map; it does not override source contracts or future target specifications |
| Snapshot | HEAD `a6edceb243796acce45e45b5dd1d21a7db6cb803` plus the immutable dirty baseline in `INITIAL_GIT_BASELINE.md` |

## 1. Executive forensic finding

FAR-Lab is not an empty prototype. It contains a substantial deterministic verification kernel, append-oriented evidence structures, export/verification machinery, CLI/API/Web surfaces, and broad automated-test source. The observed worktree is nevertheless an integration snapshot rather than a verified release candidate: it began with 253 Git porcelain entries, cannot execute the full runtime baseline in the present WSL dependency state, and contains product claims that exceed the strength of its own fixtures, trust model, external validation, authorization, and operating evidence.

The correct maturity statement is therefore component-specific, not “complete” or “production-ready.” The strongest components are L3 engineering implementations with repository tests; the overall service is L2–L3 because real-user, scientific-oracle, protected multi-user, recovery, release, and support loops are not proven.

## 2. Physical and version-control topology

| Fact | Classification | Evidence | Consequence |
|---|---|---|---|
| Git root is `/mnt/c/users/richardyuan/desktop/far-lab`; WSL reports case-normalized path spellings. | FACT | `git rev-parse --show-toplevel`; REPO-0001 | Audit scope is unambiguous. |
| Branch is `design/s0-safe-boot`, HEAD `a6edceb…`, 61 commits ahead of `origin/main` and zero behind at capture time. | FACT | `git branch --show-current`; `git rev-list --left-right --count origin/main...HEAD` | Findings must not be presented as released-main state. |
| Initial tree had 253 porcelain entries: 189 unstaged paths, 13 staged paths, 82 untracked paths. | FACT | `INITIAL_GIT_BASELINE.md`; REPO-0002 | Status alone cannot assign authorship; every claim is pinned to the observed worktree. |
| No nested Git repositories, submodules, tracked symlinks, or Git LFS pointers were found. | FACT | `find`/`git ls-files` static inventory | One repository boundary; ignored dependency symlinks remain outside product evidence. |
| `frontend/node_modules` resolves through ignored links into `/tmp/far-lab-node_modules`. | FACT | `find frontend/node_modules -type l`; ignore checks | Do not treat installed dependencies as portable project assets. |
| `.env` exists and is ignored; it was not opened. | FACT | `git check-ignore .env` only | Secrets were excluded from audit inputs. |
| Tracked files total 2,789; `.far-implementation` alone contributes 1,594 files and about 43 MB. | FACT | `git ls-files` grouped inventory | Evidence-artifact volume dominates repository shape and raises churn/review cost. |
| Walking-skeleton artifacts are documented as nondeterministic and self-referential. | FACT | `.far-master/POST_CONSOLIDATION_REPORT.md:59-63` | Tracked generated proof output cannot serve as a stable release authority without a policy change. |

### Generated and externalized paths

`node_modules`, `.python-deps`, `.venv312`, caches, `frontend/dist`, and `.far-proof` are ignored/generated. They are runtime prerequisites or outputs, not repository capabilities. `.far-implementation/walking-skeleton/**` is tracked but explicitly described by the repository as regenerating ULIDs, timestamps, derived hashes, durations, and HEAD bindings. A later implementation decision must either make those artifacts reproducible or remove them from source authority; this audit does neither.

## 3. Logical system map

| Layer | Current implementation | Principal sources | Observed maturity | Missing closure |
|---|---|---|---|---|
| Claim/FEC | Falsification contracts and frozen measurement semantics | `src/fec/**`; `src/falsifiability/**` | L3 | Domain validation, policy governance, user correction path |
| Deterministic verdict | Five outcomes through R0–R9 and legacy adapters | `src/falsifiability/verdict_kernel_v2.ts`; related tests | L3 | External oracle, calibration, version-transition evidence |
| Evidence ledger | SQLite call/evidence/verdict/reproduction records with append-only triggers and hashes | `schema/migrations/0001_initial.sql:10-240`; `src/evidence_log/**` | L3 | Authentication anchor, tenancy, retention, legacy-row coverage |
| Proof envelope/export | Self-checking envelopes and a V1 bundle verifier/exporter | `src/proof_envelope/proof_hash.ts:1-18`; `src/far_proof/bundle_verifier.ts:1-35,108-232`; `src/far_proof/exporter.ts:1-24,489-550` | L2–L3 | Required integrity manifest, independent implementation, self-contained code/data, signature/transparency anchor |
| Agent loop | Six LLM stages, receipts/resume, then a deterministic verdict adapter | `src/agent_loop/fsm_runner.ts`; `src/agent_loop/verdict_stage.ts:1-29,168-240` | L2–L3 | Production evidence provider, experiment execution boundary, permissioned tool runtime, scientific validation |
| CLI | Roughly two dozen commands covering demos, ask/verify/export, audits, lifecycle, backup and scheduler | `src/cli/far.ts:38-176` | L3 for local source workflows | Stable distribution, compatibility matrix, uniform JSON/errors, safe scheduler |
| HTTP API | Fastify, security headers, CORS/rate limit, optional JWT, OpenAPI JSON and `/api/v1` routes | `src/api/server.ts:77-136` | L2–L3 | Resource authorization, tenancy, async jobs, idempotency, cancellation, appeal/lifecycle APIs |
| Web | React/Vite/TanStack Query/D3, 15 route paths | `frontend/src/App.tsx:56-100`; `frontend/src/lib/api_client.ts:100-162` | L2 | Protected authentication, task lifecycle, redress, evidence-first workflow, verified accessibility |
| Benchmark | 30 fixture problems over 28 domain labels and five verdict branches | `benchmark/benchmark_report.json:1-29,766-773` | L2 engineering fixture | Scientific labels, independent review, hidden set, baselines, confidence/error analysis |
| Governance/release | CI/workflows, governance prose, CODEOWNERS and release plans | `.github/**`; `GOVERNANCE.md`; `CONTRIBUTING.md`; `SECURITY.md` | L1–L2 operationally | Named owners, enforced branch rules, security channel, signed release, observed incident/restore exercises |

Maturity scale: L0 name; L1 interface/static shell; L2 single-path example; L3 runnable implementation without complete validation/exception closure; L4 tested permissions/recovery/compatibility; L5 governed and operated over time.

## 4. Interface inventory and vertical traces

### 4.1 Intake-to-verdict trace

1. Web mutation or direct client posts `researchInput`, `mode`, and optional `dialogueMode` to `/api/v1/hypothesize` (`src/api/routes/hypothesize.ts:39-72`).
2. The route performs the entire loop synchronously and returns loop state, graph subtree, verdict, reproduction hash, and trace grade (`src/api/routes/hypothesize.ts:63-91`). There is no durable job identifier, progress resource, cancellation contract, or idempotency key.
3. The loop defaults to profile `offline_replay`, an offline adapter, and an all-zero reproduction-hash provider (`src/api/internal/loop_runner.ts:90-123,133-164`). A non-offline profile fails unless a real provider is injected; this is an honest fail-closed boundary.
4. After six stages, the verdict stage maps stage-4 labels `supports`/`refutes` to votes, deliberately does not map the literature entailment score to an experimental metric, and describes the result as pre-experiment literature-driven semantics (`src/agent_loop/verdict_stage.ts:13-27,76-97`).
5. The kernel then records a verdict against a derived hypothesis evidence summary (`src/agent_loop/verdict_stage.ts:168-240`). A deterministic rule output is reproducible given these inputs, but the input labels are not thereby scientific observations.

Failure interpretation: validation errors have a structured API shape, but the long synchronous operation lacks queue/timeout/retry/recovery semantics visible to the user. If a network request is retried after an ambiguous failure, duplicate runs are possible.

### 4.2 Ledger-to-portable-verification trace

1. `call_records` stores raw request and response payloads plus chain metadata; `evidence_log` stores evidence payload and source anchor; verdict and reproduction tables link outputs (`schema/migrations/0001_initial.sql:10-240`).
2. Append-only triggers prevent ordinary row update/delete, but they are database-local controls, not an authenticated external anchor (`schema/migrations/0001_initial.sql:48-58,85-95`).
3. V1 envelope hashing is explicitly a TypeScript self-check; the independent Python mirror is future scope (`src/proof_envelope/proof_hash.ts:4-18`).
4. Full bundle verification requires ten listed files, but `integrity.json` is not one of them (`src/far_proof/bundle_verifier.ts:23-35`). Full-component hashing runs only when that optional file exists (`src/far_proof/bundle_verifier.ts:179-189`). Removing it can therefore downgrade a newer bundle to legacy checks without failing required-file validation.
5. The verifier explicitly warns that its output is not third-party RO-Crate/PROV-O certification (`src/far_proof/bundle_verifier.ts:230-232`). The exporter likewise labels RO-Crate, PROV and OTel support basic/minimal and says third-party validation is not claimed (`src/far_proof/exporter.ts:15-24`).
6. Code is not embedded in the bundle; replay instructs a Git checkout and dependency installation (`src/far_proof/exporter.ts:489-550`). The package is therefore not self-contained or archival by itself.

Trust conclusion: the current design can detect corruption or naive modification relative to its stored hashes, and can compare against a separately preserved DB/export anchor when supplied. It cannot, by keyless recomputation alone, prove who produced an artifact, that the first-seen content was genuine, that no consistently rehashed forgery occurred, or that the scientific conclusion is true. README itself acknowledges consistent-forgery scope (`README.md:263-265,318-320`).

## 5. Identity, permission and tenancy

- FACT: protected API mode verifies a Bearer token and attaches `request.principal` (`src/api/auth/jwt_middleware.ts:46-90`).
- FACT: no route consumes `request.principal`; repository search finds only middleware assignments. Authentication therefore does not become resource authorization.
- FACT: the Web client has a base URL and generic fetch helpers but no token acquisition/storage/header contract (`frontend/src/lib/api_client.ts:100-143`). Protected API mode is not an end-to-end Web capability.
- FACT: core schema tables have no organization, workspace, tenant, owner, classification, or retention fields (`schema/migrations/0001_initial.sql:10-240`).
- FACT: the protected-action guard allows every recognized action from any `cli_user` or `api_user`, without identity, role, resource, policy, separation-of-duty, or approval context (`src/agent_loop/guards.ts:11-49`). Its write manifest is an exact-string assertion, not an OS/container/database permission boundary (`src/agent_loop/guards.ts:52-78`).
- INFERENCE: current safe deployment is single-user/local demonstration only. Multi-user institutional use is not merely unverified; its data and authorization model is absent.

## 6. Data, migration and lifecycle findings

| Finding | Type | Evidence | User consequence |
|---|---|---|---|
| Raw model requests/responses are stored in plaintext columns. | FACT | `schema/migrations/0001_initial.sql:10-40` | Sensitive prompts and outputs can persist without classification, encryption or retention policy. |
| Evidence payload hashing covers only new `derivable=1` rows; old rows remain unhashed. | FACT | `schema/migrations/0016_evidence_derivable.sql:7-23,27-32` | “All evidence bytes are sealed” is false. |
| Legacy evidence defaults to `system_derived`. | FACT | `schema/migrations/0017_evidence_provenance_class.sql:7-22,27-33` | Historical rows may receive a stronger provenance label than evidence supports. |
| Request-payload hashing was added only for new records; old rows are explicitly `legacy-not-covered`. | FACT | `schema/migrations/0020_call_record_payload_hashes.sql:6-18` | Chain coverage depends on record era and column, not a uniform guarantee. |
| Lifecycle events are append-only and hash-linked, but target existence is intentionally not enforced by FK. | FACT | `schema/migrations/0021_lifecycle_events.sql:7-20,21-52` | Application validation is a trust dependency; orphan lifecycle events are schema-valid. |
| Migrator checks ordered versions but not migration file checksum/drift, and applies each SQL file separately. | FACT | `src/db/migrator.ts:38-77,90-134` | An edited historical migration can go undetected on an existing DB; multi-file upgrade atomicity is not specified. |
| Main API lacks appeal, correction, withdrawal, retention, legal-hold and deletion endpoints. | FACT | `src/api/server.ts:118-134` route registry | Lifecycle CLI functionality does not close institutional procedural-justice workflows. |

What the current mechanism cannot prove: origin authenticity, lawful basis/consent, completeness of evidence, correctness of external observations, absence of omitted data, or scientific validity of the chosen rule/threshold.

## 7. Scientific and benchmark reality

The benchmark artifact contains 30 rows spanning 28 domain strings and all five verdict values. Every entry states `oracleReviewStatus: unreviewed` and `modelVersion: offline_replay(fixture)`; the report has `gitCommitSha: null` (`benchmark/benchmark_report.json:1-29,766-773`). Its own honesty notes say it measures engineering-integrity breadth, not scientific ranking or adjudication (`benchmark/benchmark_report.json:767-773`).

Consequently it supports these narrow claims:

- five verdict branches and a multi-domain fixture registry are exercised;
- deterministic fixture outputs and aggregate integrity roots can be generated;
- the reporting schema can carry provenance-like fields.

It does not support:

- accuracy, sensitivity, specificity, calibration, fairness, or external validity in any one domain;
- validity across 28 domains;
- real evidence retrieval or experiment execution;
- superiority to expert review, provenance systems, or other AI-science tools;
- a claim that “CONFIRMED” represents scientific confirmation.

There is an additional semantic risk in the main loop: stage-4 literature labels become verdict votes without experimental metric values (`src/agent_loop/verdict_stage.ts:13-27,76-97`). This may be a legitimate “bounded literature assessment” product, but it must not share the same user-facing semantics as experimentally computed FEC evaluation without an evidence-mode discriminator and policy gate.

## 8. Security, operations and governance evidence

### Immediate security defect

`runScheduleEntry` documents `execFile` “without shell concatenation” but passes the saved command string as the executable with `shell: true` (`src/cli/commands/schedule.ts:154-173`). This is a command-execution facility, not a safe argument-vector scheduler. Treat scheduler use with untrusted or shared configuration as release-blocking. This audit records the defect and does not fix it.

### Governance and operating gaps

- `GOVERNANCE.md:41-45` and `MAINTAINERS.md:3-15` state bus factor one and placeholder ownership.
- `SECURITY.md:10-19` names `security@far-lab.example.com`; `MAINTAINERS.md:9-15` identifies it as a placeholder. The stated response SLA is therefore not evidenced as operational.
- `CONTRIBUTING.md:93-109` says branch rules and code-owner enforcement require external configuration and gates are advisory until set.
- `.far-design/HUMAN_ACTIONS.md:22-44` records cross-platform runs, at least three real target-user studies, an independent grader, and a third-party security audit as pending human work.
- Trace “human checkpoint” and “external oracle” graders return score zero placeholders pending external updates (`src/trace/grade_scorers.ts:123-207`). Names and types exist, but evaluator closure does not.

No evidence inspected establishes a monitored production deployment, named on-call rotation, practiced incident response, restore-time measurement, signed release, published package, or adoption. These are UNKNOWN, not absent in every external environment.

## 9. Static and runtime verification baseline

| Check | Result | Allowed conclusion |
|---|---|---|
| `pnpm run typecheck && pnpm run lint` | Exit 0, no diagnostic output | Current TypeScript static/lint gates passed. |
| In-memory `better-sqlite3` probe | Exit 1: `ERR_DLOPEN_FAILED`, `invalid ELF header` | Installed native binary is incompatible with current WSL runtime. |
| Python dependency import probe | Exit 1: Windows-targeted NumPy calls unavailable `os.add_dll_directory` | Installed Python dependency tree is incompatible with current Linux process. |
| Full `pnpm test` | BLOCKED | Test bootstrap can rebuild/install dependencies, violating this round's write boundary. |
| `node src/cli/far.ts demo` | BLOCKED | Demo requires the incompatible native addon; no current runtime claim is permitted. |

Source-level test occurrence counts and historical logs are inventory, not pass evidence. The current worktree therefore has a verified static baseline and an explicitly blocked runtime baseline.

## 10. Claim contradictions and stale authority

| Conflict | Evidence | Holding decision |
|---|---|---|
| README says “lie detector” and anyone can verify true/false, then says the system does not prove scientific truth. | `README.md:3-11,115-122` | The latter limitation governs; marketing language must be retired. |
| README says cross-language/browser hashes are byte-identical, while proof code says ProofEnvelope is TypeScript self-consistency and browser verifier is unwired. | `README.md:99-111,294-306`; `src/proof_envelope/proof_hash.ts:4-18` | Only separately demonstrated algorithms/languages may be claimed. |
| Detector totals are 20 and 21 in one README; project contract says 22. | `README.md:261,315-317`; root `AGENTS.md` | Count is disputed until one versioned registry/taxonomy and runtime wiring gate define it. |
| README declares supported platforms, while repository human-actions list cross-platform validation as pending and current WSL binary fails. | `README.md:205-215`; `.far-design/HUMAN_ACTIONS.md:22-26`; RUN-0002 | Platform support remains unverified. |
| Progress and roadmap disagree on completion. | `PROGRESS.md`; `DEVELOPMENT_ROADMAP.yaml`; EC-002 | Neither is current capability authority. |
| Version metadata says 1.0.0 while README calls the API pre-1.0 and release publication pending. | `package.json`; `README.md:20-29,294-306` | Release maturity is unresolved; no stable-release claim. |

## 11. Top failure points, root causes and effect

| Rank | Surface | Same-class issue | Root cause | User/judge effect | Better target |
|---:|---|---|---|---|---|
| 1 | Scientific verdict wording exceeds evidence mode. | Fixture and literature-label outputs share verdict vocabulary with measured FEC results. | Provenance/integrity and scientific validity are conflated. | Reproducibly wrong or overstated conclusions appear authoritative. | Typed evidence modes; calibrated domain policy; human decision and refusal. |
| 2 | Keyless self-verification is framed as independent proof. | Optional integrity file, code omitted, one-language envelope recomputation. | Trust properties are bundled under “proof.” | A judge may correctly reject authenticity and independent-replay claims. | Portable verification receipt with explicit verification policy and trust-time context, required manifest, external signature/transparency anchors. |
| 3 | Authentication does not become authorization. | No tenant/resource ownership; Web cannot authenticate. | Demo-first API surface lacks institutional domain model. | Data exposure or unauthorized high-risk actions in shared deployment. | Local-first single-user scope first; deny multi-user until policy-enforced RBAC/ABAC and tenancy exist. |
| 4 | No real-user/procedural closure. | Appeal, correction, deletion, handoff and support are absent from Web/API. | Features were optimized around a competition demo, not a service lifecycle. | A high-stakes assessment cannot be safely contested or operated. | Evidence review workflow with human decision, appeal and export/exit. |
| 5 | Release/operation evidence is weaker than repository volume suggests. | Dirty snapshot, nondeterministic tracked artifacts, placeholder owners, blocked runtime. | Evidence accumulation and delivery authority are fragmented. | Review cost rises while confidence does not; failures are hard to attribute. | One candidate commit, reproducible clean-room gate, named ownership and compact evidence index. |

## 12. Repository-map acceptance and residual unknowns

This map is accepted for S2/S3 because it includes physical, logical, runtime and organizational views; two end-to-end traces; source-located trust boundaries; maturity levels; counterevidence; and explicit execution limits. It does not certify current tests or deployment.

Still unknown:

- which current staged/unstaged snapshot is the intended submission;
- whether a clean supported environment passes full tests and demos;
- whether any external user has adopted the workflow;
- domain-specific error rates and inter-reviewer agreement;
- external repository settings, live release state and any untracked operating process;
- whether the fixture-to-verdict semantic mapping is intentionally the long-term product contract.
