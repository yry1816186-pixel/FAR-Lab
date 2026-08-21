# EV1 Before/After — Wave-1 external-intelligence fusion (F1-F4)

- **Before**: `eval/results/metrics.json` computedAt 2026-08-21T17:50:22Z (runs of 2026-08-21, pre-fusion code)
- **After**: `eval/results/metrics-ev1.json` computedAt 2026-08-21T18:28:49Z, runs pinned in `eval/problems-ev1.json` (all 6 problems, DeepSeek live route, fused pipeline 98b1609 + cda5844 + envelope-unwrap fix)
- Batch driver: `eval/run-ev1-batch.mjs` → `eval/results/ev1-runs.jsonl`; metrics: `FARLAB_PROBLEMS=eval/problems-ev1.json node eval/metrics.mjs`
- Baselines (baseline-direct / baseline-rag) are UNCHANGED external anchors and are not re-run.

## Aggregate (protocol metrics, 6 runs each side)

| metric | before | after | Δ |
|---|---|---|---|
| runs completed | 6/6 | 6/6 | held |
| source_verification_rate | 1.000 | 0.9667 | −0.033 (see P5 note) |
| claim_binding_rate (verified/total) | 1.000 (58/58) | 1.000 (81/81) | held at ceiling |
| counter_evidence_relations_mean | 16.0 | 32.67 | **+104%** |
| counter_evidence_coverage (runs with any) | 0.833 | 0.833 | held (P5 abstains) |
| hypothesis_distinctness | 0.6133 | 0.6791 | +0.066 |
| representatives_mean | 5.5 | 6.5 | +1.0 |
| falsification_completeness_rate | 0.9667 | 0.9778 | +0.011 |
| plan_executability_pass_runs | 5/5 | 5/5 | held (P5 honest abstention, both sides) |
| live_receipt_rate | 1.0 | 1.0 | held |

## Corpus & evidence volume (sums over the 5 evidence-bearing runs)

| metric | before | after | Δ |
|---|---|---|---|
| sources_total (6 runs) | 57 | 75 | +32% (all planned queries now execute; cap raised to 12) |
| claims_total | 58 | 81 | +40% |
| evidence_relations_total | 262 | 598 | +128% |

Per-run claims: P1 15→15, P2 4→22, P3 4→3, P4 12→12, P5 0→0, P6 23→29.
P2's jump (4→22) is the fusion working as designed: the before run dropped planned
queries and fused a thin corpus; the after run executes all queries (RRF pool 18+),
enforces counter-evidence seats, and gap-seeks when verified claims stay thin.

## Mechanism attribution (fused features, live-observed)

- **F1 retrieval fusion (D-015)**: after runs show retrieve model_calls=2 (plan+rerank)
  and 12-doc corpora with counter seats ≥4 (live run_zr0gc5jxy…: pool 18→cap 12, rerank applied).
- **F2 tournament (D-016)**: rank stage calls 17–27 per run (pairwise matches, both-order
  verdicts) vs 1–4 before; final ordering tournament-first with BT aggregation.
- **F3 literature novelty (D-017)**: expansion+neighbor-search+adjudication calls inside
  generate_hypotheses (calls 7→8 per run); 2 novel_speculation labels honestly
  downgraded to incremental in the live verification run.
- **F4 claim-claim cross relations (D-018)**: contradicts relation counts rose
  (P1 11→19, P2 15→17, P4 12→18, P6 45→103) — the cross-relation channel populates
  targetClaimId (previously always empty).

## Costs and honest notes

- **Token cost roughly doubled**: total tokens 402,702 → 744,995 (+85%), driven by
  tournament pair calls, rerank, novelty adjudication and larger corpora. Median per-call
  latency unchanged (~1.9–2.9 s); wall-clock per run is comparable or better than the
  slowest before runs (P4 8.5 Ms → 0.30 Ms; P6 8.2 Ms → 0.48 Ms; before-run outliers
  were network stalls, so this is not claimed as a speed improvement).
- **P5 (honest abstention)**: unchanged 0 claims / 0 hypotheses / no plan on both sides —
  the pre-declared degenerate-question case; the system refuses to fabricate. Its
  after-run source_verification is 12/15 (0.8): gap-seek added 3 docs whose direct
  OpenAlex verification marks resolved=true, but 3 of 15 remained unverified and are
  counted honestly — visible, not hidden.
- **P2 mid-batch failure → fixed at root**: DeepSeek wrapped a falsification spec in a
  single-key envelope (`{"falsification-spec": {...}}`), failing schema validation twice.
  Root fix: 4th tolerance layer in `callStructured` (single-key envelope unwrap) +
  canonical enum-fold normalization (hyphen/underscore/space variants) + anti-envelope
  instruction in the transport JSON contract (commit pending). P2 resumed from its
  checkpoint and completed 9/9 — the recovery path is live-verified too.
- These are single-batch numbers on 6 problems with a non-deterministic model;
  deltas are directional evidence, not significance-tested claims.
