# Parallel Round Baseline — 2026-08-24

Single source of truth for the next parallel construction round. Every agent
starts from EXACTLY this state. If this file disagrees with the repository,
the repository wins — then fix this file.

## Exact base

- **Branch:** `integration/farlab-current`
- **BASE SHA:** recorded at merge/fusion completion — run `git log --oneline -1 integration/farlab-current` and read the integration-fusion commit. Agents MUST `git worktree add <path> -b <lane-branch> <BASE SHA>`; do not branch from any other tip.
- **Origin:** `build/hx-reconstruction` (product superset: 345 commits over main, includes all of main + PR #128 content) fused with `mission/gap-closure` (dotenv/env/data-dir/probe-custom/uv-gate/CI-alignment work). main and origin/main contribute nothing unique except the README, which is included.

## Fusion decisions already made (do not relitigate)

- web/* presentation: hx lineage authoritative (conversation-first IA, lit-graph IDF rewrite, ingest MAX_SEEDS=50 + sheet/pptx extractors).
- Zotero: `src/server/zotero.ts` module (library + annotations endpoints). The gap-branch inline `zoteroLibrary` was deleted as superseded.
- CI: single `verify` job design (proven green on `e5ebdc3`); web `build` script already runs `tsc --noEmit` before vite.
- `tests/gateway.test.ts`: hx beforeAll docker cleanup + gap `hostNumpyOk` honest-skip gating.
- Gap-branch capabilities adopted: `.env.example`, `src/platform/dotenv.ts` + CLI `.env` hydration, `FARLAB_DATA_DIR` honored in `createApp`, `far probe-custom`, `tests/helpers/uv-gate.ts` honest skipping, `NO_COLOR` pinned in vitest, vendored-artifact eslint ignores, web `@types/node`.

## Build / verify commands (run from repo root)

| Step | Command | Fresh-baseline evidence (2026-08-24) |
|---|---|---|
| Root install | `npm ci` | 144 packages, 5s |
| Web install | `cd web && npm ci` | 354 packages, 11s |
| Root typecheck (strict) | `npm run typecheck` | PASS |
| Root build (dist/) | `npm run build` | PASS |
| Web typecheck | `cd web && npm run typecheck` | PASS (after WelcomeView onOpenSettings dedup) |
| Web build | `cd web && npm run build` | PASS (9.6s, chunk-size warning only) |
| Lint | `npm run lint` | 0 errors / 3 unused-eslint-disable warnings |
| Full tests | `npm test` | recorded in this round's verification log |
| TUI tests | `cd packages/tui && npm test` | node:test, offline |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | run before any push |

## Runtime launch paths

- **Web + API (canonical):** `npm run build && node scripts/serve.mjs` → http://localhost:3196 (PORT overridable). Serves `web/dist` with SPA fallback; refuses stale dist (D-031 guard). Any web/ change requires `cd web && npm run build` + server reload.
- **CLI:** `node dist/cli/main.js` (alias `npm run far --`). Subcommands via `--help`.
- **TUI (shipped, experimental):** `cd packages/tui && npm start` (node `--experimental-strip-types`; no compile step).
- **Desktop (Tauri scaffold):** `cd desktop && npm run tauri <cmd>` — requires Rust toolchain; treat as heavyweight, not part of routine gates.

## Canonical runtime owners (one invariant, one owner)

| Concern | Owner |
|---|---|
| App composition / data root | `src/app/composition.ts` |
| HTTP API surface | `src/server/api.ts` |
| Web bundle source | `web/src` (built to `web/dist`) |
| Experiment execution | `src/experiment/*` + `experiment-runtime/` (uv sidecar) |
| Pipeline stages | `src/pipeline/*` |
| Provider/model plane | `src/app/provider-resolver.ts`, `src/providers/*` |
| Persistence | `src/persistence/*` (node:sqlite) |
| Deterministic gates | `zcode-harness/scripts/*` |

## Known external blockers / policies

- **No live-API testing** (2026-08-23 user directive): validation is offline/deterministic; anything requiring a live model route is `BLOCKED-live`. Never spend real keys to "feel sure".
- `B-QWEN-LIVE-ROUTE`, `B-DEEPSEEK-BALANCE` remain open blockers (from `.control` state); DeepSeek models are banned in this project entirely.
- Sibling sessions may be active in the primary worktree (`~/Desktop/new`); integration work happens in `~/Desktop/farlab-integration`. Never `git add -A` in the primary worktree.
- main's branch ruleset currently enforces nothing (empty rules); CI green ≠ merge authority.
