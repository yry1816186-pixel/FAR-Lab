# Ω-ULTRA Three-Way Benchmark Protocol (Wave 0 skeleton, 2026-09-02)

Extends `eval/PROTOCOL.md` (W4, pre-declared 2026-08-21). W4 discipline — pre-declared
reading rules, strong baselines, verbatim failure reporting, `uncalibrated_llm_judgment`
labels, no cherry-picking — carries over unchanged. This file adds the Ω comparison frame
required by OMEGA-ULTRA-CONTRACT.md P9: every Ω wave must show reproducible numbers for
CURRENT vs REBUILT vs NAKED on the same frozen problems.

## Legs

| Leg | What runs | Anchor |
|---|---|---|
| CURRENT | the tagged baseline system (`omega-baseline-w0` git tag, fixed pipeline FAR-Lab) | pinned live bundle in `eval/omega/anchors/` |
| REBUILT | same procedure at current HEAD after each Ω wave | new bundle per wave |
| NAKED | `eval/baseline-direct.mjs` (same provider module, no retrieval) — delegated, unchanged | `eval/results/baseline-direct.jsonl` |

## Procedure (per bundle)

1. Frozen problem sets: `eval/problems.json` (P1–P6) and `eval/problems-ev1.json` (EV1),
   `FARLAB_PROBLEMS` pinning rule as in W4. No problem is added/removed after seeing results.
2. Each run launches through the real CLI
   (`dist/cli/main.js research start <q> --domain --goal --route zai --json`) into an
   isolated `FARLAB_DATA_DIR` workspace under `eval/results/omega/` — real pipeline, real
   orchestrator, real adapters; never test doubles.
3. Route is pinned ON the run (`--route`), never inherited; model route identity is recorded
   from receipts. DeepSeek remains BANNED (user directive 2026-08-22).
4. Terminal states: `partial | completed | failed | cancelled`. Failures land in the bundle
   verbatim; a failed problem is a REAL result (W4 rule).
5. Bundle records per problem: runId, status, stage outcomes, deterministic metric snapshot
   (reusing dist checkers: falsification completeness, plan executability, representatives),
   receipt mode mix (live/replay counts — retrieval response-cache replays must be disclosed),
   wall time, commit, tag, route, model, harness argv.

## Anchors and artifacts

- Raw workspaces stay in `eval/results/omega/` (gitignored).
- Sanitized bundle summaries (`eval/omega/anchors/<date>-<route>-<sha>.json`) are committed:
  metrics, ids, and provenance only — no model output text, no secrets.
- `node eval/omega/threeway.mjs status|pin|compare|naked` drives the harness; every leg fails
  visibly (non-zero exit + reason) when its precondition (live key, built dist) is missing.
  No silent offline fallback, ever.

## Reading rules

- Deterministic W4 metrics 1–7 compare directly across legs (higher-is-better set unchanged).
- Route drift is disclosed per bundle (PROTOCOL ADDENDUM rule): numbers from different
  routes are never averaged or silently compared.
- Judge-based metrics stay auxiliary and labeled; they never override deterministic ones.
- REBUILT vs CURRENT claims require the SAME problem set, route, and harness version.
