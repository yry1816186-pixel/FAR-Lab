# Wave-5 最高执行指令 · 科学 AI 系统源码远征（AI Scientist 家族全文解剖）

> 使用方式：整份作为 /goal 交给新窗口。共同基线见 `research/WAVE-PROMPTS/_COMMON-BASELINE.md`（粘贴时一并带上）。

## 〇、接续点

**开启 Wave-5：高并发子 Agent 深读"自动化科学发现系统"全部可得源码——这是与 FAR-Lab 同域、期望值最高的外源类别。源码级解剖其 端到端流水线/文献接入/假说生成与筛选/实验规划/评审与迭代/写作与复现 机制，交叉比对后制定融合计划，源码级融入 FAR-Lab Direction-A 权威路径。先读基线与注册表防重复（Robin 锦标赛已 EXTRACT D-016；MLR-Bench 已克隆评估；POPPER 已 paper-EXTRACT D-025；AI-Scientist v1 机制曾入拒绝表——本 Wave 用源码级视角重访，以新证据为准）。**

## 一、对象清单（起点；名称/许可/存在性均须现场核实，找不到如实记录并跳过，主动扩充同类）

| 系统 | 线索（须核实） | 重点 |
|---|---|---|
| SakanaAI/AI-Scientist v1 | NOASSERTION 许可（**只学机制与工程结构，prompt 文本/代码不可复制**——注册表 C 既有边界） | 端到端 stages、成本核算、自动评审 |
| SakanaAI/AI-Scientist-v2 | 同上边界 | workshop 式多 agent 树、进度感知调度 |
| Future-House/paper-qa（PaperQA2） | MIT（核实） | **引用锚定答案**：引用段落级检索、上下文预算、answer-with-citations——与 FAR-Lab fail-closed grounding 直接同构 |
| Future-House/aviary | paper-qa 的 agent 框架（核实） | 可复现环境抽象、工具 schema |
| Future-House/robin | Apache-2.0（已 EXTRACT 锦标赛） | 深挖未取部分：wet-lab 验证循环的接口设计、假设表示格式 |
| SamuelSchmidgall/Agent Laboratory | 核实 | 人机协同科研工作流、review/revise 循环 |
| AllenAI/OpenScholar | 核实 | 科学文献开放助手：检索/综合/引用的数据流 |
| chchenhui/mlrbench | MIT，**已克隆于 .cache/repos/mlrbench** | 深挖未取部分：judge prompt 工程、任务构造、rubric 演化 |
| co-scientist 开源复现（如 Kaimen 等，核实存在与许可） | Google co-scientist 无官方码 | generate-debate-evolve 的**可复用子机制**（注意注册表 C：整机制因 Elo 翻转被拒，只取子机制） |
| 同类主动扩充 | AiREX / LaMa / SciAgents / BioDiscoveryAgent / ChemCrow(工具面) / Automind / 任何调研中发现的同域系统 | 同维度解剖 |

## 二、本 Wave 特有警戒
- **同域陷阱**：这些系统与 FAR-Lab 最像，最容易整块照搬——灵魂边界最需守住：假说/证据/证伪/计划/修订/溯源的**语义**必须 FAR-Lab 原创，只融合其**工程机制**（调度、预算、表示格式、评审协议、成本核算）。
- AI-Scientist 系许可为 NOASSERTION：机制与架构可学并重写，逐字 prompt/代码不可复制；PaperQA2/robin 为宽松许可可深度取用（保留 attribution）。
- 实验执行类机制（v2 的代码执行树）属 Direction-B 支撑面——只作为 testability/feedback 适配器接口设计参考，不得改变 Direction-A 核心。

## 三、维度侧重（沿用 HANDOFF_PROMPT.md 维度体系 v2 的编号）
重点组：**C4/C5（证据段落级锚定与引用呈现）**、**D2-D5（多假设流水线、评审-修订循环、调度）**、**B5/B6（科学文献上下文的预算与保真）**、**J1/J2（它们如何评估自己、如何从评审迭代）**；其余组按普查深度覆盖。每仓 1 个普查子 Agent + 高价值组深钻子 Agent；主 Agent 抽验 file:line。

## 四、开场序列
| 步 | 动作 | DoD |
|---|---|---|
| 1 | 基线恢复序；status→IN_PROGRESS，phase=wave5-ai-scientist-systems | 控制面一致 |
| 2 | 并发分发：每仓普查（含许可核实）+ 跨仓对比（谁的同域机制最强） | 机制清单（模板见维度体系） |
| 3 | shortlist + license/spike → `research/WAVE5-SCOUT.md`（沿用 WAVE3-SCOUT 体例） | 排序+触发测量+决策 feed |
| 4 | 融合计划（对照 Marginal Value Gate + 灵魂边界逐项审查） | DECISIONS 记录排序理由 |
| 5 | 执行融合（源码级+测试+benchmark before/after+对抗审计） | 证据落 evidence/W5A/ |
| 6 | 收口（基线 DoD 全项） | 三处一致，提交成功 |

## 五、本 Wave 量化野心（北极星映射，eval/north-star.json）
- 融合准入线：对映射指标带来 >=5% 可测提升或消除一类已实证失败模式；零北极星回退。
- 直接负责：rediscovery-mean-f1（当前 0.58 → target 0.70 / stretch 0.80，>=4/5 任务 >=0.70）；relation-blind-agreement（0.61 → 0.80/0.90）。
- 间接拉动：mlr-bench-overall（idea 7.00 → 7.40/7.70）；counter-evidence-substantive-hit（先定义后 >=0.70）。
- 收口前更新账本 current 值（命令级证据）；只达 baseline 如实记录差距原因。
