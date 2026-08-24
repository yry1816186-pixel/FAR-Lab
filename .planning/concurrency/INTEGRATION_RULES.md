# Integration Rules — Parallel Round (2026-08-24)

Binding contract for all seven lanes. These rules exist because the previous
multi-session round produced divergent branches, duplicate engines (two Zotero
bridges, two CI designs) and a stale-artifact web experience. Violating them
recreates that mess at 7× scale.

## Setup (every lane, before any work)

1. `git fetch --all`
2. `git worktree add ../farlab-<lane> -b ws/<lane>/main <BASE SHA from BASELINE.md>` — all lanes share the SAME base SHA.
3. Verify: `git -C ../farlab-<lane> log --oneline -1` shows the BASE SHA commit.
4. Install: `npm ci` (root) and `cd web && npm ci`. Gate: `npm run typecheck && npm run build` before first edit (fresh-baseline sanity).

## Hard rules

1. **One lane = one worktree = one branch** (`ws/<lane>/main`). Never clone a second copy, never work in the primary worktree (`~/Desktop/new`) or the integration worktree (`~/Desktop/farlab-integration`).
2. **Never modify another lane's worktree or branch.** No exceptions — cross-lane needs go through handoff records (format in OWNERSHIP.md).
3. **Never merge `main` or any other lane's branch into your lane.** Rebase onto a NEW base only when the Integrator publishes an updated BASE SHA in BASELINE.md.
4. **No duplicate authoritative engines.** Before building any capability, search the tree for an existing one (rg the concept, check `src/`). If a weaker version exists, replace it in place under the owning lane — never add a parallel implementation.
5. **Shared-file discipline:** commit with explicit file lists (`git add <files>`), NEVER `git add -A` / `git add .`. Sibling in-flight files that are not yours must never be swept into your commits.
6. **Commit messages:** conventional commits (`feat|fix|refactor|perf|docs|test|build|ci|chore|style|revert(scope): subject ≤100 chars`) — the repo hook enforces this.
7. **Verification before claiming done:** lane-local `npm run typecheck && npm run build && npm test` green, `node zcode-harness/scripts/secret-scan.mjs` clean, plus lane-specific real-path evidence (screenshot for HX/DESIGN, offline benchmark numbers for SCIENCE, real sidecar run for EXECUTION, etc.). No live-API testing — `BLOCKED-live` labeling instead.
8. **No forced pushes to shared refs; no rewriting published history.** Lane branches are yours until integration.

## Integration deliverables (every lane, at round end)

A single file `.planning/concurrency/reports/<lane>-report.md` containing:

1. **Commits:** list of SHA + subject on the lane branch.
2. **Evidence:** commands + exit codes + key output for each claim; screenshots/artifact paths for UI work.
3. **Conflict notes:** every place the lane touched a shared file, what it changed, and known interactions with other lanes.
4. **Handoffs:** open handoff records (given and received) with status.
5. **Deviations:** anything the lane did outside its ownership table and why.

The Integrator (main agent or a dedicated integration session) then fuses
lane branches into `integration/farlab-current` using the same
authority-decision discipline documented in BASELINE.md — merge/cherry-pick/
port/manual fusion per subsystem, never mechanical merge-and-announce.

## Anti-patterns (all happened before — all forbidden)

- Merging a branch and resolving to "whatever compiles" (produced the duplicate Zotero bridge).
- Editing source while the served web/dist or running server predates the edit (the stale-experience failure this round's web verification exists to prevent).
- Sweeping unrelated in-flight files into a commit (`git add -A`).
- Building a second engine for a capability another lane already owns.
- Declaring done off green unit tests alone when the real caller path (CLI/web/sidecar) was never exercised.
