---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: final audit method, state-machine execution, command boundaries, delegation, limitations, and recovery
authoritative_for:
  - audit method
  - module loading record
  - state-machine exit record
evidence_level: A
related_decisions: [DEC-008]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# 02 — Run state and method

## 1. Run identity and boundary

| Field | Value |
|---|---|
| Run ID | `RUN-20260805-1705-reboot` |
| Date/timezone | 2026-08-05 / Asia/Shanghai |
| Repository | `/mnt/c/users/richardyuan/desktop/far-lab` |
| Branch / HEAD | `design/s0-safe-boot` / `a6edceb243796acce45e45b5dd1d21a7db6cb803` |
| Initial workspace | 253 porcelain entries; 189 unstaged paths; 13 staged paths; 82 untracked paths |
| Allowed write scope | `docs/far-lab-reboot/**` only |
| Mode | `FORENSIC_AUDIT_AND_COMPREHENSIVE_PROJECT_DESIGN_ONLY` |
| Product implementation | Forbidden and not performed |
| Current protocol stage | `S12 EXIT_VERIFIED`; post-v3 `PX1 EXIT_VERIFIED` |
| Current run status | `COMPLETE_WITH_EVIDENCE_GAPS` |

Raw initial paths and diffs are preserved verbatim in `INITIAL_GIT_BASELINE.md`. The initial outside-scope NUL-porcelain digest is `6bf8e6d38635ee9397606a6aa00b65036a411fdacddb2efccbe2121e734b2a99`; every batch check through PX1 matched it. `RUN_STATE.md` and `TASK_GRAPH.md` are the atomic recovery ledgers; this document is the final readable method record.

## 2. Applicable instructions and conflict resolution

The Git root contains one applicable root `AGENTS.md`; no more specific applicable `AGENTS.md` was found for the permitted documentation path. The current user explicitly prohibited writes outside the audit directory. That restriction overrode the root instruction to run potentially write-capable tests/demo first.

The safe response was not to ignore the baseline but to:

1. run side-effect-reviewed static typecheck/lint;
2. probe existing native/Python runtime read-only;
3. inspect test/demo scripts before execution;
4. mark full tests/demo `BLOCKED` because bootstrap could rebuild/install and the installed binaries are wrong-platform;
5. preserve the conflict in `INSTRUCTION_CONFLICTS.md` IC-001 and avoid any dependency/environment repair.

Other conflicts: v3 manifest README mismatch (IC/EC-001); contradictory PROGRESS/roadmap completion authority (EC-002); historical instructions/prose treated as evidence, not executable commands; repository `PROGRESS.md` not updated because it is outside the user-authorized write path.

## 3. v3 package and progressive loading

Package verification compared SHA-256, size and line inventory. The modular master prompt, monolithic fallback, optimization audit, 12 declared module files and eight templates matched their manifest entries; the manifest-declared root README did not. The package was therefore usable but not completely matching.

Execution used **only the modular path**:

- `PACKAGE_MANIFEST.md`;
- `FAR-LAB_MASTER_PROMPT_V3.md`;
- `V3_OPTIMIZATION_AUDIT.md`;
- `modules/MODULE_MANIFEST.md`;
- modules `modules/01_EXECUTION_AND_REPOSITORY_FORENSICS.md` through `modules/10_TOP_AGENT_BENCHMARK_PROTOCOL.md`, plus decision-relevant `modules/20_V2_DOMAIN_COVERAGE_BASELINE.md` sections;
- all eight templates in `templates/`.

`FAR-LAB_MASTER_PROMPT_V3_MONOLITHIC.md` was intentionally **not loaded**, because modular files were present and valid. Modules were loaded by stage rather than simultaneously; this respects the progressive-loading and compatibility-fallback rule.

## 4. Evidence method

1. **Boundary:** root/rules/Git topology, ignored/generated/nested/symlink/LFS and write-side-effect classification.
2. **Repository forensics:** physical/logical/runtime/organizational map plus two vertical traces—claim→verdict and ledger→portable verification.
3. **Claim audit:** each important statement classified FACT, RUN OBSERVATION, INFERENCE, HYPOTHESIS, RECOMMENDATION or UNKNOWN and linked to path/symbol/line/command evidence.
4. **Five-layer review:** surface failure, same-class search, root cause, user/judge impact, alternative design.
5. **Strategy gate:** candidate scoring, sensitivity, counterfactuals, retain/retire/pivot/stop and falsifiable demand/science gates.
6. **Service/product closure:** roles, JTBD, blueprint, domain states, failure/recovery, procedural rights and exit.
7. **Architecture/specification:** interface, agent, tool, data/evidence/science, threat/privacy, SRE/cost/supply chain, quality/release and implementation handoff.
8. **External benchmark:** current official repositories/docs/releases/specifications/security policies only; documentary observations never treated as executed parity.
9. **Adversarial review:** eight veto perspectives, each with three defects, three assumptions, omission, experiment, rescue and conclusion; dispositions fed back as gates.
10. **Consolidation:** one authority map, 14-axis coverage and bidirectional traceability; no duplicate authority intended.

Evidence grades: A repository/run/original artifact; B official standard/project primary source; C credible independent evidence; D inference; E hypothesis. No C-grade secondary evidence was needed for core conclusions. Web queries are dated 2026-08-05; “latest” is not timeless.

## 5. Commands and side effects

| Evidence action | Result | Side-effect conclusion |
|---|---|---|
| Git root/status/diff/log/show/hash/topology reads | Exit 0; initial baseline recorded | Read-only |
| v3 package SHA/size/line audit | Core files match; root README mismatch | Read-only |
| `pnpm run typecheck && pnpm run lint` | Exit 0 | No generated diff/cache observed |
| Existing `better-sqlite3` in-memory load | Exit 1, `invalid ELF header` | No write/rebuild |
| Existing Python dependency import | Exit 1, Windows NumPy path/API incompatibility | No install/write |
| Full tests/demo/build/package/service/container/migration | Not run | Denied/skipped because write boundary/runtime condition |
| `rg`/`sed`/Git/static parsers/counts/link checks | Read-only evidence | No product change |
| Official web source queries | Current benchmark/standard evidence with gaps | No repository product write |
| Documentation creation | `apply_patch` only | Confined to allowed audit directory |

The complete command/query ledger is `COMMAND_LOG.md`. No `.env` content, secret/token/key, external account state or protected user research data was read.

## 6. Delegation and verification

Three bounded read-only subagents independently covered trust/data/science, Web/CLI/API experience, and platform/quality/competitors. They completed an initial repository-forensics round and a PX1 reverse/consistency-review round—six bounded passes in total. Each contract declared objective, scope, evidence standard, no-write rule and stop condition (`SUBAGENT_CONTRACTS.md`). They changed no files. The primary agent re-opened critical sources, reconciled conflicts and exclusively wrote the documentation.

External benchmark evidence covers OpenCode, pi, Hermes, Claude Code, Codex CLI, Aider, Cline, Roo, OpenHands, SWE/mini-SWE, Goose, Continue, OpenClaw, Scientific Agent Skills, PaperQA2/AstaBench and MCP/ACP/A2A/Agent Skills, plus research/provenance/supply-chain standards. Exact versions and limitations live in `16_COMPETITIVE_BENCHMARK.md`.

The OpenAI documentation skill governed source selection for current Codex facts. Its local manual helper was deliberately skipped because it could write outside the exclusive audit path; official OpenAI Web sources were used instead. This affected benchmark sourcing only, not product design authority.

## 7. State-machine execution

| State | Exit evidence | Status |
|---|---|---|
| S0 SAFE_BOOT | Root/rules/Git baseline/package integrity/run ledgers | VERIFIED |
| S1 REPOSITORY_BOUNDARY | User changes protected; command/write policy; topology | VERIFIED |
| S2 REPOSITORY_FORENSICS | Physical/logical map and two vertical traces | VERIFIED |
| S3 CLAIM_AND_MATURITY_AUDIT | Claim/evidence/risk ledgers and runtime limits | VERIFIED |
| S4 STRATEGIC_JUDGMENT | Candidate score/sensitivity/counterfactual; PIVOT | VERIFIED |
| S5 USERS_SERVICE_PRODUCT | Roles/JTBD/research/blueprint/product/domain | VERIFIED as design; user evidence PARTIAL |
| S6 INTERFACE_EXPERIENCE | IA/Web/CLI/API/all states/accessibility | VERIFIED as target specification |
| S7 ARCHITECTURE_AGENT_DATA | Core/deployment/state/data/agent/tool/protocol | VERIFIED as target specification |
| S8 SCIENCE_SECURITY_PLATFORM | Scientific protocol/threat/privacy/SRE/cost/supply chain | VERIFIED as target; empirical/runtime evidence gaps retained |
| S9 QUALITY_BENCHMARK_HANDOFF | Quality gates, current benchmark, roadmap, governance drafts | VERIFIED as handoff specification |
| S10 ADVERSARIAL_REVIEW | Eight mandated perspectives and ten dispositions | VERIFIED; vetoes retained |
| S11 CONSOLIDATION | Core authority set, coverage and traceability | VERIFIED |
| S12 FINAL_VALIDATION | Metadata/link/heading/table/ID/count/path and final report evidence | VERIFIED |
| PX1 POST-EXIT PARITY CLOSURE | Formal protocol, parity proof, canonical vertical slice, readiness gaps and repeated structural/boundary review | VERIFIED as design extension; product/parity remain unproven |

## 8. Limitations

- No full current test/demo/runtime/package result; no implementation/release behavior was changed or verified.
- Dirty snapshot may combine user changes from different intended revisions.
- No actual users, scientific experts, institutions, disabled participants, security red team, independent verifier team or legal reviewer supplied evidence.
- External systems were compared from official documentary sources, not installed under a fair task protocol.
- Branch protection, remote CI state, vulnerability feeds, identity/key systems, production telemetry and deployment state were not available.
- Structural documentation validation cannot establish semantic correctness beyond the recorded evidence and adversarial review.

## 9. Final validation evidence

| Check | Result |
|---|---|
| Documentation inventory | 57 Markdown files; 8248 lines and 867459 bytes at the final validated snapshot |
| Metadata | 0 missing required metadata fields; 54 reviewed documents and 3 intentionally draft governance proposals |
| Markdown structure | 0 table column mismatches; 0 duplicate hierarchical headings; 0 broken local Markdown links |
| Trace integrity | 45 requirements/20 unique chains; 0 requirement orphans; 29 risks/0 trace orphans; 0 evidence-reference orphans; 0 duplicate core definitions |
| Inventory counts | 43 canonical operations, 36 target interfaces + 1 current snapshot, 27 failure scenarios, 34 permission rows, 22 quality attributes, 5 optional agent modes, 17 tools/extensions, 25 benchmark gaps, 30 readiness gaps, 15 parity dimensions/0 proven |
| Benchmark gap priorities | P0 11, P1 8, P2 3, P3 3; demonstrated exceed outcomes 0 |
| Outside-scope Git status | SHA-256 `6bf8e6d38635ee9397606a6aa00b65036a411fdacddb2efccbe2121e734b2a99`, exactly initial |
| Unstaged/staged path lists | SHA-256 `594a27a8ed69c1f1d337fc34594daeb324e15d864d34e64198fd57cb241724f2` / `756ea0fc45564036409678152658571cf6718ddbcbf26ad6a2390b682215daa9`, exactly initial |
| Audit paths | 57 new files, all under `docs/far-lab-reboot/**`; Git summarizes them as `?? docs/far-lab-reboot/` |

The final checkpoint patch changes only text within the same 57-file audit set; the path set and outside-scope hashes remain unchanged and are rechecked after this table.

## 10. Recovery

Read `RUN_STATE.md`, `TASK_GRAPH.md`, `INITIAL_GIT_BASELINE.md`, `INSTRUCTION_CONFLICTS.md`, `EVIDENCE_LEDGER.md` and `OPEN_QUESTIONS.md`; verify HEAD and the outside-scope Git digest. No audit task is currently ready: resume only after an explicit new audit/design request, beginning with the recorded evidence gaps rather than implementation. Never clean/restore the dirty tree. If the outside-scope digest differs from the initial `6bf8e6…`, stop and identify the exact path.
