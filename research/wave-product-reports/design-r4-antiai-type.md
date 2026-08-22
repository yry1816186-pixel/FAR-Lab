# 线 4 报告：反 AI 味判别学 + 字体个性选型（License 逐字核验）

- 日期：2026-08-22 ｜ Wave-PRODUCT 第二轮美学深调研 ｜ 线 4
- 方法与证据分级：`仓库 LICENSE 原文（逐字引用） > 官网原文（逐字引用） > 二手逐字引用（注明链条） > 社区观点（标注为观点）`。社区批评一律视为观点非事实；License 结论只基于原文引用。
- 状态：A 部分 COMPLETE（来源可查）；B 部分 COMPLETE（1 项 UNVERIFIED 字重数、1 项官网 FAQ 级声明，均显式标注）。

---

# A. 反 AI 味判别学

## A.1 证据基础（公开来源清单）

**系统性清单（ strongest evidence ）**
- **impeccable.style/slop** —《Slop》"64 patterns that mark an interface as AI-generated or poorly built, including all 59 deterministic detector rules"（https://impeccable.style/slop）。这是目前最系统的可操作判别学：64 条模式、59 条可确定性检测。关键内容（原文摘录）：
  - "Every wave of AI-generated UIs converges on a recognizable aesthetic"
  - Overused fonts 原文点名："**Inter**, **Geist**, **Space Grotesk**, **Instrument Serif** —— use cases [header, body, marketing]"
  - "Slop fonts: 3/4 of AI sites use the same handful of fonts... approximate a brand identity via overused free Google Fonts"
  - 逐条模式：紫色渐变 hero、居中 hero、gradient text、identical card grids、icon tile stacked above heading、侧边 tab accent border（"the single most recognizable tell"、"something like 75%+ of agents will choose"）、pulsing status dot、blinking cursor、ticker bar、米色/奶油底、emoji 图标、em-dash 与营销黑话
- **HN 高票讨论（观点）**
  - [Why does LLM generated websites feel so same](https://news.ycombinator.com/item?id=46475531) — 顶评归因：LLM 工具把设计规范写进 system prompt，"makes everything look the same unless you explicitly tell it otherwise"
  - [Every vibe-coded website is the same page with different content](https://news.ycombinator.com/item?id=45622944) — 看过几百个生成站后 "they all kind of look the same"，"identical and unmistakable AI design with **pills and tags**"
  - [Scoring Show HN submissions for AI design patterns](https://news.ycombinator.com/item?id=47864393) — 对 Show HN 做 AI 设计模式打分的元讨论
  - [HN 48749396 评论] — "The overuse of **blue and purple gradient fills** on the landing page is a telltale sign of AI slop"
- **批评文章（观点）**
  - Luis Ouriach, [The shadcn-ification of the internet](https://medium.com/@disco_lu/the-shadcn-ification-of-the-internet-d3788c055c63) — AI 工具把 shadcn 当作近乎普适的地基
  - [AI Design Slop (SmoothUI)](https://smoothui.dev/blog/ai-design-slop) — AI agent 产出同一套紫色渐变/玻璃拟态/相同卡片网格
  - [VibeCodeKit: AI Slop Design](https://vibecodekit.dev/ai-slop-design) — 定义 AI slop = "the generic look every AI coding agent reaches for by default"
  - [Why Your AI Keeps Building the Same Purple Gradient Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) — 训练数据同质化 → 紫渐变+Inter+圆角卡片
  - Alex Murrell, [The Age of Average](https://www.alexmurrell.co.uk/articles/the-age-of-average)（2023，AI 浪潮之前）— 创意领域趋同的宏观背景；AI 是加速器不是起点
  - 学术侧：arXiv 预印本 [Interrogating Design Homogenization in Web Vibe Coding](https://arxiv.org/html/2603.13036v1)（预印本，未经同行评审，仅作存在性证据：该现象已被学术化研究）
- **反面共识的成因**：Reddit r/vibecoding "Why do all AI generated websites look the same"（每个模型有自己的默认风格难以摆脱）；r/ClaudeCode 讨论 Claude 默认 minimalism/Swiss/neumorphism/glassmorphism。

## A.2 被点名的「AI 味特征」清单（均有多源佐证）

| # | 特征 | 出处（≥2 独立来源） |
|---|------|---------------------|
| 1 | 紫色/蓝紫→青渐变 hero 背景 | impeccable.style、smoothui.dev、HN 48749396、prg.sh、mohitphgat(Medium) |
| 2 | 玻璃拟态滥用 | impeccable.style、smoothui.dev、r/ClaudeCode |
| 3 | 默认字体组：Inter / Geist / Space Grotesk / Instrument Serif | impeccable.style（逐字点名）、prg.sh（Inter）、vibecodekit（Inter headlines） |
| 4 | 居中 hero：eyebrow pill chip + 大标题 + 双 CTA | impeccable.style（hero eyebrow/pill chip/hero metric）、HN pills and tags |
| 5 | 等距三卡片 / identical card grids / bento 网格 | impeccable.style、smoothui.dev、HN 45622944 |
| 6 | 灰色 1px 边框卡片 + 大圆角 | impeccable.style、vibecodekit |
| 7 | 图标瓦片堆叠在标题上方（icon tile above heading） | impeccable.style |
| 8 | 侧边 tab 左侧彩色 accent border | impeccable.style（"the single most recognizable tell"，75%+ agent 会选） |
| 9 | emoji 当图标 / 装饰性 blob 动画 | impeccable.style、Northeast Times |
| 10 | 米色/奶油底 + ticker bar（2026 新趋势） | impeccable.style、Northeast Times |
| 11 | gradient text、pulsing status dot、blinking cursor 装饰 | impeccable.style |
| 12 | 文案层：em-dash 滥用、营销黑话 | impeccable.style、smoothui.dev |
| 13 | 未调参的 shadcn/Tailwind 默认模板直接上线 | Ouriach (shadcn-ification)、HN 多帖 |
| 14 | 「Linear 仿品」暗色极简 SaaS 风（原作无罪，仿品泛滥） | LogRocket 分析 + HN 对克隆泛滥的抱怨 |

## A.3 正面对照：公认设计卓越的产品（理由可查）

- **Linear** — 社区公认的软件工艺基准："become a benchmark for software craftsmanship"；LogRocket 专文《Linear design: The SaaS design trend》指出它带起了整个暗色极简 SaaS 美学（https://blog.logrocket.com/ux-design/linear-design/）。其设计方法自述：结构化布局支撑导航与内容（https://linear.app/now/how-we-redesigned-the-linear-ui）。注意：被 A.2-14 仿品泛滥反证的恰是其原作地位。
- **Stripe** — 开发者体验与文档设计的金标准："sets the gold standard for developer experience"（Speakeasy/Engineering Enablement）；Moesifa 官方 teardown 逐层拆解其 docs-API-dashboard 闭环（https://www.moesif.com/blog/best-practices/api-product-management/the-stripe-developer-experience-and-docs-teardown/）。
- **Figma Dev Mode** — Fast Company Innovation by Design 2024 Enterprise 类获奖（https://www.fastcompany.com/91129463/enterprise-innovation-by-design-2024）。
- **奖项体系**：Awwwards Sites of the Year（https://www.awwwards.com/websites/sites_of_the_year/；Wikipedia 记录历届含 Mercedes-Benz、Bloomberg 等品牌站）；Fast Company IBD 2025 名单存在（https://www.fastcompany.com/innovation-by-design/list）——具体专业工具类得主未逐项核验（UNVERIFIED，不冒充）。
- **共性提炼（用于对照表）**：设计卓越者的个性来自**信息结构与系统一致性**（层级、密度、节奏、速度），不是装饰叠加。

## A.4 对照表：AI 味 vs 真设计感

| 维度 | AI 味（反面清单） | 真设计感（正面特征） | 依据 |
|------|------------------|---------------------|------|
| 色彩 | 紫→蓝→青渐变、默认蓝紫 | 由内容语义出发的克制主色；渐变有品牌理由才用 | impeccable.style、HN 48749396 vs Linear/Stripe 共性 |
| 字体 | Inter/Geist/Space Grotesk/Instrument Serif 无脑默认 | 有血统与功能的选型（工程字体/文态匹配），中西文有意识配对 | impeccable.style 逐字点名 vs 本报告 B 部分方法论 |
| 版式 | 居中 hero+三卡片+bento 网格 | 信息密度服务于任务流；非对称/层级化的真实布局 | impeccable.style、HN 45622944 vs Linear 结构化布局自述 |
| 组件 | 灰 1px 边卡片、icon tile 堆标题、accent border 侧 tab | 组件因交互需要存在；每个 UI 决策可回答"为什么" | impeccable.style 59 条规则 vs Stripe/Figma 获奖理由 |
| 动效 | blob 动画、pulsing dot、blinking cursor 装饰 | 动效传达状态变化/因果，可关 | impeccable.style vs Figma Dev Mode（获奖理由为功能设计） |
| 文案 | em-dash、营销黑话、三段式功能罗列 | 具体名词、真实数字、可验证陈述 | impeccable.style 文案规则 |
| 来源 | system prompt 默认审美，一次生成不改 | 设计意图链（选型理由可追溯） | HN 46475531 顶评（归因于内置设计规范） |

**FAR-Lab 可执行结论**：把 A.2 的 14 条做成 design review checklist（其中第 3、8 条是最高优先级：字体选型与侧 tab accent border 是最高识别度的两个 tell）；A.4 右列作为验收标准。

---

# B. 字体核验表（License 逐字核验）

## B.1 中文无衬线

### 1. MiSans（小米）
- **License**：小米自定义 EULA（非 OFL）。官网 FAQ（https://hyperos.mi.com/font/zh/faq/）声明免费商用且"支持嵌入式字体"；官网下载页 https://hyperos.mi.com/font/download。协议关键条款（经博客《从 HarmonyOS Sans 谈起》逐字引用小米官方协议，链条：官网 EULA → blog.xinshijiededa.men 二手逐字引用）：
  - "应在软件中特别注明使用了 MiSans 字体"；"不得改编或二次开发字体或其任何单独组件"；"不得单独租赁、再许可、给予、出借或以其他方式进一步分发字体或其副本（该限制不限制使用字体创作的作品）"；保留版权与协议；不得违法用途。
- **可否内嵌分发**：官网 FAQ 明示支持嵌入（商业+嵌入均免费）。**不可**：修改字体本体、单独再分发字体文件、不注明来源。
- **设计特征（官方）**：10 个字重 + 可变字体；29,093 字符（中文主字库）；"笔型平直有力，设计简约以减少视觉负担""简化了字体出脚，合并笔画交界处"，屏显优先；小米联合汉仪/蒙纳打造，MiSans Global 覆盖 20+ 书写系统、600+ 语言（官网 about 页）。
- **风险**：自定义协议可随官网改版变化（无 OFL 式永久承诺）；正式采用前应从官网下载包内 EULA 再核一遍。

### 2. HarmonyOS Sans SC（华为，汉仪设计，2021）
- **License**：华为自定义协议（非 OFL，**revocable 可撤销**）。协议原文（二手逐字引用，源头：随字体分发的 LICENSE_Fonts，OpenHarmony 资源仓库）：
  - "grant YOU a non-transferable, non-exclusive, royalty-free, **revocable**, worldwide copyright license to use, copy, merge, embed, bundle, redistribute and/or sell unmodified copies of HarmonyOS Sans Fonts with any software except for fonts software"
  - 条件：须显著注明版权；"您不得对 HarmonyOS Sans 字体或其任何单独组件进行任何修改"；不得以独立形式分发/出售字体（不适用于用字体创作的作品）；保留版权声明。
- **可否内嵌分发**：可随软件嵌入/捆绑/分发（明文允许），但仅限未修改副本且许可可撤销。
- **设计特征**：可变字体家族，官方 README（github.com/openharmony/resources）："The font family currently provides **six font weights: Thin, Light, Regular, Medium, Bold and Black**"；无级可变 + 数字等宽版（HarmonyOS Sans 数字字体）。
- **风险**：revocable + 禁修改，对长周期产品是实质法律风险；华为 2021 年宣布免费商用（多源：百度百科/维基百科/100font）。

### 3. OPPO Sans 3.0（OPPO，2019 首发 / 2022 3.0）
- **License**：OPPO 官方发布页脚注**逐字**（https://www.coloros.com/article/A00000050/）："OPPO Sans（含中文及西文，3 款字重）允许个人或企业免费使用，含商业用途，版权归 OPPO 广东移动通信有限公司所有。"四条限制（原文短语）："不对字体进行改编或二次开发""不对外售卖字体""不向他方提供其他下载渠道""不用于违法用途"。
- **可否内嵌分发**：免费商用明确；"不向他方提供其他下载渠道"意味着**不可以通过自己的 CDN/安装包分发字体文件**——对 Web 内嵌 @font-face 分发构成实质限制（这是 5 款国产字体中最严格的）。
- **设计特征（官方页原文）**："在旗黑和思源黑体的基础上进行中宫微收""将字身收窄，使文字看上去更加轻盈""相对提升了 OPPO Sans 重心的高度""去除字锋和喇叭口""去出脚的设计"。3.0 为 3 款字重（早期版本第三方记录为 5 款）。
- **风险**：分发渠道限制直接冲突 Web 场景 → **Web 项目不推荐**。

### 4. 阿里巴巴普惠体 3.0
- **License**：官网（https://www.alibabafonts.com/）标题即"永久免费正版商用字体"；2022 年第三期发布新闻（新浪财经）："永久、免费、可商用的版权字体"。下载包内附授权书。
- **可否内嵌分发**：官方口径全场景免费商用（含 App/界面，知乎 2026 综述亦记录"APP界面"适用）。**UNVERIFIED**：授权书逐字条款未取得（官网为 SPA，无法抓取协议全文）。
- **设计特征**：3.0 符合 GB18030-2022；字重数第三方记录冲突（猫啃网："简体中文指定 9 款字重（GB18030-2022 扩展部分 7 款）"；另有第三方记录 5/11 款）→ **字重数 UNVERIFIED，以官网下载包为准**。
- **风险**：同 MiSans 类（企业自定义授权，非 OFL）。

### 5. Noto Sans SC（Google/Adobe，思源黑体同源）
- **License**：**SIL OFL 1.1**，仓库 LICENSE 文件**逐字核验**（github.com/notofonts/noto-cjk → Sans/LICENSE）："This Font Software is licensed under the SIL Open Font License, Version 1.1."全文含 OFL 标准条款："Permission is hereby granted, free of charge, to any person obtaining a copy of the Font Software, to use, study, copy, merge, **embed**, modify, redistribute, and sell modified and unmodified copies..."（不得单独出售字体本体；修改版不得用 Reserved Font Name；衍生须继续 OFL）。
- **可否内嵌分发**：OFL 明文允许 embed/bundle/redistribute——**五款中文里法律最干净**。
- **设计特征**：Google Fonts 页面（fonts.google.com/specimen/Noto+Sans+SC）："contains **9 styles**"（Thin→Black，含可变版本）；与思源黑体同源（Adobe+Google 合作，7 静态字重体系）。
- **风险**：几乎无法律风险；审美上"中性默认"，个性需靠拉丁字体与排版建立。

### 中文小结
Web 内嵌分发场景的法律安全序：**Noto Sans SC（OFL）> MiSans（官方明示可嵌入）> 普惠体（口径可、条款未逐字）> HarmonyOS Sans（可嵌入但 revocable+禁改）> OPPO Sans（禁他方分发渠道）**。

## B.2 中文衬线（按需）

### 6. 思源宋体 Source Han Serif / Noto Serif SC
- **License**：**SIL OFL 1.1**，仓库 LICENSE.txt **逐字核验**（github.com/adobe-fonts/source-han-serif，master 分支）："Copyright 2017-2022 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'... licensed under the SIL Open Font License, Version 1.1."（RFN='Source'：修改版不得叫 Source 名字）
- **适用性**：7 静态字重（ExtraLight→Heavy）+ 可变版（仓库 Masters 结构可见）；适合 FAR-Lab 长文本阅读场景（研究计划正文、文献引用块）做衬线点缀；与 Noto Sans SC 同体系，混排协调。法律上与 Noto Sans SC 同级干净。

## B.3 拉丁界面字体

### 7. IBM Plex Sans（重点评估：科学/工程血统）
- **License**：**SIL OFL 1.1**，仓库 LICENSE.txt **逐字核验**（github.com/IBM/plex，master）："Copyright © 2017 IBM Corp. with Reserved Font Name 'Plex'... licensed under the SIL Open Font License, Version 1.1."（RFN="Plex"）
- **设计特征（可查来源）**：IBM 官网（ibm.com/plex）："IBM Plex® is our new typeface. It's global, it's versatile and it's distinctly IBM."；8 字重（Thin/ExtraLight/Light/Regular/Text/Medium/SemiBold/Bold，官网 typetester 实测列出）+ 斜体；设计师 Mike Abbink（IBM BX&D）与荷兰字体厂 Bold Monday 合作（Adobe Fonts/Google Fonts 条目记录）；家族完整（Sans/Mono/Serif/Condensed 同族）。
- **科学血统**：IBM 的企业字体，为"informative text"设计；IBM 官方品牌指南推荐 Plex Sans+Plex Mono 组合用于数据密集场景（ibm.com/brand/experience-guides/developer/brand/typography）。
- **tabular-nums**：支持 `font-variant-numeric: tabular-nums`（第三方实测文 dev.to/alanwest 验证 Plex 支持 tnum 切换；等宽数字场景 IBM 官方推荐直接用 Plex Mono）。

### 8. Public Sans（美国政府 USWDS 官方字体）
- **License**：**OFL 1.1 + CC0 双层**，仓库 LICENSE.md **逐字核验**（github.com/uswds/public-sans，master）："As a work of the United States Government, the font software modifications made by GSA are not subject to copyright... GSA waives copyright and related rights... through the CC0 1.0 Universal public domain dedication... The Original Version remains subject to copyright under the SIL Open Font License, Version 1.1."及"**In practice, users of this Modified Version (Public Sans) should use Public Sans according to the terms of the SIL Open Font License, Version 1.1**"（基于 Libre Franklin 的 Modified Version）。
- **设计特征**：GSA 为美国政府设计系统（USWDS）打造的界面正文字体；"strong, neutral"的中性无个性即其设计目标——对科学工具而言"无品牌倾向"本身是气质。字重 9 级（Light→Black，USWDS 文档记录）。
- **定位**：中庸稳健之选；个性弱于 Plex，但"政府中立感"与学术工具气质契合。

### 9. Source Sans 3（Adobe）
- **License**：**OFL 1.1**，仓库 LICENSE.md **逐字核验**（github.com/adobe-fonts/source-sans，master）："Copyright 2010-2024 Adobe... with Reserved Font Name 'Source'... licensed under the SIL Open Font License, Version 1.1."
- **设计特征**：Adobe 首个开源字体家族的最新版；人文无衬线，为 UI/正文设计。**注意**：与 Noto Sans SC 的拉丁部分风格相近（同属 Adobe 系），中文用思源/英文用 Source Sans 是"隐形默认组合"，个性弱。

### 10. Archivo（Omnibus-Type，阿根廷）
- **License**：**OFL 1.1**，仓库 OFL.txt **逐字核验**（github.com/Omnibus-Type/Archivo，master 分支）："Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo)... SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007"。
- **设计特征**：Omnibus-Type 出品的 grotesque，字重宽窄齐全（含 Condensed/Expanded 子族），标题与界面两用，grotesque 骨架比 Inter 类几何无衬线更有工业个性。foundry 页 omnibus-type.com（本次未逐字抓特征描述，特征以家族构成与分类为准——UNVERIFIED 细节不编造）。

### 11. Space Grotesk（Florian Karsten）——**带 AI 味关联风险**
- **License**：**OFL 1.1**，仓库 OFL.txt **逐字核验**（github.com/floriankarsten/space-grotesk，master）："Copyright 2020 The Space Grotesk Project Authors... SIL OPEN FONT LICENSE Version 1.1"。
- **设计特征**：Google Fonts："developed by Florian Karsten to be a standalone sidekick with greater versatility... contains 7 styles"，源自 Space Mono，有奇特的字形个性，展示字体定位。
- **关键风险**：**被 impeccable.style《Slop》明确列入 overused fonts 名单（与 Inter、Geist、Instrument Serif 并列）**——法律上完全可用，但"AI 味判别学"上它正是被点名的默认选择。FAR-Lab 若用它做展示字体，等于主动穿上被识别度最高的 AI 制服。**不建议做主展示字体**。

## B.4 等宽/数据字体

### 12. IBM Plex Mono
- **License**：同 IBM/plex 仓库 LICENSE.txt（OFL 1.1，RFN "Plex"，已逐字核验，覆盖全家族含 Mono）。
- **特征**：与 Plex Sans 同族同节奏（家族一致性是 Plex 体系最大优势）；等宽字体数字天然表格对齐；IBM 官方推荐用于数据密集文本。tabular-nums 由等宽保证。

### 13. JetBrains Mono
- **License**：**OFL 1.1**，仓库 OFL.txt **逐字核验**（github.com/JetBrains/JetBrainsMono，master）："Copyright 2020 The JetBrains Mono Project Authors... SIL OPEN FONT LICENSE Version 1.1"。
- **特征（官方）**：官网/GitHub 原文："**Increased x-height**. While characters remain standard in width, the height of the lowercase is maximized"（小字号渲染与识别更优）；142 个代码连字（ligatures 可关）；l/1/I、0/O 区分优化；Philipp Nurullin & Konstantin Bulenkov 设计（Google Fonts 条目）。
- **定位**：科研工具的代码/证据/数据面板字体，开发者认知度最高。

### 14. Geist Mono（Vercel）
- **License**：**OFL 1.1**，双重核验：仓库 OFL.txt 逐字（github.com/vercel/geist-font，main）"Copyright 2024 The Geist Project Authors... SIL OPEN FONT LICENSE Version 1.1"；官网（vercel.com/font）声明"Geist is available under the SIL Open Font License 1.1. **Geist is a trademark of Vercel.**"
- **风险**：① 商标归 Vercel（OFL 只管版权不管商标，命名引用需留意见）；② **Geist 被 impeccable.style 列入 overused fonts**（AI 味关联，同 Space Grotesk）。

### 15. Commit Mono（Eigil Nikolajsen）
- **License**：官网 FAQ（commitmono.com）**逐字**："Commit Mono is available under the **SIL Open Font License 1.1** license. It can therefore be used freely for both commercial and non-commercial purposes."；"Is Commit Mono free to use on a website, in software or an app? **Yes.**"（注：此为官网 FAQ 级声明，仓库 LICENSE 文件未逐字读——采用前建议从 GitHub 仓库再核一遍，标注为 WEAK-VERIFIED）
- **特征（官网）**："an anonymous and neutral programming typeface focused on creating a better reading experience"；**Smart Kerning**（保持等宽前提下微调字距）；42 个 cuts（7 字重 × 斜体/正体 × 默认/Smart Kerning 版）；官网可自定义构建下载。中性定位直接对标 Berkeley Mono 的开源替代。

## B.5 组合提案（3 组）

### 组合 1「工程理性派」（主推）
**IBM Plex Sans（拉丁 UI）+ IBM Plex Mono（数据/代码）+ Noto Sans SC（中文）+ 思源宋体（长文引用块，可选）**
- 个性来源：IBM Plex 是为"informative text"设计的科技企业字体，科学/工程血统真实可查（Mike Abbink × Bold Monday，IBM 品牌指南推荐数据场景）；中文 Noto Sans SC 中性稳定，把个性交给拉丁字体承担——中文工具的明智分工。
- 可商用证据：IBM/plex LICENSE.txt = OFL 1.1（逐字）；noto-cjk Sans/LICENSE = OFL 1.1（逐字）；source-han-serif LICENSE.txt = OFL 1.1（逐字）。**全部 OFL，法律最干净，可内嵌可分发可修改。**
- 组合逻辑：Sans/Mono 同家族（节奏、曲线、x-height 一致，中英混排不跳）；数字表格用 Plex Mono 或 Plex Sans+tabular-nums；衬线仅用于研究计划正文/文献长文。
- 风险：Plex"大公司中性"气质需靠版式与信息密度激活；中文字体文件大（见下fallback 策略）。

### 组合 2「本土屏显派」（视觉个性最强）
**Archivo（拉丁 UI/标题）+ JetBrains Mono（数据）+ MiSans（中文）**
- 个性来源：MiSans 官方设计语言"笔型平直有力、减少视觉负担、去出脚"——为屏幕阅读设计，10 字重+可变字体的中文表达力最强；Archivo 的 grotesque 骨架工业感强；JetBrains Mono 的高 x-height 与 MiSans 的舒展中宫在小字号下都占优。
- 可商用证据：Archivo OFL.txt = OFL 1.1（逐字）；JetBrainsMono OFL.txt = OFL 1.1（逐字）；MiSans = 官网 FAQ 明示"允许商业目的使用并支持嵌入字体"（自定义 EULA：须注明使用、禁改字体本体、禁单独分发字体文件）。
- 组合逻辑：三者都比"默认感"字体更有态度；MiSans 与 Archivo 都偏几何/直线骨架，气质统一。
- 风险：MiSans 非 OFL——若 FAR-Lab 未来开源分发含字体文件的包，需重新核对 EULA 措辞（"不限制用字体创作的作品"与"不得单独分发副本"的边界）；中文包体积（29,093 字符）必须子集化。

### 组合 3「政府中立派」（最克制）
**Public Sans（拉丁 UI）+ Commit Mono（数据）+ Noto Sans SC（中文），以 HarmonyOS Sans SC 为备选中文字体**
- 个性来源：Public Sans 是美国政府设计系统官方字体（"为公众界面设计"的中立性本身即立场，适合"方法操作系统"的严肃感）；Commit Mono 中性+Smart Kerning，无品牌脸。
- 可商用证据：public-sans LICENSE.md = OFL 1.1+CC0（逐字）；Commit Mono = 官网 FAQ 声明 OFL 1.1（WEAK-VERIFIED）；Noto Sans SC = OFL 1.1（逐字）。
- 组合逻辑：全链路"无表情高可读"，个性全部来自信息架构与留白——最不容易过时，也最难做出彩。
- 风险：Commit Mono 仓库 LICENSE 未逐字核验（用 IBM Plex Mono 替换则零风险）；HarmonyOS Sans SC 若启用，其协议 **revocable+禁修改** 是实质法律风险，仅建议在能接受撤销条款时使用，否则不选。

### 技术注记（三组通用）
- 中文 Web 分发：CJK 全量 woff2 数 MB 级，必须用 `unicode-range` 分片（按常用度切片，如 GB2312 常用 3500 字一片+动态补集）+ `font-display: swap`；或首屏仅加载拉丁字体、中文走系统栈回退。
- Fallback 栈示例（组合 1）：`font-family: "IBM Plex Sans", "Noto Sans SC", -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;`；数据列：`"IBM Plex Mono", "Noto Sans SC", ui-monospace, monospace;` + `font-variant-numeric: tabular-nums;`
- OFL 合规义务（所有 OFL 字体）：分发时保留版权行与许可证文本（可入 font 元数据或 LICENSES/ 目录）；修改版不得使用 Reserved Font Name（Plex/Source 等均有 RFN）。

## B.6 未核验项与诚实声明
1. 阿里巴巴普惠体 3.0 具体字重数：第三方记录 5/9/11 冲突，官网 SPA 未核验 → UNVERIFIED。
2. Commit Mono：官网 FAQ 声明 OFL 1.1，仓库 LICENSE 未逐字读 → WEAK-VERIFIED，采用前补核。
3. MiSans / HarmonyOS Sans 协议原文经二手博客逐字引用（源头为官网 EULA / 随字体分发 LICENSE 文件），正式采用前应取官方下载包原件复核。
4. IBM Plex 的 tnum 支持证据来自第三方实测文与 IBM 品牌指南推荐，非官方 spec 逐字。
5. Awwwards / Fast Company IBD 2025 具体获奖名单未逐项核验；Figma Dev Mode（IBD 2024 Enterprise）已核实。
6. 社区对"AI 味"的所有批评均为观点；本报告引用的是被广泛重复的特征共识，非审美事实。

## 来源总表（关键项）
- impeccable.style/slop ｜ smoothui.dev/blog/ai-design-slop ｜ vibecodekit.dev/ai-slop-design ｜ prg.sh ramblings ｜ medium.com/@disco_lu shadcn-ification ｜ alexmurrell.co.uk The Age of Average ｜ HN 46475531 / 45622944 / 47864393 / 48749396 ｜ logrocket.com Linear design ｜ moesif.com Stripe teardown ｜ fastcompany.com 91129463（IBD 2024）｜ awwwards.com/sites_of_the_year
- License 原文：github.com IBM/plex（LICENSE.txt）· uswds/public-sans（LICENSE.md）· adobe-fonts/source-sans（LICENSE.md）· adobe-fonts/source-han-serif（LICENSE.txt）· notofonts/noto-cjk（Sans/LICENSE）· floriankarsten/space-grotesk（OFL.txt）· JetBrains/JetBrainsMono（OFL.txt）· Omnibus-Type/Archivo（OFL.txt, master）· vercel/geist-font（OFL.txt）——均于 2026-08-22 逐字核验
- 中文字体官方：hyperos.mi.com/font（+zh/faq）｜ coloros.com/article/A00000050 ｜ alibabafonts.com ｜ openharmony/resources ｜ blog.xinshijiededa.men/font-license（HarmonyOS/MiSans 协议二手逐字）
