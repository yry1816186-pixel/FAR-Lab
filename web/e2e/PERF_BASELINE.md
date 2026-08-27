# Web performance baseline (HX §21)

Measured by `web/e2e/perf.spec.ts` against the real product (scratch workspace,
deterministic offline corpus — 7 visible claims + 6 hypothesis cards on the
study map; run it yourself: `cd web && npx playwright test perf.spec.ts`).
CI gates the same budgets in the `web-e2e` job (runner-variance-safe ceilings).

## Local reference numbers (2026-08-27, Windows 11, system Edge channel)

| Surface | FCP | LCP | CLS | Long tasks |
|---|---|---|---|---|
| Home `#/` | 200–370ms | 200–370ms | 0.0002–0.039 | 0 |
| Study map `#study/<id>` (settled) | 108–128ms | 156–196ms | **0.0000** | 0 |

All within Google "good" (LCP ≤ 2500ms, CLS ≤ 0.1). CI ceilings assert
LCP < 4000ms and CLS < 0.1 — generous for shared-runner variance while still
catching order-of-magnitude regressions.

## Defect found and fixed while establishing this baseline

The settled study map initially measured **CLS = 0.259** (2.6× over budget).
Root cause (via a layout-shift-source diagnostic): the evidence/hypothesis
bands rendered their "empty" text during the first data fetch, then swapped to
the full band — a ~500px height jump. Fix (StudyMap.tsx + lab.css): a
`scienceLoaded` gate renders a height-reserving placeholder until the first
fetch settles; "empty" is now only ever honest. Map CLS after: **0.0000**
(settled) / 0.081 worst-observed during materialization.

## Not yet measured (recorded gaps, not silently skipped)

- INP (interaction latency): needs user-event instrumentation beyond the
  synthetic-click level; the perf spec's long-task count (0) is the current
  proxy.
- Large-corpus scaling (>100 claims / >20 hypotheses): the deterministic
  offline corpus caps at ~21 claims; a synthetic large-corpus fixture would
  be synthetic data — requires an explicit, labeled fixture policy decision.
