# Claim→Hypothesis Relation Precision Spike (W-EV2 close-out)

**Date:** 2026-08-22 · **Spike:** `spikes/relation-precision.mjs` (blind re-judging) · **Outputs:** `spikes/output/relation-precision{,-contradicts-r2,-f4}.jsonl` (3 rounds, 57 unique relations) · **Judge:** deepseek-chat t=0 — SAME family as the pipeline generator, so agreement is an UPPER BOUND on precision; disagreement may be judge error as well as pipeline error. Rounds 1/2/3: N=25 mixed / 12 contradicts-focused / 20 mixed (11 from a single run).

## Result (upper-bound estimates, deduped across all rounds)

| pipeline label | exact match | +adjacent (contradicts↔weakens, qualifies→supports) | verdict |
|---|---|---|---|
| supports | 11/18 (61%) | 14/18 (78%) | tolerable upper bound; disagreements are granularity (supports vs qualifies) |
| contradicts | **9/30 (30%)** | 12/30 (40%) | **insufficient** — D-018 reversal trigger condition met |
| weakens | 2/5 (40%) | 2/5 (40%) | small n, ambiguous |
| qualifies | 4/4 (100%) | 4/4 (100%) | small n, encouraging |
| overall | 26/57 (46%) | 32/57 (56%) | — |

**Run heterogeneity (disclosed):** contradicts precision is strongly run-dependent — round 3 drew 10 contradicts from one run (`run_28ph6sqq…`) and scored 8/10 exact there, while round 2 (12 fresh contradicts across 8 runs) scored 0/12. A per-run defect pattern, not a uniform failure: some runs label counter-evidence cleanly, others (including MLR-Bench ML-domain runs) systematically over-commit.

## Attribution (main-agent inspection of all 15 disagreements)

1. **Topically distant links (2 hard cases):** e.g. a graph-MARL claim linked as counter evidence to a radio-galaxy-equivariance hypothesis; a stable-rank-convergence claim vs a double-descent hypothesis. The critique stage had **no deterministic topical gate** on claim→hypothesis links (D-018's prefilter covers only claim–claim pairs). Root defect, deterministic fix available.
2. **Label-granularity semantics (majority):** pipeline `supports` judged `qualifies` because the claim supports the hypothesis's general premise but not its specific novel mechanism; pipeline `contradicts` judged `qualifies`/`weakens` because the claim narrows scope rather than refuting. The critique prompt forces counter links into a binary {contradicts, weakens} commitment.
3. **Genuine match exists** (1/8 contradicts + 2 adjacent): the mechanism is not uniformly broken; it over-commits.

## Root fix implemented (same session)

- `src/pipeline/stages/evidence.ts`: shared `topicalOverlap`/`hasTopicalOverlap` gate exported (same rule as the D-018 claim–claim prefilter: containment ≥ 0.25 or ≥ 4 shared content tokens).
- `src/pipeline/stages/falsify.ts`: critique links (counter + supporting) now pass the deterministic topical gate against the hypothesis statement+mechanism; dropped links produce visible warnings + summary counts, do NOT become evidence relations, and the stored spec's claim-id lists stay consistent. Test: `topical gate: topically distant critique links are dropped with a warning` (tests/pipeline-hypotheses.test.ts). Suite 239/239.

## Post-fix live verification (2026-08-22, same session)

Fix = deterministic topical gate (D-023) + schema-v2 label discipline (Wave-3 spec §5: explicit per-link relation enum, F4-style strict definitions + abstention in the prompt, bound quotes in availableClaims, weakens default via zod `.catch`). Full suite 240/240.

Live run `run_3c3zyycempz9dcqp509fmgmw8k` (P1 antibiotic-resistance domain, completed, exit 0): 21 claim→hypothesis relations = **contradicts 0** / weakens 1 / qualifies 2 / supports 18. Pre-fix runs on the SAME problem (P1 EV1 batch) produced 11–19 `contradicts` labels of which ~70% were wrong — the default-contradicts failure mode is structurally eliminated: `contradicts` now requires an explicit model assertion, and on this domain the model declined to make one.

Blind re-judging of this run (`REL_PREC_RUN` filter, N=11, `spikes/output/relation-precision-postfix.jsonl`): overall exact 6/11 (54.5%), +adjacent 7/11 (63.6%); supports 5/8 (62.5% ≈ pre-fix 61% — the residual supports/qualifies granularity boundary is unchanged, as expected for a label-discipline fix). contradicts precision is not re-measurable on this run (zero contradicts labels exist); judge errors 0.

Honest caveats: single run, N=11, same-family judge (upper bound); 0-contradicts could in principle be over-correction (missed genuine contradictions) — pre-fix evidence says its contradicts assertions were mostly wrong, so absence is more truthful than wrong assertions, but future domains should watch for missed genuine contradictions (follow-up recorded in D-024).

## What this spike does NOT justify

- **ONNX NLI cross-checker activation (registry B deferred item):** the trigger condition ("LLM-only relation precision measured insufficient") is met for `contradicts`, but the measured defect pattern (topicaldistance + label granularity) is NOT what an NLI entailment model fixes — NLI contradiction-vs-neutral has the same granularity ambiguity on scientific text, adds ~227MB deps against the zero-runtime-dep protected invariant, and would flag most of the same boundary cases with different noise. REJECTED for this defect pattern; trigger rewritten in `research/TECH_CANDIDATES.md` B (re-activate only if topically-close pairs still show low precision after the gate).
- **No before/after re-measurement yet:** the gate changes which links exist; a fresh blind re-judging on a post-gate run is the honest follow-up (needs a new live run; queued behind the Marginal Value Gate decision).

## Reproduction

```
node spikes/relation-precision.mjs            # live DeepSeek judge, ~25 calls
# resume/extend: REL_PREC_QUOTA='{"contradicts":12}' REL_PREC_EXCLUDE=<file> node spikes/relation-precision.mjs
```
