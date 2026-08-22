# Wave-S / D1：证据-假设推断的形式化理论（贝叶斯确认 + 论证框架）尽调

- 日期：2026-08-22。方法：WebSearch + 出版方页面核验（核验时间同日）。只读调研，未改任何代码。
- 对照的真实实现（任务简报给定，本会话未重读源码）：claim-claim 关系四类 + not_comparable 默认、topic 预过滤 + 成对 LLM 裁决、claim→hypothesis supportingLinks（文本 proto-warrant）、GRADE 确定性 4 级、Robin 锦标赛 + Bradley-Terry/ILSR、ACH 交叉表。约束：zod-only/TS 单仓；LLM 只做语义判断，聚合与推断确定性或显式概率；无效应量体系（claim 是命题抽取）。
- 标注约定：【文献实据】= 本会话核验的文献主张；【映射提案】= 我们向 FAR-Lab 的工程映射（工程判断，非文献直接主张）；UNVERIFIED-xxx = 出处细节未能本会话核验，仅标题/链接核验。

---

## 1. 贝叶斯确认理论的操作化：命题级 LR / Bayes factor

### ① 一手来源
- Jeffreys H (1961). *Theory of Probability*, 3rd ed., Oxford: Clarendon Press。BF→证据强度分带的原始出处（1–10 substantial、10–30 strong、30–100 very strong、>100 decisive；不同转载版本对低端带命名不一致），经 StatLect 词条核验存在与分带内容。【文献实据】
- Kass RE, Raftery AE (1995). "Bayes Factors." *Journal of the American Statistical Association* 90(430):773–795（JSTOR 2291091，被引 23000+）。Table 2 以 2·log₁₀(B₁₀) 分带：0–2 bare mention、2–6 positive、6–10 strong、>10 very strong。【文献实据】
- Zlotnick J (1972). "Bayes' Theorem for Intelligence Analysis." *Studies in Intelligence* 16(2):43–52（CIA）。命题级证据（非数值效应量）按似然比逐条更新假设几率；LR=证据对假设的**诊断性**。此概念直接进入 Heuer 的 ACH 方法。【文献实据】
- Kent SM (1964). "Words of Estimative Probability." *Studies in Intelligence* 8(4):49–65（CIA）。口头概率词→几率区间的标准化图表（"almost certain"≈9:10 等）。【文献实据】
- Mosteller F, Youtz C (1990). "Quantifying Probabilistic Expressions." *Statistical Science* 5(1):2–34（Harvard DASH 全文）。18 个口头概率词的最优认知数值 + 频率分布：**个体间离散极大**，同一词的赋值分布跨数十个百分点。【文献实据】
- Reagan RT, Mosteller F, Youtz C (1989). "Quantitative meanings of verbal probability expressions." *Journal of Applied Psychology* 74(3):433–442（PubMed 2737992）。医师群体映射，同样高方差。【文献实据】
- Lund SP, Iyer G (2017). "Likelihood Ratio as Weight of Forensic Evidence: A Closer Look."（PMC7339646；期刊名 Journal of Research of NIST——期刊名 UNVERIFIED-journal）。prior odds × LR = posterior odds 在法庭证据命题层的规范用法 + LR 与 BF 的区别。【文献实据】
- Karvetski et al. (2013). "Structuring and analyzing competing hypotheses… with probability scales."（Springer，DOI 10.1007/s40070-013-0001-x；期刊名 UNVERIFIED）。**ACH + 概率标尺的直接先例**：对 ACH 交叉表加数值似然更新，含对分析者的实验评估。【文献实据】
- Fitelson B (1999). "The Plurality of Bayesian Measures of Confirmation and the Problem of Measure Sensitivity." *Philosophy of Science* 66(S3):S362–S378。不同确认度量（差/比/似然比族）对同一 E-H 对可给出冲突结论——"度量敏感性问题"。【文献实据】
- Eells E, Fitelson B (2000). "Measuring Confirmation and Evidence"（PDF 核验存在；venue UNVERIFIED）。度量综述，LR 度量的优点论证。【文献实据-存在】

### ② 机制要点
- 贝叶斯确认的核心操作**不需要效应量**：把"claim 为真/该文献报告了 X"当作事件 E，假设 H₁/H₂ 竞争，则确认度=P(E|H₁)/P(E|H₂)。Zlotnick/Kent 一脉证明情报分析在纯命题层就是这么干的：假设几率 = 先验几率 × 各证据 LR 连乘（条件独立假设下）。【文献实据】
- verbal→数值的桥有两条文献路线：(a) Kent/Mosteller 的词→数值（点值不稳定，**必须带区间**）；(b) Jeffreys/Kass-Raftery 的连续值→序数带（把任意 LR 值折叠回有限证据强度等级，恰与 GRADE 4 级的序数性同构）。【文献实据】
- 连乘聚合 = 对数域求和 = **log-linear 池**（见第 5 节），全部算术确定性可做。
- 关键弱点：证据项相关（同一文献簇/同一作者群/相互引用）→ LR 连乘会重复计数。情报与法庭文献都承认此为 LR 体系的主要失效面。【文献实据（Lund & Iyer 讨论 LR 局限）+ 映射提案（对应到文献簇去重）】
- Fitelson 度量敏感性 → 必须显式选定一个度量族（LR 族）作为权威约定并在输出中披露，否则不同实现间结论可翻转。【文献实据】

### ③ FAR-Lab 可计算落点
- **verbal→LR 区间映射表**（zod config，TS 纯函数）：`{relation: supports|weakens|contradicts|qualifies} × {certainty 4 级} → [LRmin, LRmax]`。带内取几何中点参与计算，边界参与敏感性界；分带锚定 Jeffreys/Kass-Raftery 阈值，但**具体数值是本产品约定**（披露为 convention，config 可覆盖）。【映射提案】
- **假设级确认度 = Σ log LR(link)**，确定性算术；按独立来源数封顶（同一 sourceId 的多条 claim 只计一次最大 |log LR|——直接复用 Wave-S 已提案的 independent-source 计数，从文本规则升级为有算术语义的量）。条件独立破缺以"来源去重 + 封顶"处理，不做全相关建模。【映射提案】
- 输出序数带（Jeffreys 风格 5 档）与现有 GRADE 4 级并列显示：数值层给排序依据，序数层给人读。【映射提案】
- LLM 职责不变且缩小：LLM 只产出 relation + certainty + 置信自评（供第 4/5 节聚合），**不产出任何最终数值聚合**。【映射提案】
- 与 ACH 直接对接：Karvetski 2013 证明 ACH 交叉表 × LR 更新是已发表的做法；我们的 ACH diagnosticity 列可从"±计数"升级为"每证据 log-LR 列求和"。【文献实据-先例 + 映射提案】
- 优先级：**高（本报告最高）**。核心代码量小（映射表 + 对数域求和 + 带折算，<300 行 TS），却把"平面多数裁决"换成有理论谱系的推断语义。

### ④ 不可行者直说
- 不可行：给单个口头词映射**点值** LR（Mosteller/Reagan 方差数据直接否决）；无先验来源时的"客观先验"（先验只能显式配置或默认 1:1 并披露）。【文献实据+映射提案】

---

## 2. 论证框架（Dung AF / BAF / 可废止逻辑 / 计算论证）

### ① 一手来源
- Dung PM (1995). "On the acceptability of arguments and its fundamental role in nonmonotonic reasoning, logic programming and n-person games." *Artificial Intelligence* 77(1–2):321–357（DOI 10.1016/0004-3702(94)00041-X）。抽象 AF：有向攻击图 + grounded/preferred/stable 语义。【文献实据】
- 双极（BAF）体系：Cayrol & Lagasquie-Schiex（IRIT）系列——"On the Bipolarity in Argumentation Frameworks"（NMR 2004 系列，IRIT PDF 核验存在，作者归属以 PDF 为准）、"Gradual Valuation for Bipolar Argumentation Frameworks"（ResearchGate 核验）、TAFA "An Axiomatic Approach to Support in Argumentation"（PDF 核验）。support（deductive/necessary/evidential 三型）+ attack 共存。【文献实据】
- Potyka N (2020). "Bipolar Abstract Argumentation with Dual Attacks and Supports." *KR 2020*（proceedings.kr.org/2020/69 PDF 核验）。pro/con 论证 + 关系建模决策问题。【文献实据】
- Yu A (2023). "A Principle-Based Analysis of Bipolar Argumentation Frameworks"（hal.science 核验；刊名 UNVERIFIED）。七类 BAF 语义的公理化比较。【文献实据】
- Polberg et al. (2018). "Empirical Evaluation of Abstract Argumentation: Supporting Attackers and Attackers of Supporters."（ScienceDirect 核验，IJAR？刊名 UNVERIFIED）。BAF 语义的实证评估。【文献实据-存在】
- 复杂度：Woltran 等 TU Wien DBAI 讲义"Computational Complexity of Abstract Argumentation"（PDF 核验）：preferred 语义下 credulous acceptance NP-complete；Dunne & Bench-Capon "Preferred Arguments are Harder to Compute than Stable Extensions"（ResearchGate 核验）+ "The computational complexity of ideal semantics"（AIJ，ScienceDirect 核验）：preferred 相关判定到多项式层级第二层；Charwat/Dunne/Woltran/… "Methods for solving reasoning problems in abstract argumentation"（AIJ，ScienceDirect 核验）：SAT/ASP 归约是实际解法；ICCMA 竞赛（核验存在）。【文献实据】
- **渐进语义（gradual semantics）**：QBAF（量化双极框架）base score + 强度传播——"Aggregative Semantics for Quantitative Bipolar Argumentation Frameworks"（arXiv 2603.06067 核验）；Cocarascu & Toni 系"Aggregating Bipolar Opinions through Bipolar Assumption-Based Argumentation"（KCL Pure 核验）；truth-discovery × QBAF（CEUR Vol-3768 核验：base score + dialectical strength 计算真假发现）。真实系统先例：评论/意见聚合、虚假信息检测、推荐解释。【文献实据】
- Carneades：Gordon TF, Prakken H, Walton D (2007). "The Carneades model of argument and burden of proof." *Artificial Intelligence*（ScienceDirect S0004370207000677 核验；卷期页 UNVERIFIED）。证明标准四档：scintilla of evidence / preponderance of evidence / dialectical validity / beyond reasonable doubt；前提三型（ordinary/presumption/exception）。Gordon & Walton (2008) "Proof Burdens and Standards"（Springer 章节 + Leipzig PDF 核验）。Bex 等 "Burdens and Standards of Proof for Inference to the Best Explanation"（florisbex.com PDF 核验；刊名 Law, Probability & Risk？UNVERIFIED-venue）。【文献实据】
- 可废止逻辑（Prakken/Vreeswijk、Governatori）：本会话未单独核验原始文献；其功能（规则例外下的撤销）与 BAF+证明标准在我们的场景下能力重叠，不单独引入。【UNVERIFIED——按不下转】

### ② 机制要点
- Dung AF 只看攻击图与扩展（冲突集/免攻击集）；preferred = 极大可采纳集，给出"多相容世界观"而非单一打分。【文献实据】
- BAF 加 support 边；我们的 claim 图（contradicts/weakens/supports/qualifies）**结构上是天然 BAF**，qualifies 可落成 dual 边或带符号权重。【映射提案】
- 渐进语义不走扩展，走数值不动点：节点 base score 经 attack/support 边迭代传播得 dialectical strength——与"GRADE 确定性做底分 + 关系边做修正"完全同构，且**多项式可算、结果唯一**。【文献实据+映射提案】
- 复杂度边界：preferred 语义判定 NP-complete/Π₂ᴰ，SAT/ASP 求解器实践上能解大图（ICCMA 规模），但引入"选哪个扩展"的语义承诺问题；grounded 语义唯一且多项式，但信息最保守。【文献实据】
- Carneades 证明标准 = **可采纳性阈值谓词**：给定 pro/con 论证权重分布，"preponderance"= pro 加权 > con 加权，可递归求值。负担转移（burden of proof）显式建模。【文献实据】

### ③ FAR-Lab 可计算落点
- **QBAF 渐进语义作为 claim 图确定性聚合层**（高优先，与第 1 节 LR 层互补）：节点 base score 由 GRADE 确定性映射（可再用 LR 表底分）；边权 = LR 区间几何中点的 log 值（supports 为正、contradicts/weakens 为负）；TS 实现 = 加权不动点迭代（收敛判据显式），全程无 LLM。替代"逐对裁决平面多数"。【映射提案】
- **Carneades 式证明标准进假设证据体评级**（中高优先）：Wave-S 已提案 hypothesis 级证据体评级（floor+独立来源+worst-RoB）；补一层显式证明标准枚举输出：`{scintilla, preponderance, clear_and_convincing-ish}`——每个假设给出"在何种证明标准下成立"，映射为对聚合强度的阈值判定（纯 TS）。这把"评级"变成"评级 + 门槛语义"，评审可解释性显著提升。【映射提案】
- grounded 语义可做交叉检验：与渐进强度排序不一致的节点（冲突敏感点）标记为 ACH 诊断线索。【映射提案，低优先】
- 规模判断：claim 图在数百~数千节点、边密度受 topic 预过滤限制的量级，渐进语义和 grounded 都是平凡可算；**不需要引入 AF 求解器依赖**（保持 zod-only/TS 单仓约束）。【映射提案】
- 优先级：**高（本报告第二地基）**——但取的是 BAF/QBAF + 证明标准这条"数值渐进"路线，不是 Dung 扩展语义路线。

### ④ 不可行者直说
- **不建议**：preferred/stable 扩展枚举作为主聚合语义——(a) 判定复杂度到多项式层级第二层【文献实据】；(b) 多扩展需额外承诺选哪一个，引入语义任意性；(c) 对我们"假设排序 + 证据体评级"的产品问题，渐进强度 + 门槛已覆盖决策需求。引入 ICCMA 级求解器 = 打破 zod-only/TS 单仓约束，收益不成比例。【映射提案】
- 可废止逻辑单独引入：不加新能力（例外已被 qualifies/contradicts + 证明标准覆盖），不引。【映射提案】

---

## 3. IBE（最佳解释推断）形式化与"简单性"维度

### ① 一手来源
- Lipton P (2004). *Inference to the Best Explanation*, 2nd ed., London: Routledge（经 IEP "Simplicity in the Philosophy of Science" 与 Routledge Encyclopedia 词条核验其框架）。loveliness vs likeliness：简单性/一致性/解释力/统一性是"可爱性"维度，与"可能性"（真概率）必须区分。【文献实据】
- Niiniluoto I. "Explicating Inference to the Best Explanation"（PhilPapers 核验；年份/venue UNVERIFIED）。IBE 的显式化/形式化尝试：以解释优良性打分选假设。【文献实据-存在】
- van Fraassen 的 "best of a bad lot" 反对（IBE 只在候选集含真者时可靠；*Laws and Symmetry*，1989——反对内容经检索核验存在，出版细节 UNVERIFIED）。【文献实据】
- MDL：Rissanen 体系——"Minimum Description Length Revisited"（World Scientific，原作者团队，核验）；MDL 综述（MDPI *Entropy* 24(2):269 核验；"Learning with the MDL Principle"（JASA 2025，Taylor & Francis 核验）。MDL 要求**假设能被形式化为编码**且需描述数据（ScienceDirect topics 核验其前提）。【文献实据】
- 批评：Occam 原则"作为无理性基础的文化偏好受到攻击"（"Razor sharp: the role of Occam's razor in science"，*Annals of the New York Academy of Sciences*，DOI 10.1111/nyas.15086 核验；作者 UNVERIFIED）；"Simple or Simplistic? Scientists' views on Occam's Razor"（Dialnet PDF 核验：40 位科学家访谈，实践态度高度审慎）；"Simple Models in Complex Worlds"（*Minds and Machines*? Springer 链接核验，刊名 UNVERIFIED）。实体计数依赖个体化方式（语言依赖）——多个批评共同点。【文献实据】
- AIC 与多假设：Yanco et al. (2020)（S1 报告已核验）把 Chamberlin 多工作假设与 AIC 多模型推断接通——但前提是**有数据拟合的模型族**。

### ② 机制要点
- IBE 形式化 = 假设 × 解释优良性维度（简单/一致/解释范围/类比）加权打分。文献共识：这些维度是**启发式先验的代理**，不是独立的真值证据；Bayesian 化路径是让可爱性进入先验而非似然（Lipton 自己的调和方向）。【文献实据】
- MDL/AIC/BIC 全部要求：模型族 + 数据 + 拟合度量 + 复杂度罚项。AIC/BIC 罚参数个数；MDL 罚编码长度且**依赖编码语言选择**（不变性问题，文献明示）。【文献实据】

### ③ FAR-Lab 可计算落点
- **不建议做数值简单性维度**：我们的 claim 是命题抽取，无模型族、无拟合数据 → AIC/BIC/MDL 的数学前提整体缺失；任何"假设复杂度分"只能靠 LLM 数机制/实体数——恰落入文献批评的实体个体化任意性。【映射提案（基于文献实据的前提缺失）】
- 可行的小事（中低优先）：(a) "一致性"维度**有**确定性代理——假设与既有 claim 图的矛盾边数（QBAF 聚合强度天然含此项），无需单独发明；(b) "best of a bad lot" 防御：假设排序输出永远携带"候选集生成方式 + generate-more 逃逸口"（Kaimen 算子已提供），在 UI 披露"排序仅在候选集内有效"。【映射提案】
- Lipton 的 loveliness/likeliness 区分可作为**输出文案的语义纪律**：排序依据（evidence strength）与解释吸引力（novelty/mechanism 叙述）分列展示，不合并成单一分。低成本，纯 schema 层。【映射提案】

### ④ 不可行者直说
- MDL/AIC/BIC 进排序：不可行（无数据拟合对象）且文献风险高（简单性作为排序维度的批评是实打实的实证+哲学双重批评）。类比（analogy_driven 生成策略）保留在生成侧，不进排序打分。【映射提案】

---

## 4. 二阶不确定性：对评级本身的置信建模

### ① 一手来源
- SEP 词条 "Imprecise Probabilities"（plato.stanford.edu 冬 2021 存档核验；作者 UNVERIFIED，疑为 S. Bradley）。Walley (1991) *Statistical Reasoning with Imprecise Probabilities*（Chapman & Hall——经典出处，本会话仅经 SEP 间接核验）。核心：用概率集/区间而非单一概率承载"对自己的概率不确定"。【文献实据】
- Utkin VA (2003). "Decision Making with Imprecise Second-Order Probabilities."（ISIPTA 2003 论文 PDF 核验）。二阶不精确概率下的决策算法。【文献实据】
- Morgan MG (2014). "Use (and abuse) of expert elicitation in support of decision making for policy and practice." *PNAS*（PMC4034232 核验；卷期 UNVERIFIED）。专家引出（含其可靠性建模）的规范与滥用警告。【文献实据】
- Cooke 经典模型：Cooke RM (1991) *Experts in Uncertainty*（Oxford UP——经典出处）；Colson A, Cooke RM. "Expert Elicitation: Using the Classical Model to Validate Experts' Judgments."（rogermcooke.net PDF 核验，被引 240+；venue REEP UNVERIFIED）；Eggstaff et al. (2014) *Reliability Engineering & System Safety*（ScienceDirect 核验）：**seed 变量数研究中，performance-weighted 聚合稳定优于等权**，且对 seed 数不敏感。【文献实据】
- GRADE/证据分级评分者间可靠性："Interrater reliability of grading strength of evidence varies with the complexity of the evidence in systematic reviews"（ResearchGate 核验存在；作者/刊名 UNVERIFIED）。**证据体越复杂，评级者间一致性越差**——为"LLM 裁决产出的评级必须带二阶信息"提供了直接经验依据。【文献实据-存在】

### ② 机制要点
- Cooke 模型：用一组有已知答案的 **seed 变量**（校准题）测每个专家的统计准确性（calibration）× 信息量（informativeness），得 performance weight，再做**线性池**聚合。要点：权重来自可复现的校准测试，不来自声誉。【文献实据】
- 对"评级由 LLM 产生"的适配：LLM 裁决器 = 专家；seed 集 = 人工标注的 claim 对关系/确定性金标样例；裁决器权重 = 其在 seed 集上的表现。Cooke 证据表明该加权稳定优于等权。【文献实据+映射提案】
- 二阶表示的最小充分形式：评级不是单一 label 而是 4 级上的**分布**（或区间），分歧度（分布展平程度）随证据复杂度上升——与 GRADE 复杂度-一致性研究互相印证。【文献实据+映射提案】

### ③ FAR-Lab 可计算落点
- **裁决输出分布化**（高优先，与第 5 节绑定）：一次 LLM 裁决改为输出 relation×certainty 上的分布（或 k 次自一致采样计数），schema 上 certainty 从 enum 变为 `Array<{level, p}>`（向后兼容：旧 enum = p=1 的退化分布）。存储与计算仍全确定性。【映射提案】
- **seed 集与 Cooke 权重**（中优先，一次性成本）：建 50–100 条人工金标 claim 对（关系+确定性），离线测各裁决模型/温度配置的 calibration；产出每 judge 权重表进 config。Eggstaff 2014 表明 seed 数不必大。何时做：当我们需要对外声称"裁决器可靠"或引入多模型裁决时。【映射提案】
- **二阶披露**（低成本，随分布化免费获得）：评级输出附 (a) 分布（或区间 [P(low), P(high)] 的序数带重叠描述），(b) 分歧度指标（归一化熵）。UI 上"high (confidence: moderate, judges 3/5)"比假精确的"high"诚实——符合不确定披露纪律。完整 imprecise-probability 机器（p-box、Choquet）不引入。【映射提案】
- Cooke 对"评级聚合"的适用性判定：**适用且代价低**，因为它把"该信 LLM 多少"从猜测变成一次可复现测量的产物；局限（文献承认）：seed 必须与目标任务同分布（我们的 seed 须覆盖多领域文献体裁）。【文献实据+映射提案】

### ④ 不可行者直说
- 不做：二阶贝叶斯全链条（对分布再上的分布）——推断成本与可解释性代价大，Utkin 一类方法是为决策优化设计，我们只需披露不需在其上做最优决策。【映射提案】

---

## 5. 概率/类别判断的聚合规则

### ① 一手来源
- Genest C, Zidek JV (1986). "Combining Probability Distributions: A Critique and an Annotated Bibliography." *Statistical Science* 1(1):114–135（Project Euclid 全文核验，被引 1500+）。聚合公理化的奠基综述：线性池/对数池/贝叶斯共识的公理刻画与不可能性取舍。【文献实据】
- Clemen RT, Winkler RL (1999). "Combining Probability Distributions From Experts in Risk Analysis." *Risk Analysis*（Springer 核验）；(2007). "Aggregating Probability Distributions." 载 *Advances in Decision Analysis*（Cambridge，Duke PDF 核验）。现代实践综述：小专家数下简单几何/对数聚合表现好。【文献实据】
- Satopää VA, et al. (2014). "Combining multiple probability predictions using a simple logit model." *International Journal of Forecasting* 30(1):344–356（核验）。**extremization**：聚合 log-odds 乘 γ>1 外推，预测锦标赛数据上稳定提升；机理 = 个体间信息部分重叠导致聚合偏保守（arXiv:1501.06943，Satopää/Pemantle 等，核验）。【文献实据】
- "The Case of Logarithmic Pooling"（arXiv:2202.11219 核验）。对数池（log-odds 加权平均 = 加权几何平均）的公理优势与失效条件（任一成员赋 0/1 概率 → 聚合锁死）。【文献实据】
- Log-Linear Pool to Combine Prior Distributions（*Bayesian Analysis* 7(2)，Project Euclid 核验）。对数线性池实现细节。【文献实据】
- Seckárová 等 KL-based pooling（PMLR v58 核验）：KL 类池与线性/对数池在常规情形表现相近。【文献实据】

### ② 机制要点
- **线性池**（加权算术平均）：保单值边缘（marginalization）、保一致同意；不满足 externally Bayesian（先聚合后更新 ≠ 先更新后聚合）；对分歧取妥协值，双峰意见被平均成无人持有的中间态。【文献实据】
- **对数池**（log-odds 加权平均）：externally Bayesian、与贝叶斯似然更新代数同构（正是第 1 节 LR 连乘的形式）；失效条件：零概率锁死（一个 judge 给 0 → 聚合 0）、需归一化、对权重敏感。【文献实据】
- **中位数**：对离群鲁棒（Genest-Zidek/Clemen-Winkler 框架内讨论的顺序统计量池），但浪费强度信息、多事件划分下不保概率一致性。【文献实据-框架 + 映射提案（其取舍陈述）】
- **extremization**：当 judges 共享信息源（我们的场景：同一文献池、相似训练数据的 LLM）时聚合偏保守 → γ>1 外推有益；γ 从校准数据估。若 judges 独立则 γ 应趋于 1。反向失效：judges 高度相关时外推会放大共同偏差。【文献实据】

### ③ FAR-Lab 可计算落点
- **类别判断（relation/certainty）聚合 = 概率层对数池**：每个 judge 给 4×5 类别分布 → log 域加权和（权重来自第 4 节 seed 校准）→ 归一化 → 取 argmax + 分布披露。零概率锁死防护：judge 分布先验平滑（+ε，ε 显式入 config）。全部 TS 确定性代码（<100 行）。【映射提案】
- **默认聚合器选择**：多 judge/多模型裁决 → 对数池；单 judge 自一致 → 同样对数池（权重=1/n）；**不用简单多数投票**（多数投票是线性池在 one-hot 上的退化，继承了妥协偏差且丢了强度信息）。中位数不采用：我们 judge 数小（2–4），中位数稳定性收益不抵信息损失。【映射提案，规则本体是文献实据】
- **extremization 谨慎引入**：只在有 seed 集校准出 γ 时启用；无校准数据时 γ=1 并披露"可能保守"。【映射提案】
- 与 Bradley-Terry 排序的关系：对数池聚合的是**证据/关系判断**；假设排序仍走 Robin+BT（BT 本身就是对数几率模型，二者在数学上同族——排序层无需改动）。【映射提案】

### ④ 失效条件登记（进 config 文档）
- judges 共享训练偏置 → 共同偏差被放大（extremization 更甚）；judge 分布 one-hot → 锁死风险；分歧双峰 → argmax 掩盖（必须同时披露分布，不许只报众数）。【文献实据+映射提案】

---

## 净结论

**形式化层地基取两条**：
1. **log-LR 确认累积层**（第 1 节 × 第 5 节）：verbal→LR **区间**表（锚定 Jeffreys/Kass-Raftery 分带）+ 来源去重封顶 + judge 对数池聚合。谱系硬（Zlotnick/Kent→Karvetski 把 ACH 与概率更新接通的先例直接对口我们的 ACH）、代码量小、全程确定性、把现有"平面多数"和文本性 supportingLinks 升级为有算术语义的确认度。这是最高优先。
2. **QBAF 渐进语义 + Carneades 证明标准层**（第 2 节）：claim 图天然是 BAF；base score 来自 GRADE 确定性、边权来自 LR 表，不动点迭代（唯一解、多项式）产出 claim/假设级 dialectical strength；假设输出附证明标准判定（在何种举证门槛下成立）。这是"论证框架"中真正可计算、可解释的部分。

**明确不引入**：(a) preferred/stable 扩展语义作为聚合器——复杂度到多项式层级第二层 + 扩展选择的语义任意性 + 需外挂求解器，对排序/评级产品目标无增量决策价值（grounded 可留作交叉检验）；(b) MDL/AIC/BIC 数值简单性——数学前提（模型族+数据拟合）在命题级 claim 体系不存在，且简单性作排序维度有实证+哲学双重批评文献；(c) 完整 imprecise probability 机器——区间+熵披露已满足诚实性要求；(d) 可废止逻辑独立栈——能力被 qualifies 边 + 证明标准覆盖。

**次序建议**：先做 1（含第 5 节聚合器），再做 2，第 4 节的 seed 集（Cooke 权重）在需要多模型裁决或对外可靠性主张时补建。
