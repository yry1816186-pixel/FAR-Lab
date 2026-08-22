# S4 分析稳健性与推断纪律（可重复性危机后的方法论遗产）— 尽调报告

日期：2026-08-22。方法：只读 Web 调研，逐条核实一手来源（作者/年份/期刊，PubMed/CRAN/DOI 可核验）。
基线（delta 参照）：FAR-Lab 已吸收 POPPER（单 primary / alpha-spending / e-value 三档）、W9 统计层（播种 bootstrap CI / 精确置换 / Wilson / kappa / BH / MDE 门）、预注册机械裁决（禁 LLM 判）、Robin 锦标赛；EEL 同 seed 同输出铁律。
标注约定：**文献实据** = 一手来源可直接核验的机制；**映射提案** = 我方将其落到 FAR-Lab 的方式（非文献主张）。

## 0. 任务描述中的引用勘误（诚实声明，文献实据）

- SCA 2020 的作者是 **Simonsohn, Simmons & Nelson**（不是"Simonsohn/Simonsohn/Nosek"）。
- Hernán & Taubman 的目标试验原型论文是 **2008** 年（不是 2012）；"七要素"系统化来自 Hernán & Robins 2016 AJE。
- **"van't Veen & Hartgerink 2021" 未能核实为一篇真实存在的论文**（多渠道检索为空）。本文第 6 项改用可核验的替代文献（Claesen 2021 RSOS 等），不编造该引用。

---

## 1. Specification curve / multiverse 分析

**① 一手来源（文献实据）**
- Simonsohn U, Simmons JP, Nelson LD. Specification curve analysis. *Nature Human Behaviour*, 2020;4(11):1208–1214。
- Steegen S, Tuerlinckx F, Gelman A, Vanpaemel W. Increasing transparency through a multiverse analysis. *Perspectives on Psychological Science*, 2016;11(5):702–712. doi:10.1177/1745691616658637。
- 争议注记：SCA 的跨规格推断统计量被指可致偏与假阳性（*JRSS Series C* 2022;71(5):1330 起的 well-being 再分析，作者未独立核验）。

**② 机制（文献实据）**：同一研究问题下存在多个"同样合理"的分析规格（变量集/预处理/模型/划分等研究者自由度）；显式枚举全部规格并报告结果如何随规格变化（规格曲线），把选择性报告的隐性自由度变成可审计的显性矩阵。SCA 在描述层之上提出三种跨规格推断统计量；multiverse 强调透明而非替代主检验。

**③ 升级建议（映射提案）**
- 落点 1（ExperimentSpec schema）：新增可选 `specificationMatrix`：每个分析自由度维度（特征集 / 模型族 / 预处理 / 划分与编码）预注册枚举值，显式展开为笛卡尔积规格清单，**预注册后不可增删**（同 seed 铁律逐格继承）；其中一格标注为 POPPER 主规格。
- 落点 2（StatReport 聚合层）：`SpecificationCurveReport`：各规格效应量+机械裁决的排序曲线、中位数/分位数、与主规格同向的规格比例。**只做描述层，不引入 SCA 推断统计量**（争议注记 + 预注册裁决原则：主规格裁决唯一，多规格仅作 robustness 证据节）。
- 优先级：**P1**（高价值，纯确定性代码，无新依赖）。触发：假设声明含稳健性/泛化断言，或计划内同一检验存在 ≥2 个合理分析自由度。

**④ delta**：POPPER 单 primary 已吸收；新增的是"规格矩阵预注册 + 曲线聚合报告"这一显式化载体，EEL 目前无任何多规格结构。

---

## 2. E-value 未测混杂敏感度

**① 一手来源（文献实据）**：VanderWeele TJ, Ding P. Sensitivity analysis in observational research: introducing the E-value. *Annals of Internal Medicine*, 2017;167(4):268–274. doi:10.7326/M17-1485。工具侧：R 包 **tipr**（Tipping Point Analyses）v1.0.2，CRAN，作者 Lucy D'Agostino McGowan（MIT license），基于 VanderWeele & Ding 2017 / Ding & VanderWeele 2016 的 tipping-point 系。

**② 机制（文献实据）**：E-value = 未测混杂要与暴露**和**结局同时具备的最小关联强度（RR 尺度），才能把观察到的效应完全解释掉；点估计公式 E = RR + √(RR(RR−1))，CI 近零界另有对应式。它把"会不会有混杂"变成一个可报告的数字门槛。

**③ 升级建议（映射提案）**：StatReport 新增 `confoundingSensitivity` 节：当分析框架标注为 observational（OpenML 等观察数据）时**必填**，机械计算 E-value + 一句固定警示文案（"因果解释需未测混杂关联强度 < E-value 才被动摇"）。≤20 行确定性代码。优先级：**P1**（实现成本最低的护栏）。触发：结论措辞含因果动词，或数据来源标记为观察性。非 RR 尺度需先变换（文档写明适用边界，越界标 UNKNOWN）。

**④ delta**：完全新增——POPPER 的 e-value 是**多重检验**语境（信念稳健性），与 VanderWeele 的 E-value（**混杂敏感度**）同名不同物，二者并存且都保留。

---

## 3. 阴性对照（结果 / 暴露）

**① 一手来源（文献实据）**：Lipsitch M, Tchetgen Tchetgen E, Cohen T. Negative controls: a tool for detecting confounding and bias in observational studies. *Epidemiology*, 2010;21(3)（PMID 20335814；页码未独立核验）。

**② 机制（文献实据）**：暴露阴性对照 = 已知与结局无关的伪暴露；结局阴性对照 = 已知与暴露无关的结局。阴性对照"检出阳性"即证明管线中存在混杂/选择偏倚/测量误差——偏倚的阳性检测器。

**③ 升级建议（映射提案）**：PlanStep.kind=experiment 增加子型 `negativeControl`（指定对照类型 outcome/exposure），其裁决绑定为主假设的**管线有效性前置门**：阴性对照触发 success 裁决 → 主假设证据自动降级并进入因果关联修订。适用边界直说：W9 精确置换检验已是弱化的"暴露阴性对照"（标签置换）；真正缺的是**结局阴性对照**模板（如：预测任务上挂一个与目标无关的锚定结局，任何规格若在它上"显著"即告污染）。优先级：**P2**（模板+门语义，收益依赖观察数据实验占比）。触发：observational 框架 + 因果性声明。

**④ delta**：置换/安慰剂检验已有（W9）；新增仅为显式模板与前置门语义。

---

## 4. Target trial emulation（目标试验模拟）

**① 一手来源（文献实据）**
- Hernán MA, Taubman SL. Does obesity shorten life? The importance of well-defined interventions to answer causal questions. *International Journal of Obesity*, 2008;32(Suppl 3)（PMID 18695657）——模糊"暴露"导致因果问题不可识别的原型论证。
- Hernán MA, Robins JM. Using big data to emulate a target trial when a randomized trial is not available. *American Journal of Epidemiology*, 2016;183(8):758–764. doi:10.1093/aje/kwv254——七要素协议：资格 / 治疗策略 / 分配方案 / 随访 / 结局 / 因果对比 / 分析。

**② 机制（文献实据）**：把观察数据的因果问题改写为"假如做 RCT 会怎样设计"的显式协议；七要素逐项对照后，时间零点、干预可操作性、竞争风险等不可识别问题暴露在计划期而非解释期。

**③ 升级建议（映射提案）**：ResearchPlan 新增可选 `targetTrialProtocol`（七字段结构）。**声明分级门（确定性校验）**：结论含干预性/因果性声明而无 targetTrialProtocol → 裁决层强制降级为"仅预测性证据"或 BLOCKED。对纯预测性基准声明**不适用，直说**：七要素中"治疗策略/分配"无对应物，强制填写反而制造噪音——故设为因果声明触发而非全局必填。优先级：**P1**（这是 OpenML 观察数据上最根本的框架防线）。触发：hypothesis 或 decisionRules 措辞含因果/干预语义。

**④ delta**：完全新增；与因果关联修订环（v0→v1）天然衔接：协议缺失正是修订环应自动捕捉的典型缺陷类别。

---

## 5. 序贯 / anytime-valid 推断

**① 一手来源（文献实据）**
- Howard SR, Ramdas A, McAuliffe J, Sekhon J. Time-uniform, nonparametric, nonasymptotic confidence sequences. *Annals of Statistics*, 2021;49(2):755–780. doi:10.1214/20-AOS1991（arXiv 2018）。
- mSPRT/always-valid p 值：Johari R, Koomen P, Pekelis L, Walsh D. Always valid inference: continuous monitoring of A/B tests. *Operations Research*, 2022;70(3). doi:10.1287/opre.2021.2135（arXiv 2015）。

**② 机制（文献实据）**：confidence sequences 在任意时刻/任意停止规则下保持时间一致覆盖，允许持续监测与可选停止而不 inflation；alpha-spending 是其更保守的固定日程替代；always-valid p 值由 mSPRT 混合似然比导出。

**③ 升级建议（映射提案）——结论：现有机制已够，不引入 CS 数值层（P2/defer）**
- EEL 是**预注册固定批**设计（固定划分、同 seed、一次性裁决），不存在计划内 interim look，CS 的适用前提（持续监测）不成立。
- 真正的风险在**反馈环**：v0→v1 修订后对同一假设重跑 = 隐性重复检验。现有 POPPER alpha-spending/e-value 三档已覆盖"多假设/多重看"的第一层；缺口只是**跨版本重检账本**：同一 hypothesisID 每次重跑计入 alpha-spending 预算并在版本 diff 中显式展示累计 α 消耗。这是流程门（确定性），不是新统计量。
- 触发重评的条件写明：若未来 EEL 支持流式/序贯跑批（计划内中途查看），届时升级为 confidence sequences——届时再引文献，现在不预建。

**④ delta**：统计层零新增；仅新增 hypothesisID 级重检计数语义。

---

## 6. 预注册完整度分类学 → ResearchPlan 结构化 schema

**① 一手来源（文献实据 + 勘误）**
- 原任务指定的 "van't Veen & Hartgerink 2021" **未能核实存在**，不作引用。
- 可核验替代：Claesen A, Gomes S, Tuerlinckx F, Vanpaemel W. Comparing dream to reality: an assessment of adherence of the first generation of preregistered studies. *Royal Society Open Science*, 2021（PMID 34729209；卷期未独立核验）——第一代预注册研究普遍缺分析细节、大量未披露偏差（162+ 引用）。
- 另见 2025 年 AMPPS 预注册完整度横断研究（SAGE 25152459251357568，作者未核，仅作线索）。

**② 机制（文献实据）**：预注册的价值 = 事前约束研究者自由度；**不可机械核对的预注册（自由文本）无法检测偏差，约等于没有预注册**。完整度判据集中在：假设、数据/样本、变量操作化、分析计划（指标→检验→阈值）、排除规则、推断标准——每项须具体到可复现。

**③ 升级建议（映射提案）— 全报告最高优先级 P0**
- ResearchPlan schema：metrics/statistics 自由字符串 → `MetricSpec{name, estimator, unit}` + `TestSpec{metric, test, alpha, sides, threshold}`；decisionRules 四判据（success/weakening/falsification/stop）→ 谓词表达式**必须指向既有 TestSpec**；每个 hypothesis 绑定 primary/secondary（对齐 POPPER）。
- 确定性校验器：有判据无检验、检验无指标、指标未绑定任何判据 → 计划 INVALID（LLM 生成计划时也只接受结构化对象，自由字符串退役为注释字段）。
- 新增 `robustnessPlan` 节（联动第 1/2/7 项：规格矩阵 / E-value / 阴性对照的槽位）。触发：立即——这是其余所有升级的载体；EEL 的 ExperimentSpec 已结构化，短板明确在上游 ResearchPlan。

**④ delta**：完全新增；与"预注册机械裁决"原则同构——把同一纪律从实验层上推到计划层。

---

## 7. 荟萃综合作为聚合输出（随机效应 + I² + 预测区间）

**① 一手来源（文献实据）**
- Riley RD, Higgins JPT, Deeks JJ. Interpretation of random effects meta-analyses. *BMJ*, 2011;342:d549。
- IntHout J, Ioannidis JPA, Rovers MM, Goeman JJ. Plea for routinely presenting prediction intervals in meta-analysis. *BMJ Open*, 2016;6(7):e010247。

**② 机制（文献实据）**：随机效应汇总只给"平均研究效应"；I² 量化异质性占比；**预测区间**回答"下一个同类研究的真实效应会落在哪里"——比 CI 更诚实的外推表述，这正是跨数据集泛化声明的正确语言。

**③ 升级建议（映射提案）**：StatReport 之上新增 `MetaAggregate` 层：多数据集/多规格矩阵跑完后，DerSimonian-Laird 随机效应 + I² + 95% 预测区间（Higgins–Thompson–Spiegelhalter 法），**k≥3 才计算，k<3 显式 UNKNOWN**；纯确定性代码，无 LLM。适用边界直说：数据集并非从"研究总体"独立抽样，故输出措辞降格为"跨数据集变异描述"，不做总体因果推断。优先级：**P1**（若多数据集矩阵已是主要运行形态）否则 P2。触发：同一 hypothesisID 在 ≥3 数据集/规格上各有 StatReport。

**④ delta**：完全新增——当前 StatReport 严格单规格/单数据集，无任何聚合层。

---

## 净结论

1. **结构性短板在上游而非统计层（P0）**：预注册完整度研究的核心教训是"自由文本预注册不可审计≈没预注册"。ResearchPlan 的 metrics/statistics/decisionRules 自由字符串 → 结构化"指标→检验→判据→假设"绑定 schema，是所有其它升级的载体，应最先做。
2. **EEL 侧最高性价比增量是两项纯确定性护栏（P1）**：计划内多规格矩阵 + 规格曲线聚合（把研究者自由度显性化，只作描述层、不动主规格裁决），与观察数据 E-value 警示节 + 因果声明的 target-trial 七要素协议门（给 OpenML 语境的因果语言装量化与框架防线）。
3. **序贯推断不需要新统计量（P2/defer）**：EEL 是固定批预注册设计，alpha-spending/e-value 三档已覆盖主风险；真实缺口只是"跨版本重检账本"（同一假设在反馈环中重跑须计入 α 消耗并在版本 diff 展示）——流程门而非统计升级；仅当未来支持流式跑批时再引入 confidence sequences。
