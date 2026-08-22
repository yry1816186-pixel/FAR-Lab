# 研究计划设计重构方案 v2 —— 工程级总计划（2026-08-22）

v1→v2 升格：v1 是优先级清单；v2 是**六层协议栈工程规格**。新增四层（形式语义层、LLM 诱导协议、自校准环、谓词形式验证）来自 wave-s-reports/d1..d4（一手核验）；v1 的三主轴（结构化预注册/证据晋升漏斗/RR 冻结）保留并归位到层中。

依据：`research/wave-s-reports/s1..s6`（方法论）+ `d1..d4`(形式化/深度) + `WAVE-S-SCOUT.md`（勘误记录）+ 主 Agent 对 plan.ts/plan 阶段/EEL 层的代码审计。

## 0. 诊断（v2 补齐的四块）

v1 之后仍缺：① **可计算推断语义**（claim-假设图只有逐对标签，无聚合代数）；② **自我校准闭环**（系统对自己的前向预测从不打分——技术含量最高缺口，且 **AI 科研系统无已验证先例**，差异化真实）；③ **决策规则形式验证**（谓词冲突/不可达无机器检查——决策表 V&V 文献证明多项式可判，不需 SAT）；④ **科学推理内核**（LBD/Swanson、生成时新颖性、因果发现护栏）未覆盖。

## 1. 总架构：六层协议栈

```
L5 产品面      信任面（证据体评级/校准曲线/α账本）· B4 adversarial_review · 版本对比 · 导出
L4 自校准环    PredictionLedger → RPS/Brier 结分 → 分层校准 → Cooke 权重反馈   ★新
L3 LLM 诱导协议 分布化评级 · 锚定抽取 · 修复回路 · seeded rng                  ★新
L2 确定性门链   14 道门（§3 全规格：谓词区间检查→预测冲突矩阵→正交晋升→…→冻结审计）★扩
L1 形式语义层   LR 区间代数 · ΣlogLR · QBAF 渐进语义 · Carneades 证明标准     ★新
L0 域模型      zod schema（结构化预注册 = v1 主轴一，全字段见 §3-g7）
```

原则不变：LLM 只做语义判断；聚合/推断/裁决全部确定性或显式概率计算；zod-only；科学诚实（不确定性不得被呈现抹除）。

## 2. L1 形式语义层（d1）

**2a. log-LR 确认代数**【文献实据：Zlotnick 1972 命题级 LR 先例；Kent 1964 + Mosteller & Youtz 1990 证明词→点值不可行必须区间；Jeffreys 1961 / Kass & Raftery 1995 分带与 GRADE 4 级同构】
- `relation × certaintyLevel → LR 区间` 配置表（zod 常量，Fitelson 1999 度量敏感性→锁定 LR 族并披露为约定）
- 假设级累积：`ΣlogLR` + **独立来源封顶**（防证据相关性双计——来源去重上限）
- 词桥必须区间：`supports+high → [8,32]` 类；聚合用**对数池**（externally Bayesian，与 LR 连乘同构）；零概率 +ε 平滑（显式 config）；extremization 仅在校准 γ 存在时启用
- <300 行 TS；LR 度量族与聚合约定进导出披露

**2b. QBAF 渐进语义 + Carneades 证明标准**【文献实据：Cayrol-Lagasquie-Schiex BAF；Potyka KR2020 渐进语义=唯一不动点、多项式，有真实系统先例；Gordon-Prakken-Walton AIJ 2007 四档证明标准】
- claim 图建模为 QBAF：base score=GRADE 分布期望，support/attack 边权=LR 区间中点（对数域），不动点迭代聚合（多项式）
- 假设成立的证明标准四档（scintilla→preponderance→clear→beyond）：纯 TS 阈值谓词，进 hypothesis 状态字段
- **不引入**：preferred 扩展语义（NP-complete/Π₂ᴰ，扩展选择任意）；可废止逻辑独立栈；MDL/AIC/BIC 简单性排序（前提缺失+实证批评，d1 §3）

**2c. 分布化评级（二阶不确定性）**：GRADE 评级从单 enum → **4 级概率分布**（LLM 输出分布，期望/熵确定性计算）；评级者间一致性随证据复杂度下降的文献实据 → 熵进披露。Cooke 经典模型：50–100 条人工金标 claim 对作 seed 集测裁决器 calibration 产权重（Eggstaff 2014：性能权重稳定优于等权）——与 L4 联动。

## 3. L2 确定性门链（14 道，含 v1 三主轴归位）

执行顺序 = 计划生命周期；全部纯 TS/zod。

| # | 门 | 算法要点 | 优先级 |
|---|---|---|---|
| g1 | **结构化预注册校验**（v1 主轴一） | MetricSpec/TestSpec/谓词判据/预测{observable,condition,expectedRelation}/VOI 块/gate{proceedIf,killIf}/negative_control+replication 四分类/targetTrial 七要素/measurable+estimand+control_run | **P0** |
| g2 | **谓词一致性区间检查**（d4） | 每规则→δ/p 原子**区间求交**：空=不可达（硬错误）；success∩falsification 交叠=冲突（警告）；方向-阈值矛盾=硬错误；outcome 网格枚举查覆盖缺口；hitPolicy 消歧【决策表 V&V：Vanthienen/Prologa/DMN 先例，多项式免 SAT】 | P1 |
| g3 | **预测冲突矩阵**（Platt/Chamberlin） | 同 (observable,condition) 异 expectedRelation 才算真竞争假设；假设集两两不互斥→警报；每被判别假设须 ≥1 outcome→消除映射否则 "non-crucial" 警报 | P0（随 g1） |
| g4 | **框架声明门**（d4） | TestSpec 加 `interpretation: 'np_test'|'estimation_ci'|'bayesian'`；贝叶斯必须声明校准策略；禁跨框架原子合取；e_value(POPPER) 与 E-value(敏感度) 词汇辨注 | P2 |
| g5 | **MDE 硬门**（s2） | hypothesis-bound comparison 在 spec 时预计算 nTest→MDE；无声明→INVALID（探索性 run 保持咨询位） | P1 |
| g6 | **多重检验门**（已有 POPPER） | 维持 + 跨版本重检账本（同 hypothesisId 重跑计入 α 消耗，VersionDiff 展示） | P1 扩 |
| g7 | **正交晋升**（s2/s3） | 判 supports 需 ≥2 正交轴（数据集族/模型类/split 制度）；不足→显式降级 single_source；dummy 基线+leakage 反筛入 spec 校验 | **P1** |
| g8 | **证据体评级**（s3/d1） | hypothesis 级：floor(关键 claim 分布下界) + 独立来源数 + worst-domain RoB + ΣlogLR + QBAF 不动点 + Carneades 档位；SoF 脚注表 | P1 |
| g9 | **ACH 诊断性+移除敏感性**（s3） | 诊断性=claim 关系分布均匀度（确定性）；移除 top-k 诊断 claim 重跑 rank 报排序稳定性；bootstrap 头部稳定性（d3 §4） | P1 |
| g10 | **PB 分数因子筛选**（s2） | matrix.ts >24 cells 触发筛选档，两段式筛→确认，混淆披露 | P1 |
| g11 | **数值白名单**（s5） | VerifiedRegistry：报告/导出中数值必须解析到实验出处（zod 可移植）；verifier_wrote_list 记账；对照自动派生 | P1 |
| g12 | **因果发现护栏**（d4） | sidecar 跑 PC-stable/GES（causal-learn，MIT 子代理核验）+边 bootstrap 稳定性；强制报告 {algorithm,alpha,standardized,edgeBootstrapStability}；CPDAG 无向边禁渲染因果箭头；产物只作 confounder 候选进 ACH | P2 |
| g13 | **冻结审计**（s6 RR） | planHash/frozenAt + Deviation 一等对象 + 导出依从核对；AsPredicted-8 完备门 + NeurIPS-16 清单对象 | P1 |
| g14 | **导出完整性** | 数值白名单覆盖导出物 + SWAN/RO-Crate + 校准摘要（L4） | P1 |

## 4. L3 LLM 诱导协议（可靠性层）

- **分布化诱导**：GRADE/关系裁决输出概率分布而非单值（2c）；锚定 locator（来源+位置）强制
- **类比卡纪律**（s1）：transplant 算子须 ≥2 映射关系 + 非空 disanalogies，否则拒绝该候选
- **生成时新颖性条件**（d2，SciMON ACL 2024 先例）：新颖性从事后裁决前移为生成时条件（近邻摘要进 prompt 负向条件——已有 negative conditioning 的强化位）
- **多样性确定性披露**（d2，Si et al. ICLR 2025 同质化实证）：strategyCoverage/gapCoverage（枚举分布）+ TF-IDF 池内成对分散度（复用 judge v2.1 基建）——披露不进总分
- **修复回路**：vercel/ai 修复回路 + 纠正性重问（已有）继续承担 schema 违例；分布输出的归一化/熵上限确定性校验
- seeded rng 纪律维持（jitter/采样/温度全注种）

## 5. L4 自校准环（d3 —— 本方案技术制高点）

**PredictionLedger**：系统每一类前向预测上账——

```ts
LedgerEntry = { kind: 'expected_relation'|'voi_separation'|'rank_order'|'judge_verdict'|'grade_certainty',
                stage, predictor: {model, judge, votes}, assertion, contextDigest,
                settledAt?, outcome?, scores?: {rps, brier, log_clamped} }
```

- **结分时机**：EEL 裁决落地 / 反馈到达 / 超时→void 留痕（不得静默删）
- **主评分规则 = RPS**（EEL 裁决是 4 有序类 supports/inconclusive/weakens/falsifies——RPS 唯一计入类间距离的 proper rule）+ Brier 与 clamp log 双记（log 罚极端自信、Brier 罚中段偏移）；Murphy 1973 分解校准/判别力【文献实据：Gneiting & Raftery 2007】
- **基线锚**（必须随结分附上）：ignorance 基线（类先验）+ base-rate 基线 + skill score；judge 票与等权中位数聚合票**双记**检验"聚合>个体"【锚点实据：专家预测复制 71–73%（Dreber 2015 PNAS）；Metaculus 社区 Brier 0.207 vs 无知 0.25；ForecastBench 超级预报员 0.093】
- **分层报告**：judge × model × stage；等频 5 箱；单 run **不画曲线**；跨 run 池化；n<30 → "insufficient evidence"（小样本校准的诚实纪律：ECE 估计量偏置文献实据）
- **反馈闭环**：结分数据 → Cooke 性能权重（2c seed 集）→ 裁决器权重更新；低于无知基线**如实展示**
- **排序评估**：bootstrap 头部稳定性 + 预测性效度（top vs bottom 四分位 EEL 支持率差 + Wilson CI）
- **差异化表述纪律**：先例检索未发现 AI 科研系统带跨 run 自我预测台账+分层校准——表述用 "no verified precedent found"，不吹"全球首个"
- 不做：单 run 曲线、模拟市场机制、承诺自动去偏（反馈去偏实证温和且条件依赖）、VOI 连续量 CRPS

## 6. 阶段 × 新能力映射

| 阶段 | 新增 |
|---|---|
| scope/align | question framework 槽位 + FINER 交叉检查（s1） |
| retrieve | OpenAlex topics+referenced_works 补字段→analogyDistance 标签（d2：真实实验室 98% 类比是域内→默认域内路由、跨域显式触发）；FIRE-Bench 时间切片蒙版（establishedYear+日期过滤，<100 行） |
| hypotheses | 生成时新颖性条件 + 多样性披露（§4）；ResearchGap→策略路由（s1）；bridge_completion 算子（d2：池内 A/C 簇共享实体/引用→B 候选，确定性预筛+LLM 合成——Arrowsmith 机制池内化） |
| evidence | per-source RoB 信号问答+worst-domain 聚合（s3）；ScreeningLedger（PRISMA-shaped，P2） |
| falsify | L1 代数进反证（ΣlogLR 负向流）；因果发现 confounder 候选（g12） |
| rank | ACH 诊断性+移除敏感性（g9）；排序预测上账（L4） |
| **plan** | g1-g4（P0/P1 核心）；目标试验协议；冻结三件套（g13） |
| execute/EEL | g5/g6/g7/g10/g11/g12；specificationMatrix+规格曲线（描述层）；E-value 节 |
| feedback/revise | 跨版本 α 账本；PredictionLedger 结分 |
| guard/verify/export | g13/g14；校准摘要进导出 |
| 产品（PEX） | 信任面渲染证据体评级/正交性降级/校准曲线/α 账本；B4 adversarial_review 动作族 |

## 7. 指标体系（每子系统的成功判据）

- 计划质量：g1 违例率趋零；谓词冲突检出率（注入故障测试）；计划-执行依从率（偏离对象数/run）
- 证据层：ΣlogLR 与 EEL 裁决一致性；证据体评级 vs 实验结果的分辨力（AUC 型）
- **校准**：分层 RPS skill score > 0（优于无知基线）随 run 数单调改善；聚合票 ≥ 个体票
- 排序：top vs bottom 四分位支持率差的 CI 不含 0（预测性效度）
- 假设层：多样性披露指标不回退；新颖性裁决 precision 抽检
- 全部指标走 W9 统计层（播种 bootstrap/Wilson），不新造统计

## 8. 工程路线图

- **P0 批**（载体）：g1+g3 结构化预注册 schema+校验器 → 测试（含谓词注入故障）
- **P1 批**：L1 形式语义层（LR 表+ΣlogLR+QBAF+Carneades）→ g2 谓词区间检查 → g7 正交晋升 → g8/g9 证据体+ACH → g13 冻结三件套 → L4 PredictionLedger 最小环（RPS+基线锚+池化报告）→ EEL 侧 g5/g10/g11
- **P2 批**：g4 框架声明、g12 因果发现、ScreeningLedger、MetaAggregate、阴性对照模板、Cooke 权重闭环、B4 对抗复审、产品面渲染
- 迁移：全部新字段 optional 起步 + 旧数据幂等 migration（step_outputs 先例）；门先警告后硬失败（一个版本周期）
- 测试策略：每门配注入故障测试（构造违例计划必须被检出）；L1 代数配 oracle 数值用例；L4 配 seeded replay
- 车道纪律：EEL 侧改动走 EEL 会话车道；plan/rank/evidence 走主车道；提交 explicit pathspec

## 9. 技术差异化叙事（竞赛技术深度 30%）

可辩护的第一梯队特性：① 自我预测台账+分层校准闭环（no verified precedent found）；② 命题级 log-LR 形式语义 + QBAF/Carneades 可计算论证层；③ 决策谓词区间 V&V（免 SAT 多项式）；④ 数值白名单端到端（实验→报告→导出）；⑤ RR 冻结+偏离审计的完整 stage-1/2 形态；⑥ 正交证据晋升漏斗。全部为确定性代码可验证——"verifiable science protocol engine" 而非 prompt 工程。

## 10. 不做清单（合并，含理由）

发表偏倚统计诊断（前提不满足）；MDL/AIC/BIC 简单性排序；preferred AF 语义（NP-complete）；可废止逻辑栈；D/A/E 最优设计求解器；假设层 bandit；SCA 推断统计量；实物期权数值定价（无货币效用尺度=假精度）；SMT solver；NOTEARS（var-sortability 批评链）；SemMedDB/UMLS（许可+域限+错误率）；SPECTER2 本地（违模型多源 API 架构）；TRIZ；pre-mortem schema 化；ISA-Tab；单 run 校准曲线；自动去偏承诺；23 阶段流水线。

## 11. 证据链

`wave-s-reports/s1..s6`（方法论六路）、`d1-formal-inference.md`、`d2-lbd-generation.md`、`d3-calibration-loop.md`、`d4-formal-verification.md`（深度四路）；`WAVE-S-SCOUT.md`（勘误+质量门+UNVERIFIED 清单）；现状锚点 plan.ts/plan 阶段/EEL 层。UNVERIFIED 项：RegCheck/arXiv 2508.11847/RSOS 2026:250377 等支撑性引用未全文复核；causal-learn MIT 为子代理直链核验。
