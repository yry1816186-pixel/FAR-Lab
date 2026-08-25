# Handoff 06 → 10 — statistical-executor family wiring (lane-06 audit outputs)

- **From:** lane 06 scientific-reasoning (`ws/r2/06-scientific-reasoning`)
- **To:** lane 10 scientific-execution
- **Date:** 2026-08-25
- **Urgency:** normal (no blocker; each item is dormant capability or a known statistical-honesty upgrade)

## 1. `conformalInterval` (src/domain/conformal.ts) — zero production callers

Lane 06 audited all dead deterministic algorithms per constitution §5 (wire or delete).
`conformalInterval` is a correct split-conformal implementation (finite-sample
fail-closed, honest guarantee string) with **no production consumer in lane-06
semantics** — the prediction ledger is categorical (RPS/Brier over verdict classes),
so there is no honest numeric-residual consumer on our surface. The honest consumer is
YOUR plane: regression predictions from the sklearn sidecar carry a preregistered
i.i.d. split — exactly the exchangeability assumption the module documents.

**Request:** at experiment-result emission, compute split-conformal intervals on held-out
calibration residuals (`conformalInterval(residuals, prediction, alpha)`) and persist
`low/high/alpha/nCalibration/guarantee` verbatim on the result object. Surface alpha and
the calibration size wherever the interval renders (the module's own doc block states
why: an interval without its n is unfalsifiable). Do NOT backport a copy — import
`src/domain/conformal.ts` as the single owner.

## 2. Hartung-Knapp adjustment — meta-analysis CI under-coverage at small k

`src/experiment/meta-math.ts` / `executor-meta.ts` (your files) implement DL + z-CI.
Cochrane has required Hartung-Knapp (t_{k-2}) for random-effects MA since 2022; DL z-CI
under-covers at small k, which is precisely our regime. Lane 06 did NOT touch your
files (ownership). Suggested implementation: HK t-quantile via a ~40-line
noncentral-free t approximation or the sidecar (scipy is locked in your plane).

## 3. Holm step-down alongside Bonferroni

Alpha allocation is currently Bonferroni-equal-split only (campaign alpha ledger +
plan-formal multipleTestingPolicy). Add Holm(1979) as an accepted policy value —
uniformly more powerful, still deterministic. The plan-formal gate
(`IMPLEMENTABLE_PLAN_STATISTICS` in `src/pipeline/stages/plan-formal.ts`) is lane-06's;
once your executor supports a `holm` statistic/policy value, send the handoff back and
we will extend the admissible set on our side.

## 4. `RatingDistribution` + `ratingEntropy` (src/domain/formal.ts) — zero production callers

Rating aggregation utilities (expectation + normalized Shannon entropy). Honest
consumer: heterogeneity disclosure on meta-estimates (`meta-estimate.ts` is yours).
Wire as disclosure (entropy of the rating distribution next to the pooled estimate) or
hand back a delete decision — keeping it dead violates constitution §5.

## 5. permutation / wilson / kappa executors (preregistration-integrity gate follow-up)

Lane-06's fail-closed gate (`IMPLEMENTABLE_PLAN_STATISTICS`) currently admits only
`bootstrap_ci | descriptive`. When your executors land these statistics, notify lane 06
to widen the admissible set — the gate intentionally tracks the executor surface
one-to-one (no promisable-without-executable analysis).

## 0. ENVIRONMENT ALERT (2026-08-25, urgent for your lane) — sidecar NaN regression

During lane-06 final gates, ALL real-python-sidecar tests began failing with
`ValueError: Out of range float values are not JSON compliant: nan`:
`tests/experiment.test.ts` (9), `tests/dataset-audit.test.ts` (3),
`tests/cli-experiment.test.ts` (1), `tests/exploration-runner.test.ts` (1).
**Proof this is NOT lane-06 code:** a temp worktree at the untouched R2 base tag
`47cc373` (fresh `npm ci`) fails `tests/experiment.test.ts` identically
(9 failed / 17 passed, same ValueError); these tests PASSED in the same worktree at
the same commit earlier the same day. The shared uv/python sidecar environment
(numpy/scipy/sklearn resolution or interpreter) drifted mid-day. Your plane owns the
sidecar — pin the environment and this family should recover.

## Context references

- Lane-06 report: `.planning/concurrency/reports/r2/06-scientific-reasoning-report.md`
- Prior science audit: `.planning/handoffs/SCIENCE.md` (chain-resident, ported into
  the lane branch with the science residue chain `2dcc474^..2db6a24`).
