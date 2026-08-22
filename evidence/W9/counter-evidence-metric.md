# Wave-9 · counter-evidence-substantive-hit — metric definition + historical backfill

**Date:** 2026-08-22 · North-star entry: `counter-evidence-substantive-hit` (target 0.70, stretch 0.85)

## Definition (primary, strict)

Of the claim→hypothesis relations the pipeline labels as counter signal (`pipelineLabel ∈ {contradicts, weakens}` — the operational form of "counter-evidence seats whose relation…"), the fraction that survive **blind same-family re-judging** with a counter-family label (`judgeLabel ∈ {contradicts, weakens}`).

- **Secondary (limiting):** `judge ∈ {contradicts, weakens, qualifies}` — a qualification genuinely bounds the hypothesis (substantive for revision) but is not unambiguous counter evidence. Always reported alongside.
- **Miss decomposition (always reported):** misses split into **inverted** (judge=supports — actively harmful) vs **empty** (judge=unrelated — decorative label) vs **qualifies-only**. Different remedies: inverted suggests label mechanism bugs; empty suggests seat/claim binding without counter semantics.
- Wilson 95% intervals mandatory (n is small). Computed by `eval/counter-evidence-metric.mjs` (offline, deterministic, zero API calls, pure function of recorded re-judge jsonl).

## Historical backfill (command-level, 2026-08-22)

`node eval/counter-evidence-metric.mjs spikes/output/relation-precision.jsonl spikes/output/relation-precision-contradicts-r2.jsonl spikes/output/relation-precision-fullfix.jsonl`

| sample | counter-labeled n | strict hit | strict rate (Wilson 95%) | limiting rate | inverted/empty/qualifies-only |
|---|---|---|---|---|---|
| pre-fix pooled (relation-precision.jsonl) | 13 | 4/13 | **0.308** [0.127, 0.576] | 0.615 | 2 / 3 / 4 |
| pre-fix contradicts re-check (contradicts-r2) | 12 | 2/12 | **0.167** [0.047, 0.448] | 0.250 | 2 / 7 / 1 |
| **post-fix, current pipeline (fullfix)** | 7 | 1/7 | **0.143** [0.026, 0.513] | 0.143 | 1 / 5 / 0 |

## Honest reading

1. **The current pipeline is far below the 0.70 target: strict 0.143.** No inflation: the north-star `current` now carries 0.143 with this file as evidence.
2. Post-fix misses are mostly **EMPTY (5/7 unrelated), not inverted** — the D-023 topical gate + D-024 label discipline stopped inversions (pre-fix contradicts were largely unrelated-but-asserted; post-fix contradicts that survive are honest), but the residual is semantic: counter-origin seats bind claims that are topically adjacent yet not counter-assertive. This is D-038's finding restated at the metric level.
3. **n is small (7–13).** Wilson intervals overlap across eras; the pre→post "drop" is not a significant regression claim — it is the strict lens revealing what the pooled lens hid (pre-fix 0.615 limiting was carried by qualifies-only hits).
4. **Improvement route (recorded, not claimed):** the falsify-stage adjudication through the judge-v2 borderline layer (3-vote majority) is the designed fix for the semantic residual; live re-measurement gated on model routes (D-036). Raising the strict rate to ≥0.70 plausibly requires BOTH adjudication quality AND corpus-seat targeting (counter-origin seats that actually carry counter-assertive claims) — split out when live measurement resumes.
