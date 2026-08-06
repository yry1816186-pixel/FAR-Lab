---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: v3 S0-S12 dependency graph, post-exit PX1 parity-closure extension, task state, recovery, and plan revisions
authoritative_for: [audit task state and dependencies]
evidence_level: A
related_decisions: [DEC-001, DEC-008]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# FAR-Lab reboot audit — task graph

Status vocabulary: `BACKLOG → READY → IN_PROGRESS → PRODUCED → VERIFIED`; exceptions are `BLOCKED`, `DEFERRED`, `REJECTED`, `CANCELLED`, and `SUPERSEDED`.

- Critical path: T-001 → T-002 → T-003 → T-004 → T-005 → T-006 → T-007 → T-008 → T-009 → T-010 → T-011 → T-012 → T-013 → T-014.
- Maximum parallelism: three read-only subagents plus one merge owner.
- Shared mutable resource: only the primary agent may write `docs/far-lab-reboot/**`.
- Completion: every critical node is `VERIFIED`, or the run ends `PARTIAL/BLOCKED` with explicit failed exits.

| Task | Stage | Goal / output | Dependencies | Evidence / acceptance | Owner | Status |
|---|---|---|---|---|---|---|
| T-001 | S0 | Lock root, rules, initial Git and package integrity. | — | Immutable snapshot; hashes; applicable governance. | Primary | VERIFIED |
| T-002 | S1 | Classify user changes, path boundaries and command permissions. | T-001 | No pre-existing path changed; permission matrix exists. | Primary | VERIFIED |
| T-003 | S2 | Physical/logical/runtime/organization repository map. | T-002 | Two vertical traces and source-located architecture map. | Primary + SA-01/02/03 | VERIFIED |
| T-004 | S3 | Claim/evidence/maturity baseline and conflicts. | T-003 | Evidence grades, run limits, top-five failure points. | Primary | VERIFIED |
| T-005 | S4 | Problem tree, alternatives and strategic verdict gate. | T-004 | Scored candidates, counterevidence, stop/pivot conditions. | Primary | VERIFIED |
| T-006 | S5 | Users, JTBD, service blueprint and product closure. | T-005 | Trigger-to-outcome contracts including appeal/deletion. | Primary | VERIFIED |
| T-007 | S6 | IA, Web, accessibility, CLI and API behavior contracts. | T-006 | Normal/empty/error/recovery states and acceptance. | Primary | VERIFIED |
| T-008 | S7 | Agent runtime, domain/data/evidence architecture. | T-007 | Shared core, trust boundaries, version/replay/permission specs. | Primary | VERIFIED |
| T-009 | S8 | Scientific validation, security/privacy, SRE/supply chain. | T-008 | Threat/science/failure models; SLO/DR/cost/accountability. | Primary | VERIFIED |
| T-010 | S9 | Quality gates, benchmark, roadmap and handoff backlog. | T-009 | Reproducible protocols and atomic implementation tasks. | Primary | VERIFIED |
| T-011 | S10 | Eight-view adversarial review. | T-010 | Each view supplies mandated vetoes/assumptions/experiment/rescue. | Primary + independent agents | VERIFIED |
| T-012 | S11 | Consolidation, authority map and bidirectional traceability. | T-011 | Link/term/ID/conflict checks; no duplicate authority. | Primary | VERIFIED |
| T-013 | S12 | Final coverage, Git boundary and exit verification. | T-012 | Coverage stats, raw Git path output, explicit residual gaps. | Primary | VERIFIED |
| T-014 | PX1 | Reopen the completed design for world-class-parity falsification, close second-order protocol/interface/distribution ambiguity, and revalidate. | T-013 | Independent gap passes; formal protocol, parity scorecard, reference slice, readiness-gap matrix; updated trace/risks/gates; full structural and Git-boundary recheck. | Primary + SA-04/05/06 | VERIFIED |

## Dependency semantics and recovery

| From | To | Type | Failure propagation | Parallelism |
|---|---|---|---|---|
| T-002 | T-003 | hard | Boundary failure blocks all repository work. | No |
| T-003 | T-004 | evidence | Missing runtime proof degrades claims to UNKNOWN/PARTIAL. | No |
| T-004 | T-005 | hard | Strategy cannot be selected without evidence baseline. | No |
| T-005 | T-006 | hard | Product closure follows only the selected strategy. | No |
| T-006 | T-007 | hard | Interfaces must derive from user/service contracts. | No |
| T-007 | T-008 | soft | Architecture may be explored, but not frozen early. | Limited |
| T-008 | T-009 | hard | Security/science/SRE depend on trust and data boundaries. | No |
| T-009 | T-010 | hard | Handoff gates must encode discovered risks. | No |
| T-010 | T-011 | evidence | Review can reject or reopen earlier specifications. | Yes, viewpoints only |
| T-011 | T-012 | hard | Consolidation incorporates review defects. | No |
| T-012 | T-013 | hard | Final verification requires authoritative documents. | No |
| T-013 | T-014 | evidence | A user-requested deeper redesign may reopen design completeness without inventing a v3 `S13` or changing the product implementation boundary. | Yes, read-only review passes |

## Plan revisions

| Revision | Date | Change | Trigger | Impact | Decision |
|---|---|---|---|---|---|
| R1 | 2026-08-05 | Full runtime baseline changed from mandatory execution to guarded probes. | Native/Python artifacts are Windows-built; test bootstrap can rebuild/install. | Runtime baseline is BLOCKED in this WSL workspace. | Apply current-user write prohibition; IC-001. |
| R2 | 2026-08-05 | Broad detection/truth-platform direction replaced by receipt protocol + local-first wedge. | Fixture-only science, self-verification limits, absent authorization/redress and no user evidence. | Showcase/platform surfaces lose priority; trust and workflow gates become critical path. | `PIVOT`; STRAT-0001. |
| R3 | 2026-08-05 | Agent/protocol breadth deferred and six assurance dimensions made orthogonal. | Current official benchmarks and provenance standards show permission/protocol/integrity do not imply sandbox or science. | MCP/ACP/A2A N/A in v0; agent off; provenance/integrity/identity/conformance/replay/science separated. | DEC-002/004/007. |
| R4 | 2026-08-05 | Eight-view adversarial vetoes retained as release and strategy gates. | Ten cross-review defects remained after target design. | PIVOT survives; current product/release remains BLOCKED. | `13_ADVERSARIAL_REVIEW.md`. |
| R5 | 2026-08-05 | Closed audit with evidence gaps rather than claiming runtime/product completion. | S12 structural checks passed and outside-scope Git hashes equal the initial baseline; empirical/runtime gates remain absent. | All audit tasks verified; product G3–G6 remain blocked. | `02_RUN_STATE_AND_METHOD.md`, `COVERAGE_MATRIX.md`. |
| R6 | 2026-08-05 | Reopened the completed design as post-exit extension `PX1`, not a new v3 state. | User asked whether further redesign remained and whether implementation could truly match world-class OSS; three independent reverse reviews found protocol, interface/distribution and parity-proof ambiguity. | Added specification-closure authorities and converted stronger comparative claims into falsifiable, candidate-bound gates; G2 became `BLOCKED_SPECIFICATION_CLOSURE`. | DEC-011..016; docs 17–19; `IMPLEMENTATION_READINESS_GAP_MATRIX.md`. |
| R7 | 2026-08-05 | Closed PX1 after independent final rereads and structural, semantic, count and Git-boundary validation. | Protocol/trust, surface/conformance and platform/parity reviewers found no remaining documentation-level blocker after reconciliation. | Design-extension work is verified; product behavior and all comparative parity claims remain unproven and gated. | T-014; CMD-015; `COVERAGE_MATRIX.md`; `18_WORLD_CLASS_PARITY_SCORECARD.md`. |
