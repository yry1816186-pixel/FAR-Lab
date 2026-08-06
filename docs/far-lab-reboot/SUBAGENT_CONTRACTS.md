---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: bounded read-only delegation objectives, evidence standards, stop rules, and verification
authoritative_for: [audit delegation contracts]
evidence_level: A
related_decisions: [DEC-008]
related_requirements: [REQ-GOV-002]
supersedes: []
superseded_by: null
---

# FAR-Lab reboot audit — read-only subagent contracts

All contracts inherit run `RUN-20260805-1705-reboot`. No subagent may write any file. The primary agent is the sole merge owner and must re-open critical sources before accepting a claim.

## SA-01 — trust kernel, data and science forensics

- TASK_ID: T-003-A
- SCOPE: `src/falsifiability`, `src/fec`, `src/evidence_log`, `src/far_proof`, `src/proof_envelope`, `src/statistics`, `src/science_harness`, related tests and schemas.
- OUT_OF_SCOPE: implementation, product recommendations beyond evidence implications, external research.
- INPUTS: module 01 rules; initial HEAD/dirty snapshot; v3 evidence taxonomy.
- ALLOWED_TOOLS: read-only `rg`, `sed`, `git log/show/diff`, static parsers.
- WRITE_PATHS: none.
- EXPECTED: architecture/data flow, maturity table, five highest-risk findings, precise path/symbol/line evidence, counterevidence and unknowns.
- EVIDENCE_STANDARD: repository facts A; inferences explicitly D; no README-only capability proof.
- BUDGET: one bounded pass; stop after major vertical paths and representative tests are traced.
- STOP: any write requirement, secret exposure, scope collision, or diminishing evidence value.

## SA-02 — Web, CLI and API experience forensics

- TASK_ID: T-003-B
- SCOPE: `frontend`, `src/cli`, `src/api`, interface schemas and related tests/docs.
- OUT_OF_SCOPE: edits, visual generation, runtime service startup, generic redesign without repo evidence.
- ALLOWED_TOOLS: read-only repository inspection.
- WRITE_PATHS: none.
- EXPECTED: route/command/API inventory; two vertical traces; accessibility/error/state gaps; evidence-located maturity findings.
- EVIDENCE_STANDARD/BUDGET/STOP: same as SA-01.

## Completion and primary verification

| Agent | Result | Files changed | Primary verification sample | Acceptance |
|---|---|---:|---|---|
| SA-01 trust/science | Completed; L3 overall, L4 internal kernel/ledger components; active FEC/proof/science bindings incomplete | 0 | Reopened `src/fec/orchestrator.ts:320-407`, `src/fec/compiler.ts:115-149,243-247`, `repro/science_harness/sandbox_runner.py:18-21,91-113,187-219` | Accepted with inference/unknown labels |
| SA-02 interfaces | Completed; L3 integrated prototype; run isolation and judge-facing proof wording are critical defects | 0 | Reopened `src/report/types.ts:20-29`, `src/report/generator.ts:64-123,172-208`, `src/api/internal/hypothesis_helpers.ts:19-44` | Accepted; concurrency outcome remains unexecuted inference |
| SA-03 platform/quality | Completed; core tests/controls substantial but release/deployment/SRE/governance mostly L2–L3 | 0 | Reopened `Dockerfile:23-35`, `.dockerignore:1-25`, `docker-compose.yml:1-27`, `src/cli/commands/api.ts:81-94`, `.github/workflows/release.yml:84-178` | Accepted; live GitHub/release state remains unknown |

Delegation met the bounded objective, no task was re-delegated, and all subagents stopped without repository writes.

## SA-03 — quality, security, platform and governance forensics

- TASK_ID: T-003-C
- SCOPE: tests, scripts, workflows, package metadata, deployment/observability/security/governance docs and recent Git history.
- OUT_OF_SCOPE: running installers/builds/services; editing any file; secrets.
- ALLOWED_TOOLS: read-only repository and Git inspection.
- WRITE_PATHS: none.
- EXPECTED: test/CI/release/SRE/supply-chain/governance map; contradiction and maturity evidence; top risks.
- EVIDENCE_STANDARD/BUDGET/STOP: same as SA-01.

## PX1 reverse and consistency review contracts

The same three read-only workers received new, bounded contracts after S12. These are new tasks, not a reinterpretation of SA-01–03.

### SA-04 — protocol, reproducibility and trust longevity

- TASK_ID: T-014-A.
- SCOPE: target receipt semantics plus current canonicalization, numeric/randomness, disclosure, external-reference, trust-time/rotation, preservation and verifier-independence evidence.
- EXPECTED: falsify implementability; identify unspecified edge semantics and common-mode proof risks; return source-located facts, inferences, decisions and required vectors.
- BUDGET/STOP: one reverse-review pass plus one final consistency reread; no runtime, network or writes; stop when every material family maps to a gap or an existing authority.

### SA-05 — surface, workflow and conformance integration

- TASK_ID: T-014-B.
- SCOPE: first-success, states, qualified types, operation/CLI/API/Web maps, viewer, distribution, diagnostics, support, documentation and accessibility.
- EXPECTED: find cross-document contracts that independently implemented teams would interpret differently; return exact path/line evidence and a canonicalization recommendation.
- BUDGET/STOP: one reverse-review pass plus one final terminology/operation reread; no design-file edits, mocks or implementation.

### SA-06 — platform quality and world-class claim proof

- TASK_ID: T-014-C.
- SCOPE: benchmark dimensions, candidate qualification, release/platform/security/science/community evidence, comparison statistics and Git boundary.
- EXPECTED: define what would falsifiably support parity/superiority; count current/designed/proven dimensions; independently validate matrices and boundary hashes.
- BUDGET/STOP: one parity pass plus one final count/boundary reread; documentary comparison is never promoted to executed parity.

## PX1 completion and primary verification

| Agent | Result | Files changed | Primary verification sample | Acceptance |
|---|---|---:|---|---|
| SA-04 protocol/trust | Completed; numeric/randomness/canonicalization/disclosure/reference/time/rotation/preservation/independence gaps converted into exact decisions, schemas and vectors | 0 | Reopened docs 17/19, current hash/randomness sources and IRG-001–012; reran core-ID/table/frontmatter closure | Accepted; 5 IRG `OPEN_DECISION` rows, 7 mapped protocol items and machine authorities remain open |
| SA-05 surfaces | Completed; state/profile/operation/viewer/distribution conflicts reconciled at prose level and legacy mappings made fail-closed | 0 | Reopened docs 05/09/19, interface crosswalk and IRG-013–024; reran forbidden-term/operation scans | Accepted as `SPECIFIED_UNAPPROVED`, not machine contract |
| SA-06 parity/platform | Completed; 15-dimension evidence ladder and fair non-inferiority/superiority protocol audited; Git boundary independently rehashed | 0 | Reopened docs 18/19, matrices and run ledgers; counted 15/0 `PROVEN` and 57 allowed paths | Accepted; product and parity remain unproven |

Across both rounds, subagents performed six bounded task passes and no writes. The primary agent applied every documentation change with `apply_patch`, reopened each affected authority and retained dissent as readiness gaps rather than silently accepting recommendations.
