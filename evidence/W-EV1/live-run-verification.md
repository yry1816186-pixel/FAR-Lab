# W-EV1 live verification — fused pipeline end-to-end (DeepSeek live)

Run: run_zr0gc5jxykqmrztw11j9czqef0 (completed 2026-08-22, 9/9 stages, exit 0)
Question: Does intermittent fasting improve insulin sensitivity in adults with prediabetes vs continuous calorie restriction...

## F1 retrieval fusion (D-015)
- queries executed: 8 (was 6 pre-fusion; both planned discovery/supporting queries now run)
- pool 18 unique docs -> rerankApplied=true -> cap 12, counterSeatsKept=4/4
- algorithm: rrf-k60+llm-listwise-rerank-v1

## F4 claim cross relations (D-018)
- claims: 7 (verified 7)
- cross claim-claim relations persisted: 9 (targetClaimId channel, previously never populated)
- relation mix: {"qualifies":7,"supports":2}

## F3 literature novelty (D-017)
- assessed representatives: 4 / cap 4
  - hyp_cajfp57b3jfhz59rxeyapksxcg: corpusLabel=mixed -> literature=incremental (neighbors=5)
  - hyp_vqta6b2r20k511t70k7797bqst: corpusLabel=novel_speculation -> literature=incremental (neighbors=5)
  - hyp_bq3qrv44gt4fmeab9qvnnxdbwa: corpusLabel=novel_speculation -> literature=incremental (neighbors=5)
  - hyp_deaddyvx3fe0h8w9zrxk3y1swb: corpusLabel=mixed -> literature=incremental (neighbors=4)
- novelty-illusion correction observed: 2 novel_speculation labels downgraded to incremental against retrieved neighbors

## F2 pairwise tournament (D-016)
- participants: 7 | matches: 15 (full round-robin, 5 per candidate)
- order-swap consistency: 15/15 consistent verdicts across presentation orders
- standings: #1 4W-0L bt=6.828658 | #2 4W-1L bt=0.164391 | #3 3W-1L bt=0.002355 | #4 2W-2L bt=0.002298 | #5 2W-3L bt=0.002297 | #6 0W-4L bt=0 | #7 0W-4L bt=0
- zero no-contests; rationales cite mechanism specificity / falsifiable thresholds / evidence grounding (anti-style judging)

## Provenance
- model_call receipts: 47 | executionMode: 100% live | model: deepseek-chat
- source_retrieval receipts: 28
- far verify bnd_fgmxd7ywshm7mpmqekh3ksmvqf: verdict=verified, 10/10 checks PASS, exit 0
- bundle sha256:2d4e20dbfe4f2bd6ac7bffbe128dc62921f4ff014a839f3b0606f96bb9ff2f56

Commands: node dist/cli/main.js research start "<question>" --domain ... --json; node dist/cli/main.js verify bnd_...
