# R2 Lane 14 — Independent Evaluation, Benchmarking & Red Team — Lane Report

- **Branch:** `ws/r2/14-evaluation-redteam` (from `baseline/parallel-r2` = `47cc373`, verified `git log --oneline -1` = the tagged commit)
- **Worktree:** `work/r2-14-evaluation-redteam`
- **Date:** 2026-08-25
- **Scope held:** `eval/**` only + lane evidence dir `evidence/r2-14/`. Zero production-code edits (git status: `eval/metrics.mjs` modified — own file, additive `--db` flag; everything else new files under `eval/redteam/` and `evidence/r2-14/`).

## 1. Commits

Single commit on the lane branch (SHA recorded after commit in the pushed branch): `feat(eval): r2-14 red-team probe suite P1-P8 + independent scorecard + replay`.

## 2. What this lane built

`eval/redteam/` — a discriminating, fully offline red-team probe suite covering the
mission's fake-capability taxonomy, plus an aggregator that emits the lane's
independent scorecard:

| Probe | Fake-capability class | Result |
|---|---|---|
| p1-wiring | disconnected library / wrapper with no caller | ADVISORY (6 test-only modules, 3 dynamic-import review notes) |
| p2-route-contract | UI controls with no effect (client route with no server) | PASS (74 routes: 13 OK, 46 exists-validation, 8 exists-404, 2 exists-503, 5 → 0 after probe-artifact fixes; final 69/69 real routes correctly classified, 0 contract breaks) |
| p3-live-masquerade | mock/synthetic presented as live | PASS (stub not importable from any production entry; 0 stub-attributed live receipts in the 5072-receipt DB audit) |
| p4-stale-web | stale Web assets | PASS (D-031 guard: missing/older dist flagged, fresh tree clean; real `scripts/serve.mjs` refuses stale cwd, starts on fresh) |
| p5-citation-grounding | citation/DOI fabrication | PASS over the real corpus (1261 verified claims: 0 missing sources, 0 failing the product's own alignment gate, 21 fuzzy near-verbatim, 0 malformed DOIs) |
| p6-sandbox-escape | "sandbox" that is only cwd | ADVISORY (layer A TS policy 8/8; layer B live python sidecar 8/8 escapes rejected + benign OK; **numpy-surface limitation observed**, see handoff to 10) |
| p7-memory-benefit | memory that stores but does not improve behavior | PASS (write→idempotent FTS parity→compile→consume chain verified on a real store; `priorResearchMemory` wired into the hypotheses stage) |
| p8-agent-isolation | multi-agent = only multiple prompts | PASS (PermissionEngine strictest-wins behavioral 4/4; enforcement referenced on the agent loop; subagents derive from parent deps with fail-closed depth cap) |

**Overall scorecard verdict: `PASS_WITH_DIVERGENCES` — 0 invalid completion claims, 10 divergences** (scorecard.json `overall`, generated against tree 47cc373).

## 3. Evidence (commands + exit codes + key output)

Baseline sanity (INTEGRATION_RULES setup step 4):
- `npm ci` (root/web/tui) → exit 0 ×3; `npm run typecheck` → exit 0; `npm run build` → exit 0 (`BASELINE_GATES_OK`)
- Full suite `npm test` → **3 runs, all 1441 passed / 1 failed / 4 skipped (142 files, 1446 tests)**; the single failure is the SAME test every time and passes solo (see finding F-1 below). Baseline record expected exit 0 at `96b2637` on 2026-08-24 — the delta is context-sensitivity, not the planning-only R2 commit.

Probe battery:
- `node eval/redteam/scorecard.mjs` → probes p1..p8 exit 0; metrics replay exit 0; retrieval replay exit 0; overall `PASS_WITH_DIVERGENCES` (full JSON: `eval/results/r2-14/scorecard.json`, committed snapshot `evidence/r2-14/scorecard.{json,md}`)

Real-corpus replay (read-only copy of the primary workspace DB + artifacts under gitignored `eval/results/r2-14-inputs/`):
- `node eval/metrics.mjs --db <copy>` → exit 0. Key lines: P1..P4 completed runs srcVer 80–100%, claimBind 100%, falsif 83.3–100%, planExec true, live=100%.
- `node eval/retrieval-baseline.mjs --db <copy>` → exit 0 (BEIR-provenance replay over persisted runs).

Lane gates:
- `node zcode-harness/scripts/secret-scan.mjs` → exit 0
- `npx eslint eval/redteam/ eval/metrics.mjs` → exit 0
- `node zcode-harness/scripts/path-hygiene.mjs` → exit 1 with exactly 4 `missing-required:.control/*` errors — the documented environmental class for fresh worktrees (BASELINE.md R2 gate record), not introduced by this lane.

## 4. Findings fed to owning lanes (handoffs given)

**F-1 (handoff → 12): RU-7.3 backwards-clock test is full-suite-context-sensitive.**
`tests/storage-hardening.test.ts > RU-7.3 backwards-clock detection` failed in 3/3
full-suite runs in this worktree and passes solo (3/3). Run-3 assertion:
`expected 96595 to be 3600` — 96595 s is exactly the wall-clock delta between the
test's hardcoded `2026-08-24T11:00:00Z` and a REAL-NOW floor
(`storage:last_write_at` meta) at execution time, i.e. under the full suite the
floor was real-now instead of the test's own `12:00Z` write; solo the floor is the
test's write. Contamination mechanism into a per-DB meta value is undetermined
(store.ts:271-286; `mkStore` creates a fresh temp DB). Full log:
`.eval-inputs/suite-run3.log` (untracked; reproduction recipe in the handoff).

**F-2 (handoff → 10): exploration sandbox numpy surface partially non-functional.**
Inside the real sidecar namespace (`uv run --project experiment-runtime`, direct
`op_run_exploration`): `np.mean([1,2,3])` → ok, but `np.arange(4).sum()` →
`ImportError: exploration namespace does not provide 'numpy._core._methods'` —
numpy ops whose implementation lazily imports submodules die on the allowlist
import hook. Fail-closed (no fake success), but the advertised "numpy (as np)"
namespace contract is unreliable for arbitrary analysis code, and no product test
executes numpy payloads through the sandbox (test gap).

**F-3 (handoff → 11): banned provider module still in tree, wired only from tests.**
`src/providers/deepseek.ts` — DeepSeek is banned project-wide (user directive
2026-08-22) yet the module remains in src, imported only by
`tests/providers.test.ts`. Delete per the directive (P1 evidence).

Divergences recorded for owning lanes (report-only, no handoff file):
- `src/domain/conformal.ts`, `src/domain/revision-predicates.ts` test-only —
  independently CONFIRMS the SCIENCE lane's own "dead algorithms to wire-or-delete"
  backlog (06).
- `src/domain/search-allocation.ts` test-only (06).
- `src/experiment/matrix.ts` test-only — included in the F-2 handoff to 10.
- `src/plugins/host-main.ts` test-only + non-literal dynamic import (09) — likely
  runtime-loaded; manual review before any delete.
- `src/plugins/import.ts`, `src/server/api.ts` contain non-literal dynamic
  `import()` — P1 reachability may under-count there (manual-review notes).

## 5. Invalid completion claims list

**None.** All eight probed capability claims hold on the evaluated tree under
offline adversarial re-verification. The scorecard's `invalidClaims` array is
empty; the two capability divergences found (F-2 numpy, F-3 banned module) are
honest fail-closed gaps, not masquerades, and are routed as handoffs.

## 6. Conflict notes (shared files)

- `eval/metrics.mjs`: added `--db` argv flag (default behavior byte-identical).
  No other lane owns eval files at R2; no conflict expected at fusion.
- No `src/`, `web/`, `tests/` files touched.

## 7. Handoffs received

None pending for this lane.

## 8. Deviations

- Branch named `ws/r2/14-evaluation-redteam` (BASELINE.md mandated pattern
  `ws/r2/<nn>-<slug>`) instead of the lane prompt's literal
  `ws/r2-evaluation-redteam/main` — the preflight-published BASELINE contract is
  the binding convention all 14 sibling lanes follow.
- No-live-API policy held: every probe and benchmark is offline/deterministic.
  Live-route probes (probe-routes.mjs class) remain BLOCKED-live and untouched.
- The scorecard honestly scopes to THIS tree (`47cc373`): sibling lane branches
  are not fused. **Lane 99 (final integration) must re-run
  `node eval/redteam/scorecard.mjs` on the fused tree** and treat this baseline
  scorecard as the before-picture.

## 9. Unverified / limits (stated, not hidden)

- P1's import graph follows literal specifiers; non-literal dynamic imports are
  listed as manual-review, and modules behind them are excluded from hard claims.
- P2 proves the client↔server route contract, not full UI semantics; the
  dead-handler scan is heuristic (found none).
- P6 layer B executed the real sidecar via uv with the repo-locked env; the TS
  executor path (`runExploration`) itself is lane 10's real-run evidence surface.
- Judge-dependent north-star metrics (rediscovery F1, judge variance) remain
  live-blocked per the 2026-08-23 directive; this lane re-ran only the
  deterministic replay layer.
