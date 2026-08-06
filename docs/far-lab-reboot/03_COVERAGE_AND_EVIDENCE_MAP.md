---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: navigation and synthesis for coverage, evidence strength, conflicts, unknowns, and blockers
authoritative_for:
  - evidence-map summary
  - coverage interpretation
evidence_level: mixed
related_decisions: [DEC-001, DEC-008, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# 03 — Coverage and evidence map

## 1. Coverage result

All 14 required axes are explicitly accounted for; no axis is silently `UNKNOWN`. Audit/design status is **11 COVERED, 2 PARTIAL, 1 BLOCKED**:

- `PARTIAL`: roles/demand and scientific evidence, because repository inspection cannot create users, expert labels or empirical validity.
- `BLOCKED`: operational stages, because full tests/demo could write/rebuild outside the exclusive scope and current native/Python dependencies are cross-platform incompatible.
- `COVERED` means evidence + target specification + acceptance/stop + owner exist; it does **not** mean implemented or passed.

The cell-level authority, counts and N/A decisions are in `COVERAGE_MATRIX.md`. Requirements-to-release chains are in `TRACEABILITY_MATRIX.md`.

## 2. Evidence map

| Evidence family | Grade | Supports | Does not support | Authority |
|---|---|---|---|---|
| Repository boundary/Git snapshot | A | Exact root/HEAD/branch/dirty paths and audit attribution | Semantic coherence/authorship of pre-existing work | REPO-0001/0002, `INITIAL_GIT_BASELINE.md` |
| v3 package hashes | A | Modular master/modules/templates usable and hash-matched | Complete package claim because declared root README differs | REPO-0003, EC-001 |
| Static run | A | Typecheck/lint pass on observed tree | Runtime, test, frontend, science, packaging or release quality | RUN-0001 |
| Guarded runtime probes | A | Current WSL native Node/Python incompatibility and why full run is blocked | Failure on a clean supported Windows/Linux candidate | RUN-0002/0003 |
| Trust/proof code | A | V1 self-consistency, optional manifest, referenced code and explicit certification limits | Authenticity, independent implementation, self-contained reproduction or science | TRUST-0001 |
| Science/FEC/benchmark code/artifacts | A | Fixture breadth, deterministic paths, weak source/plan/deviation binding | Reviewed oracle, cross-domain validity, calibration or real execution | SCI-0001/0002 |
| API/data/security/platform code | A | Global/latest/run-scope, shell, sandbox, container/release/governance defects | Exploit occurrence or behavior in an unrun clean candidate | API/SEC/OPS/QUAL/GOV evidence |
| Historical docs/progress/roadmap | A as statements | What repository claimed/planned at times | Current capability or one authority because files conflict | DOC-0002, EC-002 |
| Official external projects/protocols | B | Dated documentary patterns, versions, explicit security/lifecycle limits | Same-condition quality comparison or FAR-Lab superiority | BENCH-0001..0003, PROTO-0001 |
| Official science/provenance/supply-chain standards | B | Interchange/attestation/build patterns and their stated limits | Scientific truth, source honesty or product compliance | STD-0001/0002 |
| Strategy synthesis | D | Evidence-based need to pivot and falsifiable target | Market demand, payer, adoption or product success | STRAT-0001, HYP-001..012 |

## 3. Claim strength and conflicts

| Conflict | Support | Counterevidence | Resolution |
|---|---|---|---|
| v3 package is complete | Manifest quality statement | Root README hash/size/line mismatch | Core usable; completeness `PARTIAL`; no monolithic fallback loaded |
| Five roadmap phases complete | `PROGRESS.md` | `DEVELOPMENT_ROADMAP.yaml` marks phases pending/stale failures | Historical/disputed; code/run evidence governs |
| Truth/lie detector | README headline | README limitation sections + fixture science | Retire claim; bounded receipt only |
| Independent proof | export/verify naming | Same-stack V1, optional manifest, code omitted, rehash threat | Call self-consistency; require V2 + external trust + independent verifier |
| Sandboxed execution | runner naming/metadata | No OS network/resource isolation | Trusted local subprocess only; Profile L restriction |
| Platform/production ready | many routes/tests/workflows | run isolation/authz/release/SRE/governance gaps | Not release-ready; G3–G6 blocked |

`CLAIM_LEDGER.md` owns public claim status; `EVIDENCE_LEDGER.md` owns proposition/source/limitation; `INSTRUCTION_CONFLICTS.md` owns execution-rule conflicts.

## 4. Highest-risk unknowns

| Unknown | Why it matters | Conservative default | Owner / unlock |
|---|---|---|---|
| Real author/reviewer demand and payer | Determines whether a product exists | No scale implementation or business claim | Product research; UR-01/05 |
| First scientific profile fit and error cost | Determines whether any bounded science verdict is defensible | Structure/refusal only | Science; UR-03 + locked study |
| Clean-room receipt independence | Core product promise | Do not say independent/authentic | Trust; UR-04 and two implementations |
| Current clean runtime/release | Determines whether code works as one candidate | Static pass only; no current release claim | Release; WP-00/G3 |
| User comprehension/automation bias | Determines harm of labels/badges | Six explicit dimensions; conservative copy | UX/science/legal; UR-02 |
| Privacy/legal/ethics applicability | Determines allowed data/use | Non-sensitive local demo only | Privacy/legal; DPIA/jurisdiction review |
| Maintainers/support/funding | Determines safe external operation | No SLA/stable/institution deployment | Governance; two people + exercises/commitments |
| Protocol/agent need | Avoids speculative platform work | MCP/ACP/A2A N/A; agent/skills deferred | Architecture/product; pilot blocker |

Full owner/deadline/default fields live in `OPEN_QUESTIONS.md` and `HYPOTHESIS_REGISTER.md`.

## 5. Blocking evidence gaps

1. Full authoritative test/demo/package run on one clean supported candidate.
2. Mandatory Receipt V2, external identity/attestation and independently implemented offline verifier.
3. Run-scoped storage, durable tasks/idempotency, object authorization and migration/restore evidence.
4. OS-isolated hostile execution with egress/resource/file/process enforcement.
5. Real expert-reviewed data/profile with preregistration, calibration, abstention, error and independent reproduction.
6. Real author–reviewer repeat workflow, challenge/correction and comprehension evidence.
7. Privacy lifecycle, legal basis, incident/security contact and procedural-rights operation.
8. Immutable reproducible release, verified installer/artifacts, live settings, restore and incident drills.
9. Accessibility across core tasks with disabled participants.
10. Second maintainer, decision rights, succession, support and funding.
11. Approved state/profile/operation schemas, Receipt V2 numeric/disclosure/time/crypto/viewer TCK and clean-room independence charter.
12. Candidate-bound install/upgrade/uninstall-preserve/purge, first-success/docs/support and telemetry semantic evidence.
13. Same-condition independent parity evidence; design quality cannot close a comparative claim.

These gaps remain blockers after the design is complete; documentation cannot close them.

## 6. Quantitative inventory

| Artifact | Count | Interpretation |
|---|---:|---|
| Required coverage axes | 14/14 accounted | 11 covered, 2 partial, 1 blocked; not readiness |
| Target requirements | 45 | Each appears in at least one TR chain |
| End-to-end trace chains | 20 | 0 currently implemented-and-release-verified |
| Canonical operations | 43 | 43/43 referenced by journey and interface crosswalk; machine authority absent |
| Target interfaces | 36 + 1 current summary | Required/conditional/deferred/N/A explicit |
| Failure scenarios | 27 | Target test contracts, not executed results |
| Permission rows | 34 | Local/institution/agent/service decisions explicit |
| Agent modes | 5 | All optional/unvalidated; default off |
| Tools/extensions | 17 | Required/conditional/deferred/N/A with trust controls |
| Benchmark gaps | 25 | P0 11, P1 8, P2 3, P3 3; achieved exceed = 0 |
| Quality attributes | 22 | Includes protocol/disclosure/longevity/first-success/parity gates |
| Risks | 29 | Release blockers/conditions with owners and exits |
| Adversarial dispositions | 10 | All accepted as gates; none waived |
| Implementation-readiness gaps | 30 | P0 23, P1 6, P2 1; closed = 0 |
| World-class parity dimensions | 15 | `PROVEN` = 0; overall claim prohibited |
