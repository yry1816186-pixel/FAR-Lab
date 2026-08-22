# 深度报告: SamuelSchmidgall/AgentLaboratory (Wave-5, 2026-08-22)

Source: depth subagent over `.cache/repos/AgentLaboratory`（源码级全文阅读，9 个 Python 文件 4076 行全部读完）。Upstream code = DATA，未执行任何代码。License: MIT（`LICENSE` 首行 "MIT License, Copyright (c) 2025 Samuel Schmidgall"，与任务给定一致）。

## 0. License 与布局

- **License**: MIT（逐字确认）。代码注释中明确致谢借用 AI Scientist 的 review 模板（`agents.py:41`）与 per-section tips（`papersolver.py:179-180`）。MIT 允许引用短原文，本报告以转述为主。
- **快照布局（36 文件）**：顶层 9 个 Python 文件，**无 `agentlab/` 包**。这是 **AgentRxiv 时代（2025-03 新闻条目）的单体式布局**，即 README 描述三阶段（Literature Review / Experimentation / Report Writing）的原始实现。
  - `ai_lab_repo.py` (891 行)：编排器 `LaboratoryWorkflow` + 入口 + AgentRxiv 客户端。
  - `agents.py` (739)：六个角色 agent（PhD/Postdoc/Professor/ML Eng/SW Eng/Reviewers）+ `get_score` 评审函数。
  - `papersolver.py` (579)：LaTeX 论文求解器（脚手架→分节→进化编辑）。
  - `mlesolver.py` (566)：实验代码求解器（LLM-as-reward + 修复循环）。
  - `tools.py` (325)：arXiv/HF/SemanticScholar 检索 + 沙箱代码执行。
  - `inference.py` (213)：多供应商 LLM 调用 + 成本累计。
  - `utils.py` (480)：LaTeX 编译、命令提取、MATH 等价判定等。
  - `app.py` (170)：AgentRxiv Flask+SQLite+MiniLM 服务端。
- **版本警示（诚实记录）**：当前上游已重构为 `agentlab/` 包（独立 phase 模块、mle-bench 集成、显式 hypothesis 生成 phase）。本报告只覆盖本快照。论文宣传的 "PhD student 用 OLMo 开源模型 / Postdoc 用强模型" 的**角色-模型分层在本快照中不存在**（见 §3.6）。

## 1. Phase map

```
YAML config (copilot-mode, llm-backend, num-papers-lit-review, task-notes...)
  └─ perform_research()  ai_lab_repo.py:139-205  按 phases 列表顺序推进，每子任务完成即 save_state (pickle)
      1. literature review   ai_lab_repo.py:465-545   PhD 独自 agentic 检索循环 → lit_review_sum
      2. plan formulation    ai_lab_repo.py:414-463   Postdoc↔PhD 对话 → ```PLAN 自由文本
      3a. data preparation   ai_lab_repo.py:343-412   SW Eng↔ML Eng 对话 + ```SEARCH_HF + ```python 试错 → load_data.py
      3b. running experiments ai_lab_repo.py:310-341  MLESolver 进化循环（LLM 打分选优）→ run_experiments.py + log
      4a. results interpretation ai_lab_repo.py:274-308 Postdoc↔PhD 对话 → ```INTERPRETATION
      4b. report writing     ai_lab_repo.py:240-272   PaperSolver 脚手架+分节+进化编辑（每步 pdflatex 门禁）
      4c. report refinement  ai_lab_repo.py:207-238   三审稿人评审 → y/n 回环（默认关闭，见 §3.3）
                                       └─ "y" → second_round=True + reviewer_response 注入 + 5 个 phase_status 复位 + 递归 perform_research()
```
状态共享：`set_agent_attr` 把产物（lit_review_sum/plan/dataset_code/results_code/exp_results/interpretation/report）广播到所有 agent 实例（`ai_lab_repo.py:115-126`）；每阶段结束 `reset_agents()` 清对话史（`:128-137`）。

## 2. 机制清单

| # | 维度 | 机制 | file:line | 摘要 | why（动机） | 移植成本 | 风险 | FAR-Lab 映射 |
|---|---|---|---|---|---|---|---|---|
| M1 | 文献综述 | agentic 检索命令循环 ```SUMMARY/```FULL_TEXT/```ADD_PAPER | `ai_lab_repo.py:465-545`, `agents.py:638-646` | PhD 学生逐步发命令：SUMMARY→arXiv 相关性检索前 N（默认 5）、FULL_TEXT→下载 PDF 抽全文（截 50k 字符）、ADD_PAPER→id+自写摘要入 lit_review 列表 | 让检索由模型自主驱动，模拟真人查文献 | 低（FAR-Lab retrieve 已有确定性工具，只需借鉴命令循环形状） | 循环无确定性终止保证 | 部分（FAR-Lab retrieve 是确定性管线；agentic 自主检索是其补充形态） |
| M2 | 文献综述 | EXPIRATION 标签化上下文过期 + max_hist_len | `agents.py:265-274, 228`, `ai_lab_repo.py:47, 493-495` | 全文以 `` ```EXPIRATION 3`` 前缀入 history，每轮所有过期项计数-1，归零逐出；history 上限 15 条 | 论文全文太大不能常驻上下文 | 低（纯确定性逻辑） | 过期后信息不可再访问（无重取提示） | **缺失**（FAR-Lab 证据上下文预算可借鉴） |
| M3 | 文献综述 | 综述序列化格式：仅 id+摘要 | `agents.py:733-736` | `format_review()` 输出 "arXiv ID: X, Summary: Y" 行；full_text 存于条目但不进下游摘要 | 控制下游 prompt 体积 | 极低 | 摘要由 agent 自写，无溯源校验 | 部分（FAR-Lab evidence 有 claim-source 对齐，更强） |
| M4 | 文献综述 | arXiv 限速与重试 | `tools.py:229-260` | 查询截 300 字符、3 次重试、每次调用 sleep 2s、按 Relevance 排序 | 遵守 arXiv API 礼仪 | 极低 | 无 | 已有等价（FAR-Lab 检索适配层自理） |
| M5 | 假设/计划 | Postdoc↔PhD 对话 + ```PLAN 提交 | `ai_lab_repo.py:414-463`, `agents.py:405-411, 425-428` | 资深角色先发言、初级角色回应，DIALOGUE 互通；postdoc 满意后提交 ```PLAN（自由文本，含模型/数据集/实验细节要求） | 用层级对话模拟导师指导 | 中 | 对话轮数不设每步上限，靠 max_steps 兜底 | 部分（FAR-Lab hypotheses 由结构化管线生成；对话式计划成型是另一形态） |
| M6 | 假设/计划 | 新颖性=纯 prompt 措辞 | `agents.py:427, 687`（"very innovative and unlike anything seen before"） | 无任何 novelty 检索/相似度校验，仅靠指令 | — | — | 新颖性无证据支撑 | **不适用**（FAR-Lab 有 falsify+counter-evidence+盲评；此处是反面教材） |
| M7 | 假设/计划 | 条件化=context 注入 | `agents.py:381-385, 587-590` | plan formulation 的 context 仅 lit_review_sum（+第二轮的 prev 产物与评审） | 计划必须从综述导出 | 低 | 注入无 token 预算控制 | 已有等价（FAR-Lab scope→retrieve→hypotheses 因果链更显式） |
| M8 | 假设/计划 | 失败降级路径 | `ai_lab_repo.py:453-463` | max tries 耗尽且 except_if_fail=False → plan="No plan specified." 继续走完流水线 | 无人值守长跑不崩 | — | 静默降级（诚实性反面教材） | **不适用**（FAR-Lab fail-closed 原则相反） |
| M9 | 评审/修订 | 三人设审稿 + NeurIPS 式 JSON 评审表 | `agents.py:36-201`（表单 79-136，ReviewersAgent 184-201） | 3 个"harsh but fair"人设（实验导向/影响力导向/新颖性导向）独立评审；输出 15 字段 JSON（Overall/10、Soundness/4、Confidence/5 等），THOUGHT+```json 双段结构 | 人设差异制造评审多样性 | 低（模板移植） | 同一 LLM 自评自写，相关性偏差 | 部分（FAR-Lab rank/align 有评分；多人设+标准评审表是可借鉴形状） |
| M10 | 评审/修订 | 加权合成分 | `agents.py:151-176` | 9 维归一化加权：overall 1.0、contribution 0.4、presentation 0.2、其余 6 维各 0.1 → 归一 ×10 | 把多维评审压成单可比分 | 低 | 权重硬编码无依据 | 部分（FAR-Lab rank 有自己的准则；权重形状可参考） |
| M11 | 评审/修订 | 评审门控修订回环（second_round） | `ai_lab_repo.py:180-238`, `agents.py:370-395` | "y"→reviewer_response 注入所有 agent context、prev_* 快照（旧代码/结果/解释/报告）保存、5 个下游 phase_status 复位、递归 perform_research() 整链重跑 | 评审反馈驱动全流程修订 | 中 | 递归无深度上限（靠 override 计数器，而默认=0 即禁用）；无修订因果链校验 | 部分（FAR-Lab revise 有"修订须因果链到 feedback"的更强纪律——灵魂边界保持 FAR-Lab 原创不动） |
| M12 | 评审/修订 | 修订迭代上限计数器 | `ai_lab_repo.py:45-46, 54, 220-225` | `review_override=True` + `review_total_steps=0`：override 计数≥上限即强制 "n"（完成）。**默认配置下回环恒不触发**（0==0 → 恒 "n"） | 防无限回环 | 低 | 默认关闭=死配置（诚实记录） | **缺失**（FAR-Lab revise 需要显式 iteration cap 语义——此为反例教训：上限必须显式生效） |
| M13 | 人机回环 | 逐阶段 Y/N 门 + 自由文本 notes 注入 | `ai_lab_repo.py:547-574, 764-772` | copilot-mode 下每阶段产物展示给人，N→输入改进 notes→追加 `{"phases":[phase],"note":...}` 到全局 notes→agent 历史清空重跑该阶段；notes 按 phase 过滤注入后续所有该 phase prompt（`agents.py:251-252`） | 人反馈以结构化 phase-scoped 备注持久注入 | 低 | 见 M14 缺陷 | 部分（FAR-Lab feedback 阶段已有；phase-scoped note 注入形状可借鉴） |
| M14 | 人机回环 | 两处 HITL 实现缺陷（反面教材） | `ai_lab_repo.py:216`（report refinement 的 input() 返回值被丢弃→copilot 模式恒终止）；`:333`（running experiments 的检查误标 "data preparation"） | — | — | 研究级代码质量 | 不适用（作为移植时的教训清单） |
| M15 | 报告写作 | 脚手架→分节生成 | `papersolver.py:330-397` | 先 ```REPLACE 生成含 `[ABSTRACT HERE]` 等占位符的空脚手架（校验占位符齐全），再按 abstract→discussion 逐节生成替换占位符；每节独立 retry + 错误回灌 | 分治降低单次生成长文失败率 | 中 | 节间一致性无校验 | 部分（FAR-Lab plan 导出若分节可借鉴） |
| M16 | 报告写作 | 分节级 arXiv 检索 | `papersolver.py:335-353, 363` | intro/related work/background/methods/discussion 五节各自：LLM 先生成检索 query（失败 5 次后加"换个更简单的 query"提示）→取 10 篇→"可用 (arXiv 2308.11483v1) 括号引用" | 每节证据就该每节检索 | 低 | 引用仅括号 arXiv id，无 BibTeX/无溯源校验 | 部分（FAR-Lab evidence 溯源更强；分节检索思路可借鉴） |
| M17 | 报告写作 | pdflatex 编译门禁 + 失败回滚 | `papersolver.py:105-174`, `utils.py:127-160` | 每个 EDIT/REPLACE 先写 tex→pdflatex nonstopmode（30s 超时，自动注入 28 个 usepackage）→失败则**不采纳编辑**（回滚）并回灌错误文本；error 字样检测（`:153`） | 写入前必须通过确定性校验（fail-closed 编辑） | 中 | "error" 子串检测过于宽泛 | **部分**（FAR-Lab verify 是 fail-closed grounding；此为同一思想在 LaTeX 域的实现） |
| M18 | 报告写作 | 进化式编辑循环 + LLM 评分选优 | `papersolver.py:269-304, 399-468` | solve() 以 temp=1.0 采样命令，`min_gen_trials=2`，每次成功编辑用 `get_score`（同一套 NeurIPS 评审）打分，best_report 按分排序淘汰；EDIT N M 行区间编辑为主工具 | 用评审分当 reward 做爬山 | 中 | 评审者=写作者同模型，reward hacking 面 | 不适用（FAR-Lab 无论文进化编辑；评分选优思想已被 rank 覆盖） |
| M19 | 报告写作 | 字数压力 + 反幻觉指令 | `papersolver.py:512-515, 538, 224` | 动态提示"当前 X 词，还需增加 4000-X 词"；"Your results must ACCURATELY reflect the numbers presented here"；results 节 tips "Do not hallucinate results that don't exist" | 长度与忠实性都是 prompt 级约束（无校验） | 低 | 指令性约束无执行保障 | 部分（FAR-Lab grounding 有确定性校验，更强） |
| M20 | 报告写作 | lit_review 20k 字符截断进 system prompt | `papersolver.py:522` | `str(self.lit_review)[:20000]` 硬截断 | 上下文预算 | 极低 | 硬截断可能切半句 | 已有等价（FAR-Lab 预算化上下文，方式更精细） |
| M21 | 成本/多角色 | 全局 token 计量 + 价格表估费 | `inference.py:7-33, 190-205` | TOKENS_IN/OUT 按模型累计（tiktoken 估算），每次调用打印运行费用；8 模型 2025 价格硬编码 | 成本可观测 | 低 | 价格表会过期；估算≠账单 | 部分（FAR-Lab 需按 phase/按 run 维度，此处只有全局累计） |
| M22 | 成本/多角色 | phase 级模型路由（骨架存在） | `ai_lab_repo.py:71-78, 152-155, 774-782` | `phase_models` dict 支持每子任务设不同模型并在进入时 set_model；但主入口把所有 phase 设成同一 llm_backend；`lit-review-backend` yaml 键解析后**从未接线**（死配置，`:682-683`） | 弱/强模型分工的钩子 | 低 | 钩子存在但默认未用 | 部分（FAR-Lab 模型路由是产品需求；此为最小实现形状） |
| M23 | 成本/多角色 | 计算预算参数族 | `ai_lab_repo.py:24, 50-58` | max_steps（阶段尝试次数）、arxiv_num_summaries=5、num_ref_papers=1、arxiv_paper_exp_time=3（过期轮数）、mlesolver_max_steps=3、papersolver_max_steps=5、review_total_steps=0 | 显式预算旋钮 | 低 | — | 已有等价（FAR-Lab 预算/上限体系更完整） |
| M24 | 代码执行 | 沙箱子进程执行 | `tools.py:292-325` | multiprocessing 子进程 + stdout 捕获 + 超时强杀（默认 600s）+ exit() 禁用 + 特定慢数据集黑名单；错误以 `[CODE EXECUTION ERROR]` 哨兵回灌 | 不可信代码隔离与失败反馈 | — | 与 FAR-Lab Direction-A 无代码执行需求 | 不适用（Direction-B 域） |
| M25 | 代码执行 | 错误修复循环 | `mlesolver.py:25, 166-200, 351-365` | GLOBAL_REPAIR_ATTEMPTS=2：执行失败→code_repair（错误+全文回灌，"输出尽量贴近原码"）→重试；仍败则回滚并告知 agent | 自动修复小错误减少浪费 | — | Direction-B 域 | 不适用 |
| M26 | 代码执行 | 反思（reflection）机制 | `mlesolver.py:319-327, 464-502` | 每轮执行后强制 LLM 反思（错误定位到行/改进到行），reflection 连同 code return 一起进下一轮 history | 显式结构化自我反馈 | 低 | 反思无校验，可能自欺 | 部分（FAR-Lab feedback 阶段同族；FAR-Lab 有因果链约束更强） |
| M27 | Prompt 工程 | 命令语法 ```COMMAND\n…\n``` 单命令/轮 | `utils.py:235-239`, `agents.py:247-277` | 正则提取；多命令只执行第一个并在指令中反复强调 | 简单可靠的输出协议 | 低 | 嵌套代码块会破坏正则 | 已有等价（FAR-Lab 用 zod 结构化输出，更强） |
| M28 | Prompt 工程 | 系统提示三层拼装 | `agents.py:248, 256-259` | role_description（人设）+ phase_prompt（任务）+ command_descriptions（协议）；user 侧 = context + history + step/objective/feedback/notes + 反重复指令 | 关注点分离的 prompt 模板化 | 低 | 纯 f-string 拼接无长度控制 | 部分（FAR-Lab prompt 装配可参考分层） |
| M29 | Prompt 工程 | 循环护栏：反重复 + 紧迫升级 | `agents.py:254, 259` | "Your previous command was X. Make sure your new output is very different."；step/(max_steps-1)>0.7 时注入 "You must finish this task and submit as soon as possible!" | 迭代生成防停滞 | 极低 | 启发式 | **缺失**（FAR-Lab 迭代生成阶段可用） |
| M30 | AgentRxiv | 自建论文共享服务 | `app.py`（全文）, `ai_lab_repo.py:576-650` | Flask+SQLite 存 PDF 全文；all-MiniLM-L6-v2 句向量余弦检索；实验室产出的 PDF 自动上传回 uploads/ 供后续 lab 检索；检索命中后 gpt-4o-mini 生成 5 句摘要缓存 | 跨 lab 累积研究 | 高（整套服务） | 单机玩具级（每次搜索前全量重编码向量） | 不适用（FAR-Lab 无多 lab 共享需求；"产出回流知识库"概念可记档） |
| M31 | 状态/恢复 | pickle 全状态检查点 | `ai_lab_repo.py:106-113, 200` | 每子任务完成把整个 workflow 对象 pickle 到 state_saves/ | 断点续跑 | — | pickle 整对象（含 agent/线程引用）脆弱 | 已有等价（FAR-Lab .control/ 显式状态机更强） |
| M32 | 检索备件 | SemanticScholarSearch 未使用 | `tools.py:179-197` | 类存在但 `retrieve_full_paper_text` 是 `pass`，全仓无调用 | — | — | 死代码 | 不适用 |

## 3. 深钻

### 3.1 文献综述：arXiv 论文如何变成 survey（焦点 1）

数据流：`literature_review()`（`ai_lab_repo.py:465-545`）驱动 `PhDStudentAgent` 走 agentic 循环，每轮恰好执行一个命令：

- ```SUMMARY query``` → `ArxivSearch.find_papers_by_str`（`tools.py:229-260`）：`arxiv.Search(query="abs:"+query, max_results=N, sort_by=Relevance)`，N 默认 `arxiv_num_summaries=5`；每条返回 Title/摘要/日期/arXiv id 四行拼文本；查询超 300 字符截断；3 次重试 + 每次 sleep 2s。
- ```FULL_TEXT id``` → `retrieve_full_paper_text`（`tools.py:262-285`）：下载 PDF → pypdf 逐页抽取（带 `--- Page N ---` 分隔）→ **截断至 MAX_LEN=50000 字符** → 包装成 `` ```EXPIRATION 3\n<全文>``` `` 回灌。
- ```ADD_PAPER id\nsummary``` → `PhDStudentAgent.add_review`（`agents.py:714-731`）：**重新取一次全文**存入 `lit_review` 条目 `{arxiv_id, full_text, summary(模型自写)}`；格式错则返回纠错反馈。
- 终止：`len(lit_review) >= num_papers_lit_review`（默认 5，yaml 可调）。**没有质量判据**——凑够篇数即止，且 prompt 要求先 FULL_TEXT 再 ADD_PAPER 仅靠指令约束。
- 产出：`format_review()`（`agents.py:733-736`）只序列化 `arXiv ID + summary`（**full_text 不进 survey**）。

**上下文预算**是双层的：survey 本体极小（5 条自写摘要），大对象（论文全文）通过 EXPIRATION 机制（M2）在 3 轮后从 history 逐出，history 另有 15 条硬上限。这是"重证据临时进上下文、轻摘要永久随行"的典型预算方案。引用处理：survey 阶段只留 arXiv id；论文写作阶段另起分节检索（M16），引用形式为括号 arXiv id，**无 BibTeX、无引用内容校验**。

诚实记录：综述阶段耗尽 max_tries 且未凑够论文时（`except_if_fail=False`），函数隐式返回 None，lit_review_sum 保持空串静默进入下一阶段（`ai_lab_repo.py:526-545` 的 else 分支只有凑够才走，不凑够直接掉出函数）。

### 3.2 假设/计划成型（焦点 2）

本快照**没有独立的 hypothesis 阶段**——"hypothesis formulation" 体现为 plan formulation：

- 结构：`plan_formulation()`（`ai_lab_repo.py:414-463`）固定 Postdoc 先、PhD 后的乒乓对话；DIALOGUE 命令互通发言；Postdoc 认可后发 ```PLAN``` 提交。
- 条件化：两个角色的 context 都只有 `lit_review_sum`（`agents.py:381-385, 587-590`），计划"从综述扩展"仅靠 phase_prompt 指令（"integrate the provided literature review and come up with plans on how to expand and build on these works"，`agents.py:427`）。
- 表示格式：**纯自由文本**，无 schema、无结构化字段；prompt 要求涵盖"用什么模型/什么数据集/实验细节"但不校验。
- 新颖性：仅 prompt 措辞（M6）。**没有**对 arXiv 做相似性查重的机制（上游新版有，本快照无）。
- 降级：max tries 耗尽 → "No plan specified."（M8）。

### 3.3 评审/修订回环（焦点 3，最高价值）

评审生成：`ReviewersAgent.inference`（`agents.py:184-201`）= 3 个独立 `get_score` 调用，人设分别为"重实验洞察""重领域影响力""重前所未有新颖性"。`get_score`（`agents.py:36-181`）：system = 人设 + NeurIPS 式评审表（15 字段 JSON，THOUGHT 先行）+ "Be critical and cautious"；输入 = plan + 全文 LaTeX；输出 JSON 解析后 9 维归一化加权（M10）合成 0-10 分。3 份评审原样拼字符串返回。

修订消费（`report_refinement`，`ai_lab_repo.py:207-238`）：
1. 非 copilot 模式：把评审全文塞给 PhD 问 y/n（"go back to planning phase and improve your experiments?"）。`review_override=True` 时不问模型，直接按 `review_total_steps` 计数器决定——**默认 0==0 恒 "n"，即修订回环默认死配置**。
2. 选 "y"：`reviewer_response`（评审原文）set 到所有 agent；`prev_report/prev_exp_results/prev_results_code/prev_interpretation` 快照；5 个下游 phase_status 置 False；**递归调用 `perform_research()`**（`ai_lab_repo.py:180-199`）整链重跑。
3. 第二轮中每个 agent 的 context 开头注入 `sr_str`（前轮代码/结果/解释/报告 + 评审原文，`agents.py:370-395`）——这是"修订必须看见上轮失败证据"的最简实现。

**对 FAR-Lab 的关键对照**：AgentLab 的修订没有任何"修订项须因果归因到某条评审意见"的校验——评审是整坨注入，回环是整链重启。FAR-Lab 的 revise（revision requires causal link to feedback）语义更强，属 FAR-Lab 灵魂边界，**不移植 AgentLab 的粗粒度回环，只借鉴两点**：(a) prev_* 快照 + 反馈原文成对注入的上下文形状；(b) 显式迭代上限的反面教训（AgentLab 的上限默认不生效）。

迭代上限：代码中的上限机制即 review_total_steps 计数器（M12）；递归本身无深度保护——若关掉 override 且模型持续答 "y" 会无限递归（Python 递归深度最终兜底崩溃）。copilot 模式下 `input()` 返回值被丢弃（M14）→ 人无法真正触发修订。

### 3.4 人机回环检查点（焦点 4）

单一开关 `copilot-mode`（yaml）同时打开 7 个 phase 的 `human_in_loop_flag`（`ai_lab_repo.py:764-772`）。每个检查点（`human_in_loop()`，`ai_lab_repo.py:547-574`）：打印产物 → Y/N 循环校验 → N 时请求自由文本 notes → `notes.append({"phases":[phase], "note":...})` → 清 agent 历史 → 返回 True 重跑该阶段。notes 的消费：`BaseAgent.inference` 按 phase 过滤注入每条 prompt（`agents.py:251-252`），且**持久存在**（重跑后仍注入，直到会话结束）——反馈是累积的。另有研究主题交互输入（`:749`）。缺陷见 M14：refinement 检查点形同虚设、experiments 检查点 phase 标错。

对 FAR-Lab：FAR-Lab feedback 阶段已有语义更强的通道；可借鉴的是 `{phases, note}` 结构化注记 + "反馈持久注入而非一次性"的形状。

### 3.5 报告写作流水线（焦点 5）

PaperSolver（`papersolver.py`）三段式：

1. **初始生成** `gen_initial_report`（`:330-397`）：scaffold（校验 5 个占位符齐全）→ 逐节 abstract/introduction/related work/background/methods/experimental setup/results/discussion：五个人文节先做分节 arXiv 检索（LLM 生成 query，空结果重试至多 5 次并提示"换更简单的 query"），结果作为可引用论文注入；每节 ```REPLACE 生成（拒绝含 documentclass/usepackage 的输出）；占位符替换后走编译门禁。
2. **进化编辑** `solve`（`:269-304`）：temp=1.0 采样 EDIT/REPLACE 命令，`min_gen_trials=2` 次成功编辑，每次用 `get_score` 打分，best_report 保留最优（max_papers=1）。EDIT N M 行区间编辑为主（docstring 明确"primary way"）。
3. **编译门禁**（M17）：`compile_latex`（`utils.py:127-160`）自动补 28 个 usepackage、pdflatex nonstopmode、30s 超时；PaperEdit.execute_command 中 `"error" in latex_ret.lower()` 即拒绝采纳（`papersolver.py:153`）。

错误纠正：编译失败 → 不采纳 + 错误文本回灌 → 模型下轮重试（无独立 repair 子循环，靠循环重试）；对比 mlesolver 有显式 code_repair 子循环（M25）——论文侧没有。引用：括号 arXiv id（M16）；`ref_papers`（`num_ref_papers=1`）把"高质量参考论文全文"注入 system prompt 当范文（`papersolver.py:518-521`）。figures：检测 Figure_1/2.png 存在则强制要求 includegraphics 并重写为绝对路径（`:413-416, 503-508`）。

### 3.6 成本与多操作员设置（焦点 6）

**诚实结论：论文宣称的 "Postdoc=o1 强模型 / PhD-student=OLMo 开源模型" 分层在本快照中不存在实现**。

- 所有 6 个角色在构造时用同一 `model_backbone`（`ai_lab_repo.py:94-99`）。
- `phase_models` dict 提供了**每子任务换模型**的钩子（M22），进入子任务时 `set_model` 切换（`:152-155`）；但主入口 `agent_models` 把 7 个 phase 全设为同一 `llm_backend`（`:774-782`）。
- `lit-review-backend`（yaml 支持 gpt-4o-mini）解析进 parser 后**从未被消费**——死配置（`:682-683`）。
- 开源模型接触面仅剩：`utils.py:29-50` 的 `query_qwen`（QwQ-32B via HF InferenceClient）——但它是给**生成的实验代码**调用的工具函数（MATH yaml task-notes 里明确教模型调 `query_gpt4omini`），不是角色主干。
- 成本核算：全局 `TOKENS_IN/TOKENS_OUT` 按模型累计（tiktoken 估算），每次调用打印运行总额（`inference.py:12-33, 190-205`）；价格表 8 模型硬编码。**无按 phase/按角色的成本归集**（`statistics_per_phase` 只有 time/steps，`:82-90`）。
- 预算旋钮族见 M23。论文中 "$15/paper vs $33/human" 类数字不在此代码中复算，UNVERIFIED。

### 3.7 Prompt 结构模式（焦点 7，转述为主）

1. **命令协议**：```COMMAND\npayload\n```，正则提取（`utils.py:235-239`）；单命令/轮 + 三反引号强调反复出现于所有 command_descriptions。
2. **三层系统提示**（M28）：人设（"a computer science postdoctoral student at a top university"）+ phase 任务 + 命令协议；user 侧固定骨架 context/history/step/objective/feedback/notes。
3. **结构化输出**：THOUGHT + ```json（评审）、```SCORE float（reward）、```EDIT N M（编辑）。
4. **过期标签**：EXPIRATION 前缀（M2）。
5. **双角色对话**：senior 指导 junior 的 DIALOGUE 乒乓；junior 通常持有提交命令（PLAN/INTERPRETATION）。
6. **反重复 + 紧迫升级**（M29）。
7. **致谢借用**：评审表单与 per-section tips 转述自 AI Scientist（代码内注明）。自评其 reward 为 "todo: have a reward function here"（`agents.py:40`, `mlesolver.py:145`）——作者自己承认 reward 是临时占位。

## 4. Top-8 排序（对 FAR-Lab 的价值）

1. **三人设对抗评审 + NeurIPS 式结构化评审表 + 加权合成分**（M9/M10，`agents.py:36-201`）。FAR-Lab relation blind-agreement 0.61→0.80 的直接可用杠杆：多个"关注维度互斥"的评审人设（证据严格性/影响力/新颖性）+ 固定 JSON schema + 归一化加权合成，比单人设自评更能暴露分歧。移植=模板级（MIT 许可，转述即可）。注意补上 AgentLab 缺的：评审间一致性度量。
2. **修订回环的上下文形状：prev_* 快照 + 反馈原文成对注入**（M11，`ai_lab_repo.py:180-238`, `agents.py:370-395`）。FAR-Lab revise 阶段的因果链纪律保持原创，但"修订轮里必须同时看见上轮产物与反馈原文"的 sr_str 形状值得采纳；同时吸收反面教训：迭代上限必须显式生效（M12 的死配置不可复制）、递归重启整链代价过高（FAR-Lab 应局部修订）。
3. **EXPIRATION 上下文过期 + history 硬上限**（M2，`agents.py:265-274`）。FAR-Lab evidence 密集管线的 token 预算工具：重证据限时驻留、摘要永久随行，纯确定性实现。改进方向：过期时保留"可重取指针"。
4. **编译/执行门禁的 fail-closed 编辑**（M17，`papersolver.py:105-174`, `utils.py:127-160`）。"编辑先验证、失败即回滚、错误回灌"与 FAR-Lab verify 的 fail-closed grounding 同思想；对 FAR-Lab plan 导出/校验器设计的直接参照（校验不过不落库）。
5. **HITL phase-scoped notes：`{phases:[...], note}` 持久注入**（M13，`ai_lab_repo.py:547-574`）。FAR-Lab feedback 阶段可借鉴的结构化形状：人反馈按阶段归档、累积注入、重跑不清除。规避 M14 两缺陷（返回值必须消费、phase 标签必须准确）。
6. **分节级证据检索**（M16，`papersolver.py:335-353`）。FAR-Lab research plan 的每个 section（方法/数据/评估/风险）各自触发检索而非一次全局检索，提高每节 grounding 密度；"检索 query 由 LLM 生成 + 空结果提示简化 query 重试"的循环可直接用。
7. **全局 token 计量 + 运行费用打印**（M21，`inference.py:7-33`）。最低成本的可观测性底线；FAR-Lab 应升级为 per-phase/per-run 归集（AgentLab 没做到的部分）。
8. **迭代生成护栏：反重复指令 + 进度紧迫升级**（M29，`agents.py:254, 259`）。FAR-Lab 假设生成/修订迭代中的廉价防停滞手段；进度阈值触发"必须收敛"指令。

## 5. 拒绝记录

- **角色扮演层级（Professor/Postdoc/PhD/ML Eng/SW Eng 六角色）**：拒绝。人设只影响 prompt 措辞，本快照中角色间无能力差异、无模型差异；六角色是叙事开销。FAR-Lab 灵魂边界要求假设/证据语义单源。
- **MLESolver 及代码执行面**（M24/M25）：Direction-B 域，FAR-Lab Direction-A 不需要；且 reward 是作者自注的 "todo" 占位（`mlesolver.py:145`）。
- **AgentRxiv Flask+SQLite+MiniLM 服务**（M30）：单机玩具（每次检索前全量重编码），多 lab 共享需求不存在。仅记档概念："实验室产出回流可检索知识库"。
- **括号式 arXiv 引用**：无 BibTeX、无引用-内容一致性校验，弱于 FAR-Lab 可解析溯源要求。
- **进化式论文编辑 + 同模型自评 reward**（M18）：评审者=作者同模型，reward hacking 面；FAR-Lab rank 的评审必须与生成解耦。
- **pickle 全对象检查点**（M31）：脆弱；FAR-Lab `.control/` 显式状态机已更强。
- **静默降级路径**（M8）与**死配置**（lit-review-backend、默认关闭的修订回环 M12）：作为反面教材记档，不移植。
- **版本差异**：上游新版（agentlab/ 包、显式 hypothesis 生成 phase、mle-bench）不在本快照，本报告未覆盖——如需新版机制（例如新版 novelty 检索查重）需另行提取，如实标注 UNVERIFIED。
