# S6 尽调报告：科研流程规范与工作流标准（预注册 / Registered Reports / 对抗协作 / 协议与报告规范）

- 日期：2026-08-22（只读调研子 Agent 产出；WebSearch/WebFetch 一手核验）
- 主题：Direction-A 流程规范的外部标准尽调，delta-only（已吸收 POPPER、SWAN、GRADE 阶梯、预注册统计裁决的不重复展开）
- 证据纪律：每条结论标 【文献实据】（官方手册/论文原文核验或教科书级公知，注明核验方式）、【二手转述】（可靠二手但未读原文）、【映射提案】（本报告的工程建议，非文献结论）。未核验处如实标注。

## FAR-Lab 现状锚点（真实代码，落点用）

- `src/domain/plan.ts`：`ResearchPlan{objective, hypothesisIds, variables, controls, inclusionCriteria, exclusionCriteria, dataRequirements(DatasetRequirement{name,variables,availability枚举,sourceHint}), toolRequirements, steps(PlanStep{kind枚举, method, failureConditions, dependsOn,…}), metrics, statistics:string[], decisionRules{success/weakening/falsification/stop}, multipleTestingPolicy, confounders, alternativeExplanations, risks:string[], ethics, prerequisites, alternativeBranches, reproducibilityRequirements:string[], executabilityCheck{passed,missing,statisticalDesignNote}, createdAt}` —— **无 plan 级冻结/hash 字段**。
- `src/domain/experiment.ts`：`ExperimentSpec{version(改动即bump), datasets.length(1), comparisons(threshold/primary/thresholdProvenance), StatisticsPlan(创建即冻结: test/alpha/nBoot/analysisSeed/ciLevel), approvals(BindingApproval: 人审绑定一次一快照), exploratoryNote, validation}`；`ExperimentRun.specHash(sha256, 执行绑定)`；`ResultCell.fingerprint(specHash+dataset+env+modelIdx+seed)`；`StatReport{analysisIteration, exploratory, secondary, adjustedAlpha, verdictDerivation}`。
- 产品面：PEX run 工作台 / ACH 画布 / 信任面（GRADE 徽章、统计纪律、limitations）/ 版本对比（VersionDiff）/ SSE；B4 = 对象级 AI 研究动作（`POST /runs/:id/actions`，未实装）。

---

## 1. Registered Reports（RR）工作流

**① 一手来源**
- Chambers, C. D. (2013). Cortex 发起 RR 的编者按（RR 起点）。【文献实据·公知引用，本会话未复核卷页】
- Chambers & Tzavella (2022). *The past, present and future of Registered Reports*. Nature Human Behaviour 6(1):29–42, DOI 10.1038/s41562-021-01193-7。【文献实据·本会话核验（nature.com/PubMed 34782730）】
- COS 官方 RR 页（stage 1/stage 2 定义）：https://www.cos.io/initiatives/registered-reports 【文献实据·本会话核验】
- Klein et al. (2018). *A Practical Guide for Transparency in Psychological Science*（附 prereg 检查表），https://osf.io/preprints/bitss/zxc3d/ 【文献实据·本会话全文抓取】

**② 机制**【文献实据】
- 两阶段：**Stage 1** 提交"引言+方法+先导实验结果"，同行评审的是**问题价值与方法质量**，通过即 **IPA（in-principle acceptance）**——承诺无论结果如何都发表；协议须冻结注册（时间戳、只读、可公开核验）。
- **Stage 2** 只审**协议依从性**：结果好坏不影响录用；偏离（deviations）必须透明披露；未注册的分析只能标注为 exploratory。Chambers & Tzavella 2022 亦如实指出其局限（stage-1 评审周期长、学科覆盖有限、"非万能药"）。
- Klein 2018 实操五要点：冻结注册时点（先于数据收集/分析）、偏离披露、预注册**决策树**、对预注册方案的数据敏感性调整（sensitivity/multiverse 分析）、可复现工作流（SOP）。

**③ FAR-Lab 升级建议**【映射提案】
现状已有 RR 的"实验半边"：StatisticsPlan 冻结 + specHash 绑定 + StatReport.exploratory/analysisIteration ≈ stage-2 的 exploratory 标注与再分析计数。缺口在 **plan 层**：
- **P0｜plan 冻结事件（流程+schema）**：`ResearchPlan` 增加 `frozenAt?` + `planHash?`（内容寻址，入 provenance receipts）；执行任何 `experiment` 类 PlanStep 前由确定性门校验"执行时 planHash == 冻结 hash"。修订不再原地改，走既有 version-bump + VersionDiff（即"执行后不可改计划只可 fork 修订"——与版本对比环天然对齐，**不需要新机制，只缺冻结锚点**）。触发：EEL 执行入口 + export 门。
- **P1｜偏离一等对象（schema）**：新增 `Deviation{runId, planId, occurredAt, description, discoveredIn(stage), affectedStepIds, justification}`；export 时"冻结计划 vs 实际执行"的偏差表 = RR stage-2 审计面的产品化。触发：revise 阶段与 export 打包。
- **P1｜IPA 等价物（产品面）**：plan 级"人审后放行执行"审批（复用 BindingApproval 的一次一快照模式上移到 plan 级），信任面显示"计划已锁定 #hash，由谁于何时放行"。触发：B4 动作面或 PEX plan 详情页。
- P2：不引入期刊/评审员角色扮演（无真实同行），IPA 语义限于"锁定+人审放行"，避免假"同行评审"徽章（诚实边界）。

**④ delta**：POPPEER/SWAN 未覆盖流程时点语义；现有 executabilityCheck 只查"可执行"，不查"执行后计划未变"。冻结事件+偏离对象+依从审计 = 把 RR 形态补成完整闭环，且全部可确定性实现。

---

## 2. 预注册模板学（AsPredicted / OSF）

**① 一手来源**
- AsPredicted 官方模板（**现行 v2.00 原文**，自官方样例 PDF 核验：https://aspredicted.org/kv692.pdf）：【文献实据·本会话核验】
  1) 数据是否已收集（status）？2) 主问题/假设；3) 关键因变量及测量方式；4) 各条件/自变量及操纵方式；5) 精确分析计划（检验类型、效应摘要、哪些统计量支持/反驳假设）；6) 离群/排除规则+缺失与失败数据处理（须在**看数据前**注册）；7) 每单元格观察数及其依据（先验功效/停止规则；若数据已存在须定义最终样本）；8) 其他预注册内容（次要 DV、探索性分析等）。
  - 注：惯称"9 问"（如 Pang et al., CHI 2022 引 9 问）【文献实据】，现行 v2.00 实为 8 个编号问题【本会话核验】；平台机制 = 单页 PDF+时间戳+唯一 URL 可核验、公开后不可修改。
- OSF Registries 模板族（OSF-Prereg、OSF-Standard、Reproducible Project prereg 等）：https://help.osf.io/article/330-welcome-to-registrations 【文献实据·本会话核验】；OSF-Prereg 标准版约 22 问、最长版本可达数百项【二手转述·搜索摘要，未逐题核验】。模板哲学：强制在数据前做决定、暴露分析计划缝隙（Devlin 2023, COS blog）。
- Klein et al. 2018（同上）为"预注册价值判断"的权威实操标准：预注册决策树 > 逐题填空。

**② 机制**【文献实据】最小完备集 = ①先验数据暴露声明 ②假设 ③DV/IV 及测量操纵 ④精确分析 ⑤排除规则 ⑥样本量/停止规则 ⑦探索性内容边界。价值不在表格而在**时点**（看数据前）与**偏离披露**。

**③ FAR-Lab 升级建议**【映射提案】
对照 `ResearchPlan` 逐题映射：Q2→hypothesisIds+objective ✅；Q3/Q4→variables+controls ⚠️（自由字符串，不区分 DV/IV/操纵方向）；Q5→statistics:string[] + StatisticsPlan（实验级）⚠️（plan→spec 无对应校验）；Q6→exclusionCriteria ⚠️（语义是"研究纳入排除"非"分析排除"）；Q7→statisticalDesignNote 仅咨询 ⚠️；Q1（先验数据暴露）❌ 无字段。
- **P0｜预注册完备性确定性门（确定性清单）**：在冻结/导出处跑一个 `preregCompletenessCheck`（模式同 executabilityCheck）：逐条 AsPredicted-8 → 映射字段引用 → 缺失显式进 `missing[]`。**不加新 schema 字段**（最小架构），缺口用"字段引用+文本留痕"满足。触发：plan 冻结事件（见 §1）+ export。
- **P1｜先验数据暴露声明（schema 小增量）**：`ResearchPlan.priorDataExposure?: string[]`（每假设列出已知结果/已看过的相关数据）——AsPredicted Q1 与 RR"先导实验"区分的等价物，直接服务反证诚实性。触发：下一次 plan schema 演进窗口。
- P2：引入 OSF-Prereg 全量字段（否决：表单膨胀，AsPredicted 级最小集已覆盖决策关键）。

**④ delta**：现有"预注册统计裁决"只在 ExperimentSpec 层；plan 层的"何时冻结、冻结时缺什么"没有确定性答案。AsPredicted-8 提供了廉价、可判定的最小完备基准。

---

## 3. 对抗协作协议（Adversarial Collaboration）

**① 一手来源**
- 起点：Mellers, Hertwig & Kahneman (2001)，首例对抗协作发表【文献实据·公知，经二手确认存在】。
- Kahneman 规则陈述：Edge 讲座 "Adversarial Collaboration"（ https://www.edge.org/adversarial-collaboration-daniel-kahneman ）：竞争假设持有者共同设计双方认可的公平检验、预测先行注册、论文含**不受对方反驳的分歧陈述**（unmoderated disagreement）、跨地位协作保护规则【文献实据·本会话核验页面】。
- 机构化：UPenn Adversarial Collaboration Project（ https://web.sas.upenn.edu/adversarialcollabproject/ ）：合作者互为对方假设的"可证伪性/检验公平性/解释可靠性"检查者【二手转述·项目页】。
- 最新模板：*Theoretical adversarial collaboration: a template*（arXiv 2607.16374，2026）：五步——S1 澄清争议（含术语）；S2 **仅论证轮（禁止反驳）**；S3 **注册预测**（含激励化预测）；S4 **一次性裁决轮**（每方一篇短文+提出能改变己方立场的实验/解决方案+对关键结果的赔率/概率）；S5 联合发表（分歧不删减）。明确建议**不设中立仲裁人**（"collaboration without collaboration"），由数据裁决【文献实据·本会话核验 arXiv 页】。

**② 机制**【文献实据】角色分离（proponent/skeptic）+ 论证隔离（先各自立论后互见）+ 预测注册在先 + 单轮裁决 + 分歧保留。与普通"反证清单"的差异：反证者也被要求注册**可被实验判伪的预测**，而非只泼冷水。

**③ FAR-Lab 升级建议**【映射提案】——B4 动作面是天然落点：
- **P1｜对抗动作族（产品面+B4）**：`POST /runs/:id/actions` 增 `adversarial_review` 动作族：(a) `skeptic_argument`：对指定假设生成最强反证，**输入上下文不含 proponent 论证**（S2 论证隔离 → 上下文裁剪即可实现）；(b) `register_prediction`：skeptic 在实验执行前对既有 `Comparison`（direction/threshold）注册方向预测——零新信任模型，复用比较对象；(c) `adjudication_note`：执行后由确定性 verdict（StatReport.verdict）+ 双方预测对账生成"谁预测对了"的裁决记录。
- **P1｜分歧保留（schema/信任面）**：ACH 画布增加"未裁决分歧"节点类型（映射 S5 unmoderated disagreement），export 的 limitations 必须纳入——与宪法"保留负证据"一致。
- P2：赔率/主观概率字段（S4 的 odds）：价值在激励校准，但先等 B4 动作面落地再评估。

**④ delta**：现有"反证"（ACH/counter-evidence）是被动的证据陈列；对抗协作把它升级为**带注册预测、可判分、留分歧**的主动角色流程，且 proponent/skeptic 分离用上下文隔离即可产品化，无信任模型新增。

---

## 4. Pre-mortem（Klein 2007）

**① 一手来源**
- Klein, G. (2007). *Performing a Project Premortem*. Harvard Business Review（85(9), 100–102）【文献实据·公知，本会话未复核页码】。
- 实证基础：Mitchell, Russo & Pennington (1989) prospective hindsight（假设事件**已经发生**使正确理由识别率约 30%→~48–50%）【文献实据·经多来源转述，原始为未发表工作稿】。

**② 机制**："假设一年后该计划已失败，写下失败原因"。作用机理 = 前瞻性后见（把未来确定化）+ 合法化异见（降低从众/报喜压力）。【文献实据】

**③ 证据强度（如实）**：中等偏弱。支持：Veinott, Klein & Wiggins (2010，**未正式发表**) 实验组生成更多失败原因；Michigan Tech 2017 博士论文（实验室+现场，n=82/138/30 组）：pre-mortem 生成的失败原因多于 worst-case 对照、**降低过度自信最有效**；游戏开发团队研究（Simulation & Gaming 2023）：计划改进优于其他四种评审技术【文献实据·本会话搜索核验存在性与方向，未读全文】。局限：关键研究未发表、独立重复少、无远期现场硬结局证据。**结论：值得作为 prompt 结构采用，不足以作为"科学性提升"的强宣称。**

**④ FAR-Lab 升级建议**【映射提案】
- **P2｜计划评审 prompt 结构（B4 动作，不动 schema）**：`premortem_review` 动作：以 decisionRules.stopCriterion/falsificationCriterion 已触发为"失败已发生"锚，反向生成失败叙事，每条必须挂 `affectedStepIds` + 对应 `PlanStep.failureConditions` + 早期预警信号；与现有 `risks` 的差别（也是证据仅支持的部分）：时间框架 + 计划条件化 + 不锚定已列风险。
- P2｜确定性侧的薄要求：executabilityCheck 咨询位提示"risks 中无任何一条链接到具体 step/failureCondition 的计划"（advisory，不 fail）。
- 明确不做：不为 pre-mortem 增加 schema 字段或徽章（证据等级不够）。

**⑤ delta**：现有 risks 是平面字符串；pre-mortem 提供的是生成协议与挂接要求，属 prompt/流程层增量，成本低、可诚实标注为启发式。

---

## 5. 复制设计（reproduction/replication 分类 + many-labs）

**① 一手来源**
- Schmidt, S. (2009). *Shall we really do it again?* Psychological Bulletin 135(1)——direct vs conceptual replication 经典区分【文献实据·本会话二手核验（PMC 转引）】。
- FORRT *Handbook for Reproduction and Replication Studies*（ https://forrt.org/replication-handbook/understanding.html ，2024–25）：现行标准分类——**reproduction（同数据）**分 numerical（同数据同代码→同数字）/ robustness（同数据换分析选择→同结论）；**replication（新数据）**分 close（方法/材料/程序最大相似）/ conceptual（不同操作化检验同一假设）；含 Nosek & Errington (2020, eLife) "任何结果都是诊断性证据"定义、Landy et al. (2020) many-analysts 异质性、**"先 reproduction 后 replication"原则**、Dreber & Johannesson (2024)【文献实据·本会话全文抓取】。
- 分类学细化：LeBel et al. (2018) 按"与原研究的接近度"维度分类【二手转述·经 FORRT/Vermeulen 2024 转引】。
- Many-labs 模式：Klein et al. (2014) *Social Psychology* 45(3):142–152——13 个效应 × 36 样本 × 6,344 人【文献实据·本会话核验】；Klein et al. (2018) *Many Labs 2*（AMPPS，osf.io/8cd4r）：28 效应中 57% 复制效应量 <.20、32% 方向相反、39% 场景间显著异质【文献实据·本会话核验 OSF 摘要】。模式要点：效应级 meta-analysis + 场景异质性测量，而非单点成败。

**② 机制**【文献实据】"复制"不是布尔值：同数据重跑（数值再现）→ 同数据换分析（稳健性再现，≈ 多宇宙分析）→ 新数据近似重跑（直接复制）→ 换操作化（概念复制）。证据强度按此阶梯解释。

**③ FAR-Lab 升级建议**【映射提案】
现状惊人地接近：`ResultCell.fingerprint` 去重 = numerical reproduction；`StatReport.analysisIteration` = robustness 的再分析计数；但**无类型声明**——export 无法回答"这是哪种复制"。`datasets.length(1)` 限制使跨数据集复制必然是"新 spec"。
- **P0｜ExperimentSpec.replication 声明（schema 小增量）**：`replication?: { type: 'numerical_reproduction'|'robustness_reproduction'|'close_replication'|'conceptual_replication', targetSpecId?, targetResultRef? }`。确定性门：export/信任面凡出现"replicated/reproduced"字样的结论，必须有 replication 对象支撑（防复制语言注水）。触发：下一次 experiment schema 演进；EEL 换 OpenML 数据集重跑即 close/conceptual 的现成用例。
- **P1｜many-labs 精神 → 多数据集变体（流程）**：同一 spec 模板对 ≥2 数据集实例化 + 效应级汇总（meta 视图：点估计+CI 并排，标异质性）——映射 FAR-Lab 的"换数据集重跑"，VersionDiff/对比面已有 UI 基础。
- P2：PlanStep.kind 加复制语义（否决：复制是 spec/证据层属性，塞进步骤 kind 是错误归属层）。

**④ delta**：把"重跑"从隐式行为变为**显式分类证据**，是信任面从"跑了"到"证明了什么等级的稳健性"的语言升级；与 GRADE 阶梯互补。

---

## 6. 协议与数据文档标准（protocols.io / ISA-Tab / Datasheets / Model Cards / TRIPOD+AI）

**① 一手来源（已核验）**
- **Datasheets for Datasets**：Gebru et al. (2018), arXiv:1803.09010（后载 CACM 2021）——七节结构：Motivation / Composition / Collection / Preprocessing / Uses / Distribution / Maintenance【文献实据·本会话核验】。
- **Model Cards**：Mitchell et al. (2019), FAT\* 2019, DOI 10.1145/3287560.3287596——模型简报：分群体基准评估、intended use、out-of-scope uses、评估因素【文献实据·本会话核验】。
- **TRIPOD+AI**：Collins et al. (2024), BMJ 2024;385:e078378——27 项清单、六段（题目摘要/背景目的/方法/结果/讨论/其他），覆盖预测模型开发-验证-更新全周期，明确适用回归与 ML【文献实据·本会话核验（bmj.com/ tripod-statement.org/ EQUATOR）】。
- ISA-Tab：isa-specs.readthedocs.io——Investigation→Study→Assay 三层元数据+协议/因子引用【文献实据·本会话核验规范文档】。protocols.io：结构化分步协议平台，JSON 步骤结构【二手转述·强度较弱，未读 schema 原文】。

**② 机制**：文档标准 = 让"工件携带自己的适格性与局限"。Datasheet 管数据（来源/许可/组成/已知偏差），Model Card 管模型（预期用途/越界用途/分群体表现），TRIPOD+AI 管预测模型研究的**报告完备性**（区分开发/验证、缺失数据、超参调优、校准+区分度双报告等）。

**③ FAR-Lab 升级建议（挑最贴的 3 个）**【映射提案】
- **P1｜Datasheet → DatasetRequirement 结构化（schema）**：`availability` 枚举已对齐"获取通道"维度；补 `license?`、`provenance?`（来源+版本+内容寻址）、`knownLimitations?: string[]`。触发：export 的 ReproducibilityBundle 数据节——目前许可信息缺失直接卡 NeurIPS 类清单第 8 问（见 §7）。
- **P1｜Model Card 子集 → ModelSpec/StatReport（schema+确定性清单）**：`ModelSpec` 已有 tags；补 `intendedUse?/limitations?`；StatReport 层采纳 TRIPOD+AI 的双报告纪律：**区分度（现有 metric 点估计+CI）之外须有校准或可靠性的至少一种辅助证据**（EEL 可计算，advisory 起步）。TRIPOD+AI 27 项 FAR-Lab 直接可判定的子集（开发vs验证声明、数据版本、缺失处理、随机种子、超参固定、局限）并入 §7 导出清单。触发：export 门。
- **P2｜ISA-Tab/protocols.io（DEFER 倾向）**：Investigation-Study-Assay 与 Run-Plan-Spec 已同构，引入整格式无净增益；仅在 RO-Crate 信封解冻时借用其"因子/协议引用"概念。protocols.io 强项在湿实验协议版本管理，对计算型 EEL 非必需。

**④ delta**：现有 reproducibilityRequirements（自由字符串）无结构、不可判定；上述三个标准给出"每类工件最少必须携带什么"的现成答案，且都能落成确定性检查而非文案。

---

## 7. NeurIPS/ICML 可复现性清单

**① 一手来源**
- NeurIPS Paper Checklist 官方页（本会话全文核验）：https://neurips.cc/public/guides/PaperChecklist 。**16 项**【文献实据·本会话核验】：
  1) 理论贡献含证明思路；2) 数据集描述（含外部数据）含引用/出处/统计；3) 指出数据集自建/既有/子集；4) 描述预处理/特征工程/数据划分；5) 数据集使用许可/条款/适用性讨论；6) 训练细节（优化器/批量/更新步数）+所用库版本；7) 对照基线比较；8) 数据获取渠道/时间线/许可文档；9) 随机种子说明；10) 统计显著性细节（检验类型、多重比较、误差棒/CI）；11) 超参搜索范围与最终配置；12) 计算资源；13) 代码提交（若适用）；14) 全部代码+数据+复现主结果所需指令；15) 封闭模型 API 或受限数据的合理替代复现路径；16) 局限性。每项 yes/partial/no/NA+论文内 justification。
- 沿革：ML Reproducibility Checklist（Pineau 等，2017/2018 起）→ NeurIPS 2019 复现性程序 → 2021 并入 Paper Checklist【文献实据·官方博客核验】；JMLR 2021 NeurIPS 2019 复现性程序报告（Pineau et al.）【文献实据·公知，本会话未读原文】。
- ICML 采用类似清单【二手转述·本会话未核验条目原文，不逐条引用】。

**② 机制**【文献实据】逐项二元+理由的**作者自证清单**：不强制开源，但要求任何 no/partial 都有 justification——把"不可复现"从隐式变成显式声明义务。

**③ FAR-Lab 升级建议**【映射提案】
- **P0｜导出前确定性检查清单（确定性清单+schema）**：`ReproducibilityBundle` 增加 `reproducibilityChecklist` 块：取 NeurIPS 16 项中 FAR-Lab 可判定子集（2/3/4/6/9/10/11/12/14/16），每项映射到真实工件引用：数据→DatasetRecord+DatasetRequirement（许可=§6 缺口）；库版本→EnvInfo.versions+lockfileHash ✅已有；种子→analysisSeed/splitHash ✅已有；统计→StatReport.ci/test ✅已有；局限→信任面 limitations ✅已有；code→experiment 脚本+spec。结论：**多数项的证据已存在，缺的只是把它们收拢成带 yes/partial/no+引用的清单对象**。`reproducibilityRequirements:string[]` 保留为自由补充，不替代。触发：export 门（与 completion-gate 同级）。
- P1：清单结果上信任面（"可复现性：14/16 项有证据引用，2 项 partial+理由"）——比"我们有 reproducibilityRequirements"的可核验性高一个量级。

**④ delta**：现有 export 有 receipts/provenance（有证据），但无**面向外部的自证清单语义**；NeurIPS-16 是现成、权威、逐项可判定的模板，且直接提升竞赛评审面的可核验性。

---

## 净结论

1. **最高杠杆 = 补齐 plan 层冻结（RR stage-1/2 形态）**：实验层冻结已相当完整（StatisticsPlan+specHash+exploratory+analysisIteration），缺 `planHash/frozenAt` 冻结事件、偏离一等对象、依从性审计三件套；加上即成为完整"计划冻结→执行→依从审计→报告"工作流，且与既有 VersionDiff/BindingApproval 模式同构，无新信任模型。
2. **"最小完备"靠确定性门而非加字段**：AsPredicted-8（预注册完备性）与 NeurIPS-16（导出自证清单）都应实现为映射到既有字段的检查门，缺的少量字段（priorDataExposure、dataset license/provenance、ExperimentSpec.replication）是定点小增量——避免表单膨胀，保持最小架构。
3. **对抗协作是 B4 的差异化机会、pre-mortem 只做 prompt**：proponent/skeptic 分离（上下文隔离）+ 注册预测（复用 Comparison）+ 分歧保留（ACH 节点）可全部落在动作面；pre-mortem 证据中等，仅作计划评审的生成协议，不做 schema/徽章。复制分类（§5）则给信任面提供从"跑了"到"哪种稳健性"的证据等级语言。
