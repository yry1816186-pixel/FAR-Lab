# WAVE-S Scout — 科研方法论远征（2026-08-22）

**Mission**（用户指令）：调研高级好用的**真实科研 skill 与流程**，对计划设计（Direction-A 灵魂面）产生优化重构；对纯基建向的前两版方案不满。竞赛评分 40% 科学价值——本 Wave 直击该权重。

**Method**：6 路并行方法论尽调（问题/假设纪律、实验选择与设计、证据与偏倚、稳健性与分析、新 AI-for-science 系统、流程规范），每路：一手来源核验 → 机制提炼 → 贴真实代码的升级建议（标优先级/触发/delta/【文献实据】vs【映射提案】）。AI 系统走质量门（≥300★+论文/机构背书）。

**报告**：`research/wave-s-reports/s1-question-hypothesis.md` … `s6-process-standards.md`。**主交付物：`research/PLAN-DESIGN-RESTRUCTURE.md`（重构方案）**。

## 引用勘误记录（一手核验产物，防再错）

- SCA 2020 = Simonsohn, **Simmons** & Nelson（非 Simonsohn/Nosek）
- Target trial = Hernán & Taubman **2008**；七要素出自 Hernán & Robins 2016 AJE
- "van't Veen & Hartgerink 2021" 无法核实存在 → 改用 Claesen 2021 RSOS
- AsPredicted 现行 v2.00 为 **8 问**（"9 问"系旧版惯称，官方 PDF 已核验）
- Heuer ACH canonical 8 步（Wikipedia 现压缩为 7；以 Dhami 2019/SANS 为准）
- discoverybench = **allenai**/discoverybench（158★ 停更 14 月，门杀）；PaperBench = openai/**frontier-evals** 子目录（1287★ MIT，PASS）
- Curie = **Just-Curieous/Curie**（368★ Apache-2.0 停更 11 月→不作采纳，机制全记录）
- AutoResearchClaw = **aiming-lab**/AutoResearchClaw（~14.1k★，arXiv 2605.20025 真实；主 Agent 亲验 org/论文存在；作者 UNC 归属 UNVERIFIED）

## 质量门（AI-for-science 系统，API 实值）

| 仓 | license/stars | 裁定 |
|---|---|---|
| aiming-lab/AutoResearchClaw | MIT ~14.1k★ | PASS（整仓形态 REJECT：23 阶段；机制取用） |
| scientific-agent-skills | MIT 34.1k★ | PASS |
| openai/frontier-evals (PaperBench) | MIT 1287★ | PASS |
| google-research/era | Apache-2.0 314★ (Nature 2026) | PASS（豁免：论文背书） |
| scicode-bench / ScienceAgentBench | 221★/159★ | PASS（豁免：ICML'24 oral/ICLR'25） |
| Just-Curieous/Curie | Apache-2.0 368★ 停更11月 | 门杀（机制全记录） |
| allenai/discoverybench | ODC-By 158★ 停更14月 | 门杀（任务形式照记） |
| HKUDS/AI-Researcher / jataware/open-coscientist / HypoGenic | 无LICENSE/57★/128★停更 | 门杀 |

## 类别裁决矩阵（详见各报告）

| 类别 | 最重要发现 |
|---|---|
| s1 问题/假设 | Platt 结构化预测+冲突矩阵+实验消除映射；question framework 槽位；ResearchGap 实体→策略路由 |
| s2 实验设计 | **单数据集单比较即可判 supports = 最大科学性缺口**（正交证据晋升）；VOI 半结构化；PB 筛选；spec 时 MDE 硬门 |
| s3 证据/偏倚 | 双层 GRADE（claim 阶梯 + hypothesis 证据体评级）；per-source RoB；ACH 缺步 4-6（诊断性评分+移除敏感性）；**发表偏倚统计诊断如实判不适用** |
| s4 稳健性 | **P0：计划层自由文本预注册不可审计≈没预注册**（MetricSpec/TestSpec/谓词判据）；specificationMatrix+E-value+targetTrial |
| s5 AI 系统 | VerifiedRegistry 数值白名单（ADOPT）；measurable/estimand/control_run 三字段；生成侧无真增量 |
| s6 流程 | plan 冻结三件套（RR 形态）；AsPredicted-8/NeurIPS-16 双确定性门；B4 adversarial_review 动作族；pre-mortem 证据弱→只做 prompt |

## 深度批次（d1..d4，2026-08-22 第二批，主交付物升格为 PLAN-DESIGN-RESTRUCTURE.md v2 六层协议栈）

| 报告 | 地基结论 | 明确不引入 |
|---|---|---|
| d1-formal-inference | log-LR 确认代数（词→LR **区间**非点值，Kent 1964/Mosteller-Youtz 1990；Jeffreys/Kass-Raftery 分带≈GRADE）+ 对数池聚合 + QBAF 渐进语义（多项式不动点）+ Carneades 四档证明标准 + 评级分布化（二阶不确定性）+ Cooke seed 集权重 | preferred 语义（NP-complete/Π₂ᴰ）；MDL/AIC/BIC 简单性排序；imprecise probability 全套 |
| d2-lbd-generation | 生成时新颖性条件（SciMON）+ 多样性确定性披露（strategyCoverage/TF-IDF 分散度）；FIRE-Bench 时间切片蒙版（<100 行）+ bridge_completion（Arrowsmith 池内化）；OpenAlex topics/referenced_works 补字段→analogyDistance（Dunbar 98% 域内类比） | SemMedDB/UMLS（许可+域限+SemRep 27% 错误率）；SPECTER2 本地；TRIZ；LitLLM（系综述工具，种子假设纠正） |
| d3-calibration-loop | PredictionLedger：主分 RPS（4 有序类裁决，experiment.ts 核验）+Brier/clamp-log 双记；ignorance/base-rate 基线锚+skill score；分层等频池化，n<30 不下结论；judge 票 vs 聚合票双记；**AI 科研系统自校准台账 no verified precedent found**（差异化真实，克制表述） | 单 run 曲线；模拟市场；自动去偏承诺；VOI CRPS |
| d4-formal-verification | 谓词一致性=区间求交+outcome 网格（决策表 V&V 先例，多项式免 SAT）；框架声明门（np/estimation/bayesian 分轨）；因果发现只作假设生成（causal-learn MIT，PC-stable/GES+边 bootstrap，NOTEARS 拒）；E-value/阴性对照护栏 | 实物期权数值定价（无效用尺度=假精度）；SMT；NOTEARS；定量偏倚分析 |

**LBD 诚实锚点**：全史仅鱼油/雷诺一条被 RCT 部分确认（DiGiacomo 1989，仅原发性）；镁/偏头痛仅间接——Swanson 类案例作验收基准时 GT 必须携带限定语。

## UNVERIFIED 清单

Miles 2017 原始载体细节；M-B&K 框架内部维度；MDC 2000 出处；AutoResearchClaw 自报数字（+18.3% 等）与作者归属；co-scientist elicit 阶段全文细节；Curie 星数（主 Agent 未复核）；ICML checklist 原文未逐条核；d 批支撑性引用：RegCheck (arXiv 2601.13330)、arXiv 2508.11847、RSOS 2026:250377、Wiley ffo2.199 全文（403）未复核；causal-learn MIT 为子代理直链核验（主 Agent 未复核）。
