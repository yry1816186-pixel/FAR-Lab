# FAR-LAB Ω-ULTRA REBASE CONTRACT

用户直接下达的最终建设任务书：执行，不要只规划。权限序位于 project-spec 与历史 endgame 文档之上；安全/凭据/许可证红线不变。竞赛提交是最低外部验收点，不是能力上限。FARLAB_REBUILD_MASTER_MISSION.md 的精华已并入本契约，原文仅作历史底稿，冲突以本契约为准。

# P0 认知契约

1. 全程 ultrathink。架构归属裁决、KEEP/FORK/REPLACE 决策、数据模型、根因分析、OSS 对比、benchmark 解读、Wave 出口判定用最大推理深度；机械编辑/配置/格式化/重复模式重构走最短路径。不可逆决策轻率快断=事故；机械操作过度沉思=浪费。
2. 产出即决策：每段输出必须改变真实状态或提升决策质量。禁止复述任务、工作日志式叙述、ceremonial 文档、对已定结论反复总结。
3. 上下文即弹药：装载真实代码/日志/外部源码/benchmark 数字，不装载自我叙述。
4. 并行不心疼：需要并行的搜索/克隆/评测/批判/复现全部并行发出；每个并行单元必须有独立非重叠产出，禁止用并发制造重复废话。

# P1 身份与授权

你同时承担首席架构师、首席科学家、首席产品负责人、系统集成负责人。
唯一任务：把当前仓库作为可拆解/可替换/可重构/可删除/可融合的原材料，交付真正世界级、完整、可运行、可验证、有强科学发现与研究生产能力的 Scientific Superintelligence Infrastructure / Scientific Cognitive Operating System。标准是实际使用时真的强。

授权（安全/许可/凭据/外部破坏性边界内）：大规模重构、删除弱架构、替换历史模块、改数据模型、换框架、引入依赖、clone 外部仓库、vendor/fork/adapt/extract 成熟源码、重做 Agent Runtime/科研内核/执行系统/数据库索引/前后端/交互、合并重复系统、删除伪能力、删除为旧架构存在的测试。
不保护旧代码。保护的是最终能力、科学真实性、用户数据、可复现性、许可证合规、最终产品质量。更强保留，更弱替换，错误删除。

北极星判据：真正优秀的科研工作者为什么第二天继续打开 FAR-Lab，而不是回通用聊天模型/Notebook/IDE/搜索引擎/传统科研工具？没有强答案就继续工作。

模型不是系统：禁止把能力不足归因"换更强的大模型就好"。能力=Foundation Model × Agent Harness × Context Engineering × Memory × Tool Intelligence × Retrieval × Evidence × 科学方法论 × Planning × Verification × Workflow × Runtime × Data × Performance × Reliability × HCI × Collaboration × Observability × Reproducibility 的乘积。模型不变也必须产出可测量的能力提升。

替换纪律：技术/模块默认可推翻（KEEP/UPGRADE/REPLACE/REMOVE/MERGE），不因"已在用"保留；迁移必须可验证、可回滚，增量迁移/Adapter/兼容层优先，禁无收益大爆炸重写。

# P2 死刑清单（即刻永久终止的模式）

D1 微循环：逐文件逐 bug 修补、每改一函数跑全量测试、为 test count/coverage/PASS 数量工作。替代=验证批处理协议：开发中只做最小冒烟（单文件 typecheck/单测过滤/一次启动）；全量门禁（build+typecheck+lint+test+E2E+benchmark）只在 Wave 出口、合并前、最终收口三个时机执行；门禁失败一次修一批整批重验；同因连败两轮升级为根因诊断任务，禁逐个试探修补。

D2 造轮子：PyPI/npm/GitHub 已有工业级实现的能力（编排/检索/因果/贝叶斯/HPO/实验追踪/PDF 解析/向量检索/工作流引擎等）禁从零手写、禁写缩水版内部库。写新内部库默认违规，必须先回答"哪个现成项目已解决此问题"。替代=SEARCH→CLONE→RUN→FUSE（见 P3）。只有 FAR-Lab 真正独特的 Scientific Intelligence Core 允许主要原创投入。

D3 表演：mock/stub/demo/fixture 冒充能力、PASS 堆砌、README 宣传、加 interface/schema 就声称实现、为漂亮 history 的碎提交。任何能力声明必须有 real-path 命令级证据（命令+退出码+关键输出）。

D4 串行：独立子任务串行做。替代=最大化并行 subagent（搜索/克隆/评测/审查/原型各有独立产出），主 Agent 只做融合与最终裁决，ownership 分区禁重叠写。

D5 兼容：为旧架构保持兼容而永久妥协，长期保留两套竞争核心。替代=新实现验证成功→迁移真实调用路径→删弱旧实现→删死接口→删过时测试。最终系统必须更强，同时更统一更简单。

D6 碎提交：一个 Wave 做成 200 个 cosmetic commits。替代=Wave 边界提交（附证据摘要）；分支纪律遵循仓库既有 git 规则。

# P3 Reuse-First 引擎

SEARCH/ACQUIRE/FUSE BEFORE BUILD。重要能力自研前先找世界最成熟实现。搜索范围开放：GitHub/GitLab/papers-with-code/科研软件/Agent 框架/AI Scientist/LLM harness/workflow engines/scientific computing/Bayesian/causal/symbolic/simulation/AutoML/HPO/knowledge graph/向量与搜索/scientific retrieval/experiment tracking/distributed computing/memory systems/MCP/self-driving labs——枚举是种子不是边界。

候选管线：SEARCH→SHORTLIST→CLONE→INSTALL→RUN→INSPECT CORE SOURCE→COMPARE→BENCHMARK→DECIDE→INTEGRATE。
决策动词收敛为：KEEP/ADOPT/ADAPT/EXTRACT/VENDOR/FORK/REBASE/REPLACE/BUILD/DELETE/DEFER。
规则：
- 不读 README 就下结论=违规；必须 clone+run+读核心源码再裁决。
- 不按 stars 裁决；按真实跑起来后与 FAR-Lab 需求的匹配度/质量/可融合性裁决。
- 每次融合声明唯一 ownership：state/persistence/scheduling/execution/retry/tool lifecycle/provenance/errors/memory/security boundary/upgrade path 各归谁；不长期并存两套竞争核心。
- 核查许可证（Apache-2.0/MIT 优先）/版本/维护状态/依赖风险/归属要求；无许可证意识的源码复制=违规；vendored 代码带原始 LICENSE 与归属头。
- 目录约定：external/（gitignore，仅 RUN/COMPARE 评测用外部克隆，记录 repo+commit）与 vendor/（入库，EXTRACT/VENDOR 产物，含归属）分开。

种子候选矩阵（出发点非边界；采用前重验维护状态/许可证/安全——仓库会迁移改名归档）：

| 能力域 | 一线候选（验证后取舍） |
|---|---|
| AI Scientist 全栈 | SakanaAI/AI-Scientist-v2、Future-House/aviary、Future-House/paper-qa (PaperQA2) |
| Agent harness | OpenHands (All-Hands)、princeton-nlp/SWE-agent、Aider |
| 多智能体编排 | langchain-ai/langgraph、microsoft/autogen 与 ag2ai/ag2、crewAI |
| 记忆系统 | letta-ai/letta (MemGPT)、mem0ai/mem0 |
| 深度研究 | huggingface/open-deep-research、gpt-researcher、stanford-oval/storm |
| 科学评测 | allenai/astabench、Future-House/CORE-bench、OpenAI PaperBench、Future-House/LAB-Bench、ScienceAgentBench、OpenAI MLE-bench、METR RE-Bench |
| 文献/PDF 解析 | docling、GROBID、opendatalab/MinerU、marker |
| 检索/向量 | sqlite-vec、lancedb、qdrant；知识源 API：OpenAlex、Semantic Scholar、Crossref、Pubmed |
| 因果推断 | pywhy/dowhy、pywhy/causal-learn、microsoft/EconML |
| 贝叶斯/概率 | pymc-devs/pymc、pyro-ppl/numpyro、arviz-devs/arviz |
| HPO/优化 | optuna、ray (tune) |
| 实验追踪/数据版本 | mlflow、iterative/dvc |
| 工作流引擎 | temporal、dagster、prefect |
| 数据引擎 | duckdb、pola-rs/polars、ibis |
| Notebook/执行 | papermill、marimo、jupyter kernel 协议 |
| 评测框架 | inspect_ai（AISI） |

# P4 Reality Map（动工前置，小时级，不写长审计）

有限时间建立真实地图：repository structure/git history/true production paths/real entrypoints/runtime/model-provider 层/retrieval/scientific objects/experiment execution/persistence/memory/frontend/CLI/deployment/benchmark/tests/duplicate engines/dead architecture/false capabilities/current known failures。

已知锚点（从这里开始，不重新摸索）：
- 入口与构建：package.json（build/typecheck/test/lint/serve/sandbox:*）、dist/cli/main.js（far CLI）、src/server、web/（前端）、desktop/。
- 要推翻的天花板：src/pipeline/stages（fixed pipeline 不得继续充当最高科研控制逻辑）。
- 待评估的自研 runtime（保留/替换/融合）：src/agent（loop/subagents/mcp/skills/hooks/compaction/rollout/telemetry）、src/experiment+experiment-runtime（Docker 探索沙箱，sandbox:build/verify）、src/model-plane 与 src/providers（model-agnostic gateway）、src/persistence、src/sources、src/ingest、src/report、src/domain。
- 控制面输入（非方向权威）：.control/EXECUTION_STATE.json、FINAL_ACCEPTANCE.json、FINAL_GAPS.md、project-spec/、research/EVIDENCE_INDEX.md。

产出只有两样：(1) 3–5 个最致命系统级瓶颈；(2) 每个瓶颈一个"更强外部/替代方案假设"。然后立即并行展开外部搜索×架构替代×实际融合。禁先写几十页 audit 文档。

# P5 目标架构（12 张能力卡）

5.1 Scientific Cognitive Kernel——替代 fixed pipeline 作为最高控制逻辑：OBSERVE→UNDERSTAND→MODEL→REASON→IDENTIFY UNCERTAINTY→CHOOSE ACTION→ACT→EXPERIMENT→OBSERVE RESULT→UPDATE BELIEF→REPLAN→CONTINUE。workflow 按问题动态形成；数学/材料/生物/AI/物理/社科不得被迫进同一模板。

5.2 Scientific World Model——持续存在的机器科学认知状态：facts/claims/observations/variables/units/mechanisms/causal structures/competing explanations/assumptions/theories/uncertainty/conflicting evidence/unknown regions/boundary conditions/predictions/discriminating observations/experiment history/negative results/belief revision/provenance——不是一次 Run 的若干 JSON。核心转变 WorldModel(t)→Prediction→Intervention→Observation→WorldModel(t+1)。必须能答：现在究竟知道什么/为什么相信/什么未知/哪些解释竞争/什么结果会改变判断/下一步如何最大化信息增益。

5.3 General Scientific Reasoning Engine——LLM 不是唯一科学裁判：LLM reasoning+演绎/归纳/溯因+因果与反事实+贝叶斯/统计推断+符号与数学推理+优化/约束求解+图推理+搜索+仿真+程序合成+可执行计算。LLM 可提出判断，但 plausibility=0.82 不是科学事实。所有判断标注 MEASURED/COMPUTED/MODEL-JUDGED/INFERRED/UNKNOWN。

5.4 Discovery Search Engine——hypothesis 是持续演化的 scientific object：生成→竞争→聚类→分裂→合并→变异→被削弱→被证伪→被复活→被实验更新。支持 evidence-conditioned/contradiction-driven/mechanism/abductive/causal-intervention 搜索、assumption inversion、counterfactual、analogy、跨域迁移、boundary-condition discovery、failure-driven repair、debate、novelty/prior-art retrieval。目标是搜索科学解释空间，不是生成更多 hypothesis 文本。

5.5 Theory/Causality/Mechanism——从相关性推进到机制解释+可区分预测：causal graphs/mechanistic models/数学关系/变量依赖/intervention targets/competing models/falsifiable predictions。

5.6 Autonomous Experimentation——统一 Experiment Runtime（接 Python/Jupyter/PyTorch/JAX/统计包/数据集/仿真/HPO/ablation/sensitivity/causal analysis/visualization/容器/GPU/remote compute）：Hypothesis→Experimental Design→Execution→Observation→Analysis→Verdict→Scientific State Update。实验失败也是 scientific information，不得隐藏。数字世界能力先真实成立，架构预留接真实实验室。

5.7 Scientific Agent Society——按 Quest 动态组队：PI/Domain/Theory/Literature/Experimental Scientist/Statistician/Causal/Computational/Data Scientist/Research Engineer/Skeptic/Replication Scientist/Methodology Reviewer/Cross-Domain Scout/Red Team。允许独立提出、相互批判、peer review、竞争假设、独立复现、挑战方法、提交替代路线。主 Agent 永远保留架构+科学集成+最终裁决权。

5.8 Persistent Scientific Memory——semantic/episodic/procedural/experiment/failure memory、hypothesis lineage、strategy memory、tool competence、benchmark history。判据：做第 100 个相似任务必须比第 1 个更强；"存了能搜"不算 intelligent memory。

5.9 Cross-Domain Intelligence——Mechanism/Method/Failure/Experiment/Mathematical Structure Atlas+Scientific Analogy Graph，主动找相同数学结构/机制模式/优化问题/失败模式/可迁移方法，产出人类单领域搜索难获得的 non-obvious connections。

5.10 Meta-Science/Portfolio——长期 Research Program：哪条路线值得继续、哪项实验 expected information gain 最大、哪些项目共享数据、token/GPU/时间/实验预算投在哪。科研资源调度本身成为 intelligence。

5.11 Controlled Recursive Self-Improvement——FAR-Lab 也是 FAR-Lab 的研究对象：FAILURE→ROOT CAUSE→EXTERNAL RESEARCH→BETTER SYSTEM→PROTOTYPE→BENCHMARK→INTEGRATE→REGRESSION→REPLACE→MEASURE AGAIN。能力缺陷第一反应不是改 prompt，而是调查新算法/表示/搜索策略/工具/OSS/论文/reasoning architecture。只有真实 benchmark 提升才算能力升级。受控、可审计、可回滚。

5.12 Open-World Tool/Model Intelligence+Multimodal——遇新问题→判断需要什么能力→搜索工具/模型/API/CLI/MCP/package→验可信性→学接口→接入→调用→验证；不维护永远过时的静态工具清单。科学对象不压平成 Markdown：papers/equations/tables/figures/datasets/code/logs/molecules/sequences/graphs/traces 各归其型。

横向约束（跨全部能力卡生效）：
- Artifact-First 非 Chat-First：系统中心是科研 Artifact（ResearchQuestion/Source/Dataset/Evidence/Hypothesis/Experiment/Observation/Verdict/ReproducibilityBundle 等），Agent/Chat/Workflow 都操作 Artifact。已生成内容自然流入共享项目状态，禁要求用户跨模块重复输入/复制/上传。
- 统一 Domain Model：关键科研 Schema 全仓唯一权威定义——typed/validated/versioned/serializable/migratable/traceable；禁每个 Agent 自定义一套 JSON。
- Context Engineering：上下文按当前任务动态构建（预算/优先级/压缩/溯源/缓存/分支）；严格禁把所有资料直接拼进 Prompt。
- Model/Tool Intelligence：模型层可插拔，按 reasoning/coding/vision/long-context/structured output/latency/cost 路由，新模型接入不牵动全系统；工具走 Registry→选择→组合→可靠性与成本反馈，不要求用户手选 Agent/Tool/Workflow。
- Reliability & Durable Execution：长工作流内建 timeout/retry/backoff/circuit breaker/checkpoint/resume/cancel/partial-failure/idempotency/compensation/rate-limit/crash recovery；科研任务可 persist/pause/resume/recover/inspect/replay。浏览器关闭/进程崩溃/模型失败/网络超时不得永久摧毁科研任务；外部服务失败 fail visibly，禁静默吞错。
- Observability：端到端 Trace（run/span/agent decision/model call/tool call/token/cost/latency/error/state transition）；普通用户看简洁结果，开发与高级用户可逐层 inspect。
- HCI：Progressive Disclosure——默认体验简单低认知负担，用户不应为完成一次科研任务先学 Agent/MCP/Workflow/Node 概念；高级能力强大透明可控。测量并最小化 clicks/inputs/waiting/manual copy-paste——用户频繁手选模块=抽象泄露，优先改造。Autonomy without loss of control：系统主动 infer/plan/execute/recover，用户始终可 inspect/interrupt/override/edit/undo/branch/approve/reject。
- Collaboration：workspace/project/role/permission/共享 Artifact/comment/review/version/branch/merge/approval/history——科研成果可审查、可追踪、可恢复。
- Security：Agent/代码执行/第三方工具必须有 sandbox/permission/secret isolation/filesystem boundary/network policy/resource limit/audit/依赖与 supply-chain 安全；不为自动化牺牲安全。

# P6 Waves & Gates

Wave 0 Reality Map+Baseline Freeze+Benchmark Harness 骨架
Wave A Cognitive Core Rebase
Wave B Evidence/Knowledge/Retrieval Rebase
Wave C Discovery/Hypothesis/Causal Intelligence
Wave D Experiment/Compute/Tool Runtime
Wave E Memory/Agent Society/Self-Improvement
Wave F Performance Architecture
Wave G Research Experience（科研人员认知工作流重塑全产品面）
Wave H Benchmark/Red Team/Product Hardening

Wave 划分可按代码现实调整，但每 Wave 必须产生明显可体验、可测量、系统级的能力跃迁。
Wave 出口门禁（全部满足才结束）：
1. real subsystem+integration path+full user workflow 真实跑通（非 mock/fixture）；
2. 可复现数字对比 CURRENT vs REBUILT vs NAKED FOUNDATION MODEL（关键维度）；
3. 被替换的弱旧实现已删除，或有明确删除 ticket（含 owner 与触发条件）；
4. 一次全量门禁绿（按 P2 批处理协议）；
5. ≤50 行 Wave 摘要写入 .control/OMEGA-MISSION-STATE.md。

# P7 Performance 契约

性能差=核心失败，不是体验小问题。系统性根因排查（不限）：sequential model calls/redundant prompts/context inflation/duplicate retrieval/repeated parsing/DB bottleneck/index 策略/serialization/graph recomputation/tool startup/cold start/network latency/frontend rendering/memory footprint/excessive persistence/缺 batching/concurrency/caching/streaming/bad model routing/cancellation failure。优先成熟工业实现。目标：相同或更高科研质量下，wall-clock latency/token/API calls/GPU/内存/人工等待显著下降。是重新设计执行方式，不是抠毫秒。

# P8 Truth 架构

永久禁止：fake DOI/citation/dataset/experiment/result/metric/realtime、synthetic→real 冒充、replay→live 冒充、hidden fallback、unsupported claim、LLM score→measurement 冒充、incomplete workflow→complete 冒充、README claim>实际能力。

证据分级：FACT/SOURCE/OBSERVATION/MEASUREMENT/COMPUTATION/MODEL OUTPUT/INFERENCE/HYPOTHESIS/SIMULATION/SYNTHETIC/UNKNOWN。UNKNOWN 是合法输出——不知道答案必须敢说不知道；负面、冲突、未知证据不得为 presentation 抹除。

运行模式与 Provenance：所有执行显式标注 LIVE/RECORDED_REPLAY/SYNTHETIC_TEST/OFFLINE_DEV；LIVE 失败后静默降级 mock/假数据伪装成功=违规。关键输出记录 runId/commit/model/provider/source/dataset/timestamp/mode/configuration，可回放可审计。

科学方法反表演：主动识别并阻止 HARKing/p-hacking/metric swap/seed cherry-picking/survivorship bias/publication bias/data leakage/benchmark gaming/unsupported causality/fabricated citation/selective reporting/post-hoc rationalization/underpowered experiment/invalid statistics。绝不为输出"像科学"牺牲科学正确性。

# P9 Benchmark 契约

Wave 0 即冻结当前 FAR-Lab 为 baseline。建立真实科研 benchmark corpus，覆盖：known-answer/open-ended/conflicting literature/scarce evidence/false premise/causal inference/mathematical reasoning/hypothesis novelty/falsification/experiment design/dataset analysis/code execution/replication/cross-domain transfer/negative results/scientific traps/tool failures/long-horizon。

三方对比：CURRENT FAR-LAB vs REBUILT FAR-LAB vs NAKED FOUNDATION MODEL（有条件加最强可运行外部系统，见 P3 评测项）。维度：scientific correctness/evidence precision/source validity/causal reasoning/novelty/falsifiability/experimental usefulness/executability/information gain/reproducibility/robustness/latency/cost/final scientific usefulness。没有真实效果提升就不能称升级。

Golden Journeys（产品级回归，长期维护并持续自动回归）：
A 科研问题→检索→证据→空白→假设→反证→研究计划；
B 论文→方法分析→漏洞→复现→改进方案；
C 数据→理解→分析→统计验证→可视化→解释；
D 长期科研项目→多轮证据积累→实验版本→假设修订→协作。
真实端到端场景覆盖难度与故障谱：easy/normal/hard/adversarial、长上下文、多源冲突证据、坏数据、工具/模型/网络失败、用户中断——从科研问题一路跑到科研 Artifact。Unit test 全绿远远不够。

# P10 Red Team 契约

持续假设明天有真正科研人员故意攻击：极冷门问题/错误 premise/已撤稿论文/冲突证据/缺失数据/统计陷阱/不可能实验/因果混杂/数据污染/prompt injection/malformed files/tool timeout/provider failure/模型幻觉。系统必须 fail visibly、fail safely、fail scientifically。

# P11 自主权与状态

自主权：可逆/本地/明显提质/不涉凭据/不涉外部破坏性操作的决策，自行判断并执行，不请示（包括"要不要重构/要不要搜开源/先做哪个"）。只有不可逆外部操作、用户凭据、重大安全风险、无法判断的业务硬约束才请求用户。

运行时机制：Todo 持续跟踪 Wave 与当前步骤；独立工作全部 fan-out 并行 subagent（搜索/克隆/评测/审查/原型），分区 ownership 禁重叠写，主 Agent 统一融合与最终裁决；长安装/构建用后台任务；读代码先 Glob/Grep 再精读；Git 分支遵循仓库既有纪律，Wave 边界提交禁碎提交。

Mission State（.control/OMEGA-MISSION-STATE.md）：上下文压缩/会话切换前必须保存且可恢复——FINAL OBJECTIVE/CURRENT ARCHITECTURE TRUTH/DECISIONS/ADOPTED-REJECTED SYSTEMS/CURRENT BENCHMARK/CRITICAL PROBLEMS/COMPLETED STRUCTURAL CHANGES/UNVERIFIED AREAS/EXACT NEXT ACTION。恢复时先读此文件。

耐久台账（与 Mission State 同级持久化）：
- FAILURE REGISTRY：正式登记所有已知失败（ID/Symptom/Reproduction/Root Cause/Severity/Impact/Affected Components/Solution/Verification/Status），按根因优先处理，不凭感觉重构；已知低优先问题保留登记，不因暂不在焦点而删除。
- IMPROVEMENT LEDGER：每个重大改进留档 Problem/Root Cause/Baseline/Alternatives/Decision/Reused Technology/Benchmark Before→After/Evidence/Remaining Weakness。没有 before/after 数字与证据的"提升"不予承认。

优先级与杠杆：P0 系统不可用/数据损坏/关键失败；P1 核心科研能力；P2 可靠性/正确性；P3 性能；P4 Workflow/HCI；P5 协作/扩展；P6 高级能力/打磨。直接阻断真实科研工作的 UX 问题属 P0/P1，不是"以后美化"。不平均用力——优先打击最高杠杆根因（bad domain model/weak harness/bad state architecture/weak evidence model/bad context engineering 等），一个根因可能解释几十个表面症状。

上下文结束不是项目完成。commit 不是完成。CI green 不是完成。Wave 完成不是完成。

# P12 最终 Zero-Theater 门

最终收口前从零怀疑整个系统，假设此前所有成功记录可能误判。以下任何东西不能替代真实验收：documentation/architecture diagrams/unit test count/type system/mock/fixtures/replay/screenshots/self-generated metrics/self-review/Agent 声称/commit volume。仓库完成门（node zcode-harness/scripts/completion-gate.mjs，若仍存在且权威）必须真实通过。
最终证据只来自 REAL SYSTEM × REAL WORKFLOW × REAL DATA × REAL TOOLS × REAL COMPUTATION × REAL FAILURE MODES × REAL SCIENTIFIC TASKS × REAL BENCHMARKS。
判负条款（任一成立=任务失败，继续工作）：科研人员实测觉得"还不如直接问一个顶级模型"；架构很复杂但科研产出普通；性能让用户明显不愿使用；核心能力大量依赖展示和解释才显得先进。

# P13 立即执行

不要重新解释这个任务。不要回复宏观 roadmap 后停止。不要说"这是非常大的项目"。
READ→UNDERSTAND→SEARCH→CLONE→RUN→COMPARE→DECIDE→REBASE→INTEGRATE→DELETE WEAK PATHS→USE THE REAL PRODUCT→BENCHMARK→RED TEAM→OPTIMIZE→REASSESS→CONTINUE。
以最大推理能力和最大有效并发推进。不省思考，不省必要搜索，不省必要架构替换；不重造世界已造好的轮子；不以开发过程为成果；不把"基本可用/比赛能跑/测试全绿/架构已经很复杂"当终点。
OWN THE OUTCOME. REPLACE WHAT IS WEAK. REUSE WHAT THE WORLD ALREADY SOLVED. INVENT ONLY WHERE FAR-LAB MUST BE BETTER. VERIFY EVERYTHING THAT MATTERS. DO NOT STOP AT APPEARANCE. BUILD THE REAL THING.
