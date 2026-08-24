# R2 Lane 02 — visual-design report (2026-08-24)

Branch `ws/r2/02-visual-design`, base `baseline/parallel-r2` (`47cc373`).
All work in lane-owned files only: `web/src/styles.css`, `web/src/viz/**`,
`web/src/components/detail/viz/**` + UX evidence under `evidence/hx/`.

## 1. Commits

- `d16fe7a` style(visual): complete token-system convergence + theme-aware charts (R2-02)
  (styles.css token convergence, :where() statement-voice fix, chart theming,
  chart-theme.ts, token-drift-lint.mjs, audit-before.md)
- follow-up commit (this push): viz/chart-theme MutationObserver timing fix
  (event-race root cause found in live verification), handoff 02→12, lane report,
  before/after screenshot evidence.

## 2. Evidence

### Baseline audit (before)
- `evidence/hx/r2/audit-before.md` — full defect ledger with per-line sources.
- Deterministic DOM audits (Playwright computed styles): **694 elements <12px**
  on run-overview alone; font fragments 12.88/11.04px from `.mono` 0.92em;
  radius off-system (3/6/8/10/12px); `.hyp-statement` computed **12.5px** instead
  of designed 15.5px serif (specificity accident).
- `evidence/hx/r2/token-drift-lint.mjs`: **52 findings** at baseline → **0** after
  (exit 0, `node evidence/hx/r2/token-drift-lint.mjs` prints `token-drift: clean`).
- Before screenshots (15): `evidence/hx/r2/before/` — light/dark × zh/en,
  1440×900 + 1024, fixed fixture data.

### Fixture (fixed-data protocol)
SQLite `VACUUM INTO` snapshot of the primary workspace's real run library
(85 runs / 12,859 objects / 7,443 events / 11 MB artifacts) into lane-local
`.far-vizqa/` (gitignored); served read-only-ish by `PORT=3197
FARLAB_DATA_DIR=.far-vizqa node scripts/serve.mjs`. Canonical run
`run_hzxxc7tgjjq3arkvckdnm6nv4c` (10 hyp / 6 scorecards / 88 relations /
plan / experiment / revision / tournament). Zero fabrication; fixture is
explicit and isolated from production paths.

### After verification (all commands run 2026-08-24, lane worktree)
- `node evidence/hx/r2/token-drift-lint.mjs` → `token-drift: clean`, exit 0.
- `npm run typecheck` (root) exit 0; `npm run build` (root) exit 0.
- `cd web && npm run typecheck` exit 0; `npm run build` exit 0 (13.8s/12.6s/12.9s,
  chunk-size warning only — same as baseline record).
- Root `npm test`: **1441 passed / 4 skipped / 1 failed** (142 files). The 1
  failure is `tests/storage-hardening.test.ts > RU-7.3 backwards-clock detection`
  — PRE-EXISTING time-of-day-dependent defect (fails after 12:00 UTC; root cause
  `storage:last_write_at` floor polluted by real wall-clock, verified by arithmetic
  13759 = now−12:00Z). Lane-02 diff touches no persistence code. Handoff filed
  (see §4). Re-run confirmed same single failure.
- DOM re-audit: sub-11px text **0** (was 694); `.hyp-statement` computed
  **18px/27px "Source Serif 4"** on featured card (was 12.5px).
- Theme-follow verification (live, both directions): radar ECharts axis
  `rgb(126,128,130)`/stroke `#2e3133` in dark (dark tokens), plan-DAG edge
  `rgb(99,101,103)`; initial stale-cache negative result led to the
  MutationObserver timing fix + cache-disabled re-proof (recorded in commit).
- WCAG spot pairs (computed in-browser): dark — text1 9.44, text2 5.30,
  badge 4.58, glyph 5.65; light — statement 8.26, badge 4.57. All ≥4.5 AA.
- Keyboard: real Tab presses reach controls with `:focus-visible` matched,
  solid 2px ring (screenshot `after/keyboard-focus-light-zh-1440.png`).
- Narrow/zoom-equivalent: 1024×800 and 720×450 — no horizontal overflow,
  0 sub-11px text.
- Pixel-diff before/after (same viewport+data, threshold ΔRGB>30):
  hypotheses 19.9% changed (bands concentrate in card zone 25.8/37.7/27%),
  evidence 17.7%, overview 10.7%, home 12.8% — change localized to content
  areas; no global layout breakage.
- After screenshots (14): `evidence/hx/r2/after/` incl. dark radar/DAG/plan,
  en overview, focus ring, 720/1024.

### Independent blind review — BLOCKED-tooling (honest state)
The environment's image-input path failed: harness Read of PNGs returns CDN
uploads (no visual), subagent Read likewise (`CANNOT_SEE_IMAGES` probe), and
the vision MCP tool returned HTTP 400 ("图片输入格式/解析错误") on 5 of 6 calls
(1 early success on the empty-state audit; URL encoding of Windows-path object
keys is the suspected cause). Substituted review evidence (deterministic, but
NOT an independent human-eye review): computed-style audits, WCAG ratios,
pixel-diff localization, token-drift lint. **A true independent blind review
remains open** and is listed for the Integrator / next session with working
image tooling.

## 3. Conflict notes (shared files touched)

- `web/src/styles.css` — lane-owned; bulk token convergence (~90 rule edits).
  Lane 01 concurrently owns sibling web files; no edits outside lane list.
- `web/src/components/detail/viz/*.tsx` — lane-owned (viz/**); RadarCompare
  gained `useChartTokens` dep so compare-view chart re-inits on theme change
  (behavioral change is theme-follow only, no data semantics touched).
- No `web/package.json` changes (no dependency delta). No shared-file edits
  outside the ownership table.

## 4. Handoffs

- **Given:** `r2-2026-08-24-02-12-storage-clock-test-utc-timeday.md` (02 → 12;
  RU-7.3 test time-of-day dependence, root cause + repro + fix directions).
- **Received:** none.

## 5. Deviations

- **Branch name**: prompt pack said `ws/r2-visual-design/main`; repo contract
  (BASELINE.md) mandates `ws/r2/02-visual-design` — followed the repo contract
  (Integrator's fusion discovery depends on it).
- **Worktree path** `work/r2-02-visual-design` under the primary tree per
  INTEGRATION_RULES step 2 (`work/` is gitignored there; primary tree untouched —
  no `git add -A` anywhere, sibling in-flight files never staged).
- **§5 glyph/hero-radius exceptions recorded in lint config** (11px decorative
  glyph, 8px hero cards, 3px meter half-height, doc-h1 20px): the craft spec's
  own single-case allowances, now machine-checked rather than folklore.
- **No live-API usage**: all verification offline against the SQLite fixture
  snapshot (no-live-API policy honored; nothing marked BLOCKED-live because
  nothing needed a live route).
- **`.far-vizqa/` fixture** is a copy of real sibling-run data used ONLY for
  visual QA in the lane worktree; gitignored; never promoted to any production
  path.

## 6. Remaining / known-open (next passes)

1. Independent blind visual review (blocked on image tooling — see §2).
2. RadarCompare SERIES_COLORS (quantitative identity, documented as
   theme-agnostic mid-tones) could move to a palette file if lane 06/14 want
   chart-series tokens — deliberately not semantic tokens (series ≠ epistemic
   state).
3. `run-header-question` line-height 30px kept as a commented CJK-serif
   exception vs `--lh-h1` 28px (spec table predates the serif question header).
4. The 350-line responsive block (styles.css ~1247-1594) was audited for token
   drift but not restructured — restructuring it is Lane-01-adjacent layout
   work beyond this pass's visual-execution mandate.
