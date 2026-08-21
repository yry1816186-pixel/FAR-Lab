# W5 独立科学方法审查（任务书 §92 科学红队）

- 审查对象：`evidence/W1/run_7zez1a8ezbbrrgw9begtta0gsw.report.md`（P1 完整报告）、`evidence/W4/evaluation-report.md` + `eval/results/metrics.json`、`.far-run/far.db` 真实对象、`src/pipeline/stages/*.ts`
- 审查日期：2026-08-21。方法：逐问抽查存储对象（SQLite 直读 + `dist/app/composition.js`）、读管线源码中科学逻辑所在、交叉比对报告渲染与底层对象。
- 严重级定义：P0 = 科学诚信缺陷（造假/误导性呈现核心声明）；P1 = 方法学缺陷（结论或评估可被系统性扭曲）；P2 = 改进机会。

---

## Q1 结论可能无支撑吗？ — 判定：部分成立（P1）

**证据上限的实态**（`.far-run/far.db` 直读）：语料 8 篇中仅 5 篇有摘要（`contentDepth=abstract`），3 篇 `metadata_only` 未产出任何 claim；全部 15 条 verified claim 来自 5 篇摘要，其中 3 篇是 2009/2011/2016/2018 年综述。这是整个 run 的全部证据基础。

**假设陈述本身**基本可追溯到 claim：resistome 动员 ← `clm`"Understanding the extent of the resistome and how its mobilization…"；transformation ← "11 of the top 12 priority…naturally transformable"；biofilm-conjugation ← biofilms 2023 摘要；GEIs ← genomic islands 2009。且假设前提被诚实标注 `[stipulated]`（报告 §5），noveltyLabel 无 `novel_speculation` 滥用。这一层**未**超出证据。

**超出证据的部分**：
1. **计划规模参数无证据来源**：plan step 2"Recruit 20 hospitals…over 24 months"、资源"Approximately $2 million USD…36 months"（报告 §7）。无任何功效分析（power calculation）、无任何语料来源支撑该规模。5 篇摘要（多为 2018 年前综述）→ 20 家医院/24 个月/200 万美元的前瞻性多中心设计，是模型编造的"看似合理"规模，非证据推导。
2. **证伪规格中的全部定量阈值**（见 Q4）同属无来源承诺。
3. 系统仅在一处自我标注了这一点：hyp_k57p 的 uncertainty 列有"The exact threshold for 'significant' environmental mobilization is arbitrary without prior data"——但只覆盖了 6 个假设约 15+ 个编造阈值中的 1 个。

**结论**：机制层陈述未越界；计划规模与决策阈值层存在系统性"证据-承诺比例失衡"，且无任何门禁（deterministic gate）拦截这种失衡。定级 P1。

---

## Q2 证据挑选？ — 判定：成立（P1，本审查最实质的发现）

三层证据链均指向同一结论：

**第一层：检索结构偏向。** `src/pipeline/stages/retrieve.ts` L157-163：5 个搜索目标中仅 1 个是 counter（1 条 distinct 查询 × openalex），discovery+supporting 占 4 席。更关键的是 L59-65 `firstQuery()`：schema 允许 2 条 counter 查询（L24 `.min(1).max(2)`），但代码**只执行每类别的第一条**——即使模型规划了 2 条反证查询，第 2 条也被静默丢弃。本次 run 实际仅 3 条 distinct 查询串。

**第二层：反证查询未取回反证内容。** counter 查询"limitations horizontal gene transfer antibiotic resistance hospital studies"按插入序返回的前 3 篇（文档 1-3）为："Antibiotic resistance in the environment"（metadata_only）、"HGT of ARG in Biofilms"、"ARG in Waste Water"（metadata_only）——全是主流主题文献，其中 2 篇无摘要直接被 claim 提取排除。15 条 claim 中**零条**是 null result / 失败重复 / 方法学批评类内容。R-05 强制的是反证**查询存在性**，未验证反证**结果实质性**（无任何检查确认 counter 查询返回了含反证词汇的内容）。

**第三层：反证关系是模型换标签，rationale 是常量模板。** `.far-run/far.db` 直读证实：
- 12 条 counter 关系的 rationale **全部**是同一字符串 `"critique-linked counter evidence"`（`src/pipeline/stages/falsify.ts` L188-196 `mkRelation` 硬编码），29 条 supports 关系是 `"critique-linked supporting evidence"`。零实质理由，无法审计"为什么该 claim 反驳该假设"。
- 同一 claim 同时支撑和反驳不同假设：`clm_ek4kdxhkeb08vk0k6bwqrqryx4`（transformable pathogens）是 3 个假设的 supports + 2 个假设的 contradicts；`clm_bc58wtq3…` 同时是 hyp_8ga8 的 contradicts 和 hyp_k57p 的 supports。方向完全由 critique 调用即时标注，无一致性校验。
- stance 语义对开放式 explanatory 问题不适定：`evidence.ts` L23-24 要求 stance 相对"研究问题"——对"What mechanisms drive…"这类开放问题，几乎任何机制性 claim 都"supports the question"（它是问题的一个答案）。这直接解释了 41/56=73% supports 的不对称。
- 报告 §4 把这些模板关系渲染为"**关键反证**"——呈现强度超过存储事实（DB 中 strength=unrated、rationale 为模板）。

**结论**：检索结构（1:4）、结果实质（0 条真反证）、关系层（模板 rationale + 即时换向）三层一致表明"counter-evidence"在当前实现中是**结构性装饰**而非科学运作。W4 的 counter-evidence 确定性指标（"5/5 claim-producing runs > 0"）测量的就是这个装饰层。定级 P1；若在对外材料中将这些关系呈现为"系统检索并纳入了反证"，则升级为 P0 风险。

---

## Q3 假设多样性实质？ — 判定：部分成立（P1：novelty 语义；P2：多样性度量）

6 个簇的实际内容（DB clusterKey 直读）：biofilm-conjugation 主导（3 个 paraphrase 被正确聚簇）、GEI 载体、transformation 主要、transduction 主要、"T+T 比 traditionally assumed 更重要"（= 簇 3+4 方向的并集）、整合性 resistome 动员。

**多样性的真实部分**：paraphrase 聚簇有效（cluster-1 抓住 3 条同义候选，11→6 去重比 0.60 是真实的）；三策略生成 + 确定性归一（未提及者保持 distinct）是诚实的机制。

**问题一（P1）：novelty 标注语义未披露。** `hypotheses.ts` L399-403：novelty 判定 prompt 明确"Judge only from the provided evidence"——noveltyLabel 是**相对本 run 的 5 篇摘要**，不是相对科学文献。但报告 §5 与 UI（`web/src/i18n/dict.ts` L248-250）只显示裸标签"混合/证据立足/新推测"，无任何"语料相对性"说明。读者会将其读作文献级新颖性判定。对 Track-1 Direction-A（假设生成）这是核心指标语义失真。且无任何 per-hypothesis 先验艺术检索（prior-art search）——"biofilm-conjugation dominant"是教科书共识，其 novelty=0.3 由同一模型在同一 5 摘要语料上自评。

**问题二（P2）：多样性由生成模型自评。** 聚簇判断（cluster-dedup 调用）与候选生成同模型同语料；"distinctnessRationale"是模型自我声明。簇 5（T+T rival）作为簇 3/4 方向并集存活，说明"机制差异"判定粒度停留在机制类别选择轴上——即语料本身枚举的教科书三分类。系统是**证据约束地重新发现了语料中的分类**，这不是 bug（by design），但意味着"多策略假设生成"当前产出 ≈ 领域专家读完同样 5 篇摘要会写出的集合。

---

## Q4 证伪规格可执行？ — 判定：成立（P1，对"可判定门禁"的证伪）

抽样两个规格：

**hyp_k57p（rank 1）**：">70% of high-usage wards"、"conjugation >50% and >1.5x the next"、">30%/<15% mobilization"——查 `falsify.ts` L137-141 系统 prompt：明确要求模型给出"a DECIDABLE decision rule (a comparison, ratio, threshold, or explicit if-then criterion)"但**不要求、也不提供任何阈值推导依据**；payload 只有假设 + claims 列表，无处锚定 70%/1.5x/30%。`FalsificationSpec` schema（`src/domain/`）无 thresholdBasis/provenance 字段。结论：这些数字是模型编造的貌似合理值（plausibility fabrication），系统按设计生产它们。

**hyp_gzyq（rank 4）**："median T/C > 2 AND the lower bound of the 95% confidence interval for median T/C is > 1.5"——中位数的置信区间需要明确的统计程序（如 binomial-based interval），规格未指定；3-5 个采样点的中位数 CI 基本无功效。规格在统计上不可执行，但通过了"可判定"检查。

**completenessCheck 只查表面语法**：`falsify.ts` L66-77 `hasDecidableSemantics` 是正则集合（`/[≥≤><]/`、`/ratio|threshold|fold/i`、`/\d\s*%/`、if-then 模式）。它验证"含比较词"，不验证：阈值可推导性、被比较量是否可测、decisionRule 与 support/falsification 条件的一致性、样本量/功效、统计程序正确性。**判别力为零的直接证据**：W4 metrics 显示单次调用的 baseline-direct 通过率 30/30=100%，高于 FAR-Lab 自身 24/25=96%——一个"确定性可判定门禁"无法区分多阶段系统与单次调用，说明它认证的是语法形式而非科学可执行性。

**诚实的部分**：不通过时降级 testability=untestable_currently 且如实展示（hyp_bjps30 报告中可见）；1 个阈值被自标"arbitrary"。但 15+ 个编造阈值中仅 1 个被标注，且该标注不随 decisionRule 呈现（藏在 §8 不确定性长列表里）。

---

## Q5 不确定性低估？ — 判定：部分成立（P1：meta 不确定性缺失；P2：传播不全）

**§8 渲染范围**（`export.ts` L347-351）：只渲染 claim.uncertainties + hypothesis.uncertainties。以下系统性不确定性**无对象承载、无渲染**：
1. **语料覆盖偏差**：全部证据 = 5 篇摘要；3 篇 metadata_only 被静默排除出 claim 提取（仅在 §2 表格深度列可见，未升格为不确定性声明）；3 条 distinct 查询串、`firstQuery` 丢弃每类第 2 条规划查询（含 counter）。
2. **摘要 ≠ 全文**：claim 绑定在摘要层（verbatim quote gate 对 abstract），而证伪规格承诺全文层量值（plasmid 组装、Hi-C、per-ward 统计）——摘要证据与规格量值之间的粒度鸿沟未声明。
3. **单一模型视角**：生成、聚簇、novelty、批评、打分全部由 deepseek/deepseek-chat 单模型承担（novelty/排名 rationale 已标 producer，但"单模型系统性盲区"这一不确定性本身未被列为不确定性）。
4. **语料时效**：5 篇中 3 篇 2009-2016 年综述。

**分数 uncalibrated 传播**：做得较好——报告 §6 每个维度 + overallRationale 均带 `[producer=…; calibration=uncalibrated_llm_judgment]`；UI `ScorecardsTable.tsx` 有 disclaimer（dict.ts L709）。缺口：报告 §9"缺失项：无已知缺失项"未提 bundle 里的非确定性 limitation；假设列表的 noveltyLabel 无 calibration 语义说明（见 Q3）；排名顺序本身在 UI 呈现时仍可能被读作有分辨力的排序（disclaimer 一段话 vs 数字化 0.6409 vs 0.6364 的呈现不对称——两个假设 composite 差 0.0045，在 uncalibrated 判断下的差异不具科学意义，但呈现为 rank 1 vs rank 2）。

---

## Q6 反馈修订科学性？ — 判定：大体不成立（修订是真实的因果再设计）；残留 P2

对比 v1（W1 报告 §7 + DB 归档工件）与 v2（DB 当前 plan）及反馈原文：

**超出措辞复制的实质设计变更**（DB 直读证据）：
- 新增 2 条 metrics："Proportion of ARG sharing events attributable to clonal expansion…vs. HGT"、"Core-genome SNP distance distribution between isolates sharing ARGs"——反馈原文没有这两个指标，是操作性转化。
- step 3 新增 SNP typing/系统发育分析 + 新失败条件"Insufficient phylogenetic signal to resolve clones"（反馈未提）。
- step 4 新增混杂控制方案："include phylogenetic relatedness as covariate or use mixed models with random effects for clones"（反馈只说"add clonal-resolution controls"，未指定统计方法）。
- step 6 新增显式分类规则："classify as HGT if (i) not same clonal cluster (>10 SNPs) or (ii) ARG on MGE absent in clonal background"。
- decisionRules 新增证伪条款："if >50% of apparent ARG-sharing events are explained by clonal transmission…the resistome mobilization hypothesis is falsified"——这是新科学内容。

**残留问题（P2）**：">10 SNPs"阈值再次无来源（与 Q4 同根）；修订后假设的 falsification spec 未重新生成——但系统诚实追加 uncertainty"falsification spec predates revision to v1…re-validate before decision use"；qualityDelta="improved"是 LLM 自评（已被标注 uncalibrated）。

**结论**：修订机制通过了"因果修订而非重新措辞"的检验，包含新指标、新失败条件、新判定规则；不是把专家措辞复制进 plan。

---

## Q7 评估公平性？ — 判定：部分成立（P1：judge 输入构造系统性偏向；基线本身非稻草人）

**基线不弱（不成立的部分）**：`eval/lib.mjs` `baselineTaskPrompt` 是用心的强基线——要求与 FAR-Lab 相同的 falsification 字段结构、相同 plan 决策规则四字段、"never fabricate sources"、同一 provider 同一 key；baseline-direct 在确定性 completeness 检查上 30/30=100%。单次调用 vs 多阶段是系统对比的本质，不算削弱。

**judge 输入构造不对称（成立，P1）**：`eval/llm-judge.mjs` L75-76——direct/rag 的假设被抽成**只剩 statement + mechanism**；L103 + L49-53 `fmtHyps` 渲染时 FAR-Lab 带 uncertainties（≤3 条，渲染为"counter-evidence/uncertainty notes"），基线**永远**显示"(none stated)"。但基线原始输出（`baseline-direct.jsonl` 直读证实）包含 `assumptions`、`predictions`、`falsification.confounders`、`alternativeExplanations` 和 `limitations` 字段——这些内容在送判前被丢弃。judge 的 one_line_reason 直接暴露了该伪影：P4 direct 被评"no counter-evidence or uncertainty notes"、P3 rag 被评"no stated assumptions or predictions"——**对基线实际输出而言是事实性错误的评价**，judge 只是在描述被裁剪后的输入。因此 cec 4.75 vs 1.00 的差距有相当部分是输入构造伪影，不是系统差异。

**叠加偏差**：(a) 格式签名去盲——唯一带 uncertainty notes 的列表即 FAR-Lab，seeded shuffle 的盲化被格式特征击穿；(b) judge 与三个系统同模型（DeepSeek 自我偏好，W4 报告已披露 NOT independent）；(c) n=4、单 judge、单次调用、无方差无显著性；(d) FAR-Lab 列表经多阶段精修天然更长更结构化，长度偏好仅有一句"Do not reward length alone"约束，无测量。

**缓解**：W4 报告将 judge 标为 AUXILIARY 且确定性指标独立支撑方向（0 结构化反证关系、94.4% 引用不支撑、P5 双基线造假）。但 judge 输入不对称这一缺陷本身**未在评估报告中披露**。hq 4.75 vs 3.25 应视为未证实（uninterpretable），cec 差距应以确定性指标为准。

---

## Q8 复现声明诚实？ — 判定：基本不成立（声明诚实）；残留 P2

**做对的部分**：`bnd_4bnfh7mcfem6n9wye7qtv5jfnq.bundle.json` limitations 第一条明确："模型环节为 LLM 生成、具有非确定性：bundle 可复放的是输入快照、模型元数据、receipts 与工件哈希，不保证重新生成逐字节一致的输出"；`far verify` 的 replayGuidance（`src/app/verify.ts` L182-198）逐条重申"能核验什么/不能承诺什么"；receipts 记录 `modelVersion: deepseek-v4-flash`、requestHash/outputHash、latency、usage；executionMode live 100%。第三方**能**做的（核验 receipts、按 hash 取回来源快照、比对导出工件、从存储对象确定性重渲染报告）与**不能**做的（再生成相同 LLM 输出）在 bundle 与 verify 路径中说清了。

**残留缺口（P2）**：
1. 报告 §9（读者最常看的工件）渲染"缺失项：无已知缺失项"，**不含**非确定性 limitation——它只活在 bundle JSON 里；报告正文给出的是确定性渲染承诺（"每一节均来自持久化对象"）但未同步 LLM 生成层的不可复现性。
2. `bundle.modelMetadata` 只钉住请求的 `modelId: deepseek-chat`，未聚合 served `modelVersion: deepseek-v4-flash`（要挖到 receipts 才能看到）——供应商侧换版时 bundle 级元数据不报警。
3. `codeRevision: "unknown"`（workspace 非 git repo）——重放所需代码态未钉住。

---

## P0/P1/P2 汇总

**P0（科学诚信缺陷）：0 项成立。** 未发现执行造假、引用造假、隐藏失败或伪造 provenance；失败路径（P4/P5/P6）如实呈现。最接近 P0 的风险点：报告 §4 将模板 rationale 的关系呈现为"关键反证"——当前定 P1，若对外材料以此声称"系统纳入了文献反证"则升级。

**P1（方法学缺陷）：5 项**
1. 证据-承诺比例失衡无门禁：5 篇摘要支撑 20 医院/24 月/200 万美元计划与 15+ 无来源阈值（Q1+Q4 同根）。
2. 反证结构性装饰：1:4 检索配比 + `firstQuery` 丢弃第 2 条 counter 查询 + 反证查询取回 0 条反证内容 + 12 条反证关系全部模板 rationale + 同一 claim 双向标注 + 开放问题下 stance 语义不适定致 73% supports（Q2）。
3. noveltyLabel 语料相对语义未披露、无先验艺术检索（Q3）。
4. completenessCheck 为纯正则、判别力为零（基线 100% 通过 > FAR-Lab 96%），却以"确定性可判定门禁"名义呈现（Q4）。
5. LLM-judge 输入构造不对称（基线被裁剪到只剩 statement+mechanism）+ 格式签名去盲 + 同模型 n=4，差距不可解释且缺陷未披露（Q7）。

**P2（改进机会）：4 项** — §8 缺 meta 不确定性（语料覆盖/摘要≠全文/单模型/时效）；报告 §9 缺非确定性 limitation、bundle 缺 served modelVersion、codeRevision unknown（Q8）；修订引入的新阈值（>10 SNPs）无来源（Q6）；composite 0.6409 vs 0.6364 的排名差在 uncalibrated 下无科学意义但呈现为确定名次（Q5）。

---

## 总结："研究级"宣称是否成立

**当前不成立——这是一个研究级的诚实性/溯源脚手架，包裹着模型合理性（model-plausibility）级别的科学内容。**

真实的强项：fail-closed 门禁、verbatim claim-locator 绑定（58/58）、来源核验（100%）、P5 诚实弃权 vs 双基线造假、可见失败、确定性渲染、receipts 全 live、bundle 复现声明诚实。这些是多数 LLM-科研工具不具备的工程-诚信基础。

未达到"研究级"的科学差距（按杠杆排序）：
1. **证据充分性无门禁**：没有任何检查阻止"5 篇摘要 → 20 医院前瞻性研究"的规模跳跃。计划规模与阈值需要来源、功效分析或显式 stipulated 标记（像假设前提那样）。
2. **反证是结构而非内容**：需要 (a) 反证查询结果实质校验（返回内容含反证词汇/类型），(b) 关系 rationale 必须是针对该 claim-假设对的具体论证而非模板，(c) stance 语义按假设方向而非开放问题定义。
3. **可判定检查需升级为语义检查**：被比较量的可测性、阈值来源字段、规格内部一致性、最低统计程序声明；否则不应称为"确定性可判定门禁"。
4. **novelty/多样性需要外部锚**：per-hypothesis 先验艺术检索（哪怕一次文献查询）+ 语料相对语义在所有呈现点披露。
5. **评估工具自身需同等审查**：judge 输入构造必须对称（把基线的 limitations/alternativeExplanations 送判或全部不送），并在 W4 报告中披露本审查发现的输入不对称。

关键判断：上述差距全部可修，且修复方向都不需要推翻现有架构——它们是把"形式确定性门禁"（绑定/语法/哈希）延伸到"实质科学门禁"（充分性/来源/一致性）的问题。系统的诚实层使这些缺陷**可被发现**（本次审查即证据），这本身是与"研究级"目标兼容的必要条件，但不是充分条件。
