---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: executed, skipped, and denied command and external-query evidence
authoritative_for: [command and query log]
evidence_level: A
related_decisions: [DEC-008]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# Command and external-query log

Exact shell transcript timestamps were not retained for every read; where absent, the date is explicit and time is `UNKNOWN`. No command in this log authorizes implementation.

| ID | Timestamp (+08:00) | Purpose | CWD / source | Command or query class | Risk | Timeout | Exit/result | Output summary | Side effects | Conclusion / cleanup |
|---|---|---|---|---|---|---:|---|---|---|---|
| CMD-001 | 2026-08-05T17:05:46 | Resolve root/rules/baseline | repo root | `git rev-parse`, `find AGENTS.md`, `git status --short`, staged/unstaged names | READ | default | 0 | Root, HEAD, branch, 253-entry baseline recorded | None | Immutable baseline in `INITIAL_GIT_BASELINE.md`; no cleanup |
| CMD-002 | 2026-08-05 time UNKNOWN | Validate v3 package | repo root | `sha256sum`, byte/line comparison against manifest | READ | default | 0 command / one semantic mismatch | 23 declared core artifacts match; root README does not | None | EC-001; modular package usable but not complete |
| CMD-003 | 2026-08-05 time UNKNOWN | Static baseline | repo root | `pnpm run typecheck && pnpm run lint` | GUARDED_READ | default | 0 | No diagnostics | None observed | Static checks pass only (`RUN-0001`) |
| CMD-004 | 2026-08-05 time UNKNOWN | Native runtime probe | repo root | Node in-memory `better-sqlite3` load | READ | default | 1 | `ERR_DLOPEN_FAILED: invalid ELF header` | None | Runtime suite blocked without forbidden rebuild |
| CMD-005 | 2026-08-05 time UNKNOWN | Python runtime probe | repo root | Python imports with existing dependency path | READ | default | 1 | Windows NumPy path calls unavailable API | None | Science runner blocked in current WSL tree |
| CMD-006 | 2026-08-05 time UNKNOWN | Repository forensics | repo root | bounded `rg`, `sed`, `git log/show/diff`, file counts/hashes | READ | per call ≤30s | 0 | Architecture, trust, API, security, release and governance evidence captured | None | Evidence ledger entries REPO/TRUST/SCI/API/SEC/OPS/QUAL/GOV |
| CMD-007 | 2026-08-05 time UNKNOWN | Release checksum audit | `.far-release` | `sha256sum -c SHA256SUMS.txt` | READ | default | 1 | 7 of 11 listed artifacts fail current checks | None | Existing release evidence is stale; no file repaired |
| CMD-008 | 2026-08-05 time UNKNOWN | Git signature/history view | repo root | `git log --show-signature`/format query | READ | default | 0 | Sampled recent commits report `%G? N`; authorship text is not cryptographic provenance | None | Governance/supply-chain gap; no history edit |
| CMD-009 | 2026-08-05 time UNKNOWN | Load v3 protocol progressively | repo root | `sed`/`rg` over master, manifest, modules 01–10 and templates | READ | default | 0 | Modular v3 loaded by stage; monolithic fallback not loaded | None | Protocol followed; no cleanup |
| CMD-010 | 2026-08-05 time UNKNOWN | Current agent/protocol benchmark | official web sources | official repository/docs/release/spec searches and opens | NETWORK_READ | per query | success with gaps | Dated evidence gathered for 13 project families and MCP/ACP/A2A/Agent Skills | Browser/tool cache outside repo not controlled; no repo file writes observed | Claims limited to official documentation; versions unknown where not published |
| CMD-011 | 2026-08-05 time UNKNOWN | Codex official facts | official OpenAI docs | OpenAI docs route; manual helper skipped because it writes outside permitted path; official web fallback | NETWORK_READ | per query | partial | Current sandbox, approvals, AGENTS, CLI/JSON/resume/SDK facts found | No helper/cache write attempted | `openai-docs` skill constrained source selection; no product effect |
| CMD-012 | recurring | Enforce write boundary | repo root | `git status --short`, `git diff --name-only`, allowed-path filtering | READ | default | 0 so far | Audit-created paths remain below `docs/far-lab-reboot/` | None | Repeat after each document batch and at S12 |
| CMD-013 | 2026-08-05 time UNKNOWN | Historical pre-PX1 S12 structural and boundary checkpoint | repo root | metadata, Markdown link/heading/table, stable-ID/trace, count, Git hash/status checks | READ | per call ≤30s | 0 | At that checkpoint: 0 checked structural errors; 35 requirements/15 traces; 14/14 coverage axes; 53 allowed files | None | Historical result superseded only in counts by PX1; outside hashes matched initial baseline |
| CMD-014 | 2026-08-05 time UNKNOWN | PX1 second-order reverse review | repository and reboot docs | Three independent read-only passes over protocol/science, interface/conformance, and platform/parity proof | READ | bounded passes | completed | 12 protocol families, cross-surface state/profile/operation/distribution conflicts, and 15 parity dimensions challenged; 0 dimensions proven | None | Findings reconciled into docs 17–19, readiness gaps, traces, risks and gates; subagents wrote no files |
| CMD-015 | 2026-08-05 time UNKNOWN | PX1 final validation and boundary freeze | repo root and reboot docs | Frontmatter, Markdown links/headings/tables, stable-ID/trace/operation/interface/count scans; three final read-only rereads; NUL-delimited Git boundary hashes | READ | per call ≤30s | 0 | 57 Markdown files; 0 checked structural errors; 45 requirements, 20 unique trace chains, 43 operations, 36 target interfaces, 27 failure scenarios, 34 permission rows; 15 parity dimensions/0 proven | None | T-014 verified; outside/unstaged/staged digests remain `6bf8e6d38635ee9397606a6aa00b65036a411fdacddb2efccbe2121e734b2a99` / `594a27a8ed69c1f1d337fc34594daeb324e15d864d34e64198fd57cb241724f2` / `756ea0fc45564036409678152658571cf6718ddbcbf26ad6a2390b682215daa9`; product/parity gates remain blocked or unproven |

Denied/skipped commands: full tests, demo, build, installer, dependency rebuild/install, migration, service start, container build, commit, push, deployment, and any secret read. Reason: known cross-platform dependency failure plus exclusive write boundary; see `INSTRUCTION_CONFLICTS.md` IC-001.
