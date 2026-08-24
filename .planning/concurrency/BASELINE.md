# Parallel Round R2 Baseline — 2026-08-24

Single source of truth for the next parallel construction round (15 lanes).
Every agent starts from EXACTLY this state. If this file disagrees with the
repository, the repository wins — then fix this file.

## Exact base

- **Branch:** `integration/farlab-current`
- **BASE tag:** **`baseline/parallel-r2`** — resolve the exact SHA with
  `git rev-parse baseline/parallel-r2` (the literal SHA is recorded in
  "Tagged commit" below, filled right after tagging). Agents MUST
  `git worktree add <path> -b ws/r2/<nn>-<slug> baseline/parallel-r2`; do
  not branch from any other tip.
- **Parent of the R2 delta:** `baseline/2026-08-24` (`96b2637b691ddff5d7baf1a64f94bd6b95f686d9`,
  the R1 baseline). The R2 commits are **planning-only** — they touch
  nothing outside `.planning/concurrency/**`. Verify yourself:
  `git diff --stat baseline/2026-08-24 baseline/parallel-r2` must list only
  `.planning/concurrency/` files. Product behavior is bit-identical to R1.

## Provenance chain (do not relitigate)

- R1 base `96b2637` fused `build/hx-reconstruction` (product superset over
  main, incl. PR #128 content and the origin/main README commit `ab3f67b`)
  with `mission/gap-closure` (dotenv/env/data-dir/probe-custom/uv-gate/
  CI-alignment). Fusion decisions are recorded in the R1 BASELINE history
  (`git show baseline/2026-08-24:.planning/concurrency/BASELINE.md`) and
  remain binding.
- R2 re-shards the seven-lane R1 contract into fifteen specialist lanes
  (OWNERSHIP.md) and updates the binding rules (INTEGRATION_RULES.md).

## Out-of-lineage residue (truth table — port, never rebuild)

Work that exists on other branches and is NOT in this baseline. Lanes that
need these capabilities PORT them under INTEGRATION_RULES rule 3/4 with a
deviation note; the Integrator reconciles at fusion.

| Where | What | Status |
|---|---|---|
| `build/hx-reconstruction` local tip `0cc128d` | 7 commits: campaign RU-8 GO2-GO4 (`2dcc474`,`a64b042`,`c4b936b`), RU-12 structured diff (`0feca70`), worktree-ignore chore (`21f6233`), science formal-evidence revival (`f6f8067`), model-plane registry/routing/strict-JSON (`0cc128d`) | unfused; `origin/build/hx-reconstruction` has through `f6f8067` |
| `build/hx-reconstruction` working tree (DIRTY) | sibling in-flight: `src/ingest/**` + `tests/ingest-*.test.ts`, `src/app/{observability,recovery-state}.ts`, reliability tests, `web/src/utils/pdfCollect.ts`, gc/db/api edits | in-flight — NEVER sweep, reset, or commit from another session |
| `retrieval/evidence-lane` tip `22b02db` | 3 retrieval commits (`cbe3c37`,`cfa5168`,`22b02db`: citation chasing, retraction demotion, benchmark matrix) on the build/hx lineage | local-only, unfused |
| PR #128 `mission/gap-closure` -> main | content already fused into the R1 base; PR left open | administrative close-out pending (lane 15) |
| worktree `work/human-experience` @ `96b2637` | prunable (WSL path gone), no unique commits | safe to prune |
| `main` vs `origin/main` | origin is +1 README commit (`ab3f67b`) already present in this lineage | nothing unique outstanding |

## Build / verify commands (run from repo root)

Fresh-baseline evidence below was produced at `baseline/2026-08-24`
(`96b2637`) on 2026-08-24. The R2 delta is docs-only (proof command above),
so the runtime evidence carries over unchanged; every lane re-establishes
it locally via INTEGRATION_RULES setup step 4.

| Step | Command | Evidence (at 96b2637, 2026-08-24) |
|---|---|---|
| Root install | `npm ci` | 144 packages, 5s, exit 0 |
| Web install | `cd web && npm ci` | 354 packages, 11s, exit 0 |
| TUI install (required before its tests) | `cd packages/tui && npm ci` | 39 packages, 3s, exit 0 |
| Root typecheck (strict) | `npm run typecheck` | exit 0 |
| Root build (dist/) | `npm run build` | exit 0 |
| Web typecheck | `cd web && npm run typecheck` | exit 0 |
| Web build | `cd web && npm run build` | exit 0 (9.6s, chunk-size warning only) |
| Lint | `npm run lint` | 0 errors / 3 unused-eslint-disable warnings |
| Full tests | `npm test` | **141 files / 1442 tests passed, 4 skipped, exit 0, 118.6s** (real uv sidecar RAN) |
| TUI tests | `cd packages/tui && npm test` | 12/12 pass |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | PASS (exit 0; .venv findings allowed) |

R2 planning-only gates re-run at the R2 commit (2026-08-24):
- secret-scan: PASS, exit 0 (findings are the known allowances — .venv
  site-packages and test-fixture credential-shaped strings, same classes as
  the R1 record).
- path-hygiene: exit 1 in the integration worktree, errors are all
  `missing-required:.control/*` — workspace-local untracked runtime state
  (excluded from tracking by design, origin `a3c94d6`) that the bare
  integration worktree never had. Primary tree with `.control` present:
  WARN, zero errors. Pre-existing environmental condition, not introduced
  by the docs-only R2 delta (proof: the diff-stat command above lists only
  `.planning/concurrency/` files).

## Runtime launch paths

- **Web + API (canonical):** `npm run build && node scripts/serve.mjs` ->
  http://localhost:3196 (PORT overridable). Serves `web/dist` with SPA
  fallback; refuses stale dist (D-031 guard). Any web/ change requires
  `cd web && npm build` + server reload.
- **CLI:** `node dist/cli/main.js` (alias `npm run far --`).
- **TUI (shipped, experimental):** `cd packages/tui && npm start`
  (node `--experimental-strip-types`; no compile step).
- **Desktop (Tauri scaffold):** `cd desktop && npm run tauri <cmd>` —
  requires Rust toolchain; heavyweight, not part of routine gates.

## Canonical runtime owners (one invariant, one owner; R2 lane in brackets)

| Concern | Owner | Lane |
|---|---|---|
| App composition / data root | `src/app/composition.ts` | 12 |
| HTTP API surface | `src/server/api.ts` | 12 |
| Web bundle source | `web/src` (built to `web/dist`) | 01/02 |
| Ingest boundary | `src/ingest/**` (authoritative; being consolidated) | 05 |
| Retrieval / screening / sources | `src/sources/**`, `src/pipeline/{screening,stages/{retrieve,evidence}}` | 04 |
| Reasoning stages / iteration | `src/pipeline/stages/**`, `src/app/{evaluators,quality-gate,iteration}` | 06 |
| Manuscript / export production | `src/pipeline/{paper-outline,stages/export}` | 07 |
| Agent kernel | `src/agent/**` (lifecycle), `src/app/{memory,supervisor,orchestrator}` | 08 |
| Capability plane (tools/MCP/skills/plugins) | `src/agent/{tool,mcp*,skills,hooks*}`, `src/plugins/**` | 09 |
| Experiment execution | `src/experiment/*` + `experiment-runtime/` (uv sidecar) | 10 |
| Provider/model plane | `src/providers/*`, `src/model-plane/**` (incoming), `src/app/provider-resolver.ts` | 11 |
| Persistence / domain stewardship | `src/persistence/*` (node:sqlite), `src/domain/**` | 12 |
| Reliability / observability / security | observability + recovery modules, GC lifecycle | 13 |
| Evaluation evidence | `eval/**` | 14 |
| Deterministic gates / specs / CI | `zcode-harness/scripts/*`, `project-spec/**` | 15 |

## Known external blockers / policies

- **No live-API testing** (2026-08-23 user directive): validation is
  offline/deterministic; anything requiring a live model route is
  `BLOCKED-live`. Never spend real keys to "feel sure". (Debugging
  exceptions require an explicit user-designated key; never ZCode quota.)
- `B-QWEN-LIVE-ROUTE`, `B-DEEPSEEK-BALANCE` remain open blockers (from
  `.control` state); DeepSeek models are banned in this project entirely.
- Sibling sessions may be active in the primary worktree
  (`~/Desktop/new`, currently mid-edit on `build/hx-reconstruction`);
  integration work happens in `~/Desktop/farlab-integration`. Never
  `git add -A` in the primary worktree.
- main's branch ruleset currently enforces nothing (empty rules);
  CI green != merge authority.

## Lane report paths (R2)

Every lane delivers exactly one report:
`.planning/concurrency/reports/r2/<nn>-<slug>-report.md` (format and
required sections in INTEGRATION_RULES.md). Handoffs:
`.planning/concurrency/handoffs/r2-<date>-<from-nn>-<to-nn>-<slug>.md`.

## Final integration rule

The Integrator fuses lane branches AND all residue branches from the truth
table above into `integration/farlab-current` with per-subsystem authority
decisions (merge / cherry-pick / port / manual fusion), never a mechanical
merge-and-announce. Fusion completes only when each conflict was decided by
ownership (OWNERSHIP.md), not by convenience. After fusion, publish the next
immutable base as a planning-only commit series + tag, exactly as R2 did.

## Tagged commit

- `baseline/parallel-r2` -> (filled immediately after tagging; see
  `git rev-parse baseline/parallel-r2` for authoritative resolution)
