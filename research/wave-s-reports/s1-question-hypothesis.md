# Wave-S / S1：问题构建与假设纪律（真实科研方法论尽调）

- 日期：2026-08-22。方法：WebSearch + WebFetch 核验一手/稳定来源（核验时间同日）。只读调研，未改任何代码。
- 对照的真实 schema（本会话实读）：`src/domain/question.ts`（goalType 五值枚举 + ResearchScope + ConstraintSet，**无结构化框架槽位、无质量判据字段**）；`src/domain/hypothesis.ts`（GenerationStrategy 八值枚举含 `analogy_driven`；`predictions: string[]` 自由文本；`mechanism: string`；FalsificationSpec 完整；noveltyLabel + LiteratureNovelty 两层；`distinctnessRationale` 自由文本；**无假设类型/机制性维度，无机器可查的假设间竞争结构**）。
- 已吸收（delta-only 基线，本文不重复展开）：负向条件化、Kaimen 进化算子（integrate/reduce/make-feasible/transplant）、文献锚定新颖性两层裁决（unclear 默认）、Robin 锦标赛 + Bradley-Terry/ILSR、证据卡判分 + 反宽大、ACH 多假设架构。

标注约定：【文献实据】= 本会话核验的文献主张；【映射提案】= 我们向 FAR-Lab 的工程映射（工程判断，非文献直接主张）；UNVERIFIED = 出处细节未能本会话核验。

---

## 1. 问题构建框架（PICO/PICOS/SPIDER/ECLiPSE）+ FINER 判据

### ① 一手来源
- PICO：Richardardson WS, Wilson MC, Nishikawa J, Hayward RSA (1995). "The well-built clinical question: a key to evidence-based decisions." *ACP Journal Club* 123(3):A12–13。PubMed 7582737（https://pubmed.ncbi.nlm.nih.gov/7582737/）。【文献实据】
- SPIDER：Cooke A, Smith D, Booth A (2012). "Beyond PICO: the SPIDER tool for qualitative evidence synthesis." *Qualitative Health Research* 22(10):1435–1443。比较研究见 "PICO, PICOS and SPIDER – a comparison study of specificity and sensitivity in systematic search"，PMC4310146（作者记录 Methley et al., 2014，*Research Synthesis Methods*——作者名单凭记忆，请以 PMC 记录为准，UNVERIFIED-author-list）。【文献实据】比较结论：SPIDER 检索定性文献更敏感（sensitive）但特异性低于 PICO。
- ECLiPSE：Wildridge V, Bell L (2002). "How CLIP became ECLIPSE." *Health Information and Libraries Journal* 19(2):64–66（https://onlinelibrary.wiley.com/doi/full/10.1046/j.1471-1842.2002.00378.x）。【文献实据】
- PICOS：S=Study design，系统综述标准（Cochrane Handbook 惯例；具体版本页码未核验，UNVERIFIED-detail）。
- FINER：源自 Hulley S 等《Designing Clinical Research》教科书（现第 5 版，Wolters Kluwer），判据 = Feasible / Interesting / Novel / Ethical / Relevant。【文献实据】（判据定义经多源一致核验；具体版次页码 UNVERIFIED-detail）

### ② 机制要点
- 框架本质：把研究问题分解为**类型化槽位**（人群/干预/对照/结局，或 Sample/Phenomenon of Interest/Design/Evaluation/Research type），每个槽位直接映射为一条可执行的检索式——问题结构 = 检索覆盖率的确定性来源【文献实据】。
- 槽位选择应由问题类型驱动：干预性问题→PICO/PICOS；定性/经验性问题→SPIDER；政策/服务问题→ECLiPSE【文献实据】。FAR-Lab 的 `goalType` 五值（explanatory/predictive/interventional/methodological/exploratory）恰好是现成的路由键，但 PICO 家族只覆盖 interventional 与部分 exploratory；explanatory/predictive/methodological 无医典框架，需要域自适应槽位【映射提案】。
- FINER 是**问题级质量自评**而非检索工具，其中 Novel 可下游自动化（接 LiteratureNovelty），Feasible 可与 ConstraintSet 交叉验证，Interesting 本质主观（研究者输入）【文献实据+映射提案】。

### ③ FAR-Lab 升级建议
- **question.ts 加 `framework` 判别联合**（高优先）：`{ kind: 'PICO'|'PICOS'|'SPIDER'|'ECLiPSE'|'domain-adapted', slots: Record<string, string> }`，按 goalType 路由默认 kind；slots 与现有 ResearchScope 字段不重复者（如 Comparison、Outcome）为净新增。确定性检查：每个已声明槽位非空或显式 `N/A + reason`；**retrieve 阶段按槽位 fan-out 生成检索 query（一槽一查询族）**——这是对检索覆盖率最直接的确定性增益。触发条件：进入重构方案时一并落 schema（additive optional，向后兼容）。
- **align 阶段 FINER 结构化自评**（中优先）：五判据各给 verdict + 依据指针；确定性交叉检查两条：F↔resourceConstraints（constraints 为空而 F 判 feasible → flag）；N↔后续 LiteratureNovelty（align 时标 pending，hypotheses 阶段回填）。I/E/R 保持研究者输入 + LLM 建议双轨，披露来源。触发条件：scope→retrieve 门禁前。
- 低优先：不做 FINER 加权总分（会把主观判据伪装成排序依据，违反不确定性披露纪律）【映射提案】。

### ④ 与已吸收机制的 delta
已吸收的新颖性裁决作用于 hypotheses 产物；问题结构化在 align/scope 上游，二者正交。槽位→检索 query 的映射是全新能力（现 retrieve 不由问题结构驱动覆盖度量）。

---

## 2. Chamberlin 多工作假设法（1890）+ Platt 强推理（1964）

### ① 一手来源
- Chamberlin TC (1890). "The method of multiple working hypotheses." *Science* 15(366):92–96；1965 年重印 *Science* 148:754–759（原文 PDF：sciences.ucf.edu/biology/d4lab；现代解读 railsback.org/railsback_chamberlin.html，本会话核验）。【文献实据】
- Platt JR (1964). "Strong Inference." *Science* 146(3642):347–353（DOI 10.1126/science.146.3642.347）。核心引文（本会话核验原文）："Strong inference consists of applying the following steps to every problem in science, formally and explicitly and regularly: 1) Devising alternative hypotheses; 2) Devising a crucial experiment (or several of them), with alternative possible outcomes, each of which will, as nearly as possible, exclude one or more of the hypotheses; 3) Carrying out the experiment so as to get a clean result." 外加 "1′. Recycling the procedure"。【文献实据】
- 现代接续：Yanco SW, McDevitt A, Trueman CN, Hartley L, Wunder MB (2020). "A modern method of multiple working hypotheses to improve inference in ecology." *Royal Society Open Science* 7(6):200231（PMC7353960）——把 Chamberlin 与 AIC 多模型推断接通。【文献实据】另 "Revisiting Chamberlin" *BioScience* 57(7):608 (2007)，作者名单 UNVERIFIED。

### ② 机制要点（可形式化部分）
- Chamberlin：研究开始**前**书面列出多个竞争假设（"written, not mental, list"），防止第一假设获得 primacy 与"亲代情感"偏置【文献实据】。
- Platt 的可形式化不变量：(a) 假设集应**真竞争**——存在能区分它们的观测；(b) 每个实验应声明**结果→假设消除映射**（每个可能结果排除≥1 个假设，否则非 crucial experiment）；(c) 结果→推断映射须在实验前固定（clean result 的前置条件）；(d) 循环回收（对应我们的 revise 阶段）【文献实据→形式化为映射提案】。

### ③ FAR-Lab 升级建议（本主题确定性检查的核心产出）
- **预测冲突矩阵（高优先，schema 级）**：`hypothesis.predictions` 从 `string[]` 升级为结构化 `{ observable, condition, expectedRelation }`（与 FalsificationSpec.observable 同词表）。确定性检查：对每对同 clusterKey 外的 active 假设，检测是否存在**同一 observable 上 expectedRelation 不同**的预测对 → 标记 `discriminates`；全无区分对的假设群 → 整群标 `complementary`（可同时真）并要求 rationale，否则 hypotheses→falsify 门禁报警。这把"假设间是否真正竞争而非可同时真"从自由文本（distinctnessRationale）变成机器可查【映射提案，机制源自 Platt/Chamberlin】。
- **实验消除映射（高优先，plan 阶段）**：Experiment/Plan 条目加 `outcomeHypothesisMap: Array<{outcome, weakened: HypothesisId[], excluded: HypothesisId[]}>`。确定性检查：(1) 每个 testability≠unfalsifiable 的假设被≥1 个实验的映射覆盖；(2) 任一实验若所有 outcome 的 excluded/weakened 均为空 → "non-crucial experiment" 警告（Platt 违例）；(3) 映射须在 execute 前持久化（预注册语义，天然并入 provenance）【映射提案】。
- falsify 阶段 `completenessCheck` 扩展一条：falsificationCondition 是否引用了与至少一个竞争假设相容的观测（区分度检查）。触发条件：falsify 与 plan 门禁脚本。

### ④ 与已吸收机制的 delta
ACH 给了多假设架构立场，但当前 schema 无机器可查的竞争结构（predictions 是自由文本，distinctnessRationale 不可验证）。Platt/Chamberlin 补的正是**结构化预测 + 消除映射**这一层，并给 plan 阶段引入首个确定性科学检查。

---

## 3. 研究缺口分类学（系统综述方法论）

### ① 一手来源
- Müller-Bloch C, Kranz J (2015). "A Framework for Rigorously Identifying Research Gaps in Qualitative Literature Reviews." *ICIS 2015 Proceedings*（ITU Pure / aisel.aisnet.org / ResearchGate 283271278，本会话核验存在与被引 468+；框架内部维度——knowledge gap vs theory gap 及触发条件——经二手来源转述，中等置信，UNVERIFIED-detail）。【文献实据（存在）+部分二手】
- Miles DA (2017). "A Taxonomy of Research Gaps"——七类：Evidence / Knowledge / Practical-Knowledge (Conflict) / Methodological / Empirical / Theoretical / Population（经 ResearchGate 319244623 及多源一致转述；原始出版载体细节 UNVERIFIED）。【二手一致，UNVERIFIED-venue】
- PICO 维度式缺口（population/intervention/comparison/outcome/setting 缺口）见于 EBP 教学材料，与 Muller-Bloch & Kranz/Miles 是不同文献脉络；把两者接成"问题槽位×缺口类型"矩阵是**我们的综合**。【映射提案】

### ② 机制要点
- 缺口 = "已知"与"应知"之间的显式差距，可沿问题维度分类定位（哪一槽位证据不足/矛盾/未涉人群/方法过时/理论缺位）【文献实据】。
- **缺口类型天然对应假设生成策略**：evidence/矛盾缺口→contradiction_driven；knowledge 缺口→evidence_conditioned；theoretical 缺口→mechanism_driven；population/setting 缺口→boundary_condition；methodological 缺口→methodological 方法假设；empirical 缺口→testability 设计。此映射本身是【映射提案】，但两端（缺口类型学、GenerationStrategy 枚举）均为实有。

### ③ FAR-Lab 升级建议
- **新增 ResearchGap 域实体（高优先）**：`{ dimension: 枚举（对齐问题框架槽位 + Miles 七类）, statement, exposingClaimIds: ClaimId[], confidence }`——在 evidence 阶段从证据卡提取（LLM 抽取 + 每条缺口强制挂 exposing claims，无锚缺口不入库）。
- **gap→strategy 确定性路由 + 覆盖检查**：hypotheses 阶段确定性检查"每个已识别缺口被≥1 个假设的 derivation.rationale 显式回应，或显式 deferred 带理由"；GenerationStrategy 枚举从"标注性"变为"按缺口可度量"（每策略至少对应一类缺口来源）。触发条件：evidence→hypotheses 门禁。
- 这使 retrieve 的产出（claims）第一次变成假设生成的**生成性锚点**，而不只是事后裁决证据。优先级：高。

### ④ 与已吸收机制的 delta
文献锚定新颖性是对假设的**防御性裁决**（verdict-on-hypotheses）；缺口分类学是上游**生成性锚定**（anchor-for-generation）——方向相反，互补。

---

## 4. 假设质量判据操作化（falsifiability 强度 / 机制性 vs 现象性 / 区分度）

### ① 一手来源
- Mayo D (1991). "Novel Evidence and Severe Tests." *Philosophy of Science* 58(4):523–552（errorstatistics.com 有作者稿 PDF）；Mayo D (2018). *Statistical Inference as Severe Testing*, Cambridge University Press。严重性定义（本会话核验）：H 通过严重检验 T（数据 x）iff (i) x 与 H 一致，且 (ii) 若 H 为假，T 以很高概率会产生一个与 H 一致性更低的结果。【文献实据】
- 机制性解释：Machamer P, Darden L, Craver CF (2000). "Thinking about Mechanisms." *Philosophy of Science* 67(1):1–25；Craver C, Darden L (2013). *In Search of Mechanisms*, University of Chicago Press。（经典出处，本会话未重核原文，canonical-UNVERIFIED-this-session）
- 机制/现象模型权衡：Transtrum MK 等 (2016) "Bridging mechanistic and phenomenological models of complex biological systems"，*PLOS Computational Biology*（PMC4871498）。案例：阿尔茨海默淀粉样假说经 PET 成像"从描述性走向机制性"（Nat Sig Transduct Target Ther 综述，s41392-019-0063-8）。【文献实据】

### ② 机制要点
- 严重性把 Popper 模糊的可证伪性操作化为**概率对比度**：P(x|H) 与 P(x|¬H) 的分离度决定证据价值【文献实据】。前置（设计时）版本即"该检验若 H 为假会看到什么"——反事实观测的显式声明。
- 机制性假设携带 实体—活动—组织 结构承诺：每个机制环节是**一条额外的可独立检验承诺**，机制链越长可证伪面越大，且支持干预与跨情境迁移；现象性假设压缩、可预测但不支持迁移。二者皆合法，但科学价值维度不同，不应混在一个总分里【文献实据（机制概念+权衡）+映射提案（操作化为计数）】。

### ③ FAR-Lab 升级建议
- **hypothesis.ts 加 `hypothesisType: 'mechanistic'|'phenomenological'|'hybrid'`（中高优先，与第 2 项的 schema 改动合并落地）**；mechanistic 时 `mechanism` 从 string 升级为结构化链 `Array<{ entity, activity, role }>`（MDC 式），确定性指标"可独立检验环节数"。
- **rank 阶段新增披露维度（半确定性，中优先）**：(a) **区分度**：来自第 2 项预测冲突矩阵——假设参与区分对的数量；(b) **严重性代理**：FalsificationSpec 是否显式声明"若 H 为假应观察到什么"（可复用 alternativeExplanations + weakeningCondition 做确定性存在性检查）；(c) **风险性预测计数**：predictions 中带方向+阈值的条数（Platt/Popper 意义上的 risky prediction）。三项全部作为**披露列**呈现，不折算进锦标赛总分（避免把文献概念伪装成精确权重）【映射提案】。
- 触发条件：rank 输出 schema 扩展时；falsify completenessCheck 加"¬H 反事实观测存在性"一条。

### ④ 与已吸收机制的 delta
现排序 = 锦标赛分数 + 不确定性披露，schema 无类型/机制深度维度（与任务说明一致）。本项新增的是**披露型质量维度**而非新的聚合分——与反宽大、不确定性披露同一设计哲学。

---

## 5. 溯因/类比/跨域移植分类学（Gentner 结构映射、Holyoak 多约束）

### ① 一手来源
- Gentner D (1983). "Structure-mapping: A theoretical framework for analogy." *Cognitive Science* 7(2):155–170（原文 PDF 在线，本会话核验存在）。【文献实据】
- Falkenhainer B, Forbus K, Gentner D (1989). "The Structure-Mapping Engine: Algorithm and Examples." *Artificial Intelligence* 41(1):1–63（Gentner lab PDF / ERIC ED288490）。【文献实据】
- Holyoak KJ, Thagard P (1989). "Analogical Mapping by Constraint Satisfaction"（ACME），*Cognitive Science* 13(3):295–355；Holyoak KJ (1985). "The Pragmatics of Analogical Transfer"；Spellman BA, Holyoak KJ (1996). "Pragmatics in analogical mapping"（PubMed 8975685）。【文献实据】
- Hesse M (1966). *Models and Analogies in Science*（水平/垂直关系，经 SEP "Scientific Discovery" 条目转述）；Clement J 关于科学家自发类比生成的观察研究（UMass PDF）。【文献实据，经二手核验】

### ② 机制要点
- 类比的本质是**关系（而非表面属性）对齐**：系统性原则（systematicity）偏好连通的高阶关系结构；SME 的候选推断 = 把 base 中连通而 target 缺失的关系**投影**到 target——这个投影就是类比假设的生成位【文献实据】。
- Holyoak/Thagard 多约束：结构 + 语义相似 + **语用/目标约束**（类比服务于当前问题目标）三者竞争满足；Gick & Holyoak 聚焦/辐射实验表明 schema 抽象化促进迁移【文献实据】。
- 好类比 vs 浅类比的可操作分界：映射的关系深度（≥2 条因果/功能关系）+ 显式列出**不相似点**（Hesse 的 unshared negative analogies）【文献实据（原则）+映射提案（阈值化）】。

### ③ FAR-Lab 升级建议
- **类比卡 prompt 模板（中优先，纯 prompt/derivation 层）**：analogy_driven 策略产出的假设，derivation.rationale 必须填结构化类比卡：{ sourcePhenomenon, causalRoleTable（base 实体↔target 实体 + 因果角色）, mappedRelations（≥2 条 n 元关系）, projectedRelation（=假设本身）, disanalogies（非空）, domainValidityCaveat }。
- **准入确定性检查（轻量）**：mappedRelations < 2 或 disanalogies 为空 → 类比假设不予入库（防"X 像 Y"式表面类比）；类比假设的 predictions 必须声明哪些投影关系在 target 域可测【映射提案】。
- 与已吸收的 Kaimen `transplant` 算子对接：transplant 触发时套用同一类比卡模板，使该算子有纪律模板而非自由发挥。触发条件：generate_hypotheses prompt 重构时一并落。

### ④ 与已吸收机制的 delta
已吸收的 transplant 是进化算子层面的一个动作；本项给出的是**类比质量的操作化准入标准 + 结构模板**，让 GenerationStrategy 中已存在的 `analogy_driven` 枚举值第一次有了可验证语义。

---

## 净结论（最值得进重构方案的 1–3 条）

1. **结构化预测 + 冲突矩阵 + 实验消除映射（第 2 项）**：一次性补齐 Chamberlin/Platt 的机器可查纪律——`predictions` 结构化、假设对区分度检查、plan 阶段 outcome→假设排除映射与非 crucial experiment 警告。全部确定性，落点集中（hypothesis.ts + plan 门禁），是本主题性价比最高的升级。
2. **问题框架槽位 + 槽位驱动检索（第 1 项）**：question.ts 加 framework 判别联合，retrieve 按槽位 fan-out 查询并度量覆盖率。上游改进，直接提升全管线证据面质量；FINER 只取两条可确定性交叉的判据，不做总分。
3. **ResearchGap 实体 + gap→strategy 路由（第 3 项）**：把 retrieve/evidence 的产出变成假设生成的生成性锚点，使 GenerationStrategy 枚举可度量。与已吸收的"防御性新颖性裁决"形成攻防闭环。

第 4 项的 `hypothesisType` 字段与严重性/区分度披露维度建议随 1 的 schema 改动合并落地（一次 migration）；第 5 项类比卡模板随 prompt 重构落地，均为中优先。

## 残留不确定
- Miles (2017) 原始载体、Müller-Bloch & Kranz 框架内部维度细节、Machamer/Darden/Craver 出处本会话未逐条重核原文——已在正文标注 UNVERIFIED 级别，不影响三条净结论的方向。
