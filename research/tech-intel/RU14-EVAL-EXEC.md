# RU-14 EVAL-EXEC — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research. Status: SOURCE_VERIFIED (benchmark repos + papers
probed/read at primary-source level today).

## Problem
Execution-side evaluation plane: A13.3 execution-benchmark coverage gap ·
B6.2 information-gain / uncertainty-reduction evaluators · B6.3 process/step
evaluation beyond math domain · A8.4 revision-quality scoring · A13.5
longitudinal self-improvement tracking.

## Search vocabulary run
`MLE-bench license`, `PaperBench openai repo`, `ScienceAgentBench`, `AstaBench
allenai`, `Core-Bench`, `RE-Bench`, `ResearchClawBench tasks rubric`,
`IGPO information gain policy optimization arxiv`, `CIGPO contextual
information gain`, `DataPRM process reward data-centric KDD`,
`ProcessBench PRMBench process reward models license`,
`revision quality scoring research artifacts`, `agent capability trend metrics`

## Candidate table (SR=read, SC=probed)
| Candidate | Org | License | Maturity | Task-shape | Usable offline-now? | Tag |
|---|---|---|---|---|---|---|
| ResearchClawBench | InternScience (Shanghai AI Lab orbit) | MIT; datasets on HF **and ModelScope mirror** (HF blocked locally — ModelScope reachable in CN) | active 2026-08-20 push, 246 stars, paper arXiv 2606.07591 | 40 tasks × 10 domains: agent reads raw data → produces report; scored by multimodal LLM judge against expert rubric checklists vs real human papers; 50=match paper | Partially: harness is Flask+subprocess (runs anywhere); needs frontier-model live calls → design-only until route restore; task JSON/rubric schemas readable now | SR(README full)+SC |
| MLE-bench | OpenAI | NOASSERTION on GitHub (custom) | active 2026-04 | Kaggle-style ML engineering | No (needs models+long compute) | SC |
| PaperBench | OpenAI | not located as official public repo under that name this probe (third-party mirrors only) | — | paper reproduction suite | No | SC |
| ScienceAgentBench | OSU-NLP-Group | MIT | established | 102 data-science task programs w/ cross-domain generalization | Design-reference; needs live model | SC |
| AstaBench | allenai | official repo NOT found in this probe (only third-party derivatives) | — | science-agent eval suite | — | SC |
| Core-Bench | community (name collision with unrelated repos) | verify before any use | — | computational reproducibility | No | REJECT-for-name-collision-risk |
| PRMBench | ssmisya (Qwen-orbit) | Apache-2.0 | established (arXiv 2501.03124) | fine-grained PROCESS-error taxonomy for step-level reward models (math domain) | Rubric TAXONOMY extractable to our judges without training | SC |
| ProcessBench | Qwen | (same family; not separately probed this wave) | established | process-error identification | same transfer path | SC |
| CIGPO (arXiv 2607.16244, 2026-06-26) | academic | paper | new | per-turn information-gain reward = marginal log-likelihood increase of ground-truth answer under frozen reference model; fixes GRPO zero-advantage collapse (F1 .252→.518 vs GRPO .430→0 collapse) | METHOD extractable: turn/evidence-stage IG scoring given a graded belief distribution — deterministic when evidences carry graded probabilities | PR(full abstract) |
| IGPO | registered lead from earlier hunt | could not confirm distinct paper via arXiv title search this wave (CIGPO surfaced instead; likely same lineage) | UNVERIFIED | info-gain dense reward | treat IGPO as superseded-by/unified-with CIGPO reference pending re-verification | PR |
| DataPRM | registered lead (KDD 2026) | arXiv API queries returned empty this session (indexing gap or title variant) | UNVERIFIED — keep registered status | ternary process reward for data-centric agents | blueprint-only until verified | PR |
| Longitudinal tracking | no external dep needed | n/a | n/a | capability-trend SQL over event spine | YES — pure BUILD | FACT(slots exist) |

## Source-level findings
1. **ResearchClawBench is the closest external yardstick** for Direction-A
   claims (re-discovery→new-discovery framing matches our rediscovery eval +
   MLR-Bench slices). Its two innovations worth adopting structurally:
   (a) expert rubric CHECKLISTS with per-item keywords+weights (deterministic
   partial credit, less judge-vibes), (b) the 50=human-parity calibration line.
   Adoption ladder: import 2-3 task rubric SHAPES as in-repo seed smoke tasks
   (respecting MIT for code; dataset license on HF/ModelScope = verify before
   redistribution); full-harness runs gated on live route.
2. **Process-evaluation transfer**: PRMBench's error taxonomy (calculational,
   signature, logical… coarse/fine/granular tiers) maps cleanly onto OUR stage
   outputs (retrieve→evidence→falsify): instantiate as zod `ProcessRubric`
   consumed by existing judge panels — zero training required since our judges
   are prompted models; agreement measured offline against historical recorded
   steps first.
3. **Information-gain evaluator**: CIGPO's signal formalizes what our
   supervisor lacks — a deterministic per-step "did this action reduce
   uncertainty about the hypothesis" score when evidence cards carry graded
   probabilities: IG(step)=H_prior−H_post over claim-support distribution.
   Implementable as pure TS evaluator slot in evaluators.ts family; validated
   on replayed runs where verdicts are known (does IG rank true-positive
   evidence steps above noise?).
4. **Revision-quality (A8.4)**: deterministic predicates already computable
   from Revision+VersionDiff: decision-rule preservation (all
   decision_rules survive verbatim or upgraded), falsifiability retention
   (every prediction still has threshold), scope-delta ratio (changed
   statements/total). Score = predicate vector; LLM advisory layer later.
5. **Longitudinal (A13.5)**: honest metric set over spine SQL:
   cost-per-terminal-verdict-run (receipts USD sum ÷ completed runs),
   counter-evidence substantive-hit trend (existing metric over time buckets),
   median iterations-to-verdict, forensic-flag rate (once RU-6 GO4 lands),
   retrieval EMPTY-rate trend. NO vanity aggregates (no "quality score").

## Verdicts (main-Agent, closed vocab)
- ResearchClawBench: **ADAPT** — seed-subset adoption ladder (rubric shapes +
  parity-calibration line into rediscovery eval docs); full harness DEFER
  behind live-route trigger; ModelScope mirror solves HF-blocked access.
- MLE-bench/PaperBench/ScienceAgentBench/AstaBench: **KEEP-watch** (design
  references; no near-term runnability; PaperBench/AstaBench official sources
  unresolved — do not cite scores).
- Core-Bench name-collision clones: **REJECT** (verify upstream before any use).
- PRMBench taxonomy: **EXTRACT** (error-tier rubric schema for process judges;
  Apache-2.0 attribution).
- CIGPO/IG evaluator: **BUILD** (deterministic IG evaluator over graded
  evidences; supervisor signal slot; offline validation on replays).
- DataPRM/IGPO leads: **DEFER** (re-verify papers next frontier-radar pass;
  registered status unchanged).
- Revision predicates: **BUILD** (pure functions over existing VersionDiff).
- Longitudinal metrics: **BUILD** (SQL views + export tab; metric set above).

## Integration sketch (owners)
- evaluators.ts: add `info_gain` evaluator id (family-consistent EvaluatorOutput)
- src/domain/process-rubric.ts: PRMBench-derived taxonomy zod schema
- src/domain/revision.ts (or feedback.ts): revision predicate functions
- eval/capability-trend.mjs: SQL-over-spine metric runner (+ GET projection later — server lane coordination)
- research/eval-seeds/: RCB-inspired rubric-shaped seed tasks (in-repo fixtures)

## Deterministic validation workload (offline)
- IG evaluator ranks planted-signal evidence above noise in ≥90% of synthetic
  replay runs (property test with seeded distributions)
- revision predicates: golden VersionDiff fixtures (preserve/violate each rule)
- process-rubric schema round-trip + judge-prompt contract test (schema-valid
  output enforced by strict function-calling shape)
- capability-trend SQL: fixture DB → expected metric numbers exact-match

## UNVERIFIED
- DataPRM & IGPO paper existence/claims (arXiv indexing gap this session)
- RCB dataset licenses (HF/ModelScope pages not fetched this wave)
- PaperBench/AstaBench official repos (search ambiguity; do not score-compare)
- CIGPO method portability beyond its HotpotQA setting (single-task evidence)
