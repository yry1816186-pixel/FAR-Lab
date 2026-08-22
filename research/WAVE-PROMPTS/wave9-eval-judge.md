# Wave-9 最高执行指令 · 评估科学与 Judge 校准源码远征

> 使用方式：整份作为 /goal 交给新窗口。共同基线见 `research/WAVE-PROMPTS/_COMMON-BASELINE.md`（粘贴时一并带上）。

## 〇、接续点

**开启 Wave-9：高并发子 Agent 深读评估框架与 LLM-judge 校准研究代码源码。FAR-Lab 评估现状的已知短板（先读证据防重）：复现评估判分步骤方差 ±0.5（D-029，加固为缓延项）；MLR-Bench N=5 未校准 judge；EV1 judge ±1-2 分 seed 方差已量化；3-seed 研究诚实无宣称。本 Wave 找开源的 judge 协议、方差消减、统计检验、评估任务构造、回归门禁机制，把 FAR-Lab 的评估从"诚实但粗糙"升级到"诚实且统计可信"。**

## 一、对象清单（起点；核实许可，主动扩充）

| 系统 | 线索 | 重点 |
|---|---|---|
| UKAI-Safety-Institute/inspect_ai | MIT 核实 | 任务/评分器抽象、solver 链、评估协议与重试、多模型对照 |
| promptfoo | MIT 核实 | 断言体系、红队插件、回归视图、CI 集成 |
| EleutherAI/lm-evaluation-harness | MIT 核实 | 任务规范格式、指标聚合、少样本管理 |
| confident-ai/deepeval | 核实 | LLM-judge 指标定义、g-eval 模式、可靠性研究 |
| open-compass | 核实 | 大规模评测编排与脏活（数据泄漏检测等） |
| judge 校准研究代码（JudgeBench/免训练校准/position-bias 消减/Bradley-Terry+anchor 的开源实现；含 Wave-4 SCOUT 若已产出相关发现则接续） | 核实 | swap/order 控制、anchor 设计、κ-vs-human、方差消减（bootstrap/多遍中位） |
| 同类主动扩充 | EvalPlus 类严格核对器、any Such eval harness | 同维度解剖 |

## 二、本 Wave 特有警戒
- 评估属于辅助面：融合上限是"评估基础设施"，不得反向污染生产主路径的简单性。
- 判分统计方法（bootstrap CI、多遍中位、显著性检验）必须**确定性可复现**（固定 seed、记录每次判分明细）——先修 D-029 方差问题再扩新基准。
- HF 托管数据集本环境不可达：选型必须确认数据可经非 HF 渠道获取，否则如实 BLOCKED。

## 三、维度侧重（维度体系 v2 编号）
重点组：**J1/J2（评估体系与自我改进）**、**G4/G5（完成判定与可观测）**、**I4（结构化评分输出）**；产出必须包含"FAR-Lab 评估矩阵升级方案"（确定性指标 / judge 指标 / 统计层 三级）。

## 四、开场序列
| 步 | 动作 | DoD |
|---|---|---|
| 1 | 基线恢复序；status→IN_PROGRESS，phase=wave9-eval-judge | 控制面一致 |
| 2 | 并发分发调研（每框架一个 + 横切：judge 方差消减/统计检验 两线） | 机制清单带 file:line |
| 3 | shortlist → `research/WAVE9-SCOUT.md`（含评估矩阵升级方案） | 排序+决策 feed |
| 4 | 融合计划 + DECISIONS（先修 D-029 加固，再扩新能力） | 理由落盘 |
| 5 | 执行：判分加固复测（同 run 重判方差目标 <0.15 任务级 F1）+ 新评估件 + 对抗审计 | 证据落 evidence/W9/ |
| 6 | 收口（基线 DoD 全项） | 三处一致，提交成功 |

## 五、本 Wave 量化野心（北极星映射）
- 直接负责：rediscovery-judge-variance（±0.5 → <0.15 / stretch <0.08，多遍中位+固定分解协议实测）；counter-evidence-substantive-hit 指标定义与历史回填。
- 准入线：新评估件必须自带判别力证明（好坏样本可分，AUC/分离度量化）；统计方法确定性可复现（同 seed 同结果）。
- 建成后北极星账本整体获得可信测量层——后续所有 Wave 的达标宣称都经它复核。
