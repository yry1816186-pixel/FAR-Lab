# RU-15 SEARCH-TIME — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research. Status: SOURCE_VERIFIED at paper level for the
decision-relevant canon; single-leaf RU (A4.7) — deliberately compact.

## Problem
Inference-time search for generation (A4.7): should hypothesis generation
allocate compute via best-of-N sampling, verifier-guided search, or
plan-space search instead of prompt tweaks? Blind-spot hunter flagged
[BS-agentarch]: "compute allocation beats prompt tweaks for diversity".

## Search vocabulary run
`best-of-N sampling diversity LLM`, `verifier-guided search language model`,
`tree search language model agents`, `PlanSearch code generation diversity`,
`inference-time scaling reasoning 2025 2026`, `test-time self-correction
refining over resampling`, `ideation-execution gap research ideas`,
`novelty diversity hypothesis generation LLM`

## Candidate/paper table (SR=read, PR=abstract read)
| Candidate | Source | Status | Solves | Family | Tag |
|---|---|---|---|---|---|
| Best-of-N + rerank | established lit | mature baseline | sample N, score with verifier/reranker, keep top | pure resampling | PR |
| Tree Search for LM Agents (arXiv 2407.01476 v4) | Koh et al. | established (updated) | LATS-style MCTS over agent states w/ self-reflection | tree search | PR |
| PlanSearch | Skalse/HuggingFace lineage (title query returned no direct hit this session; known from coding-agent lit) | UNVERIFIED-this-session (paper id not located via arXiv title search — recorded honestly) | plan-space diversification beats naive BoN on idea novelty in code-gen | plan search | PR(secondary) |
| Refining Over Resampling (arXiv 2608.05643, 2026-08-06) | academic | NEW frontier | test-time SELF-CORRECTION beats resampling for reasoning when a reliable critique signal exists | iterative refinement | PR(fresh) |
| Ideation-Execution Gap (arXiv 2506.20803) | Siang et al. lineage | established | human-executed LLM ideas score WORSE than expert-filtered subset → ideation-time ranking is unreliable; execution-grounded signals needed | calibration warning | SR(title verified) |

## Source-level findings
1. **The warning dominates the technique choice**: A13/A4 already adopted
   tournament selection with uncertainty reporting, and 2506.20803 shows
   ideation-time ranking is exactly where LLM judgment is weakest. Therefore
   ANY inference-time-search layer must treat its intermediate rankings as
   decision aids with reported uncertainty — never as pre-verdicts. This
   matches our protected invariant (scores are aids with producer+calibration).
2. **Diversity mechanics map onto existing stages**: our multi-strategy
   generation + evolution operators + TF-IDF dispersion already implement
   "diverse N". What's missing is ALLOCATION: spend extra budget on
   under-explored regions of the dispersion space rather than uniform N.
   Deterministic allocation rule: stratify candidate pool by dispersion
   tercile × evidence-balance, allocate extra samples to sparse cells.
   No LLM needed for the allocator.
3. **Refinement-vs-resampling**: 2608.05643 supports our existing quality-gate
   regeneration loop (critique-driven refine) over blind re-sampling WHEN a
   deterministic gate exists — ours does (quality-gate.ts). So the frontier
   finding VALIDATES current architecture rather than displacing it.
4. **Tree search (LATS-class)**: requires an execution-grounded value signal
   mid-plan. Our equivalent signal = preregistered decision-rule checks +
   falsification spec V&V at plan stage; full MCTS over plan space is
   DEFERRED until live route restores AND a workload demonstrates the
   deterministic gates are insufficient (cost: many extra judge calls under
   USD ceiling).

## Verdicts (main-Agent, closed vocab)
- Deterministic stratified-allocation sampler: **BUILD** (pure TS allocator
  over existing generation outputs; zero LLM cost; feeds rank stage)
- Quality-gate refinement loop: **KEEP** (frontier-validated as preferred over resampling)
- Full tree/MCTS search: **DEFER** (trigger: live route + measured gate insufficiency)
- Verifier-guided rerank beyond current tournament: **REJECT** (duplicate mechanism;
  tournament + BT scores already own pairwise verification)
- PlanSearch adoption: **DEFER** (paper identity unverified this session; radar item)

## Integration sketch (owners)
- hypotheses.ts generation config: allocation-strategy option (uniform |
  stratified-dispersion), budget-neutral
- src/domain/scorecard.ts: report per-cell sample counts alongside dispersion
  (honest provenance of pool shape)

## Deterministic validation workload (offline)
- allocator unit tests: fixed pools → expected per-cell allocations; budget cap respected
- replay eval: historical runs re-allocated offline → dispersion coverage
  improves without changing total N (property assertion)

## UNVERIFIED
- PlanSearch canonical reference (title search empty this session)
- Stratified allocation effect size on real corpora (needs live generation)
