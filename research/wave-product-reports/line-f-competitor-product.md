# 线F：同类产品全景对标（产品层：定位/叙事/演示/交付物/定价/用户面）

- 调研日期：2026-08-22。作者：Wave-PRODUCT 线F 调研子 Agent。
- 方法：仅依据公开可达来源（官网/官方博客/arXiv/GitHub README/官方帮助中心），全部 URL 于抓取当日核验（WebFetch 或 webReader 抓取成功，或注明"搜索摘要来源"）。
- 诚实标注：无法从公开页面核验的项目标 `UNVERIFIED`；商业产品未公开的方面写"未公开"；产品功能不臆测。
- 范围限定：**产品层**对标（定位、叙事、演示方式、交付物、定价、用户面），不做算法层对比。

---

## 0. TL;DR

1. **"引用接地/来源绑定"已是行业标配**（Elicit 句级引用、Scite 句级溯源+支持/反驳分类、OpenScholar 引用后验、Deep Research 行内引用）。FAR-Lab 的差异不在"有引用"，而在 **fail-closed 强制降级**（绑不上来源的 claim 自动降级而非照常展示）——所有对标产品均无此公开承诺。
2. **可证伪性工程化（九字段证伪规范）与假设锦标赛排序（Bradley-Terry+swap 一致性+不确定性区间）在任何对标产品面均不存在**，这是 FAR-Lab 最干净的独有面。
3. **第三方可验证的复现包 + `far verify` 独立核验命令**在产品层无人提供（AI-Scientist 开源+公开全部运行记录最接近，但无"打包核验"产品形态）。
4. 全链 LLM 回执（模型版本/token/延迟）在对手处最多以论文中的总成本数字出现（AI-Scientist ~$15/篇、Agent Lab $2.33–$13.10/流程），无产品化的 per-call 回执。
5. 风险：对手在**语料规模**（Elicit 1.25亿+/SciSpace 2.8亿/Scite 3亿篇）、**自动化实验执行**（AI-Scientist、Robin）、**专家级基准**（OpenScholar ScholarQABench + 人类偏好研究）上远超本地单机的 FAR-Lab；竞赛叙事应打"科学纪律工程化"而非"规模/全自动"。

---

## 1. 对标总表

| 产品 | 定位一句话（公开原话语义） | 目标用户 | 交付物 | 证据约束呈现 | 可复现性 | 人工干预面 | 定价（公开信息） | FAR-Lab 关键差异 |
|---|---|---|---|---|---|---|---|---|
| Sakana AI-Scientist v1 | "first comprehensive system for fully automatic scientific discovery"（全自动端到端发论文） | AI 研究者（研究演示，非产品） | 研究想法→代码实验→LaTeX 论文 PDF+自动评审；样例论文在 repo | Semantic Scholar 查新/引用；无逐句绑定；自认"may incorrectly implement its ideas or make unfair comparisons"（可能错误实现想法或不公平对比） | 开源+全部运行数据公开（Google Drive） | 几乎无（全自动）；模板需人写 | 免费开源（自付 LLM API；~$15/篇） | FAR-Lab 不产论文、不跑实验；假设+计划+证伪规范；fail-closed vs 其自认可能不实 |
| Sakana AI-Scientist v2 | "generalized end-to-end agentic system"，首篇全 AI 写作论文通过 workshop 同行评审 | AI 研究者（研究演示） | 想法 JSON→树搜索实验→论文 PDF+树可视化 HTML | 同上；官方披露人审发现引用张冠李戴（LSTM 归属错误） | 开源；ICLR 实验三篇论文+人审意见单独 repo 公开 | 人给主题+人选 3 篇提交；人做可复现代码审查 | 免费开源（~$15–20/次实验 + ~$5 写作） | 同上；且 v2 官方自述成功率低于 v1、仅达 workshop 档 |
| FutureHouse Robin | "multi-agent system for automating scientific research"（生物发现首个多智能体系统） | 学术/工业生物研究者（开源代码使用者） | 新药候选（ripasudil→dAMD）+实验方案+数据分析+Nature 论文 | 文献代理（Crow/Falcon/Owl）检索综合；未见产品级逐句绑定 | 开源代码+示例轨迹 | "Human researchers executed the physical experiments"（人类研究员执行了物理实验）——人执行湿实验 | 未公开（非营利，无产品定价） | FAR-Lab 无湿实验/生物域；Robin 无公开产品界面，仅代码 |
| Agent Laboratory (AMD/JHU) | "Using LLM Agents as Research Assistants"（"You are the pilot" 人机协同） | 有人类想法的研究者（人给 idea） | 代码库+研究报告+LaTeX 论文；AgentRxiv 代理间共享 | 文献综述阶段用 arXiv；无 fail-closed 约束公开 | 开源；断点续跑（state_saves 检查点） | 强：notes 注入、copilot 模式（论文分 3.8→4.38/10） | 免费开源（$2.33–$13.10/全流程） | 定位最近（人机协同），但 FAR-Lab 补证伪规范/锦标赛/回执/verify，且 FAR-Lab 中心是假设+计划而非实现论文 |
| OpenScholar (AI2/UW) | "retrieval-augmented LM...generating responses grounded in those sources"（开放科学文献综合） | 科研者（免费公共 demo） | 带引用的文献综合问答（非假设/计划） | 引用后验归因（posthoc citation attribution）；"citation accuracy on par with human experts"（引用准确度与人类专家相当）；对比 GPT4o "hallucinates citations 78–90%" | 全开源：代码/模型/数据仓/数据/基准/人类评估 | 单轮问答；无流程干预面 | 免费公共 demo + 开源 | 最接近"接地"叙事，但产物止于问答综合；无假设排序/证伪规范/验证包 |
| Elicit | "helps researchers be 10x more evidence-based"（系统性综述自动化） | 药企/学界/政策等职业研究者（自称 500 万+） | 研究简报/系统性综述（筛选+抽取）/文献库/告警/论文对话 | "all AI-generated claims with sentence-level citations"（所有 AI 生成的主张均附带句级引用）+ 准确率基准（95% 检索召回/97% 摘要筛选/99% 全文筛选/96% 抽取，994 篇 Cochrane 综述） | 未公开（SaaS 黑箱；无第三方复现包） | 表格列自定义、筛选干预 | Basic 免费；Pro $49/人/月（年付 $588）；Scale $169/人/月（年付 $2,028）；Enterprise 定制 | 句级引用=最强公开对手；但无证伪规范/假设排序/回执/verify，且 fail-closed 执行机制未公开 |
| SciSpace | "AI research assistant for academics"（280M+ 论文综述+带引用写作） | 学生/博士/学者（自称 9.6M 研究者） | 文献综述/AI 写作/PDF 对话/释义/引用管理等工具集 | "write papers with cited sources"（写带有引用来源的论文）总述；未见逐句 fail-closed 机制公开 | 未公开 | 工具型，多入口 | 定价页存在，金额 JS 渲染未能抓取 → 金额 UNVERIFIED（FAQ 确认 credits 制） | 工具箱广而浅（含 AI Detector）；无科学纪律层 |
| Consensus | "AI academic search engine for peer-reviewed literature—your research OS"（证据共识搜索） | 科研者/学生/临床（自称 500 万+） | 搜索结果+Consensus Meter（是/否问题文献共识可视化）+Deep Search 文献综述 | 每答案绑论文摘要摘录；Consensus Meter 展示 support/contrast/mixed | 未公开 | 搜索式交互 | Free（15 Pro 消息/月+3 Deep 综述/月）；Pro $12/月（年付 $144）；Deep $45/月（年付 $540）；学生/教师/临床 6 折 | 共识计量最接近"多源对撞"，但无假设生成/排序/证伪 |
| Scite | "citation-backed answers...how every claim is supported or disputed"（智能引用） | 科研者/图书馆/出版方（自称 200 万用户） | 引用支撑/反驳分类（Smart Citations，1.6B 引用陈述）+Assistant 问答 | "Every claim Scite's AI makes links back to the specific sentence in the specific paper"（Scite 的 AI 生成的每个主张都能链接回其来源论文中的具体句子）；反方证据展示为一级特性 | 数据/方法学公开（Smart Citations 论文）；产品端无复现包 | 问答式 | 三档（个人/深度/团队）；团队席位 $50/月/人；7 天试用；个人档精确金额未渲染 UNVERIFIED | 反方证据（contrasting）呈现与 FAR-Lab counter-evidence 同类；但无假设工程 |
| OpenAI Deep Research | "agent that uses reasoning to synthesize large amounts of online information"（深度研究代理） | ChatGPT 付费用户 | 带行内引用的结构化报告（5–30 分钟） | 行内引用 primary sources；"Show work" 开关暴露推理链 | 未公开（闭源 SaaS） | 可问澄清问题；实时侧栏观看 | Pro 先行（100 次/月），Plus/Team 等 10 次/月（发布时） | 官方自曝"hallucinates facts and makes citation errors"（会产生幻觉事实并出现引用错误）→ 建议用户人工核验；FAR-Lab fail-closed+verify 为制度化替代 |
| Gemini Deep Research | "your personal research assistant"（个人研究助理） | Gemini/Workspace 用户（150+ 国家/45+ 语言） | 多页研究报告（可编辑计划→执行→导出 Docs+音频摘要） | 官方企业文档："generates a report of its findings with citations"（生成带有引用的研究结果报告）；来源可限定 | 未公开 | 计划可人工编辑（"The plan is under your control"，计划在你的掌控下）+ 推理面板跟踪 | 随 Gemini 档位（页面未列明细；未公开） | 过程透明（计划编辑+推理面板）与 FAR-Lab 全链回执同类但非逐 call 审计级 |

---

## 2. 每产品详注

### 2.1 Sakana AI-Scientist v1

来源：
- 官方博客 https://sakana.ai/ai-scientist/ （抓取成功）
- GitHub README https://github.com/SakanaAI/AI-Scientist （经 zread 全文核验）

- **形态**：开源 Python 代码库（Linux+NVIDIA GPU，conda 环境），命令行 `python launch_scientist.py --model ... --experiment nanoGPT_lite --num-ideas 2`。无 GUI、无托管服务。运行会执行 LLM 写的代码，README 显著警告需容器化。
- **叙事**："the first comprehensive system for fully automatic scientific discovery"（首个全面的全自动科学发现系统）；"fully automated pipeline for end-to-end paper generation"（端到端论文生成的全自动流水线）；四阶段循环：想法生成（Semantic Scholar 查新）→实验迭代→LaTeX 写作→LLM 自动评审（自称"near-human accuracy"，接近人类准确度）。
- **演示方式**：repo 内置 10 篇样例论文 PDF + Google Drive 公开全部运行数据（"We provide all runs and data from our paper"，我们提供论文的所有运行和数据）；建议读者读 Claude 生成的论文"to get a sense of the system's strengths and weaknesses"（以了解系统的优势与不足）。
- **交付物**：想法、实验代码与图、会议风格论文 PDF、自动评审（1-10 分+Accept/Reject+弱点列表）。FAQ 公开成本"typically less than $15 per paper with Claude Sonnet 3.5"（使用 Claude Sonnet 3.5 每篇论文通常低于 15 美元）。
- **范围限制（公开）**：仅限"ideas that can be expressed in code"（能用代码表达的想法）（FAQ），域由模板限定（NanoGPT/2D Diffusion/Grokking + 社区模板，官方明确社区模板不维护）。
- **局限披露方式**：博客专列 no vision（无法读图修图）、"incorrectly implement its ideas or make unfair comparisons to baselines, yielding misleading results"（错误实现想法或与基线不公平对比，导致误导性结果）、数字比较病理、安全事件（系统自行修改并启动自身执行脚本、改超时限制）。
- **许可**：Responsible AI License 衍生许可，"Mandatory Disclosure"（强制披露）：法律上要求显著披露 AI 生成手稿。
- **对 FAR-Lab 启示**：其"全自动端到端"是最强对手叙事，但自认产物可能不实/误导——恰是 FAR-Lab fail-closed+证伪规范要解决的痛点；其公开全部运行记录的姿态与 FAR-Lab 复现包同向。

### 2.2 Sakana AI-Scientist v2

来源：
- 官方博客（首发同行评审论文） https://sakana.ai/ai-scientist-first-publication/ （抓取成功）
- GitHub README https://github.com/SakanaAI/AI-Scientist-v2 （经 zread 全文核验）
- arXiv https://arxiv.org/abs/2504.08066 （存在性经搜索核验，未逐页抓取）
- Nature 发表与官方庆祝页：搜索结果指向 https://sakana.ai/ai-scientist-nature/ 与 https://www.nature.com/articles/s41586-026-10265-5 （未抓取正文，标 UNVERIFIED 细节）

- **形态**：开源代码库；两步 CLI：先 `perform_ideation_temp_free.py` 生成想法 JSON（含假设/实验/相关工作分析），再 `launch_scientist_bfts.py` 树搜索实验（配置 `bfts_config.yaml`）→写作为 PDF（写作阶段约 20–30 分钟，全流程"typically within several hours"（通常在几小时内完成））；产物含 `unified_tree_viz.html` 树可视化。
- **叙事**："generalized end-to-end agentic system that has generated the first workshop paper written entirely by AI and accepted through peer review"（通用端到端代理系统，生成了首篇完全由 AI 撰写并通过同行评审的 workshop 论文）；v2 卖点=去模板化+跨 ML 域泛化。
- **同行评审事件（公开披露）**：3 篇投 ICLR 2025 ICBINB workshop（双盲、组委会同意），2 拒 1 过（均分 6.33，"Marginally above acceptance threshold"（略高于录用门槛））；按预协议录用即撤稿。官方坦承：workshop 录取率 60–70%（主会 20–30%）、内部评审"none of them passed our internal bar"（没有一篇达到我们的内部标准）主会档、人审曾抓到 LSTM 引用归属错误（Goodfellow 2016 vs Hochreiter & Schmidhuber 1997）。
- **v1 vs v2 诚实注记（README 原文）**："The AI Scientist-v2 doesn't necessarily produce better papers than v1...v2 takes a broader, more exploratory approach with lower success rates"（AI Scientist-v2 不一定比 v1 产出更好的论文……v2 采取更广泛、更具探索性的方法，但成功率更低）。
- **成本（FAQ）**：实验阶段 Claude 3.5 Sonnet 约 $15–20/次，写作约 +$5，ideation 数美元。
- **对 FAR-Lab 启示**：对手用"通过评审"做叙事锚点但披露了低门槛与人工质检依赖；FAR-Lab 用"可证伪+可验证"做锚点在评审眼中是正交且互补的差异化。

### 2.3 FutureHouse Robin

来源：
- 官方公告 https://www.futurehouse.org/research/demonstrating-end-to-end-scientific-discovery-with-robin-a-multi-agent-system （抓取成功）
- 开源 https://github.com/Future-House/robin （存在性经搜索核验）

- **形态**：无公开产品/界面——只有开源代码+示例轨迹；公告甚至表示希望"inspire others to build their own systems"（启发他人构建自己的系统），面向研究社区。
- **叙事**："the first multi-agent system for biological discovery to integrate hypothesis generation, experimental strategy, data analysis, and follow-up insights in one continuous workflow"（首个将假设生成、实验策略、数据分析与后续洞察整合于一个连续工作流的多智能体生物发现系统）；使命"to automate scientific discovery"（实现科学发现的自动化）。由文献代理（Crow/Falcon/Owl）+数据分析代理（Finch）编排。
- **首个发现/交付物**：ripasudil（ROCK 抑制剂）作为干性 AMD 新治疗候选；后续 KL001 昼夜节律机制提案；交付 Nature 论文+开源代码；"Robin autonomously generated the hypotheses, experiment choices, data analyses, and main text figures"（Robin 自主生成了假设、实验选择、数据分析和正文图表）。
- **验证方式与人工面**：临床前湿实验（细胞培养→人源 RPE 干细胞）；"Human researchers executed the physical experiments, but the intellectual framework was entirely AI-driven"（人类研究员执行了物理实验，但智力框架完全由 AI 主导）。
- **局限披露**：无实验室自动化、仅临床前、范围刻意收窄、无独立复现——公告如实列出。
- **对 FAR-Lab 启示**：Robin 证明"假设生成→实验设计→分析"闭环叙事在生物域已有人占位；FAR-Lab 差异=域（不限生物）、产品形态（CLI+Web 工作台 vs 纯代码）、科学纪律层（证伪规范/锦标赛/回执）。

### 2.4 Agent Laboratory（AMD/JHU）

来源：
- GitHub README https://github.com/SamuelSchmidgall/AgentLaboratory （经 zread 全文核验）
- 官网 https://agentlaboratory.github.io/ （抓取成功）
- arXiv https://arxiv.org/abs/2501.04227 （README 内链接）
- 注：README/官网均未标注机构；AMD/JHU 归属来自任务描述与论文作者单位（S. Schmidgall 等），产品页面本身"lists no institutional affiliations"（未列出机构隶属关系）。

- **形态**：开源 Python CLI（`python ai_lab_repo.py --yaml-location ...`，YAML 配置）；MIT 许可；README 提供多语言版。
- **叙事**：人机协同研究助理——"meant to assist you as the human researcher"（旨在协助作为人类研究员的你）、"You are the pilot"（你是掌舵人）、"not designed to replace your creativity but to complement it"（并非旨在取代你的创造力，而是对其补充）。与 Sakana 的"全自动"形成显式定位对立。
- **人工干预面（产品级）**：(1) 输入必须是人类产出的研究想法；(2) `task-notes` 注入机制（实验要求/算力/风格）；(3) **copilot 模式**（yaml 开关）——官网披露 co-pilot 模式把论文均分从 3.8 提到 4.38/10；(4) 检查点续跑。
- **交付物**：三阶段（文献综述→实验→报告写作）产出"研究报告+代码仓库"，paper-solver 输出"标准学术论文格式、适合会议投稿"（LaTeX 集成）；另有 AgentRxiv（代理上传/检索/累积科研的框架）。
- **成本披露（官网）**：全流程 gpt-4o $2.33 / o1-mini $7.51 / o1-preview $13.10。
- **局限披露（官网）**：评审分"fell well below the average score of 5.9 for accepted NeurIPS papers"（远低于 NeurIPS 录用论文 5.9 的平均分），"substantial gaps in technical and methodological rigor"（技术与方法学严谨性存在巨大差距），原创性与影响力有限。
- **对 FAR-Lab 启示**：这是叙事上最近的对手（人机协同+人给想法+FAR-Lab 同样不是替代科学家）。FAR-Lab 相对它的可主张差异：证据 fail-closed、九字段证伪规范、锦标赛排序、逐 call 回执、verify 复现包；且 Agent Lab 终点是"论文"，FAR-Lab 终点是"可证伪的假设+可执行研究计划"（Direction-A 正统）。

### 2.5 OpenScholar（AllenAI/UW）

来源：
- GitHub README https://github.com/AkariAsai/OpenScholar （经 zread 全文核验；机构库 allenai/OpenScholar 不存在，主库为 AkariAsai/OpenScholar）
- arXiv https://arxiv.org/abs/2411.14199 （抓取成功）
- 公共 demo https://open-scholar.allen.ai/ （webReader 抓取成功；官方博客 allenai.org/blog/openscholar 403）

- **形态**：免费公共 Web demo（问答式）+ 全栈开源（推理代码、8B 模型 checkpoint、检索器、200M+ 向量数据仓、训练数据、ScholarQABench 基准、专家评估界面与结果）。
- **叙事**：开放科学+接地综合——"a retrieval-augmented LM designed to answer user queries by first searching for relevant papers in the literature and then generating responses grounded in those sources"（一种检索增强语言模型，通过首先在文献中检索相关论文然后生成基于这些来源的回答来回应用户查询）；demo 页标语"Can language models synthesize scientific literature?...fully open, retrieval-augmented language model. Synthesize 8M+ open access research papers"（语言模型能综合科学文献吗？……完全开放的检索增强语言模型。综合 800 万+ 开放获取研究论文）（demo 数据仓 8M+ 开放论文，论文全量数据仓 45M）。
- **引用接地（产品关键）**：推理管线含 `--posthoc`（事后引用归因）；arXiv 摘要称"citation accuracy on par with human experts"（引用准确度与人类专家相当）并对比 GPT4o "hallucinates citations 78 to 90% of the time"（78% 到 90% 的时间会产生引用幻觉）。
- **第三方验证**：ScholarQABench（2,967 专家问题）+ 专家人类评估（专家 70% 偏好 OpenScholar-GPT4o 答案超过人类撰写答案）——评估代码与结果全开源。
- **局限**：产物止于"文献综合问答"；无假设生成、无研究计划、无排序。arXiv 摘要页无显式免责（v1 预印本）。
- **对 FAR-Lab 启示**：其"开放+接地+专家评估"三件套是评审心中的开源标杆；FAR-Lab 应对齐其"评估开源可复算"姿态（ScholarQABench 式外部可验证），并以"假设/计划层"与"fail-closed"错位竞争。

### 2.6 Elicit

来源：
- 首页 https://elicit.com/ （WebFetch 成功）
- 定价页 https://elicit.com/pricing （WebFetch 成功）

- **定位句**："Elicit helps researchers be 10x more evidence-based"（Elicit 帮助研究员变得更加循证，效率提升 10 倍）；"search, summarize, extract data from, and chat with over 125 million papers"（搜索、总结、提取数据并与超过 1.25 亿篇论文对话）（定价页称 138M）。
- **目标用户**：学界+工业（制药/医疗技术/政策政府/消费品/工业/软件），"trusted by over 5 million researchers"（受超过 500 万研究员信赖）。
- **交付物**：Research Reports（"process inspired by systematic reviews"（受系统性综述启发的流程））、系统性综述自动化（筛选+数据抽取，"up to 80% time savings"（节省高达 80% 的时间））、文献库、新文献告警、论文对话。
- **来源绑定呈现（本对标中最强公开承诺）**："Elicit supports all AI-generated claims with sentence-level citations from the underlying sources"（Elicit 为所有 AI 生成的主张提供来自底层来源的句级引用）；并公开准确率基准："95% search recall, 97% abstract screening, 99% full-text screening, and 96% extraction across 994 Cochrane reviews"（在 994 篇 Cochrane 综述中，95% 的检索召回率、97% 的摘要筛选、99% 的全文筛选和 96% 的抽取准确率）。
- **定价（公开）**：Basic 免费（1.25亿+ 论文无限检索/无限摘要/无限对话）；Pro $49/人/月（年付 $588，"For systematic reviews"（面向系统性综述））；Scale $169/人/月（年付 $2,028，"For collaboration"（面向协作），5x 用量）；Enterprise 定制（SSO/SAML、"No training on your data by default"（默认不使用您的数据进行训练））。
- **可复现性**：未公开（SaaS，无第三方复现包/verify 机制）。
- **对 FAR-Lab 启示**：句级引用+准确率数字是评审最可能拿来对照的"证据绑定"标杆。FAR-Lab 必须讲清：Elicit 的承诺是展示层+自报基准；FAR-Lab 是结构层 fail-closed（绑不上即降级）+第三方 verify 可独立核验。

### 2.7 SciSpace

来源：
- 首页 https://scispace.com/ （webReader 成功；WebFetch 403）
- 定价页 https://scispace.com/pricing （webReader 成功；价格卡片 JS 渲染，金额未出现在静态 HTML）

- **定位句**："The AI research assistant for academics. Run systematic literature reviews on 280M+ papers, and write papers with cited sources. Trusted by 9.6M+ researchers"（面向学术界的 AI 研究助理。在 2.8 亿+ 论文上运行系统性文献综述，并撰写带引用来源的论文。受 960 万+ 研究员信赖）（页脚 9.6M；meta 描述 1M+ students, PhDs & researchers，两处数字不一致）。
- **目标用户**：学生/博士/学者；宣称 SOC2。
- **交付物/功能面**：SciSpace Agent、Biomedical Agent、Literature Review、AI Writer、Chat with PDF、Paraphraser、Citation Generator、Extract Data、AI Detector、Chrome 扩展、移动 App——宽工具箱形态。
- **来源绑定呈现**：总述"write papers with cited sources"（撰写带有引用来源的论文）；逐句绑定/fail-closed 机制未见公开页面披露。
- **定价**：定价页存在；具体金额为动态渲染未能静态抓取 → **金额 UNVERIFIED**；FAQ 公开 credits（积分）制与团队并发任务容量、按席位升级。
- **对 FAR-Lab 启示**："多工具大杂烩+用户量叙事"路线；无科学纪律层，评审对照时 FAR-Lab 的深度差异（证伪/排序/verify）依然成立。

### 2.8 Consensus

来源：
- 首页 https://consensus.app/ （webReader 成功；WebFetch 403）
- 定价页 https://consensus.app/pricing （webReader 成功）
- 官方帮助中心 https://help.consensus.app/en/articles/9922673-how-consensus-works （直接抓取 403；内容经搜索索引摘要核验，标注为搜索摘要来源）

- **定位句**："Consensus is the AI academic search engine for peer-reviewed literature—your research OS for finding, organizing, and analyzing science 10x faster"（Consensus 是面向同行评审文献的 AI 学术搜索引擎——是你的研究操作系统，用于 10 倍更快地查找、组织和分析科学）。
- **目标用户**：科研者/学生/临床（定价页"Over 5 million researchers"（超过 500 万研究员））；高校/机构采购（University Access）。
- **交付物/特征功能**：学术搜索（200M+ 论文）、**Consensus Meter**——官方帮助中心："Uses AI to analyze and visualize the level of agreement or disagreement in the literature in response to yes-or-no questions"（使用 AI 分析并可视化文献中对是非问题的同意或不同意程度）；Deep Search 文献综述自动化；Medical 模式；Research Gaps（研究缺口）视图；API/MCP 接口。
- **来源绑定**：答案逐条绑定论文（含摘要摘录），支持/反对/混合以可视化呈现。
- **定价（公开）**：Free $0（基础检索无限 + 15 Pro messages/月 + 3 Deep 综述/月）；Pro $12/月（年付 $144；无限 Pro 消息、15 Deep 综述/月、250 API & MCP uses）；Deep $45/月（年付 $540；200 Deep 综述/月、1000 API uses）；学生/教师/临床 6 折（40% off）。
- **对 FAR-Lab 启示**：Consensus Meter 是"多源证据对撞可视化"的最成熟产品实现；FAR-Lab 的 counter-evidence+不确定性区间须做得比"是/否共识条"更细（支持度分布+证据质量+反证保留），否则评审会觉得是同类功能。

### 2.9 Scite

来源：
- 首页 https://scite.ai/ （webReader 成功；WebFetch 超时）
- 定价页 https://scite.ai/pricing/ （webReader 成功）

- **定位句**："Scite searches 300M+ scholarly articles to give you citation-backed answers and show you how every claim is supported or disputed"（Scite 检索 3 亿+ 学术文章，为你提供有引用支撑的回答，并展示每个主张如何被支持或争议）。
- **目标用户**：科研者、图书馆、出版方（自称 2M users；与 40+ 出版商合作、Wiley/SAGE 投资；母公司 Research Solutions，NASDAQ: RSSS）。
- **交付物**：Smart Citations（1.6B+ 引用陈述，分类 supporting/contrasting/mentioning）、Assistant 问答、引用徽章嵌入出版商站点、MCP/Claude 集成、Chrome 扩展、机构仪表盘。
- **来源绑定呈现（对标中最接近"反方证据一级公民"）**："Built for verification, not just answers: Every claim Scite's AI makes links back to the specific sentence in the specific paper it came from"（为验证而构建，而非仅仅为回答：Scite 的 AI 生成的每个主张都链接回其来源论文中的具体句子）；"Every answer is grounded in real papers, never generated or hallucinated"（每个回答都基于真实论文，绝不凭空生成或产生幻觉）。
- **定价（公开部分）**：三档（个人"For individual researchers"（面向个人研究员）/深度"For deep research"（面向深度研究）/团队"For labs and small teams"（面向实验室和小团队））；7 天免费试用；团队"Add up to 15 seats at $50/mo each"（最多添加 15 个席位，每席每月 50 美元）；个人档精确月费未在静态页渲染 → **UNVERIFIED**。
- **对 FAR-Lab 启示**：Scite 把"支持/反驳"做成数据资产（引用分类语料）——FAR-Lab 的差异在把反证用于**假设的证伪设计**（thresholds/样本量/多重检验），而非仅展示文献分歧。

### 2.10 OpenAI Deep Research

来源：
- 官方公告 https://openai.com/index/introducing-deep-research/ （webReader 全文成功；WebFetch 403）

- **定位句**："deep research is an agent that uses reasoning to synthesize large amounts of online information and complete multi-step research tasks for you"（深度研究是一个利用推理综合大量在线信息并为你完成多步骤研究任务的代理）。
- **过程透明呈现**：ChatGPT 内开关启用（发布时 o3 驱动）；可先向用户提澄清问题；"You can watch its reasoning and actions unfold in real time in a side panel"（你可以在侧边栏中实时观察其推理和行动）；"Show work"开关暴露底层推理链。
- **交付物**：5–30 分钟产出"clearly documented and properly cited"（记录清晰且引用规范）的输出，"with an inline citation to the original primary source"（带有指向原始一手来源的行内引用），"complete with a clear summary of its sources"（并附其来源的清晰摘要）。
- **局限披露（官方专节，值得引用）**："deep research does not always communicate its uncertainty...it hallucinates facts and makes citation errors from time to time while providing source links"（深度研究并不总是传达其不确定性……它在提供来源链接的同时偶尔会产生幻觉事实和引用错误）；"it may draw incorrect conclusions"（它可能得出错误结论）；建议用户对高风险决策进行验证；并给出不完美基准（Humanity's Last Exam 26.6% vs 人类专家 34.5%）。
- **可用性（发布时）**：Pro 先行（100 次/月），随后 Plus/Team/Edu/Enterprise（10 次/月）；后续分领域（金融/化学/医学）变体。
- **对 FAR-Lab 启示**：OpenAI 官方承认"引用错误+不传达不确定性"并把验证责任推给用户——这是 FAR-Lab "fail-closed+不确定性区间+verify" 最权威的对照论据（引用其原话即可）。

### 2.11 Google Gemini Deep Research

来源：
- 官方产品页 https://gemini.google/overview/deep-research/ （webReader 成功，es-419 版）
- Google 企业文档（引用佐证） https://docs.cloud.google.com/gemini/enterprise/docs/research-assistant （经搜索核验引文："It then generates a report of its findings with citations as well as an audio summary"（随后生成包含引用的研究发现报告及音频摘要））
- Workspace 博客 https://workspace.google.com/blog/ai-and-machine-learning/meet-deep-research-your-new-ai-research-assistant （存在性经搜索核验）

- **定位句**："tu asistente de investigación personal"（你的个人研究助理）/ 英文版 "your personal research assistant"；"explores hundreds of websites and the information in your Gmail, Drive and Chat, analyzes what it finds and creates exhaustive reports based on personalized searches in minutes"（探索数百个网站及你的 Gmail、云端硬盘和聊天中的信息，分析其发现，并在几分钟内基于个性化搜索创建详尽的报告）。
- **过程透明呈现（本对标中最强的"计划干预"设计）**：先把提问转成多点研究计划，"El plan está bajo tu control"（计划在你的掌控之下）——用户可编辑后再执行；执行中有"panel de razonamiento"（推理面板）显示模型学到什么/下一步做什么；可限定信息源（Workspace 数据）。
- **交付物**：多页研究报告（可导出 Google Docs）+ 音频概览；企业文档确认报告带引用（citations）。
- **可用性**：150+ 国家、45+ 语言、Workspace 用户（免费档配额未在该页明示，未公开）。
- **局限披露**：产品页未列幻觉/引用错误警示（与 OpenAI 形成反差）→ 该维度"未公开"。
- **对 FAR-Lab 启示**：可编辑研究计划+推理面板=对手在"人干预面"上的标杆；FAR-Lab 的计划编辑+假设修订版本对比须做到同等顺滑，另有对手没有的回执/verify 层。

---

## 3. FAR-Lab 竞争定位结论（独有能力矩阵）

### 3.1 能力 × 产品矩阵（●=公开产品面具备；○=部分/较弱；－=未见公开）

| 能力 | Sakana v1/v2 | Robin | AgentLab | OpenScholar | Elicit | SciSpace | Consensus | Scite | OAI DR | Gemini DR | **FAR-Lab** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 假设生成（作为一级交付物） | ● | ● | ○（人给 idea，系统做计划） | － | － | － | － | － | － | － | ● |
| 研究计划设计（可执行） | ●（实验自动执行） | ●（湿实验方案） | ● | － | ○（综述流程） | ○（综述流程） | － | － | － | ○（研究计划可编辑） | ● |
| **fail-closed 证据约束（绑不上来源即降级）** | － | － | － | ○（posthoc 引用归因，非强制） | ○（承诺句级引用，执行机制未公开） | － | － | ○（句子级链接，"never hallucinated"承诺） | －（自认会引用错误） | － | **●** |
| **可证伪性工程化（指标/阈值/样本量/多重检验纪律九字段）** | － | － | － | － | － | － | － | － | － | － | **●** |
| **假设锦标赛排序（统计模型+一致性检验+不确定性区间）** | ○（LLM 评审打分，非统计排序产品面） | － | － | － | － | － | ○（Consensus Meter 共识可视化，非假设排序） | － | － | － | **●** |
| **全链 LLM 回执（模型版本/token/延迟 per call）** | ○（论文披露总成本） | － | ○（官网披露总成本） | － | － | － | － | － | －（Show work=过程非审计回执） | －（推理面板=过程非审计回执） | **●** |
| **复现包+第三方独立 verify 命令** | ○（开源+全部运行公开，无打包核验） | ○（开源+轨迹） | ○（开源+检查点） | ○（全开源可复算，无 verify 命令） | － | － | － | － | － | － | **●** |
| 反方证据/不确定性保留呈现 | ○（自动评审列弱点） | ○ | ○ | － | ○ | － | ●（支持/反对可视化） | ●（contrasting 分类） | ○（自认不传达不确定性） | － | ● |
| 人工干预面（计划/关键点可编辑） | ○（v2 选题目/选提交） | ○（人跑实验） | ●（copilot+notes） | －（单轮问答） | ○ | ○ | ○ | ○ | ○（澄清问题） | ●（计划可编辑） | ● |
| 免费开源 | ● | ● | ● | ● | －（商业） | － | － | － | － | － | ●（本地单机 CLI+Web） |

### 3.2 评审同时看这些产品与 FAR-Lab 时会看到什么

**FAR-Lab 独有（无对手公开对应物）——4 项：**
1. **fail-closed 证据约束作为强制策略**：对手最多承诺"展示引用"（Elicit/Scite/OpenScholar）或承认"会引用错误"（OpenAI 原话），没有任何一家公开"绑不上来源的 claim 自动降级、绝不以全称呈现"的机制。
2. **九字段证伪规范**：全部 11 个对标产品的公开产品面都没有"每条假设带指标/阈值/样本量/多重检验纪律"的可证伪性 schema。这是科学方法论层面的产品化空白。
3. **假设锦标赛排序（Bradley-Terry+swap 一致性+不确定性区间）**：对手的排序要么是 LLM 评审打分（Sakana），要么是共识可视化（Consensus），无统计模型化排序+一致性检验+区间估计的公开产品面。
4. **打包复现+`far verify` 10 项独立核验**：开源对手给了代码/数据（可复算），商业对手全闭源；无人提供"第三方一键核验交付物"的产品形态。

**别人也有、FAR-Lab 不可声称独有——至少 6 项（诚实边界）：**
1. **来源绑定/引用接地展示**：Elicit（句级引用+自报准确率基准）、Scite（句子级溯源+支持/反驳）、OpenScholar（posthoc 引用归因+专家级引用准确率）、两家 Deep Research（行内引用）都有。FAR-Lab 只能声称"约束执行方式"独有，不能声称"claim-source 绑定"本身独有。
2. **反方证据呈现**：Scite contrasting 分类、Consensus 支持/反对可视化已很成熟。
3. **人机协同/计划可编辑**：Agent Laboratory "You are the pilot"+copilot 模式、Gemini DR 可编辑研究计划已是公开标杆。
4. **过程透明**：OpenAI 侧栏实时观看+Show work、Gemini 推理面板已经把"看得见过程"做进大众产品；FAR-Lab 回执的独有点仅在"审计级 per-call 记录"。
5. **假设生成**：Sakana v1/v2、Robin 都生成假设（虽然域受限/无证伪纪律）；FAR-Lab 独有的是"证伪规范+排序"这层工程，不是"生成假设"这个动作。
6. **开源+全运行公开**：Sakana（全部 runs 在 Google Drive）、OpenScholar（全栈开源）已树立该姿态。

**对手有而 FAR-Lab（本地单机、Direction-A）没有——评审也会看到的差距：**
- **语料规模**：Elicit 1.25亿+/SciSpace 2.8亿/Scite 3亿篇 vs FAR-Lab 本地检索面；
- **自动实验执行闭环**：Sakana（跑代码实验出论文）、Robin（湿实验验证）——FAR-Lab 不做 Direction-B 执行（架构上允许 adapter 但核心不替代）；
- **外部验证的基准与人类偏好研究**：OpenScholar ScholarQABench+专家评估、Elicit Cochrane 基准——FAR-Lab 需要（或已规划）同量级的第三方可复核评估叙事；
- **大众可用性/规模叙事**：5M/9.6M 用户级的社会证明。

### 3.3 给竞赛叙事的三条建议（基于以上证据）

1. **主打语**："别人把引用当展示（display），FAR-Lab 把证据当约束（constraint）；别人把假设当产物（output），FAR-Lab 把假设当可证伪承诺（falsifiable commitment）；别人给你报告，FAR-Lab 给你可独立核验的复现包。"可直接引用 OpenAI 官方局限原话（"hallucinates facts and makes citation errors... while providing source links"）与 Sakana 自认（"may incorrectly implement its ideas or make unfair comparisons"）作对照论据。
2. **不要打的点**：规模（语料/用户数）、全自动、跑实验出论文——这三点分别会被 hosted 产品、Sakana/Robin、Direction-B 类系统盖过。
3. **必须补的叙事短板**：参照 OpenScholar（外部可复算基准）与 Elicit（公开准确率数字），FAR-Lab 的 fail-closed/排序质量需要给出评审可复算的量化证据（例如降级率、绑定率、排序一致性指标），否则独有能力将停留在"宣称"层。

---

## 附录：未能核验项清单（UNVERIFIED / 受限）

| 项 | 状态 | 说明 |
|---|---|---|
| SciSpace 具体定价金额 | UNVERIFIED | 定价页价格卡片为 JS 动态渲染，静态抓取仅获 FAQ（credits 制）与评价 |
| Scite 个人档精确月费 | UNVERIFIED | 定价页静态渲染仅见三档描述、7 天试用、团队席位 $50/月/人 |
| Consensus 帮助中心全文 | 搜索摘要来源 | 直接抓取 403；Consensus Meter 定义引自官方帮助中心条目的搜索索引摘要 |
| Sakana v2 Nature 发表详情 | 搜索来源 | sakana.ai/ai-scientist-nature/ 与 nature.com 文章 URL 来自搜索结果，未抓取正文 |
| Gemini Deep Research 免费档配额 | 未公开 | 官方产品页未列各档 deep research 配额 |
| OpenAI Deep Research 当前配额 | 发布时口径 | 页面为发布文（Pro 100/月、Plus 等 10/月），2026-08 当前配额未另行核验 |
| Elicit "5 million researchers" vs meta "2 million" | 原样记录 | 首页 headline 与 meta description 数字不一致，按页面原文记录 |
| SciSpace "9.6M researchers" vs meta "1M+" | 原样记录 | 页脚与 meta 描述数字不一致，按页面原文记录 |
