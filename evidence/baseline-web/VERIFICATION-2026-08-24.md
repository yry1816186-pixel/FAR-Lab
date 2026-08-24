# Integration Baseline Verification — 2026-08-24

Branch `integration/farlab-current`. All commands run in the fresh worktree
`~/Desktop/farlab-integration` (fresh clone-equivalent: no preexisting
node_modules, no dist).

## Fusion lineage (what this branch is)

- Base: `build/hx-reconstruction` @ 91df82b (345 commits over main; contains
  main, farlab-verify-staged, build/ev2-closeout entire — verified via
  `git rev-list --left-right --count`, all zero on their side).
- Merged: `origin/mission/gap-closure` @ 72150c0 (PR #128 head) — 15 unique
  commits: dotenv/env.example/FARLAB_DATA_DIR/probe-custom/uv-gate/CI alignment
  + hermetic test fixes. Merged as 16af2af with per-subsystem authority
  decisions (see commit message), NOT a mechanical merge.
- PR #128 content is thereby fully subsumed; its base (main) is strictly
  behind. Do not merge it to main as-is.

## Fresh baseline gates (all from clean worktree)

| Gate | Command | Result |
|---|---|---|
| Root install | `npm ci` | 144 packages in 5s, exit 0 |
| Web install | `cd web && npm ci` | 354 packages in 11s, exit 0 |
| TUI install | `cd packages/tui && npm ci` | 39 packages in 3s, exit 0 |
| Root typecheck (strict) | `npm run typecheck` | exit 0 |
| Root build | `npm run build` | exit 0 |
| Web typecheck | `cd web && npm run typecheck` | exit 0 |
| Web build | `cd web && npm run build` | exit 0 (9.6s; chunk-size warning only) |
| Lint | `npm run lint` | 0 errors, 3 warnings (unused eslint-disable directives) |
| Full test suite | `npm test` | **141 files passed / 1 skipped; 1442 tests passed / 4 skipped; exit 0; 118.6s** (real uv sidecar experiment tests RAN, incl. RU-8 cleanlab audit, scheduler crash-window idempotence, EEL determinism gate) |
| TUI tests | `cd packages/tui && npm test` | 12/12 pass |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | status PASS, exit 0 (findings only in experiment-runtime/.venv site-packages, allowed) |
| CLI launch | `node dist/cli/main.js --help` | renders full subcommand surface, exit 0 |
| TUI launch | `echo q \| npm start` (packages/tui) | renders line-mode UI, clean quit, exit 0 |
| Desktop | Tauri scaffold (`npm run tauri`) | NOT exercised — requires Rust toolchain; heavyweight, out of routine gates |

Two merge-fusion defects found and fixed in 0f0f292 (WelcomeView duplicated
prop; dead inline zoteroLibrary) — exactly the class of defect mechanical
merge resolution produces.

## Web source→serve→browser chain proof (the anti-stale-artifact requirement)

HEAD at verification: `e5c02d8f11ac27be1f954df2a7e62de081de7381` (docs commit;
code tip `0f0f292`, both after full rebuild).

1. **Source commit**: `git rev-parse HEAD` = e5c02d8…; `git status` clean
   before rebuild; both dists rebuilt from this tree (`npm run build`,
   `cd web && npm run build`, both exit 0).
2. **Build artifact**: `web/dist/index.html` references `assets/index-p-qLOIMV.js`;
   local sha256 = `3248b4a8c3d8603999affd051fd7a7d3599cae52d7303b851e09eac43794dba6`.
3. **Serve path**: `FARLAB_DATA_DIR=<isolated tmp> PORT=3396 node scripts/serve.mjs`
   (serves ONLY fresh dist — D-031 guard refused nothing, i.e. dist fresh).
   `curl http://localhost:3396/` returns the same index.html asset refs;
   `curl …/assets/index-p-qLOIMV.js | sha256sum` = same hash.
   `GET /api/v1/health` = `{"status":"ok","db":"ok","auditChain":{"ok":true…}}`;
   `GET /api/v1/meta` reports `dataDir` = the isolated temp dir (FARLAB_DATA_DIR
   honored — gap-closure capability verified live).
4. **Browser loaded asset**: Playwright navigated to `http://localhost:3396`;
   DOM `<script src>` = `/assets/index-p-quLOIMV.js`-equivalent `index-p-qLOIMV.js`;
   in-page `fetch()` of that asset + `crypto.subtle` SHA-256 =
   `3248b4a8…dba6` — **identical to build artifact and served artifact**.
5. **Rendered product**: title "FAR-Lab 研究工作台"; h1 "今天研究什么？";
   composer present — the conversation-first HX form, not legacy Run/Stage.
6. **Screenshot**: `evidence/baseline-web/baseline-web-2026-08-24.png`.

Chain closed: source commit → build artifact → serve path → browser-loaded
asset → screenshot, all one commit. Known minor gap: `/api/v1/health`'s
`gitCommit` field reports `null` (server does not resolve git at runtime);
the asset-hash chain above is the authoritative proof. Surfacing the running
commit in `/api/v1/meta` is a natural PLATFORM-lane task next round.

## Environment notes

- Port 3296 was already occupied by another FAR-Lab instance (sibling
  session's server, left untouched). Baseline used 3396; server stopped after
  verification.
- Primary worktree (`~/Desktop/new`) left untouched: branch build/hx-reconstruction,
  sibling in-flight untracked files (`src/domain/campaign.ts`,
  `tests/campaign-spec.test.ts`) preserved exactly as found.
