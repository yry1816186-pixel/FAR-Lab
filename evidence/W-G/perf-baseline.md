# Wave-G WP4 · Performance Baseline Profile (measurement first — no optimization without data)

Date: 2026-08-22 · Source of truth: `.far-run/far.db` receipts (57 runs, 2996 receipts,
1740 model calls — the full historical live corpus), web/dist, timed offline suites.
Method note: live re-measurement of a fresh full run is BLOCKED (model routes unfunded,
D-036); the profile below is measured from recorded receipts of REAL live runs (not
synthetic), and offline mechanisms are benchmarked with the deterministic test-stub.

## 1. Where the time goes (per receipts, summed across all runs)

| Stage | Calls | Mean latency | p50 | p95 | Total (s) | Share |
|---|---:|---:|---:|---:|---:|---:|
| critique_falsify | 288 | 24.5s | 21.5s | 53.7s | 7068 | 39.0% |
| rank | 551 | 7.2s | 3.1s | 38.5s | 3950 | 21.8% |
| generate_hypotheses | 283 | 13.8s | 7.0s | 39.3s | 3907 | 21.5% |
| plan | 35 | 44.7s | 35.4s | 109.3s | 1565 | 8.6% |
| build_evidence | 441 | 2.7s | 2.5s | 6.0s | 1197 | 6.6% |
| retrieve (keyless APIs) | 82 | 3.6s | 2.0s | 7.5s | 294 | 1.6% |
| scope | 57 | 2.1s | 1.8s | 4.7s | 117 | 0.6% |
| revise | 3 | 13.0s | 7.4s | 24.3s | 39 | 0.2% |

Headline: **the pipeline is model-bound** — 18138s summed model-call latency vs ~294s in
ALL source-HTTP latency. Local compute (parsing, canonical hashing, sqlite) is noise.
Avg 30.5 model calls/run ≈ north-star's recorded 6–8 min wall-clock.

## 2. Structural finding: every heavy loop is SEQUENTIAL

- `src/pipeline/stages/evidence.ts:296` — per-document claim extraction: `for … await`
- `src/pipeline/stages/falsify.ts:221` — per-hypothesis falsification: `for … await`
  (verified: each call's inputs come from the STORE — no cross-iteration data dependency)
- `src/pipeline/stages/rank.ts:377` (scoring batches) and `:533` (tournament pairs): sequential
Wall-clock ≈ SUM of call latencies; with bounded concurrency c, it approaches SUM/c for
these segments. This is the W8-recorded "parallelization stretch (p50 ≤ 4.5min)" — never
started because live measurement was blocked; implementation + offline verification is
executable now, live soak stays gated.

## 3. Secondary surfaces

- sqlite: W8 lease-watchdog poll was a full table scan on runs(status, lease_expires_at) —
  fixed in WP2 (migration v4 index, D-067). step_outputs/step_fingerprints queries are
  PK-covered. objects listing is covered by idx_objects_run.
- web bundle: dist 2.1MB total — fonts ship BOTH .woff and .woff2 subsets (ibm-plex
  mono/sans × weights); sourcemap:true emits full maps into dist (parallel-session zone:
  queued; local-first product so P3, not P0).
- Test suite wall-clock (offline): 595 tests / 27 files ≈ 5.1s — healthy; no action.
- Memory: no pipeline-stage memory pressure observed at 12-doc corpus cap (bounded by design).

## 4. Optimization executed (this wave): bounded intra-stage concurrency

**Mechanism**: `mapBounded` (src/pipeline/stages/shared.ts) — order-preserving bounded pool,
first-by-index error selection, `FARLAB_STAGE_CONCURRENCY` (default 3, floor 1 = sequential
escape hatch). Wired into the three independent-call loops: falsify per-hypothesis (incl. its
nested link-audit calls), rank scoring batches, rank tournament pairs, evidence per-document
extraction. Call count, payloads, per-item failure semantics, checkpoint keys, receipts, and
all aggregate ORDER are unchanged — only call overlap differs. Test-stub gained
`forPurpose`-keyed scripting (call-identity instead of call-sequence) so scripted tests are
interleaving-proof; the one affected fixture was converted.

**Measured before/after (deterministic stub benchmark, spikes/waveg-concurrency-bench.mjs,
4 scripted falsification calls × 120ms, identical outputs at both settings):**
- sequential (concurrency=1): **534ms**
- bounded (concurrency=3): **272ms** → **1.96× on the falsify segment**, outputs byte-identical
  (hyp order + outcome equal). Threshold: ≥5% — passed by 39×.
- Extrapolation to a real run (honest, NOT a live claim): parallelizable model-latency pool =
  falsify 7068s + rank 3950s + evidence 1197s ≈ 12.2ks of the 18.1ks total; at effective
  overlap 2–3× these segments shrink to ~4–6ks → projected full-run wall-clock cut of ~35–45%
  (north-star run-wall-clock 6–8min → ~3.5–4.8min, stretch p50≤4.5min potentially met).
  Live re-measurement stays BLOCKED on model routes (D-036) — recorded as UNVERIFIED-live.

**Not pursued (recorded with reasons)**: batching tournament pairs per prompt (changes judge
protocol — order/context effects on scientific judgments; eval-gated), prompt trimming in
critique_falsify (changes scientific semantics; live A/B required), web font/bundle work
(parallel-session zone), retrieve/DB micro-work (already ~1.6% of wall-clock).

