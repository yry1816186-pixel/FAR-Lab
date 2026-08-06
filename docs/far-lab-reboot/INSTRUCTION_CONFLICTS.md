---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: instruction, scope, package, and authority conflicts and their precedence decisions
authoritative_for: [instruction conflict resolution]
evidence_level: A
related_decisions: [DEC-008]
related_requirements: [REQ-GOV-001]
supersedes: []
superseded_by: null
---

# FAR-Lab reboot audit — instruction conflicts

| ID | Sources / scope | Conflict | Adopted rule | Rejected rule | Reason | Risk / reconsideration |
|---|---|---|---|---|---|---|
| IC-001 | Current user write prohibition vs root `AGENTS.md` §2 startup commands | Full `pnpm test` can rebuild `better-sqlite3` and install Python packages; demo requires the incompatible native addon. | Probe dependencies, run only no-write static checks, mark full runtime baseline BLOCKED. | Blindly execute full test/demo in this worktree. | User instruction has higher priority and makes any outside-scope write a stop condition. | Reconsider only in an isolated, authorized environment with no writes to this worktree. |
| IC-002 | Current user sequence names monolithic and modular prompts; later sentence says never load both and monolithic is fallback only. | Literal first list conflicts with progressive loading. | Load modular master/modules; hash-check but do not load monolithic. | Read both content sets. | Later, specific compatibility rule and master §5/§11 prevent context duplication. | None while module files remain available. |
| IC-003 | `PACKAGE_MANIFEST.md` completeness statement vs repository files | Declared package README does not match listed checksum/shape. | Record package as PARTIAL but use independently matching core files. | Claim package is fully complete. | Direct hash evidence overrides prose assertion. | Resolve by supplying expected package README or an updated manifest. |
| IC-004 | `PROGRESS.md` vs `DEVELOPMENT_ROADMAP.yaml` | One claims later phases completed; the other marks phases 2–5 pending with stale failures. | Treat both as historical claims; re-derive current state from evidence. | Select either silently as current truth. | Neither is clearly authoritative and they contradict. | An owner-designated, versioned authority plus reproducible gates can resolve. |
| IC-005 | Root `AGENTS.md` §10 vs current user's exclusive write scope | Session-end rule asks to update root `PROGRESS.md`, outside the only permitted directory. | Maintain resumable `RUN_STATE.md` and related ledgers under `docs/far-lab-reboot/**`. | Modify `PROGRESS.md`. | Current user scope is more specific and higher priority. | Repository owner may later incorporate the reboot status. |
