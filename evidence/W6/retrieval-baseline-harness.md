# W6 · Retrieval-Quality Baseline Harness (landed BEFORE any main-path change)

Wave-6 hard precondition per wave prompt: a deterministic, regressable retrieval-quality
baseline must exist before touching the retrieval main path. Landed 2026-08-22.

## Artifacts

| Artifact | Role |
|---|---|
| `eval/retrieval-baseline.mjs` | Deterministic offline harness: replays persisted run objects (`.far-run/far.db`) — no LLM, no network. CLI + exported pure functions (`computeRunMetrics`, `ndcgAtK`, `aggregate`, `compareReports`). |
| `tests/retrieval-baseline.test.ts` | 10 discriminating tests (fixture-exact metrics, hand-computed nDCG values, guarded before/after red/green). |
| `eval/results/retrieval-baseline-before-w6.json` | Frozen BEFORE snapshot over ALL 46 persisted runs (current pipeline state). |
| `src/pipeline/stages/retrieve.ts` | `COUNTER_TERM_RE` exported (harness replays the REAL R-05 gate, no drift-prone copy). |

## Commands + evidence

- Build + smoke: `npm run build` (exit 0) → `node eval/retrieval-baseline.mjs --db .far-run/far.db`
  → `runs=46 pooledVerifyRate=0.9887 counterGatePass=1 rerankApplied=0.7391 truncated=0.8043`;
  medians: `holeRate=0 abstractCov=0.8333 identResolv=1 zeroResultRate=0.4286 counterZero=1 poolSize=23.5`
- Frozen snapshot: `node eval/retrieval-baseline.mjs --db .far-run/far.db --out eval/results/retrieval-baseline-before-w6.json` (written)
- Tests: `npx vitest run tests/retrieval-baseline.test.ts` → 10/10 passed
- Mutation check (test discrimination): injected `resultCount === 99` defect into the
  zero-result filter → `1 failed | 9 passed` (zero-result test RED) → reverted → 10/10 green.
- Full suite baseline BEFORE any Wave-6 fusion: `npm test` → **295/295 passed** (19 files),
  `npm run typecheck` exit 0 (2026-08-22, includes in-flight Wave-4 provider changes).

## Metric set (per run + aggregate medians + guarded compare)

- plan: query counts by purpose/family, R-05 counter-vocabulary gate replay, familyFailures
- searches: attempted/ok/failed, **zeroResultRate**, **counterZero** (counter searches returning nothing), totalResultCount
- pool: poolSize, poolYield (pool/Σresults), rerankApplied/counterSeatsKept
- corpus: abstractCoverage, parseOk, identifierResolvability (verify ceiling), familyShare, yearMedian, distinctKeys
- verification: resolvedRate (north-star basis), titleMatchRate, holeRate (BEIR hole-analogue: corpus share without resolved verification)
- compare mode: guarded metrics (resolvedRate/holeRate/abstractCoverage/identifierResolvability/zeroResultRate/counterZero
  + pooled resolvedRate + counterSeats floor) — exit 1 on any guarded regression.
- nDCG@k: trec_eval formula (linear gain, log2 discount) implemented for the future judgment layer;
  BEIR delegates the same formula to pytrec_eval (beir/retrieval/evaluation.py:98-101); hole/MRR/recall_cap
  shapes from beir/retrieval/custom_metrics.py:6-126 (file:line verified).

## Headline findings (real DB, 46 runs, 455 retrieve receipts)

Direct DB cross-check (independent of harness code, 2026-08-22):

| family | ok | zero | fail | meanResults | zeroRate |
|---|---|---|---|---|---|
| openalex | 125 | 0 | 77 | 5.52 | 0.000 |
| arxiv | 192 | **158** | 4 | 0.81 | **0.823** |
| crossref | 57 | 0 | 0 | 6.00 | 0.000 |

1. **arXiv structural waste**: 82.3% of executed arXiv searches (158/192) return HTTP 200 with
   zero entries — long keyword-phrase queries vs arXiv coverage/syntax. Median run wastes 43%
   of its searches (zeroResultRate median 0.4286).
2. **Counter-evidence is effectively single-sourced**: `buildTargets` routes counter[0]→openalex,
   counter[1]→arxiv (retrieve.ts:111-128). arXiv zeroes 82% → counterZero median 1/run;
   crossref redundancy (D-029b) NEVER covers counter queries.
3. Verify ceiling: identifierResolvability median 1.0, holeRate median 0 — the current verify-rate
   residual is NOT identifier/query-shaped (consistent with the query-decomposition scout's
   attribution: EV1 0.9667 residual = one degraded P5 run, not a retrieval failure class).
4. Pool pressure: poolSize median 23.5 vs cap 12 → 80.4% runs truncated (rerank window 24
   covers the pool in most runs).

## Discipline notes

- Same input → same output (pure functions over persisted rows; no clock/random in metrics).
- Compare semantics: same DB, same run selection; fusion A/B on identical fixtures (see
  WAVE6-SCOUT measurement plan for the golden-fixture replay strategy).
- The harness is Wave-6's fusion gate executor: every fusion lands only with
  `ZERO_GUARDED_REGRESSION` (or better) on before/after.
