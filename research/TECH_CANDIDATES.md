# TECH_CANDIDATES.md — External Technology Registry (Evolution Phase)

Merged candidate space = prior baseline (`research/reference/FARLAB_PRE_RESEARCH_INTELLIGENCE_BASELINE.md`, 51 deep records) + 2026-08-22 six-scout open-world expedition. Decision vocabulary per mission. Every ADOPT/ADAPT/EXTRACT below carries scout evidence; reversal triggers recorded in `.control/DECISIONS.jsonl`.

## A. Adopted into Wave-1 fusion (zero new runtime deps)

| Candidate | Source | License | Decision | Capability fused | Evidence |
|---|---|---|---|---|---|
| RankGPT listwise permutation pattern | sunnweiwei/RankGPT (pattern only, no code) | Apache-2.0 | EXTRACT pattern | LLM listwise rerank of retrieval pool before corpus cap | +2.3 nDCG@10 BEIR (EMNLP 2023); listwise degrades least on novel queries (arXiv 2508.16757) |
| Reciprocal Rank Fusion (k=60) | SIGIR 2009 (public algorithm) | n/a | BUILD (~20 lines deterministic TS) | Fuse 8 result lists from executed query plan | RRF beats single ranker/CombMNZ; RAG-Fusion (arXiv 2402.03367) positive |
| Robin pairwise tournament + Bradley-Terry/ILSR | Future-House/robin | Apache-2.0 | EXTRACT mechanism (port choix.ilsr_pairwise to TS, algorithm only) | Selection pressure over hypothesis pool: random pairs → LLM pairwise judge with A/B swap → BT scores + uncertainty | Only open hypothesis-gen system with wet-lab-validated discovery (Nature 2026); Si et al. ICLR 2025: 5 comparisons/candidate predicts human accept 71.4% |
| Evidence-card judging + rubric anchoring | Si et al. / MLR-Bench / Style-Wins findings | papers | ADAPT prompt design | Tournament judges see structured evidence cards (claims+neighbors), not prose; mitigates style bias (SBI 0.57) | Style Wins Substance Loses (arXiv 2608.01666); MLR-Judge rubric alignment |
| Externally-anchored critique (no signal-free self-refine) | Huang et al. ICLR 2024 + CRITIC + Sample-More-Reflect-Less | papers | ADAPT constraint | Any critique/refine step must cite retrieved external evidence; forbidden: intrinsic self-critique loops | Intrinsic self-correction degrades performance (2310.01798); debate no better than self-consistency at matched cost (2311.17371) |
| Literature-grounded novelty (retrieve→facet-rerank→adjudicate) | arXiv 2506.22026 (ACL SDP 2025) + SciMON method (Apache-2.0 code, method borrowed) | papers | ADAPT | Per-hypothesis query expansion → neighbor retrieval → facet rerank → novelty verdict with `unclear` default; two-layer novelty state | +13% expert agreement vs AI-Scientist approach; Beel et al. (2502.14297) showed AI-Scientist novelty misses nearest neighbors |
| Claim-claim cross relations with prefilter + `not_comparable` | NAACL 2025 reference-indeterminacy finding + SDP 2024 zero-shot verification | papers | BUILD | Topic-overlap prefilter (deterministic) → batched LLM pairwise adjudication → populate unused `targetClaimId` | >80% false-contradiction without shared-reference prefilter; GPT-4+ICL ≈ supervised at abstract verification |
| arXiv native HTML endpoint | arxiv.org/html/<id> | content per-article (local use OK) | ADOPT (API) | Structured fulltext for ~90%×97% of TeX submissions, keyless | Scout live-probed HTTP 200 (2026-08-22) |
| Europe PMC fullTextXML | europepmc.org REST | API Apache-2.0; content per-article CC | ADOPT (API) | JATS fulltext (6.5M OA subset incl. methods/results), keyless | Scout live-probed full JATS returned |
| S2AG citation contexts | api.semanticscholar.org | free, attribution required; keyless shared pool / free key 1 RPS | ADOPT (API) | `contexts/intents/isInfluential` per citation = external counter-evidence feed; tldr; openAccessPdf | Scout live-probed keyless 200; exponential backoff required |
| Unpaywall | unpaywall.org | CC0, keyless (email param) | ADOPT (API) | OA discovery + pdf_url resolution | 100k calls/day documented |
| MLR-Bench ideation+proposal stages | chchenhui/mlrbench; data HF CC BY 4.0 | code MIT | ADOPT (eval slice) | External comparability vs published o4-mini/Claude/Gemini/DeepSeek-R1 scores; 9-dim rubric, 6.0 accept line | NeurIPS 2025 D&B; novelty/feasibility dims non-saturated |
| Judge calibration: cross-family panel + order-swap + κ-vs-human | MT-Bench / Judge's Verdict / JDA / SciArena-Eval | papers | ADAPT eval protocol | Pairwise with both orders; panel across model families; report κ on n≥30 human-labeled; anti-leniency mandatory-defect prompt | Position bias nearly eliminated by swap+mean; same-family panels give false consensus; all judges leniency-biased |
| DeepSeek strict function-calling beta (`api.deepseek.com/beta`, tools `strict:true`) | official DeepSeek docs (2026-08-22 recheck) | API ToS | ADOPT (D-026) | Default structured-output transport: zodToStrictJsonSchema projection + tools/tool_choice; zod stays semantic authority; probe + live e2e verified (finishReason=tool_calls, full receipt) | Server-side schema enforcement eliminates malformed-shape class at transport; escape hatch FARLAB_DEEPSEEK_STRICT=0; watch beta stability |
| POPPER multiple-testing discipline (e-value/alpha-spending falsification) | POPPER ICML 2025 paper (code has NO license — untouched) | paper mechanism | EXTRACT (D-025) | multipleTestingPolicy (single_primary/alpha_spending/e_value_accumulation) required by executability gate for >1-hypothesis plans + prompt + export disclosure | Live-verified 2-hypothesis plan asserted single_primary with primary-comparison note |
| W4-F1 jittered exponential backoff + Retry-After precedence (vendor-shaped) | deepseek-ai/deepseek-harness llm-retry + retry-policy (MIT) + sst/opencode session/retry.ts (MIT) | MIT | ADOPT (W4, D-039; TS 重写非拷贝) | backoffDelayMs(1000·2^(n-1) × 对称 ±25% 抖动, cap 30s) + parseRetryAfterMs(ms>秒>HTTP-date) 优先；W1 契约语义不变 | evidence/W-H4/fusion-f1-f3-f4.md：295/295；退避表实测 random∈{0,.5,1}×attempt1-5；Retry-After 7s→7000ms 实测 |
| W4-F3 error-path credential redaction | openai/codex codex-rs/secrets/src/sanitizer.rs (Apache-2.0) | Apache-2.0 | ADOPT (W4, D-039; 正则族 TS 重写+attribution) | redactSecrets 4 模式应用于 fail() 持久化咽喉——错误消息入 sqlite/日志前脱敏；分类先于脱敏（quota 正则依赖原文） | 同上：脱敏语料 5 例实测无误伤；端到端 429 回显密钥测试 |
| W4-F4 judge self-consistency (median + spread disclosure) | google-gemini/gemini-cli evals/llm-judge.ts (Apache-2.0) | Apache-2.0 | ADOPT (W4, D-039; majority→median 适配对齐 D-037) | FARLAB_JUDGE_VOTES N 次同盲序投票→per-dimension 中位数+min/max spread+per_vote 全量留档；默认 N=1 行为不变 | 单测 5 例；live 方差削减 UNVERIFIED（D-036 路由阻断，恢复后待验） |
| W9 rediscovery judge v2.1: fixed GT + granularity protocol + gold-calibrated matcher | FIRE-Bench design (repo no-license, harness ours) + main-agent gold set (in-repo) | in-repo | BUILD/ADAPT (W9, D-042) | GT 分解固定（GT_REV）；agent 分解固定粒度协议（原子单元+GT 锚定计数+排除方法论预测）；TF-IDF 阈值金标零误校准 0.40/0.12（104 对主 Agent 标注）；管线单源化+防御性校验 | evidence/W9/judge-variance-hardening.md；replay 跨分解 swing ≤0.091（保守口径）；live 重判 BLOCKED（D-036） |
| W9 deterministic statistics tier (eval/stats.mjs) | Miller arXiv:2411.00640 + lm-eval/FastChat seeded-bootstrap 纪律 + inspect_ai cluster-robust SE + statsforevals 规则（openai/evals+inspect_ai 未播种 bootstrap 为反面教材） | papers/MIT-Apache sources read | EXTRACT/BUILD (W9, D-043) | 播种 mulberry32 bootstrap CI、小 N 精确配对置换（零 RNG）、Wilson、Cohen's kappa、BH step-up、聚类 SE、MDE 决策门（REAL/NOT_SIGNIFICANT/INSUFFICIENT_N + N<15 exploratory 降级）；stats-report.mjs 双跑 bit-identical | eval/results/stats-report.json；tests 23/23；同 seed 同结果实测 |
| W9 counter-evidence-substantive-hit metric (defined+backfilled) | in-repo metric over recorded blind re-judges | in-repo | BUILD (W9, D-043) | strict=counter 标签关系盲判存活率（contradicts/weakens）+ limiting(+qualifies) + miss 分解（inverted/empty/qualifies-only）+ Wilson；回填：post-fix 0.143 strict（诚实远低 0.70 目标） | evidence/W9/counter-evidence-metric.md；eval/counter-evidence-metric.mjs |
| W9 judge-panel 校准研究线（Yale EM-DS/Beta-Bernoulli、AlpacaEval LC-winrate、IBM anchor-selection） | yale-nlp/bay-calibration-llm-evaluators 等（均 Apache-2.0 已核） | Apache-2.0 | DEFERRED (W9, D-052) | judge 混淆矩阵金标校准（EM+闭式后验）/长度混杂控制/中位锚点规则——三条均需 live judge+人类金标；触发器=路由解锁+金标集建立 | research/wave9-reports/judge-calibration-research.md（源码全读；JudgeBench/Self-Preference/UDA license-null 代码 REJECT） |

| W7-F1 JSON repair engine (full state machine) | josdejong/jsonrepair 3.15.0 regular variant | ISC | ADOPT (W7, D-044; EXTRACT 算法重写非引包——WAVE3 #10 的引包 REJECT 不冲突) | 四层链 direct→fence→legacy 引号扫描→引擎；oracle 74 例逐字节等价；损坏修复 9/68→68/68；live 类 192/192 保持；三突变全 CAUGHT | evidence/W7/repair-benchmark.md；live e2e 待路由恢复（402） |
| W7-F2 truncation discipline | instructor v2 retry.py (MIT, IncompleteOutput 不重试哲学) + openai-partial-json-parser (MIT, NUM 排除洞见) | MIT | ADOPT (W7, D-044) | finishReason=length→引擎补全不验收+专用简洁重问；部分值永不静默验收（伪造红线） | 同上 |
| W7-F3 DashScope max_tokens 剥离 | 百炼官方结构化输出文档（2026-08-18 版逐字） | 官方文档 | ADOPT (W7, D-044) | 结构化输出+max_tokens=官方确认的截断根因；dashscope 路由恒剥 | providers 测试断言请求体无 max_tokens |


| CounterRefine answer-conditioned counter-evidence retrieval (arXiv:2603.16091, CC BY-SA paper; verified live 2026-08-22) | ADOPTED-EXECUTED (W-G/F-A, 2026-08-22): deterministic anchorCounterQueries repair in retrieve.ts — anchor pass-rate 0.563->0.825 on 80 real historical queries; live retrieval delta gated on D-036 | Reversal: live replay shows anchored queries do not reduce EMPTY misses |
| GRADE certainty framework (public methodology; GRADEpro tooling commercial and NOT used) | EXTRACTED-EXECUTED (W-G/F-B): gradeClaimCertainty deterministic 4-level ladder on claims, surfaced to relation-judge payloads; metric impact UNVERIFIED-live | Reversal: judge-calibration live data shows certainty labels add no agreement value |
| Maastricht statistical-design checklist (public rubric) | DEFER->B: deterministic power/effect-size checks as checkPlanExecutability extension; trigger = dedicated slice with tests | research/WAVE-G-SCOUT.md L4 |
| NOVA-Test 3-gate hypothesis audit (ICML 2026 workshop paper-only) | DEFER->B: gates 1/3 already covered by zod schema + completenessCheck; novel contradiction gate needs live LLM (D-036) | research/WAVE-G-SCOUT.md L4 |
| SWAN ontology ResearchStatement (W3C) | EXECUTED (D-070): toSwanJsonLd ResearchStatement serialization in bundle hypothesisJsonLd — was DEFER->B | research/WAVE-G-SCOUT.md L4 |
| scite contrast sub-types (public paper taxonomy; API proprietary) | DEFER->B: contrastType sub-label when relation-blind-agreement live data justifies it | research/WAVE-G-SCOUT.md L1 |
| OrchBench deterministic plan simulator / Ancestor trust scoring / Critiplot / args.me / SparseCL / AI-Researcher | REJECTED/DEFERRED with reasons (license unverified/NOASSERTION, domain mismatch, visualization-only, needs embeddings) | research/WAVE-G-SCOUT.md L1/L4 |

## B. Deferred (evidence-gated or later-phase)

| Candidate | Decision | Trigger |
|---|---|---|
| GROBID Docker sidecar (Apache-2.0, 0.9.1 active) | REJECT (superseded 2026-08-22, D-028): OpenAlex content API serves SERVER-SIDE GROBID TEI per work ($0.01/file, free key ~100/day ≥ our ≤3/run deepening cap; probe: metadata keyless, download 401-without-key) — same GROBID output, zero JVM/Docker infra. Route `openalex_tei_v1` landed in fulltext phase B | Re-open only if OpenAlex content API pricing/access changes materially |
| docling-serve (MIT) | DEFER | Non-scholarly document need |
| Local ONNX cross-encoder rerank (transformers.js + onnxruntime-node, Apache/MIT) | DEFER | Pool >60 or offline need; requires latency spike; ~227MB optional dep |
| Local ONNX NLI (Xenova/nli-deberta) as claim-relation cross-checker | DEFER (trigger rewritten 2026-08-22, D-023: relation-precision spike measured contradicts 1/8 exact, but the defect pattern = topical distance + label granularity, which NLI does not fix; deterministic topical gate shipped instead) | Re-activate only if a POST-GATE blind re-judging (evidence/W-EV2/relation-precision.md reproduction) still shows low precision on topically-close pairs; would also need a zero-runtime-dep exception |
| OpenAlex API key | ADOPTED 2026-08-22 (partial #4): optional OPENALEX_API_KEY rides api_key= when present; keyless still default (policy-drift adaptation) | Fulltext-download option (PDF/TEI, 60M OA docs) still open; GROBID stays deferred |
| models.dev provider registry snapshot | RESOLVED via local proxy (D-033, b2f812a): 193-provider catalog + fetcher + DashScope intl override integrated — B-row updated 2026-08-22 W4 (was DEFER/network-blocked) | Refresh snapshot when proxy allows |
| W4-R1 compaction design file (best-of-6) | deepseek-harness 9-section checkpoint + prefix-cache-aligned summarization + tool-pairing balance invariant (MIT) + goose lenient StructuredSummary/progressive dropping/CompactingProvider (Apache-2.0) + cline overflow-recovery→deterministic path (Apache-2.0) + OpenHands forgotten_ids protocol (MIT) | DEFER — FAR-Lab 单次结构化调用无会话历史；反转触发=多轮会话功能立项（档案: research/wave4-reports/{deepseek-harness,goose,cline,OpenHands}.md） |
| W4-R2 Architect-Editor weak/strong model split | aider architect_coder.py (Apache-2.0) | DEFER — 触发=live 路由恢复+成本数据可得（厂商宣称 50-70% 节省需自家验证） |
| W4-R3 repo-map PageRank+token 二分预算 | aider repomap.py (Apache-2.0) | DEFER — 与 ONNX rerank 同触发（池>60，当前 max 44） |
| W4-R4 background-review 方法论沉淀 + auto-memory | hermes-agent background_review.py (MIT) + Claude Code auto-memory 公开文档 | DEFER — 触发=live 路由恢复（需模型调用） |
| W4-R6 evidence 全文摘录保尾（head→head+tail，码点计数） | deepseek-harness compaction-tool-result-pruner (MIT) | DEFER — 触及 claim 提取生产语义，需 live A/B 验证后动 |
| W7 partial-value parser（partial-json 家族 B 设计：Allow 掩码+原子前缀补全） | partial-json 0.1.7 / openai-partial-json-parser（均 MIT，实读） | DEFER (W7) — 接受路径有静默丢尾风险（截断数组过 schema=伪造完整），红线不碰；价值在流式 UI 渐进呈现 |
| W7 SSE 流式渐进校验面 | partial-json 家族 + instructor M3/M7 | DEFER (W7) — 触发=产品立项流式呈现或长输出延迟实测 |
| W7 re-ask 消息按通道分化（role:tool 应答） | instructor M2 | DEFER (W7) — 现形状 live 证实（0d1706e）；改动需 live A/B（D-036 阻断） |
| W7 token_budget 跨重试预算 | instructor retry.py | DEFER (W7) — 重问率低，痛点未实证 |
| W7 Mode×Provider 声明式能力矩阵 | instructor M1/M5 + DashScope json_schema 严格模式（官方文档实证，Qwen3.7/3.8-Max 窄面） | DEFER (W7) — 触发=B-QWEN key 到位或第二家 provider 需差异传输；届时 DashScope json_schema 升级路径在案 |
| W7 zod v4 z.toJSONSchema 投影替代 | zod 3.25.76 同包（MIT） | DEFER (W7, D-044) — v3 schema 无法喂 v4（reading def 抛错实测）；$ref/allOf/propertyNames 超出端点子集；触发=全仓 zod/v4 迁移 |
| W7 约束解码四库深钻（outlines/xgrammar/lm-format-enforcer/guidance） | Apache-2.0/MIT 已核验 | learn-only (W7) — API 侧无本地解码；触发=本地推理/流式 token 级约束立项 |

| FIRE-Bench rediscovery eval (arXiv 2602.02905, ICML 2026) | ADAPT (design extracted 2026-08-22, D-029): atomic-claim decomposition + set-matching P/R/F1 vs ESTABLISHED findings — objective GT, no quality-judge circularity. Official repo NO LICENSE (harness self-implemented); HF dataset Apache-2.0 but network-blocked (huggingface.co unreachable) — seed set authored in-repo (eval/rediscovery.mjs), HF import = documented extension | Import HF task set when network allows; never compare hypothesis-level F1 to official full-cycle agent scores |
| CORE API v3 | DEFER | Marginal coverage over A+B |
| Idea2Plan protocol | ADAPT later | Verify repo license before running subset; borrow 5-section template + JudgeEval now (dataset repo 404 as of 2026-08-22 — subset-run BLOCKED, paper-level only) |
| Query decomposition/sufficiency iteration | DEFER | As evaluated experiment only |
| S2AG citation contexts (contrastive-reception discovery) | DEFER (evidence-gated, 2026-08-22 probe spikes/s2ag-probe.mjs: keyless 200 works; intents coverage 0/40 citations, contexts ≤9/20, contrastive hits 0) | Revisit when S2AG intent coverage improves or an API key materially raises citation-context quality; premise (structured contrast intents) does not hold on current data |
| LiteLLM | REJECT (pattern absorbed) | Own provider plane is strong; Python dep incompatible; no silent fallback allowed anyway |
| Temporal / DBOS durable workflow | REJECT (standing, whole-framework) — **W8 mechanism extraction EXECUTED (D-054)**: dbos OAOO step_outputs + langgraph put_writes discipline → ctx.checkpointed() (P3: rank/hypotheses subtask redo 100%→≤1 in-flight); dbos recoverPendingWorkflows + temporal sticky-lease/heartbeat → runs-row leases + heartbeat-piggyback + embedded server watchdog + lease-lost fencing (P1: 93-243min→5033-5060ms kill→adoption; P2: cross-process single-writer) | Reversal trigger for FURTHER extraction: live-route restored and a 20-run LIVE soak shows failure modes the offline harness cannot (deterministic-subtask harness: evidence/W8/fault-injection.json). Reports: research/WAVE8-SCOUT.md + wave8-reports/ (langgraph/temporal-sdk/dbos-ts/openai-agents-js/ag2-smolagents/crewai-claudeflow, licenses verified) |
| RO-Crate export envelope | DEFER | Valid enhancement after core-loop fusions; spec status verified in baseline S-005 |

## C. Rejected (with reasons — do not revisit without new evidence)

| Candidate | Reason |
|---|---|
| Google co-scientist full generate-debate-evolve mechanism | No code; most serious open reimplementation (Kaimen, Apache-2.0) measured pipeline-vs-direct Elo gains SIGN-FLIPPING across runs; adopt only its tournament subset (via Robin) |
| Intrinsic self-critique loops (Self-Refine style) absent external signal | Huang ICLR 2024 + CRITIC + arXiv 2607.28576 falsified; agent-theater risk |
| Multi-agent debate as quality mechanism | Smit ICML 2024: no gain at matched sample budget |
| Simulated peer-review committees as truth | Si et al.: all review models ≤53.3% agreement with human accept (≈ random) |
| Pure LLM novelty point-scores as gates | RQ-Bench "novelty illusion" (LLM judges invert expert novelty); IdeaNovel concordant |
| Pointwise 1-10 ranking for final ordering | Pairwise > pointwise replicated; verbosity/style bias |
| HyDE | 2025 re-evaluation: gains were knowledge leakage; fails on unfamiliar domains (FAR-Lab's profile) |
| wink-bm25-text-search | AGPL-3.0 + ~4 years unmaintained |
| MinerU, pymupdf4llm/PyMuPDF | AGPL-3.0 (MinerU confirmed no commercial dual-license); competition product risk |
| nougat | Dormant ~18 months |
| scite.ai | Commercial subscription API |
| S2ORC snapshot route | TB-scale corpus; wrong shape for local app |
| CycleResearcher/CycleReviewer | Requires fine-tuned weights; FAR-Lab is API-based, model-agnostic |
| marker | Code Apache-2.0 but model weights modified OpenRAIL-M with revenue thresholds |
| ResearchAgent code | No LICENSE file — pattern only (refine-weakest-dimension loop absorbed into critique design) |
| AI-Scientist-v2 code/prompt text | Custom NOASSERTION license — mechanism patterns only (ideation conditioning, reviewer ensemble+meta-review) |

## D. Environment facts discovered (2026-08-22)

- OpenAlex `search=` now maps to fulltext-based query (`x_query` shows `fulltext.search` translation) — retrieval semantics broader than title+abstract; verify coverage behavior when touching retrieve.
- OpenAlex keyless polite pool WORKS as of 2026-08-22 01:15 (HTTP 200, real results) — scout-reported "key mandatory" is a production-scale policy, monitor only.
- DeepSeek has NO embedding endpoint (verified) — any embedding route requires a new pluggable provider contract; hence cross-encoder/LLM rerank preferred.
- Semantic Scholar keyless shared pool rate-limits aggressively; free key (1 RPS) recommended before S2AG integration; exponential backoff mandatory.

## E. Wave-6 retrieval/RAG expedition (2026-08-22; D-046..D-048; research/WAVE6-SCOUT.md)

### E1. Adopted / Extracted (source-level, zero new runtime deps)

| Candidate | Source (license verified) | Decision | Capability fused | Evidence |
|---|---|---|---|---|
| Counter-query family rerouting | node-DeepResearch per-query routing precedent (agent.ts:305-322, Apache-2.0) | BUILD (F1) | counter[1] arxiv→crossref in buildTargets; crossref redundancy now covers counter queries | live replay 68/68 historical counter queries: crossref 0% zero / mean 6.0 vs arxiv 82.3% zero (spikes/output/crossref-counter-probe.json) |
| Deterministic zero-result query-mutation cascade (full→k4→k2) | open-deep-research legacy/utils.py:1274-1283 (MIT) + node-DeepResearch 2-5-word discipline schemas.ts:198 (Apache-2.0) | EXTRACT mechanism (F2) | arXiv empty searches retry strictly-shorter variants, each attempt receipted, first hit stops | probe: k6 100% / k4 53.3% / k2 6.7% zero on 30 historical zero queries (spikes/output/arxiv-truncate-probe.json) + relevance spot-check |
| Wrong-paper multi-signal guard | markrussinovich/refchecker enhanced_hybrid_checker.py:687-870 (MIT) | EXTRACT (F3) | verify.ts: title-failed resolves graded by surname overlap + year gap + venue compat; wrongPaperSuspect surfaced, identifier stays authoritative | tests/pipeline-retrieve.test.ts W6/F3 cases; refchecker report wave6-reports/refchecker.md |
| RankGPT bottom-up sliding window | sunnweiwei/RankGPT rank_gpt.py:234-244 (Apache-2.0) | EXTRACT (F4, extends D-015) | rerank pool 24→48; windows w=24/s=12, bottom-up head-last; per-window permutation validation; rerankWindows recorded | rerankWindowPlan tests + 3-window e2e; upstream w>n silent-skip structurally impossible |
| Fulltext citation-marker strip | AkariAsai/OpenScholar open_scholar.py:717-720 (Apache-2.0) | ADAPT (F5) | numeric [n]/[n,m]/[n-m] markers stripped in all 3 extractors (LaTeXML/TEI/JATS); bracketed prose kept | tests/sources-fulltext.test.ts W6/F5 |
| Deterministic retrieval-quality baseline harness | beir-cellar/beir metric methodology (Apache-2.0, file:line in report) | BUILD with BEIR provenance | eval/retrieval-baseline.mjs: offline replay of persisted runs, guarded before/after compare exit-1-on-regression, hole-analogue metric | evidence/W6/retrieval-baseline-harness.md; before/after snapshots frozen |

### E2. Deferred (reversal triggers)

| Candidate | Decision | Trigger |
|---|---|---|
| Bounded feedback retrieval round (critique→≤2 follow-ups→RRF merge→replace-within-cap) | DEFER (F7, top candidate) | any model route returns (D-036) + ≥3 runs with measured query-sufficiency gaps |
| pqac opaque-ID citation binding (paper-qa types.py:249-316) | DEFER (F8) | claim binding already 100%; revisit with live LLM + binding failure evidence |
| LLM support-verification Yes/No judge (OpenScholar instructions.py:282-301) | DEFER (F9) | live LLM routes |
| Purpose-weighted RRF (rag-fusion query_weights) | evaluate-first (F6) | quality proxy metric defined (quota floor already guarantees seats) |
| storm / ai2-scholarqa-lib / rank_llm / ranx | fetched, not deep-read | residual defect in their dimension (query planning / pipeline alignment / rerank orchestration / metric oracle) or next wave budget |
| gpt-researcher breadth-halving descent + researchGoal queries | design reference only | a future iterative-retrieval decision (see C below) |

### E3. Rejected this wave

| Candidate | Reason |
|---|---|
| Iterative sufficiency loops as a class | crosscut C2: no demonstrated failure class that iteration fixes; wall-clock hard gate; ODR's own adaptive value depends on web-page bodies scholarly APIs never return |
| Pre-shuffle for rerank position bias | CORRECTED 2026-08-22 (rank_llm read): sunnweiwei/RankGPT verified absent, BUT castorini/rank_llm implements it (listwise_rankllm.py:271-290 shuffle_and_rescore, random.sample unseeded, opt-in flag default OFF). Any FAR-Lab port must inject a SEEDED rng (determinism discipline); effect needs live LLM behavior — deferred with trigger = model routes return + position-bias evidence in rerank receipts |
| RankGPT token-budget machinery | upstream does not exist (only 300-word per-item truncation + an unchecked ERROR sentinel) — nothing to port |
| Embedding/BM25/tantivy local corpus retrieval | zod-only invariant + no local corpus (paper-qa's tantivy path acknowledged as industrial precedent for lexical-only retrieval) |

## F. Wave-5 scientific-AI-systems expedition (2026-08-22; reports research/wave5-reports/, decisions D-049/D-050)

### F1. Adopted (fused this wave; live re-measurement queued on D-036)

| Candidate | Source | License | Decision | Capability fused | Evidence |
|---|---|---|---|---|---|
| Cross-strategy negative conditioning (previouslyProposed history + explicit differentiation) | AI-Scientist-v2 perform_ideation_temp_free.py mechanism | RAIL (mechanism-only, clean-room) | ADAPT (prompt assembly) | generate_hypotheses strategies 2/3 see all prior candidates; measured premise 30% duplicate rate (136/455) | tests/pipeline-hypotheses.test.ts W5-F4; evidence/W5A/fusion-evidence.md |
| Evolution-operator supplement repertoire (integrate/reduce/make-feasible/transplant) | Kaimen Co-Scientist evolution.py taxonomy | Apache-2.0 | ADAPT (prompt) | diversity supplement gains four explicit operators | same tests |
| Anchored-band relation label discipline | MLR-Bench review_idea/proposal rubric structure | MIT | ADAPT (prompt) | falsify.ts + evidence.ts adjudication prompts: full-sentence anchors, same-subject+same-quantity gates, anti-leniency, not_comparable default | evidence/W5A/fusion-evidence.md |
| Independent adversarial link audit (confirm/relabel/drop) | AI-Scientist v1 ensemble+AC review + pessimistic-critic default (mechanism-level) | RAIL (mechanism-only) | ADAPT (new pass + pure applyLinkAudit) | post-gate audit of claim→hypothesis links; failure keeps originals visibly | tests W5-F5 (pure + stage) |
| MLR-Bench adapter fidelity trio | mlrbench internals (idea_generator/proposal_generator/review_proposal) | MIT | ADAPT (eval adapter) | question structure preservation; rendering of persisted predictions/falsification/decision-rule; proposal judge sees same-agent idea (upstream parity) | eval/mlr-bench.mjs --dry-run/--render-only exit 0 |

### F2. Deferred (reversal triggers)

| Candidate | Decision | Trigger |
|---|---|---|
| Cross-family near-dup corpus merge (OpenScholar MinHash pattern) | DEFER (measured 3 pairs/46 runs, sub-threshold; retrieve.ts W6-locked) | rerun spikes/wave5-near-dup-probe.mjs after W6-F1 crossref reroute lands |
| paper-qa citation-sanitization presentation pipeline | DEFER | P1 product wave (inline-citation rendering) |
| Structured gap-question targeted re-retrieval (OpenScholar corrective RAG) | DEFER | live routes + ≥3 runs with measured sufficiency gaps |
| Per-stage budget enforcement (Kaimen budgets.py shares) | DEFER | runaway-cost evidence |
| Embedding dedup clustering (Kaimen proximity) | DEFER | embedding endpoint (ONNX or API) |
| Robin 3-partite experimental-insights taxonomy + tested-entities blacklist | DEFER | Direction-B experiment-feedback adapter / multi-round runs |
| Deterministic clustering for paraphrase dedup (replacing LLM cluster call) | DEFER | embedding endpoint (same trigger as above) |

### F3. Rejected this wave (with reasons — do not revisit without new evidence)

| Candidate | Reason |
|---|---|
| Matcher citation-noise stripping (paper-qa strip_citations) | premise falsified on recorded data: 0/104 gold pairs contain citation noise (claims are proposition extractions) |
| LLNL open-ai-co-scientist (all sub-mechanisms) | demo-grade: lenient defaults mask failures, static hard-coded meta-review strings; Kaimen supersedes on every surface |
| aviary framework adoption | RL gymnasium paradigm — wrong shape; Robin's MultiTrajectoryRunner is the closer adapter reference |
| Elo ranking core / generate-debate-evolve whole mechanism | registry C standing (sign-flipping gains); sub-mechanisms only via Robin/Kaimen entries |
| Resident multi-agent committees / role-play hierarchies | AIS2 §3.1: committee = schema'd call points + shared state — FAR-Lab stage machine already is this; AgentLab six roles have no capability differentiation |
| Revision regression guard (edit length-ratio gate) | would false-positive legitimate assumption-dropping revisions; revision semantics = soul boundary (causal-link stays) |
| Citation-count priors in retrieval (OpenScholar min_citation/norm_cite) | biases toward old famous work — scientifically wrong for recency-sensitive hypothesis generation |

### E4. Post-audit verification addenda (2026-08-22, D-057 window)

- **nDCG oracle-verified**: eval/retrieval-baseline.mjs ndcgAtK = pytrec_eval (BEIR's own delegate,
  beir/retrieval/evaluation.py:98-101) on 17/17 cases (7 hand-fixtures + 10 seeded-random) to
  1e-9 — `node spikes/ndcg-oracle-compare.mjs` exit 0 (spikes/output/ndcg-oracle-pytrec.jsonl).
- **F4 window mechanics cross-validated** against castorini/rank_llm (Apache-2.0)
  listwise_rankllm.py:292-358: bottom-up window construction (end-window first, stride steps
  down, clamped to rank_start), per-window slicing on the mutated list — agrees with our
  rerankWindowPlan/applyWindowedRerank port; their pre-shuffle finding recorded in E3.
- **trectools** (BSD-3) evaluated as oracle first — its TrecEval requires the external
  trec_eval binary (not bundled) → replaced by pytrec_eval (self-contained C extension).

## G. Porting-fusion seeds + sandbox expedition (2026-08-22; reports research/oss-porting-scan/)

| Candidate | Source | License | Decision | Capability / reason | Evidence |
|---|---|---|---|---|---|
| cgast/harness (whole repo) | github.com/cgast/harness | **NO LICENSE** (API license:null, main-agent verified; package.json "MIT" is metadata only, no legal grant) | REJECT — copy/fork legally infeasible; B conflicts zod-only (better-sqlite3/yaml/uuid); stalled 5.7mo single-author (pushed_at 2026-03-02); sandbox interceptor double-execution defect (interceptor.ts:37-74, `__sandboxHandled` unchecked) | — | oss-porting-scan/cgast-harness.md |
| HITL feedback five-type typology | cgast/harness feedback/types.ts:10-102 (subagent-read ◇, not line-verified by main agent) | typology only — clean-room zod rewrite if ever | DEFER — merges into W8 HITL interrupt registry entry; trigger = in-run approval gate feature; any port must add approval TTL (openai-agents precedent from W8) | confirm(defaultDeny timeout-deny)/choice/text/review(4 verdicts+line annotations)/form + four-state response | same report |
| Sandbox category | E2B / microsandbox / gvisor / kata / firecracker / daytona / modal scan | verified per report (E2B Apache-2.0 main-agent verified) | **KEEP D-087** baseline (OpenSSH subprocess gateway + Docker/WSL2 + lockfile sidecar, live-verified); E2B = REFERENCE (self-host needs Firecracker+KVM+Nomad/Consul cluster — disproportionate; hosted = compliance risk); microsandbox = DEFER (v0.6.x, KVM, SDK no snapshot/pause API); gvisor/kata/firecracker = REFERENCE; daytona/modal = REJECT | E2B API semantics borrowed into EEL E5: onTimeout kill/pause state machine + dynamic renewal; createSnapshot → docker pause/commit layered kill-resume; deny-all egress allowlist (OpenML/PyPI only); SandboxMetrics receipt fields | oss-porting-scan/sandbox-category.md; D-087 in .control/DECISIONS.jsonl |

## G2. v2 full-list porting-fusion expedition (2026-08-22; plan research/oss-porting-scan/PORTING-FUSION-PLAN.md, 底稿 v2-*.md)

User list (8 categories, 25 items) quality-gated + 10 proactive adds; all load-bearing claims main-agent spot-verified.

| Candidate | Source (license/stars API-verified) | Decision | Capability / reason | Evidence |
|---|---|---|---|---|
| MCP client pagination+refresh patches | our src/agent/mcp.ts:73-82,140 (defects, main-agent verified) | **ADOPT-GO** | ① tools/list drops nextCursor (paginated servers silently truncated) ② notifications (tools/list_changed) dropped at :140 — ~30-60 lines self-owned fix, no SDK | v2-tools-sandbox.md; mcp.ts direct read |
| ag2 container lifecycle discipline ×5 | ag2/ag2/extensions/docker/sandbox.py L25-256 (Apache-2.0; L25/44-46/53-54 main-agent verified) | **EXTRACT-GO (EEL lane)** | timeout→restart+exit124 (L126-132), network none+mem 512m defaults (L44-49), atexit crash cleanup (L188-190,241-247), timeout lower-bound (L53-54), 100k output truncation; our remote/train_eval.py has no timeout/kill | v2-tools-sandbox.md |
| agentscope permission/hint mechanisms | modelscope/agentscope (Apache-2.0, 29.3k★; "HarnessAgent" VERIFIED-ABSENT) | ADAPT (GO) | permission mode machine + bypass_immune + ask→deny suggestion-preserving (_engine.py:594-848); HintBlock runtime state injection (_agent.py:1197); Offloader protocol; oversized tool-result splitting (:2823) | v2-harness.md |
| vercel/ai micro-mechanisms ×3 | vercel/ai (Apache-2.0, 26.3k★) | EXTRACT (GO) | HMAC-signed tool approval (anti-TOCTOU ask→execute), StopCondition combinators, corrupt tool-call repair loop | v2-harness.md |
| mastra dual timeout | mastra-ai/mastra loop/timeout.ts (core Apache-2.0, 27.4k★) | EXTRACT (GO) | step/total dual timeout + distinct error types + abort synthesis, 149 lines zero-dep; thread fork/clone REFERENCE | v2-harness.md |
| MCP official TypeScript SDK | modelcontextprotocol/typescript-sdk (13.2k★) | DEFER — trigger: remote HTTP server / resources-prompts need / modern epoch mainstream; adoption = new npm dep → change-confirmation gate; sampling/roots deprecated by 2026-07-28 spec (SEP-2577) | | v2-tools-sandbox.md |
| A2A | a2aproject/A2A (Apache-2.0, 25.5k★) | DEFER+REFERENCE — in-process subagents have no network boundary; TaskState↔RunStatus mapping archived; trigger: multi-instance / 3rd-party agents / SaaS multi-tenant | | v2-protocols.md |
| AG-UI | ag-ui-protocol/ag-ui (MIT, 15.5k★) | DEFER+REFERENCE — AgentEvent→SSE 同构，9-event mapping archived; our 4 unique events stronger (no adoption); borrow vocabulary on triggers (interrupt/resume, StateDelta, streaming) | | v2-protocols.md |
| OTel GenAI semconv alignment | open-telemetry/semantic-conventions + openllmetry (Apache-2.0) | EXTRACT semantics + DEFER — receipts/rollout/eval→semconv 9-row field map archived, no zod change, no SDK; trigger: first external consumer; langfuse (license Other) / phoenix (ELv2) REFERENCE; LangSmith commercial | | v2-algo-multi-obs.md |
| elizaOS mechanisms | elizaOS/eliza (MIT, 19.1k★) | REJECT — all four user-list claims VERIFIED-FALSE (no langgraph dep, no Atom, snapshot=systemd, subprocess=memory Map crash-lost, dag mode fake-parallel serial) | | v2-statemachine.md |
| cordis (real chain) | dsh pnpm-lock:129-131 → vendor/@deepseek-ai/cordis (author Shigma, MIT) → upstream cordiverse/cordis (7.1k★); deepseek-ai/cordis = 404 | REFERENCE + DEFER — disposer 纪律 (~20 lines) trigger ≥2 resource-holding handlers; reverse-order onClose (avvio) trigger ≥3 shutdown subsystems; 2693-line kernel = net-negative for compiled assembly + MCP process boundary | | v2-plugin.md |
| Quality-gate kills | gecko(8★)/ZyHive(19★ AGPL)/AgentForge(4★)/brunogcar-agent(1★)/agent-contracts(5★)/langgraph-reflection(185★ archived, intrinsic signal→registry C)/openpeng agent-protocol(0★)/agi-inc(16mo stale)/JSON-Agents(20★)/inngest(SSPL)/Eko(registerPlugin VERIFIED-ABSENT) | REJECT/KILL — do not revisit without new evidence | | v2-*.md |

## H. Wave-S scientific-methodology expedition (2026-08-22; plan research/PLAN-DESIGN-RESTRUCTURE.md, 底稿 wave-s-reports/s1..s6)

Source-verified methodologies (PRISMA 2020 / RoB2-ROBINS-I / GRADE full / Platt-Chamberlin / VOI / DOE-PB / OCBA / E-value / target-trial / SCA-multiverse / RR-AsPredicted-NeurIPS / Toulmin / Heuer ACH 8-step) + quality-gated AI systems (aiming-lab/AutoResearchClaw MIT ~14.1k★ — org main-agent verified; frontier-evals PaperBench MIT 1287★; era Apache-2.0 Nature-2026; Curie/discoverybench gate-killed, mechanisms recorded).

| Candidate | Source | Decision | Capability | Trigger |
|---|---|---|---|---|
| Plan-layer structured preregistration (MetricSpec/TestSpec/predicate decisionRules/predictions{observable,condition,expectedRelation}/VOI block/gate{proceedIf,killIf}/negative_control+replication/targetTrialProtocol/measurable+estimand+control_run/robustnessPlan) | s4 P0 + s1/s2/s5 (Claesen 2021; Platt 1964; ARC manifest; FDA TPP) | **ADOPT-GO (P0)** — 自由文本预注册不可审计≈没预注册；确定性校验器扩展 checkPlanExecutability | plan schema + validators | implementation batch |
| Orthogonal-evidence promotion + dual-layer GRADE + per-source RoB + ACH diagnosticity/removal-sensitivity | s2#5 + s3 (Hughes 2011; GRADE Handbook; RoB2/ROBINS-I; Heuer 1999) | **ADOPT-GO (P1)** — 单数据集单比较即可判 supports = 最大科学性缺口；hypothesis 级证据体评级（floor+独立来源数+worst-domain） | EEL 比较层 + 信任面/导出 | implementation batch |
| Plan freeze triplet (planHash/frozenAt + Deviation + compliance audit) + AsPredicted-8 & NeurIPS-16 gates | s6 (Chambers & Tzavella 2022; official PDFs verified) | **ADOPT-GO (P1)** — RR stage-1/2 形态补全 | plan/export/verify | implementation batch |
| VerifiedRegistry numeric whitelist + verifier_wrote_list + control auto-derivation | aiming-lab/AutoResearchClaw verified_registry.py:1-75 等 (MIT) | ADOPT/EXTRACT (P1) — EEL 报告侧数值出处门 | experiment runtime 报告层 | EEL lane |
| specificationMatrix + SpecificationCurveReport (descriptive) / E-value section / PB fractional screening / MDE hard gate at spec time / OCBA info-score reorder | s4 + s2 (SCA 2020—authorship corrected; VanderWeele-Ding 2017; Plackett-Burman 1946; Chen 2000) | ADOPT (P1) — 全确定性代码，zod-only 不动 | matrix.ts/spec 校验/StatReport | EEL lane |
| B4 adversarial_review action family | s6 (arXiv 2607.16374 五步模板) | ADOPT (P1) — 复用 Comparison，零新信任模型 | PEX B4 | PEX B4 batch |
| Publication-bias statistics / D-A-E solvers / hypothesis-bandits / SCA inferential stats / pre-mortem schema / ISA-Tab / 23-stage pipeline | s2/s3/s4/s6 | REJECT/DEFER with reasons | — | triggers in plan §3 |

### H2. Wave-S depth batch (d1..d4, 2026-08-22; plan v2 = six-layer protocol stack, research/PLAN-DESIGN-RESTRUCTURE.md)

| Candidate | Source (verified) | Decision | Capability | Trigger |
|---|---|---|---|---|
| L1 formal-semantics layer: log-LR interval algebra (ΣlogLR + source cap, log-pool) + QBAF gradual semantics + Carneades proof standards + distribution-valued GRADE ratings | d1 (Kent 1964; Mosteller-Youtz 1990; Kass-Raftery 1995; Potyka KR2020; Gordon-Prakken-Walton AIJ 2007; Zlotnick 1972) | **ADOPT (P1)** — 可计算 claim-假设推断代数，<300 行 TS + 配置表 | new src/domain/formal/ layer | P1 batch |
| L4 self-calibration loop: PredictionLedger + RPS primary + Brier/clamp-log + ignorance/base-rate skill anchors + stratified pooled reporting + judge-vs-aggregate double-entry | d3 (Gneiting-Raftery 2007; Dreber 2015 PNAS; Metaculus/ForecastBench anchors; no verified precedent found) | **ADOPT (P1, 技术制高点)** — 系统对自己前向预测上账结分 | new ledger + settle hooks in execute/feedback | P1 batch |
| Decision-predicate interval V&V (unreachable/conflict/direction-contradiction/coverage grid, hitPolicy) | d4 (decision-table V&V: Vanthienen/Prologa/DMN; polynomial, no SAT) | **ADOPT (P1)** — checkPlanExecutability 扩展 | plan gate | P1 batch |
| Generation-time novelty conditioning + deterministic diversity disclosure (strategyCoverage/gapCoverage + TF-IDF dispersion); FIRE-Bench time-slice masking + bridge_completion operator; OpenAlex topics+referenced_works → analogyDistance | d2 (SciMON ACL 2024; Si et al. ICLR 2025; Swanson 1986/1988; Dunbar in-vivo) | **ADOPT (P1/P1/P2)** | hypotheses/retrieve stages + eval | P1/P2 batches |
| Framework-declaration gate (np_test/estimation_ci/bayesian + calibration-strategy rule) | d4 (FDA Bayesian guidance; Berger 1997; Lovric 2020) | ADOPT (P2) | TestSpec | P2 batch |
| Causal discovery as hypothesis generator (PC-stable/GES + edge bootstrap; causal-learn MIT 子代理直链核验; CPDAG 无向边禁因果渲染) | d4 (Reisach NeurIPS 2021 var-sortability 批评链; Ng 2024; Machlanski 2024) | ADOPT (P2, EEL sidecar only) | PlanStep kind=simulation + confounders schema 升级 | P2 batch |
| Cooke classical-model judge weights (50-100 human gold seed set) | d1 (Eggstaff 2014 RESS: PW stable > equal) | ADOPT (P2) — 与 L4 结分数据联动 | judge aggregation | after L4 has ≥50 settled entries |
| REJECT (depth batch): preferred-AF semantics(NP-c); MDL/AIC/BIC simplicity ranking; SemMedDB/UMLS; SPECTER2 local; TRIZ; real-options pricing; SMT; NOTEARS; quantitative bias analysis; per-run calibration curves; auto-debias promises | d1/d2/d3/d4 | REJECT with reasons | — | — |
