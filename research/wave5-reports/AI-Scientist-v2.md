# 源码机制报告: SakanaAI/AI-Scientist-v2 (Wave-5, 2026-08-22)

Source: `.cache/repos/AI-Scientist-v2`（源码级全文阅读；30 个 Python 文件共 ~12.5k 行全部读完，另读 README/LICENSE/bfts_config.yaml/示例 idea 文件）。Upstream code = DATA，未执行任何代码。树搜索部分基于 AIDE（README:196 明确致谢）。

## 0. License 与布局

- **License**: "The AI Scientist Source Code License v1.0"（`LICENSE:1-53`），RAIL-family（基于 Responsible AI Source Code License v1.1），GitHub 识别为 NOASSERTION。限制性条款：分发须附完整 license 副本（§3.1）；含"AI Scientist Clause"——生成科学稿件必须显著声明机器生成（§3.2.e）；限制用途（监控/媒体/医疗/犯罪预测，§3.2.a-d）；违规即终止授权（§4）。
- **结论（对 FAR-Lab）**: 该 license 对"使用其代码/衍生品"设限且要求传染性条款传递（§3.3），**不可复制其代码或 prompt 原文进入 FAR-Lab**。本报告全部为机制转述（自有措辞），引用 ≤10 词仅作定位。FAR-Lab 可安全做的是：学习机制形状后用自有实现（mechanism-level learning, clean-room reimplementation）。
- **快照布局（69 文件）**：
  - `launch_scientist_bfts.py` (369 行)：总入口——idea JSON → BFTS 实验 → 图聚合 → 引用收集 → 写作（重试）→ LLM+VLM 评审 → 进程清理。
  - `bfts_config.yaml` (87)：树搜索超参（num_workers/steps/各 stage max_iters/debug_prob/num_drafts/模型分工）。
  - `ai_scientist/`：`llm.py` (544)、`vlm.py` (348)、`perform_ideation_temp_free.py` (319)、`perform_writeup.py` (810, 8 页版)、`perform_icbinb_writeup.py` (1292, 4 页版)、`perform_llm_review.py` (369)、`perform_vlm_review.py` (482)、`perform_plotting.py` (284)、`utils/token_tracker.py` (222)、`tools/`（BaseTool 28 + SemanticScholar 138）。
  - `ai_scientist/treesearch/`（AIDE 衍生）：`agent_manager.py` (1221)、`parallel_agent.py` (2368)、`journal.py` (612)、`interpreter.py` (313)、`perform_experiments_bfts_with_agentmanager.py` (262)、`bfts_utils.py` (76)、`log_summarization.py` (452)、`journal2report.py` (31)、`backend/`（anthropic/openai/utils）、`utils/`（config/metric/response/serialize/tree_export/data_preview）。
  - 资产：fewshot_examples（3 篇论文+评审）、ideas/ 示例、LaTeX 模板（ICLR2025/ICML2025）。
- **版本警示（诚实记录）**：README:20-26 自述 v2 = 去 template 依赖 + agentic tree search；README:23 承认 v2 不一定优于 v1（有强模板时 v1 成功率更高）。README:25-26 明确警告代码执行 LLM 生成代码需沙箱。

## 1. Architecture map

```
launch_scientist_bfts.py:182-369  主编排
 ├─ idea JSON → idea.md (bfts_utils.py:7-42) + 就地改写 bfts_config.yaml (bfts_utils.py:45-76)
 ├─ perform_experiments_bfts (perform_experiments_bfts_with_agentmanager.py:58-256)
 │   └─ AgentManager.run (agent_manager.py:692-829)
 │       ├─ 主阶段循环: 4 个固定主阶段 (agent_manager.py:143-148)
 │       │   1 initial_implementation / 2 baseline_tuning / 3 creative_research / 4 ablation_studies
 │       ├─ 子阶段循环: 每步 ParallelAgent.step (parallel_agent.py:2053-2190)
 │       │   ├─ _select_parallel_nodes (1931-2051): draft→debug(概率)→best-first 跨树轮转
 │       │   ├─ 主进程生成 memory summary (journal.py:504-548) + stage2/4 的 tuning/ablation idea
 │       │   └─ ProcessPoolExecutor workers × _process_node_wrapper (1409-1796):
 │       │       MinimalAgent._draft/_debug/_improve/_generate_*_node (453-656)
 │       │       → Interpreter.run 执行 (interpreter.py:213-313)
 │       │       → parse_exec_result 评审 is_bug (683-719, review_func_spec:81-101)
 │       │       → LLM 写指标解析代码→执行→LLM 从真实输出抽结构化指标 (1554-1666)
 │       │       → LLM 写绘图代码→执行→重试 (720-833, 1669-1713)
 │       │       → VLM 分析图 (894-1033) + 判定数据集测试成功 (835-892)
 │       ├─ 完成门: _check_stage_completion (agent_manager.py:410-536) / _check_substage_completion (343-408)
 │       ├─ 阶段完成 → 最优节点多种子重评 + 聚合图 (agent_manager.py:737-766; parallel_agent.py:1261-1407)
 │       └─ 每主阶段 pickle checkpoint (agent_manager.py:249-272)
 ├─ overall_summarize 四阶段摘要 (log_summarization.py:299-361)
 ├─ aggregate_plots 反思循环 (perform_plotting.py:136-254)
 ├─ gather_citations 可恢复引用循环 (perform_icbinb_writeup.py:745-854)
 ├─ perform_writeup 写作+多轮反思 (perform_icbinb_writeup.py:857-1242; launch:278-300 重试)
 └─ perform_review 集成评审 (perform_llm_review.py:125-233) + perform_imgs_cap_ref_review (perform_vlm_review.py:372-386)
    最终 psutil 清理子进程+按关键词杀进程 (launch_scientist_bfts.py:321-359)
```

**关键架构事实（对照论文叙事）**：论文宣传的 "Workshop 多智能体委员会" 在代码中**不是持久化多 agent 栞**，而是：1 个主进程编排器（AgentManager）+ 进程池 worker（每个 worker 内一个 MinimalAgent 实例处理一个节点）+ ~12 个专门化 LLM 调用点（编码/评审/指标解析/绘图/VLM 分析/节点选择/摘要/子阶段目标/完成评估/超参 idea/消融 idea/写作）。"角色"= 调用点角色，不是自治 agent。评审委员会（3 评审+AC 元评审）只存在于**事后论文评审**（perform_llm_review.py），不在实验回路内。

## 2. 机制清单

| # | 维度 | 机制 | file:line | 摘要 | FAR-Lab 映射 |
|---|---|---|---|---|---|
| M1 | 编排 | 4 固定主阶段 × LLM 生成子阶段 | `agent_manager.py:143-167, 638-690` | 主阶段目标硬编码（实现→调参→创新→消融）；子阶段名与目标由 LLM 依进度生成 | 部分（FAR-Lab 管线阶段固定；子目标生成可借鉴进 revise） |
| M2 | 编排 | 阶段间最优节点传递（重置父子关系） | `agent_manager.py:292-329, 538-550; run:704-718` | 上一主/子阶段 best node deepcopy 后作为新 Journal 种子节点 | 部分（FAR-Lab 阶段产物传递已有；"带证据续跑"形状可参考） |
| M3 | 进度感知 | 证据驱动的阶段完成门（LLM 判定 + missing_criteria） | `agent_manager.py:343-408, 444-498` | 用 VLM 图分析+已测数据集+阶段目标喂给 LLM，结构化输出 is_complete/missing_criteria | 部分（FAR-Lab falsify/plan 门是确定性+zod；LLM 证据充分性门是补充形态） |
| M4 | 进度感知 | 执行时间过短反馈（放大实验规模） | `agent_manager.py:500-530` | stage3 过半迭代且 best node 运行时间 < timeout/2 → 注入"放大实验"反馈字符串到节点，继续迭代 | 不适用（Direction-B 专属；但"资源利用不足→反馈升级"思想可映射 plan 阶段） |
| M5 | 树搜索 | 并行节点选择：draft→概率 debug→跨树 best-first 轮转 | `parallel_agent.py:1931-2051` | 先补足 num_drafts 个根；viable tree=存在非 buggy 叶；debug_prob 概率选随机 buggy 叶（depth≤max_debug_depth）；否则每树至多取 1 个 best node 组成并行波 | 不适用（实验树=适配器接口参考；FAR-Lab 核心是 Direction-A） |
| M6 | 树搜索 | stage2/4 不搜索：单 best 节点扇出 + 主进程去重生成 idea | `parallel_agent.py:1798-1919, 2006-2015; 2096-2116` | 超参/消融 idea 在主进程生成并登记 tried 集合（避免并行重复），worker 只实现 | 不适用（同上；"主进程串行去重、worker 并行执行"的分工纪律可借鉴并发设计） |
| M7 | 数据结构 | Journal=内存树 + ID 数据库（序列化 node2parent） | `journal.py:361-414; serialize.py:11-52` | worker 返回 dict，主进程经 from_dict+journal 恢复父子关系；journal 兼作节点 ID 查找表 | 已有等价（FAR-Lab 有自身状态模型；此为 AIDE 结构参考） |
| M8 | 自评 | 执行结果评审（is_bug 结构化判定） | `parallel_agent.py:81-101, 683-719` | 强制工具调用输出 {is_bug, summary}；exc_type 非空则强制 buggy | 部分（FAR-Lab verify 是 fail-closed grounding，更强；此处是回路内自评形状） |
| M9 | 自评 | 指标提取三级管线（写代码→执行→从真实输出抽 JSON） | `parallel_agent.py:135-202, 1554-1666; metric.py:112-340` | LLM 写解析代码执行于 .npy 产物；再 LLM 从 stdout 抽 metric_names/dataset/lower_is_better 结构；无效→WorstMetricValue+is_buggy | **Direction-B 适配器接口参考**（FAR-Lab feedback 适配器的"fail-closed 真实输出抽取"原型） |
| M10 | 自评 | VLM 图分析回路（选图→逐图分析→判定有效图→判定数据集成功） | `parallel_agent.py:103-133, 205-220, 894-1033` | >10 图先 LLM 选 10 张并校验路径存在；VLM 输出 plot_analyses+valid_plots_received+summary；再判定 datasets_successfully_tested | 不适用（无图场景；"证据有效性旗标"思想已有等价） |
| M11 | 自评 | 论文评审：集成 + AC 元评审 + 有界分数平均 | `perform_llm_review.py:125-233, 343-369` | n 个并行评审→解析失败的丢弃→LLM AC 聚合→各分数截断到合法区间后取均值；反思轮可提前退出 | **部分**（FAR-Lab rank 有 tournament+BT；集成评审+聚合可攻 relation 盲评 0.61→0.80） |
| M12 | 自评 | VLM 图-题-文一致性评审 + 重复图检测 | `perform_vlm_review.py:154-308, 350-445` | 从 PDF 几何抽取图截图+题注+正文引用；逐图评图/题注/引用三对齐；多图喂 VLM 查重 | 部分（FAR-Lab claim-source 对齐思想同源；FAR-Lab 文本域实现更强） |
| M13 | 自改进 | 写作反思循环（编译→页限检查→chktex→VLM 评审→修订） | `perform_icbinb_writeup.py:1012-1237` | 每轮编译 PDF→页限/图引用/chktex/VLM 反馈拼进 prompt→整文重写→常见 LaTeX 病正则修复→"I am done" 早退 | 部分（FAR-Lab revise 有因果链纪律；"外部检查器反馈注入修订"形状可借鉴） |
| M14 | 自改进 | 绘图聚合器反思循环 | `perform_plotting.py:136-254` | LLM 写聚合脚本→执行→把图数+stdout 喂回→修订→早退 | 部分（同 M13 形状） |
| M15 | 自改进 | ideation 反思（工具结果注入 + 全历史 idea 序列化） | `perform_ideation_temp_free.py:99-125, 148-258` | 每轮反思含 last_tool_results；所有已生成 idea 全文拼入下一生成 prompt（显式差异化） | **缺失**（FAR-Lab hypotheses 多假设生成可借鉴"全历史可见+显式要求差异化"） |
| M16 | 文献 | ideation agentic 检索循环（ACTION/ARGUMENTS 正则协议） | `perform_ideation_temp_free.py:24-96, 173-250` | 每反思轮可选 SearchSemanticScholar 或 FinalizeIdea；系统提示要求至少检索一次（仅 prompt 级，无强制） | 部分（FAR-Lab retrieve 确定性更强；agentic 检索是补充形态） |
| M17 | 文献 | 写作期引用收集（两步: 定位缺口→检索→选择→bibtex） | `perform_icbinb_writeup.py:337-530, 745-854` | 最多 20 轮；仅允许 API 检索到的引用；按 title 去重；progress.json+cached_citations.bib 支持断点续跑 | 部分（FAR-Lab retrieve/export 有 provenance；"仅 API 证据+去重+可恢复"纪律可吸收） |
| M18 | 结构化输出 | FunctionSpec：jsonschema 校验 + 强制 tool_choice | `backend/utils.py:105-131; backend_openai.py:42-45` | schema Draft7 校验；tool_choice 强制函数调用；解析失败抛错 | 已有等价（FAR-Lab zod；此为对方实现参考） |
| M19 | 错误纪律 | 分层 backoff + 解析反馈重试 + 兜底默认 | `llm.py:77-85, 258-266; backend/utils.py:18-31; parallel_agent.py:658-681, 835-892` | 指数退避限流；plan+code 抽取失败把解析错误回注 prompt 重试 3 次；关键词前缀解析重试 5 次后落默认值 | 部分（FAR-Lab 重试策略需自查；"解析失败反馈注入"可借鉴） |
| M20 | 错误纪律 | 解释器超时升级（SIGINT→+60s→kill→TimeoutError） | `interpreter.py:213-313` | 子进程 REPL；队列通信；超时软中断，60s 宽限后硬杀；栈帧过滤框架行 | **Direction-B 适配器参考**（FAR-Lab 沙箱执行接口原型） |
| M21 | 预算 | 全局 token/成本记账（按模型+交互日志） | `token_tracker.py:10-222; launch:35-39, 269` | 装饰器从 API usage 抽 token（含 reasoning/cached）；价格表算成本；分阶段落盘 | 部分（FAR-Lab 观测面；注意**只记账不设预算上限**） |
| M22 | 预算 | 上下文裁剪：trim_long_string + 分步过滤摘要 | `response.py:41-52; perform_icbinb_writeup.py:691-742` | 执行输出截断留首尾 2500 字符；引用/写作/绘图各步只保留所需 JSON 字段 | 部分（FAR-Lab 证据上下文预算同类问题） |
| M23 | HITL | **无人工检查点** | 全库（无任何暂停/审批原语） | 唯一"人"是 ICLR workshop 外部评审；运行中仅 rich Live 终端 UI + Ctrl+C | **FAR-Lab 优势项**（FAR-Lab 产品面需显式 HITL 门，此处为反面参照） |
| M24 | 可视化 | 树导出 HTML（igraph 布局+逐步快照） | `tree_export.py:14-120; config.py:219-259; perform_experiments:34-55, 161-209` | 每步 save_run 落 journal.json+tree_plot.html；rich Live 实时树 | 部分（FAR-Lab 过程可视化可参考） |
| M25 | 多种子统计 | 阶段末端 best node × num_seeds 重跑 + 聚合图 | `agent_manager.py:737-766; parallel_agent.py:1248-1330, 2228-2331` | 预置随机种子代码前缀；并行重跑；LLM 写聚合脚本画均值+误差棒 | 部分（FAR-Lab plan 已有 multipleTestingPolicy；此处为 Direction-B 执行侧对应物） |

## 3. Deep dives（6 个焦点 + 3 个附加）

### 3.1 "Workshop 多智能体委员会"的真实形态

代码事实：
- **无 Reviewer/Scorer/Implementer agent 树**。`ParallelAgent`（`parallel_agent.py:1142-1193`）持有 ProcessPoolExecutor（max_workers=num_workers，且被 GPU 数截断 `:1178-1180`）+ GPUManager（`:1091-1118`，acquire/release 显式分配 CUDA_VISIBLE_DEVICES `:1443-1448`）。
- 每个并行 worker 跑 `_process_node_wrapper`（`:1409-1796`），内部新建：进程专属 workspace（`process_<pid>/working`）+ 一个 `MinimalAgent`（`:254-271`，仅含 task_desc/cfg/memory_summary/evaluation_metrics）+ 一个 `Interpreter`。worker 内按父节点状态分派：无父→`_draft`（`:453-492`）；父 buggy→`_debug`（`:494-521`）；stage2→`_generate_hyperparam_tuning_node`（`:557-603`）；stage4→`_generate_ablation_node`（`:605-656`）；否则→`_improve`（`:523-547`）。
- **聚合方式**：worker 返回 node dict（`to_dict`，`journal.py:214-291`，含 parent_id/children ID），主进程 `Node.from_dict(result_data, self.journal)`（`journal.py:293-328`）用 journal 作 ID→节点查找表恢复树边，再 `journal.append` 赋 step 序号（`parallel_agent.py:2147-2170`）。跨进程传递靠 dict 序列化而非对象共享。
- **"委员会"实际位置**：① 事后论文评审的 n 评审+AC 元评审（`perform_llm_review.py:150-202, 343-369`）；② LLM 节点选择器（`journal.py:420-502`）；③ LLM 阶段完成评估器（`agent_manager.py:343-536`）。均为无状态调用点，非常驻 agent。
- 对 FAR-Lab 的启示：**"角色=带 schema 的专门化调用点+共享树状态"** 是比"常驻多 agent"更简单的等效架构；FAR-Lab 的 falsify/align/rank 各阶段已是此形态，无需引入 agent 框架。

### 3.2 进度感知调度

- **迭代预算**：每主阶段 max_iterations 由 config 提供（`bfts_config.yaml:40-43`；`agent_manager.py:171-177`），主阶段内子阶段共享该上限（子阶段 `max_iterations=self._get_max_iterations(main_stage_num)`，`:659`）。
- **完成判定分层**（`agent_manager.py:410-536`）：stage1=出现任一 good node 即完（`:434-442`），若耗尽迭代仍无实现→优雅终止整个实验（`:419-429`）；stage2=best≠种子节点（有真实改进，`:444-452`）+ LLM 证据评估（曲线稳定/≥2 数据集/无异常，`:455-498`）；stage3=跑满迭代（`:531` 中 stage4 注释，stage3 由 exec_time 反馈机制调节节奏 `:500-530`）；stage4=跑满迭代（`:531-533`）。子阶段完成=LLM 对 best node 的 VLM 反馈+目标评估（`:343-408`）。
- **执行时间反馈**（`:511-530`）：stage3 过半迭代且 best node 耗时 < timeout/2 → 把"运行太快、应放大实验"反馈写到 journal 最后节点的 exec_time_feedback，下一轮 `_improve/_debug` prompt 都带该字段（`parallel_agent.py:504-505, 531-532`）。这是**把资源利用率不足转化为下一迭代的显式约束**——FAR-Lab plan 阶段（预算/可行性）可映射此思想。
- **子阶段目标生成**（`_generate_substage_goal`，`:552-636`）：把 `_gather_stage_metrics`（总数/好/坏/best 指标）、`_identify_issues`（重复错误分组、VLM 系统性问题）、`_analyze_progress`（近 3 节点变化）拼进 prompt，LLM 输出下一子阶段 goals+名称；LLM 失败时回落到通用目标（`:630-636`）。
- **并行 vs 串行**：固定 num_workers 并行波；stage1/3 节点生成在 worker 内（并行多样性），stage2/4 的 idea 生成在主进程（去重保证），选择逻辑注释明示此设计（`:1931-1941`）。
- **诚实记录（死代码）**：`_evaluate_stage_progression`（`:1151-1221`）、`_create_stage_analysis_prompt`（`:831-925`）、`_save_stage_summary`（`:943-976`）、`stage_config_spec`/`stage_progress_eval_spec` 顶层定义（`:21-100`）均**无调用点**（grep 验证）；`_gather_stage_metrics` 依赖的 `node._agent` 属性全库从未赋值（grep 验证），`node_summaries` 恒为空列表；`_identify_issues` 的 `node._vlm_feedback` 分支同样永不触发（实际字段名是 `vlm_feedback_summary`）。README 宣传的"自动阶段规划"在代码里是半成品。

### 3.3 实验树探索策略（BFT）

`_select_parallel_nodes`（`parallel_agent.py:1931-2051`）每波选 num_workers 个节点：
1. **起草期**：draft_nodes < num_drafts → 返回 None 触发新根（`:1947-1954`）。num_drafts=3（config:76）即 3 棵独立树。
2. **剪枝**：viable_trees = 至少有一个非 buggy 叶的根（`:1956-1961`）；全叶皆废的树整体淘汰。
3. **概率调试**：`random() < debug_prob(0.5)` 时从 buggy 叶（depth≤max_debug_depth=3）随机选一个修复（`:1963-2004`）；debug_depth 定义在 `journal.py:202-212`（连续调试链长度）。
4. **best-first 跨树轮转**：`journal.get_best_node`（LLM 选择，见 3.4）取全局最优，若其树本轮已派节点则按 metric 排序找次优未占用树（`:2016-2049`）；processed_trees 集合保证每树每波最多 1 个新节点——**并行=跨树探索，串行=树内深挖**。
- **"为何兄弟失败"的利用**：不在选择器里，而在上下文——memory summary（`journal.py:504-548`）把 buggy 节点的 Design/Error Analysis/Error Type/Debug Depth 全部喂给下一轮 draft/improve prompt（`parallel_agent.py:463, 530`）；`_identify_issues` 把 ≥2 次重复的同错误聚为"持续问题"进子阶段目标生成（`agent_manager.py:1092-1104`）。
- **节点选择器**（`journal.py:420-502`）：单节点直接返回；多节点时把每节点 metric/analysis/VLM 反馈拼成候选表，强制工具调用输出 selected_id+reasoning；选中 ID 无效或异常→回落 `max(nodes, key=metric)`（metric 排序定义在 `metric.py:171-204`，多指标多数据集取 final_value 均值，方向由 lower_is_better 决定）。
- 对 FAR-Lab：实验树本身是 Direction-B 适配器接口参考；但**"LLM 全局择优+确定性 metric 兜底+跨分支预算轮转"** 的混合决策模式与 FAR-Lab rank（tournament+BT+uncertainty）同题，可对照校准。

### 3.4 自我评估（J1 形态）与多轮自改进（J2 形态）

（注：代码中无 "J1/J2" 命名；按任务描述映射为回路内自评与产物反思修订两类。）

**回路内自评**（每节点必经，`parallel_agent.py` worker 流水）：
- 执行→`review_func_spec`（`:81-101`）判 is_bug+修复建议（`:683-719`）；`exc_type` 非空强制 buggy（`:713`）。
- 指标有效性：`metric_parse_spec`（`:135-202`）输出 valid_metrics_received；False → `WorstMetricValue()`+is_buggy（`:1641-1646`）——**抽取失败=失败**，fail-closed。
- 图有效性：`vlm_feedback_spec`（`:103-133`）valid_plots_received → is_buggy_plots（`:1020-1023`）；good_nodes 要求两个旗标皆 False（`journal.py:389-407`）。
- 节点摘要：`_generate_node_summary`（`:1035-1088`）输出 findings/significance/next_steps 结构（仅 step_callback 路径实际可达）。

**产物反思修订**（外部检查器驱动，均支持 "I am done" 早退）：
- 写作（`perform_icbinb_writeup.py:1012-1237`）：每轮 ①编译 PDF ②页限测量（pdftotext 定位 References 行数对比页限，`:238-334`）③chktex 静态检查（`:1047-1049`）④图引用与实际文件双向 diff（`:1018-1024`）⑤VLM 图-题注-正文评审 ⑥VLM 重复图检测 → 全部反馈拼进修订 prompt → 整文重写 → 常见 LaTeX 病修复（`</end`→`\end`、百分号转义，`:1102-1109`）→ 无变化即停。
- 绘图聚合器（`perform_plotting.py:191-254`）：执行反馈=图数+stdout；最多 5 轮。
- 评审反思（`perform_llm_review.py:215-228`）：评审自省轮，无改进即重复原 JSON+声明完成。
- ideation 反思（`perform_ideation_temp_free.py:111-125, 158-171`）：质量/新颖/可行性自省+工具结果注入，指令要求"坚持原想法精神除非有严重问题"（para）。

**对 FAR-Lab**：M13 的核心形状——**"确定性外部检查器的输出作为修订 prompt 的一级公民 + 整产物重写 + 幂等早退"**——与 FAR-Lab revise（因果链必需）互补：FAR-Lab 可将 verify/falsify 的机器可判失败（如 grounding 缺口、可证伪性字段缺失）以同等地位注入 revise prompt。FAR-Lab 已有更强纪律（causal-link-required），无需移植其 LaTeX 特定部分。

### 3.5 人工介入检查点

- **代码级结论：零 HITL**。全库无暂停/审批/确认原语；运行期人机界面=rich Live 全屏 TUI（任务描述+阶段进度+实时树+状态行，`perform_experiments_bfts_with_agentmanager.py:161-211`）+ Ctrl+C 中断（`:202`）；每步落盘 notes/journal/tree_plot.html 供事后检查（`:103-158`）。
- 论文叙事中的"workshop 评审"是外部人类流程（ICLR workshop 真实投稿），不在本仓库代码内。
- 反面价值：FAR-Lab 宪法要求显式 HITL 门（长任务 UX、失败/恢复）；AI-Scientist-v2 证明全自主路线**在系统内无任何安全阀**，其 launch 末尾按关键词杀进程（`launch_scientist_bfts.py:347-359`，匹配 python/torch/mp/bfts/experiment 即 SIGTERM→kill）正是无隔离边界的补救——FAR-Lab 适配器设计应引以为戒（进程清理必须限定自身进程树，`:327-345` 的 psutil children 遍历是正确做法，关键词扫杀是危险做法）。

### 3.6 文献与 grounding 机制

- **ideation 期**：单一工具 SemanticScholar（`tools/semantic_scholar.py:19-98`；backoff 限流 `:52-56`；按引用数排序 `:84`）；ACTION/ARGUMENTS 文本协议（正则解析，`perform_ideation_temp_free.py:183-206`）；系统提示要求 finalize 前至少一次检索（`:96`，**纯 prompt 约束，解析层不强制**）。
- **写作期引用**（M17）：每轮两步 LLM 调用（缺口识别+query → 检索结果选择+用途注记），规则="仅 API 检索所得"+"已存在不重复"（title 正则去重，`:818-826`）；每轮成功/出错都落 progress（`:806-847`），重启续跑（`:767-779`）。
- **反幻觉纪律全部是 prompt 级**：摘要器系统提示禁止编造（`log_summarization.py:17-20`）；绘图指令"只画实验数据中存在的值"（`parallel_agent.py:738` 转述）；指标必须来自真实执行输出（M9 管线是唯一有执行级 grounding 的环节）。**没有 claim→source 的自动对齐校验**——引文与正文主张的一致性完全依赖模型自觉。
- 对 FAR-Lab：FAR-Lab verify（fail-closed grounding）+ 证据段落级 excerpt 已显著强于对方；可吸收的是 M17 的三条工程纪律：仅工具证据入引、产物级去重、断点续跑的状态外置。

### 3.7 附加：prompt-with-progress 模式

- 写作主 prompt 结构（`perform_icbinb_writeup.py:602-645`）：idea 全文 + 三类阶段摘要 JSON + 聚合脚本源码 + 可用图文件名列表 + VLM 图描述 + **当前 LaTeX 全文** → 产出完整新版。反思轮再叠加六路新证据（M13）。即**每轮调用=任务+证据+当前产物+增量反馈**，产物永不假设模型记得（除 msg_history 外每次重传全文）。
- ideation：已生成 idea 全文序列化进下一提案 prompt（`perform_ideation_temp_free.py:101-107`）——显式负约束"必须与历史不同"。
- FAR-Lab 映射：revise/export 的产物传递可对齐此模式（FAR-Lab 状态模型已具备条件，属 prompt 组装层改进，成本低）。

### 3.8 附加：token/成本预算管理（B 组）

- `token_tracker`（全局单例，装饰器注入 `llm.py`/`vlm.py` 调用点）：从 API usage 记 prompt/completion/reasoning/cached token + 完整交互日志（system/prompt/response/时间戳，`token_tracker.py:75-97`）；价格表→成本（`:107-125`）；launch 在实验后与写作后两次落盘（`launch_scientist_bfts.py:35-39, 269, 302`）。
- **无预算执行**：没有任何"超支即停/降级"逻辑；并行 worker 各自独立调用无共享额度；控制成本的手段只有静态配置（模型分工：编码用 Claude、反馈用 gpt-4o、写作用 o1，`bfts_config.yaml:55-71`）与上下文裁剪（M22）。
- 对 FAR-Lab：记账+交互留痕（可审计性）值得已有等价物对照；"预算只算不控"是对方短板，FAR-Lab 若做预算门需自建（超支→降级模型/暂停需确认）。

### 3.9 附加：错误/重试纪律

- 传输层：`backoff.on_exception`（expo，RateLimit/Timeout/InternalServer，`llm.py:77-85, 258-266`）+ `backoff_create`（predicate 退避，`backend/utils.py:18-31`）；OpenAI client max_retries=0 自管（`backend_openai.py:20-28`）。
- 解析层：plan+code 抽取失败→把解析错误作为 "Parsing Feedback" 回注 prompt 重试 3 次（`parallel_agent.py:658-681`）；关键词前缀协议解析重试 5 次→兜底默认值（`:835-892, 1829-1858, 1892-1919`）；JSON 抽取三级降级（```json 块→任意 {}→控制字符清洗，`llm.py:452-477`）。
- 执行层：绘图代码异常重试 3 次（`:1671-1711`）；指标解析异常→WorstMetricValue+is_buggy（`:1654-1666`）；worker future 超时=exec timeout（`:2152`）+ 单节点失败不中断整波（`TimeoutError` 分支只记日志 `:2172-2174`）。
- 顶层：writeup 失败重试 3 次（`launch_scientist_bfts.py:278-300`）；引用轮出错→存进度继续下一轮（`:839-847`）；`get_best_node` LLM 失败→metric 兜底（`journal.py:496-502`）。
- 批评：大量 `except Exception: 打日志继续`（宽捕获）——诚实性风险在于**静默降级**（如 `_check_stage_completion` 评估异常返回 False 继续跑，`agent_manager.py:496-498`）；FAR-Lab 的 fail-closed 原则相反，吸收重试形状时须保持自身失败语义。

## 4. Top-10 机制排名（价值×可行性，FAR-Lab 视角）

| 排名 | 维度 | 机制 | file:line | 摘要 | why | 移植成本 | 风险/license | FAR-Lab 映射 |
|---|---|---|---|---|---|---|---|---|
| T1 | hypotheses | 全历史 idea 序列化 + 显式差异化约束的迭代生成 | `perform_ideation_temp_free.py:99-125, 148-258` | 每次生成把全部已有假设全文注入并要求新假设必须不同；反思轮注入工具结果 | 直接攻 FAR-Lab 多假设生成的多样性/撞车问题，正对 rediscovery F1 目标 | 低（prompt 组装层，FAR-Lab 自有措辞重写） | license 禁复制 prompt 原文→须 clean-room 转述 | **缺失**（FAR-Lab 多假设并行生成，但"历史全可见+显式负约束+逐个 finalize"的闭环形状可补） |
| T2 | rank | 集成多评审 + AC 元评审 + 有界分数聚合 | `perform_llm_review.py:125-233, 343-369` | n 份独立评审→解析失败剔除→LLM 聚合成元评审→各分数截断区间后取整均值 | 直接对 FAR-Lab relation 盲评 0.61→0.80 雄心：集成+聚合是升一致性的标准手段 | 低-中（FAR-Lab 已有 tournament/BT 基座，叠加评审集成层） | 同一模型自评自写的相关性偏差；license 同上 | **部分**（FAR-Lab rank 单路 tournament+BT；集成评审+元聚合层缺失） |
| T3 | revise | 外部检查器反馈注入修订循环 + 幂等早退 | `perform_icbinb_writeup.py:1012-1237` | 编译/页限/chktex/VLM 六路确定性反馈每轮重测并注入；产物无变化或声明完成即停 | FAR-Lab revise 可把 verify/falsify 的机器可判失败以同结构注入；早退省预算 | 低（模式移植，检查器换成 FAR-Lab 的 zod 门/grounding 缺口） | 反思循环无收敛证明；须保留 FAR-Lab 因果链纪律 | **部分**（FAR-Lab revise 有 causal-link-required 更强；缺"每轮重测的外部检查器矩阵"形状） |
| T4 | feedback 适配器 | 指标提取三级管线（生成解析代码→真实执行→从 stdout 抽结构化指标；失败=fail-closed） | `parallel_agent.py:1554-1666; metric.py:112-340` | 指标不信任模型口算：LLM 写代码读 .npy 产物，执行后 LLM 再从真实 stdout 抽 JSON，无效即 WorstMetricValue+buggy | FAR-Lab Direction-B 反馈适配器的接口原型：**任何进入 feedback 阶段的数字必须有执行级来源** | 中（FAR-Lab 适配器接口定义时引用此形状，不移植代码） | 依赖沙箱执行；解析代码本身可错（有重试但无交叉校验） | **缺失**（FAR-Lab 适配器接口尚在规划；此为参考蓝图，属 Direction-B 支撑面） |
| T5 | evidence/记忆 | 失败包含式 memory summary（错误分析+调试深度入上下文） | `journal.py:504-548; parallel_agent.py:2072-2081` | 每波把好/坏节点的设计-结果-错误类型-调试深度全部摘要进所有 worker 的 Memory 字段 | FAR-Lab 宪法"保留负证据"的工程化落地：失败结构化进入下一轮决策上下文 | 低（FAR-Lab evidence/revision 状态已含失败记录，需接进 revise prompt） | 摘要由 LLM 生成可能失真（对方无校验） | **部分**（FAR-Lab 保存负证据；"负证据→下一轮生成上下文"的回路可加强） |
| T6 | 编排 | 阶段完成门：LLM 证据评估 + 结构化 missing_criteria | `agent_manager.py:343-408, 444-498` | 完成不是布尔：LLM 看图分析+数据集清单+目标，输出缺失项列表驱动继续 | FAR-Lab 管线门（evidence 充分性/plan 完整性）可用同形状输出"缺什么"而非仅通过/失败 | 低-中（FAR-Lab 门为确定性 zod；可加 LLM 语义充分性子门，结果仍 fail-closed） | LLM 门可被讨好；FAR-Lab 须保持确定性门优先 | **部分**（FAR-Lab falsify/plan 门已有；"缺失项清单"输出形状可借鉴） |
| T7 | retrieve/export | 仅工具证据引用 + 产物级去重 + 断点续跑 | `perform_icbinb_writeup.py:745-854` | 引用只能来自 API 检索结果；title 去重；progress.json+cached.bib 支持中断恢复 | FAR-Lab provenance/export 的工程纪律补强：恢复语义与去重是其现有管线未显式覆盖的小缺口 | 低 | 无实质风险 | **部分**（FAR-Lab retrieve 更强；去重+断点续跑细节可吸收） |
| T8 | 预算/观测 | 分模型 token/成本记账 + 全交互留痕 | `token_tracker.py:10-222` | 装饰器无侵入采集 usage+每次交互完整日志，分阶段落盘 | FAR-Lab 可审计性（评审要求 reproducibility）：交互日志= provenance 的模型调用侧证据 | 低 | 只记账不设上限（对方短板）；日志含全文注意脱敏 | **部分**（FAR-Lab 有观测面；按调用点留痕+成本表形状可对齐） |
| T9 | 并发 | 主进程去重生成 / worker 并行执行的分工 + GPU 显式分配 | `parallel_agent.py:1931-1941, 2096-2116; GPUManager:1091-1118` | 需要全局唯一性的决策（idea 去重）放主进程串行，纯执行并行化；资源 acquire/release 配对 | FAR-Lab 并发原则的实证参照：共享状态的写者收敛到单点 | 低（原则借鉴，无代码移植） | 无 | 已有等价（FAR-Lab 并发纪律一致；可作交叉验证案例） |
| T10 | 结构化输出 | FunctionSpec=schema 校验+强制工具调用+解析失败反馈重试 | `backend/utils.py:105-131; parallel_agent.py:658-681` | schema 先验证；tool_choice 强制；解析失败把错误回注重试 | FAR-Lab zod 管线的对方对照物：其"解析错误反馈注入重试"是 FAR-Lab 可补的小机制 | 低 | 无 | **部分**（FAR-Lab zod 已有校验；"解析失败原因回注重试"可加强） |

（排名依据：T1-T3 直击 FAR-Lab 两大量化雄心与核心管线；T4 是任务指定的适配器接口参考；T5-T8 为低成本工程补强；T9-T10 为形状对照。）

## 5. Rejection notes（明确不移植/降权项）

1. **实验代码树搜索全套**（`_select_parallel_nodes`/draft/debug/improve/Interpreter/绘图代码生成）：Direction-B 执行面，FAR-Lab 仅在适配器接口定义时参考 T4/M20 的形状；不进 FAR-Lab 核心。License 亦禁代码搬运。
2. **prompt 原文任何部分**：RAIL 系 license + 传染性条款（LICENSE §3.1/§3.3），全部只做机制转述。
3. **`seed=0` 固定采样**（`llm.py:131, 240`）：GPT 系调用硬编码 seed=0——与"多样性生成"目标冲突（ideation 靠此获得多样性存疑），FAR-Lab 不应模仿。
4. **进程关键词扫杀**（`launch_scientist_bfts.py:347-359`）：按 cmdline 关键词杀任意 python/torch 进程，跨实验并行即灾难；只可借鉴其 psutil children 定向清理部分（`:327-345`）。
5. **静默降级路径**：宽捕获+日志继续的模式遍布（§3.9 批评）；FAR-Lab fail-closed 语义相反，只吸收重试形状不吸收兜底哲学。
6. **死代码不当作机制**：`_evaluate_stage_progression`/`_create_stage_analysis_prompt`/`_save_stage_summary`/`node._agent`/`node._vlm_feedback`/`InteractiveSession`/`MetricValue_old`/未用的 `journal2report` 导入（§3.2 诚实记录）——引用其"自动阶段规划"叙事时须注明代码未接线。
7. **已知 bug 引用需谨慎**：`find_pdf_path_for_review`（`launch_scientist_bfts.py:140-164`）在无 reflection PDF 时返回未绑定变量（UnboundLocalError 路径）；`_check_substage_completion` 声明 `-> bool` 实返 tuple 且 try/except 后代码不可达（`agent_manager.py:343-408`）——研究代码质量信号，任何"工程成熟度"评价应据此校准。
8. **HITL**：无可移植物（本就为零）；仅作 FAR-Lab 产品面差异化参照（M23）。
9. **SemanticScholar 工具**：FAR-Lab 已有 OpenAlex+arXiv+crossref+RRF，更强；不引入。
10. **成本控制**：对方只记账不控预算（§3.8），无可抄的预算执行机制。

## 6. 质量与可信度声明

- 本报告所有 file:line 均经源码阅读核实；死代码/未接线结论经 grep 调用点交叉验证（`_evaluate_stage_progression`、`node._agent`、`node._vlm_feedback`、`journal2report` 均无实际调用/赋值）。
- 未执行任何上游代码；未复制任何 prompt/代码原文（所有引述 ≤10 词且仅作定位）。
- 快照与论文（arXiv:2504.08066）可能存在版本差；README 自述的限制（成功率依赖强模型、v2 不必然优于 v1）已如实记录。
