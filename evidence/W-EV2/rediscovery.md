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

---

## 2026-08-29 v2.2 recalibration — same frozen artifacts, instrument fixed (not the agent)

The artifacts and GT are UNCHANGED from the W-EV2 runs (`eval/results/rediscovery-runs.jsonl`); everything below re-judges the same `topHypothesis` renders. Measurement history on those artifacts:

| judge stack | mean F1 | arg / crc / egfr / cdiff / crispr |
|---|---|---|
| 2026-08-22 uncalibrated LLM pairwise matching (thinking on) | "0.58" | 0.50 / 0.48 / 0.34 / 1.00 / 0.58 |
| transport default thinking-off (2026-08-29) | 0.03 | judge votes failed outright |
| v2.1 concise decomposition enforcement | 0.14 | 0 / 0.375 / 0 / 0.308 / 0 |
| + floor 0.12→0.10, votes 3→5 (object-verdict bug still live) | 0.117 | 0 / 0.222 / 0 / 0 / 0.364 |
| **v2.2 = boolean-strict vote validator** | **0.226** | 0 / 0.612 / 0 / 0.154 / 0.364 |

### Two root causes found and fixed

1. **Object-shaped verdicts silently counted as NO** (real bug, not calibration): glm-5.3 intermittently returns `verdicts:[{k, verdict:"same"}]` instead of bare booleans; the validator only checked array LENGTH, and the consumer's `x === true` map turned every object element into a false vote. Live evidence: whole batches voting 0/5 on paraphrase pairs (e.g. "MSS tumors yield low TMB" vs "MSS tumors carry low nonsynonymous mutation burdens"). Fix: validator rejects non-boolean elements → failed vote (fail-visible/unscored), never a silent no; prompt pins the bare-boolean shape; regression test added.
2. **The 0.12 floor was calibrated on a gold set that never sampled below the floor.** The 2026-08-22 gold (104 pairs) was drawn from the borderline zone of the verbose-era decomposition; genuine terse-paraphrase matches landing below 0.12 (e.g. crispr seed-region phenomenological vs mechanistic framing, 0.119; cdiff umbrella entailment, 0.110) were invisible to it. Fix: NEW gold batch `eval/claim-pair-gold-v21.jsonl` (53 pairs, 13 true / 40 false, main-agent annotated under the recorded protocol) sampled from the v2.1 decomposition's below-floor AND band zones; merged 157-pair recalibration → `low 0.12→0.10` (zero gold errors; true min 0.110; grid optimum 0.11 rejected for 3-dp rounding margin), `high 0.40` unchanged (false max 0.331), votes 3→5. A length-robust containment signal was tested against the gold and REJECTED (true/false containment overlap 0.20–0.63 — no zero-error cutoff exists).

### The "0.58" was judge leniency, not rediscovery

On the SAME artifacts the old judge scored arg 0.50 and cdiff 1.00; the deterministic matcher scores both 0. Claim-level inspection confirms the matcher: the arg top hypothesis is about **biofilms** as gene-transfer hotspots while the GT is hospital conjugative-plasmid epidemiology (integrons/transposons/patient-to-patient — zero lexical bridge, topically disjoint); the egfr hypothesis is **lineage plasticity/small-cell transformation** while the GT is the T790M/MET story; cdiff-1.00 came from an LLM matcher that credited every topic-overlapping pair. The v2.2 number is the defensible one.

### Honest residuals (disclosed, not hidden)

- 2/5 tasks (arg, egfr): the pipeline's top hypothesis genuinely proposes a DIFFERENT mechanism than the established finding. For a hypothesis generator this may be legitimate behavior (novelty vs textbook convergence); for rediscovery scoring it is a miss. This tension is a product-level question, not a judge defect.
- Adjudicator strictness vs the gold protocol on umbrella-entailment pairs: cdiff "antibiotics disrupt the gut microbiota" ↔ "deplete protective taxa" is gold-TRUE but voted 0/5 (the reverse direction — specific→umbrella — does match). One disclosed disagreement; the instrument records it rather than tuning it away.
- Decomposition is re-run per measurement (3-pass median, temperature 0): agent-claim phrasing varies slightly run-to-run, so borderline composition shifts a few pairs; band sizes 3–12. The frozen part is the hypothesis text and GT.

Artifacts: `eval/results/rediscovery.jsonl` (v2.2 final), `rediscovery-buggy-verdicts-20260829.jsonl` (bug-era), `rediscovery-pre-v22-20260829.jsonl` (0.14-era). Judge: glm-5.3 via zai, thinking low gear, all vote batches 100% scored (0 failed calls in the final run).
