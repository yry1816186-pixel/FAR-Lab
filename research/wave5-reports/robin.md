# Wave-5 Source Report: Future-House/robin (remainder, beyond tournament/BT)

Extraction: `.cache/repos/robin` (889 files, Python; core package = 8 files / 3,472 LOC). Report date: 2026-08-22.
Scope per assignment: hypothesis representation, wet-lab interface, reviewer ensemble (non-BT), literature grounding, round carry-over, gating. Tournament math (random pairs → choix ILSR) already ported to FAR-Lab TS — only parsing/hardening edges re-reported. All file:line refs read-verified. Upstream code treated as data; nothing executed.

## 0. License & layout

- **License**: Apache-2.0, verified — `LICENSE` (201 lines, canonical Apache 2.0 text). Compatible with FAR-Lab reuse/adaptation.
- **Layout** (everything else is notebooks + example outputs, no hidden libs):
  - `robin/candidates.py` (548 L) — therapeutic-candidate loop: query gen → Crow lit review → candidate ideas → per-candidate Falcon dossier → tournament → ILSR ranking.
  - `robin/assays.py` (277 L) — assay loop: query gen → Crow → assay ideas (strict JSON) → per-assay Crow dossier → tournament → top-1 assay → synthesized `candidate_generation_goal`.
  - `robin/analyses.py` (202 L) — wet-lab data ingestion: Finch-class R analysis (5 parallel) → consensus → LLM interpretation → `experimental_insights` dict.
  - `robin/multitrajectory_runner.py` (293 L) — generic external-agent job runner (Step/StepConfig/MultiTrajectoryRunner over EdisonClient).
  - `robin/utils.py` (975 L) — Edison `call_platform`, file IO, pair comparison, CSV parsing, APA formatting.
  - `robin/configuration.py` (330 L) — pydantic config, prompt registry + placeholder validator, agent-role mapping (CROW/FALCON).
  - `robin/prompts.py` (835 L) — every prompt verbatim (incl. 5-criteria ranking rubric, 4-field data-interpretation contract, notebook CoT guidelines, analysis/consensus queries for flow-cytometry & RNA-seq).
  - `robin_full.ipynb` / `robin_demo.ipynb` — orchestration; `examples/` (10 disease notebooks) + `examples/example_outputs/` (11 real run folders) + `robin_output/` (2 dry-AMD real runs).
- **Key negative findings up front**:
  1. **No automated multi-round loop.** The paper's 4-round iteration is manual notebook re-execution (`robin_full.ipynb` cells 11–15); OSS code has no round counter, no stopping criterion, no winner seeding. Round 2 = same `therapeutic_candidates()` re-run with an `experimental_insights` dict.
  2. **No hypothesis dedup/merge anywhere.** Diversity is prompt-only ("exactly N distinct"); duplicates occur in real outputs and enter the tournament as separate items (see §3.4).
  3. **No retrieval internals.** All literature work is delegated to FutureHouse's Edison platform (agents Crow = paper-qa-based lit QA, Falcon = deep lit-review reports) via `edison-client`. paper-qa itself is NOT a dependency (`uv.lock`: only `choix`, `edison-client`, `fhlmi`, `aviary`-family). Robin repo contributes only the client-call contract, not retrieval mechanics.
  4. **Upstream bug**: experimental-round ranking reads the stale initial-round dossier folder (`candidates.py:334-336` hardcodes `therapeutic_candidate_detailed_hypotheses` even when round-2 dossiers were saved to `..._experimental` at `candidates.py:317-321`). Real dry-AMD output shows 59 initial dossiers vs 30 experimental dossiers. Do not replicate this wiring when porting.

## 1. Hypothesis representation

Two tiers; no dataclass/zod-style schema for the hypothesis object itself; identity = name string; persistence = .txt files; no versioning, no stable IDs (only a pandas row index minted at ranking time).

### 1.1 Tier 1 — "idea seed" (3 plain fields)
- **Candidates**: `{"candidate", "hypothesis", "reasoning"}` parsed from custom-delimited text. Output contract: each idea wrapped in `<CANDIDATE START>` / `<CANDIDATE END>` lines; inside, `CANDIDATE:` / `HYPOTHESIS:` / `REASONING:` headers, one field per line-block (prompt `prompts.py:592-640`). Parser: split blocks, reject blocks missing the START marker, line-regex `^([A-Z_]+):\s*(.*)` with multi-line accumulation, drop any block missing candidate/hypothesis/reasoning (`candidates.py:175-235`).
- **Assays**: `[{"strategy_name", "reasoning"}]` strict JSON array from LLM; `json.loads` with a regex fallback extracting the first `[...]` span (`assays.py:116-128`; prompt `prompts.py:392-417`). Two different serialization conventions for structurally identical objects (JSON for assays, delimited text for candidates) — historical accident, not a design choice worth copying.
- Seed → inter-stage string encoding: `"Candidate: {c}<|>Hypothesis: {h}<|>Reasoning: {r}"` (`utils.py:374-396`), exported to a human-readable summary .txt (`candidates.py:255-267`).

### 1.2 Tier 2 — lit-grounded dossier (fixed rubric sections, free text + APA references)
- Each seed is expanded by a **separate literature-grounded agent call** (Edison FALCON for candidates `configuration.py:258-263`, CROW for assays `:247-250`) into a report with a **fixed section rubric**:
  - Candidate dossier: `Overview of Therapeutic Candidate / Therapeutic History / Mechanism of Action / Expected Effect / Overall Evaluation` (`prompts.py:671-689`, CANDIDATE_REPORT_FORMAT).
  - Assay dossier: `Assay Overview / Biomedical Evidence / Previous Use / Overall Evaluation` (`prompts.py:440-455`).
- Post-pass: dedicated LLM call reformats citations to APA 7th with an explicit anti-fabrication contract — "DO NOT MAKE UP ANY REFERENCES... IF YOU ARE NOT SURE... SAY (Unknown Reference)", consolidate duplicate cites, don't touch body text (`utils.py:821-865`; prompt `prompts.py:785-835`).
- Saved one .txt per dossier with trajectory link (provenance) header `Proposal for {name}` (`utils.py:290-331`).

### 1.3 What the tournament actually compares
- Dossiers are re-read from disk into a DataFrame `{"filename","hypothesis","answer","index"}` where `hypothesis` = name extracted by regex `Proposal for(.*?)\s*Overview` and `answer` = **entire dossier text** (`utils.py:868-931`). Pairwise judge sees name + full dossier (`utils.py:600-617`). Consequence (design-relevant): **evidence grounding is baked into the ranked artifact before ranking** — the judge compares lit-review dossiers, never raw hypothesis seeds. Lossy round-trip (structured → txt → regex) is Robin's weakest engineering; FAR-Lab's zod-native stages already avoid it.

## 2. Wet-lab interface contract

Robin does NOT generate executable wet-lab protocols; the OSS interface is (a) assay selection → a goal string, (b) raw-data ingestion → structured insights dict. Execution planning and bench work are human (README; `robin_full.ipynb` cell 10 notes the data-analysis agent is Edison "Finch"-class, closed beta).

### 2.1 Hypothesis layer → experiment layer
- Handoff is a **single synthesized free-text goal**: top-1 assay (ILSR rank `iloc[0]`, `assays.py:243`) → `synthesize_candidate_goal()` LLM call returns one sentence tying the assay to "identifying novel therapeutic compounds" (`assays.py:249-277`; prompts `prompts.py:499-517`). No assay parameters, cell lines, readouts, or acceptance criteria are carried — deliberately minimal, stringly-typed contract.

### 2.2 Experiment layer → hypothesis layer (result ingestion)
`data_analysis(data_path, data_analysis_type ∈ {flow_cytometry, RNA_seq}, goal, config)` (`analyses.py:17-202`) — the whole loop:
1. **External analysis jobs**: two runner steps over the raw data (e.g. .fcs + plate metadata). Step 1 = 5 parallel R-notebook agents (`PARALLEL_ANALYSIS=5`, `analyses.py:13`), each executing a long prescriptive query — flow-cytometry version hardcodes gating strategy via flowMeans, DMSO-control gating, plate-effect normalization, one-sided test vs control, multiple-testing adjustment, and a **strict output contract**: "Output only a single CSV named flow_results.csv with exactly columns drug, mean_intensity, std_error, p_val, adj_p_val" (`prompts.py:279-328`). Step 2 = consensus meta-analysis over the 5 result CSVs (p-value combination, comparability normalization) → `consensus_results.csv` (`prompts.py:331-362`, wired `analyses.py:66-77`). Jobs run via `MultiTrajectoryRunner`: file upload → `TaskRequest` ×parallel → poll to done → per-file download → success-rate logging → full JSON dump of all task responses (`multitrajectory_runner.py:199-289`). StepConfig gates: `max_steps=30`, `timeout=900s`, language, eval mode (`:20-30`).
2. **Result → table**: consensus CSV → HTML table, capped at 30,000 chars with a warning if truncated (`utils.py:946-975`); empty data → fail-visible 4-field error dict, not an exception (`analyses.py:112-126`).
3. **Table → structured insights** (the actual interface object): one LLM call must return **4 fields separated by `<>`**: (1) list of drugs tested, (2) analysis_summary, (3) questions_raised, (4) mechanistic_insights (`prompts.py:110-136`). Parse: split on `<>`, hard length check `EXPECTED_RESPONSE_LENGTH=4`, mismatch → all-fields error string (`analyses.py:148-170`).
4. **Follow-up suggestions**: separate call mapping summary+insights+questions → suggested next assays (name + reasoning), explicitly allowed to return "none" (`prompts.py:139-178`; call `analyses.py:172-188`).
5. **Anti-repeat negative memory**: tested-drug list is appended to `analysis_summary` with "AS THEY HAVE BEEN TESTED, DO NOT SUGGEST THESE DRUGS AGAIN" (`analyses.py:190-195`) — the only carry-over guard against re-proposing tested candidates.

### 2.3 Feedback into next round
`experimental_insights` dict (summary/mechanistic_insights/questions_raised [+followup_suggestions]) is injected at exactly two points of the next `therapeutic_candidates()` run — query generation (`EXPERIMENTAL_INSIGHTS_APPENDAGE`, `candidates.py:55-69`, `prompts.py:548-556`) and candidate generation (`EXPERIMENTAL_INSIGHTS_FOR_CANDIDATE_GENERATION`, `candidates.py:148-162`, `prompts.py:649-657`). Both appendages are the same three-bullet prose template. New round re-generates candidates from scratch; prior round's ranked winners are NOT seeded, merged, or referenced (only the tested-drug exclusion list prevents pure repetition).

## 3. Reviewer ensemble mechanics (beyond BT)

### 3.1 Judge structure
- **One reviewer model** (default `o4-mini`, single LiteLLM client, `configuration.py:295`) judging all pairs — ensemble diversity exists only **across pairs**, not across reviewers per pair. No per-pair multi-vote, no reviewer agreement measure, no self-consistency sampling.
- Pairwise verdict is structured JSON with exactly 4 keys — `Analysis`, `Reasoning`, `Winner: (winner_name, winner_id)`, `Loser: (loser_name, loser_id)` (`utils.py:642-647`; prompt formats `prompts.py:478-496` assay, `:762-780` candidate). ID-in-tuple binding is what makes game extraction robust to name echoes.
- Judge system prompt for candidates is an explicit **weighted rubric mirroring "human expert preferences"**: (1) Strength/relevance of supporting evidence incl. negative evidence as "strong deterrent" (highest), (2) MoA clarity/directness/specificity, (3) safety & risk profile, (4) feasibility incl. ADME/delivery, (5) novelty balanced against evidence (`prompts.py:691-760`). Assay rubric prefers simplicity, speed of readout, biological relevance, functional endpoints (`prompts.py:458-476`).

### 3.2 Robust parsing (hardening edges for the already-ported TS tournament)
- JSON extraction: first `{` to last `}` substring before `json.loads` (`utils.py:629-638`); missing-keys → structured error record, not crash (`utils.py:573-581`).
- `(name, id)` tuple re-parse from CSV: strict regex allowing quoted/unquoted names, `ast.literal_eval` fallback, `Int64` NA-tolerant columns; games with NA/out-of-range/identical IDs dropped with counts logged (`utils.py:468-518`, `candidates.py:399-437`).
- Fail-visible artifacts instead of silence: no valid games → `ranked_therapeutic_candidates_empty.csv`; ILSR exception → `..._choix_error.csv` with NaN scores and full diagnostics logged (`candidates.py:444-503`). (Assay path lacks this guard — `assays.py:230-232` would raise.)

### 3.3 Reviews → hypothesis edits
**None.** Judge `Analysis`/`Reasoning` text is persisted to the ranking CSV (`utils.py:764-771`) and never consumed again. Reviews never mutate hypotheses; improvement happens only via the round-level experimental-insights regeneration described in §2.3. There is no "aggregation of multiple reviews into an edit" mechanism to extract.

### 3.4 Dedup / near-duplicate handling
**None in code.** Two latent failure points verified against real output:
- Per-candidate Falcon queries are keyed `dict[candidate_name] = query` — duplicate candidate names **silently collapse** before dossier generation (`candidates.py:287-301`).
- Result files are enumerated, so near-duplicate candidates that survive produce parallel dossiers and compete as separate tournament items. Real dry-AMD run: `therapeutic_candidate_10_az10606120.txt` alongside `therapeutic_candidate_10_metformin.txt`, and two `therapeutic_candidate_12_*` files — duplicate/mis-indexed artifacts from name collisions in `robin_output/dry_age-related_macular_degeneration_2025-05-28_16-51/therapeutic_candidate_detailed_hypotheses/`.
- Takeaway: FAR-Lab must design dedup/merge itself (embedding or claim-overlap based); Robin offers no reference implementation.

## 4. Literature grounding inside Robin

- **Everything is delegated** to Edison platform agents via `edison-client` (`pyproject.toml:23-26`; `configuration.py:8`). Robin's own contribution is the client contract `call_platform(queries: dict[key,query], job_name)` (`utils.py:70-237`):
  - one task per query (`create_task`), async poll every **5 s** (`POLLING_INTERVAL`, `utils.py:27`), overall batch timeout **6,000 s** (`:28`, `:100-101`);
  - success → verbose fetch to pull **references** out of `environment_frame.state.state.response.answer.references` (`:181-183`); result record `{hypothesis, query, answer, sources, context, status, task_run_id}` (`:187-197`);
  - per-task failures recorded with status (`POLLING_ERROR` / terminal status / `PROCESSING_ERROR`), never thrown — batch returns `{results, count, has_errors}` (`:129-237`);
  - every saved artifact embeds a **trajectory link** `https://platform.edisonscientific.com/trajectories/{task_id}` for provenance (`utils.py:278`, `:323`).
- **Agent-role mapping is configurable per stage**: `AgentConfig` with `assay_lit_search_agent=CROW`, `assay_hypothesis_report_agent=CROW`, `candidate_lit_search_agent=CROW`, `candidate_hypothesis_report_agent=FALCON` (`configuration.py:242-263`).
- **Query generation**: LLM emits `num_queries*2` broad queries (30+ words) split on `<>`, half therapeutic-landscape, half disease biology (`candidates.py:71-97`; `prompts.py:559-589`). Queries double as result keys.
- **Usage pattern**: lit output is flattened to a `Query/Answer/References --- Query/Answer/...` string that conditions idea generation (`output_to_string`, `utils.py:334-350`); then per-candidate/per-assay a *second* grounded pass builds the dossier that is later ranked (§1.3). Grounding is thus two-stage: broad review shapes ideas; per-idea review becomes the ranked artifact.
- paper-qa relation: Crow is FutureHouse's paper-qa-based agent, but no paper-qa code ships here; see the separate `research/wave5-reports/paper-qa.md` report for retrieval internals.

## 5. Round carry-over & gating

### 5.1 What persists across rounds
- **Filesystem only**: run folder `robin_output/{disease}_{timestamp}/` (`configuration.py:301-307`); round-2 artifacts use `_experimental` suffixes in the same folder (lit reviews `candidates.py:110-120`, summary `:248-253`, dossiers `:317-328`, ranking CSV `:349-354`, final CSV `:531-539`). A commented-out older design (separate `_experimental` folder, `candidates.py:52-53`) confirms this was revisited.
- **In-memory**: `candidate_generation_goal` (string) + `experimental_insights` (4-field dict). No round counter, no cumulative candidate pool, no winner carry-over, no cross-round ILSR accumulation — the paper's "rounds build on prior winners" dynamics are manual and not encoded here.
- **Negative memory only**: tested-drugs exclusion list (§2.3 item 5).

### 5.2 Budget / eligibility / stopping
- **Volume knobs**: `num_queries=3`, `num_assays=3`, `num_candidates=5` (`configuration.py:272-282`); manuscript runs used 10/30/5 (`robin_full.ipynb` cell 3).
- **Hard caps**: tournament ≤ `min(300, C(n,2))` games (`utils.py:441`); fixed RNG seed 621 → identical pair schedules for identical n (`utils.py:426`); comparison concurrency semaphore 100 (`utils.py:705-710`); platform batch timeout 6,000 s; analysis step `max_steps=30`, `timeout=900 s`; data table into LLM capped 30k chars.
- **No stopping criteria**: no score threshold, no convergence/plateau test, no budget accounting (no cost/token tracking), no per-item minimum-games eligibility for ILSR (items can be ranked off few games; only `alpha=0.1` ridge regularizes). Loop termination = human decides in the notebook.

## 6. Mechanism inventory table

| # | Dimension | Mechanism | file:line | Summary | Why / port cost / risk | FAR-Lab mapping |
|---|-----------|-----------|-----------|---------|------------------------|-----------------|
| 1 | Result ingestion contract | 4-field `<>`-separated experimental insights (drugs-tested, summary, questions, mechanistic) + follow-up call | `robin/analyses.py:144-202`; `robin/prompts.py:110-178` | Wet-lab/simulation results reduced to a fixed 4-field dict + optional next-assay suggestions; strict length check fails visibly | Template for FAR-Lab feedback stage's "experiment result → hypothesis-revision input" schema. Port: low (rewrite as zod, keep field semantics). Risk: `<>` parsing fragile → zod enum/array instead | 部分（feedback 阶段已有；缺湿实验/模拟结果的结构化摄入 schema 与 next-assay 建议通道）|
| 2 | Anti-repeat negative memory | Tested-item exclusion list injected into next-round prompts | `robin/analyses.py:190-195` | "These have been tested, DO NOT suggest again" appended to analysis_summary before next candidate generation | Cheapest carry-over guard against re-proposing evaluated candidates; directly applicable to FAR-Lab revise/export "already tested" bookkeeping. Port: trivial. Risk: prompt-level only — no hard filter; pair with deterministic ID-level exclusion | 缺失 |
| 3 | Consensus computation pattern | N parallel analyst agents → strict output-CSV contract → consensus meta-analysis step over their outputs | `robin/analyses.py:54-109`; `robin/prompts.py:279-362` | 5 independent R analyses with exact output schema, then a consensus step combining p-values/effects into one CSV | Pattern for FAR-Lab Direction-B adapters / any external computation: multi-run + agreement step instead of single run. Port: medium (needs job adapter). Risk: consensus prompt is assay-type-specific (only flow-cytometry & RNA-seq ship) | 缺失（plan/verify 无外部计算适配器）|
| 4 | External-agent job contract | Step/StepConfig/MultiTrajectoryRunner: input_files→upload, parallel TaskRequests, poll, download output_files, success-rate, full JSON dump | `robin/multitrajectory_runner.py:20-153, 199-289` | Generic, provider-agnostic job runner with per-step resource gates (max_steps, timeout) and fail-visible result persistence | Clean model for FAR-Lab tool/adapter boundary (upload artifact → run → download artifact → status). Port: low-medium (interface shape, not Edison specifics). Risk: no retry/backoff; success_rate logged but not gated on | 缺失（FAR-Lab 无统一外部分析作业 runner 抽象）|
| 5 | External lit-agent client pattern | Per-query task submit + 5 s poll + 6,000 s batch timeout + per-task status records + references extraction + trajectory provenance links | `robin/utils.py:27-59, 70-237`; `utils.py:278` | All failures become records, never exceptions; every artifact carries an audit trajectory link | Matches FAR-Lab fail-closed + provenance discipline for any remote tool (incl. future paper-qa service). Port: low (pattern). Risk: batch timeout aborts all queries, no partial-retry | 部分（FAR-Lab retrieve 有 fail-closed；远程任务轮询/审计链接模式可对照）|
| 6 | Dossier rubric as ranked artifact | Per-hypothesis lit-grounded dossier with fixed sections (Overview/History/MoA/Expected Effect/Evaluation) + APA refs | `robin/prompts.py:671-689`; `robin/candidates.py:273-328` | Grounding happens BEFORE ranking; the judge compares evidence-bearing dossiers, not raw ideas | Design decision worth importing: rank stage should compare verified/grounded projections of hypotheses, not bare text. FAR-Lab rank already scores 12 dims on structured hypotheses — Robin corroborates "ground the artifact first". Port: prompt/rubric only. Risk: dossier free-text round-trip is lossy (FAR-Lab keeps zod objects — better) | 已有（FAR-Lab 结构化假设+verify 更强；rubric 可作 plan/export 模板素材）|
| 7 | Pairwise-judge rubric | 5 weighted criteria incl. negative evidence as deterrent; MoA directness; safety; feasibility; balanced novelty | `robin/prompts.py:691-760` (candidates), `:458-476` (assays) | Human-expert-calibrated judging priorities encoded verbatim | Calibration artifact for FAR-Lab rank pair prompts (FAR-Lab has dimension weights; Robin adds "negative evidence is a strong deterrent" + evidence-stage weighting). Port: trivial (prompt text). Risk: domain wording is drug-repurposing specific | 部分（rank 已有权重维度；判据措辞可融合）|
| 8 | Anti-fabrication reference formatting pass | Dedicated APA pass: never invent refs, consolidate dupes, "(Unknown Reference)" fallback | `robin/utils.py:821-865`; `robin/prompts.py:785-835` | Post-hoc citation normalization with explicit hallucination ban | Aligns with FAR-Lab verify/export fail-cited grounding; export stage could gain a reference-normalization pass with unknown-marker fallback. Port: low. Risk: LLM can still drift; keep deterministic source list as authority | 部分（verify 已 fail-closed；导出端引用规范化缺失）|
| 9 | Game-extraction hardening | Tuple regex + literal_eval fallback, NA-tolerant IDs, out-of-range/duplicate-ID game filtering, empty/error CSV artifacts | `robin/utils.py:468-570`; `robin/candidates.py:399-503` | Malformed judge outputs degrade to logged skips + named failure artifacts, never silent garbage | Checklist for auditing FAR-Lab's already-ported tournament ingestion (equivalent guards present?). Port: trivial to audit. Risk: none to adopt; note assay path lacks guards | 部分（已移植 BT/ILSR；需抽验解析防护是否同强度）|
| 10 | Prompt-placeholder contract validator | Pydantic model_validator asserting every template has exactly its expected `{placeholders}` | `robin/configuration.py:71-83, 145-239` | Config-time guarantee that prompts and call sites can't drift | Cheap invariant for FAR-Lab's prompt registry (zod refine or codegen from template vars). Port: low. Risk: none | 缺失（低优先）|
| 11 | Tournament schedule determinism | Fixed seed 621, `min(300, C(n,2))` games cap | `robin/utils.py:422-453` | Reproducible pair sampling, bounded LLM budget | Already-relevant to ported rank stage (FAR-Lab uses circle round-robin instead — both defensible; keep budget cap semantics). | 已有（round-robin 调度；确认保留 games 上限语义即可）|
| 12 | Stage handoff via goal string | Top assay → single-sentence `candidate_generation_goal` | `robin/assays.py:249-277`; `robin/prompts.py:499-517` | Minimal stringly-typed inter-stage contract | Negative lesson: lossy, unauditable handoff; FAR-Lab's typed stage contracts are strictly better. Do not port | 不适用（FAR-Lab 已有更强契约；记录为反例）|
| 13 | Idea-seed serialization | `<CANDIDATE START/END>` blocks + `KEY:` headers; `<|>` joins; txt round-trip regex | `robin/candidates.py:175-235`; `robin/utils.py:374-396, 868-931` | Lossy text round-trips carry hypothesis identity | Negative lesson; keep zod-native objects end-to-end | 已有（更强）|
| 14 | Wet-lab protocol generation | — | — | Does not exist in OSS Robin (stops at assay strategy + goal string) | FAR-Lab plan/executability gate is already beyond Robin here | 已有（超出）|
| 15 | Near-dup dedup/merge | — (dict-key collision at `candidates.py:287-301` actively loses dupes pre-dossier; post-dossier dupes observed in outputs) | — | No implementation; duplicates reach tournament | FAR-Lab must build its own (claim/embedding overlap); Robin provides only failure evidence | 缺失（FAR-Lab 亦缺，需自研）|

## 7. Top-8 ranked (for FAR-Lab adoption)

1. **#2 Tested-item exclusion memory** (`analyses.py:190-195`) — trivial port, immediate value for revise/feedback loops; pair with deterministic ID-level filter. Verdict: ADOPT (cheap, low risk).
2. **#1 Four-field experimental-insights contract** (`analyses.py:144-202`, `prompts.py:110-178`) — zod-rewrite as FAR-Lab's simulation/experiment result schema feeding feedback→revise. Verdict: ADOPT-ADAPTED (structure yes, `<>` parsing no).
3. **#7 Pairwise-judge rubric with negative-evidence deterrent** (`prompts.py:691-760`) — merge wording into FAR-Lab rank pair-judge prompt; calibrates "counter-evidence weighting" FAR-Lab already scores. Verdict: ADOPT (prompt-only).
4. **#5 External-agent client pattern** (`utils.py:70-237`) — per-task status records + overall timeout + provenance trajectory links; template for FAR-Lab remote tool integrations (incl. hosted paper-qa). Verdict: ADOPT-PATTERN.
5. **#4 Step/MultiTrajectoryRunner job contract** (`multitrajectory_runner.py`) — typed external-computation adapter with resource gates; needed before any Direction-B simulation feedback lands. Verdict: ADOPT-SHAPE (medium cost).
6. **#8 Anti-fabrication reference pass** (`utils.py:821-865`, `prompts.py:785-835`) — export-stage citation normalization with "(Unknown Reference)" fallback; complements fail-closed verify. Verdict: ADOPT (low).
7. **#3 Consensus multi-run analysis** (`analyses.py:54-109`) — N-run + consensus-agreement step for stochastic simulations/analyses; defer until Direction-B adapters exist. Verdict: DEFER-READY.
8. **#9/#11 Tournament ingestion hardening audit** (`utils.py:468-570`, `candidates.py:399-503`) — one-day audit of the ported TS rank stage for equivalent guards (NA IDs, out-of-range games, empty/error artifacts, games cap). Verdict: AUDIT.

## 8. Rejection notes

- **Round-N winner seeding / cumulative tournament**: not in OSS code (manual notebook iteration only). FAR-Lab's revision/version-comparison design must be original; nothing to extract.
- **Stopping criteria / budget accounting**: absent (only volume knobs + timeouts). FAR-Lab's budget/gating work stays original.
- **Reviewer ensemble per pair / review→edit aggregation / dedup-merge**: none exist (single judge per pair; analysis text unused; no dedup). Reported as gaps, not mechanisms.
- **paper-qa / retrieval internals**: out of repo (Edison platform). Only the client contract is learnable here; retrieval is covered by `research/wave5-reports/paper-qa.md`.
- **Wet-lab protocol synthesis / execution**: not present; Robin's experiment layer is data-analysis-only.
- **`<CANDIDATE START>`/`<|>`/txt-regex hypothesis serialization & goal-string handoff**: rejected as strictly worse than FAR-Lab's typed zod contracts (kept as documented anti-patterns, §6 #12/#13).
- **Experimental-round ranking reads stale dossier folder** (`candidates.py:334-336` vs `:317-321`): upstream defect; explicitly not portable. If FAR-Lab ports the insights-injection flow, ensure the ranked pool is the current round's hypotheses.
- **pydantic prompt validator (#10)**: valid idea, but low priority; a zod/registry equivalent can be added when FAR-Lab's prompt surface grows.
