# W6 · Live verification round (2026-08-22, D-072/D-073)

## Route truth (protocol root cause closed)

- The supplied key targets bigmodel's **Anthropic-compatible** endpoint
  `https://open.bigmodel.cn/api/anthropic` (x-api-key + /v1/messages) — all earlier 401s were
  OpenAI-protocol probes against the wrong surface (user-identified; D-072). Parallel session
  landed the zai→Anthropic-wire provider switch (a50d2ec, D-058/D-071).
- **glm-5.3 verified with ONE structured call** (quota-conserving per user directive):
  `ok=true, model=glm-5.3, latency 924ms, usage {187,7}, finishReason=stop` — structured JSON
  passed on the first attempt through the tolerance chain (no strict-FC on this wire).
- The 5-hour window limit (1308, verbatim reset 14:15:29) had lifted by the time of this round.

## After-data (N=3 full pipeline runs, ZERO additional model quota spent by this session)

The three live runs (glm-4.6 route, executed by a parallel session minutes earlier through the
current tree that contains F1-F5) serve as the after population:

| run | verify | counterZero | variantRecovery | poolSize | rerankWindows | counterSeats |
|---|---|---|---|---|---|---|
| run_2p7jzqbc | 11/12 (1 transient) | **0** | 6 attempts → 3 queries recovered, 18 docs | 48(capped) | 3 | 4 |
| run_52bfbgyc | 12/12 | **0** | 8 → 4 recovered, 22 docs | 48(capped) | 3 | 4 |
| run_bvzyg47e | 11/12 (1 no-persistent-id) | **0** | 5 → 3 recovered, 13 docs | 62 | 3 | 4 |

Fusion live-effect evidence (vs 46-run before snapshot):

- **counterZero median 1/run → 0** (F1: counter[1] on crossref, 0% zero vs arXiv 82.3%)
- **planned zeroResultRate median 0.4286 → 0.2857** (F2 cascade recovering empty arXiv searches;
  receipts carry the variant marker; variantSearches recorded in every fusion block)
- **poolSize median 23.5 → 62** (recovered docs widen the pool; rerank engages 3 windows in all
  runs — F4 exercised live, rerankWindows=3 recorded)
- counterSeatsKept=4 everywhere; counterGatePass 100%

## Guarded compare verdict: HAS_REGRESSIONS — gate NOT discharged (honest)

`node eval/retrieval-baseline.mjs --compare before-w6.json after-live-w6.json` →
improved: zeroResultRate, counterZero; REGRESSION: resolvedRate-median (1→0.9167),
holeRate (0→0.0833), abstractCoverage (0.8333→0.75), pooled resolved (0.9887→0.9444);
counterSeatsFloorHeld=true. Attribution (DB-verified per doc):

1. resolvedRate/holeRate/pooled residuals = 2/36 docs: one transient arXiv-verify network error
   (http=0, retriable by design) + one openalex record with no doi/arxiv id (openalex+pubmed
   only — a class that predates F1-F5). NOT fusion-caused; N=3 median is noise-sensitive.
2. **abstractCoverage regression IS F1's real trade-off**: crossref counter-evidence documents
   frequently carry metadata-only records (run_2p7jzqbc: 5 crossref docs without abstract).
   F1 trades "counter seat empty (arXiv 82.3% zero)" for "counter seat filled but sometimes
   abstract-less". Net positive for counter-evidence hit-rate (the wave's stated failure class),
   negative for abstract coverage of those seats.

Follow-up recorded (not silently accepted): counter-seat crossref docs without abstracts are
prime candidates for the existing fulltext-deepening budget (arXiv-HTML/EuropePMC/TEI routes)
and/or a metadata-only penalty in the rerank prompt — both need their own evidence before
landing. Gate discharge requires N≥5 same-protocol runs + the coverage trade-off either
mitigated or explicitly accepted by DECISIONS.

## Harness fixes found by this round (real-use bugs)

- `--compare BEFORE AFTER` read the same index twice (compared a file with itself; first real
  use caught it — pure-function tests didn't cover CLI arg parsing). Fixed.
- pool metrics now expose `variantSearches`/`rerankWindows` from the fusion record.
- Determinism replay refreshed over all 49 runs: pooledVerifyRate 0.9859, gate metrics stable.

## Quota ledger (user directive: conserve)

This session's own model spend: **1 glm-5.3 smoke call (194 tokens)**. All after-data reused
runs a parallel session had already paid for. No further live calls without explicit approval.
