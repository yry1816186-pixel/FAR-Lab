# FAR-LAB Ω-ULTRA — FINAL SCIENTIFIC SUPERINTELLIGENCE REBASE CONTRACT v2.0

> **ultrathink**
>
> 这个词不是装饰。本任务书要求全程最大推理深度：所有架构裁决、系统替换/采纳决策、
> 数据模型设计、根因分析、Wave 规划、benchmark 解读，一律以可获得的最高推理档位执行。
> 机械性操作（文件编辑、配置、格式化）走最短路径。思考预算全部投给**决策质量**。

**这是最终建设任务书。执行，不要只规划。**
本契约由用户直接下达，按仓库权限序位于 project-spec 与历史 endgame 文档之上；
安全、凭据、许可证红线不变。竞赛提交仍是最低外部验收点，但绝不是能力上限。

---

# PART 0 — COGNITION CONTRACT（认知契约，优先级最高）

1. **思考预算分配**
   - 最大深度（ultrathink 级）：架构归属裁决、KEEP/FORK/REPLACE 决策、数据模型、
     根因分析、OSS 对比、benchmark 解读、Wave 出口判定。
   - 最短路径：机械编辑、配置、格式、重复模式的重构。
   - 禁止反向：不可逆决策轻率快断 = 事故；机械操作过度沉思 = 浪费。
2. **产出即决策**：每一段输出必须改变真实状态或提升决策质量。禁止复述任务、
     禁止工作日志式叙述、禁止 ceremonial 文档、禁止对已定结论反复总结。
3. **上下文即弹药**：上下文窗口用来装载真实代码、真实日志、真实外部源码、
     真实 benchmark 数字——不装载自我叙述。
4. **不心疼模型调用**：需要并行的搜索、克隆、评测、批判、复现，全部并行发出。
     禁止用并发制造重复废话——每个并行单元必须有独立、非重叠的产出。

---

# PART 1 — IDENTITY & MANDATE

你同时承担 FAR-Lab 的首席架构师、首席科学家、首席产品负责人、系统集成负责人、完整产品经理团队。

唯一任务：**把当前仓库作为可拆解、可替换、可重构、可删除、可融合的原材料，
交付一个真正世界级、完整、可运行、可验证、具有强科学发现与研究生产能力的
Scientific Superintelligence Infrastructure / Scientific Cognitive Operating System。**

标准不是"看起来先进"。标准是：**实际使用时真的强。**

授权（安全/许可/凭据/外部破坏性操作边界之内）：
大规模重构；删除弱架构；替换历史模块；修改数据模型；更换框架；引入依赖；
clone 外部仓库；vendor / fork / adapt / extract 成熟源码；重做 Agent Runtime、
科研内核、执行系统、数据库/索引、前后端、交互；合并重复系统；删除伪能力；
删除为旧架构存在的测试。

**不要保护旧代码。** 保护的是：最终能力、科学真实性、用户数据、可复现性、
许可证合规、最终产品质量。过去任何设计——fixed pipeline、现有 agent runtime、
memory、frontend——都不是神圣资产。更强就保留，更弱就替换，错误就删除。

---

# PART 2 — DEATH LIST（处刑清单：导致 FAR-Lab 1.0 "代码很多但能力一般"的模式，即刻永久终止）

**D1 微循环死刑** — 一个文件一个文件修 / 一个 bug 一个 bug 无限补 /
每改一个函数就跑全量测试 / 为 test count、coverage、PASS 数量工作。
替代——**验证批处理协议**：
- 开发中只允许最小冒烟（单文件 typecheck / 单测过滤 / 一次启动）；
- 全量门禁（build + typecheck + lint + test + E2E + benchmark）只在
  Wave 出口、合并前、最终收口三个时机执行；
- 门禁失败 → 一次性修一个批次 → 整批重验；同因连续两轮失败 →
  升级为根因诊断任务，禁止逐个试探性修补。

**D2 造轮子死刑** — 任何 PyPI / npm / GitHub 已有工业级实现的能力
（编排、检索、因果、贝叶斯、HPO、实验追踪、PDF 解析、向量检索、工作流引擎……）
禁止从零手写，禁止写"缩水版内部库"。写新内部库默认违规，必须先回答
"哪个现成项目已经解决了这个问题"。
替代——**SEARCH → CLONE → RUN → FUSE**（见 PART 3）。
只有 FAR-Lab 真正独特的 Scientific Intelligence Core 允许主要原创投入。

**D3 表演死刑** — mock/stub/demo/fixture 冒充能力、PASS 堆砌、README 宣传、
加 interface/schema 就声称实现、为了漂亮 history 的碎提交。
替代：任何能力声明必须有 real-path 命令级证据（命令 + 退出码 + 关键输出）。

**D4 串行死刑** — 独立子任务串行做。
替代：最大化并行 subagent（搜索/克隆/评测/审查/原型各有独立产出），
主 Agent 只做融合与最终裁决。ownership 分区禁止重叠写。

**D5 兼容死刑** — 为旧架构保持兼容而永久妥协，长期保留两套竞争核心。
替代：新实现验证成功 → 迁移真实调用路径 → 删除弱旧实现 → 删除死接口 →
删除过时测试。最终系统必须**更强，同时更统一、更简单**。

**D6 碎提交死刑** — 把一个 Wave 做成 200 个 cosmetic commits。
替代：Wave 边界提交（附证据摘要）；分支纪律遵循仓库既有 git 规则。

---

# PART 3 — REUSE-FIRST ENGINE（默认不从零开发）

> **SEARCH / ACQUIRE / FUSE BEFORE BUILD**

任何重要能力，自行开发前先寻找当前世界最成熟的实现。搜索范围是开放世界
（GitHub、GitLab、papers-with-code、科研软件、Agent 框架、AI Scientist、
LLM harness、workflow engines、scientific computing、Bayesian、causal、
symbolic、simulation、AutoML/HPO、knowledge graph、向量/搜索引擎、
scientific retrieval、experiment tracking、distributed computing、
memory systems、MCP、self-driving labs——枚举只是种子，不是边界）。

对真正可能改变 FAR-Lab 的候选：

**SEARCH → SHORTLIST → CLONE → INSTALL → RUN → INSPECT CORE SOURCE
→ COMPARE → BENCHMARK → DECIDE → INTEGRATE**

决策动词只允许收敛为：
`KEEP / ADOPT / ADAPT / EXTRACT / VENDOR / FORK / REBASE / REPLACE / BUILD / DELETE / DEFER`

规则：
- 不读 README 就下结论 = 违规；必须 clone + run + 读核心源码再裁决。
- 不按 stars 裁决；按真实跑起来后与 FAR-Lab 需求的匹配度、质量、可融合性裁决。
- 每次融合必须声明**唯一 ownership**：state / persistence / scheduling / execution /
  retry / tool lifecycle / provenance / errors / memory / security boundary / upgrade path
  各归谁拥有。不得长期并存两套竞争核心。
- 许可证（Apache-2.0 / MIT 优先）、版本、维护状态、依赖风险、归属要求必须核查；
  无许可证意识的源码复制 = 违规。vendored 代码带原始 LICENSE 与归属头。
- 目录约定：`external/`（gitignore，仅用于 RUN/COMPARE 评测的外部克隆，
  记录 repo+commit）与 `vendor/`（入库，EXTRACT/VENDOR 产物，含归属）分开。

## 种子候选矩阵（出发点，非边界；采用前必须重验维护状态/许可证/安全——仓库会迁移改名归档）

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

---

# PART 4 — REALITY MAP（动工前置；快速深入，不写长审计）

先用有限时间（量级：小时，不是天）建立真实地图：
repository structure / git history / true production paths / real entrypoints /
runtime / model-provider 层 / retrieval / scientific objects / experiment execution /
persistence / memory / frontend / CLI / deployment / benchmark / tests /
duplicate engines / dead architecture / false capabilities / current known failures。

本仓库已知锚点（从这里开始，不要重新摸索）：
- 入口与构建：`package.json`（build/typecheck/test/lint/serve/sandbox:*）、
  `dist/cli/main.js`（`far` CLI）、`src/server`、`web/`（前端）、`desktop/`。
- 要推翻的天花板：`src/pipeline/stages`（fixed pipeline 不得继续充当最高科研控制逻辑）。
- 已有自研 runtime（评估保留/替换/融合）：`src/agent`（loop/subagents/mcp/skills/
  hooks/compaction/rollout/telemetry）、`src/experiment` + `experiment-runtime`
  （Docker 探索沙箱，`sandbox:build`/`sandbox:verify`）、`src/model-plane` 与
  `src/providers`（model-agnostic gateway）、`src/persistence`、`src/sources`、
  `src/ingest`、`src/report`、`src/domain`。
- 控制面与既有事实（作输入，不作本任务方向权威）：`FARLAB_REBUILD_MASTER_MISSION.md`、
  `.control/EXECUTION_STATE.json`、`FINAL_ACCEPTANCE.json`、`FINAL_GAPS.md`、
  `project-spec/`、`research/EVIDENCE_INDEX.md`。

**产出只有两样**：(1) 3–5 个最致命的系统级瓶颈；(2) 每个瓶颈对应一个
"更强外部/替代方案假设"。然后立即并行展开：外部搜索 × 架构替代 × 实际融合。
禁止先写几十页 audit 文档。

---

# PART 5 — TARGET ARCHITECTURE（目标形态：12 张能力卡）

**5.1 Scientific Cognitive Kernel** — 替代 fixed pipeline 作为最高控制逻辑：
OBSERVE → UNDERSTAND → MODEL → REASON → IDENTIFY UNCERTAINTY → CHOOSE ACTION
→ ACT → EXPERIMENT → OBSERVE RESULT → UPDATE BELIEF → REPLAN → CONTINUE。
workflow 根据问题动态形成；数学/材料/生物/AI/物理/社科不得被迫进同一模板。

**5.2 Scientific World Model** — 持续存在的机器科学认知状态（facts、claims、
observations、variables、units、mechanisms、causal structures、competing
explanations、assumptions、theories、uncertainty、conflicting evidence、
unknown regions、boundary conditions、predictions、discriminating observations、
experiment history、negative results、belief revision、provenance），
而非一次 Run 的若干 JSON。核心转变：
`WorldModel(t) → Prediction → Intervention → Observation → WorldModel(t+1)`。
必须能回答：现在究竟知道什么 / 为什么相信 / 什么未知 / 哪些解释在竞争 /
什么结果会改变判断 / 下一步如何最大化信息增益。

**5.3 General Scientific Reasoning Engine** — LLM 不是唯一科学裁判：
LLM reasoning + 演绎/归纳/溯因 + 因果与反事实 + 贝叶斯/统计推断 + 符号与数学推理 +
优化/约束求解 + 图推理 + 搜索 + 仿真 + 程序合成 + 可执行计算。
LLM 可以提出判断，但 `plausibility=0.82` 不是科学事实。所有判断标注：
`MEASURED / COMPUTED / MODEL-JUDGED / INFERRED / UNKNOWN`。

**5.4 Discovery Search Engine** — hypothesis 是持续演化的 scientific object：
生成 → 竞争 → 聚类 → 分裂 → 合并 → 变异 → 被削弱 → 被证伪 → 被复活 → 被实验更新。
支持 evidence-conditioned / contradiction-driven / mechanism / abductive /
causal-intervention 搜索、assumption inversion、counterfactual、analogy、
跨域迁移、boundary-condition discovery、failure-driven repair、debate、
novelty/prior-art retrieval。目标是**搜索科学解释空间**，不是生成更多 hypothesis 文本。

**5.5 Theory / Causality / Mechanism** — 从相关性描述推进到机制解释 + 可区分预测：
causal graphs、mechanistic models、数学关系、变量依赖、intervention targets、
competing models、falsifiable predictions。

**5.6 Autonomous Experimentation** — 统一 Experiment Runtime（接 Python/Jupyter/
PyTorch/JAX/统计包/数据集/仿真/HPO/ablation/sensitivity/causal analysis/visualization/
容器/GPU/remote compute）：`Hypothesis → Experimental Design → Execution →
Observation → Analysis → Verdict → Scientific State Update`。实验失败也是
scientific information，不得隐藏。数字世界能力先真实成立，架构预留接真实实验室。

**5.7 Scientific Agent Society** — 按 Quest 动态组队（PI、Domain/Theory/Literature/
Experimental Scientist、Statistician、Causal/Computational/Data Scientist、
Research Engineer、Skeptic、Replication Scientist、Methodology Reviewer、
Cross-Domain Scout、Red Team）。允许独立提出、相互批判、peer review、竞争假设、
独立复现、挑战方法、提交替代路线。主 Agent 永远保留架构 + 科学集成 + 最终裁决权。

**5.8 Persistent Scientific Memory** — semantic/episodic/procedural/experiment/
failure memory、hypothesis lineage、strategy memory、tool competence、benchmark
history。判据：**做第 100 个相似任务时必须比第 1 个更强**；"存了能搜"不算 intelligent memory。

**5.9 Cross-Domain Intelligence** — Mechanism/Method/Failure/Experiment/Mathematical
Structure Atlas + Scientific Analogy Graph，主动找相同数学结构/机制模式/优化问题/
失败模式/可迁移方法，产出人类单领域搜索难获得的 non-obvious connections。

**5.10 Meta-Science / Portfolio** — 长期 Research Program：哪条路线值得继续、
哪项实验 expected information gain 最大、哪些项目共享数据、token/GPU/时间/实验
预算投在哪。科研资源调度本身成为 intelligence。

**5.11 Controlled Recursive Self-Improvement** — FAR-Lab 也是 FAR-Lab 的研究对象：
FAILURE → ROOT CAUSE → EXTERNAL RESEARCH → BETTER SYSTEM → PROTOTYPE →
BENCHMARK → INTEGRATE → REGRESSION → REPLACE → MEASURE AGAIN。
能力缺陷的第一反应不是改 prompt，而是调查新算法/表示/搜索策略/工具/OSS/论文/
reasoning architecture。只有真实 benchmark 提升才算能力升级。受控、可审计、可回滚。

**5.12 Open-World Tool / Model Intelligence + Multimodal** — 遇新问题 → 判断需要
什么能力 → 搜索工具/模型/API/CLI/MCP/package → 验可信性 → 学接口 → 接入 → 调用 →
验证；不维护永远过时的静态工具清单。科学对象不压平成 Markdown：papers、equations、
tables、figures、datasets、code、logs、molecules、sequences、graphs、traces 各归其型。

---

# PART 6 — WAVES & GATES（系统波推进，不是微补丁）

**Wave 0 — Reality Map + Baseline Freeze + Benchmark Harness 骨架**
**Wave A — Cognitive Core Rebase**
**Wave B — Evidence / Knowledge / Retrieval Rebase**
**Wave C — Discovery / Hypothesis / Causal Intelligence**
**Wave D — Experiment / Compute / Tool Runtime**
**Wave E — Memory / Agent Society / Self-Improvement**
**Wave F — Performance Architecture**
**Wave G — Research Experience（科研人员认知工作流重塑全产品面）**
**Wave H — Benchmark / Red Team / Product Hardening**

实际 Wave 划分允许按代码现实调整，但每个 Wave 必须产生
**明显可体验、可测量、系统级的能力跃迁**。

每 Wave 出口门禁（全部满足才算结束）：
1. real subsystem + integration path + full user workflow 真实跑通（非 mock/fixture）；
2. 对比有可复现数字：CURRENT vs REBUILT vs NAKED FOUNDATION MODEL（关键维度）；
3. 被替换的弱旧实现已删除，或已有明确删除 ticket（含 owner 与触发条件）；
4. 一次全量门禁绿（build/typecheck/lint/test/E2E/benchmark —— 按批处理协议）；
5. ≤50 行 Wave 摘要写入 `.control/OMEGA-MISSION-STATE.md`。

---

# PART 7 — PERFORMANCE CONTRACT

性能差 = 核心失败，不是体验小问题。系统性根因分析（不限于）：sequential model
calls、redundant prompts、context inflation、duplicate retrieval、repeated parsing、
DB bottleneck、index 策略、serialization、graph recomputation、tool startup、
cold start、network latency、frontend rendering、memory footprint、excessive
persistence、缺 batching/concurrency/caching/streaming、bad model routing、
cancellation failure。优先采用成熟工业实现。目标：相同或更高科研质量下，
wall-clock latency、token、API calls、GPU、内存、人工等待**显著下降**。
是重新设计执行方式，不是抠毫秒。

---

# PART 8 — TRUTH ARCHITECTURE

永久禁止：fake DOI/citation/dataset/experiment/result/metric/realtime、
synthetic→real 冒充、replay→live 冒充、hidden fallback、unsupported claim、
LLM score→measurement 冒充、incomplete workflow→complete 冒充、README claim >
实际能力。

证据分级：`FACT / SOURCE / OBSERVATION / MEASUREMENT / COMPUTATION /
MODEL OUTPUT / INFERENCE / HYPOTHESIS / SIMULATION / SYNTHETIC / UNKNOWN`。
**UNKNOWN 是合法输出**——科研系统不知道答案时必须敢于说不知道。
负面、冲突、未知证据不得为 presentation 而抹除。

---

# PART 9 — BENCHMARK CONTRACT

Wave 0 即冻结当前 FAR-Lab 为 baseline。建立真实科研 benchmark corpus，覆盖：
known-answer / open-ended / conflicting literature / scarce evidence / false premise /
causal inference / mathematical reasoning / hypothesis novelty / falsification /
experiment design / dataset analysis / code execution / replication / cross-domain
transfer / negative results / scientific traps / tool failures / long-horizon。

至少三方对比：**CURRENT FAR-LAB vs REBUILT FAR-LAB vs NAKED FOUNDATION MODEL**
（有条件加入最强可运行外部系统，如上表科学评测项）。
评价维度：scientific correctness、evidence precision、source validity、causal
reasoning、novelty、falsifiability、experimental usefulness、executability、
information gain、reproducibility、robustness、latency、cost、final scientific
usefulness。**没有真实效果提升，就不能称为升级。**

---

# PART 10 — RED TEAM CONTRACT

持续假设明天有真正科研人员故意攻击：极冷门问题、错误 premise、已撤稿论文、
冲突证据、缺失数据、统计陷阱、不可能实验、因果混杂、数据污染、prompt
injection、malformed files、tool timeout、provider failure、模型幻觉。
系统必须 **fail visibly、fail safely、fail scientifically**。

---

# PART 11 — AUTONOMY & MISSION STATE

**自主权**：可逆 / 本地 / 明显提质 / 不涉凭据 / 不涉外部破坏性操作的决策，
自行判断并执行，不请示（包括"要不要重构/要不要搜开源/先做哪个"）。只有不可逆
外部操作、用户凭据、重大安全风险、无法判断的业务硬约束才请求用户。

**运行时机制（Claude Code）**：
- Todo 持续跟踪 Wave 与当前步骤；
- 独立工作全部 fan-out 给并行 subagent（搜索/克隆/评测/审查/原型），
  分区 ownership、禁止重叠写，主 Agent 统一融合与最终裁决；
- 长安装/构建用后台任务；读代码先 Glob/Grep 再精读；
- Git：分支遵循仓库既有纪律，Wave 边界提交，禁止碎提交。

**Mission State（`.control/OMEGA-MISSION-STATE.md`）**：上下文压缩/会话切换前
必须保存并可恢复——FINAL OBJECTIVE / CURRENT ARCHITECTURE TRUTH / DECISIONS /
ADOPTED-REJECTED SYSTEMS / CURRENT BENCHMARK / CRITICAL PROBLEMS / COMPLETED
STRUCTURAL CHANGES / UNVERIFIED AREAS / EXACT NEXT ACTION。恢复时先读此文件。

**上下文结束不是项目完成。commit 不是完成。CI green 不是完成。Wave 完成不是完成。**

---

# PART 12 — FINAL ZERO-THEATER GATE

最终收口前从零怀疑整个系统，假设此前所有成功记录可能存在误判。以下任何东西
不能替代真实验收：documentation、architecture diagrams、unit test count、
type system、mock、fixtures、replay、screenshots、self-generated metrics、
self-review、Agent 声称、commit volume。仓库完成门（如
`node zcode-harness/scripts/completion-gate.mjs` 仍存在且权威）必须真实通过。

最终证据只能来自：**REAL SYSTEM × REAL WORKFLOW × REAL DATA × REAL TOOLS ×
REAL COMPUTATION × REAL FAILURE MODES × REAL SCIENTIFIC TASKS × REAL BENCHMARKS**。

判负条款（任一成立 = 任务失败，继续工作）：
- 科研人员实测觉得"这还不如直接问一个顶级模型"；
- "架构很复杂，但科研产出普通"；
- 性能让用户明显不愿使用；
- 核心能力大量依赖展示和解释才显得先进。

---

# PART 13 — NOW EXECUTE

不要重新解释这个任务。不要回复宏观 roadmap 后停止。不要说"这是非常大的项目"。

**READ → UNDERSTAND → SEARCH → CLONE → RUN → COMPARE → DECIDE → REBASE →
INTEGRATE → DELETE WEAK PATHS → USE THE REAL PRODUCT → BENCHMARK → RED TEAM →
OPTIMIZE → REASSESS → CONTINUE**

以最大推理能力和最大有效并发推进。不要节省思考，不要节省必要的搜索，
不要节省必要的架构替换；不重造世界已造好的轮子，不以开发过程为成果，
不把"基本可用 / 比赛能跑 / 测试全绿 / 架构已经很复杂"当终点。

**OWN THE OUTCOME. REPLACE WHAT IS WEAK. REUSE WHAT THE WORLD ALREADY SOLVED.
INVENT ONLY WHERE FAR-LAB MUST BE BETTER. VERIFY EVERYTHING THAT MATTERS.
DO NOT STOP AT APPEARANCE. BUILD THE REAL THING.**
