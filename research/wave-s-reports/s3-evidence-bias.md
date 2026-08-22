# S3 尽调：证据综合与偏倚管理（系统综述/循证决策传统）

日期 2026-08-22。只读调研，一手来源经 WebSearch/WebFetch 核验（卷期页/DOI/官方站点见各项；CIA 原文页超时，以 Wikipedia 压缩版+同行评审描述交叉核验）。贴地文件：`src/domain/claim.ts`、`src/domain/plan.ts`、`src/domain/source.ts`、`src/pipeline/stages/retrieve.ts`、`src/pipeline/stages/evidence.ts`、`src/pipeline/stages/falsify.ts`、`src/pipeline/stages/rank.ts`、`web/src/components/detail/HypothesesTab.tsx`。
标注约定：【文献实据】= 来源直接陈述的机制；【映射提案】= 我把机制映射到 FAR-Lab 的设计建议。已吸收不重复（delta-only）：GRADE claim 级 4 级确定性阶梯（`gradeClaimCertainty`）、CounterRefine、关系 topic 预过滤、证据卡判分、judge 反宽大、SWAN ResearchStatement 导出。

---

## 1. PRISMA 2020：检索-筛选-纳入的可审计流

**① 一手来源**
- Page MJ, McKenzie JE, Bossuyt PM, et al. "The PRISMA 2020 statement: an updated guideline for reporting systematic reviews." *BMJ* 2021;372:n71, DOI 10.1136/bmj.n71。
- Page MJ 等同期 E&E 长文（rationale 逐条展开），PMC8005925（bmj.com/content/372/bmj.n71 与 pmc.ncbi.nlm.nih.gov/articles/PMC8005925/ 均核验）。
- 官方站点 prisma-statement.org：checklist、flow diagram 四模板（新综述/更新综述 × 仅库/含其他来源），CC BY 4.0（已抓取核验）。

**② 机制要点**【文献实据】
- 27 项 checklist + 四阶段流程图：identification（按来源分列：databases/registers 与 other methods）→ screening → included；每个记录最终必须落入唯一桶：identified → duplicates 等 "removed before screening" → screened → excluded（无理由不计）→ sought for retrieval → not retrieved → assessed for eligibility → excluded **with reasons** → included。
- 核心不变量是**守恒与对账**：各阶段计数可互相勾稽，任何被丢掉的记录都有去向和理由。
- 诚实边界：PRISMA 是**报告**规范而非研究行为规范——它约束"你怎么交代"，不保证"你怎么做"。可借的是对账结构，不是"照做即系统综述"。

**③ FAR-Lab 升级建议**【映射提案】
- 现状：`retrieve.ts` 的 searchReceipts（R-05 顺序保证）+ 零结果级联已记录"问了什么、拿到什么"；`plan.ts` 有 `inclusionCriteria: string[]`；但 `evidence.ts` 的 corpus admission 只追加文档，**没有每记录的处置台账**（筛掉了什么、为什么）。
- 提案：确定性 ScreeningLedger（每 run 一份）：`{ queryReceiptRefs[], recordsIdentified(按 provider), removedBeforeScreening(用已有 src/pipeline/stages/title-normalize.ts 做 DOI/标题归重), recordsScreened, excluded: [{recordRef, reasonCode}] , docsAdmitted }`；加一条守恒断言进 guard/verify 阶段：`identified === removed + screened`、`screened === excluded + admitted`。产品面在 EvidenceTab 渲染 PRISMA 形流程块，并纳入 SWAN 导出。
- 优先级 **P2**（纯簿记、零模型调用、审计价值高）。触发：竞赛演示"为什么是这 30 个来源"+ plan 含 inclusionCriteria 即自动生成。

**④ delta**：receipts 回答"问了什么"，PRISMA 形台账回答"扔了什么、为何扔"。诚实声明：我们做的是 API 元数据+摘要级的机器筛选，非双人全文 eligibility——对外表述用 "PRISMA-shaped audit ledger"，不得自称 PRISMA-compliant review。

---

## 2. 风险偏倚工具族：RoB2 / ROBINS-I / NOS

**① 一手来源**
- RoB2：Sterne JAC, Savović J, Page MJ, et al. "RoB 2: a revised tool for assessing risk of bias in randomised trials." *BMJ* 2019;366:l4895。官方实现 riskofbias.info + Cochrane Handbook Ch.8（methods.cochrane.org/bias 与 cochrane.org Handbook 均核验）。
- ROBINS-I：Sterne JAC, Hernán MA, Reeves BC, et al. "ROBINS-I: a tool for assessing risk of bias in non-randomised studies of interventions." *BMJ* 2016;355:i4919（全文 PMC5062054 核验）。
- NOS：Wells GA, Shea B, O'Connell D, et al. Newcastle-Ottawa Scale，Ottawa Hospital Research Institute 官方页（ohri.ca，核验）；cohort 量表原件 NCBI 托管 PDF（NBK115843/appe-fm3）。

**② 机制要点**【文献实据】
- RoB2 五域：randomization process / deviations from intended interventions / missing outcome data / outcome measurement / selection of the reported result。每域一组 **signalling questions**，答案五档（Yes / Probably yes / Probably no / No / **No information**），经**确定性算法**映射为域判定 Low / Some concerns / High；总体判定取最差域（worst-domain 规则，可越过算法以记录理由的方式覆盖但须说明）。
- ROBINS-I 七域：confounding / selection of participants / classification of interventions / deviations from intended interventions / missing data / measurement of outcomes / selective reporting；判定 Low / Moderate / Serious / Critical，**以一个假想靶试验为基准**评级。
- NOS：star 计分（Selection 4 + Comparability 2 + Outcome/Exposure 3 = 9 星），是清单求和结构——**无信号问答、无算法聚合**，跨域星数直接相加。
- 三者共同的设计精髓：**低层事实问题（人/LLM 答）与高层判定（算法聚合）分离**；"No information"是合法答案且天然倾向不利判定（fail-closed）。

**③ FAR-Lab 升级建议**【映射提案】
- 现状缺口确认：无 per-source 偏倚评估。`gradeClaimCertainty` 的 risk_of_bias 代理是 `verifiedBinding`（引文-原文对齐），这是**文本完整性**检查而非**研究效度**检查——两者在 GRADE 语汇里不同维。
- 提案：`SourceDocument` 加半结构化 `riskOfBias: { studyDesign: 'rct'|'observational'|'case_control'|'review'|'preprint'|'model_report'..., domains: [{ name, signalling: [{q, a: 'yes'|'probably_yes'|'probably_no'|'no'|'no_information'}], judgement }] }`。域集不照抄 RCT 五域（我们的池是 OpenAlex/arXiv 混合文献），改用 ROBINS-I 的通用框架（confounding/selection/measurement/missing data/selective reporting）+ 文献型补充域：预印本未同行评审、资助/利益冲突声明缺失、样本/数据量披露。LLM 只答信号题（须带 locator 引文锚，沿用 claim-locator 纪律），**judgement 与 overall 由确定性 worst-domain 函数聚合**（照抄 RoB2 算法形态）。
- 消费点：(a) `gradeClaimCertainty` 的 risk_of_bias 域升级为 `verifiedBinding && sourceRoB <= 'some_concerns'`（high RoB 再多降一级）；(b) rank 阶段同分裁决。
- 优先级 **P1**（直接补自查缺口，且复用既有"LLM 信号+确定性聚合"工程模式）。触发：SourceDocument schema 变更。
- 明确不采纳：NOS 式星数求和（跨域不可通约相加）；只取其"域清单"参考价值。

**④ delta**：从"引文对齐=低偏倚"的单 bit，升级为"域-信号-算法判定"三层结构，且 No information 默认不利，与我们 fail-closed 纪律同构。

---

## 3. GRADE 完整体系：证据体级评级、SoF、EtD

**① 一手来源**
- GRADE Handbook（GRADE Working Group 官方手册，gdt.gradepro.org/app/handbook/handbook.html）——**已整本抓取核验**，含 Ch.4 不精确性、Ch.5 起点与升降级、Ch.6 终评、Ch.11 跨关键结局综合、Ch.16 逐结局评级、Ch.19-25 EtD。
- SoF 表操作规范：Cochrane Handbook Ch.14（cochrane.org 当前版）。新 GRADE Book：book.gradepro.org。

**② 机制要点**【文献实据】（以下均为手册原文直陈）
- 评级单位是**单个结局的整个证据体**（all studies contributing to that outcome），不是单个研究更不是单个陈述。
- 起点：RCT=high，观察研究=low。降级五因子：risk of bias（若多数证据来自低 RoB 研究，不得 ↓2）、imprecision（serious/very serious 两档，Ch.4 有效样本量与 CI 判据）、indirectness、inconsistency、publication bias（Ch.5.2.5 + Table 5.2，降 1-2 级；**该域无统计检验时的定性考量**：非发表研究的存在、研究规模、小研究小数量、lag bias；手册明示"降级超过一级需谨慎，本域最多视为 ↓1 一级"）。
- 升级三因子（仅观察证据）：大效应（RR>2 或 <0.5 → +1；RR>5 或 <0.2 → +2）、剂量-反应、合理混杂反而削弱表观效应（各 +1）。
- 跨结局综合：整体质量 = **关键结局中的最低值**（floor 规则）。
- SoF 表：每结局一行——人数/研究数、相对效应+绝对效应、确定性、**编号脚注逐条给出每个评级的理由**，附 plain-language 结论。
- EtD：独立框架，从证据到建议的显式桥（优先级/确定性/价值偏好/利弊平衡/资源/公平性/可接受性/可行性），手册有整章规范。

**③ FAR-Lab 升级建议**【映射提案】
- 双层化：**claim 级阶梯保持不动**（`gradeClaimCertainty` 是"陈述层确定性"，定位正确）；新增 **hypothesis 级证据体评级**（falsify→rank 交接处）：确定性函数 over 该假设的全部 supporting claims：
  - 起点 = supporting claims 的 gradeCertainty 最低值（GRADE 的 floor 规则直接同构）；
  - ↓1 若全部支持 claim 追溯到 ≤2 个**不同 sourceDocument**（claim 数不算数——同源多 claim 非独立证据，这是 GRADE"证据体不是研究数堆砌"的确定性转译）；
  - ↓1 若任一关键 claim 的来源 RoB='high'（接 #2）；
  - ↓1 若 contradiction 信号占比超阈值（inconsistency 域的体级形态）；
  - publication bias 域接 #4 的定性旗标。
- SoF 形产物：每 hypothesis 一行 `{支持 claim n、独立来源 n、bodyCertainty、编号脚注（直接由现有 downgraded[] 数组拼接）}`，HypothesesTab 渲染 + SWAN 导出复用。
- 优先级 **P1**（自查缺口"无证据体级综合判断"的正解；全部确定性代码、零新增模型调用）。触发：falsify/rank schema 修订。
- 诚实边界：Ch.4 的 CI/有效样本量判据**不适用**（我们不抽效应量），imprecision 代理保持现状（claim 是否含量化表述）；绝对效应列在 SoF 中省略并注明原因。

**④ delta**：现状只有 claim 级 4 级阶梯 + 4 个代理域（缺第 5 域 publication bias）；缺体级聚合、独立来源计数、SoF 脚注面、EtD 桥。EtD 中"资源/公平性"等政策维度对科研计划场景过重，不引入；可取其"建议必须引用确定性+关键结局"的纪律进 rank 的 rationale。

---

## 4. 发表偏倚诊断：漏斗图/Egger/p-curve/z-curve 的适用边界

**① 一手来源**
- Egger M, Smith GD, Schneider M, Minder C. "Bias in meta-analysis detected by a simple, graphical test." *BMJ* 1997;315(7109):629-634（PubMed 9310563 核验）。
- p-curve：Simonsohn U, Nelson LD, Simmons JP. "P-Curve and Effect Size: Correcting for Publication Bias Using Only Significant Results." *Perspectives on Psychological Science* 2014;9(6)（作者版 PDF 核验）；同组 "P-curve: a key to the file-drawer" 2014。
- z-curve：Brunner J, Schimmack U. "Estimating population mean power under conditions of heterogeneity and selection for significance." *Meta-Psychology* 2020;4（期刊页 open.lnu.se 核验）。

**② 机制与适用判定**【文献实据】
- Egger 回归/漏斗图：输入是**同质结局的 (效应量, SE) 对、约 ≥10 项研究**；检验小研究效应，且无法区分发表偏倚 vs 真实异质性 vs 小研究低质量。
- p-curve：只需**显著性结果的检验统计量/p 值**，但要求这些研究检验**同一假设**；只分析显著结果。z-curve：同样只要 z 统计量，建模全分布，输出 ERR/EDR 并含偏差检验。
- **对 FAR-Lab 的适用判定（如实）**：我们的检索池是多源书目检索 + RRF 融合的主题记录集，(a) 无效应量抽取，(b) 无同质假设集——claims 是异质命题，(c) 单 run 记录量为几十条且非统计研究集合。**四种统计诊断全部不适用，不实现**。伪装漏斗图即造假仪表盘，违反 Mission §6。

**③ FAR-Lab 升级建议**【映射提案】
- 唯一合法迁移物：GRADE Ch.5.2.5 的**定性考量**（见 #3）——确定性旗标而非统计检验：`{ distinctProviders(检索源覆盖), preprintOnlySupport(支持证据全为预印本), corpusSize }`，命中即 body 评级 ↓1（对齐手册"本域最多降一级"），脚注写明"qualitative coverage heuristic (GRADE-style)，非 Egger/p-curve 统计诊断"。
- 既有部分抵消：多源检索 + RRF 已天然缓解单库索引偏倚（这是"覆盖面"论证，可写进脚注）。
- 优先级 **P3**（诚实边界优先于装饰性诊断；只随 #3 一起落地）。触发：body 评级实现时。

**④ delta**：负结果+理由：防止后续把漏斗图/Egger cargo-cult 到检索池上；记录"若未来出现真 meta 场景（Direction-B 实验聚合）才重新评估 z-curve"。

---

## 5. Toulmin 论证模型：claim→hypothesis 支持关系的论证结构

**① 一手来源**
- Toulmin SE. *The Uses of Argument*. Cambridge University Press, 1958（updated ed. 2003）。可核验二手：Purdue OWL Toulmin Argument、Springer 参考条目、McMaster 哲学系条目（均核验）。

**② 机制要点**【文献实据】
- 六要件：claim（结论）、data/grounds（援引的事实）、warrant（**数据→结论的推理许可**，通常隐含未陈述）、backing（支撑 warrant 本身的依据，如领域定律）、modal qualifier（论证强度的限定词：necessarily/probably/presumably）、rebuttal（主张失效的例外条件）。
- 关键论点：warrant 是**领域依赖**的（不同领域许可不同推理），且论证评估的主要工作量在**把隐含 warrant 显式化**；qualifier 不是含糊其辞，而是论证对自身强度的诚实陈述。

**③ FAR-Lab 升级建议**【映射提案】
- 现状盘点（比自查更乐观一点）：`falsify.ts` 的 `supportingLinks: LinkReason`（"why this claim supports THIS hypothesis"，≥20 字）已是**proto-warrant**；`counterLinks` 关系枚举含 `'qualifies'` 已是 **proto-qualifier**；`uncertainties` 吸收 rebuttal 角色。缺的是**结构化**：warrant 是自由文本，无法审计推理跳跃类型；qualifier 是关系标签而非强度模态。
- 提案：`LinkReason` 升级为 `{ claimId, warrant: { type: 'mechanistic' | 'empirical_generalization' | 'analogical' | 'authority', text }, qualifier?: 'necessarily'|'probably'|'presumably', backingClaimIds?: ClaimId[], rebuttalClaimIds?: ClaimId[] }`。LLM 提议 type+text；确定性校验：type ∈ 枚举、backing/rebuttal 引用的 id 必须解析到已 admitted claims（复用现有 id 过滤）、qualifier 缺省取 `presumably`（保守）。`'qualifies'` 关系获得语义落点。
- 优先级 **P2**（论证深度的真增量，schema 成本中等；warrant.type 分类学是我方映射，Toulmin 只给结构）。触发：falsify 链接 schema 修订。
- 契合点：qualifier 强制显式 = "不确定性保留"原则的语法化；warrant 显式化 = claim-locator 纪律（证据必须可溯源）在推理侧的对称物。

**④ delta**：从"一句话 why"到"类型化 warrant + 强度限定 + 可回链 backing/rebuttal"；anti-fabrication 收益：analogical/authority 型 warrant 在 rank 中可被降权。

---

## 6. Heuer ACH 原始 8 步：画布保真度审计

**① 一手来源**
- Heuer RJ Jr. *Psychology of Intelligence Analysis*. CIA Center for the Study of Intelligence, 1999, Ch.8 "Analysis of Competing Hypotheses"（cia.gov 资源页存在；直接抓取超时，步骤结构经 Wikipedia 压缩版 + SANS ISC 日记 + Dhami 同行评审描述三方交叉核验）。
- Dhami MK (2019) "The 'analysis of competing hypotheses' in intelligence analysis." *Applied Cognitive Psychology*，DOI 10.1002/acp.3550。

**② 机制要点**【文献实据】
- 8 步：1) 列出全部合理互斥假设；2) 列出显著证据与正反论证，**入矩阵前先给证据评 credibility × relevance**；3) 建 假设×证据 矩阵（单元格 consistent/inconsistent/N-A）；4) 精炼矩阵：**删除无诊断性证据**（对所有假设评级相同者不具区分力）；5) 按列不一致数得出暂定结论——**聚焦证伪/disconfirmation**（选不一致最少的假设），对抗确认偏误与 satisficing；6) **敏感性分析**：若关键证据错误或具欺骗性，结论会变多少——变动 credibility 重排；7) 报告全部假设的相对似然+被弃替代方案讨论；8) 识别**未来观察指标/里程碑**（迫使重新评估的 trigger）。
- 注意：Wikipedia 现行版把 7/8 压缩成 7 条标题；canonical 书内编号为 8 步（以 Dhami 2019 及 SANS 描述为准）。

**③ FAR-Lab 升级建议——画布审计结果**【映射提案】
- **已覆盖**：步 1（hypotheses 阶段 + alternativeExplanations）；步 2（claims + counterLinks）；步 3 的矩阵（relation 形态：每 claim-假设对有 supports/contradicts/weakens/qualifies，即单元格）；步 4 的警报半覆盖（B6 contrastivity：零证据绑定的假设=零区分性警告）；步 7 部分（rank 有相对排序，但"被弃替代方案讨论"未见）；步 8 大半（weakeningCondition/falsificationCondition/decisionRuleProvenance 即 indicator 纪律）。
- **缺口 A｜诊断性评分（步 4/5 的量化形态）**：per-claim diagnosticity 可**纯确定性**从已有关系数据算出——一个 claim 对全部竞争假设的关系分布越不均匀越具诊断性（如：contradicts H1 而 supports H2 = 高诊断；对全部假设同向 = 低诊断）。落点：falsify 后处理，随画布存储+渲染。P2，零模型调用。
- **缺口 B｜证据移除敏感性重评（步 6）**：移除/降权 top-k 最诊断 claim → 重跑 rank → 输出排序稳定性（"排序对移除证据 X 鲁棒/翻转"）。落点：rank 阶段确定性重算 + 画布标注。P2——这是与 Heuer 保真度差距最大的一步，也是"结论稳健性"主张的机械证据。触发：rank 修订。
- **缺口 C｜证据 credibility×relevance 预评（步 2 前置）**：claim 级已有 gradeCertainty 可充任 credibility；relevance 对应假设相关度——两者组合成矩阵入场分，P3（可并入 A 的权重）。
- **缺口 D｜步 7 的"被弃假设讨论"**：rank 导出加一段最低似然假设的出局理由（复用关系数据拼接），P3。

**④ delta**：现状 ACH 是**结构性的**（矩阵+对比性警报）而非**分析性的**（无诊断性度量、无稳定性检验）。A/B 两项均为既有持久化关系上的确定性后处理——不新增模型调用即把画布从"陈列"升级为"仪器"。

---

## 净结论

1. **最高杠杆 = 双层 GRADE**（#3）：claim 级阶梯保持，新增 hypothesis 级证据体评级 + SoF 形脚注表；核心新变量是**独立来源计数**（claim 数≠证据强度）与 **worst-of-critical floor 规则**，全部确定性可实现。#2 的 per-source RoB（RoB2 信号问答+算法聚合形态）是其 risk-of-bias 域的正确供数方，两者 P1 打包落地。
2. **发表偏倚如实判负**（#4）：Egger/漏斗/p-curve/z-curve 对无效应量、无同质假设集的检索池**不适用**，只迁移 GRADE 5.2.5 定性考量（覆盖单薄/纯预印本支持 → 最多降一级）；此负结果应成文防止后续 cargo-cult。
3. **ACH 缺口集中在两步确定性后处理**（#6）：per-claim 诊断性评分（关系分布均匀度）+ 证据移除敏感性重评（重跑 rank 报排序稳定性）——零模型调用补齐 Heuer 步 4-6 的量化形态；Toulmin（#5）以类型化 warrant+强制 qualifier 结构化 `supportingLinks`，与不确定性保留原则同构，P2。
