# Wave-S / D2：文献式发现（LBD）与假设生成深化尽调

- 日期：2026-08-22。方法：WebSearch + 官方页面/仓库核验（核验时间同日）。只读调研，未改任何代码。
- 对照的真实实现（任务简报给定，本会话仅抽验）：多源检索（OpenAlex/arXiv/Crossref/EuropePMC/S2）+RRF+listwise 重排+零结果级联（`src/sources/`）；假设生成 negative conditioning + Kaimen 算子（`src/pipeline/stages/hypotheses.ts`、`src/domain/hypothesis.ts`）；FIRE-Bench rediscovery（`eval/rediscovery.mjs`：固定 GT claim + 3-pass-median 原子分解 + TF-IDF 阈值匹配 + 边界带 3 票 LLM 裁决，judge v2.1；已核验源码注释：官方 repo 无 LICENSE、HF 数据集本环境不可达、种子集自建）。约束：zod-only/TS 单仓；模型多源 API（无本地模型依赖）；检索池每 run ≤数百级。
- 标注约定：【文献实据】= 本会话核验的文献主张；【映射提案】= 我们向 FAR-Lab 的工程映射（工程判断，非文献直接主张）；UNVERIFIED-xxx = 出处细节未能本会话核验。

---

## 1. Swanson ABC 模型与 time-sliced rediscovery 评估

### ① 一手来源
- Swanson DR (1986). "Fish Oil, Raynaud's Syndrome, and Undiscovered Public Knowledge." *Perspectives in Biology and Medicine* 30(1):7–18（PubMed PMID 3797213）。LBD 开山：鱼油（血液粘度/血小板聚集）与雷诺综合征（血管痉挛）两片互不引用的文献合成治疗假设。【文献实据】
- Swanson DR (1988). "Migraine and Magnesium: Eleven Neglected Connections." *Perspectives in Biology and Medicine* 31(4):526–557（PMID 3075738）。第二条经典案例：11 条镁缺乏↔偏头痛的文献桥接。【文献实据】
- Swanson DR (1996). "Undiscovered Public Knowledge: a Ten-Year Update." *KDD-96*（AAAI PDF 核验）。十年自述 + Smalheiser 合作回顾。【文献实据】
- Swanson DR, Smalheiser NR (1997). "An interactive system for finding complementary literatures: a stimulus to scientific discovery." *JASIST* 48(5):418 (titled so; 卷期 UNVERIFIED-precise，PDF 核验存在)。ARBYS→Arrowsmith 前身。【文献实据-存在】
- Weeber M, Klein H, de Vries Robbé PF, Kors JA, Mons B (2001). "Simulating Swanson's Raynaud–Fish Oil and Migraine–Magnesium Discoveries."（Groningen 版题为 "Using concepts in LBD…"）*JASIST* 52(7):548–557。首次系统性重演两案例（概念图过滤 B 词）。【文献实据】
- DiGiacomo RA, Kremer JM, Shah DM (1989). "Fish-oil dietary supplementation in patients with Raynaud's phenomenon: a double-blind, controlled, prospective study." *Am J Med* 86(2):158–164（PMID 2536517，被引 287+）。**关键限定**：结论仅支持**原发性**雷诺（冷水耐受改善、血管痉挛延迟），继发性雷诺无效——成功案例的诚实版本。【文献实据】
- Henry S, McInnes BT (2017). "Literature Based Discovery: Models, methods, and trends." *J Biomed Inform* 72:67 (ScienceDirect S1532046417301909 核验)。规范定义：**open discovery 用于生成新发现；closed discovery 用于解释已知相关性/观察**（给定 A、C 找桥 B）。【文献实据】
- Kastrin A, Cestnik B, Lavrač N (2025). "Recent Advances and Future Directions in Literature-Based Discovery." arXiv:2506.12385（全文核验）。任务二分：hypothesis validation（closed）/ hypothesis generation（open）；KG 构建/深度学习/预训练-LM 三线综述。【文献实据】
- Thilakaratne et al. (2019). "A systematic review on literature-based discovery workflow."（PMC7924697）。time-sliced 评估定义：按截止日切分文献，pre-cutoff 训练、post-cutoff 验证未来共现。【文献实据】
- Moreau M (2023). "Literature-based discovery: addressing the issue of the subpar evaluation."（PMC9945845）。评估批评：rediscovery 任务不对称、间接确认、实例过少/过易的问题。【文献实据】

### ② 机制要点
- **ABC 形式定义**（Kastrin 2025 转述 Swanson）：文献集 L₁ 含 A–B 关系、L₂ 含 B–C 关系、且无文献直接连接 A–C，则 A–C 构成"undiscovered public knowledge"候选。closed = 已知 A、C 找 B（解释/验证）；open = 已知 A 找 B 与 C（生成）。【文献实据】
- **可验证成功案例清单（诚实版）**：(a) 鱼油/雷诺——1989 RCT 部分确认（仅原发性）；(b) 镁/偏头痛——Swanson 自己评估：**已有证据属间接（药理/生化），临床 RCT 当时不成立**（Kastrin 2025 转述）；(c) 1996 综述还列出 somatomedin/精氨酸/雌激素/阿尔茨海默等候选，均无同等确认。真实成功率极低——LBD 的价值在**候选生成**而非确认，这决定了它应落在我们的生成/排序环节而非证据裁决环节。【文献实据+映射提案】
- **time-sliced 评估协议**：以 cutoff 日截断语料（重放历史），只允许系统"看到" pre-cutoff 文献，检验其能否在 post-cutoff 文献中找到被确立的 A–C 连接（rediscovery）。已知偏差（Moreau 2023）：共现≠发现、任务不对称、易受发表风向污染。升级做法是 Weeber 式**固定历史案例重演**（更受控）而非纯统计共现。【文献实据】

### ③ FAR-Lab 可计算落点
- **FIRE-Bench 升级：时间切片蒙版**（确定性，`eval/` 层）：对每个 rediscovery 任务声明 `establishedYear`，跑评测时给检索阶段注入确定性 `from_publication_date ≤ establishedYear-k` 过滤（各 source API 原生支持日期过滤），把"对照已确立发现"升级为"隐去日期重演历史发现"。GT 集可扩：Swanson 案例对（1986/1988 cutoff，验收标准写明"原发性限定/间接证据限定"）+ Weeber 2001 重演协议作为方法论引用。成本：检索过滤器 + 任务 schema 两字段，<100 行。【映射提案】
- **closed-discovery 桥接算子（新 GenerationStrategy：bridge_completion）**：用户假设域 A 已知、某个反常/目标 C 已知时，从已检索池（≤数百篇）确定性计算 B 候选——A-文献簇与 C-文献簇的共享实体/主题词（OpenAlex topics、标题词 TF-IDF，全确定性），LLM 只做最后一步：给定 B 列表合成 A–C 机制假设并标注 B 证据位。这是 Arrowsmith two-node 的池内化版本，零新依赖。【映射提案】
- 与现有 negative conditioning 不冲突：closed 模式产出的假设同样进 previouslyProposed 差异化。
- 确定性/LLM 分工：B 候选生成、时间蒙版、GT 匹配=确定性；A–C 机制叙事=LLM。【映射提案】

### ④ 优先级
- time-sliced 蒙版：**高**（评测诚实性直接受益，改动极小）。bridge_completion 算子：**中高**（补齐"解释型"生成路径，Swanson 谱系最正统的一支）。

### ⑤ 许可/获取约束
- 无。全部为公开文献与公开 API。

---

## 2. 现代 LBD 方法谱系：Arrowsmith / 嵌入 / LLM 时代

### ① 一手来源
- **Arrowsmith**（arrowsmith.psych.uic.edu/arrowsmith_uic/，2026-08-22 探测在线；Smalheiser NR, Torvik VI, PMC2693227 教程核验）：输入两组 PubMed 文章（A 簇、C 簇），输出共享标题/摘要词 B 列表（按频率与 Jaccard 过滤，支持语义邻近/否定词过滤）。访问性：网页工具，历史上需免费注册；**无公开 API**；2024–2025 无新运营公告（搜索引擎无果，UNVERIFIED-beyond-2021）。【文献实据（机制与在线状态）】
- **嵌入路线**：Singh A et al. (2022). "SPECTER2." arXiv:2211.13308（AI2）；多任务 adapter（proximity/adhoc/classification）科学文献嵌入。许可：AI2 材料称 code MIT / weights CC-BY——**未逐字打开 LICENSE 文件，标 UNVERIFIED-precise**。调研中未找到"SPECTER 类嵌入被验证提升跨域 LBD rediscovery"的直接证据；2020–2025 深度学习 LBD 主线是 Cuffy & McInnes（2023, 2025, 综述转述，原文 UNVERIFIED-precise）与 Crichton et al. 2020（LINE 嵌入 + PubTator/BioGRID，PubMed 语料）。【文献实据（综述转述）】
- **LLM 时代**：
  - Si C, Yang D, Hashimoto T (ICLR 2025). "Can LLMs Generate Novel Research Ideas? A Large-Scale Human Study with 100+ NLP Researchers." arXiv:2409.04109（632+ 被引）。LLM 想法**新颖性评分高于人类专家，但想法池多样性显著更低**（成对相似度更高）。【文献实据】
  - Wang Q et al. (2024). "SciMON: Scientific Inspiration Machines Optimized for Novelty." ACL 2024 Long（aclanthology 2024.acl-long.18；代码 EagleW/Scientific-Inspiration-Machines-Optimized-for-Novelty，license 本会话未核验）。机制：检索"inspirations"（过去文献）→ 生成想法 → 与检索邻居显式比对优化新颖性。【文献实据】
  - Liu H, Huang S, Hu J, Zhou Y, Tan C (2025). "HypoBench: Towards Systematic and Principled Benchmarking for Hypothesis Generation." arXiv:2504.11524。194 个数据集（7 真实域+5 合成域）；最优模型合成基础案例 ground-truth 假设发现率 93.8%，难度升后跌至 38.8%；评估维度含 discovery/transferability/predictability/interpretability。配套 HypoGeniC（arXiv:2404.04326，"Hypothesis Generation with LLMs"）：假设=**可执行预测器**（LLM 将假设应用于测试数据、抽取标签、对错自动判分）；GitHub ChicagoHAI/hypothesis-generation **MIT（仓库页核验）**，含 HypoRefine（文献+数据 agentic 混合）。【文献实据】
  - LORE（2024/2025，PMC11851487 + medRxiv 2024.08.10）：LLM-ORE（LLM 开放关系抽取）+ LLM-EMB（LLM 嵌入）两阶段，构建可验证证据 KG 做疾病-基因关联预测；代码 jacobvsdanniel/LORE（license UNVERIFIED）。【文献实据】
  - **纠正种子假设**：LitLLM（arXiv:2402.01788，ServiceNow）是**文献综述写作 RAG 工具包**，不是假设生成/LBD 系统——不采纳。【文献实据】
  - Kastrin 2025 配套资源：github.com/akastrin/ida2025lbd——LBD 案例研究 + 可复现 docker notebook 的 benchmark（license UNVERIFIED）。【文献实据-存在】
  - ScienceDiscEval（arXiv 2412.01809）被综述列为 LM 科学发现最大评估集（提出/识别/推理数据生成子任务）。【文献实据（综述转述）】

### ② 机制要点
- Arrowsmith 的可移植内核=**双簇共享词 B 列表 + 频率/邻近度过滤 + 人工语义筛查**；其"语义邻近（间接关联）"与否定词过滤是对纯共现的关键改良。【文献实据】
- 嵌入路线未在领域无关设定下证明超过强检索基线；综述判断：深度学习 LBD 结果混合，LLM 融合（SciMON 的"新颖性比对生成"）是当前最有实证支撑的生成侧改进。【文献实据（综述结论）+ 映射提案（判断）】
- HypoGeniC 的关键贡献是**假设的可执行评测协议**（假设→应用于留出数据→自动判分），把"假设质量"从 LLM 打分变成确定性指标——但依赖可运行数据集，属 Direction-B 能力面。【文献实据】

### ③ FAR-Lab 可计算落点
- **SciMON 式"inspiration→novelty 条件生成"吸收进现有 prompt**（纯 prompt 层）：generate_hypotheses 时给 LLM 显式标注"已检索近邻 X 已提出 Y"，要求差异化——我们已有 negative conditioning + 近邻检索新颖性裁决，缺的是把"新颖性比对"从**事后裁决**前移为**生成时条件**（一步之遥，改 prompt 结构即可）。【映射提案】
- **HypoBench 难度分级命名对齐**：FIRE-Bench 报告增加"按目标发现难度分层"的披露（简单教科书级 vs 近期前沿级），引用 HDR 式发现率而非只报 P/R/F1——评估叙事升级，改动在报告层。【映射提案】
- 嵌入本地部署（SPECTER2）：**不做**——违反"模型多源 API、无本地模型"架构约束；如需嵌入分散度（第 5 节），走 API 嵌入或已有 TF-IDF。【映射提案】
- 确定性/LLM 分工：新颖性近邻检索与比对输入=确定性；差异化生成=LLM。【映射提案】

### ④ 优先级
- SciMON 式生成时新颖性条件：**高**（最直接强化现有核心环节）。HypoBench 难度分层披露：**中**。Arrowsmith 外部集成：**不做**（无 API）；其机制由第 1 节 bridge_completion 池内化。

### ⑤ 许可/获取约束
- HypoGeniC/HypoBench 代码 MIT（已核验）；SciMON/LORE/ida2025lbd license 未核验（引入前须核）；SPECTER2 许可宽松但需本地部署（架构上排除）；Arrowsmith 无 API、无批量访问承诺。

---

## 3. 知识图谱驱动假设生成

### ① 一手来源
- **UMLS**：NLM UMLS Metathesaurus License Agreement（nlm.nih.gov 核验）：免费但须签署协议；非独占、不可转让授权；Section 12 + 附录 1 列出各源词表额外限制（部分仅限站内/研究用途）。【文献实据】
- **SemMedDB**：SemRep（NLM/NIH）在 PubMed 摘要上跑 UMLS 产出的 SPO 数据库；下载要求已签 UMLS 协议（cthoyt/umls-downloader 工具行为佐证：UMLS 系许可下载流程繁琐是社区共识）。质量：实体识别/归一化错误率最高 **27%**（Kilicoglu 2020，经 Kastrin 2025 转述）。【文献实据】
- **OpenAlex**（help.openalex.org 核验）：**concepts 已冻结弃用**（不再为新作品计算，未来移除，无日期），由 **topics** 取代（2024 起，约 4500 个策展主题，4 层层级，works.topics/primary_topic 字段）；2026 年实体类型扩到 21 个（含新 grants 实体）、索引 4.77 亿 works。API 免费；数据许可 CC0（官方声明，本会话未重开页面逐字核验，UNVERIFIED-precise）。【文献实据】
- **KG 链接预测做假设候选的证据强度**：Borrego A, Dessì D, Ayala DIP, Hernández D, Osborne F, Reforgiato Recupero D, Buscaldi D, Ruiz MJE, Motta E (2025). "Research hypothesis generation over scientific knowledge graphs." *Knowledge-Based Systems* 315:113280, DOI 10.1016/j.knosys.2025.113280。方法（ResearchLink）：链接预测式假设生成，组合路径特征 + KG 嵌入 + **文本嵌入** + 文献计量；CSKG-600（600 条专家标注陈述）评测：**P@20=78.7%，比 TransH/TransD/RotatE 纯 KGE 基线（70.7–71.8%）高约 7pp**。证据性质=**专家判定的合理性（plausibility），不是被确认的发现**；作者自述纯链接预测路线"limited success"。代码开源情况未找到（UNVERIFIED）。【文献实据】

### ② 机制要点
- KG-LBD 证据图景：KG 链接预测可产生**排名合理的候选假设**（专家 plausibility 中等偏高），但 (a) 提升主要来自加文本特征而非图结构本身；(b) 无任何系统在"生成后被实验确认"层面有统计证据；(c) 高质量 SPO KG 仅生物医学有（且带错误率与许可摩擦），领域无关 KG（如 CSKG）覆盖与本体质量有限。【文献实据+综合判断】

### ③ FAR-Lab 可计算落点
- **不建 KG、不接 SemMedDB/UMLS**：三重否决——许可摩擦（须签协议+源词表限制）、仅生物医学（与 FAR-Lab 领域无关定位冲突）、错误率 27% 的上游会污染 claim 链。REJECT。【映射提案】
- **OpenAlex 检索输出升级为"KG-lite"**（确定性，零新依赖）：**本会话代码核验**：`src/sources/` 无任何 `concepts` 读取（无冻结劣化风险），`topics` 已进 snapshot 波动字段清单（`src/sources/snapshot.ts:28`）——但归一化层（`src/sources/openalex.ts`）与 `src/domain/` 均不保留 topics，且 `referenced_works`（引用 ID 列表）只存 count、列表被丢弃。两个小增量让 KG-lite 可用：(a) 归一化时保留 `topics`/`primary_topic` + `referenced_works`；(b) 用途：第 1 节 bridge_completion 的 B 候选（引用重叠/共享 topic，全确定性）+ 假设 derivation 的领域标签（topic 距离=类比卡 domainValidityCaveat 的量化输入）。【文献实据（上游 API 状态）+ 工程事实（本会话源码核验）】
- 链接预测管线整体：DEFER（证据 +7pp 不足以抵消基建复杂度）。【映射提案】

### ④ 优先级
- topics/referenced_works 归一化保留：**中高（一行级归一化增量，解锁 bridge_completion 与 analogyDistance）**。引用重叠 B 候选：**中**（并入 bridge_completion）。KG/链接预测管线：不做。

### ⑤ 许可/获取约束
- OpenAlex API/数据：免费、CC0（核验见上）。SemMedDB/UMLS：免费但协议门槛+领域限定，判不可行。ResearchLink：方法可引用，代码可用性未核验。

---

## 4. 跨域移植的结构化（S1 类比卡之外的增量）

### ① 一手来源
- S1（本目录 s1-question-hypothesis.md 第 5 节）已覆盖 Gentner 1983 结构映射/SME/Holyoak 多约束 + 类比卡模板；本节只补增量。
- Dunbar K (1995/1997). "The InVivo/InVitro Approach to Cognition"（Trends in Cognitive Sciences，PDF 核验）及 in vivo 系列实验室民族志：一小时组会录得 3–15 个类比、总计 99+；编码框架 local（同项目）/within-region（同领域）/cross-domain 三类。**核心发现：分子生物学实验室 ~98% 的类比是域内/项目内的**——"analogical paradox"：跨域类比在真实科学实践中稀少，域内类比承担发现主力。【文献实据】
- Kretz & Kresz (2014)（PMC4244599）复核 Dunbar 编码结果：专家类比绝大多数 within-category。【文献实据】
- TRIZ 实证：Shah/Smith 等 (2013). "Systematic Ideation Effectiveness Study of TRIZ." *ASME J. Mech. Des.* 135(10):101009：受控实验显示 TRIZ 提升 idea 的 Novelty 与 Variety，略降 Quantity；但 39 参数矛盾矩阵源于机械专利，跨域须改造（Pokhrel 2015 扩展非技术问题）；Cambridge *Design Science* (2021) 质疑发明原理究竟是确定性、随机还是域导向。【文献实据】
- Klenk & Forbus (2007). "Cross-domain analogies for learning domain theories"（Northwestern PDF 核验）：MAC/FAC——先按表面相似检索候选、再按结构映射精筛，计算上把"检索"与"映射"分离。【文献实据】
- 设计田野研究（Christensen/Schunn，i2insights 转述）：类比使用使团队想法产出率约翻倍（转述级，原文 UNVERIFIED-precise）。【文献实据（二手）】

### ② 机制要点
- 可操作结论一：**域内类比是常态且高效**——跨域移植应是显式触发的高成本路径（Kaimen `transplant` 算子），不是默认策略；GenerationStrategy 路由应偏向 near-domain（可用 OpenAlex topic 距离定义"near"）。【文献实据→映射提案】
- 可操作结论二：MAC/FAC 的**两段式（确定性粗筛→LLM 结构映射）**正是我们能在数百级检索池上跑的形态：先用确定性相似度筛类比源候选，LLM 只做因果角色对齐+disanalogies（S1 类比卡）。【文献实据→映射提案】
- 可操作结论三：Dunbar 的三级编码（local/within-region/cross-domain）本身可做成假设 derivation 的确定性标签（由 topic 距离阈值自动判定），让"类比距离"成为可披露字段而非玄学。【映射提案】

### ③ FAR-Lab 可计算落点 / ④ 优先级 / ⑤ 约束
- 落点：类比卡 schema 加 `analogyDistance: local|withinField|crossDomain`（由 OpenAlex topics 确定性计算）+ 路由规则"默认 withinField，crossDomain 需显式用户/算子触发"。优先级：**中**。约束：无（复用 OpenAlex 数据）。TRIZ 矩阵本体：**不采纳**（域绑定+实证争议）。

---

## 5. 假设池多样性度量

### ① 一手来源
- Olson JA, Nahas J, Chmoulevitch D, Norton MITH, Abbamonte M, Bendetowicz D, Webb ME (2021). "Naming unrelated words predicts creativity." *PNAS* 118(7)（PMC8237676，被引 315+）。Divergent Association Task：10 个词的**成对语义距离均值**（GloVe 嵌入）作为发散思维可靠客观测量。【文献实据】
- Kenett YN, Beaty RE et al.：语义距离线（ScienceDirect 2019，被引 236+）；Beaty & Johnson (2022) 语义距离自动评分（AUT）。【文献实据】
- Si et al. ICLR 2025（见第 2 节）：LLM 想法池成对相似度显著高于人类池——多样性是 LLM 生成系统的**已证缺陷面**，度量它有直接产品意义。【文献实据】
- Multi-Novelty (arXiv:2502.12700)：多样性=全部响应嵌入的**平均成对余弦距离 (1−cos)**。【文献实据】
- Chain of Ideas (arXiv:2410.13185)：以预定义 novelty+diversity 指标做 top 想法选择（度量进决策环的先例）。【文献实据】
- Farquhar S, Kossen J, Kuhn L, Gal Y (2024). "Detecting hallucinations in large language models using semantic entropy." *Nature* 630:625–630（被引 2100+）：按**语义簇**（而非字面）聚类后的熵——单问题不确定性度量，与池级多样性互补但不同物。【文献实据】

### ② 机制要点
- 文献共识度量族：(a) **嵌入分散度**=平均成对余弦距离（DAT/Multi-Novelty）；(b) **策略/类别覆盖**=离散标签分布（类别数/熵）；(c) **检索式新颖性**=与 top-k 检索邻居的距离。已知陷阱：嵌入分散度混同"多样"与"跑题"——须与覆盖类指标并列，不单独使用（Si 2025 即同时报告相似度与人工质量）。【文献实据+综合判断】

### ③ FAR-Lab 可计算落点
- **确定性披露指标（进 hypothesis-pool 导出与 UI）**，两级实现：
  1. **零成本级（先做）**：`strategyCoverage`=GenerationStrategy 枚举分布（熵+类别数）、`gapCoverage`=ResearchGap 七类分布、`analogyDistanceCoverage`=第 4 节标签分布——全部从已有结构化字段确定性计算，无嵌入依赖。
  2. **嵌入级（TF-IDF 先行）**：池内假设陈述的成对相似度矩阵（judge v2.1 已有 TF-IDF 基建，直接复用）→ 平均成对距离+去重簇数；嵌入 API 可用时平滑替换距离函数。
- 指标进两个位置：run 报告的确定性披露区（同 GRADE/独立来源数一列）；GenerationStrategy 路由的反馈信号（coverage 过窄→下轮强制换策略，类似 Chain of Ideas 的选择环）。【映射提案】
- 优先级：**高**（零依赖、直接回应 Si 2025 指出的 LLM 想法同质化缺陷、契合"确定性披露"产品叙事）。约束：无新许可；嵌入 API 费用按 run 量级可忽略。

---

## 净结论（最值得进重构）

1. **【映射提案-高】生成时新颖性条件 + 多样性确定性披露**（第 2/5 节）：把新颖性从事后裁决前移为生成时条件（SciMON 先例），并在 run 输出中披露 strategyCoverage/gapCoverage/池内分散度（TF-IDF 先行）。两者都贴着现有代码（`src/pipeline/stages/hypotheses.ts` prompt 结构 + `eval/rediscovery-judge.mjs` 的 TF-IDF 复用），零新依赖，直接强化已有差异化叙事。
2. **【映射提案-高】FIRE-Bench 时间切片蒙版 + bridge_completion 算子**（第 1 节）：任务 schema 加 `establishedYear` + 检索日期过滤（<100 行），把 rediscovery 升级为 Swanson/Weeber 谱系的历史重演协议；closed-discovery 桥接算子用池内共享实体/引用重叠做 B 候选（确定性）+LLM 合成（语义），是 LBD 最正统分支的池内化。
3. **【映射提案-中高】OpenAlex KG-lite：归一化保留 topics + referenced_works**（第 3/4 节，**本会话已核代码现状**）：无 concepts 冻结风险（`src/sources/` 零 concepts 读取），但 `openalex.ts` 归一化丢弃 topics、`referenced_works` 只存 count——补两个归一化字段即解锁：确定性 analogyDistance 标签（Dunbar 式默认域内路由）+ bridge_completion 的引用重叠 B 候选。

**不可行者直说**：SemMedDB/UMLS KG 路线（许可协议门槛+仅生物医学+27% 上游错误率，与领域无关定位冲突）——REJECT；Arrowsmith 外部集成（无 API、运营状态不透明）——机制吸取、不集成；本地嵌入模型 SPECTER2（违反模型多源 API 架构约束）——排除；TRIZ 矛盾矩阵（机械域绑定、发明原理可泛化性有实证争议）——不采纳；HypoGeniC 式可执行假设评测（依赖可运行数据集）——Direction-B 能力面，Direction-A 阶段不做。

**关键诚实锚点**：LBD 历史成功案例仅鱼油/雷诺一条被 RCT 部分确认（仅原发性），镁/偏头痛只有间接证据——任何以 Swanson 案例为验收的评估，其 GT 必须携带这些限定语，否则我们自己在造假基准。【文献实据+映射提案】
