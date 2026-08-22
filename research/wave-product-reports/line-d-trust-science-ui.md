# 线 D：信任与科学呈现——外部范式模式库

- 产出：Wave-PRODUCT 调研子 Agent（线 D），《产品全景设计规划方案》第 11 节输入
- 日期：2026-08-22
- 目的：为"让诚实成为产品强项"的呈现设计采集可引用的外部范式证据；每条结论映射到 FAR-Lab 概念（claim 绑定徽章 / 不确定性 chip / 回执表 / verify 报告 / 弃权空态）
- 核验方式标注：`[WF]`=WebFetch 直接核验；`[WR]`=webReader 抓取核验（WebFetch 超时/403 的站点的备用抓取，内容同样来自目标 URL 实际返回）；`[SS]`=搜索快照（目标页被反爬拦截，内容来自搜索引擎对同 URL 的索引快照）；`[存在]`=仅核验页面存在与标题，正文为 JS 渲染未能抓取。所有核验日期均为 2026-08-22。凡未能直接核验的正文细节均如实标注，未核验不写。

---

## A. 模式库

### A1 不确定性可视化

**P1 误差条必须自证含义 + 分级误差条（graded error bars）**
- 来源：Claus O. Wilke, *Fundamentals of Data Visualization*, 第 16 章 "Visualizing uncertainty"（16.2 节"Visualizing the uncertainty of point estimates"）。https://clauswilke.com/dataviz/visualizing-uncertainty.html `[WF]`
- 描述：误差条天然歧义（同一数据可画出 SD/SE/80%/95%/99% 五种不同的条），因此原书要求"you must specify what quantity and/or confidence level the error bars represent"（必须标注误差条代表什么量/什么置信水平）。分级误差条用粗细/深浅同时呈现多档区间，可减少读者把条端当作绝对边界的"deterministic construal error"。另有明确禁则：不要用误差条是否重叠来判断显著性（"not reliable and should be avoided"），应对差值本身计算区间。
- FAR-Lab 映射：不确定性 chip（Bradley-Terry 分数 + 不确定性区间）。
- 建议：chip 不只给数字，必须带含义标签（如"BT 612 [505–730], 90% 区间"）；排名列表中的假设行内嵌"分级区间条"（内深外浅两档），而非单条误差线；任何"区间"在 UI 上都要能悬停看到档位定义。禁止用区间重叠与否暗示"两假设差异显著"——需要比较时单独给差值区间。

**P2 频率框架 / 分位数点图（quantile dotplots）**
- 来源：同上 16.1 节。`[WF]`
- 描述：把概率画成离散可数的对象（如 10×10 格子中涂黑 10 格）比面积/长度比较更符合人的感知；连续分布可转成少量分位点（建议 10 个点而非 50 个），"often worthwhile to trade some mathematical precision for more accurate human perception"。
- FAR-Lab 映射：假设排序页、verify 成功率的呈现。
- 建议：面向"科学家用户"的仪表元素可用点阵表达"10 次独立核验中通过 N 次"这类频率语义；弃权概率（若有）用点阵而非百分比，避免伪精确。

**P3 假设性结果图（HOPs，动画式不确定性）**
- 来源：同上 16.4 节。`[WF]`
- 描述：循环播放多个"等可能的图"让不确定性被直观感知；硬切换优于平滑过渡（平滑过渡被证据表明更难判断概率）；前提是播放的样本必须真实代表分布，否则反而误导。
- FAR-Lab 映射：假设排名的稳定性展示（可选进阶）。
- 建议：排序页可提供"排名扰动动画"模式：循环展示从 BT 后验抽取的若干次排名结果，让用户感知"第 1 名与第 2 名差距是否稳定"。非默认，作为下钻页可选视图；不用于主列表。

**P4 不确定性沟通的公众指南：不确定性 ≠ 无知**
- 来源：Sense about Science, *Making Sense of Uncertainty*（公开指南页）。https://senseaboutscience.org/activities/making-sense-of-uncertainty/ `[WR]`
- 描述：该指南开篇即纠正公众误区——"In public discussion, scientific uncertainty is often presented as a deficiency of research"（公共讨论中科学不确定性常被当成研究的缺陷）；立场是科学正是通过管理不确定性前进，模型等工具给出的是"可能的情景（scenarios）"而非预言。这是循证/科学传播领域可公开引用的"不确定性沟通"指南。
- FAR-Lab 映射：全局文案基调；弃权/低置信状态的措辞。
- 建议：产品文案统一采用"不确定性是证据状态，不是产品缺陷"的框架：低置信假设不叫"不可靠结果"，叫"证据尚不足以区分"（并附缺什么证据）；对模型的任何输出措辞为"情景/估计+区间"，不出现确定性口吻。

### A2 Provenance / 数据血缘 UI

**P5 开放血缘标准：作业-数据集-run 三实体 + facet 扩展**
- 来源：OpenLineage 官方文档。https://openlineage.io/docs/ `[WF]`
- 描述：OpenLineage 是"open framework for data lineage collection and analysis"，核心实体为 dataset/job/run，用"facet"（用户自定义元数据）做扩展；Marquez 被描述为"collect, aggregate, and visualize a data ecosystem's metadata"的参考实现。集成覆盖 Airflow/Spark/dbt/Flink 等。
- FAR-Lab 映射：回执表（receipt）的数据模型参照。
- 建议：FAR-Lab 的 receipt 至少携带三实体同构字段：哪次 run（step 执行）、哪个 job（LLM 调用 + 模型/温度）、产出哪个 dataset（claim/假设/计划版本）；扩展信息用 facet 式键值（token 数、延迟、检索命中数），保证可追加不破 schema。

**P6 血统图 UI：统一可视化图 + 逐步展开 + 影响分析 + 列级下钻 + 时间窗**
- 来源：DataHub 官方文档 "About DataHub Lineage"。https://docs.datahub.com/docs/features/feature-guides/lineage `[WR]`；Marquez 官网。https://marquezproject.ai/ `[WF]`
- 描述（DataHub，均有文档原文支撑）：Lineage Explorer 以可视化图展示实体间上游/下游关系；"Impact Analysis"支持查找某实体变更会影响的所有下游实体；列级血缘通过行上的展开箭头显示列间映射；顶部时间选择器可限定时间窗内产生/过滤的血缘；展开按钮显示将引入的节点数、每次只展开一层（保持视图简单）；节点下拉菜单可查血缘详情；手工添加的血缘会被标记警告（区分自动采集与人工编辑）；无法归类的血缘会归组为"unclassified"。描述（Marquez 官网）：提供"unified visual graph / visual map"展示数据生态内复杂依赖，可"see the inputs and outputs of each job, trace the lineage of individual datasets"并查看执行细节。
- FAR-Lab 映射：假设→claim→来源→receipt 的证据链图谱；verify 报告的下钻。
- 建议：(1) 证据链图采用"每层只展开一步、按钮上写将展开的节点数"（DataHub 模式），避免一屏倾泻；(2) 提供"影响分析"语义的反向查询："这个来源失效会影响哪些 claim/假设"（fail-closed 降级的可视化预演）；(3) claim→source 的"列级血缘"等价物：从 claim 徽章下钻到来源原文的具体片段级映射；(4) 用户手工编辑过的任何节点（改写 claim、手动绑定来源）在图上带"人工编辑"角标（DataHub 手工血缘警告模式）；(5) 图谱可按 run 时间窗过滤（对应"哪一版假设"的血统）。

**P7 计算型 provenance：输出附着于产生它的代码 + 执行计数 + 错误带 traceback**
- 来源：Jupyter nbformat 规范（notebook 数据模型）。https://nbformat.readthedocs.io/en/latest/format_description.html `[WF]`
- 描述：code cell 内嵌"a list of outputs associated with executing that code"和 `execution_count`；输出分四类（stream / display_data / execute_result（自带 execution_count）/ error（含 ename、evalue、traceback 帧））。即：Jupyter 生态的溯源基线 = 每个输出永久附着于产生它的单元与执行序号，错误输出保留完整 traceback 而非吞掉。
- FAR-Lab 映射：回执表的"输出附着"原则；失败调用的展示。
- 建议：每条 claim/假设节点永久附着产生它的 receipt 引用（不因后续修订被移除，只在旁边叠加新版本）；失败/超时的 LLM 调用在回执表中保留完整错误体（模型、错误码、重试链），类似 traceback，不允许只显示"失败"两个字。

### A3 引用 / 回执 UI

**P8 编号引用 + 官方定义为"可验证性"服务**
- 来源：Perplexity 帮助中心 "How does Perplexity work?"。https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work.html `[WR]`
- 描述：官方文档明确"Each answer includes numbered citations linking to the original sources, allowing you to easily verify the information or explore further"（每个答案含编号引用、链接原始来源，让用户易于核验或深入探索），并在导航中把"Citing Sources / Source Transparency"列为一等主题。
- FAR-Lab 映射：claim 绑定徽章的下钻路径。
- 建议：徽章（verbatim/bound/unbound）点击后进入"来源卡"：编号 + 可解析 URL + 命中片段 + 检索时间戳。把"允许用户核验"写成界面上的明示功能（如"核验此 claim"按钮直达来源原文对照），与 Perplexity 的官方定位语对齐。

**P9 来源标签的边界声明："标签不代表什么"**
- 来源：Perplexity 帮助中心 "Understanding source labels"。https://www.perplexity.ai/help-center/en/articles/20260806-understanding-source-labels.html `[WR]`
- 描述：Perplexity 对部分被引域名显示小盾牌图标与 Government/Academic/Trusted 标签（各有分配标准，如政府域名后缀、高校、经评审的列表）；该官方文档专门有一节讲每个标签"does not tell you"什么——标签不等于内容准确、客观或无错，且非官方域名也可能可靠。即：连大厂也在为"分级徽章"公开声明解释边界，防止过度解读。
- FAR-Lab 映射：claim 绑定徽章的 tooltip/说明文案。
- 建议：每个徽章的帮助文案采用三段式：是什么 / 如何判定 / **不代表什么**（如 "verbatim = 文本逐字来自来源片段；不代表该来源结论正确"）。这直接呼应 fail-closed：徽章描述的是"绑定关系"，不是"真理性"，UI 文案必须把两者区分开。

**P10 反幻觉引用铁律："绝不使用模型生成的 URL"**
- 来源：Perplexity API 官方文档（Streaming Citations 指南）。https://docs.perplexity.ai/docs/cookbook/articles/streaming-citations/README `[WR]`
- 描述：官方文档原文："**Never ask the model to generate source URLs.** Model-generated URLs can be hallucinated. The search results contain verified URLs from real web searches."（绝不要让模型生成来源 URL——模型生成的 URL 可能是幻觉；搜索结果才含经核实的真实 URL）。文档还展示 search_results 结构含 id/title/url/snippet/date 字段，要求应用内"始终链接完整来源 URL"。
- FAR-Lab 映射：fail-closed 证据约束的呈现与文档化。
- 建议：把同款铁律写成 FAR-Lab 的产品级声明（onboarding、verify 报告首页、复现包 README 三处）：claim 的来源只能来自检索器返回的可解析 URL/DOI，任何"模型复述的引用"一律进 unbound 降级态。这是外部大厂对 FAR-Lab 核心机制的公开背书式同构，可在设计文档中直接引用该句。

**P11 引用上下文三分类徽章（supports/contrasts/mentions）+ 置信展示 + 可纠错**
- 来源：Scite Badge 官方页。https://scite.ai/badge `[WR，页面存在+首屏内容]`；Brody S., "Scite", *Journal of the Medical Library Association* 109(3)，2021（PMC 开放全文）。https://pmc.ncbi.nlm.nih.gov/articles/PMC8608186/ `[WF]`
- 描述（以 PMC 论文为准）：Smart Citation = 引用陈述 + 分类标签（supports / mentions / contrasts）+ 引用位置（引言/方法/结果/讨论）三要素；2021 年已标 8 亿+条引用陈述；分类器由 4 万条人工标注训练，策略上"trained to be cautious"（不确定时归入 mentioning 而非冒进判定）；界面提供分类计数徽章与可视化；期刊级指标 Scite index = supporting / (supporting + contrasting)；论文同时给出两条诚实边界："a contradicting citation statement does not necessarily mean the cited paper is wrong"，且界面展示分类置信水平、允许用户标记误分类。
- FAR-Lab 映射：claim 徽章体系 + 反证（counter-evidence）呈现 + 徽章可纠错性。
- 建议：(1) FAR-Lab 的"支持/反驳证据"列直接采用 scite 式双计数徽章（supporting N / contrasting M），比单列文字高效；(2) 徽章必须可下钻到"引用陈述原文 + 位置"（scite 三要素）；(3) 界面加同款边界注记："contrasting ≠ 来源被证伪，仅指该片段与其结论相左"；(4) 分类不确定时显示保守档（对应 scite 的 cautious 策略与 FAR-Lab fail-closed 同构）；(5) 徽章旁提供"报告分类错误"入口，用户反馈进入修正回路而非静默。

**P12 抽取列 = 字段名 + "给人类标注员的指令"**
- 来源：Elicit 支持文档 "Create and save columns in Elicit"。https://support.elicit.com/en/articles/14758162-create-and-save-columns-in-elicit `[WF]`
- 描述：Elicit 的提取列由 Name（单个短语）与 Instructions（"all instructions that you'd give to a human data labeler"，含精度、单位、格式如"mean ± standard deviation"、示例与陷阱）构成；列可从论文正文或表格抽取；支持 Yes/No/Maybe 筛选列（系统综述筛查）与多选"Specified"列；列可存为 Preset 复用。注：该文档未描述"证据强度"呈现（检索到的剑桥可行性研究未核验，不引用）。
- FAR-Lab 映射：九字段证伪规范的结构化抽取呈现；研究计划的变量表。
- 建议：证伪九字段在 UI 上按"字段名 + 提取指令"两栏呈现（指令可展开查看——它就是抽取的 prompt 溯源）；"是否可证伪"筛查字段用三态（是/否/部分）而非布尔，对应 Elicit 的 Yes/No/Maybe 经验；每格抽取值旁放来源片段引用（绑定徽章复用）。

**P13 "Cited by" 计数即引用网络入口**
- 来源：Google Scholar 官方帮助页。https://scholar.google.com/intl/en/scholar/help.html `[SS：页面存在，反爬拦截直接抓取；下述引文来自搜索引擎对同 URL 的索引快照]`
- 描述：官方帮助原文（快照）："Click 'Related articles' or 'Cited by' to see closely related work"——Scholar 用"Cited by N"计数链接作为进入引用网络的入口，N 为可点击的一级信息。
- FAR-Lab 映射：来源详情页的反向引用。
- 建议：来源卡上除"本来源支撑的 claim"外，给"引用此来源的假设/计划版本 N"（内部引用网络），使来源成为一等实体页面（与 DataHub 实体页同构）。

### A4 证据分级与过程透明

**P14 GRADE 四档确定性：文字定义 + 圆点/字母双符号**
- 来源：GRADE Working Group, *GRADE Handbook*（官方在线手册）。https://gdt.gradepro.org/app/handbook/handbook.html `[WR]`
- 描述：Table 5.1 给出四档标准定义——High："further research is very unlikely to change our confidence in the estimate of effect"；Moderate："further research is likely to have an important impact on our confidence… and may change the estimate"；Low："further research is very likely to have an important impact… and is likely to change the estimate"；Very low："we are very uncertain about the estimate"。Table 6.4 定义双套符号：圆点 ⊕⊕⊕⊕（High）…⊕（Very low）与等价字母 A/B/C/D——同一等级两套编码冗余呈现，供不同场合（图形/表格）使用。同页还给出森林图呈现惯例：竖线=无效应、方块=各研究效应估计（面积按样本量加权）、横线=95% CI、菱形=合并效应。
- FAR-Lab 映射：证据链/假设的确定性档位；verify 报告的等级符号。
- 建议：FAR-Lab 的"证据支持度"用**离散四档**（如：充分/较充分/不足/极低）+ 双符号（色点 + 字母），不用连续分数冒充确定性——与 BT 分数分离：BT 排名是"相对优劣"，GRADE 式档位是"绝对证据状态"，两个 chip 并排但语义标注清楚（P1 同款"必须自证含义"原则）。档位帮助文案直接采用 GRADE 式"未来研究多大概率会改变判断"的可证伪表述。

**P15 Summary of Findings：每行结论 = 绝对效应 + CI + 确定性 + 降级理由脚注**
- 来源：GRADE Handbook 11–12 章（SoF/Evidence-to-Decision 框架）`[WR]`；Cochrane Handbook for Systematic Reviews of Interventions, 第 14 章 "Completing 'Summary of findings' tables and grading the certainty of the evidence"。https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-14 `[WR]`
- 描述：SoF 表的规范结构：每行 = 结局（outcome）+ 假定样本量 + 干预/对照的绝对效应 + 相对效应 + 确定性评级；**降级理由（risk of bias、不一致、间接性、不精确、发表偏倚）以脚注形式挂在表下**，读者可从评级直接追到"为什么降级"。EtD 框架进一步把"证据→决策"的每一步（效果确定性、价值偏好、可接受性…）结构化并列呈现。
- FAR-Lab 映射：verify 报告与假设总览表。
- 建议：FAR-Lab 的假设/证据总览表采用 SoF 同构：行=关键结论，列=估计值+区间+支持来源数+档位，**每个降级（unbound claim、检索覆盖不足、反证存在）都以带编号脚注挂在表下**，点脚注直达对应 receipt/来源。这是"降级必留痕"的成熟范式。

**P16 PRISMA 2020 流程图：过程漏斗 + 排除原因 + 可复用模板**
- 来源：PRISMA 官方站 Flow Diagram 页。https://www.prisma-statement.org/prisma-2020-flow-diagram `[WF]`
- 描述：官方描述流程图描绘"the flow of information through the different phases of a systematic review"，映射"the number of records identified, included and excluded, and the reasons for exclusions"；提供 4 个 Word 模板（新综述/更新综述 × 仅数据库/含其他来源）与 Shiny 交互生成器；模板以 CC BY 4.0 发布（可改编需署名）。
- FAR-Lab 映射：verify 报告首页的"过程透明"视图；文献筛选流程。
- 建议：verify 报告顶部放"核验漏斗"：检索记录 → 去重 → 纳入 → 支撑各 claim 的来源数 → 通过/未通过项数，每个流失节点标数量与原因（PRISMA 的"排除必带原因"原则）。假设工作流同样适用：检索 N → 绑定 M → 生成假设 K → 弃权 J（弃权也是漏斗中可见的一格，不是错误）。PRISMA 模板 CC BY 4.0，若直接采用其版式需按许可署名。

### A5 模型卡 / 数据表：结构化披露局限

**P17 Model Cards：跨语境分性能 + 意图用途声明**
- 来源：Mitchell et al., "Model Cards for Model Reporting", FAT* 2019, arXiv:1810.03993。https://arxiv.org/abs/1810.03993 `[WF]`
- 描述（摘要页已核验内容）：模型卡是随模型发布的短文档，按文化/人口/表型分组（含交叉组，如年龄×种族）给出"benchmarked evaluation in a variety of conditions"，披露"the context in which models are intended to be used"与"details of the performance evaluation procedures"。（注：model details/intended use/metrics/evaluation data/ethical considerations/caveats 等小节名出自论文正文，本次仅核验摘要页，正文小节列表未逐项复核——引用时以论文 PDF 为准。）
- FAR-Lab 映射：复现包中的"运行环境卡"；Builder 模型信息面板。
- 建议：复现包附 FAR-Lab 版模型卡：模型/温度/版本、本任务分组表现（如按学科领域分）、**意图用途边界**（"用于假设生成辅助，不用于事实裁决"）。呈现上做成固定小节的只读面板，小节间不允许可选隐藏（披露不可折叠掉）。

**P18 Datasheets：以问题清单结构化"不应使用"与"维护责任"**
- 来源：Gebru et al., "Datasheets for Datasets", *Communications of the ACM* 2021, arXiv:1803.09010（HTML 版已核验问题模板）。https://arxiv.org/html/1803.09010 `[WF]`
- 描述：模板含 7 组问题：Motivation / Composition / Collection Process / Preprocessing / **Uses（含"Are there tasks for which the dataset should not be used?"）/ Distribution / Maintenance（谁维护、如何更新纠错）**；动机是"increase transparency and accountability"，并明确帮助使用者避开误用。
- FAR-Lab 映射：证据库（来源集）的元数据面板；复现包数据表。
- 建议：FAR-Lab 的每个"证据集/来源池"对象带 datasheet 式元数据卡：为何收集、覆盖范围与已知空白、**不应被用于回答的问题类型**、维护与更新策略。特别是"不应使用"一栏：与弃权机制联动——当用户提问命中证据集声明的盲区时，弃权空态直接引用该声明作为"为什么弃权"的证据（弃权有出处，不是空口说不行）。

### A6 AI 弃权 / 置信 UI 与空态范式

**P19 第一人称不确定语言优于客观化措辞**
- 来源：Nielsen Norman Group, "AI Hallucinations: What Designers Need to Know"（Page Laubheimer, 2025-02-07）。https://www.nngroup.com/articles/ai-hallucinations/ `[WF]`；该文引用 Sunnie Kim et al., "I'm Not Sure, But…: Examining the Impact of Large Language Models' Expressions of Uncertainty"（CHI 2024）。https://dl.acm.org/doi/10.1145/3630106.3658941 `[SS：ACM 页 403，结论经由 NN/g 文内引用与检索摘要转述，未直接核验全文]`
- 描述：NN/g 转述研究结论：表达不确定时第一人称（"I'm not sure"）优于非人称（"It's not clear"）；CHI 2024 论文摘要（检索快照）结论为自然语言不确定表达"may be an effective approach for reducing overreliance"。
- FAR-Lab 映射：弃权空态与低置信输出的文案。
- 建议：弃权/低置信文案用系统第一人称："我还无法在当前证据下区分假设 A 与 B"而非"证据不清晰"（后者像在推责给证据）。人设一致：FAR-Lab 作为"AI 科学家同事"，第一人称 + 说明缺什么，正是诚实人格的语气载体。

**P20 分档置信标签优先于伪精确百分比；单一高分反噬**
- 来源：同上 NN/g 文（引 Leiser et al. HILL 分类法）`[WF]`；Zhang, Liao & Bellamy, "Effect of Confidence and Explanation on Accuracy and Trust Calibration in AI-Assisted Decision Making"（IUI 2020）。https://dl.acm.org/doi/10.1145/3351095.3372852 `[SS：ACM 页 403，开放副本见 ResearchGate，未直接核验全文]`
- 描述：NN/g 建议在高风险领域与多预测并列时才用数值置信；"displaying only a single prediction score… risks backfiring"（约 75% 的单一高分会让用户过度信任）；百分比不可靠时用 High/Medium/Low 档位"avoid false perceptions of precision"。Zhang et al.（IUI 2020）研究 AI 置信度+解释对准确率与信任校准的影响（人机错误对齐问题）。
- FAR-Lab 映射：不确定性 chip 的数值形态。
- 建议：假设列表默认显示档位（高/中/低）+ 区间，精确 BT 分数收进下钻页（两级信息层级）；绝不出现"置信度 87%"这类无校准依据的小数（FAR-Lab 的 BT 区间有统计定义，属可展示的例外，但必须带 P1 式含义标签）。

**P21 多次生成的不一致标注 = 幻觉强信号**
- 来源：同上 NN/g 文（引 Cheng et al., CHI 2024）。`[WF]`
- 描述：对同一提示多次生成并在差异处高亮/标注——研究发现"users interpreted inconsistency as a strong signal of hallucinations"；变体是多模型/多 agent 辩论。代价：逐差异核对认知负荷高。
- FAR-Lab 映射：verify 报告的"重跑一致性"核验项。
- 建议：`far verify` 的独立重跑项结果用"一致/不一致片段对照"呈现（并排两版，差异高亮），而不是只给"通过/失败"。tournament 排序天然多次对局——可将"假设 A 对 B 的胜负翻转率"作为可见的一致性指标。

**P22 来源卡的光环效应：引用在场 ≠ 核验发生**
- 来源：同上 NN/g 文。`[WF]`
- 描述：展示来源（数量+可信度）被用户重视（引 Leiser et al.），但 Perplexity 式答案上方醒目来源列表"might cause users to reduce their vigilance in checking the information"（光环效应：有链接反而降低 vigilance）。
- FAR-Lab 映射：来源列表的位置设计。
- 建议：FAR-Lab 不把来源陈列当"信任装饰"：来源卡默认折叠在 claim 后（编号引用式），点击才展开对照视图；对照视图里把"来源片段 vs claim 文本"的 diff 做成主内容（强迫真实比对，而非展示性链接）。徽章色不使用高饱和"信任绿"渲染整块区域，避免视觉光环。

**P23 情境化警示优于通用免责声明**
- 来源：同上 NN/g 文。`[WF]`
- 描述：ChatGPT 式小字"可能出错"全局免责被比作"Prop 65 标签"（过度曝光→免疫）；应在"更可能相关的时刻"展示警示。工程侧压制幻觉会增加"I don't know"回答但降低有用性——弃权与有用性是真实权衡，不是免费午餐。
- FAR-Lab 映射：弃权/降级提示的触发时机。
- 建议：不做全局横幅式"AI 可能出错"。警示出现在具体对象上：unbound 徽章旁、区间极宽的 chip 旁、verify 失败行旁——对象级、可关闭、可下钻。产品文档中保留对"弃权增加→有用性下降"权衡的公开说明（诚实呈现成本）。

**P24 "决定是否显示置信度"本身是设计决策**
- 来源：Google PAIR, People + AI Guidebook。https://pair.withgoogle.com/guidebook/ `[存在：站点与章节 URL（/guidebook/chapters/trust-and-explanations/crafting-helpful-explanations、/guidebook/patterns）经搜索确认存在，正文为 JS 渲染未能抓取]`；配套 Codelabs "Building Trusted AI Products with the PAIR Guidebook"。https://codelabs.developers.google.com/codelabs/pair-guidebook `[SS：Google 域直连超时，以下引文来自搜索快照]`
- 描述（快照引文）：Codelabs 含小节 "Determine how to display confidence"——"model confidence displays show how certain the AI is in its prediction, and the alternatives"，并强调置信展示需在产品早期做用户测试；同页列"Communicate system capabilities and limitations; Determine how to display confidence; Give the user a way forward from errors"。检索快照另显示指南正文的建议方向："Consider how and when model confidence is displayed, or whether to display it at all. Instead, reduce user uncertainty by providing explanations…"
- FAR-Lab 映射：置信信息的产品级取舍。
- 建议：FAR-Lab 对每类对象明确"显示什么置信"：假设=BT 档位+区间（有统计定义）；claim=绑定态（离散、可核验）；单条 LLM 输出=不显示裸模型自评置信（无校准依据），以 receipt 的可核验事实替代。此取舍写入设计规范而非随页面各自发挥。

**P25 空态解剖：图形/主文案/描述/主行动/次行动，错误态给替代路径**
- 来源：GitHub Primer 设计系统 "Empty states"（基于 Blankslate 组件）。https://primer.style/product/ui-patterns/empty-states/ `[WF]`
- 描述：空态解剖五件套——图形（可愉悦、可预览界面，但**错误态"should not attempt to bring delight or be playful"，默认用 alert 图标**）、主文案（标题；错误态要具体如"Repositories could not be loaded due to a system error"）、描述（简短、说明下一步；错误态解释如何修复或求助）、主行动（一个；错误态通向解决方案）、次行动（可选文字链；"Error states are unlikely to ever have a secondary action"）。文案规范：避免模糊（"There was a problem"令人沮丧）、避免过度技术化（让非技术用户自觉愚蠢）；错误态要"push the user forward via an alternative path until they truly hit a dead end"。
- FAR-Lab 映射：弃权空态（"证据不足，未生成结论"）、无检索结果态、verify 全失败态。
- 建议：弃权空态按 Primer 解剖实现：图形=中性"证据不足"图标（非愉悦插画）；主文案=具体原因（"未找到可支撑该方向的同行评审来源"）；描述=第一人称 + 缺什么（P19/P4）；主行动=补救动作（"放宽年份约束重检"/"换检索式"）；次行动="查看弃权判定依据"（下钻到触发弃权的 receipt 与证据集 datasheet 声明，P18）。弃权是状态不是错误：不用红色，用中性/琥珀色；红色只留给 verify 硬失败。

---

## B. FAR-Lab 信任呈现十原则（全部有出处）

1. **徽章必须自我定义，并声明"不代表什么"**——绑定徽章（verbatim/bound/unbound）的帮助文案三段式：是什么/如何判定/不代表什么。（P9 Perplexity source labels `[WR]`；P11 scite"contrasting≠被证伪"`[WF]`）
2. **每个数字自带含义标签，禁止裸区间**——chip/误差条必须注明量与置信水平（"BT 612 [505–730], 90% 区间"），杜绝伪精确百分比。（P1 Wilke 16.2 `[WF]`；P20 NN/g 分档优先 `[WF]`）
3. **离散档位与连续排名分离呈现**——GRADE 式四档表达"绝对证据状态"，BT 分数表达"相对排序"，两个 chip 并排但各注语义，可互相下钻。（P14 GRADE Handbook `[WR]`）
4. **降级必留痕，理由挂脚注**——任何降级（unbound、覆盖不足、反证存在）在总览表下带编号脚注，点通向 receipt/来源。（P15 SoF/Cochrane ch.14 `[WR]`）
5. **过程漏斗对账，排除与弃权都带原因**——verify/工作流首页用 PRISMA 式漏斗：每格数量可加和、每次排除有名有因；弃权是漏斗中的正常一格。（P16 PRISMA `[WF]`）
6. **输出永久附着于产生它的调用**——claim 附着 receipt 引用，错误调用保留完整错误体（traceback 式），不吞错。（P7 nbformat `[WF]`；P5 OpenLineage 三实体 `[WF]`）
7. **血缘图逐步展开、双向可查、人工编辑有标记**——展开按钮显示节点数、每次一层；提供"来源失效影响面"反向查询；用户改写过的节点带角标。（P6 DataHub/Marquez `[WR]`/`[WF]`）
8. **反证与支持同权重呈现**——双计数徽章（supporting N / contrasting M）并列，反证可下钻到片段；边界注记防过度解读。（P11 scite `[WF]`）
9. **弃权是状态不是失败**——空态五件套 + 第一人称具体文案 + 主行动给补救路径 + 次行动给判定依据；中性色不用红色；不确定性是证据状态而非产品缺陷。（P25 Primer `[WF]`；P19 NN/g/CHI 2024 `[WF]`/`[SS]`；P4 Sense about Science `[WR]`）
10. **引用永不来自模型想象，来源卡反光环**——来源只能绑定检索器返回的可解析 URL/DOI；来源默认折叠、点击进入"片段 vs claim"强制对照，不做装饰性链接陈列。（P10 Perplexity API 文档 `[WR]`；P22 NN/g 光环效应 `[WF]`）

---

## C. 来源核验清单（全部 2026-08-22）

| # | 来源 | URL | 方式 |
|---|------|-----|------|
| 1 | Wilke, *Fundamentals of Data Visualization* ch.16 | https://clauswilke.com/dataviz/visualizing-uncertainty.html | WF |
| 2 | GRADE Handbook（官方） | https://gdt.gradepro.org/app/handbook/handbook.html | WR |
| 3 | Cochrane Handbook ch.14（SoF/GRADE） | https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-14 | WR |
| 4 | PRISMA 2020 Flow Diagram（官方） | https://www.prisma-statement.org/prisma-2020-flow-diagram | WF |
| 5 | OpenLineage 官方文档 | https://openlineage.io/docs/ | WF |
| 6 | Marquez 官网 | https://marquezproject.ai/ | WF |
| 7 | DataHub Lineage 官方文档 | https://docs.datahub.com/docs/features/feature-guides/lineage | WR |
| 8 | Jupyter nbformat 规范 | https://nbformat.readthedocs.io/en/latest/format_description.html | WF |
| 9 | Perplexity Help "How does Perplexity work?" | https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work.html | WR |
| 10 | Perplexity Help "Understanding source labels" | https://www.perplexity.ai/help-center/en/articles/20260806-understanding-source-labels.html | WR |
| 11 | Perplexity API Streaming Citations 指南 | https://docs.perplexity.ai/docs/cookbook/articles/streaming-citations/README | WR |
| 12 | Scite Badge 页 | https://scite.ai/badge | WR（首屏） |
| 13 | Brody 2021, "Scite", JMLA（PMC 全文） | https://pmc.ncbi.nlm.nih.gov/articles/PMC8608186/ | WF |
| 14 | Elicit Support "Create and save columns" | https://support.elicit.com/en/articles/14758162-create-and-save-columns-in-elicit | WF |
| 15 | Model Cards, arXiv:1810.03993 | https://arxiv.org/abs/1810.03993 | WF |
| 16 | Datasheets for Datasets, arXiv:1803.09010（HTML 全文） | https://arxiv.org/html/1803.09010 | WF |
| 17 | NN/g "AI Hallucinations"（2025-02-07） | https://www.nngroup.com/articles/ai-hallucinations/ | WF |
| 18 | GitHub Primer "Empty states" | https://primer.style/product/ui-patterns/empty-states/ | WF |
| 19 | Sense about Science, *Making Sense of Uncertainty* | https://senseaboutscience.org/activities/making-sense-of-uncertainty/ | WR |
| 20 | Google Scholar 帮助页 | https://scholar.google.com/intl/en/scholar/help.html | SS（直连被拦） |
| 21 | Kim et al. CHI 2024 "I'm Not Sure, But…" | https://dl.acm.org/doi/10.1145/3630106.3658941 | SS（ACM 403；经 NN/g 转述） |
| 22 | Zhang et al. IUI 2020（置信+解释→信任校准） | https://dl.acm.org/doi/10.1145/3351095.3372852 | SS（ACM 403；开放副本见 ResearchGate） |
| 23 | Google PAIR People + AI Guidebook | https://pair.withgoogle.com/guidebook/ | 存在（正文 JS 未抓取；引语经 Codelabs 搜索快照） |

**已知未核验/不声称**：scite.ai/badge 页仅核验存在与首屏，未逐字核对徽章配色；Model Cards 论文正文小节名未逐项复核（仅摘要页核验）；Elicit"证据强度呈现"无公开文档支撑，本文未为其立项；Marquez"列级血缘"未在其官网提及，未作为其功能声称；PAIR Guidebook 正文引语均标注为搜索快照途径。
