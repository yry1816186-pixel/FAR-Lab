# Rediscovery Evaluation — FIRE-Bench Design Adaptation (W-EV2/Wave-3 #3)

**Date:** 2026-08-22 · **Harness:** `eval/rediscovery.mjs` (committed a05a746) · **Results:** `eval/results/rediscovery.jsonl` (+ `-runs.jsonl`) · **Decisions:** D-029/D-029b

## Design (what this is, and is NOT)

- Mechanism extracted from the FIRE-Bench paper (arXiv 2602.02905, ICML 2026): score an agent's output against an ESTABLISHED finding via atomic-claim decomposition + set matching — objective ground truth, no quality-judge circularity. Official repo has **no LICENSE** (harness self-implemented, zero third-party code executed); HF dataset (Apache-2.0) is **network-blocked** from this environment (huggingface.co unreachable) — the 5-task seed set is authored in-repo from textbook-established findings (each task records its rationale).
- Scored artifact = the TOP hypothesis (statement + mechanism + predictions + expected falsification relation) of a real `research start` run — **rediscovery at hypothesis level**. NOT comparable to official FIRE-Bench agent scores (full-cycle agents design AND EXECUTE experiments; FAR-Lab is Direction-A by competition scope).
- Protocol per task: real run (DeepSeek live, OpenAlex budget-exhausted → crossref+arXiv carried retrieval, D-029b) → deterministic top-hypothesis render (tournament winner) → LLM decomposes agent text AND ground truth into atomic claims → LLM matches claims pairwise → deterministic P/R/F1.
- Disclosed limits: ground-truth CONTENT is objective (established findings); claim decomposition and matching are **uncalibrated DeepSeek steps**; N=5 authored tasks (not externally curated).

## Results (5 tasks, judge pass 2; pass-1 numbers shown for variance)

| task | P | R | F1 | pass-1 F1 |
|---|---|---|---|---|
| antibiotic-cdiff | 1.00 | 1.00 | **1.00** | 1.00 |
| crispr-offtarget | 0.56 | 0.60 | 0.58 | 0.56 |
| arg-plasmid-transfer | 0.58 | 0.44 | 0.50 | 0.17 |
| crc-ici-failure | 0.33 | 0.88 | 0.48 | 1.00 |
| egfr-tki-resistance | 0.31 | 0.38 | 0.34 | (run failed pre-fix) |
| **mean** | **0.56** | **0.66** | **0.58** | 0.68 (n=4) |

**Judge-step variance is LARGE and must dominate any reading:** re-judging the SAME runs moved task F1 by up to ±0.5 (arg 0.17→0.50; crc 1.00→0.48) — decomposition granularity and match strictness vary between passes despite temperature 0. Honest conclusions:

1. Two tasks (cdiff, crc-in-pass-1) show the pipeline CAN perfectly rediscover an established mechanism end-to-end (hypothesis+evidence+plan from live retrieval).
2. Across 5 tasks the mean F1 ≈ 0.5-0.7 band with high variance — partial rediscovery is typical; no task scored 0.
3. The metric's own judge steps are the noisiest component; a future hardening (deterministic claim-matching via embeddings, or multi-pass median) is recorded as a follow-up, not silently applied.

Run IDs (all `completed`): cdiff run_a73mdjam…, arg run_1egsvvs…, crispr run_ffv483w…, crc run_0ryc6a6…, egfr (final pass, post mixed-provenance fix) — see `eval/results/rediscovery-runs.jsonl`.

## Incidents found & fixed during execution (D-029b)

- OpenAlex keyless daily budget materialized mid-eval (verbatim "Insufficient budget … Resets at midnight UTC"); crossref added as third retrieval family (its adapter existed but was never used by the query plan — nominal redundancy); budget-429s skip retry.
- `decisionRuleProvenance` gained `'mixed'` after a live mid-run rejection (model twice asserted a truthful mixed provenance the 3-value enum rejected); one dist rebuild was missed initially (process slip, caught by the retry failure, rebuilt and verified).
- `research start` CLI can return at run creation while execution continues — the harness now polls run status to terminal before recording/judging (two frozen `running` runs and one early-judge risk were the tuition).
