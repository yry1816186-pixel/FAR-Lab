# R2 Lane-02 Baseline Visual Audit — 2026-08-24

Fixture: SQLite snapshot of real completed runs (85 runs / 12,859 objects / 7,443 events,
11 MB artifacts) copied read-only from the primary workspace into `.far-vizqa/`
(`VACUUM INTO` consistent snapshot + immutable content-addressed artifacts).
Server: `PORT=3197 FARLAB_DATA_DIR=.far-vizqa node scripts/serve.mjs`.
Canonical run: `run_hzxxc7tgjjq3arkvckdnm6nv4c` (10 hypotheses, 6 scorecards, 88 evidence
relations, 18 claims, 12 sources, plan + experiment + revision + tournament + stat_report).
Viewport standard: 1440×900 (spot: 1024×800). Screenshots: `evidence/hx/r2/before/` (15).

Method: three independent evidence layers —
1. DOM computed-style audits (deterministic, hard numbers; see audit commands below)
2. Full source read of `web/src/styles.css` (2,363 lines) against craft-spec-v2
3. `token-drift-lint.mjs` (this dir; mechanical scan, 52 findings at baseline)

## Verdict

The v2 token core (lines 1–250: palette LOCKED, three-voice type, 4px grid, motion
whitelist, WCAG-verified pairs) is disciplined and correct. The failure mode is
**migration incompleteness**: per-component legacy rules below line ~500 silently
override the token system through higher specificity and later position. The system's
own documented rules are violated in 52 places; one specificity accident disables the
product's core semantic voice.

## Defect ledger

### D1. Sub-12px text at scale (BLOCKER-class, a11y + craft §1 floor)
694 DOM elements render below 12px on the run overview alone. Sources:
`.run-item-idline .id-text` 10.5px (styles.css:583), `.run-item-domain` 10.5px (:586),
`.run-item-bottom` 11.5px (:598), `.run-item-error` 11.5px (:600), `.claim-quote cite`
11.5px (:936), `.source-link` (:937), `.assumption-kind` (:956), `.op-diff` (:989),
`.receipts .hash-cell` 11px (:996), `.event-detail summary` (:1030), `.activity-item time`
11px (:1065), command-palette (:1222), responsive block 10px (:1505,:1510),
research-page meta (:1621,:1664,:1680), composer (:2147-2179 incl. 9px), (:2218).

### D2. Statement voice silenced (semantic defect, worst single finding)
`.fieldlist-row dd { font-size: 12.5px }` (:761, specificity 0,1,1) defeats
`.hyp-statement { font-size: 15.5px; font-family: serif }` (:953, 0,1,0). Every
hypothesis statement rendered through the fieldlist pattern computes to **12.5px** —
the serif statement voice exists in family but not in size. DOM-proven:
`.hyp-statement` computed 12.5px/27px. The product's central scientific artifact
loses its designed voice to a utilitarian rule.

### D3. `.mono` uses 0.92em (:173) → fractional computed sizes
0.92em of 14px = 12.88px; nested inside 12px aux = 11.04px. Produces the odd
12.88/11.04px computed values seen in DOM. Data voice must be absolute `--fs-data`.

### D4. Off-scale sizes 13.5px/13px/15px
Inputs+tabs 13.5px (:616,:652,:713,:1040), plan-objective/empty-title 13px (:966,:836),
hero-input/composer 15px (:265,:1910), 0.85rem (:1576), 30px (:1859), 20px (:2121).
Scale says: body 14, aux 12, data 12.5, statement 15.5/18, h1 22.

### D5. Radius drift
3px: rank bars (:390,:398), run-item-domain (:589), ev-balance (:2134... actually
2147-2150 area), :819; 8px: welcome-card (:254), composer card (:2261); 6px/12px:
command palette (:1202,:1211), convo (:1895). System: 4px + pill. DOM shows 3px
`.run-item-domain` and 3px `.rank-bar`.

### D6. Line-height hardcodes vs tokens
`.run-header-question` lh 30px (:1627) vs `--lh-h1: 28px` (:39); letter-spacing 0.005em
vs base h1 −0.01em (conflicting intents in one file). `.hyp-statement--featured` 27px
(:2043).

### D7. Off-grid spacing
3px/6px/10px/14px/18px gaps/paddings throughout component layers (run-item gap 3px
:561, runs-list 6px :518, hyp-head margin 8px ok but gap 6px :952 area, hyp-foot 14px,
plan-steps 10px, revision-chain 14px, etc.). Grid: 2/4/8/12/16/24/32/48.

### D8. Sub-pixel borders
DOM: `.hyp-card` computed borderTopWidth **0.666667px** (declared 1px :950) — blurry
hairline on Windows rendering. Root cause to verify during fix (likely a transform or
zoom context ancestor).

### D9. Motion guards incomplete
Keyframes all opacity-based (whitelist-compliant ✓): banner-pulse (:379, guarded ✓),
skeleton-pulse (:823, guarded ✓), arrive (:826, guarded :829), spin (:917, **unguarded**
transform), activity-pulse (:1053, unguarded), run-header-pulse (:1649, unguarded?),
attach-spin (:1802, unguarded transform), dictation-pulse (:1964, unguarded?),
tl-pulse (:2011, unguarded?). `prefers-reduced-motion` must disable every animation.

### D10. Chart theming caveats
RadarCompare hardcodes `SERIES_COLORS = ['#2d78bd','#b3352c','#3d8b5f']` — documented
compromise ("legible on both themes"), quantitative identity not semantic state.
SVG-native components (PlanDag etc.) inherit CSS vars ✓. ECharts rebuild on theme flip
not yet verified.

### D11. Vision audit (single successful pass, empty-state home)
Centered hero title vs left-anchored composer creates axial tension; chip radii vs
composer card radii inconsistent (confirmed by D5); hover affordances on chips weak;
send button icon-only discoverability. Cross-check each against DOM before acting.

## Non-defects (verified good — keep)
- Palette LOCKED (design-palette-v1.json), WCAG pairs verified, dark token flip via
  `[data-theme]` + `prefers-color-scheme` ✓
- Focus-visible rings comprehensive (12+ rules) ✓
- tabular-nums on tables + evidence stats (:771,:1732) ✓
- No horizontal overflow at 1440 or 1024 ✓
- Motion whitelist philosophy sound; data-arrival fade exists ✓
- Badge system (12px pill, on-tint pairs) ✓
- Zero hardcoded non-token text colors in rendered body (rgb(0,0,0) hits are head-only)

## Fix program (implementation order)
1. Typography convergence to scale (D1, D3, D4) — incl. `.mono` → `--fs-data`
2. Statement voice restoration (D2) + statement lh tokens (D6)
3. Radius convergence (D5); sub-pixel border fix (D8)
4. Spacing grid convergence (D7)
5. Reduced-motion guards for every keyframe (D9)
6. Evidence-glyph signature scale-up (craft-spec §8, 16-20px statement glyphs)
7. token-drift-lint → 0 findings (committed as lane QA gate)
8. Viz semantic audit (uncertainty/lineage/compare encoding + fallbacks) (D10 + lane mandate)
9. Re-screenshot after-set; blind review; iterate to clear win
