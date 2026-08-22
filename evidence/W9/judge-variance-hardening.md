# Wave-9 · D-029 Judge-Hardening Completion — fixed GT + gold-calibrated thresholds + variance replay

**Date:** 2026-08-22 · **Owner:** Wave-9 (evaluation science & judge calibration) · **Decisions:** D-029 (closed), D-039 (this wave's record)

## What this closes

D-029 recorded that same-run re-judging swung task-F1 by ±0.5 (arg 0.17→0.50→0.00; crc 1.00→0.48→0.58), making the rediscovery metric directional-only. D-037 landed judge v2 (deterministic TF-IDF matching + 3-vote borderline adjudication) but with two unresolved defects. Wave-9 closes both and measures what remains.

## Defect 1 found by gold calibration (the D-037 thresholds were miscalibrated)

Built a **main-agent-annotated gold pair set**: every claim's TF-IDF best counterpart across the recorded v1 decompositions vs the FIXED GT — 104 pairs, 28 true / 76 false, each labeled by the main agent reading the full pair (protocol recorded per row in `eval/claim-pair-gold.jsonl`; generator `eval/gen-pair-gold.mjs`, annotator `eval/annotate-pair-gold.mjs`; zero API calls).

**Finding:** true-pair bestSim spans **0.124..0.656**, false-pair spans **0..0.331** — the D-037 thresholds (high 0.55 / low 0.15, calibrated against recorded v1 LLM match COUNTS — circular) misfired in both directions:
- a true pair at 0.124 was auto-REJECTED (false negative by determinism);
- a true pair at 0.508 was needlessly sent to adjudication; and the deterministic layer almost never matched (replay: f1Lower ≈ 0 on 4/5 tasks) — F1 information was effectively all carried by the LLM layer.

**Recalibrated under a zero-gold-error constraint** (the deterministic layer has no human review, so it may make ZERO gold errors): **high=0.40 / low=0.12** (equivalence band 0.34–0.50; 0.34–0.50 all tie at detShare 33% — the lexical separation ceiling). `eval/claim-match-calibrate.mjs` v2; regression-locked by `tests/rediscovery-judge.test.ts` (thresholds must make zero deterministic errors on gold; the old low=0.18 provably killed true pairs — kept as mutation evidence).

## Defect 2: GT-side decomposition variance

The GT was re-decomposed per judging pass — half the decomposition noise. Now **fixed**: every task carries a main-agent-reviewed `gtClaims` list (`eval/rediscovery-tasks.mjs`, `GT_REV=gt-fixed-2026-08-22`), authored from the recorded v1 median pass. The judge NEVER re-decomposes the GT. Agent-side decomposition gets a **fixed-granularity protocol** (atomic subject-mechanism-direction units, target count anchored to GT grain ±2, methodological predictions excluded, two GT-claim grain examples embedded — `buildDecomposeTask`). Pipeline single-sourced in `eval/rediscovery-judge.mjs` (judge v2.1) with defense-in-depth validation (the pipeline re-validates provider output itself — a provider adapter that skipped validation can no longer leak garbage claims; found by a failing test, root-fixed).

## Variance replay (offline, zero API calls, recorded data only)

`node eval/judge-variance.mjs --replay` → `eval/results/judge-variance-replay.json` (2026-08-22 run):

| task | recorded passes | cross-decomposition swing (lower bound) | swing (upper bound) | v1 recorded LLM-matcher swing |
|---|---|---|---|---|
| egfr-tki-resistance | 1 | 0 | 0 | — |
| antibiotic-cdiff | 1 | 0 | 0 | — |
| arg-plasmid-transfer | 2 | **0** | 0.543 | 0.505 |
| crispr-offtarget | 1 | 0 | 0 | — |
| crc-ici-failure | 2 | **0.091** | 0.069 | 0.095 |

- **Matching-layer variance = 0 by construction** (pure function; same inputs → same F1; test-locked).
- **GT-decomposition variance = 0 by construction** (fixed claims).
- Cross-decomposition swing under the conservative (borderline-all-unmatched) reading: **max 0.091 < 0.15 target**. Under the generous reading the residual reflects ADJUDICATION-DEPENDENT width (**borderline share 57–76% post-calibration; deterministic share 24–43%**) — i.e. most of the F1 information rides on the adjudication layer, disclosed plainly; this is not run-to-run matching noise.
- The semantic overlap zone [0.124, 0.331] restates D-038 on clean labels: **lexical similarity has a hard ceiling on scientific semantics; the middle band belongs to the (majority-voted) adjudication layer** — determinism buys the extremes only. This is a structural property, not a tuning failure.

## Live variance measurement — BLOCKED (honest)

`node eval/judge-variance.mjs --live 3` re-judges the same completed runs R times through the identical production pipeline (what the north-star target <0.15 / stretch <0.08 is defined over). **Coverage audit (2026-08-22, pre-unblock):** eval/results/rediscovery-runs.jsonl carries only TWO valid runIds (arg-plasmid-transfer, crc-ici-failure — both completed in db); the other 6 lines are historical error entries without runIds. On unlock, run `node eval/rediscovery.mjs` FIRST — its phase-1 increment logic re-runs the 3 missing tasks (egfr/cdiff/crispr, same blockers previously) — THEN `--live 3` measures all 5; without the top-up the live variance would cover 2/5 tasks only. Provider routing: deepseek default or FARLAB_JUDGE_PROVIDER=dashscope (9ba64f6). **Blocked: all model routes down** — deepseek chat 402 Insufficient Balance (probe 2026-08-22 this session, verbatim; /models 200 does NOT imply spendable balance), zai 401 token expired, dashscope keyless. Harness ready; single recharge (any of three routes, D-036) unblocks. North-star `rediscovery-judge-variance` current stays **0.5 (v1 measured) with the v2.1 offline evidence noted** — no live claim made.

## Adversarial audit (2026-08-22, post-fix record)

First audit round verdict REJECT: 1 P0 + 3 P1. All fixed same session:
- **P0** borderline adjudication received a POSITIONAL fallback (`gtClaims[0]`) instead of the similarity-best counterpart (borderline entries had `match:null` and the `?? [0]` fallback fired — majority of live adjudications would have compared the wrong candidate). Root fix: `thresholdMatch` borderline entries now carry `bestIdx`; regression test with an unrelated GT[0] locks the correct counterpart is delivered (35-test suite).
- P1 label swap in this file (deterministicShare vs borderline share) — corrected above.
- P1 three unsynchronized threshold copies — `rediscovery-judge.mjs` and `judge-variance.mjs` now import `MATCH_DEFAULTS` (single source, mutation-locked).
- P1 missing partial-vote-failure tests — added (1-1 tie no-match, 2-0 match, all-fail visible, misaligned verdicts discarded).
- P2 stats-report catch-all now fails visibly on corrupt jsonl (missing file still skips); P2 decompose-prompt justification rewritten truthfully (two GT claims ARE visible to decomposition — bounded granularity anchor, disclosed as a limitation, not "leaks nothing"); P3 docstring/count/comment fixes included.

Statistics layer was independently recomputed by the auditor (permutation exact-mode enumeration, BH monotonicity, Wilson endpoints, krippendorff hand case, cluster SE closed form, pooled SE, pass@k product form) — all correct. Gold labels spot-checked 14 pairs: coherent with protocol; single-annotator circularity remains a disclosed limitation (second annotator when a live route funds an independent labeling pass).

## Tests

`npx vitest run tests/rediscovery-judge.test.ts` → **35/35 green** (median pass behavior, protocol anchoring, determinism-given-calls, fail-visible on 402/malformed/empty, majority-vote, defense-in-depth validation, P0 counterpart regression, partial-vote failures, misaligned verdicts, gold zero-error regression, old-threshold mutation evidence, statistics layer incl. exact-permutation hand-enumeration, kappa, krippendorff, BH step-up, cluster SE, pooled SE, MDE gate, reducers incl. pass@k hand cases).

**Mutation spot-check discipline (required by baseline) — and what it caught:** the first mutation attempt (default `low` 0.12→0.13 inside `thresholdMatch`) did NOT redden the gold test — the test hardcoded its own thresholds and was **decorative against exactly that defect class** (test passed while production was broken). Root fix: production defaults exported as `MATCH_DEFAULTS` (frozen) in `claim-match.mjs`, test now imports and locks THEM. Re-run of the same mutation on the constant → test RED (1 failed) → revert → green. Verified discriminating. The adversarial audit later proved the same lesson on the P0: a single-claim GT in the majority-vote test masked the counterpart-selection bug; the new regression test uses a 3-claim GT with an unrelated GT[0].

## Inter-rater mitigation attempt (audit P2 #6) — honest record

Attempted a blind second annotation of the 104-pair gold set via an independent subagent (annotating only from pair text). **Failed twice on data integrity**: pass 1 returned 107 labels, pass 2 (explicitly re-counted) returned 108, and the two arrays differed cell-wise (the rater is also self-inconsistent) — no trustworthy alignment is derivable, and guessing a truncation is out of the question. The dataset therefore REMAINS single-annotated (main agent), with its circularity disclosed as before. Standing mitigations: (1) annotation protocol recorded per row; (2) the adversarial auditor independently spot-checked 14 pairs against the protocol and found all coherent; (3) a proper second-annotation pass (human or a hardened labeling pipeline) is queued as a W-P2/live-restored candidate. No gold file changes were made by the failed attempts (verified: 104 rows, no secondLabel fields).
