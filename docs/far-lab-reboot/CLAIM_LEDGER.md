---
status: reviewed
owner_role: claim-and-evidence-owner
last_verified: 2026-08-05
scope: allowed, prohibited, provisional, and falsifiable project claims
authoritative_for: [claim status and public-claim permission]
evidence_level: mixed
related_decisions: [DEC-001, DEC-002, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016]
related_requirements: [REQ-PROD-001]
supersedes: []
superseded_by: null
---

# FAR-Lab claim ledger

| Field | Value |
|---|---|
| Status | `ACTIVE_AUTHORITY` |
| Owner | Audit lead; future claim owner must be assigned per row |
| Evidence level | A–E recorded per claim |
| Last verified | 2026-08-05 |
| Authority | Controls what this reboot may recommend saying publicly; does not alter current product copy |

Status vocabulary: `SUPPORTED`, `NARROW_SUPPORTED`, `CONTRADICTED`, `UNVERIFIED`, `BLOCKED`, `RETIRED`. “Allow” means permitted only with the exact bounded wording.

| ID | Observed or candidate claim | Evidence | Counterevidence / missing proof | Level | Status | Public-claim decision |
|---|---|---|---|---|---|---|
| CLM-001 | FAR-Lab has a deterministic five-value R0–R9 rule kernel. | `src/falsifiability/verdict_kernel_v2.ts`; repository tests | Current runtime suite blocked; scientific rule validity separate | A | NARROW_SUPPORTED | Allow: “deterministic rule execution for versioned inputs.” |
| CLM-002 | FAR-Lab proves scientific truth or verifies a claim true/false. | `README.md:3-6` says so | `README.md:115-122`; fixture benchmark; no external oracle/calibration | A conflict | CONTRADICTED | Retire “lie detector,” “truth,” and universal true/false wording. |
| CLM-003 | Determinism makes a verdict scientifically correct. | Kernel reproducibility | Deterministic policies can encode invalid thresholds, labels or scope | D | CONTRADICTED | Prohibit; say correctness depends on evidence and policy validity. |
| CLM-004 | The evidence log is append-oriented and detects ordinary chain corruption. | `schema/migrations/0001_initial.sql:48-58,85-95`; verifier source | DB-local controls can be bypassed by privileged actors; old payload coverage varies | A | NARROW_SUPPORTED | Allow with threat boundary. |
| CLM-005 | Keyless hashes prove artifact authenticity/nonrepudiation. | Hash chain and proofHash exist | README admits consistent rehash forgery; no signer/transparency anchor | A | CONTRADICTED | Prohibit. |
| CLM-006 | `.far-proof` is V1 self-verifiable under project rules. | `src/far_proof/bundle_verifier.ts:1-7,108-249` | Optional integrity manifest; same-codebase verifier; code not embedded | A | NARROW_SUPPORTED | Allow: “project-format self-consistency verification.” |
| CLM-007 | `.far-proof` is independently recomputable by a third party. | Export contains ledgers/envelopes | TS code explicitly says Python envelope mirror is future; replay needs repo/dependencies | A | CONTRADICTED | Retire until clean-room independent implementation and archival inputs pass. |
| CLM-008 | `.far-proof` is a third-party-certified RO-Crate/PROV/OTel package. | Files are emitted | Exporter/verifier explicitly disclaim third-party validation | A | CONTRADICTED | Prohibit; describe formats as minimal projections only. |
| CLM-009 | Full verification detects modification of every exported component. | Optional `integrity.json` can hash components | Integrity file is absent from required-file list and only checked if present | A | CONTRADICTED | Prohibit until integrity manifest is mandatory and downgrade-resistant. |
| CLM-010 | Export is self-contained for archival replay. | Replay instructions exist | Code is not copied; Git checkout and installs required | A | CONTRADICTED | Prohibit; say “reference-based replay recipe.” |
| CLM-011 | Benchmark exercises 30 fixture cases, 28 domain labels and five verdict outcomes. | `benchmark/benchmark_report.json:1-29,748-773` | Current generator not executed this round | A artifact | NARROW_SUPPORTED | Allow as fixture branch/dimension coverage, dated and pinned. |
| CLM-012 | Benchmark validates scientific performance across 28 domains. | Domain names exist | All oracle reviews unreviewed; all models offline fixtures; null commit | A | CONTRADICTED | Prohibit. |
| CLM-013 | Benchmark measures accuracy or ranking quality. | Verdicts are present | No ground truth, confusion matrix, calibration, hidden set, baseline or expert adjudication | A/D | CONTRADICTED | Prohibit. |
| CLM-014 | Current TypeScript typecheck and lint pass. | RUN-0001 | Does not cover runtime/test/frontend/Python | A | SUPPORTED | Allow with command/date/snapshot. |
| CLM-015 | Current full test suite passes. | Historical PROGRESS/log claims | Full current run blocked by write boundary and incompatible installed binaries | A conflict | BLOCKED | Do not claim for current worktree. |
| CLM-016 | Offline demo currently runs in this workspace. | README examples | WSL native probe fails `invalid ELF header`; demo not run | A | BLOCKED | Do not claim for current worktree. |
| CLM-017 | macOS/Linux/WSL and Windows are fully supported. | `README.md:205-215` | Cross-platform validation listed pending; current WSL dependency state fails | A | UNVERIFIED | Prohibit “fully supported”; publish only tested matrix. |
| CLM-018 | Package/release is stable v1.0.0. | `package.json` version | README says pre-1.0/API may change and first release pending | A conflict | CONTRADICTED | Use “unreleased development snapshot” until a release authority resolves it. |
| CLM-019 | API supports optional JWT authentication. | `src/api/server.ts:92-112`; middleware | No current runtime proof | A | NARROW_SUPPORTED | Allow as implemented middleware, not deployment security. |
| CLM-020 | API enforces resource authorization and roles. | Principal carries roles | No route reads principal; schema lacks resource ownership/tenant | A | CONTRADICTED | Prohibit. |
| CLM-021 | Web works against protected API mode. | Web API client exists | No Authorization/token flow in client | A | CONTRADICTED | Prohibit. |
| CLM-022 | Protected actions are permission-controlled. | Deterministic origin guard | Any `cli_user`/`api_user` allowed; no role/resource/approval; manifest is descriptive | A | CONTRADICTED | Describe only origin-class guard; do not call it authorization/sandbox. |
| CLM-023 | Scheduler avoids shell injection. | Source comment says no shell concatenation | Implementation sets `shell: true` on stored string | A | CONTRADICTED | Retire and gate scheduler from release. |
| CLM-024 | Long HTTP tasks have durable progress/cancel/retry. | `/hypothesize` executes loop | Synchronous endpoint; no job resource/idempotency/cancel contract | A | CONTRADICTED | Prohibit. |
| CLM-025 | The service supports correction/retraction lifecycle. | CLI/migration/bundle lifecycle records | No Web/API case, notification, appeal, authorization or retention workflow | A | NARROW_SUPPORTED | Allow only for local ledger transition mechanics. |
| CLM-026 | Human/external evaluation modes are implemented. | Grader functions/types exist | Both functions return score-zero placeholders pending external update | A | CONTRADICTED | Call them unintegrated extension points. |
| CLM-027 | Raw request/evidence storage is privacy-ready. | Persistence exists | Plaintext payloads; no classification, tenant, retention, erasure/legal-hold design | A | CONTRADICTED | Prohibit institutional privacy claims. |
| CLM-028 | Project has operational security response and maintainership. | Governance and security prose | Placeholder email/owners; bus factor one | A | UNVERIFIED | Do not promise SLA until channel and rota are exercised. |
| CLM-029 | README comparison proves competitor absence or FAR-Lab leadership. | Comparative table | No dated primary-source protocol; blanket crosses are unsubstantiated | A/D | CONTRADICTED | Retire; replace with task-level benchmark/gap matrix. |
| CLM-030 | Anti-theater detector count is settled and production-wired. | README/root contract cite 20/21/22 | Internal contradiction; README says production-path wiring pending | A | CONTRADICTED | No count claim until registry, version and runtime coverage are authoritative. |
| CLM-031 | FAR-Lab's defensible core is a bounded verification receipt and policy-conformance engine. | Kernel, FEC, ledger, export assets | User demand, interoperability and independent validation absent | D/E | UNVERIFIED | Candidate pivot hypothesis; validate before market claim. |
| CLM-032 | The reboot design guarantees that future code will be world-class or match/exceed named open-source projects. | Broad design and benchmark documents now exist | No immutable target implementation; 0/15 parity dimensions proven; no same-condition comparison | D | CONTRADICTED | Prohibit. Allowed: “The design defines a plausible, falsifiable path to scoped parity.” |
| CLM-033 | Same seed or a frozen tolerance means a scientific execution was reproduced. | Seeded primitives and `toleranceFrozen` fixture exist | PRNG state/calls, environment, comparison rule and threshold outcome are not fully bound | A/D | CONTRADICTED | Require N0–N4 `numericalEquivalenceProfile` and divergence; separate numeric, inferential and scientific results. |
| CLM-034 | A selectively disclosed package preserves full-receipt integrity and privacy because hidden values are hashed. | Content addressing/Merkle mechanisms can prove inclusion | Inclusion is not completeness; low-entropy/stable hashes and metadata can be guessed/correlated | B/D | CONTRADICTED | State derived disclosure root, omissions and exact verified subset; use approved privacy class. |
| CLM-035 | A receipt remains independently verifiable indefinitely once signed. | Signature/hash material can persist | Algorithms, keys, roots, time/revocation evidence, schemas, resolvers and runtimes can decay | B/D | UNVERIFIED | Only claim a tested preservation horizon/profile and historical/current/renewal status. |
| CLM-036 | The current reboot package is ready for disconnected implementation teams. | Broad target prose and traceability exist | 5 open design decisions, 13 missing machine authorities and observed state/profile/surface conflicts | D | BLOCKED | First close SPEC-001..012; current state is specification closure required. |
| CLM-037 | FAR-Lab can become a world-class domain-specific open-source verification system if every redesign gate is implemented. | Target architecture, TCK/parity plan and relevant assets | Feasibility, maintainership, user value, science, security and candidate evidence remain unknown | E | UNVERIFIED | Treat as program hypothesis, not external claim; falsify through doc 18/19 gates. |

## Claim-strength rule

No external statement may be stronger than the weakest necessary link among input provenance, method validity, execution evidence, policy version, independent verification, and operating evidence. Integrity claims must separately name: (1) internal consistency, (2) tamper evidence relative to an anchor, (3) authenticity/nonrepudiation, and (4) scientific validity. Passing one is never shorthand for passing the others.

## Evidence-upgrade protocol

Each `UNVERIFIED`, `BLOCKED`, or `CONTRADICTED` claim needs an owner, immutable candidate commit, predeclared test, raw output, failure threshold, and expiry date before status can improve. Author-written prose and same-implementation fixtures can locate a claim but cannot independently validate it.
