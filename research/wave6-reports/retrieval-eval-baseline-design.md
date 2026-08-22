# Wave-6 Scout · retrieval evaluation line (main-agent executed, not just designed)

This scout line was scheduled as design work; the main agent went one step further and LANDED
the harness this wave depends on (subagent route was rate-limited). Design and implementation
notes are in `evidence/W6/retrieval-baseline-harness.md`; this report records the source
extraction + design decisions.

## BEIR metric extraction (beir-cellar/beir, Apache-2.0; file:line → .cache/repos/beir)

| metric | source | formula/behavior | note |
|---|---|---|---|
| nDCG@k | delegated to pytrec_eval (`ndcg_cut_k`) — beir/retrieval/evaluation.py:98-101,117-121 | linear gain / log2(rank+1) discount vs ideal ordering | we implement the same trec_eval formula in TS (`ndcgAtK`) for the future judgment layer |
| MRR@k | beir/retrieval/custom_metrics.py:6-34 | 1/(rank+1) of first relevant in top-k, averaged | implemented on demand |
| Recall_cap@k | custom_metrics.py:37-62 | hits@k / min(|relevant|, k) — corrects recall's tiny-qrels inflation | informs future recall-style metrics |
| Hole@k | custom_metrics.py:65-93 | share of top-k OUTSIDE the annotated corpus | **ported as an analogue**: corpus share without resolved verification (`verification.holeRate`) |
| top_k_accuracy@k | custom_metrics.py:96-126 | ≥1 relevant in top-k | informational |

## What we did NOT copy

- BEIR's dataset harness (18 datasets, loaders, dense/sparse retriever wrappers) — wrong shape
  for a pipeline-internal regression harness.
- pytrec_eval dependency (Python) — zod-only runtime invariant; the ~30-line TS formula suffices.

## FAR-Lab harness design (as landed)

- `eval/retrieval-baseline.mjs`: deterministic replay of persisted objects (corpus_snapshot,
  source_document, source_retrieval receipts) from `.far-run/far.db`. No LLM, no network.
- Three metric layers, honestly separated:
  1. **deterministic offline** (live now): plan-shape conformance incl. R-05 gate replay,
     zeroResultRate / counterZero, pool composition, coverage/resolvability, verify outcomes,
     holeRate.
  2. **judgment-based** (schema ready): nDCG@k vs known-relevant sets (e.g. rediscovery GT
     established-findings docs) — requires a relevance qrels builder, deferred until fusion
     needs it.
  3. **live-only** (gated by D-036): verify-rate on fresh runs; until routes return, before/
     after runs on the frozen 46-run snapshot + targeted keyless probes (arXiv/crossref).
- Guarded compare mode with exit-1 on regression (the wave gate executor); frozen before
  snapshot at `eval/results/retrieval-baseline-before-w6.json`.
- Tests: `tests/retrieval-baseline.test.ts` 10/10 (mutation-checked: injected defect → red).

## First findings the harness surfaced (46 runs, 455 receipts)

1. arXiv search zero-result rate **82.3%** (158/192; mean 0.81 results per 200).
2. Counter-evidence queries structurally never touch crossref (buildTargets routes
   counter[1]→arxiv); counterZero median 1/run.
3. identifierResolvability median 1.0, holeRate median 0 — verify residual is not
   identifier-shaped.
4. poolSize median 23.5 vs cap 12 → 80.4% runs truncated at cap (rerank window 24 usually
   covers the whole pool).
