# Wave-PRODUCT 美学深调研 · 线 1：设计学理论源流（design-r1-theory）

- 日期：2026-08-22（全部 URL 当日实访核验）
- 目的：把第一版美学提案被驳回（"AI 味儿重、没有设计感、只会堆组件和动画"）之后的视觉决策，锚定在可核验的设计学理论原文与具体数值上，而非风格词堆砌。
- 诚实标注约定：每条来源标注【直接】= 本轮实际抓取原文；【间接】= 官方页/可靠百科对书内容的转述（书本文体未直接核验）。引文均为抓取到的原文，无编造。
- 工具备注：edwardtufte.com 旧版 bboard 链接已 301 重构（/tufte/books_vdqi → /books/ → /book/...）；designishistory.com、graphéine.com 存在 TLS/DNS 故障，本报告未引用。

---

## 1. Edward Tufte《The Visual Display of Quantitative Information》(1983 / 2nd ed 2001)

### 来源
| URL | 核验方式 |
|---|---|
| https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/ | 【直接】官方书页（1983 / 2nd Edition 2001，197 页，Graphics Press 自出版） |
| http://www.edwardtufte.com/books/ | 【直接】官方书目页 |
| https://en.wikipedia.org/wiki/Edward_Tufte | 【间接】书内概念与引文的百科转述（含出处页码） |
| https://en.wikipedia.org/wiki/Sparkline | 【间接】sparkline 定义引文（引注 Tufte 本人论坛帖 2013 与《Beautiful Evidence》2006） |

### 核心原则提取
- 官方页定位（原文）："The classic book on statistical graphics, charts, tables. Theory and practice in the design of data graphics, 250 illustrations of the best (and a few of the worst) statistical graphics"；主题清单逐字含："Design of the high-resolution displays, small multiples."、"Editing and improving graphics. The data-ink ratio."、"Detection of graphical deception: design variation vs. data variation."
- **chartjunk**（Tufte 造词，维基转述定义）："useless, non-informative, or information-obscuring elements of quantitative information displays"（无用、不传达信息、或遮蔽信息的展示元素）。
- **data-ink ratio**：维基表述为 Tufte 用该概念 "to argue against using excessive decoration in visual displays of quantitative information"。同族概念：lie factor、data density。
- VDQI 2001 版 p.59 原句（维基引）："Sometimes decoration can help editorialize about the substance of the graphic. But it is wrong to distort the data measures—the ink locating values of numbers—in order to make an editorial comment or fit a decorative scheme."（装饰可以有立场，但扭曲承载数值的墨迹去迁就装饰是错误的。）
- **small multiples**（维基转述）：多条序列挤在同一对坐标轴上，常不如拆成若干并排的独立小轴易读；当各序列 y 轴量纲不同而 x 轴（通常为时间）一致时尤其有效。
- **sparkline** 定义（维基引 Tufte 2013 论坛帖，与《Beautiful Evidence》2006 同源）："small, high resolution graphics embedded in a context of words, numbers, images"；"data-intense, design-simple, word-sized graphics"；尺寸规则原文："The sparkline should be about the same height as the text around it."
- 出版信息以官方页为准：1983 / 2nd Edition 2001，197 页（Graphics Press 自出版）。
- 延伸佐证：Tufte 1990 年在《Oikos》发表同行评审论文 "Data-Ink Maximization and Graphical Design"（维基引，JSTOR 索引存在）。

### 对 FAR-Lab 的可操作映射
1. **组件 ink 审计**：每个新视觉元素过"删除测试"——删掉它信息是否损失？渐变背景、发光边框、装饰图标、大圆角卡片套卡片属候选删除项。这直接反制"AI 味儿=堆装饰"。
2. **证据行内 sparkline**：证据强度/引用年份分布等行内趋势图，高度=行高（约 20px），无坐标轴、无图例，旁边放数值。
3. **多假设对比用 small multiples**：假设评分对比渲染为同构小卡片网格（同一列轴=评估维度），不做多序列叠加大图。
4. **反欺骗纪律**：评分/置信度可视化中，视觉差异幅度不得大于数据差异幅度（design variation vs. data variation 直接对应产品"诚实显示证据强度"的叙事）。
5. 表格/徽章/时间线的密度纪律：分隔线克制使用（与 Butterick rules-and-borders "Use sparingly" 交叉印证），徽章只在文字本身承载信息时使用。

---

## 2. 瑞士国际主义风格 / 网格系统（Müller-Brockmann、Tschichold）

### 来源
| URL | 核验方式 |
|---|---|
| https://en.wikipedia.org/wiki/International_Typographic_Style | 【直接】词条全文（引 Meggs' History of Graphic Design） |
| https://en.wikipedia.org/wiki/Josef_Muller-Brockmann | 【间接】书目与生平转述 |
| https://en.wikipedia.org/wiki/Jan_Tschichold | 【间接】《The New Typography》(1928) 内容转述 |

### 核心原则提取
- **ITS 风格标志**（词条原文列举）："asymmetric layouts, use of a grid, sans-serif typefaces like Akzidenz-Grotesk and Helvetica, and flush left, ragged right text"（非对称版式、网格、无衬线、齐左不齐右）；并偏好"preference for photography in place of illustrations"（客观摄影取代插画，排除宣传/商业广告的劝说性影响）。
- **网格的方法论地位**（词条引 Meggs 教科书原文）："Each design ... begins with a mathematical grid, because a grid is the 'most legible and harmonious means for structuring information.'"（一切设计从数学网格开始：网格是组织信息最清晰、最和谐的手段。）
- **Müller-Brockmann**（维基词条核验事实）：ITS 先驱、"one of the main masters of Swiss design"；以"simple designs and his clean use of typography, shapes and colors"著称；钟爱 Akzidenz-Grotesk；1958 年与 Neuburg/Lohse/Vivarelli 共同创办《New Graphic Design》；1967 年任 IBM 欧洲设计顾问；Musica Viva 海报系列"用视觉形式翻译音乐中的数学系统"。其著作《Grid Systems in Graphic Design》（德文 Raster Systeme，Arthur Niggli；维基书目列英文版 1981）。他的立场由 ITS 词条（引 Meggs）转述："sought an absolute and universal form of graphic expression through objective and impersonal presentation, communicating to the audience without the interference of the designer's subjective feelings or propagandist techniques of persuasion"（追求客观、非个人化的呈现，不让设计师主观情绪或宣传技巧干扰信息）。
- **Tschichold《Die neue Typographie》(1928)**（维基转述）：现代设计宣言，"condemned all typefaces but sans-serif"（只认无衬线）；"favoured non-centered design"（反对居中版式）；"codified many other Modernist design rules"；"advocated the use of standardised paper sizes"（拥护标准化纸张尺寸，今 ISO 216 体系）；并"made some of the first clear explanations of the effective use of different sizes and weights of type in order to quickly and easily convey information"（最早系统解释如何用字号/字重层级快速传达信息者之一）。前奏是 1925 年《Elementare Typografie》专刊提纲。历史注：1933 年 3 月被纳粹逮捕（罪名"文化布尔什维克"）；1947-49 重构 Penguin Books 500 种平装书，留下标准化规则集 **Penguin Composition Rules**——"设计系统文档"的早期范本；后期转向古典主义并自我批判新排版过于极端（一个有用的教训：规则系统也要容许修正）。

### 对 FAR-Lab 的可操作映射
1. **4/8px 基础网格**：所有 spacing/尺寸 token 定义为网格倍数（与第 6 节 Comeau 间距 token 互证）；分栏面板宽度绑列网格。
2. **齐左不齐右**正文与标签；表格内文本列左对齐、数字列右对齐。
3. **组件匿名化**：不设计"有个性"的装饰组件；层级只由字号、字重、位置、留白四个变量产生（这同时是反"AI 堆组件"的理论根据）。
4. **黑白灰基底 + 单一强调色**（与第 3 节 Braun、第 5 节色板纪律合流）。
5. 界面术语排版遵循"清晰优先"：标签统一句式大小写（sentence case），禁止为风格感做大字距标题（见第 4 节 all-caps/letterspacing 规则）。

---

## 3. Dieter Rams 十原则与 Braun 仪器美学

### 来源
| URL | 核验方式 |
|---|---|
| https://www.vitsoe.com/us/about/good-design | 【直接】vitsœ 官方十原则页（标题逐字） |
| https://en.wikipedia.org/wiki/Dieter_Rams | 【间接】Braun 设计史 |
| https://en.wikipedia.org/wiki/Braun_(company) | 【直接】 |
| https://collections.vam.ac.uk/item/O1360553/et66-calculator-et66-calculator-dieter-rams/ | 【直接】V&A 博物馆藏品记录（ET66, Type 4776, 1987, Rams & Dietrich Lubs） |

### 核心原则提取
- **十原则**（vitsœ 标题逐字）：Good design is innovative / makes a product useful / is aesthetic / makes a product understandable / is unobtrusive / is honest / is long-lasting / is thorough down to the last detail / is environmentally-friendly / **is as little design as possible**（"Less, but better"）。背景原句：Rams 自省于 1970s 的 "impenetrable confusion of forms, colours and noises"。
- **Braun 设计史要点**（维基）：1956 SK 4 收音机-留声机（Rams 与 Ulm 设计学院的 Hans Gugelot 合作，绰号 "Snow White's Coffin"）确立"功能器件+几何金属面板"范式；Rams 1961-1995 任首席设计师，哲学为功能主义（functionalism）"Less, but better"（Weniger, aber besser）。
- **ET66 仪器面板设计语言**（V&A 记录原文要点）：V&A 描述其为 "a key example of Braun's rational functionalism"；功能界面 "was simple, with colour coding to help with recognition"——主机身高光黑（high gloss black）；数字键黑、功能键棕/暗绿、运算符亮绿/黄，**等号键为全机唯一黄色**；颜色=功能分组的编码，而非装饰。系列细节（博物馆/设计史报道佐证）：凸起圆形按键（convex）提供触觉定位。
- **影响链**（维基）：iOS 计算器直接参照 ET66；Apple Podcasts 转盘界面参照 Braun TG 60 磁带机；Jony Ive 公开视 Rams 为榜样。
- **"实验室仪器感"构成要素**（据以上来源归纳，非单页原文）：(a) 中性深灰/黑机身底色；(b) 控件按功能分色——低饱和功能色组 + 单一高亮动作色；(c) 几何凸起控件与刻度式标签；(d) 小号无衬线标签，层级靠字号/字重/位置；(e) 面板上无任何非功能性表面元素。

### 对 FAR-Lab 的可操作映射
1. 十原则直译为产品守则：**honest**→不夸大证据强度显示；**unobtrusive**→UI 是仪器不是舞台；**understandable**→界面自解释（空态/禁用态说明原因）；**thorough down to the last detail**→加载/失败/部分结果等状态与主界面同等打磨；**as little design as possible**→每次加视觉元素前先做减法。
2. **ET66 色彩编码制**：中性底色之上，语义功能组用低饱和色，全屏唯一高亮色留给最高频主行动（对应 ET66 黄色等号键）。
3. **凸起控件 ≈ 轻量实体感**：交互控件用 1px 边框 + 极浅 inset/outset 表达可按压性，不用渐变拟物。
4. "仪器面板"隐喻的落地是**刻度与标签的秩序**（单位、量程、状态全部显式标注），不是复古皮肤。

---

## 4. Butterick's Practical Typography（全书免费在线）

### 来源（每条规则标注出处页，全部【直接】逐页核验，2026-08-22）
基础页：https://practicaltypography.com/ （目录）、/typography-in-ten-minutes.html、/summary-of-key-rules.html；规则页见下表（域名均为 practicaltypography.com）。

### 工具类 UI 最相关的 18 条规则
| # | 规则（含原文数值） | 出处页 |
|---|---|---|
| 1 | 正文字号：网页 15–25px（印刷 10–12pt）；"Smaller on paper; bigger on screen" | /point-size.html |
| 2 | 行高：120–145% 字号 | /line-spacing.html |
| 3 | 行宽：45–90 字符（≈2–3 个字母表宽） | /line-length.html |
| 4 | 标题："Fewer levels, subtler emphasis"——更少层级、更收敛的强调 | /headings.html |
| 5 | 层级标题考虑分段编号（tiered numbers） | /hierarchical-headings.html |
| 6 | 粗体或斜体二选一："One or the other, as little as possible"（互斥、用量最少） | /bold-or-italic.html |
| 7 | 强调优先级（页面副标题）："always for emphasis in printed text; for the web, consider color or underline"——印刷用粗/斜体，web 下颜色是主要强调手段 | /bold-or-italic.html |
| 8 | 全大写只用于不超过一行的文本；"always add letterspacing to caps" | /all-caps.html |
| 9 | 字距：大写加 5–12% 额外间距，小写绝不加字距 | /letterspacing.html |
| 10 | 下划线："Absolutely not"——印刷禁用；web 语境仅链接惯例可用（NYT/GitHub/Wikipedia 的链接都改用颜色+粗细） | /underlining.html |
| 11 | 等宽字体不用于正文（Courier/Menlo/Consolas 类仅限代码）；等宽体会破坏排版节奏 | /monospaced-fonts.html |
| 12 | 数字形态：数据竖列必须用 **tabular figures**（等宽数字），"tabular figures are essential for one purpose: vertically aligned columns"；正文中的数字配 oldstyle，全大写标签配 lining | /alternate-figures.html |
| 13 | 数字对齐检验法：一行 0 叠一行 1，对不齐即非 tabular | /alternate-figures.html |
| 14 | 段落间距：4–10pt | /space-between-paragraphs.html |
| 15 | 分隔线/边框："Use sparingly"——克制使用 | /rules-and-borders.html |
| 16 | 破折号三件套不混用：hyphen 只用于复合词，区间用 en dash，插入语用 em dash | /hyphens-and-dashes.html |
| 17 | 页面排版九 maxim（逐字核验）：① 正文先行（四个变量 point size/line length/line spacing/font 决定一切）② 先分前景/背景对比 ③ 用最小可见增量（字号变化小于 5% 无感知，别白费）④ 拿不准就两种都试 ⑤ 保持一致（一致性>局部最优）⑥ 新元素与既有元素建立关系（间距变化应为字号的简单倍数）⑦ keep it simple（草稿用 1 字体 2 字重 3 字号）⑧ 模仿好例子直到形成判断 ⑨ 不要怕留白 | /maxims-of-page-layout.html |
| 18 | 网格："A guide, not a panacea"——网格是向导不是万能药 | /grids.html |

注：/typography-in-ten-minutes.html 与 /summary-of-key-rules.html 本轮抓取仅获页首（服务器端截断），上表数值规则均以各自独立规则页的逐页核验为准。

### 对 FAR-Lab 的可操作映射
1. 正文阅读参数硬编码进 token：正文 15-16px、行高 1.5（120-145% 区间）、阅读列 45-70 字符（工作台侧栏可放宽至 90）。
2. **所有数字列（证据计数、评分、年份、页码）启用 tabular figures + 右对齐**，并用 0/1 叠加法验收字体。
3. 标题层级 ≤3；强调手段二选一（工作台用粗体+语义色，不用斜体——无衬线体）。
4. 段落/卡片间距走字号倍数（0.5-1.0×），走 spacing token 而非手调像素。
5. 分隔用 1px hairline 或留白，禁粗边框堆叠。
6. 命名类小标签（如 `EVIDENCE-SOURCE`）若全大写，必须加 5-12% 字距。

---

## 5. 色彩理论用于界面：OKLCH 与语义色饱和度纪律

### 来源
| URL | 核验方式 |
|---|---|
| https://www.w3.org/TR/css-color-4/ （CSS Color Module Level 4, W3C CRD, 2026-08-06 版） | 【直接】规范全文抓取 |
| https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch | 【直接】 |
| https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl | 【直接】 |
| https://oklch.com/ | 【直接】（Andrey Sitnik & Roman Shamin @ Evil Martians 出品的拾色器；工具本体，文档在上述文章） |
| https://www.refactoringui.com/previews/building-your-color-palette | 【直接】免费预览章（Adam Wathan & Steve Schoger） |

### 核心原则提取
- **oklch(L C H / a) 通道定义**（MDN + 规范 §9.4，直接）：L=感知亮度 0–1（MDN 原文强调是 *perceived* lightness，与 hsl() 的 *relative* lightness 相对）；C=chroma，实用上限 0.4–0.5（MDN："100% is the number 0.4"；规范："in practice does not exceed 0.5"）；H=色相角 0–360；百分比换算基准 L: 0–1.0、C: 0–0.4。Baseline 2023 起全浏览器可用。
- **HSL 的两宗罪**（规范 §7 原文）：① "A disadvantage of HSL over OkLCh is that hue manipulation changes the visual lightness, and that hues are not evenly spaced apart."——同 L=50% 的蓝 hsl(240 100% 50%) 与黄 hsl(60 100% 50%) 视觉亮度悬殊，OKLCH 下蓝 L=0.452、黄 L=0.968；② 色相间距不均匀：HSL 相差 30° 的两对色，一对近似、一对悬殊。
- **CIE LCH 的蓝区缺陷与 Oklab 的来历**（规范 §9.1/§9.2 原文）：LCH 色相 270°–330°（蓝区）存在 hue linearity 缺陷——"as a saturated blue has its Chroma progressively reduced, it becomes noticeably purple"；Oklab/OKLCh "produced by numerical optimization of a large dataset of visually similar colors"，在 hue linearity、hue uniformity、chroma uniformity 上优于 CIE LCH（Björn Ottosson 2020）。
- **规范层的采纳深度**（§13/§14）：颜色插值无显式指定时默认 Oklab；三种 CSS gamut mapping 算法全部 "aim at constant-lightness, constant-hue chroma reduction in the OkLCh color space"；Oklab 下 1 JND=0.02。
- **可访问性硬规则**（§3.1 引 WCAG 2.1 SC 1.4.1 原文）："Color is not used as the only visual means of conveying information"——颜色不得作为传达信息的唯一手段。
- **Evil Martians 实践要点**（直接核验）：chroma 在 sRGB/P3 下 "will be always below 0.37"；亮度即对比工具——原文 "All backgrounds with L≥87% have good contrast with black text."；HSL 换色相导致对比度翻车被点名为可访问性问题来源（"hue changes could lead to accessibility issues from low contrast"）；调色板 token 结构示例（原文 CSS）：`--surface-0/1/2`、`--text-primary/secondary`、`--accent`、`--danger`，暗色主题用 custom properties 整组换值；工程护栏（原文 stylelint 配置）：`function-disallowed-list: [rgba, hsla, rgb, hsl]` + `color-no-hex: null`→实际建议禁止手写 hex。
- **语义色饱和度纪律**（Refactoring UI 免费章，直接核验）：不用算法色板生成器（原文 "You can't build anything with five hex codes."）；灰阶需 **8–10 档**预定义（界面几乎一切都是灰）；每色 5–10 档，**先定 base（500，按钮可用为标准）再向两端扩展**：最暗档=最深文本、最亮档=浅色底，alert 类组件（同屏用到最深+最浅）是色板最严苛的测试场；灰阶不用纯黑（"True black tends to look pretty unnatural."）；纪律原文："If you're not diligent about limiting your palette, you might as well have no color system at all."

### 对 FAR-Lab 的可操作映射
1. **所有颜色 token 以 oklch() 书写**（含 token 文档），禁止散落 hex；文本/背景对比在 L 轴上做算术而非肉眼。
2. **语义色"同 L 档"规则**（可辨识又不喧闹的可操作定义）：状态色族（支持/反驳/未知/警告）固定同一 L 值、只变 H 与 C；文本级状态色统一 L≈0.5–0.6，底色级统一 L≈0.95+，响度天然一致。
3. **主强调色低 chroma**（仪器感）：accent C 控制在约 ≤0.15，唯一高 C 色保留给危险/关键动作（对应 ET66 黄键纪律）。
4. 深浅主题=同 H/C、L 轴翻转重算，禁止简单反色。
5. 每个语义色必须伴随文本标签或图标（WCAG 1.4.1），与产品"证据状态必须可读出"的需求同构。

---

## 6. 现代 UI craft：Josh Comeau / Refactoring UI（公开免费部分）

### 来源
| URL | 核验方式 |
|---|---|
| https://www.joshwcomeau.com/css/designing-shadows/ | 【直接】全文（页面标注 Last updated 2026-04-27） |
| https://www.joshwcomeau.com/css/pixel-perfection/ | 【直接】全文（2020-11-02 发布，2025-03-14 更新） |
| https://www.refactoringui.com/previews/building-your-color-palette | 【直接】（内容并入第 5 节） |

### 核心原则提取
- **Comeau《Designing Beautiful Shadows in CSS》**：
  - 阴影=elevation："Shadows imply elevation, and bigger shadows imply more elevation."；且 "We can use elevation as a tool to direct attention."（高度差引导注意力）。
  - 全局一致环境（原文 4 条总结）：① 每个元素被同一全局光源照亮；② 每个阴影的水平/垂直偏移用**同一比例**（演示中 "The vertical offset is always 2x the horizontal one."）；③ 元素越靠近用户：offset↑、blur↑、**不透明度↓**；④ 用物理直觉而非死记规则。
  - 分层阴影（layering）：多个小阴影叠加比单层模糊更接近真实（文中给出 5 层示例与在线工具链接）。
  - **颜色匹配阴影**：纯黑半透明阴影会把底色"洗灰"（desaturate），应匹配色相、降饱和/亮度。
  - 设计系统落地：静态 `ELEVATIONS` 对象三档 small/medium/large（文中给出具体多层数值），配合 `--shadow-color` CSS 变量随底色继承。
  - 附注：`filter: drop-shadow` 沿元素轮廓投影（tooltip 气泡含箭头整体投影）、常可硬件加速。
- **Comeau《Chasing the Pixel-Perfect Dream》**：
  - "Measurements and spacing should be exact, down to the pixel."（像素精确是理想，跨设备不可能，追求 pixel-pretty-close + 每个环境内部一致）。
  - 间距 token 化（原文）："In an ideal world, you'd never have to measure anything, because spacing would be tokenized. The designer could say 'this gap is a level-4 space', which would correspond to some number of pixels in your theme."
  - 同时保留现实警告（原文）："Design systems offer a great base upon which to build, but in my opinion, they don't completely solve the problem."（token 之外仍会有受控微调）。
  - 光学对齐（optical alignment）：数学居中不等于视觉居中，关键页面允许 1-3px 的显式微调（文中给出 ShiftBy 组件模式，用 transform 而非 margin）。
  - 论证"为什么值得"（原文）："designs tend to be pretty fragile when it comes to spacing and consistency. If you shift a few things out of place, the whole thing collapses like a house of cards."；"Good implementation helps build credibility."（对 FAR-Lab 这种信任型产品，实现精度本身就是可信度的一部分。）

### 对 FAR-Lab 的可操作映射
1. **ELEVATIONS token 三档**（卡面 small / 浮层 medium / 模态 large）：全局一个光源、固定 x:y 比、低不透明度彩色阴影（色相取自面板底色）。
2. 间距 token 命名 `space-1..N`；评审口径："报不出 token 名的间距就是 bug"。
3. elevation 只服务于注意力方向（如证据详情浮层高于列表），不作为装饰维度——防止"AI 味儿"的浮层套浮层。

---

## 理论收敛：10 条 FAR-Lab 视觉决策规则

| # | 规则 | 理论出处 |
|---|---|---|
| 1 | **Ink 审计**：任何视觉元素须通过"删除后信息是否损失"测试；渐变、发光、装饰图标默认禁入 | Tufte data-ink ratio / chartjunk（§1） |
| 2 | **反欺骗显示**：可视化中视觉差异幅度不得超过数据差异幅度；置信度展示不因装饰而放大 | Tufte "design variation vs. data variation"（§1） |
| 3 | **网格唯一**：一切间距/尺寸=4/8px 基础网格倍数；层级只由字号、字重、位置、留白四变量产生；组件匿名化 | Müller-Brockmann 网格方法论 + ITS（§2） |
| 4 | **齐左不齐右**：正文与标签左对齐 ragged-right；数字列右对齐 | Tschichold 非对称功能版式 + ITS（§2） |
| 5 | **阅读参数硬底线**：正文 15px+、行高 120–145%、阅读列 45–90 字符——密度可以高，阅读参数不妥协 | Butterick line-spacing / line-length / point-size（§4） |
| 6 | **数字排印**：所有数据列 tabular figures + 右对齐，0/1 叠加法验收；文本内数字用匹配正文的 figure 风格 | Butterick alternate-figures / monospaced-fonts（§4） |
| 7 | **强调减法**：标题层级 ≤3；强调只用粗体或颜色之一且用量最少；全大写标签必须加 5–12% 字距且不超过一行 | Butterick headings / bold-or-italic / all-caps / letterspacing（§4） |
| 8 | **单强调色 + 同 L 档语义色**：中性灰阶（8–10 档、禁纯黑）基底上，每屏唯一高亮动作色；状态色族同 L 变 H，主色 chroma ≤~0.15；颜色永不单独承载语义（必配文本/图标） | Braun/V&A ET66 功能分色 + OKLCH（CSS Color 4）+ Refactoring UI 色板 + WCAG 1.4.1（§3/§5） |
| 9 | **Small multiples + sparkline**：多假设/多证据对比用同构小格并排；行内趋势用与文字等高的无轴 sparkline | Tufte small multiples / sparkline 定义（§1） |
| 10 | **受控 elevation**：全局单光源、2–3 层低不透明度彩色阴影、三档 ELEVATIONS token；阴影只用于注意力方向；间距必须报得出 token 名 | Rams "unobtrusive / as little design as possible" + Comeau shadows / pixel-perfection（§3/§6） |

### 与被驳回的第一版的关系
第一版三案（实验室仪器/学术期刊/纸感）的问题是**隐喻层先行、无决策规则层**。本报告把"实验室仪器感"从皮肤隐喻降解为可执行要素（规则 8 的功能分色、规则 10 的克制 elevation、规则 3 的面板秩序），"学术期刊感"降解为排版参数（规则 5/6/7），并补上第一版完全缺失的验收口径（删除测试、0/1 叠加、token 命名、L 档一致性）——使美学成为可评审的工程约束，而非风格形容词。

### 未尽事项（诚实记录）
- Tufte 书内章节全文、Müller-Brockmann/Tschichold 书本文体均为官方页+维基级间接转述，未逐页核验书本原文（已逐条标注）。
- Refactoring UI 主体内容付费，本报告仅用其免费预览章。
- designishistory.com、graphéine.com 因站点 TLS/DNS 故障未引用；IxDF 的 swiss-grid 文章已跳转到博客索引页，无有效正文，未引用。
