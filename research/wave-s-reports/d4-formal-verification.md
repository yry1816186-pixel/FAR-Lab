# D4 尞调：决策规则形式验证 + 推断框架一致性 + 因果发现适用性

日期 2026-08-22。只读调研，一手来源经 WebSearch 核验（未核到卷期页的只给 DOI/arXiv 号/稳定链接，不编造）。贴地文件：`src/pipeline/stages/plan.ts`（checkPlanExecutability:86、POPPER 门:126）、`src/domain/plan.ts`（multipleTestingPolicy:71、confounders:74、PlanStep.kind 含 simulation:8）、`src/domain/hypothesis.ts`（FalsificationSpec:40-57，confounders 为 string[]）、`src/domain/experiment.ts`（paired_bootstrap_ci/paired_t:181）。
标注：【文献实据】= 来源直接陈述；【映射提案】= 我的 FAR-Lab 落地建议。

---

## 1. 决策谓词一致性检查：可行算法与先例

**① 一手来源**
- Vanthienen et al., "Validation and verification of decision making rules", *Automatica*（ScienceDirect S0005109896001653）——决策表 V&V 奠基：completeness（漏规则）/consistency（冲突规则）/non-redundancy（被包含规则）三检查。
- Prologa 工具（KU Leuven，Vanthienen 博士工作延伸）：交互式构建+自动验证决策表（feb.kuleuven.be/prologa）。
- OMG DMN 决策表验证工具（CEUR-WS Vol-2420 paper DT11）——现代标准化复刻；DMN 的 **hit policy**（unique/first/priority/any）是"多规则同时命中怎么办"的官方语义。
- IBM ODM 一致性检查文档（ibm.com/docs ODM 9.0 "Consistency checking"）：同条件不同动作=冲突——工业级先例。
- Preregistration 侧先例：**RegCheck**（arXiv:2601.13330，prereg 与发表文本的结构化比对）；**Apéritif**（CHI 2022，UW，从脚手架化 prereg 自动生成分析代码——"计划即代码"路线）。COS prereg 指南提供"决策树模板"但无机器检查。

**② 机制要点**【文献实据】
- 决策表论的经典结论：当条件取值是**有限离散格或区间**时，completeness/consistency/redundancy 均可由区间求交/格枚举**多项式判定**，不需要 SAT/SMT。冲突=两规则条件区间相交且动作不同；不可达=单规则条件区间为空；冗余=一规则条件区间被另一包含且动作相同。DMN 用 hit policy 消解"冲突"与"多命中"的语义歧义。

**③ FAR-Lab 落点（伪码级）**【映射提案】
谓词化 decisionRules（Wave-S 提案）后，每个原子约束的都是**同一度量空间上的量**，用一维区间传播就够：

```
// 每条规则 → 对效应差 δ（或 metric m）与显著性的区间约束集合
type Atom = { v: 'delta'|'p'|'ciLow'|'kappa'|..., op: '>='|'<=' , k: number }
// 耦合（单调性，方向由 test side 决定）：side=greater 时 p<alpha ⇒ δ>0
// （解析式 d(alpha,n) 不必求，只用方向——这是 sound 的精化）

checkUnreachable(rule): I=(-∞,∞); for a of atoms: I=I∩interval(a)
  if I=∅ or I∩物理值域=∅ (如 accuracy δ∈[-1,1] 但要求 δ≥1.2) → UNREACHABLE
checkConflict(successRule, falsifyRule):
  I₁∩I₂≠∅（含显著性原子同向耦合后）→ 两谓词可同时为真 → CONFLICT
  // 诚实声明：把 p 与 δ 当独立变量是 outcome 空间的过近似，冲突判定是
  // "保守候选告警"；用单调耦合精化后单度量规则是一维精确判定
checkDirection(rule, testSpec): rule 要求 metric≥θ 但 test side='less' → DIRECTION_MISMATCH（纯符号检查，精确）
checkCompleteness(allRules): 网格枚举 outcome 空间 {δ 分桶}×{sig,nsig}×{n 桶}，
  未被任何规则覆盖的格 → GAP（"这个结果发生了计划没说怎么办"）
```
- 关键设计：规则集加 **hitPolicy: 'unique'|'priority'** 字段（DMN 先例）——多命中时是报错还是按优先级取一，语义显式化。
- 实现面：纯 TS/zod，无新依赖；复用 checkPlanExecutability 的 Diagnostics 通道。阈值-方向矛盾与不可达是硬错误（fail），success/falsification 交叠与 GAP 是警告（可由 multipleTestingNote 式字段显式豁免）。
- 优先级 **P1**（Wave-S 谓词化提案的直接配套；没有这个检查，谓词化只是换了个格式的自由文本）。

**④ delta 说明**：现状 decisionRule/supportCondition/falsificationCondition 全是 min(1) 字符串，机器只查"存在性"不查"语义"。Vanthienen/DMN 证明了区间判定在此类规则上够用——不需要引入 SMT solver（引入即过度工程）。Preregistration 文献（RegCheck/Apéritif）印证"结构化→可机检"是社区正在走的路，但尚无"决策规则内部一致性"的现成学术工具——我们是把决策表 V&V 移植到科研计划，属合理迁移而非追热点。

---

## 2. 混合推断框架一致性

**① 一手来源**
- FDA "Guidance for the Use of Bayesian Statistics in Medical Device Clinical Trials"（2010, fda.gov）："若 FDA 认为 Bayesian 设计的 type I error 过大，须修改设计或模型"——监管框架不豁免贝叶斯设计的错误率。
- FDA 2026 草案《Use of Bayesian Methodology in Clinical Trials of Drugs and Biological Products》（讨论见 arXiv:2601.14701 实务解读；Gelman blog 2026-01-15 评论）：**混合纪律 = 贝叶斯量可作构造机制，但决策阈值须经模拟校准到频率派错误率**；Berry Consultants 解读：复杂设计的校准阈值须靠临床试验模拟获得。
- Lovric (2020) "Conflicts in Bayesian Statistics Between Inference Based on Credible Intervals and Bayes Factors", *JMASM*——频率派 CI 与检验是**协调程序**（同结论），贝叶斯 credible interval 与 Bayes factor 可互相矛盾；即便单框架内部也会打架。
- Berger, Boukai & Wang (1997) "Unified Frequentist and Bayesian Testing of a Precise Hypothesis", *Statistical Science* 12(3)——条件频率派检验可与贝叶斯检验基本等价：和解存在但要求**显式选择条件化框架**。

**② 机制要点**【文献实据】
- 同一计划混用 NP 检验裁决（alpha-spending 保证的是跨检验族频率派错误率）与贝叶斯式表述（"有 95% 概率效应在区间内"），则**两套保证互不覆盖**：alpha-spending 的保证不延伸到贝叶斯陈述，后验概率陈述无任何频率派错误率背书。FDA 的工程解法是"贝叶斯构造+频率派校准"，且校准须靠模拟而非解析。

**③ FAR-Lab 落点**【映射提案】
- 现状词汇盘点：permutation/bootstrap_ci/wilson/kappa/mde_gate/alpha-spending/e-value **全是频率派/非参数**——当前无混合，风险是 LLM 在自由文本 decisionRule 里漏入贝叶斯措辞（"95% 概率 H₁ 为真"）而门不报。
- 最小纪律：谓词化 decisionRules/TestSpec 加 `interpretation: 'np_test' | 'estimation_ci' | 'bayesian'` 字段 + 确定性门两条：①凡 interpretation='bayesian' 的规则，计划必须声明 calibration 策略（FDA 式），否则 fail；②同一假设的 success 谓词不得跨框架混取原子（np_test 的 p<α 与 bayesian 的后验概率原子不得 AND 在一起）。纯枚举检查，无新依赖。
- 优先级 **P2**（当前词汇表单一，属前瞻性防漏；谓词化落地时应同步带上，单独做无紧迫性）。

**④ delta 说明**：s2 已引入贝叶斯实验设计并如实降级；本项补的是**解释层**纪律而非新方法。E-value 注意：我们 POPPER 词汇里的 e_value_accumulation（likelihoodist 错误率界）与 VanderWeele 敏感度 E-value（§5）**同名不同物**，词汇表加一行辨注释释防混淆。

---

## 3. 研究组合与实物期权（如实评估：过度工程）

**① 一手来源**
- Dixit & Pindyck (1994) *Investment under Uncertainty*, Princeton UP——实物期权数学基础（序贯不可逆投资+不确定性）。
- McGrath (1997) "A Real Options Logic for Initiating Technology Positioning Investments", *Academy of Management Review* 22(4):974–996；McGrath & Nerkar (2003) 药企 R&D 实证。
- Stage-Gate 组合管理（Cooper 系，stage-gate.com）：gate=投资决策点+kill 准则。

**② 机制要点**【文献实据】
- 实物期权推理=小额先行投资买入"后续追加投资的权利"，价值来自不确定性下的学习；McGrath 强调它是**投资逻辑**而非可对每个实验标价的定价公式；组合层才做价值最大化+预算约束。

**③ FAR-Lab 落点与判定**【映射提案】
- **不做数值实物期权定价**（净结论标记：过度工程）。理由：期权价值公式需要标定波动率/行权价/折现率——FAR-Lab 没有货币化效用尺度，任何数值都是假精度；这违反 Mission §7"不以呈现优化抹除不确定性"。
- 已有物更优：s2 的 VOI 半结构化块（decisionAtStake/ambiguitySource/discriminatingMetric）就是"下一个实验选什么"的决策论核心——信息价值（决策翻转期望）比期权价值（金融价值）**更贴科研语义**且可半确定性计算。Wave-S 已提案的 gate{proceedIf,killIf} 即 stage-gate 的 kill 准则，结构上等价已覆盖。
- 唯一增量（P3 一行级）：PlanStep 可加 `cheapestDiscriminatingFirst: boolean` 提示或排序注记（McGrath"限制下行成本"的定性残留），不建表不建求解器。
- 优先级 **P4/不做**（除上述一行注记外）。

---

## 4. 因果发现方法对 EEL 的适用性

**① 一手来源（批评链如实报）**
- Reisach, Seiler & Weichwald, "Beware of the Simulated DAG!", **NeurIPS 2021**（arXiv:2102.13647）：提出 var-sortability；**SortnRegress**（按边际方差排序+回归）在常见基准上追平/超过 NOTEARS；数据标准化后 NOTEARS 类性能**暴跌至随机以下**——连续优化法实为利用方差伪影。
- Kaiser & Sipos (2021) "Unsuitability of NOTEARS for Causal Graph Discovery"（causalens.com PDF，~107 引）：NOTEARS 对数据尺度敏感，即便等方差变换下也不稳。
- Reisach et al., NeurIPS 2023（R²-sortability）：标准化后仍有回归拟合伪影可被利用。
- Ng et al. (2024) "Structure Learning with Continuous Optimization: A Sober Look", PMLR v236（CLeaR）——平衡再评估：承认 var-sortability 批评成立，连续优化法在受控比较下优势有限。
- PC 侧：Colombo & Maathuis (2014) PC-stable, *JMLR* 15——PC 输出**依赖变量顺序**，PC-stable 修骨架阶段；Kummerfeld et al. (2023) Power Analysis for Causal Discovery（PMC11581182）——功效随 α/样本量变化，无先验功效分析则结论不可靠；Machlanski et al. (2024), PMLR v236——超参调优"决定 SOTA 与垃圾之差"，复现性是已知痛点。
- 许可核验：**causal-learn（py-why/causal-learn）= MIT License**（GitHub 仓库 LICENSE，2026-08-22 WebFetch 实核）；实现含 PC/GES（tests/TestPC.py、TestGES.py 可见）、约束类/评分类/函数因果模型类/Granger 家族。

**② 机制要点**【文献实据】
- 三类各有硬伤：连续优化（NOTEARS）——尺度敏感+基准伪影；约束类（PC）——α 单旋钮主导输出、默认无多重检验校正、顺序依赖（PC-stable 部分）；函数因果模型（LiNGAM）——依赖非高斯线性假设。共性：输出对超参与数据预处理高度敏感，边稳定性须靠 bootstrap 复评。

**③ FAR-Lab 落点**【映射提案】
- **可行且对路**：EEL 本就是 OpenML 表格数据 + Python sidecar（lockfile 隔离），PlanStep.kind='simulation' 已存在——causal-learn（MIT）进 sidecar 无架构障碍。
- 关键定位：因果发现输出**只作假设生成证据，永不当验证证据**——这恰是 Track Direction-A 核心（科学假设生成）的正宗用法，且批评文献给了我们护栏义务：
  - 强制报告字段（PlanStep 输出 schema）：`{algorithm, alpha_or_penalty, standardized: boolean, edgeBootstrapStability: number[]}`——var-sortability 教训（是否标准化必须显式）+ PC 敏感性教训（α 必须显式）+ 复现性教训（边 bootstrap 稳定性必给）。缺任一项 → 该 PlanStep 结果标 `UNVERIFIED`。
  - **confounders 字段结构化升级**：`string[]` → `{variable, role: 'confounder'|'mediator'|'proxy'|'collider', source: 'causal_discovery'|'literature'|'analyst', algorithm?, stability?}[]`——发现图只产生 `source:'causal_discovery'` 的候选行，进 ACH 反证层参与 alternativeExplanations 交叉比对，不自动升格。
  - CPDAG 的无向边如实呈现为"方向未定"，不得渲染成因果箭头（呈现层纪律）。
- 优先级 **P2**（真实增益：假设层的结构化候选生成；但排在谓词化门之后，因其价值依赖假设/反证层先结构化）。

**④ delta 说明**：s3/s5 未覆盖因果发现。净新增=「可执行性可行 + 许可干净 + 批评文献护栏三条 + confounders 结构化 schema」。NOTEARS 类**默认不引入**（批评最重），首选 PC(-stable)+bootstrap 边稳定性与 GES，均 causal-learn 内置。

---

## 5. 观察数据声明护栏先例（一句话级）

- **E-value 敏感度**（VanderWeele & Ding 2017, *Ann Intern Med* 167(4):268–274）：最小未测混杂强度使观察效应归零的闭式下界——**确定性可算**，最适合我方 EEL 表格实验复用【文献实据】。
- **阴性对照暴露/结局**（Lipsitch, Tchetgen Tchetgen & Cohen 2010, Harvard DASH 收录）：预期无真效应的暴露/结局上出现关联=偏倚证据——Wave-S 已吸收，补一句话：需预注册"何为阴性对照失败"判据【文献实据】。
- **安慰剂/证伪检验**（in-time/in-place placebo，经济学合成控制系方法标配）：对不可能受处理的单元/时段重复主分析，主设计检出"效应"即红旗【文献实据】。
- Quantitative bias analysis / tipping-point analysis：更重的全分布敏感度框架——**不引入**（参数化假设多，EEL 无标定来源，属过度工程）【映射提案】。

---

## 净结论

1. **P1 立即做**：决策谓词一致性检查用纯 TS 区间传播+网格枚举（不可达/阈值-方向矛盾=硬错误；success∩falsification 交叠/覆盖缺口=警告+hitPolicy 字段消歧）——Vanthienen/DMN 决策表 V&V 已证此规模不需要 SAT/SMT；这是谓词化提案的完整性配套，缺它谓词化退化为格式游戏。
2. **P2 两项**：①推断框架 interpretation 声明字段+两条确定性门（贝叶斯措辞须声明校准策略；禁跨框架原子合取）——FDA 2026 混合纪律的直接移植，防 LLM 措辞泄漏；②causal-learn（MIT 已核）进 Python sidecar 作 PlanStep.kind=simulation 的**假设生成器**（首选 PC-stable/GES+边 bootstrap 稳定性，NOTEARS 不引入），配强制报告字段与 confounders 结构化升级（source/role/stability 三元组），输出只作 ACH 候选反证不作裁决。
3. **明确不做**：数值实物期权/组合定价（P4，无货币效用尺度=假精度——VOI 半结构化块+killIf 门已覆盖其真实价值）；D/A/E 最优设计与定量偏倚分析维持 s2 的"不适用"判定；SMT solver 不引入。
