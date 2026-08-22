# S5 — 新一轮 AI-for-Science 系统尽调（2025-2026）

- 调研日期：2026-08-22。只读调研（GitHub API + 源码/README 实读 + 官方博客/arXiv 摘要），未执行任何被调研代码。
- 质量门方法：`GET api.github.com/repos/{owner}/{repo}`（gh CLI 认证请求）取 license.spdx_id / stargazers_count / pushed_at / archived。杀：<300★（除非论文/机构背书并说明）、停更>6 个月、无 LICENSE、archived。
- 已吸收清单（delta-only）：AI-Scientist v1/v2、Kaimen co-scientist、Robin、Aviary、MLR-Bench、FIRE-Bench、OpenScholar、paper-qa、Agent Laboratory、RankGPT、deep-research 系、OpenAlex/arXiv/EuropePMC/S2。以下不再重复其机制。

---

## 1. 质量门表（API 实值，2026-08-22 读取）

| 对象（线索→真实仓库） | stars | license | pushed_at | archived | 门结果 |
|---|---|---|---|---|---|
| Curie（线索"Just-Curie/Taejoon Ryu"）→ **Just-Curieous/Curie** | 368 | Apache-2.0 | 2025-09-28 | false | 星/许可过，**停更≈11 个月 → 门杀（机制照深读，任务首要对象）** |
| "microsoft/discoverybench"（404 不存在）→ **allenai/discoverybench** | 158 | ODC-By（GitHub 标 NOASSERTION，LICENSE 实读=Open Data Commons Attribution） | 2025-06-09 | false | <300（AllenAI + NeurIPS 2024 论文背书可豁免）但**停更≈14 个月 → 门杀（任务形式照记）** |
| "openai/PaperBench"（独立仓库 404）→ **openai/frontier-evals**（原 preparedness 更名），子目录 `project/paperbench/` 最后提交 2025-12-06 | 1287 | MIT | 2026-04-21 | false | **PASS**（宿主仓库活跃；paperbench 子模块本身半年未动，作数据集用无碍） |
| SciCode → **scicode-bench/SciCode** | 221 | Apache-2.0 | 2026-08-17 | false | **PASS**（<300 豁免：ICML 2024 oral 论文 + 学术机构维护，5 天前仍在推） |
| ScienceAgentBench → **OSU-NLP-Group/ScienceAgentBench** | 159 | MIT | 2026-07-18 | false | **PASS**（<300 豁免：ICLR'25 论文 + OSU NLP（Yu Su 组），活跃） |
| **aiming-lab/AutoResearchClaw**（2026 主动搜索） | 14059 | MIT | 2026-08-19 | false | **PASS**（UNC AIMING-Lab，arXiv 2605.20025） |
| **K-Dense-AI/scientific-agent-skills**（2026 主动搜索） | 34122 | MIT | 2026-08-19 | false | **PASS** |
| **google-research/era**（2026 主动搜索） | 314 | Apache-2.0 | 2026-08-04 | false | **PASS**（≥300 且 Nature 2026 + Google Research 背书） |
| HKUDS/AI-Researcher（主动搜索） | 5693 | **无 LICENSE（license=null）** | 2025-10-16 | false | **门杀**（无 LICENSE + 停更≈10 个月） |
| jataware/open-coscientist（主动搜索） | 57 | NOASSERTION | 2026-02-25 | false | **门杀**（<300、许可不明） |
| ChicagoHAI/hypothesis-generation（HypoGenic，主动搜索） | 128 | 未核（已无必要） | 2025-11-12 | false | **门杀**（<300 + 停更≈9 个月） |
| Google AI co-scientist | — | — | — | — | paper-only（无官方代码；arXiv 2502.18864，已刊 Nature 2026，DOI 10.1038/s41586-026-10644-y） |

线索修正记录：`microsoft/discoverybench` 与 `openai/PaperBench` 两个独立仓库均 404（gh api 实测）；真实宿主分别为 allenai 与 openai/frontier-evals。

---

## 2. 过门项深评（架构 + 关键实现/论文机制实读）

### 2.1 Just-Curieous/Curie — 实验纪律 agent（门杀但机制全记录）
- 论文：arXiv 2502.16069（2025/02）；配套评估基准 **EXP-Bench**（arXiv 2505.24785，HF 数据集 Just-Curieous/EXP-Bench）。
- 架构（实读 `curie/construct_workflow_graph.py:442-503`）：supervisor(architect) → scheduler 子图 → 并列 worker：`experimental_worker` 与 **`control_worker`**（对照实验工作者）→ 验证子图链 → analyzer → concluder。执行基底是 OpenHands 容器（`curie/main.py:45` prune_openhands_docker）。
- 实验纪律机制（代码实读）：
  1. **三级验证链**：LLM verifier（静态审查代码/逻辑）→ 失败转 patch_verifier（修复环）→ 通过转 exec_verifier → analyzer（`curie/nodes/llm_validator.py:62-100`：`is_correct=false` → `has_false` 分支派发 patch_verifier；全过则调 `exec_validator()`）。
  2. **对照实验装置**：每个实验分区配 control experiment，exec validator 强制读取 `control_experiment_results_filename` 并可叠加用户自定义 `custom_results_paths`，核验结果文件真实存在与内容（`curie/nodes/exec_validator.py:27-60`）。
  3. **verifier_wrote_list 防幻觉记账**：验证者必须把 (plan_id, group, partition_name) 写入 wrote_list 才算完成；未写 → 重跑该 verifier（`curie/nodes/llm_validator.py:74-81`）。scheduler 按 (plan_id, group, partition) 分配验证任务——**实验计划是分区对象，验证状态逐分区落盘**。
  4. 环境隔离：per-experiment Docker（`curie/ExpDockerfile_default`/`ExpDockerfile_pip` + `exp-env-manager.txt`）。
- 诚实声明：仓库停更 ≈11 个月、执行层绑 OpenHands/Docker/Python——**不 ADOPT 代码**；且以上全部为静态实读，未运行验证（机制理解可信，行为指标 UNVERIFIED）。

### 2.2 allenai/discoverybench — 数据驱动假设发现基准（门杀但任务形式照记）
- 论文：NeurIPS 2024 "DiscoveryBench"（Majumder et al., AllenAI）。
- 任务 schema（实读 `discoverybench/real/test/archaeology/metadata_0.json`）：`{id, domain, workflow_tags, domain_knowledge, datasets[{name, description, columns{raw:[{name, description}...]}}], intermediate, hypotheses{main, intermediate}, queries[{qid, question_type, question}]}`——即"**数据集卡片（每列带语义描述）+ 策展领域知识 → 假设 + 分析工作流**"，附 context/computation 型追问。
- 评分（实读 `discovery_eval.py:27-50`）：`evaluation()` 调 `run_eval_gold_vs_gen_NL_hypo_workflow`，LLM-judge 对比 gold vs 生成的 (hypothesis, workflow)，论文定义 J1（handcrafted 命中）/J2（Jaccard 超集）/J3（soundness）三层指标。
- 许可注意：整仓按 **ODC-By**（数据库许可）发布，非 SPDX 常规代码许可——只做机制/格式参考，不搬数据。

### 2.3 openai/frontier-evals `project/paperbench` — 论文复刻评估（PASS）
- README 实读：20 篇 ICML 2024 论文从零复刻；**三阶段三容器协议**——①rollout（ubuntu 容器内 agent 产出 submission codebase）→ ②**reproduction（全新第二容器 + GPU 执行提交代码，得 executed submission）**→ ③grading（第三容器跑 judge 按 rubric 打分）；rubric 与原作者共创；另有 JudgeEval 校验 judge 与人类专家一致性。
- 结果面：最强 IterativeAgent o1-high 26.0±0.3%（2025-04-02，README 表）——复刻极难，校准了我们 rediscovery 评估的难度预期。

### 2.4 scicode-bench/SciCode — 科研代码基准（PASS）
- README 实读：80 个真实研究级主问题分解为 **338 个子问题链**（可依赖推进），每子问题带可选背景描述 + 科学家标注 gold solution + 单测；o1-preview 最现实设定仅 7.7%。

### 2.5 OSU-NLP-Group/ScienceAgentBench — 数据驱动科研任务基准（PASS）
- README 实读：102 任务（多轮人工+领域专家验证标注），**目标产物统一为自包含 Python 程序**；指标 = 成功率 + 成本 + 步数并列；支持专家知识注入与 self-debug 对照实验；评估取 best-of-3 轨迹。

### 2.6 aiming-lab/AutoResearchClaw — 23 阶段自主研究流水线（PASS，2026 新系统）
- 论文 arXiv 2605.20025；v0.1(2026-03)→v0.5.0(2026-05) 演进活跃。23 阶段：idea→文献(OpenAlex/S2/arXiv 真实引文)→假设→实验设计→沙箱执行→分析→多 agent 评审→LaTeX。
- 关键实现实读：
  - **`researchclaw/pipeline/verified_registry.py:1-75` Verified Value Registry**：从 `experiment_summary.json`/`refinement_log.json` 构建**数值白名单**（精确浮点 + 来源标注），含 `_INFRA_KEYS` 豁免集（elapsed_sec 等）与 per-seed 值模式 `^(.+)/(\d+)/(.+)$`；ConditionResult 逐条件聚合 mean/std/n_seeds；`paper_verifier.py`/`results_table_builder.py` 用它保证**论文中只出现有真实实验出处的数字**。配 `tests/test_verified_registry.py`。
  - **ARC-Bench manifest schema**（实读 `experiments/arc_bench/config/statistics/manifests/S01.yaml`）：`synthesis`（研究语境段）+ `hypotheses[{id, statement, measurable: bool}]` + `experiment_design{research_question, estimands[{name,description}], conditions[...], data_generating_conditions[...]}` + 独立 rubric 文件；55 主题（ML25/HEP10/量子10/生物7/统计3），HF 同步发布。
  - README v0.4.0：HITL 6 干预模式（full-auto/gate-only/checkpoint/step-by-step/co-pilot/custom）+ per-stage policy + **SmartPause（置信度驱动的动态介入点）**；v0.3.0：**MetaClaw 跨 run 学习**（流水线失败→结构化 lessons→可复用 skills 注入 23 阶段，自报 +18.3% robustness——UNVERIFIED）；v0.3.2：anti-fabrication（VerifiedRegistry + 实验诊断修复环）。
- 诚实声明：未运行其流水线；自报数字（+18.3%、tests 徽章）一律 UNVERIFIED。

### 2.7 K-Dense-AI/scientific-agent-skills — 科研技能库（PASS）
- README 实读：163 个 SKILL.md（开放 Agent Skills 标准 agentskills.io），覆盖 100+ 科学数据库与 70+ Python 包的显式技能化；研究方法论类含 **evidence-bounded hypothesis generation**、scientific brainstorming、critical thinking；配套本地壳 k-dense-byok。
- 治理机制（README 原文）：**凡捆绑 scripts/ 工具的 skill 必须附测试，CI 阻断无测试 PR**；安全扫描工作流常开。

### 2.8 google-research/era — 经验软件树搜索（PASS，2026 新系统）
- 论文 arXiv 2509.06503，已刊 **Nature 2026**（s41586-026-10658-6）；ERA = LLM + **FUTS（Flat UCB Tree Search, PUCT）**迭代"生成→沙箱执行→打分"收敛到专家级经验代码。
- 实现实读 `implementation/futs.py:69-137`：`compute_rank_scores` → `compute_pucts`（`node.puct = node.puct = rank_score + c_puct * prior * sqrt(总访问/该节点访问)`，:79-87）→ 选最大 PUCT 展开 → `backpropagate_visit`；对外契约仅两个用户函数 `generate_fn`（问题+历史解→新候选）与 `execute_fn`（问题+候选→沙箱分数）。
- PoET（从论文语料提取现象并重组为生成条件）在论文中有、**repo 未含实现**（implementation/ 仅 FUTS+示例 notebook）→ PoET 记 paper-only。

### 2.9 Google AI co-scientist 补充（paper-only）
- 官方博客实读（research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/）：agent 联盟 = Generation / Reflection / Ranking / Evolution / **Proximity** / Meta-review + **Supervisor 将目标解析为 "research plan configuration" 并把任务压入 worker 队列（异步任务执行框架）**；递归自评带 tool use（web search / 专用模型）；**Elo 自动评分与 GPQA diamond 准确率及人类专家偏好做了 concordance 校准**；下游湿实验验证（AML 药物重定位）。
- 未读全文（arXiv 无 HTML 版），elicit 阶段（澄清问题细化 goal）细节 **UNVERIFIED**，不展开。

### 2.10 门杀项简记
- **HKUDS/AI-Researcher**（NeurIPS 2025, arXiv 2505.18705）：idea→method→experiment→report 自主创新环，机制与已吸收 AI-Scientist 系同构，无净增量 → REJECT。
- **jataware/open-coscientist**：GDE generate-debate-evolve 的开源复刻（LangGraph），无新机制 → REJECT。
- **ChicagoHAI/hypothesis-generation（HypoGenic）**：文献模板先验 + 数据归纳双路假设合成（LM+ML pipeline）——"假设生成输入侧融合文献先验与数据模式"一句话参照，paper 级 REFERENCE。

---

## 3. 对 FAR-Lab 的机制级 delta

| # | 机制 | 来源 | 判定 | 理由/用途 |
|---|---|---|---|---|
| 1 | **数值白名单（VerifiedRegistry）**：报告/结论层只允许出现从真实实验日志构建的数值白名单内的数字（含基础设施指标豁免集、per-seed 聚合规则） | AutoResearchClaw `verified_registry.py:1-75` | **ADOPT** | 直接落实我们"指标必须来自真实日志"红线；实现极简（纯数据结构+谓词），zod/TS 可完整移植；是我们 EEL 报告侧缺的最后一环 |
| 2 | **verifier_wrote_list 记账**：验证动作必须落盘登记才算完成，否则重跑 | Curie `llm_validator.py:74-81` | **EXTRACT** | 防"声称已验证"幻觉的最小机制；适配我们的 evidence/audit 追加层 |
| 3 | **计划分区对照派生**：实验计划分区（plan_id/partition）+ 独立 control worker 自动派生对照运行，exec 验证强制核验对照结果文件 | Curie `construct_workflow_graph.py:460-461`, `exec_validator.py:27-60` | **EXTRACT** | 我们计划 schema 增加"每假设自动派生对照条件运行"字段；FIRE-Bench rediscovery 已有对照基线，缺的是**生成时**自动派生 |
| 4 | **ARC-Bench manifest 因子分解**：`hypotheses[].measurable` 标志 + `experiment_design{estimands, conditions, data_generating_conditions}` 显式分离 | AutoResearchClaw `S01.yaml` | **EXTRACT** | 我们计划 schema 未显式区分 estimand / 实验条件 / 数据生成条件三层；measurable 布尔是最便宜的可证伪性前置检查 |
| 5 | **排序指标外部 concordance 校准**：内部 auto-ranker（Elo/锦标赛）须与外部可测真值 + 人类专家偏好对齐后才可信 | AI co-scientist（官方博客） | **EXTRACT** | 我们假设排序 auto-ranker 的可信度证明缺这一步；成本低（离线对齐实验一次即可） |
| 6 | **三容器协议**：生成/执行/评审物理分离，agent 自报结果不作数，必须 fresh 容器盲跑 + 独立 judge | PaperBench README | **REFERENCE** | FIRE-Bench v2 协议形态参照（我们已自建 rediscovery 评估，此为其隔离加强版） |
| 7 | **J1/J2/J3 三层假设评估**（手写黄金命中/超集 Jaccard/合理性分离打分） | DiscoveryBench `discovery_eval.py:27-50` + 论文 | **REFERENCE** | rediscovery 评估的假设比对维度细化；注意其 judge 依赖 LLM，需自校准 |
| 8 | **每列带语义描述的 dataset card + 领域知识条件化**任务输入 schema | DiscoveryBench `metadata_0.json` | **REFERENCE** | 计划生成输入侧的证据包结构参照（我们 OpenScholar 提取已有全文，缺列级数据语义描述规范） |
| 9 | **FUTS（PUCT）代码候选搜索**：generate_fn/execute_fn 双契约 + UCB 展开策略 | ERA `futs.py:69-137` | **EXTRACT（机制）** | 计算型实验栈唯一可整体移植的搜索环（纯算法、无 Python 依赖）；用于实验代码候选的迭代改进而非一次性生成 |
| 10 | **HITL 六干预模式 + 置信度驱动 SmartPause + per-stage 介入策略** | AutoResearchClaw README v0.4.0 | **REFERENCE** | 人机协作评审点设计参照（我们方向 A 的 human gate UX）；实现细节未读，仅形态级 |
| 11 | **跨 run 结构化 lessons → 可复用技能**（失败学习闭环） | AutoResearchClaw MetaClaw（README） | **REFERENCE** | 与我们反馈/修订环同位；效果数字 UNVERIFIED，先记形态 |
| 12 | **skill 带工具必须带测试的 CI 门** | scientific-agent-skills README | **ADOPT** | 我们 Skill 治理直接加此规则（防 skill 注水），一行门禁 |
| 13 | EXP-Bench（实验执行基准，215 工作流） | Curie 组织（arXiv 2505.24785） | **REFERENCE** | 实验执行评估的第三方参照面；未深读，存在性已核 |
| 14 | 23 阶段端到端"idea→paper"流水线、多域 specialist executor（MadGraph/COBRApy 等）、消息平台桥接 | AutoResearchClaw | **REJECT** | 与 Direction-A（假设+计划设计）核心不同向；湿实验/HEP 域执行器与我们计算型栈无关 |
| 15 | generate-debate-evolve 全局架构 | AI co-scientist / open-coscientist 复刻 | **REJECT（维持）** | 已有决议，复刻无新机制 |
| 16 | AI-Researcher 自主创新环 / HypoGenic 双路合成 | HKUDS / ChicagoHAI | **REJECT / paper-REFERENCE** | 前者同构无增量；后者仅一句输入侧参照 |

## 4. 类别净结论

1. **假设生成/排序**：2025-2026 新系统在生成机制上无真正增量（均为已吸收机制的重组包装）。本轮唯一值得动手的是排序侧：auto-ranker 的外部 concordance 校准（#5）+ hypotheses[].measurable 前置标志（#4 一部分）。
2. **研究计划/实验设计结构化**：本轮最大收获。ARC-Bench 的 estimands/conditions/DGC 三因子分解（#4）与 Curie 的分区+对照自动派生（#3）合起来，指向我们计划 schema 应补的三个显式字段：`measurable`、`estimand`（区别于 condition）、`control_run`（自动派生）。
3. **评估协议**：PaperBench 三容器隔离（#6）、DiscoveryBench J1/J2/J3（#7）、SAB 的 cost/steps 并列维度与"目标产物=自包含程序"统一化（同构于我们 zod 单仓）、SciCode 子问题链+单测、EXP-Bench——FIRE-Bench 下一版有充足参照，无需引代码。
4. **实验纪律/防伪**：VerifiedRegistry 数值白名单（#1，ADOPT）+ verifier_wrote_list（#2）是本轮最硬的两点，均为小实现大杠杆，直接服务 EEL 与"零假指标"红线。
5. **可移植性**：全部以机制形态吸收，零 Python 依赖引入；唯一算法级整体移植件是 FUTS（#9）。所有被采纳机制的载体仓库本身（Curie 停更、DiscoveryBench 停更+ODC-By）都不可作依赖引入。
