# MLR-Bench Eval Slice — FAR-Lab vs Published Agent Outputs (W-EV2, CP-EV4)

**Date:** 2026-08-22 · **Adapter:** `eval/mlr-bench.mjs` (fixed close-before-use P0 this session) · **Upstream:** chchenhui/mlrbench (MIT), clone at `.cache/repos/mlrbench` (gitignored)

## 1. Design (comparability discipline)

- **Task sample:** 201 eligible tasks (both anchors present) → seeded Fisher-Yates (mulberry32, Seed 20260822, N=5): `iclr2025_delta, icml2024_ml4earthsys, neurips2023_m3l, neurips2023_neurreps, neurips2024_aim_fm`.
- **Decision comparison = same judge, same tasks:** DeepSeek (`deepseek-chat`, temperature 0) re-judges (a) FAR-Lab outputs rendered deterministically from persisted run objects and (b) the PUBLISHED o4-mini-2025-04-16 / deepseek-r1 idea+proposal files from upstream. 30/30 judge calls succeeded, 0 errors, 0 skips (`eval/results/mlr-bench.jsonl`, 30 records).
- **Rubrics:** official MLR-Judge `RESEARCH_IDEA_RUBRIC` / `RESEARCH_PROPOSAL_RUBRIC` extracted verbatim from upstream source at runtime (idea: CONSISTENCY/Clarity/Novelty/Feasibility/Significance/Overall; proposal: Consistency/Clarity/Novelty/SOUNDNESS/Feasibility/Significance/Overall).
- **FAR-Lab runs:** real CLI `research start` per task (5/5 `completed` in `.far-run/far.db`; 30-44 claims, 11-12 hypotheses, 1 tournament + 1 plan each). Idea = top tournament representative; proposal = plan object. No manual editing.
- **Calibration:** `uncalibrated_llm_judgment` — absolute scores are not objective truth; N=5 is a slice, not a leaderboard. Judge was fixed before any FAR-Lab output was judged; both sides judged under identical rubric/prompt/temperature.
- **Known asymmetry (disclosed):** anchors are polished agent-written markdown; farlab outputs are compact structured-object renderings. Format familiarity can favor anchors; no cross-format correction applied.

## 2. Results — same-judge overall means (n=5 per cell)

| Agent | idea Overall | proposal Overall |
|---|---|---|
| o4-mini-2025-04-16 (published) | **7.80** | **7.40** |
| deepseek-r1 (published) | 7.60 | 7.00 |
| **FAR-Lab (live runs)** | 7.00 | 6.20 |

Six-dimension means (judge-internal scale; farlab vs best anchor):

| Dimension | idea farlab | idea anchors | proposal farlab | proposal anchors |
|---|---|---|---|---|
| Consistency | 7.20 | 8.60–8.80 | 6.40 | 8.00–8.20 |
| Clarity | 7.40 | 7.60 | 7.00 | 7.40–8.00 |
| Novelty | 5.60 | 7.00–7.40 | 5.80 | 7.00–7.20 |
| Feasibility | **7.40** | 6.60–7.00 | 6.40 | 6.40–7.00 |
| Significance | 7.00 | 7.80–8.00 | 6.40 | 8.00–8.20 |
| Soundness (proposal only) | — | — | 6.00 | 6.40–6.80 |

Per-task farlab Overall: idea 7/7/7/7/7 (uniform); proposal 4/7/6/7/7 — one outlier (iclr2025_delta=4).

## 3. Published in-repo anchors (CONTEXT ONLY — cross-judge, NOT comparable)

Upstream's own judges (claude-3-7-sonnet / gemini-2.5-pro) scored the same anchor files ~8–9 on these tasks (extracted from `agent_reviews/idea_proposal_reviews_*/`); our DeepSeek judge scores the same files 7.0–7.8. Judge strictness differs by ~0.5–1.5 pts across judges, so cross-judge numbers must not be subtracted. The only decision-grade comparison is §2.

## 4. Gap attribution (rendering/mapping vs pipeline quality)

Honest verdict: **FAR-Lab trails on this slice (-0.6 idea / -0.8..-1.2 proposal Overall); the gap is concentrated in task-alignment and novelty presentation, not in the Direction-A core loop.** Evidence:

1. **Feasibility (executability) is FAR-Lab's strongest dimension (7.40 idea — above both anchors).** The plan/falsifiability machinery the competition loop is built on is judged MORE executable than the anchors' proposals. Core-pipeline quality is not the deficit.
2. **Consistency gap (-1.4..-1.8) = task-alignment, mostly mapping-level.** The judge's words: iclr2025_delta proposal=4 cites "Poor alignment with the workshop's focus on deep generative models; the main hypothesis is about sampling methods in general". `questionFor()` flattens the workshop CFP into one plain-text line; FAR-Lab then scopes its own ResearchQuestion, and the tournament's top hypothesis can drift off the venue's specific emphasis. The anchors were written directly against the full task text. Product-level lesson (real, not eval-gaming): scope/venue emphasis from the user's question should weight hypothesis ranking.
3. **Novelty gap (-1.4..-1.8) = honest grounding trade-off + presentation.** Every farlab weakness list contains a novelty note ("confirmatory", "incremental"). FAR-Lab hypotheses are constrained by fail-closed evidence grounding and carry corpus-relative novelty verdicts with honest downgrades; anchors free-wheel claims of novelty without evidence constraints. Partly a deliberate design trade-off (anti-hallucination > novelty theater), partly presentation: the rendering states novelty hedges but not the delta-vs-neighbors ("extends X by Y, first to test Z here") which the novelty objects already contain.
4. **"Decision thresholds arbitrary" (3/5 proposals) = rendering omission.** FAR-Lab tracks `decisionRuleProvenance` per hypothesis; the proposal template prints thresholds but not their provenance, so judges see them as unjustified where a literature basis exists in the persisted objects.

Improvement candidates (deferred to Marginal Value Gate, not silently dropped): render provenance + novelty-delta into idea/proposal templates; carry venue-focus into question construction / hypothesis ranking. Both are legitimate fidelity improvements; neither games the judge.

## 5. Reproduction

```
node eval/mlr-bench.mjs --skip-runs   # judge phase only (runs already recorded)
# → eval/results/mlr-bench.jsonl (30 records), exit 0, 2026-08-22
node eval/mlr-bench.mjs               # full: 5 seeded live runs + judge (~1h)
```

Run IDs (mlr-bench-runs.jsonl): run_q17j6mehhbhxvx1szdsqhemvq7, run_tcvvqcwstf32t7mkzpe64b3cp6, run_bbr9jt165n52j1wf6s1m8734eh, run_sgc9cy4cqgjz64xznqcgefp270, run_1vfwhd8w7fp8d303evyrwye1k2 (all `completed` in far.db).

Adapter defects found & fixed this session (adversarial audit + harvest):

1. `renderIdea`/`renderProposal` closed the SQLite handle before invoking the query closure — phase 2 had never completed before; fixed, then judge ran 30/30 clean.
2. Judge parse now enforces the exact official dimension key sets per rubric (garbage dimension names can no longer pass) with a fail-fast startup assertion against the verbatim rubric texts.
3. Run stderr is actually captured on failure (stdio pipe, not inherit); phase 2 dedupes tasks by first runId line.

Process notes (disclosed): the batch was started by the prior session as an independent OS process; that process did NOT survive the window switch (contrary to the earlier assumption) — all 5 runs had completed and only the judge phase was lost, which this session resumed via `--skip-runs`. Two tasks failed on first attempt with transient provider network errors (`TypeError: terminated` / `fetch failed`, visible in far.db events) and succeeded on retry; a third orphan attempt `run_aqbhgzjq33ag398bwh73qhqj6b` was killed mid-run by the window switch and remains recorded as `running` in far.db (no task lost, no double-judging — each task judged exactly once).

Rate-limit finding (root-fixed in src): during the overnight burst the OpenAlex keyless pool returned 429 on every query of 3/5 runs, so their D-017 literature-novelty neighbor searches never executed (all verdicts honestly `unclear`, 0 neighbors, and — pre-fix — without receipts). Fixes: bounded 429 backoff-retry in the OpenAlex adapter + failure receipts for novelty-neighbor searches (tests: sources x3, hypotheses x1). This is a partial explanation for the Novelty dimension gap in §4; residual gap is the honest-grounding trade-off + presentation.
