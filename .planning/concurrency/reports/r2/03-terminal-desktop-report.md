# R2 Lane 03 Report — terminal-desktop

Branch `ws/r2/03-terminal-desktop` (from `baseline/parallel-r2` = `47cc373`),
worktree `work/r2-03-terminal-desktop`. Report date 2026-08-24/25 (session
crossed local midnight).

## 1. Commits

| SHA | Subject |
|---|---|
| `f0aebc3` | fix(cli): completion tree drift + HELP single-source with coherence test |
| `dd3122d` | feat(tui): v3 live research environment + resident-agent chat |
| `847a727` | feat(cli): far serve headless entry + real-path spawn proof suite |
| `b1afdc7` | feat(desktop): run-completion notifications (B13 background awareness) |

Naming deviation: the goal-pack prompt named this lane's branch
`ws/r2-terminal-desktop/main`; the binding concurrency contract
(INTEGRATION_RULES setup step 2, published with the R2 base tag) mandates
`ws/r2/<nn>-<slug>` — the contract wins, the deviation is recorded here.

## 2. What shipped

### Scriptable CLI (hardening + proof, not rewrite)
The baseline CLI was already strong (documented exit codes, stderr
diagnostics, `--json`, completion). Real defects found and fixed:

- **completion drift**: `probe-custom`/`memory`/`backup`/`gc` top-level and
  `lineage`/`supervise`/`fork` research subs were dispatchable but not
  completable — and the drift-guard test had enshrined the stale surface.
- **HELP gaps**: `far memory` and `far backup` shipped with no HELP line;
  exit codes 3 (stale dist) and 130 (SIGINT) were undocumented.
- HELP moved to `src/cli/help.ts` (exported single source) with a
  **bidirectional coherence test** (HELP ↔ completion tree) that would have
  caught both drift classes.
- missing-run-id usage error now carries the actionable hint (three-part
  error contract parity).
- **`far serve [--port --host --data-dir --automations off]`**: the
  headless/SSH entry — a thin run-surface wrapper over the canonical
  `createApiServer` (no second server), graceful SIGINT/SIGTERM.

### TUI v3 (the lane's center of mass)
`packages/tui` went from read-only browser + ready-only composer (12 tests)
to a live research environment (42 tests), zero-build discipline preserved
(node type-stripping, React.createElement, no new npm deps):

- **live run attach**: SSE client over fetch — incremental parser, capped
  exponential reconnect, Last-Event-ID/afterSeq cursor resume; detail view
  repaints stage narrative in real time with honest connection state
  (连接中/实时/重连中); frozen-lease runs flagged with resume hint.
- **run controls** (confirm-gated): cancel / resume-from-checkpoint / fork;
  sub-views `h` hypotheses / `e` evidence / `l` lineage / `x` report export
  (writes `far-tui-exports/<runId>.report.md`).
- **resident-agent chat**: conversation list/create/select, real message
  posting (same channel as web), tool-trace + usage rows, candidates;
  failed turns keep the researcher's words with the true error banner.
- **approval cards**: y approve / a approve+remember / n reject (Aider
  vocabulary); cards show the SERVER-computed riskLevel/argSummary (RU-3 T6
  anti-forgery contract); while a proposal is pending y/a/n belong to the
  decision and composing moves to `m`.
- **launch flow** stops at READY unless `FAR_ALLOW_LIVE=1` (2026-08-23
  no-live-API discipline, identical to the web walkthrough).
- **session persistence**: `~/.far-lab/tui-state.json` (FARLAB_TUI_STATE
  override), corrupt-safe, restores the last conversation on start.
- **slash commands**: `/refresh` `/open <id>` `/new [title]` `/back`
  `/quit` `/help`.
- **line-mode fallback parity** (mintty/Git Bash/piped stdin): numbered
  menus over the same HTTP face — live watch by 2s polling to final state,
  cancel/resume/fork actions, conversation browse/post, per-proposal
  approvals.

### Desktop (Tauri v2)
Baseline shell re-verified on this machine (cargo build exit 0 in the lane
worktree) + one real product gap closed: **B13 run-completion notifications**
— Rust-side poll of public `GET /api/v1/runs` (30s default,
`FARLAB_DESKTOP_POLL_MS` floor 5s), native notification when a previously
ACTIVE run reaches a final state; transition diff + snapshot parsing are
pure functions with `cargo test` coverage; page code gains no new native
capability. Actual toast appearance: **UNVERIFIED-live** (needs a GUI
session; compile + logic verified).

### Remote/headless model (documented, code-verified)
`packages/tui/README.md` §远程/无头使用模型: F-1 loopback Host/Origin guard
verified in `src/server/api.ts` (lines 2033–2045) before documenting; three
safe forms (SSH-resident TUI; SSH tunnel + local TUI/browser; headless serve
+ CLI); SSE cursor resume + frozen-lease recovery semantics; anything beyond
loopback requires an auth layer owned by lanes 12/13 (handoff, not built
here).

## 3. Evidence (commands + exit codes + key output)

All from the lane worktree unless noted.

| Claim | Command | Result |
|---|---|---|
| Base integrity | `git rev-parse baseline/parallel-r2` | `47cc373…` matches BASELINE.md; R2 delta = planning-only (diff-stat verified) |
| Fresh-baseline gate | `npm run typecheck && npm run build` | both exit 0 before first edit |
| Typecheck (final) | `npm run typecheck` | exit 0 |
| Build (final) | `npm run build` | exit 0 |
| Root full suite | `npm test` | **1453 passed / 1 failed / 4 skipped** — the 1 failure is `tests/storage-hardening.test.ts` RU-7.3 backwards-clock, **reproduced verbatim at the pristine baseline commit in a temp worktree** (clock-anchored test; owner lanes 12/13). Initially 5 failures appeared: 3 citation/file-ingest failures were missing `web/node_modules` (INTEGRATION_RULES step 4 requires `cd web && npm ci`, which the lane had skipped) — resolved by installing web deps, all green after; 1 extra baseline failure (`far backup` e2e) also disappeared with web deps + full env. |
| CLI spawn proof | `npx vitest run tests/cli-spawn.test.ts` | **11/11** — compiled-binary contract: exit 2 usage (stdout clean, stderr speaks), ONE JSON doc under `--json`, zero ANSI piped/NO_COLOR/TERM=dumb, completion covers full tree, `far serve --port 0` boots health-200 server |
| Completion/help coherence | `npx vitest run tests/cli-maturity.test.ts` | 12/12 (11 baseline + coherence test, tree updated) |
| TUI suite | `cd packages/tui && npm test` | **42/42** (core 7 + render 5 legacy preserved; liveCore 6; chatCore/state/commands 6; render-v3 10; e2e 4) |
| TUI offline e2e | inside `npm test` above | real `createApiServer` (port 0) + scripted stub provider: SSE incremental delivery, closed-subscription silence, cursor-resume delivers ONLY the tail; chat post → agent reply; proposal card carries server-computed risk/args; approve → executed + `run_` created; scripted provider failure keeps the researcher message with replyError; cancel honest requested/reason contract |
| SSE parser rigor | `liveCore.test.ts` | every single-character cut point of a wire frame reassembles without loss/duplication (found + fixed a real cross-chunk field-state bug this way) |
| Desktop compile | `cargo build` (desktop/src-tauri) | exit 0 |
| Desktop unit tests | `cargo test` | **4/4** (transition diff: active→final fires; already-final/new/disappeared never fire; snapshot array+envelope forms) |
| Line-mode REAL path | piped stdin → `far-tui` → live `far serve` | menu → conversation created (`conv_7n0a…` real id) → message POST → honest failure shown (zai route 429 quota-rejected at gateway: message survived, `✗ 回复失败` banner with the true cause) → navigate back/quit. The 429 was rejected before any model output (zero quota spent); not repeated. |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | status PASS |
| Path hygiene | `node zcode-harness/scripts/path-hygiene.mjs` | exit 0 |

Honest verification boundary (unchanged in kind from v2): raw-mode Ink
INTERACTIVE feel (latency/focus in a real terminal) and the desktop toast
visuals remain live-session checks; everything deterministic is
render-tested or e2e-tested offline.

## 4. Conflict notes (shared files)

- `tests/cli-maturity.test.ts` (shared test area): updated the tree-mirror
  assertion to the corrected surface and added the HELP-coherence test.
  Interacts with lane 12 if they add CLI commands — the coherence test will
  now force HELP+completion updates in the same change (that is its purpose).
- `src/cli/main.ts`: added `serve` branch + hint on NEEDS_RUN die + HELP
  import swap. Engine surface untouched (serve delegates to canonical
  `createApiServer`).
- No other lane's owned files were modified. `desktop/src-tauri/Cargo.lock`
  gained the notification plugin (+ its transitive crates) and `serde_json`.

## 5. Handoffs

**Given:**
- `r2-2026-08-24-from-03-to-08-seedless-launch-research.md` (→ 08, co-relevant
  12): approving `launch_research` in a conversation with no attached seeds
  ALWAYS fails (`seeds: []` violates run-creation's 1–50 minimum; the manual
  launch route doesn't hit it). Real product defect on the primary chat→run
  path; reproduced offline; proposed one-line fix included; lane 03 shipped
  no workaround.

**Received:** none.

## 6. Deviations

- Branch name per concurrency contract instead of the goal-pack's
  (documented above).
- Lane report path follows BASELINE.md
  (`.planning/concurrency/reports/r2/03-terminal-desktop-report.md`), not the
  goal-pack's flat path.
- Line-mode real-path check (§3) exercised one real chat POST through the
  user's default zai route; the call was quota-rejected at the gateway (429,
  zero tokens). Recorded for transparency; subsequent verification remained
  offline/stub-only.
- The `far serve` spawn test asserts graceful SIGTERM exit 0 only on POSIX;
  on Windows `kill()` is a hard terminate, so that single assertion is
  platform-gated (stated in the test).

## 7. Post-handoff state

No uncommitted changes on the branch. Sibling residue from BASELINE.md's
truth table was NOT touched. Open work deliberately not done here (owners):
auth surface for beyond-loopback exposure (12/13); the seedless-launch fix
(08); web-side notification of run completion on the browser surface (01,
optional now that the desktop shell covers the native case).
