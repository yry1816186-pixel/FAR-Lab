# Claim→Hypothesis Relation Precision Spike (W-EV2 close-out)

**Date:** 2026-08-22 · **Spike:** `spikes/relation-precision.mjs` (blind re-judging) · **Output:** `spikes/output/relation-precision.jsonl` (25 records) · **Judge:** deepseek-chat t=0 — SAME family as the pipeline generator, so agreement is an UPPER BOUND on precision; disagreement may be judge error as well as pipeline error. N=25 stratified (supports 12 / contradicts 8 / weakens 5; qualifies quota unfilled).

## Result (upper-bound estimates)

| pipeline label | exact match | +adjacent (contradicts↔weakens, qualifies→supports) | verdict |
|---|---|---|---|
| supports | 7/12 (58%) | 9/12 (75%) | tolerable upper bound; disagreements are granularity (supports vs qualifies) |
| contradicts | **1/8 (13%)** | 3/8 (38%) | **insufficient** — D-018 reversal trigger condition met |
| weakens | 2/5 (40%) | 3/5 (60%) | small n, ambiguous |
| overall | 10/25 (40%) | 14/25 (56%) | — |

## Attribution (main-agent inspection of all 15 disagreements)

1. **Topically distant links (2 hard cases):** e.g. a graph-MARL claim linked as counter evidence to a radio-galaxy-equivariance hypothesis; a stable-rank-convergence claim vs a double-descent hypothesis. The critique stage had **no deterministic topical gate** on claim→hypothesis links (D-018's prefilter covers only claim–claim pairs). Root defect, deterministic fix available.
2. **Label-granularity semantics (majority):** pipeline `supports` judged `qualifies` because the claim supports the hypothesis's general premise but not its specific novel mechanism; pipeline `contradicts` judged `qualifies`/`weakens` because the claim narrows scope rather than refuting. The critique prompt forces counter links into a binary {contradicts, weakens} commitment.
3. **Genuine match exists** (1/8 contradicts + 2 adjacent): the mechanism is not uniformly broken; it over-commits.

## Root fix implemented (same session)

- `src/pipeline/stages/evidence.ts`: shared `topicalOverlap`/`hasTopicalOverlap` gate exported (same rule as the D-018 claim–claim prefilter: containment ≥ 0.25 or ≥ 4 shared content tokens).
- `src/pipeline/stages/falsify.ts`: critique links (counter + supporting) now pass the deterministic topical gate against the hypothesis statement+mechanism; dropped links produce visible warnings + summary counts, do NOT become evidence relations, and the stored spec's claim-id lists stay consistent. Test: `topical gate: topically distant critique links are dropped with a warning` (tests/pipeline-hypotheses.test.ts). Suite 239/239.

## What this spike does NOT justify

- **ONNX NLI cross-checker activation (registry B deferred item):** the trigger condition ("LLM-only relation precision measured insufficient") is met for `contradicts`, but the measured defect pattern (topicaldistance + label granularity) is NOT what an NLI entailment model fixes — NLI contradiction-vs-neutral has the same granularity ambiguity on scientific text, adds ~227MB deps against the zero-runtime-dep protected invariant, and would flag most of the same boundary cases with different noise. REJECTED for this defect pattern; trigger rewritten in `research/TECH_CANDIDATES.md` B (re-activate only if topically-close pairs still show low precision after the gate).
- **No before/after re-measurement yet:** the gate changes which links exist; a fresh blind re-judging on a post-gate run is the honest follow-up (needs a new live run; queued behind the Marginal Value Gate decision).

## Reproduction

```
node spikes/relation-precision.mjs            # live DeepSeek judge, ~25 calls
# resume/extend: REL_PREC_QUOTA='{"contradicts":12}' REL_PREC_EXCLUDE=<file> node spikes/relation-precision.mjs
```
