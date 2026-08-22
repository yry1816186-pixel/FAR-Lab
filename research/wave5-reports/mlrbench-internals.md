# Wave-5 Internals Report: chchenhui/mlrbench (source-level dissection)

- Source of truth: local clone `.cache/repos/mlrbench` @ HEAD of default branch (12,716 files; code lives in `mlrbench/` + `run_mlr_agent.py`, ~2.5k LOC total).
- License: MIT (repo `LICENSE`; quotes below are license-permitted).
- Scope: INTERNALS only. Benchmark surface (9-dim rubric union, ideation+proposal stages, 6.0 accept line, 30/30 adapter evidence) is already covered in `evidence/W-EV2/mlr-bench.md` and is NOT repeated.
- All `file:line` refs are relative to `.cache/repos/mlrbench/`.

## 0. License & layout

```
mlrbench/                  # the entire Python package (31 files)
  agent/                   # idea_generator.py, lit_review.py, proposal_generator.py,
                           #   experiment_runner.py, paper_writer.py, claude.sh, codex.sh
  evals/                   # review_idea.py, review_proposal.py, review_experiments.py,
                           #   review_writeup.py, overall_review.py, eval_hallucination.py,
                           #   performance_cost.py
  llm/llm.py, lmm/lmm.py   # OpenAI / Anthropic / OpenRouter clients; judge_mode
  utils/utils.py           # extract_json_between_markers, task list, multimodal load
run_mlr_agent.py           # end-to-end pipeline orchestrator
tasks/                     # 201 task .md files (verbatim workshop CFP text)
task_metadata.md           # curation decisions, workshop links, exclusions
agent_results/, agent_reviews/, ai_scientist_v2_papers/, human_eval/   # data trees (avoid)
```

Paper: arXiv:2505.19955. Dataset: HF `chchenhui/mlrbench-tasks`.

## 1. Judge design deep dive

### 1.1 Judge composition: single call, no panel, no debate

`rg -i "debate|vote|panel|aggregat|self-consistency"` over `mlrbench/` (the src tree) returns **zero hits**. "MLR-Judge" is the *name of the framework* (rubric + LLM reviewer), not a multi-agent debate protocol. Per artifact the judge is:

- **one prompt, one LLM call, one JSON verdict** — `review_idea()` mlrbench/evals/review_idea.py:128-161; `review_proposal()` review_proposal.py:139-226; `overall_review()` overall_review.py:128-226.
- **No self-consistency votes, no multi-round debate, no score aggregation code anywhere.** Judge reliability is demonstrated *out of band*: (a) each artifact is re-judged by several independent judge models (per-judge folders in `agent_reviews/idea_proposal_reviews_{gemini-2.5-pro-preview-03-25,claude-3-7-sonnet-20250219,...}/`), and (b) a human-agreement study (§4).
- **Order effects: structurally impossible** — each artifact is scored absolutely on its own; there is never a pairwise A/B in one prompt, hence no position-bias surface. (Trade-off: absolute scoring has well-known compression/anchoring issues; they handle it with band anchors instead.)

### 1.2 Exact judge prompt structure (idea judge, review_idea.py:10-125)

Six blocks, in order:

1. **Role + task frame** (l.11-13): "You are an expert machine learning researcher!" … evaluate 1-10 across five dimensions plus overall.
2. **Anti-leniency injection** (l.15): "Do not hesitate to assign lower scores if the idea does not fully meet the criteria. Avoid giving high scores by default." — appears verbatim in every rubric (idea l.15, proposal l.15, paper l.89/168, experiments l.8).
3. **Banded rubric per dimension** (l.19-62): each dimension gets exactly 5 anchored bands — `9-10 Excellent / 7-8 Good / 5-6 Satisfactory / 3-4 Needs Improvement / 1-2 Poor` — each band a full sentence describing the artifact quality, not just the number. No few-shot worked examples; anchors are textual only.
4. **Overall with non-average semantics** (l.64-79): separate 6-band anchor (`10 Outstanding / 8-9 Excellent / 6-7 Good / 4-5 Satisfactory / 2-3 Needs Improvement / 1 Poor`) plus 5 explicit consideration bullets: single critical weakness may lower overall; coherence/integration; likelihood of real-world impact; fulfillment of task as a whole; "unique strengths or fatal flaws not fully captured by individual dimensions". **Overall is produced by the same call, not computed — no weighting, no second call.**
5. **Strict JSON output schema** (l.81-124): `{"Dim": {"score": <1-10>, "justification": "..."}}` for all five dims + `OverallAssessment: {score, strengths[], weaknesses[]}`. **Score field precedes justification** — CoT is per-dimension justification written *after* committing the score, inside one JSON. No separate think-before-score step.
6. **JSON hygiene rules** (l.115-124): no text outside the block, no trailing commas, double quotes, no unescaped control chars, no NaN/Infinity, closed brackets.

Then the payload is appended in one user message (l.150-158): idea fenced in ``` blocks, then task fenced. Nothing else — no system prompt split, no examples, no length/style normalization of any kind.

**Judge inputs per stage** (grounding chain — important):
- idea judge: `idea` + `task` (review_idea.py:150-158)
- proposal judge: `proposal` + `task` + `idea` + `related_work` (review_proposal.py:169-185) — the judge literally reads the upstream artifacts the proposal is supposed to be consistent with.
- paper judge (`overall_review.py`): `paper` (markdown→text, or PDF via pymupdf4llm) + `task` + optional **entire code directory dump** (`read_combine_files`, utils.py:238-262, walks .py/.json/.log/.csv/... excluding outputs/data) + **figures as multimodal images** (`load_multimodal_content`, utils.py:186-208, regex-extracts `![](...)` paths and passes them via `media=` to the LMM client). Soundness bands explicitly probe fabrication: "Are the experimental results real or fake? … Are the visualization and analysis figures based on real experimental results or based on fake data?" (overall_review.py:45-46).

**Proposal judge quirks (bugs worth knowing):** rubric text says "considering all five dimensions above" while listing six (review_proposal.py:73); the entire Output-Format JSON block is **duplicated** — once inside the rubric (l.89-136) and again appended at call time (l.186-223). No regression tests on prompts; drift is invisible to CI.

### 1.3 Determinism and parsing hardening

- `create_client(..., judge_mode=True)` (llm.py:332-362): Anthropic → `temperature=0.0` (l.351-353); OpenRouter → `temperature=0.0` + `response_format={"type":"json_object"}` (l.356-359); OpenAI o-series → `reasoning_effort="high"` (l.344-346) but **no temperature pin** for OpenAI judges (asymmetry; o-family doesn't accept temperature anyway).
- `extract_json_between_markers` (utils.py:37-97) — a 4-stage repair pipeline: (1) fenced ` ```json ` regex; (2) fallback balanced-brace regex to nesting depth 4; (3) repair pass: escape backslashes inside `$...$` LaTeX, strip trailing commas, strip control chars; (4) second parse attempt with all `$...$` spans deleted. Returns first match that parses.
- Schema-validated retry loop in `overall_review`/`eval_hallucination` (overall_review.py:205-224): 3 attempts, each validates dict-ness + required keys (+ bool/list types for hallucination fields) before accepting; stepwise scripts instead check `len(result)==6` (idea, l.190) / `==7` (proposal, l.261) and skip-with-log on failure.

### 1.4 Separate hallucination detector

`eval_hallucination.py:10-45`: a second, independent single-call judge with 4 typed classes (Nonexistent Citations / Hallucinated Methodology / Mathematical Errors / Faked Experimental Results), a boolean `has_hallucination` gate, mandatory **`evidence` quote from paper/code** per finding, and `confidence` 1-5. Experiment-stage rubric also embeds a True/False hallucination item as dimension 1 (review_experiments.py:13-16).

## 2. Anchor-generation prompt structure (why anchors score ~7.8 idea / ~7.4 proposal)

All anchors are **single-pass, zero-iteration** prompts — no reflection loop, no best-of-N, no self-critique. The 7.8/7.4 comes from structure, not iteration:

| Stage | File:line | Constraint pattern |
|---|---|---|
| Idea | agent/idea_generator.py:13-21 | ≤**200 words**, exactly 3 sections (Title / Motivation / Main Idea incl. methodology, expected outcomes, potential impact). **Anti-flattening rule**: "there might be a couple of research topics in the task description, and you should focus on one of them" (l.15) |
| Lit review | agent/lit_review.py:14-30 | ≥**10 arXiv papers, 2023-2025 only**, rigid per-paper format (`**Title** (arxiv_id)` / authors / summary / year), ≤5 key challenges; run by a **search-enabled model** (`gpt-4o-search-preview-2025-03-11`, run_mlr_agent.py:32) — citations are real and recent |
| Proposal | agent/proposal_generator.py:15-26 | ~**2000 words**; Methodology must contain "full algorithmic steps **and/or mathematical formulas** where appropriate, and full details about experimental design … with **evaluation metrics**"; explicit LaTeX conventions (`$x^2$` inline, `$$…$$` block) |
| Experiment | agent/experiment_runner.py:13-53 | coding-agent prompt: mandatory figure classes (loss curves, metric-over-time, method-vs-baseline), labeled axes/legends, results tables in results.md, "Do not use synthetic results or generate any fake data" |
| Paper | agent/paper_writer.py:13-30 | 9 fixed sections; "If there is no image in the experiment results, please do not create or cite any fake figures"; direct figure paths, no placeholders; same LaTeX conventions |

**Mechanism mapping to the rubric anchors** (this is the causal story of 7.8/7.4):
- *Consistency 7-8 band* ("addresses most aspects"): one chosen topic from the multi-topic CFP keeps the idea aligned without trying to cover everything (the "focus on one" instruction).
- *Clarity 7-8 band*: 200-word cap forces concision; fixed section names map to what the judge reads for.
- *Novelty 7-8 band* ("new combinations … with clear distinctions from prior work"): the lit-review artifact supplies 10+ recent papers, and the proposal judge *reads the lit review* — anchors get positioned novelty for free.
- *Soundness 9-10 band explicitly says "Technical formulations are fully correct and clearly presented"* (review_proposal.py:48): the forced math + evaluation-metrics detail in the generation prompt feeds exactly this sentence.
- *Presentation/rendering*: forcing `$…$`/`$$…$$` LaTeX both (a) renders cleanly in review UIs and (b) survives the judge's own LaTeX-aware JSON parsing — a generation→judging co-design.

Pipeline orchestration (run_mlr_agent.py:51-88): strict stage sequence idea→lit→proposal→experiment→paper; every stage is idempotent (skip if output file exists) with max_retry=3 — though `generate_idea_for_pipeline`'s retry loop is broken: the `except` block re-raises immediately instead of continuing the loop (idea_generator.py:84-86), so ideas effectively get 1 attempt.

## 3. Task construction

- **201 tasks** in `tasks/` (2023: 73, 2024: 91, 2025: 37; README.md:25-29) — the FAR-Lab adapter's 50 is a subset. One task = one markdown file containing the **verbatim workshop call-for-papers text** (see `tasks/iclr2025_verifai.md`: ~6 enumerated "potential angles", datasets/benchmarks track, special theme). No structured schema, no gold answer, no difficulty tags — the task record *is* the CFP.
- **Curation protocol** (task_metadata.md): enumerate all ICLR/ICML/NeurIPS workshops 2023-2025 from OpenReview; exclusion rules applied and documented per-workshop: (1) no official website / deleted; (2) *non-general* (regional/community workshops: AfricanLP, IndabaX-Rwanda, LxAI; QueerInAI); (3) repeated workshops (with an explicit "TODO: check the details and delete one" — curation not fully closed); (4) workshops dropped "for unknown reason" are listed with links. Kept-counts recorded (e.g., ICML 2024: 24 of 33 kept). 9 ML topic categories for distribution reporting.
- **Contamination controls: none in the repo.** No decontamination scan, no held-out split, no cut-date flag. Tasks are public CFP text that predates model training cutoffs, so "contamination" here means models may have seen the workshop pages themselves — unaddressed and unmeasured in code. (Any contamination claim must come from the paper, not the repo.)

## 4. Statistical methodology (repo-side)

The only statistics code in the repo is `human_eval/compute_agreement_score.ipynb` (human-vs-judge agreement):
- Per (workshop, model) cell, computes **absolute-score-difference distributions** two ways: human↔human (all reviewer pairs, ≥2 reviewers per item) and human↔LLM.
- Per criterion (Novelty, Clarity, Soundness, Significance, Overall): **two-sided Mann-Whitney U** on the two diff distributions; the headline claim is "judge disagreement with humans is statistically indistinguishable from human-human disagreement" when p>0.05.
- Raw data shipped: `human_review.csv`, `llm_judge.csv`, `Hallucination Check.csv`, merged `merge_data.csv`.

There is **no bootstrap, no paired test, no variance report for model rankings** in the repo (mean scores across 201 tasks are computed in the paper/analysis, outside this codebase). Notably FAR-Lab's `eval/stats.mjs` (bootstrapMeanCI + pairedPermutationTest, 10k iters, seeded) is *stronger* than anything in the MLR-Bench repo.

## 5. Mechanism inventory

| # | Dimension | Mechanism | file:line | Summary | Why it matters | Port cost | Risk | FAR-Lab mapping |
|---|---|---|---|---|---|---|---|---|
| 1 | Judge prompt | 5-band textual anchors per dimension | review_idea.py:19-62; review_proposal.py:19-70 | Every dimension anchored at 9-10/7-8/5-6/3-4/1-2 with full-sentence band descriptions | Anchors stabilize absolute scoring without pairwise comparison | Trivial (prompt text) | None | FAR-Lab llm-judge rubric is 1-5 with embedded rubric; check band anchoring parity |
| 2 | Judge prompt | Anti-leniency injection | review_idea.py:15 (all rubrics) | "Avoid giving high scores by default" | Cheap calibration lever against grade inflation | Trivial | Over-harshness | FAR-Lab judge prompt — verify present |
| 3 | Judge prompt | Non-average Overall + critical-weakness veto | review_idea.py:64-79; review_proposal.py:72-87 | Overall judged in-call with explicit "not just the average; a single critical weakness may lower overall" | Prevents compensatory averaging masking fatal flaws | Trivial | None | FAR-Lab scorecard aggregation — check veto semantics |
| 4 | Judge prompt | Per-dimension justification inside verdict JSON | review_idea.py:85-113 | score+justification pairs, strengths/weaknesses lists on Overall | Auditability + implicit CoT; FAR-Lab already logs raw votes | Low | None | Compatible with judge-votes.mjs raw-vote retention |
| 5 | Judge I/O | Grounding-context judging (judge reads upstream artifacts) | review_proposal.py:169-185 | Proposal judged against task + idea + lit review simultaneously | Consistency dimension is only gradeable if judge sees the chain | Low | Longer prompts | FAR-Lab hypotheses judged with problem context; add provenance artifacts |
| 6 | Judge I/O | Multimodal figure evidence | overall_review.py:136-163; utils.py:186-208 | Figures extracted from markdown and passed as images to LMM judge; Soundness asks real-vs-fake of figures | Directly relevant to FAR-Lab "rendering omissions" gap | Medium (needs vision model) | Cost, model support | FAR-Lab export/report judging could pass figures |
| 7 | Judge robustness | LaTeX-aware JSON repair pipeline | utils.py:37-97 | fenced→balanced-brace fallback→backslash-escape `$…$`→strip trailing commas/control chars→retry with `$…$` removed | Math in justifications breaks naive JSON.parse constantly | Low (~60 LOC) | Repair could mangle content | Drop-in for FAR-Lab judge parsing |
| 8 | Judge robustness | Schema-validated 3x retry | overall_review.py:205-224 | Validate required keys/types; retry 3x; else fail visible | Suppresses silent malformed verdicts | Low | None | FAR-Lab has schema; add retry loop |
| 9 | Judge determinism | judge_mode temp-0 / json_mode | llm.py:344-359; lmm.py:278-287 | Anthropic/OR: temperature 0 + response_format json; OpenAI o-series: reasoning_effort high | Reproducibility per call | Trivial | OpenAI path has no temp pin | FAR-Lab provider pinning (DeepSeek) — verify |
| 10 | Hallucination | Typed hallucination detector w/ evidence quotes | eval_hallucination.py:10-45 | 4 classes, has_hallucination bool gate, mandatory quote, confidence 1-5 | Separates "bad" from "wrong"; quote requirement grounds findings | Medium | Separate model call cost | FAR-Lab lacks a fabrication detector on outputs |
| 11 | Uncertainty | Confidence 1-5 per verdict | overall_review.py:78-85,118 | Judge self-reports confidence | Cheap per-verdict uncertainty signal | Trivial | Self-report bias | FAR-Lab votes give spread; confidence is complementary |
| 12 | Generation | Anti-flattening "focus on ONE topic" instruction | idea_generator.py:15 | Task CFPs are multi-topic; generator told to pick one | FAR-Lab's own gap attribution says "task flattening" — this is the exact countermeasure in the anchor design | Trivial | None | FAR-Lab idea/hypothesis stage prompt |
| 13 | Generation | Forced math + metrics + LaTeX conventions in proposal prompt | proposal_generator.py:21-24 | "full algorithmic steps and/or mathematical formulas … full details about experimental design … evaluation metrics" + $/$$ rules | Soundness 9-10 anchor literally says "technical formulations fully correct and clearly presented"; LaTeX avoids judge-side JSON breakage | Trivial | None | FAR-Lab proposal rendering (gap: "rendering omissions") |
| 14 | Generation | Lit review ≥10 arXiv 2023-2025 via search model | lit_review.py:18-28; run_mlr_agent.py:32 | Structured, recent, real citations; judge sees them | Novelty 7-8 = "new combinations … clear distinctions from prior work" — needs prior work on the table | Medium (search tooling) | Search latency/cost | FAR-Lab evidence stage already retrieves; structure the novelty positioning |
| 15 | Stats | Human-agreement protocol (abs-diff + Mann-Whitney U vs human-human) | human_eval/compute_agreement_score.ipynb cells 9-10 | Compares judge-human disagreement to human-human disagreement | The only scientific-validity evidence for the judge itself | High (needs humans) | Small N | FAR-Lab has judge-variance replay but no human baseline |
| 16 | Tasks | Documented curation w/ exclusion rules | task_metadata.md | Per-workshop keep/drop decisions with reasons | Replicable corpus construction discipline | Low | TODOs unresolved (dup workshops) | FAR-Lab task-set provenance |

## 6. Top-8 ranked (highest leverage for FAR-Lab eval hardening + score gaps)

1. **Anchored band rubric + anti-leniency + critical-weakness Overall veto (mechanisms 1-3)** — review_idea.py:15,19-79. Verdict: PORT NOW. Three prompt-text changes; directly targets score calibration and the 7.4/7.0 proposal line (fatal-flaw veto prevents one weakness dragging while averaging masks compensations; anchors define what "7-8 Good" means operationally).
2. **LaTeX-aware JSON repair + schema-validated retry (7+8)** — utils.py:37-97, overall_review.py:205-224. Verdict: PORT NOW. ~80 LOC equivalent; eliminates the most common silent judge-output failure with math-heavy verdicts; fits FAR-Lab's zero-tolerance parsing discipline.
3. **Anti-flattening "focus on one topic" + forced methodology/math/metrics/LaTeX generation constraints (12+13)** — idea_generator.py:15, proposal_generator.py:21-24. Verdict: PORT NOW. Maps 1:1 onto FAR-Lab's diagnosed gaps (task flattening, rendering omissions); this is how anchors earn 7.8/7.4 without any iteration loop.
4. **Grounding-context judging (5)** — review_proposal.py:169-185. Verdict: PORT. Judge sees task+idea+lit-review when scoring downstream artifacts; FAR-Lab should pass the provenance chain into its judge prompts.
5. **Typed hallucination detector with mandatory evidence quotes (10)** — eval_hallucination.py:10-45. Verdict: PLAN. Separates fabrication from quality; natural extension of FAR-Lab's claim-match layer; needs a budgeted model route.
6. **Multimodal figure evidence to the judge (6)** — overall_review.py:136-163 + utils.py:186-208. Verdict: PLAN/SELECTIVE. Directly counters "rendering omissions" being invisible to text-only judges; requires a vision-capable judge model.
7. **Confidence 1-5 per verdict (11)** — overall_review.py:78-85. Verdict: PORT (trivial). Complements vote spread; feeds FAR-Lab's uncertainty reporting.
8. **Human-agreement protocol (15)** — compute_agreement_score.ipynb. Verdict: DEFER/BUDGET. The correct scientific-validity test for any judge (is judge-human disagreement within human-human disagreement?); FAR-Lab lacks it entirely but it needs human raters.

## 7. Rejection notes (looked at, decided NOT to take)

- **Single-call temp-0 judge as sole reliability mechanism** — MLR-Bench's one-call-per-artifact design (no votes, no median) is *weaker* than FAR-Lab's N-vote median + deterministic TF-IDF matching + fixed GT decomposition (eval/rediscovery-judge.mjs v2.1). Keep FAR-Lab's design; take only the prompt-anchoring layers on top.
- **No order-effect machinery to copy** — there is none in MLR-Bench (absolute scoring makes it moot); FAR-Lab's seeded blind-order comparative judging (llm-judge.mjs) is strictly more careful for A/B settings. Nothing to port.
- **Repo statistics** — Mann-Whitney U notebook only, no bootstrap/paired tests for rankings. FAR-Lab's stats.mjs already exceeds this. Nothing to port.
- **Duplicated Output-Format blocks / "five vs six dimensions" prompt bugs** (review_proposal.py:73,89-136,186-223; proposal_generator.py:18-19) — anti-pattern to avoid, not copy; argues for FAR-Lab keeping prompts as tested single-source constants.
- **`read_combine_files` whole-code-directory dump into the judge prompt** (utils.py:238-262) — crude context stuffing; unbounded prompt size, no relevance filter. FAR-Lab should not replicate; if code grounding is needed, select files deliberately.
- **Broken retry loop in idea pipeline** (idea_generator.py:84-86: `raise` inside `except` defeats the for-loop) — bug, not mechanism.
- **Contamination controls** — absent in repo; nothing to learn, but confirms any MLR-Bench anchor comparison must treat anchor scores as potentially contaminated (public CFP tasks).
- **OpenRouter/OpenAI/Anthropic client zoo** — FAR-Lab already has a provider abstraction; porting clients adds nothing.

---
*Report generated 2026-08-22 by Wave-5 subagent. All findings read directly from `.cache/repos/mlrbench` source; no code executed from the upstream repo.*
