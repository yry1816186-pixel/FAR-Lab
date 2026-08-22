# S2 尞调：实验选择与实验设计（真实科研方法论）

日期 2026-08-22。只读调研，全部一手来源经 WebSearch 核验（期刊卷期页/DOI 见各项）。贴地文件：`src/domain/plan.ts`、`src/domain/experiment.ts`、`src/experiment/matrix.ts`、`src/experiment/scheduler.ts`。
标注约定：【文献实据】= 来源直接陈述的机制；【映射提案】= 我把机制映射到 FAR-Lab 的设计建议。已吸收不重复：POPPER 多重检验、Maastricht 咨询位、W9 统计层（播种 bootstrap/Wilson/kappa/BH/MDE 判决门）。

---

## 1. 信息价值（VOI / EVPI / EVSI）

**① 一手来源**
- Raiffa & Schlaifer (1961) *Applied Statistical Decision Theory*, Harvard Graduate School of Business Administration（EVSI/预后验分析的奠基文本，共同引入 EVPI 概念体系）。
- Howard, R.A. (1966) "Information Value Theory", *IEEE Trans. Systems Science and Cybernetics* SSC-2(1):22–26, DOI 10.1109/TSSC.1966.300074。
- Heath, Manolopoulou & Baio (2017) "A Review of Methods for Analysis of the Expected Value of Information", *Medical Decision Making* 37(7):747–758（arXiv:1507.02513）。
- ISPOR VOI Emerging Good Practices Task Force Report 2 (2020), *Value in Health*（VOI 分析用于研究优先级设定的行业规范）。

**② 机制要点**【文献实据】
- 信息的价值不是信息量，而是**决策改进的期望**：EVSI = 有了该实验后的最优决策期望值 − 没有它时的最优决策期望值；EVPI 是其上界（完美信息）。Howard 1966 明确区别于 Shannon 信息量：只有当不确定性会改变行动选择时信息才有价值。
- 可操作的静态量：EVPPI 按参数子集分解"哪个不确定性最值钱"；ISPOR 框架把 VOI 用于"下一个研究该买什么信息"的优先级排序。
- 前提三件套：至少两个互斥行动、依赖不确定量的损失/效用、先验分布。没有明确决策就谈不上 VOI。

**③ FAR-Lab 升级建议**【映射提案】
- 落点：`src/domain/plan.ts` 的 `expectedInformationGain: z.string().optional()` → 升级为半结构化对象：
  `{ decisionAtStake, ambiguitySource, discriminatingMetric, expectedSeparation, flipCostNote? }`——即"歧义来源（哪两个假设/分支的裁决会翻转）→ 本实验 → 预期区分度论证"。保留自由文本字段做尾注，向后兼容（zod union）。
- 确定性门扩展（同 multipleTestingPolicy 模式）：`hypothesisIds.length > 1 || alternativeBranches.length > 0` 时要求至少一条结构化条目且 `ambiguitySource` 引用具体 hypothesisId——单假设单路径计划仍可省略。
- EEL 侧可实现**决策歧义的机械代理**：StatReport 的 CI 与 threshold 的距离 → 估计"裁决翻转概率"；一次新实验的 VOI 近似 = 预期翻转概率降幅。不需要完整 EVSI 求解（见④）。落点：feedback/revision 层，作为"下一实验选择"的排序依据，纯确定性代码。
- 优先级 **P1**（Mission §31 核心——"哪个实验最能减少决策歧义"正是本赛道主线）。触发：重构 ResearchPlan schema + 竞赛演示"计划为什么这样排步骤"。

**④ delta 说明**：现状是零纪律自由字符串，任何计划都能填一句空话。半结构化把"信息增益主张"锚到可审计三要素（决策/歧义/区分度），且与已吸收的 MDE 判决门共享"区分度"词汇（MDE 即预期可区分的最小效应）。诚实声明：完整 EVSI 需要损失函数+先验+似然模型，EEL 只有分类裁决质量，无标定先验——所以只做**决策歧义代理**，不做数值 EVSI，避免假精度。

---

## 2. 贝叶斯实验设计与最优设计准则

**① 一手来源**
- Lindley (1956) "On a measure of the information provided by an experiment", *Annals of Mathematical Statistics* 27(4):986–1005（期望信息增益准则起源）。
- Chaloner & Verdinelli (1995) "Bayesian Experimental Design: A Review", *Statistical Science* 10(3):273–304, DOI 10.1214/ss/1177009939。
- Ryan, Drovandi, McGree & Pettitt (2016) "A review of modern computational algorithms for Bayesian optimal design", *International Statistical Review* 84(1):128–154。
- Kiefer & Wolfowitz (1959) "Optimum Designs in Regression Problems", *Ann. Math. Stat.* 30(2):271–294；Kiefer (1959) "Optimum Experimental Designs", *JRSS-B* 21(2):272–319（Φp 统一 A/D/E 准则与等价定理）。
- 教材：Atkinson, Donev & Tobias (2007) *Optimum Experimental Designs, with SAS*, Oxford UP。

**② 机制要点**【文献实据】
- 贝叶斯设计：选设计 ξ 最大化 E[MI(数据; 未知量)]（期望互信息/信息增益），Chaloner-Verdinelli 给出决策论统一视角；现代算法（Ryan et al. 2016）用近似 ML/MCMC 求解。
- 经典最优准则：D-最优 = max det FIM（最小化参数广义方差）；A-最优 = min tr(FIM⁻¹)（平均方差）；E-最优 = max 最小特征值（最差方向精度）。适用对象是**参数估计的试验点配置**（回归/响应模型的设计矩阵）。

**③ FAR-Lab 升级建议**【映射提案】
- **如实降级适用**：D/A/E 准则针对"从设计点估计模型参数"，EEL 的 OpenML→sklearn 对比实验不产生这种设计矩阵（数据集给定、无试验点选取自由度），**不适用，不引入**。互信息准则同理需要"每个假设下结果的生成模型"——EEL 无标定效应量先验，全套 BED 属过度工程。
- 可保留的最小形态：在 AblationFactor（`src/domain/experiment.ts`）上记录**预期效应方向与粗粒度**（该因子预期把 metric 推多远），供①的区分度论证和④的序贯分配复用；这是 BED"设计前写下预期"的纪律残留，不是求解器。
- 优先级 **P3**（诚实评估：机制在本域不落地，只留设计纪律）。触发：仅当未来出现真正的"试验点选择"自由度（如主动学习式选样本）才升级。

**④ delta 说明**：负结果也有信息量——明确记录"经典最优设计准则对 EEL 计算型实验不适用"及原因，防止后续有人误引 D-最优装点门面。唯一可迁移物是"因子预期效应预登记"，与 #1 半结构化区分度共享字段。

---

## 3. 经典 DOE：因子/分数因子/筛选/区组/随机化/重复

**① 一手来源**
- Fisher (1935) *The Design of Experiments*, Oliver & Boyd（随机化/区组/重复三原则与因子设计奠基）。
- Plackett & Burman (1946) "The Design of Optimum Multifactorial Experiments", *Biometrika* 33(4):305–325。
- Box, Hunter & Hunter (2005, 2nd ed.) *Statistics for Experimenters*, Wiley；Montgomery (2017, 9th ed.) *Design and Analysis of Experiments*, Wiley。
- 稳定在线参考：NIST/SEMATECH e-Handbook of Statistical Methods §5（itl.nist.gov/div898/handbook/），含分数因子分辨度与 PB 筛选。

**② 机制要点**【文献实据】
- 全因子估计全部主效应+交互，但格子数指数爆炸；分数因子以混淆（aliasing）换预算，分辨度 III/IV/V 刻画主效应与交互的混淆程度；PB 设计用 N runs（4 的倍数）筛 k=N−1 个因子的主效应——筛选阶段标准工具。
- Fisher 三原则：随机化（消时间趋势混杂）、区组（隔离已知变异源）、重复（估计纯误差/提高精度）。响应面（RSM）用于筛选后的局部优化。

**③ FAR-Lab 升级建议**【映射提案】
- **P1 落点 `src/experiment/matrix.ts`**：`expandAblationModels` 目前是纯全因子展开（6 因子×3 水平=729 cells）。加一个确定性 `screening: 'plackett_burman' | 'fractional'` 选项：cells 数超阈值（如 >24）时展开 PB/分数因子子集，tags 保留因子赋值、结果标注"主效应筛选，交互被混淆（Resolution III）"，后续对存活因子做全因子确认。纯函数改动，`spec-from-plan.ts` 透传即可。
- 区组→`scheduler.ts` 已有 `device` 字段：跨 device 的 run 本质是区组因素，建议 ResultCell/EnvInfo 层显式记录 device，分析时把 device 作为区组披露【映射提案】。
- 随机化：**如实声明不适用**——deterministic 计算 run 无时间趋势混杂（同 fingerprint 幂等重放正依赖确定性）；run 顺序随机化反而破坏可复现叙事。
- 重复→seed 维度：当前 ablation 全 cells 复用 `base.seed`（等于共同随机数 CRN，配对比较降方差，是**正确选择**，保留并写进注释声明依据）；多 seed 重复作为精度手段见 #4 OCBA。
- 优先级 **P1**（矩阵膨胀是 EEL 现实成本问题；PB 筛选=确定性代码+立竿见影的预算节省）。触发：重构 matrix 层时一并做。

**④ delta 说明**：现状无任何筛选机制，全因子是隐性默认；引入显式 screening 档位+混淆披露，把"729 cells 直接跑"变成"12 runs 筛→存活因子确认"的两段式（这本身就是制药 assay cascade #5 的筛选思想在计算域的落地）。

---

## 4. 序贯实验与自适应分配：TS / OCBA / best-arm

**① 一手来源**
- Thompson (1933) "On the likelihood that one unknown probability exceeds another…", *Biometrika* 25(3–4):285–294。
- Russo, Van Roy, Kazerouni, Osband & Wen (2018) "A Tutorial on Thompson Sampling", *Foundations and Trends in ML* 11(1):1–96（arXiv:1707.02038）。
- OCBA：Chen, Chen, Yücesan & Dai (2000) "Simulation budget allocation for further enhancing the efficiency of ordinal optimization", *Discrete Event Dynamic Systems*；专著 Chen & Lee (2011) *Stochastic Simulation Optimization: An Optimal Computing Budget Allocation*, World Scientific；综述 Lee, Chen et al. "A Review of Optimal Computing Budget Allocation"。
- 计算域对应物：Jamieson & Talwalkar (2016) successive halving（AISTATS）；Li, Jamieson, DeSalvo, Rostamizadeh & Talwalkar, Hyperband（ICLR 2017；JMLR 18:1–52, 2018）。

**② 机制要点**【文献实据】
- OCBA：固定预算下最大化"正确选中最优设计"概率（PCS），闭式分配比 β_i/β_j 依赖均值差与方差——给"接近_top 但不确定"的臂更多重复，给明显差的臂最少。
- Thompson 采样：从后验采样一次，选 argmax——贝叶斯探索/利用的自然平衡，序贯决策通用机制。
- successive halving/Hyperband：bandit 视角下"下一跑哪个配置"，用低预算淘汰差配置——正是超参搜索场景的成熟形态。

**③ FAR-Lab 升级建议**【映射提案】
- **如实限定**：EEL 的 hypothesis-bound spec 不是可重复抽样的臂（每个 spec 一次性、fingerprint 幂等），bandit 不适用于假设裁决层。适用面是 **ablation 矩阵/模型选择层**（多 cells、有噪声、预算约束、目标是选中最好 cell = best-arm identification）。
- P2 落点：`scheduler.ts` 的静态 `priority` 之外加确定性再排序钩子——worker 完成后从 StatReport 均值/CI 宽度更新 cells 的"信息分"，近阈值（CI 压线）cell 获得更多 seed 重复（OCBA 式），远低于阈值的 queued cells 降优先或标 `screened_out`。数值逻辑纯 TS 无关 LLM——符合宪法"deterministic concerns in deterministic code"。
- 触发：ablation cells > compute.maxParallel×k 或 budget 声明受限时。优先级 **P2**（价值真实但排在 schema 与筛选之后）。

**④ delta 说明**：现状 scheduler 是 FIFO+静态优先级，零反馈；引入"结果→优先级"闭环把 #3 的筛选两段式自动化（先小预算筛→信息分驱动加重复），Hyperband/OCBA 提供了现成、可确定性实现的分配规则，不必发明。

---

## 5. 制药 R&D 管理范式：stage-gate / kill criteria / TPP / assay cascade

**① 一手来源**
- Cooper, R.G. (1990) "Stage-Gate Systems: A New Tool for Managing New Products", *Business Horizons* 33(3):44–54, DOI 10.1016/0007-6813(90)90040-I。
- FDA (2007) Draft Guidance for Industry: Target Product Profile — A Strategic Development Process Tool（72/73 FR 通告 + regulations.gov docket FDA-2007-D-0256）。
- Hughes, Rees, Kalindjian & Philpott (2011) "Principles of early drug discovery", *British Journal of Pharmacology* 162(6):1239–1249。
- Thorne et al. (2010) "Apparent Activity in High-Throughput Screening", *J. Biomolecular Screening*（PMC2878863，给出 orthogonal assay / counter-screen 的规范定义）；Rothenaigner et al. (2021) *SLAS Discovery* hit 确认简明指南（PMC8293735）。

**② 机制要点**【文献实据】
- Stage-gate：阶段=工作块+明确交付物；门=go/kill/hold/recycle 决策点，判据**在进入阶段前书面确定**（Cooper 1990）。
- TPP：开发启动前先写"目标产品概况"（想要的宣称/属性区间），后续每道门对着 TPP 检查（FDA 2007）。
- Assay cascade（Hughes 2011；Thorne 2010 定义）：初筛（便宜高通量、假阳性多）→ **orthogonal 正交确认**（换检测技术/readout，剔技术假象）→ **counter-screen 反筛**（无靶/离靶对照，剔 artifacts）→ 量效/定量验证。漏斗结构：每级淘汰率高、单位成本递增。

**③ FAR-Lab 升级建议**【映射提案】
- **P1（科学有效性核心）：正交确认要求进 feedback/revision 层**。现状 `datasets: z.array(DatasetUse).length(1)` + 单 comparison 即可把假设判成 supports——单一数据集/单一模型族/单一 split 体制下的支持是弱证据。映射：假设状态从"实验支持"晋升到"确立/入证据链"需**正交证据**（不同数据集族或不同模型类或不同 split 制度下的独立 supports），否则降级标注 `single_source`。counter-screen 的现成对应物已有：`dummy_most_frequent` 基线 + leakage 控制（groupColumn）——建议在 spec 校验里显式要求"对照基线 cell 在场"才算完成反筛档。这正是本赛道"反证/不确定性"叙事的结构补全。
- **P2：PlanStep 门控语义**。`dependsOn` 只有顺序语义；加 `gate: { proceedIf, killIf }`（引用 decisionRules 判据或前步输出的机械条件），failureConditions 就地从"死文本"变成可执行终止判据——即 kill criteria。stage-gate 的"判据先写"由预注册 spec hash 机制天然背书。
- TPP 映射：ResearchPlan.objective+decisionRules 已是事实上的 mini-TPP，无需新 schema，只在 prompt 层要求生成时"先写目标宣称区间再排步骤"。
- 优先级：正交确认 **P1**，gate 语义 P2。触发：重构 feedback/revision 与 plan schema 时。

**④ delta 说明**：现状的 stop 判据只存在于 plan 顶层，步间无终止/晋升语义；假设可被单源实验推向 supports。assay cascade 给出的是**证据晋升的漏斗结构**（筛选→确认→正交→定量），恰好填 feedback 层"什么才够格说支持"的空白，且全部可落成确定性检查。

---

## 6. 功效分析前置纪律（prospective power / precision / MDE）

**① 一手来源**
- Cohen (1988, 2nd ed.) *Statistical Power Analysis for the Behavioral Sciences*, Lawrence Erlbaum。
- Button, Ioannidis, Mokrysz, Nosek, Flint, Robinson & Munafò (2013) "Power failure: why small sample size undermines the reliability of neuroscience", *Nature Reviews Neuroscience* 14(5):365–376。
- Card, Henderson, Khandelwal, Jia, Mahowald & Jurafsky (2020) "With Little Power Comes Great Responsibility", *EMNLP 2020*:9263–9274（仿真式功效分析用于 NLP 实验设计）。
- Bouthillier et al. (2021) "Accounting for Variance in Machine Learning Benchmarks", *MLSys 3*:747–769（ML 基准的方差来源分解与功效论证）。

**② 机制要点**【文献实据】
- 前瞻功效 = P(检出真实效应 | δ, n, α)，须在**看数据前**算；Button 2013：低功效→显著结果更可能是假阳性+效应量高估；Card 2020：NLP 惯例样本量下多数实验功效不足，倡导仿真式功效分析；Bouthillier 2021：ML 基准应显式建模方差源（数据采样/种子/超参）并按功效设计重复数。
- MDE 是功效的对偶表述：给定 n/α/power，可检出的最小效应。precision-based 替代路线：直接规划 CI 宽度目标。

**③ FAR-Lab 升级建议**【映射提案】
- **何时升硬门**：当 comparison 带 `hypothesisId`（实验宣称对假设做裁决）时，把 `statisticalDesignNote` 从咨询升为 `missing` 硬项。理由：nTest 在 spec 时**可预计算**（nRows × split.test ratio——`checkExperimentSpec` 时数据元信息可查），paired bootstrap 的 MDE 可用正态近似在 spec 校验里确定性估出；低敏度实验对假设下 falsifies/supports 裁决在科学上是空洞的（Button 2013 机制）。探索性 run（exploratoryNote 路线）保持咨询——与多重检验门"只在 >1 假设时强制"同构：**门只压在宣称裁决的实验上**。
- 实现落点：`checkExperimentSpec` 加确定性检查；复用 W9 已有 MDE 词汇（REAL/NOT_SIGNIFICANT/INSUFFICIENT_N）前移到 spec 时；若要精确（非正态近似），用 python sidecar 跑 Card 2020 式仿真功效（幂等、确定性 seed）。
- 优先级 **P1**（小改动、直接强化"可证伪性"宣称的含金量）。触发：重构 `checkExperimentSpec` 时。

**④ delta 说明**：现状 MDE 门只在**事后** StatReport 层（W9 已吸收），前置只到自由文本咨询位。delta=把 MDE/功效从"跑完才知道 INSUFFICIENT_N"前移到"入队前就知道并拒绝/降级"——省预算且防低敏度假裁决；与 #1 的区分度论证共用同一 MDE 数值。

---

## 净结论（最值得进重构的三件）

1. **证据晋升漏斗 + 半结构化 expectedInformationGain（#1+#5，P1）**：`plan.ts` 把信息增益升级为 {决策/歧义来源/区分度论证} 结构并在多假设或含分支时强制；feedback 层要求假设晋升 supports 需正交证据（不同数据集族/模型类），单源支持显式降级。这是"下一实验选择"从散文变成可审计机制的最短路径，直击 Track-1 Direction-A 主线。
2. **PB/分数因子筛选进 `matrix.ts`（#3，P1）**：确定性纯函数，全因子 729→筛选 12+确认两段式，立即的预算/时间收益，附带混淆披露与 device 区组记录。
3. **spec 时 MDE 硬门（#6，P1）**：hypothesis-bound comparison 的 nTest 预计算+MDE 估计入 `checkExperimentSpec`，复用 W9 词汇前移；探索性 run 不受门。防止低敏度实验产出空洞裁决。

明确不采用（如实记录）：D/A/E 最优与全套 BED 求解器（无设计矩阵自由度、无标定先验，#2）；run 顺序随机化（确定性计算无时间混杂，#3）；对假设层的 bandit 分配（假设裁决不是可重复抽样臂，#4）。TS/OCBA/SH 只用于 ablation/模型选择的 budget 分配层。
