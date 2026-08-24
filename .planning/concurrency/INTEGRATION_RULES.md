# Integration Rules — Parallel Round R2 (2026-08-24)

Binding contract for all fifteen lanes. These rules exist because the
pre-R1 multi-session round produced divergent branches, duplicate engines
(two Zotero bridges, two CI designs) and a stale-artifact web experience.
R2 raises the lane count to 15: the same violations now recreate that mess
at 15x scale, and out-of-lineage residue branches make silent duplication
easier than ever. The rules are unchanged in spirit from R1; the setup
commands and deliverable paths are R2-specific.

## Setup (every lane, before any work)

1. `git fetch --all`
2. From the primary repo (`~/Desktop/new`):
   `git worktree add work/r2-<nn>-<slug> -b ws/r2/<nn>-<slug> baseline/parallel-r2`
   — all lanes share the SAME base tag. `work/` is ignored by the primary
   tree's `.gitignore`, so lane worktrees living there never pollute the
   primary status. (A path outside the repo like `../farlab-r2-<nn>-<slug>`
   is equally acceptable.)
3. Verify: `git -C work/r2-<nn>-<slug> log --oneline -1` shows the exact
   commit named by `git rev-parse baseline/parallel-r2`.
4. Install: `npm ci` (root), `cd web && npm ci`, and
   `cd packages/tui && npm ci` before running TUI tests. Gate:
   `npm run typecheck && npm run build` before first edit (fresh-baseline
   sanity — this re-establishes the runtime evidence on your machine, since
   the R2 baseline commit itself is planning-only and inherits the R1
   fresh-baseline evidence recorded in BASELINE.md).

## Hard rules

1. **One lane = one worktree = one branch** (`ws/r2/<nn>-<slug>`). Never
   clone a second copy, never work in the primary worktree
   (`~/Desktop/new`) or the integration worktree
   (`~/Desktop/farlab-integration`). Never touch a sibling lane's worktree,
   branch, or the residue branches listed in BASELINE.md.
2. **Never modify another lane's files.** No exceptions — cross-lane needs
   go through handoff records (format in OWNERSHIP.md).
3. **Never merge `main`, another lane's branch, or a residue branch into
   your lane.** If your work depends on out-of-lineage residue (e.g.
   `src/model-plane/**`, in-flight `src/ingest/**`), PORT the specific
   commits/files into your lane with attribution and note it as a deviation;
   the Integrator reconciles at fusion. Rebase onto a NEW base only when the
   Integrator publishes an updated BASE tag in BASELINE.md.
4. **No duplicate authoritative engines.** Before building any capability,
   search the tree AND the residue branches (`rg` the concept, check `src/`,
   then `git ls-tree -r <residue-branch> --name-only | grep <area>`). If a
   version exists — even a weaker one, even out-of-lineage — replace or port
   it in place under the owning lane. Never add a parallel implementation.
5. **Shared-file discipline:** commit with explicit file lists
   (`git add <files>`), NEVER `git add -A` / `git add .`. Sibling in-flight
   files that are not yours must never be swept into your commits.
6. **Commit messages:** conventional commits
   (`feat|fix|refactor|perf|docs|test|build|ci|chore|style|revert(scope): subject <= 100 chars`)
   — the repo hook enforces this.
7. **Verification before claiming done:** lane-local
   `npm run typecheck && npm run build && npm test` green,
   `node zcode-harness/scripts/secret-scan.mjs` clean, plus lane-specific
   real-path evidence (screenshot for 01/02, offline benchmark numbers for
   04/06/14, real sidecar run for 10, export artifact inspection for 07,
   etc.). No live-API testing — `BLOCKED-live` labeling instead.
8. **No forced pushes to shared refs; no rewriting published history.**
   Lane branches are yours until integration.

## Integration deliverables (every lane, at round end)

A single file `.planning/concurrency/reports/r2/<nn>-<slug>-report.md`
containing:

1. **Commits:** list of SHA + subject on the lane branch.
2. **Evidence:** commands + exit codes + key output for each claim;
   screenshots/artifact paths for UI work.
3. **Conflict notes:** every place the lane touched a shared file, what it
   changed, and known interactions with other lanes.
4. **Handoffs:** open handoff records (given and received) with status.
5. **Deviations:** anything the lane did outside its ownership table and
   why — including any residue ports performed under rule 3.

The Integrator (main agent or a dedicated integration session) then fuses
lane branches AND the residue branches into `integration/farlab-current`
using the same authority-decision discipline documented in BASELINE.md —
merge/cherry-pick/port/manual fusion per subsystem, never mechanical
merge-and-announce. A new immutable BASE tag is published only after fusion,
via a planning-only commit series like this one.

## Anti-patterns (all happened before — all forbidden)

- Merging a branch and resolving to "whatever compiles" (produced the
  duplicate Zotero bridge).
- Editing source while the served web/dist or running server predates the
  edit (the stale-experience failure this round's web verification exists
  to prevent).
- Sweeping unrelated in-flight files into a commit (`git add -A`).
- Building a second engine for a capability another lane — or a residue
  branch — already owns.
- Reimplementing `src/model-plane/**` or `src/ingest/**` from scratch
  instead of porting the existing residue work.
- Declaring done off green unit tests alone when the real caller path
  (CLI/web/sidecar) was never exercised.
