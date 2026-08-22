# Wave-PRODUCT R5 · 线 5 深调研：中文排版权威规范 + 动效设计学

- 日期：2026-08-22（所有来源当日实际抓取；JS 渲染站点经真实浏览器核验，静态/W3C/MDN/Learn 页面经 HTTP 抓取全文）
- 调研者：Wave-PRODUCT 线 5 子 Agent
- 用途：FAR-Lab（中文为主、中英双语、大量数据表格/引用块/文献标题混排的「科学方法操作系统」）排版与动效设计依据
- 诚实约定：每条规则标注来源 URL 与文档状态；**规范原文 / 工程实践惯例 / 个人观点**三类明确区分；未能直接核验的标注 UNVERIFIED

---

# 任务 A：中文排版权威规范

## A1. W3C《中文排版需求》(clreq) —— 版本与状态

| 项 | 值（2026-08-22 实查） |
|---|---|
| 最新发布版 | **W3C Group Note Draft, 2026-08-04**，This version：`https://www.w3.org/TR/2026/DNOTE-clreq-20260804/` |
| 文档轨道 | **Note track（Group Note Draft），不是 W3C Recommendation**。官方状态原文："published by the Internationalization Working Group as a Group Note Draft… Group Note Drafts are not endorsed by W3C nor its Members." |
| 编辑 | Fuqiao XUE（薛富侨, W3C）、Richard Ishida（W3C）；中文排版任务 force（i18n 兴趣组下） |
| 地址 | 最新版 https://www.w3.org/TR/clreq/ ；编辑草稿 https://w3c.github.io/clreq/ （英）/ https://w3c.github.io/clreq/zh/ （繁中）；GitHub w3c/clreq |

**定位结论**：clreq 是行业事实权威（需求描述文档，引 GB/T 15834—2011 等国标），但法律意义上是"信息性 Group Note"，不构成强制 Web 标准。引用时应说"依据 W3C 中文排版需求（Group Note）"而非"W3C 标准"。以下引文全部出自该文档正文（英 TR + 繁中草稿互校）。

## A1.2 clreq 核心规则提取（含节号与原文）

### (1) 行首行尾禁则 —— §6.1.1
> 「为了保持阅读顺畅、体例一致，多数标点符号的位置有其限制，通常一个标点符号依其性质，禁止出现在一行之首或之末。」（中国大陆依据 GB/T 15834—2011）

clreq 定义**四级强度**，并明示推荐级别：

| 级别 | 规则 | clreq 态度 |
|---|---|---|
| none 不处理 | 完全不处理禁则 | 常见于港台报刊 |
| **basic 基本处理** | 行首禁：点号（顿、逗、句、冒、分、叹、问）、结束引号/括号/单双书名号、连接号、间隔号、分隔号；行尾禁：开始引号、开始括号、开始单双书名号 | **「这是最推荐的方法」**（原文） |
| GB 法 | basic + 分隔号不能出现在一行结尾 | — |
| strict 严格处理 | GB 法 + 破折号、省略号不能出现在一行开头 | — |

补充原文：「排版时如果进行禁则处理，应遵守**『先挤进，后推出』**原则」；且「行首行尾禁则规定属于排版风格，用户代理实现时可以根据自身实际情况，选择或者自定义适合自己的、更宽松或者严格的禁则」（即 UA 允许差异化）。

### (2) 符号分离禁则 —— §6.1.2
破折号（U+2014 ×2，占 2 汉字）与省略号（U+2026 ×2，占 2 汉字）「不得以适配分行之由断开或拆至两行」，视作一个字元。

### (3) 行尾点号悬挂 —— §6.1.3
> 「**绝多数的中文出版品没有悬挂行尾点号的惯例**。参考日文排版的做法，点号悬挂是行首标点禁则处理方式的延伸……通常，适合行尾悬挂的点号有顿号、逗号及句号三者（简体）……由于繁体中文的点号位于字面正中，若在横排时使用行尾悬挂，体例可能显得突兀、不良。故横排时，繁体中文不做行尾悬挂配置」「连续多个标点符号的情况下，不作行尾点号悬挂的配置」。

→ **FAR-Lab 结论：不做标点悬挂**（Web UI 无此惯例且浏览器不支持悬挂排版）。

### (4) 中西文混排间距 —— §4.2「中文与西文混排」（官方对"加不加空格"的说法）
> 横排：「**原则上，汉字与西文字母、数字间使用四分之一个汉字宽的字距或空白。但西文出现在行头或行尾时，则毋须加入空白。**」（英文版："Use a spacing of no more than one-quarter of the width of a Han character…"）
> 例外：「于中文点号前后、中文开始括注符号之后、结束括注符号之前的西文，不调整字距或加入空白。」
> 西文单词「在可使用连字符处之外，不得分隔为两行」。
> 纵横对齐场景：「加入大于零、小于等于二分之一汉字宽的**弹性空白**」。

**官方口径 = "1/4 汉字宽的间距"（排版引擎职责），不是"必须手打空格"**。西文空格 U+0020 宽度随字体变化，只是可用近似之一。另：clreq 明确「过去……多使用『全形 ASCII 字元』以达整齐……现今在**文本储存时，应避免使用该区段之拉丁字母及数字字元**，交由排版引擎处理比例字体、等宽字体等显示需求」——即**数据层存半角，显示层处理**。

### (5) 标点挤压 —— §6.3.2 标点符号的宽度调整
简体中文点号「位受注文字末端、字面始端（横排时位字面左下角）」、占一个汉字宽 → clreq 给出连续标点间压缩 1/2 汉字、行首行尾压缩 1/2 汉字的细则（如「简体中文排版中，当结束括注符号出现于顿号、逗号、句号之后，缩减二者间二分之一个汉字大小的空白」）。禁则处理前「应优先按照排版风格处理 6.3.2……因为标点挤压处理会影响换行位置」。
→ **Web 现状（工程实践，非 clreq 原文）**：浏览器尚无 `text-spacing`（CSS Text 4）普及支持，标点挤压在 Web UI 中**不可依赖**；UI 层应以"接受全角标点天然宽度"来设计密度，不做伪挤压。

### (6) 着重号 —— §5.3.1
> 「着重号用于表示相应文本的强调、着重语气或避免歧义。其形态为标注于文字底端或顶端（**横排多在下方〔底端〕、直排多在右侧〔顶端〕**）的圆形中黑点，可以为 U+25CF [●] 或 U+2022 [•]。」

（工程实践：CSS `text-emphasis: dot under right`，见 A2 typo.css 映射。）

### (7) 中文换行规则 —— §6.1「换行与断词连字」
汉字间可按字断行（各行行头尾对齐是中文排版重要原则）；断行受 §6.1.1 禁则与 §6.1.2 分离禁则约束；西文单词按连字符规则、不得在行内任意断开。

### (8) 中西混排时的标点选择
> 「中西混排中，由于正文是中文，**原则上应该使用中文标点**，遵守中文标点的习惯用法。但是，科学技术中文图书，如果涉及公式较多，句号可以统一使用西文句号 U+002E [.]，省略号使用英文的三点省略号。」
> 间隔号用 U+00B7（不用日文 U+30FB）；科技文献中句号可用 U+FF0E [．] 替代 U+3002 以避免与 o/0 混淆。

## A1.3 对 FAR-Lab Web UI 的规则筛选（非长文排版）

FAR-Lab 界面 = 短行、表格单元格、卡片标题、引用块，而非书页长文。据此分级：

| clreq 规则 | FAR-Lab 适用性 | 落地方式 |
|---|---|---|
| 中西文 1/4 间距（§4.2） | **高**（文献标题、引用块中英密集混排） | 见 A3/A4 渲染层方案 |
| 数据存半角、不用全角 ASCII（§4.2） | **高**（数据层规范） | 数据入库即半角；显示层决定比例/等宽 |
| 全角中文标点为原则（§4.2） | **高**（产品文案） | 中文句内用全角句读；嵌完整英文句用半角 |
| 行首行尾禁则 basic 级（§6.1.1） | 中（引用块/长标题多行换行时） | CSS `line-break: strict`（实践惯例，见 A2） |
| 破折号/省略号不拆行（§6.1.2） | 中 | `line-break: strict` 同步覆盖 |
| 着重号（§5.3.1） | 低-中（若做术语强调） | `text-emphasis: under right` |
| 标点挤压（§6.3.2） | **不可用**（浏览器无实现） | 接受全角标点宽度，表格列宽预留 |
| 标点悬挂（§6.1.3） | **不适用**（无惯例+无支持） | 不做 |
| 纵横对齐/直排（§4.2/§5） | 不适用 | — |

## A2. sofish/typo.css 与《中文文案排版指北》同 clreq 的关系

**sofish/typo.css**（中文网页重设与排版 CSS；MIT License；作者 sofish）——其 `docs/modern-chinese-typography.md`（设计依据文档，2026-08-22 抓取）**逐条把 clreq 映射为 CSS**，是 clreq 的工程化实现（渐进增强）：

| clreq 规则 | typo.css 实现（原文摘录） |
|---|---|
| 中西文间距 | 「CLReq calls for measurable spacing between Han and Western text. CSS Text Level 4 exposes that as `text-autospace`; `.typo` enables `ideograph-alpha` and `ideograph-numeric` where supported.」 |
| 标点挤压 | 「CSS Text Level 4 exposes CJK punctuation trimming with `text-spacing-trim`. `.typo` opts into `normal`.」 |
| 禁则 | 「CSS Text Level 4 defines `line-break` strictness for CJK line wrapping. `.typo` uses `line-break: strict`.」 |
| 着重号 | 「CSS Text Decoration Level 3 supports native emphasis marks and says Chinese horizontal emphasis prefers `under right`. `.typo-em` uses native `text-emphasis` where available.」 |
| 行长/行高 | 「CLReq defines body text line length…not exceeding 48 characters. `.typo-readable` caps content at 48em」「`.typo` uses `line-height: 1.75`」 |
| 字体栈 | 简体 sans 栈：`"PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Hiragino Sans GB", "WenQuanYi Micro Hei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |

**sparanoid/chinese-copywriting-guidelines《中文文案排版指北》**（MIT）——是**写作/文案层**的社区风格规范（非排版引擎规范）：要求「中英文之间需要增加空格」「中文与数字之间需要增加空格」「数字使用半角字符」「使用全角中文标点」「遇到完整的英文整句……其内容使用半角标点」「全角标点与其他字符之间不加空格」「不重复使用标点符号」。它自己说明理由：「CSS Text Module Level 4 的 `text-spacing`……目前并未普及……所以请继续保持随手加空格的习惯」。

**三者关系（结论）**：
- clreq = 权威需求（1/4 汉字宽**字距**，排版引擎职责）；
- 指北 = 写作层近似（手打 U+0020 空格 ≈ 1/4 汉字宽的可用人肉实现，比 clreq 更"硬"）；
- typo.css = 渲染层实现（有 `text-autospace` 就引擎处理，没有则靠源文本空格/默认）。
- **FAR-Lab 策略**：产品自有文案遵循指北（写作时加空格）；文献标题/外部引用（不可控文本）在**渲染层**处理（`text-autospace` 渐进增强 + 友好回退），数据层永远存原文半角。

## A3. 数字与中文混排

### tabular-nums（等宽数字）
- MDN《font-variant-numeric》（Baseline widely available）：**「tabular-nums activating the set of figures where numbers are all of the same size, allowing them to be easily aligned like in tables. It corresponds to the OpenType values tnum.」**
- **Ant Design 官方规范明文推荐**（ant.design/docs/spec/font-cn，2026-08-22 抓取正文）：「在中后台系统中，数字经常需要进行纵向对比展示，我们推荐将数字的字体 `font-variant-numeric` 设置为 `tabular-nums`，使其为等宽字体。」
- → FAR-Lab 落地：数据表格数字列（证据强度分值、文献年份、假设编号 H-01、时间戳、实验参数）一律 `font-variant-numeric: tabular-nums`；这正是"中后台系统"官方同款场景。

### 全角/半角标点选择规则（FAR-Lab 中英环境）
| 场景 | 正确选择 | 依据 |
|---|---|---|
| 中文句内句读（。，；：？！） | 全角中文标点 | clreq §4.2「原则上应该使用中文标点」；指北「使用全角中文标点」 |
| 中文内嵌单个西文词/缩写（如 使用 DTP 技术） | 词两侧加空格（或渲染层 1/4 字距），标点仍全角 | clreq §4.2；指北 |
| 完整英文句子/英文文献标题 | 句内半角标点，外层中文句读全角 | 指北「遇到完整的英文整句……使用半角标点」 |
| 括号（中文语境） | 全角（）；纯英文片段内部半角 () | clreq 括注符号规则；指北 |
| 冒号（中文语境） | 全角：；时间/比例 10:30 等半角 | GB/T 15834 精神 + clreq §3（数字/单位符号西文化） |
| 引号（简体横排） | 弯引号 " " ' '（直排才用直角引号） | clreq「简体中文排版……横排使用弯引号，直排使用直角引号」 |
| 数字 | 一律半角阿拉伯数字 | clreq「避免全形 ASCII」；指北「数字使用半角字符」 |
| 破折号/省略号 | —— 与 ……（各占 2 汉字、不拆行） | clreq §6.1.2 |
| 间隔号（外国人名） | U+00B7 · | clreq §3 间隔号 |

## A4. 三平台中文字体回退链与 -apple-system

**平台现状（公开资料核验）**：
- **Windows**：界面默认中文字体 **Microsoft YaHei 微软雅黑**（UI 场景另有 Microsoft YaHei UI 变体，不占额外行高——工程常识，来源为字体栈实践）。
- **macOS / iOS**：简体系统字体 **PingFang SC（苹方）**。Apple 官方字体页（developer.apple.com/fonts/system-fonts/，2026-08-22 抓取）在 macOS/iOS 字体清单中列出 PingFang SC / PingFang HK（Light/Regular/Medium/Semibold 各字重）。
- **Linux**：无统一预装中文字体，发行版常见 **Noto Sans CJK SC / Source Han Sans SC / WenQuanYi Micro Hei**（typo.css 栈即按此排列）。

**-apple-system / system-ui 在中文环境的实际表现**：
- MDN《font-family》对 `system-ui` 的定义与**官方警告原文**：「system-ui is intended to make UI elements look like native apps, **and not for typesetting large paragraphs of text**… **the default Windows CJK font may render Latin scripts poorly, and the lang attribute may not affect the displayed font.** For large paragraphs, use sans-serif or some other non-UI font family instead.」
- `-apple-system` 是 system-ui 的历史前缀别名；在中文环境，拉丁字形走 San Francisco，汉字由系统回退自动落到 **PingFang SC**（Mac）——汉字部分不取决于 `-apple-system` 本身，而取决于平台回退（Android/Windows 上行为各异，这正是 MDN 警告点）。
- **FAR-Lab 策略**（两段式，均来自上述来源背书）：
  1. 界面 chrome（按钮/标签/表头）：Ant Design 同款系统栈 `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif`（AntD v5 现行栈 + 显式中文字体保底）；
  2. 阅读长文区（文献标题、引用块、研究计划正文）：显式 CJK 优先栈（typo.css 栈），避免 MDN 指出的 system-ui 大段落问题。

## A5. 中文 UI 字号下限 —— 13.5px 基准评估

| 来源 | 规定 | 状态 |
|---|---|---|
| **Ant Design v5**（ant.design/docs/spec/font-cn，正文抓取） | 「主字体……从原先的 12 上升至 **14**」；行高 22；「字阶的选择尽量控制在 3-5 种之间，保持克制的原则」；字重只用 400/500（英文加粗 600）；正文对比度 7:1（AAA） | 已核验 |
| **TDesign（腾讯）**（tdesign.tencent.com/design/fonts） | 「桌面端中，Body 字号我们设置为 **14px**，Base 取 **12px**，**桌面端的最小字号是 12px**，而 10px 则作为移动端的 Base 字号」 | **UNVERIFIED-direct**（页面 JS 渲染未能直抓正文，引文来自该官方页面的搜索快照；数值与 AntD 互相印证） |
| **WCAG 2.2 SC 1.4.4 Resize Text**（w3.org/WAI/WCAG22/Understanding/resize-text.html） | 原文：「Except for captions and images of text, text can be resized without assistive technology **up to 200 percent without loss of content or functionality**.」——**不设 px 下限，要求可无损放大 200%** | 已核验 |
| WCAG 2.2 SC 1.4.12 Text Spacing | 用户可覆盖行高/段距/字距/词距而不破坏内容（typo.css 设计依据引用） | 已核验 |
| 蒙纳（Monotype）中文长文建议 | 正文最小 10pt、舒适 14pt（厂商观点文章，标注：**观点**，非规范） | 检索快照 |

**结论（综合两大家设计体系 + WCAG）**：
- 中文桌面 UI **公认可读下限 = 12px**（TDesign 明文"桌面端最小 12px"；AntD 字阶最小档同为 12，且以 12 为历史默认）；
- **正文舒适值 = 14px**（AntD v5、TDesign 一致，AntD 给出 50cm 阅读距离/0.3° 视角的依据）；
- FAR-Lab 当前基准 **13.5px 处于 [12, 14] 区间内**：高于下限、略低于正文推荐值，适合"密集数据工具"定位——**建议**：正文/段落类文字用 14px；表格、元数据、引用信息用 13.5px；最小辅助信息（时间戳、编号）可到 12px 但**不得再低**，并保证 200% 缩放不塌（WCAG 1.4.4）。
- 说明：未检索到腾讯 ISUX 关于中文最小字号的直接公开规范文章（如实陈述；TDesign 为腾讯官方设计体系，已可代表其口径）。

---

# 任务 B：动效设计学

## B1. Material Design 3 —— tokens 与原则（m3.material.io，2026-08-22 浏览器实抓）

**前提（诚实声明，页面原文）**：「In the expressive update, components and motion now use the motion physics system, which uses springs. Products should migrate to the new system. The easing and duration system is still used for transitions and can be used by teams that haven't yet updated to GM3 Expressive, **but is no longer maintained**.」——即 easing/duration token 体系仍是官方发布物、可用于过渡动效，但 Material 的最新方向是弹簧物理。

### Duration tokens（页面渲染核验值）
| Token | ms | Token | ms | Token | ms | Token | ms |
|---|---|---|---|---|---|---|---|
| short1 | 50 | medium1 | 250 | long1 | 450 | extra-long1 | 700 |
| short2 | 100 | medium2 | 300 | long2 | 500 | extra-long2 | 800 |
| short3 | 150 | medium3 | 350 | long3 | 550 | extra-long3 | 900 |
| short4 | 200 | medium4 | 400 | long4 | 600 | extra-long4 | 1000 |

### Easing tokens（语义分类 + CSS 值，页面核验）
| Token | CSS cubic-bezier | 语义 |
|---|---|---|
| md.sys.motion.easing.**standard** | `cubic-bezier(0.2, 0, 0, 1)` | 小型、功能性过渡的默认 |
| standard.decelerate | `cubic-bezier(0, 0, 0, 1)` | 进入（快出慢停） |
| standard.accelerate | `cubic-bezier(0.3, 0, 1, 1)` | 退出（慢起快走） |
| md.sys.motion.easing.**emphasized** | CSS 栏标注 "N/A (**Use Standard as a fallback**)"（曲线即 standard） | 大型/表现性过渡 |
| emphasized.decelerate | `cubic-bezier(0.05, 0.7, 0.1, 1)` | 进入（强减速） |
| emphasized.accelerate | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 退出（强加速） |

**对 FAR-Lab 最重要的一句（页面原文）**：「The Standard easing set can be used for small utility focused transitions that need to be quick. **The Standard set is also a fallback for platforms that don't support Emphasized easing, like iOS and Web.**」→ **FAR-Lab 是 Web：动效一律用 Standard set。**

### "服务理解"的原则原文（Applying easing and duration 页）
- 「Transitions shouldn't be jarringly fast or so slow that users feel as though they're waiting.」
- **Transition size**：「Transitions that cover small areas of the screen have short durations. Those that traverse large areas have long durations.」（示例：单选按钮小面积 200ms；专辑占满全屏大面积 500ms）
- **Enter vs. exit**：「Transitions that exit, dismiss, or collapse an element use shorter durations. Exit transitions are faster because they require less attention than the user's next task. Transitions that enter or remain persistent on the screen use longer durations.」（示例：进入 500ms / 退出 200ms）
- 示例原文：「A Card expanding to full screen uses a long **500ms** duration with Emphasized easing」。

### 官方推荐 easing+duration 配对表（页面核验）
| Easing | Duration | Transition type |
|---|---|---|
| Emphasized | 500ms | Begin and end on screen |
| Emphasized decelerate | 400ms | Enter the screen |
| Emphasized accelerate | 200ms | Exit the screen |
| **Standard** | **300ms** | **Begin and end on screen** |
| **Standard decelerate** | **250ms** | **Enter the screen** |
| **Standard accelerate** | **200ms** | **Exit the screen** |

（加粗行即 FAR-Lab/Web 采用的三元组。）

## B2. Apple HIG —— Motion（developer.apple.com/design/human-interface-guidelines/motion，页面在线；Change log 更新至 2025-09-09 Liquid Glass）

合法动效的定位（页首原文）：「Beautiful, fluid motions bring the interface to life, **conveying status, providing feedback and instruction**…」（状态传达/反馈/指引）。**注**：现行 HIG 把"直接操纵"归入 Gestures 页（"A gesture is a physical motion that a person uses to directly affect an object"），Motion 页聚焦反馈与舒适性——如实说明，避免误引旧版结构。

**原文摘录（Best practices / Providing feedback）**：
- 「**Add motion purposefully, supporting the experience without overshadowing it. Don't add motion for the sake of adding motion.** Gratuitous or excessive animation can distract people and may make them feel disconnected or **physically uncomfortable**.」←"避免为动而动"的权威原文
- 「**Make motion optional.** …avoid using it as the only way to communicate important information.」
- 「**Aim for brevity and precision in feedback animations.** When animated feedback is brief and precise, it tends to feel lightweight and unobtrusive…」
- 「**In apps, generally avoid adding motion to UI interactions that occur frequently.**」
- 「**Let people cancel motion.** As much as possible, don't make people wait for an animation to complete before they can do anything…」
- visionOS 前庭细则（对 Web 同样有指导意义）：「Consider using fades when you need to relocate an object… If such movement doesn't communicate anything useful, you can **fade the object out before moving it**」「avoid displaying motion at the edges of a person's field of view」「avoid showing objects that oscillate in a sustained way… around 0.2 Hz」。

## B3. Fluent / Windows —— Motion（learn.microsoft.com，页面 ms.date 2024-07-24、updated 2026-07-14）

**定位原文**：「Motion in Windows is reactive, direct, and context appropriate. It provides feedback to user input and reinforces spatial paradigms that support way-finding.」

**五原则**：Connected（元素跨状态视觉连续）/ Consistent（同入口的面调用与消失方式一致）/ Responsive / Delightful（"always brief and fleeting"）/**Resourceful ——「Avoid custom animations where possible. Use animation resources like WinUI 3 controls for page transitions, in-page focus, and micro interactions.」**

**Timing 表（页面核验）**：Direct Entrance `cubic-bezier(0,0,0,1)` 167/250/333ms；Existing Elements `cubic-bezier(0.55,0.55,0,1)` 167/250/333ms；Direct Exit 167ms（**ALWAYS combine with fade out**）；**Bare Minimum：Fade In+Out，Linear，83ms，Opacity**；Strong Entrance（弹性三段 167+167+333ms）。

**Connected animation 使用条件**：
- 设计页（design/signature-experiences/motion）：「**Connected Animation: Layer-to-layer transitions within the same page.** Use connected animations to highlight specific pieces of information within a page or surface, **while retaining context**.」；Page Transition = 页到页。
- 开发页（develop/motion/connected-animation，ms.date 2026-07-08）：「an element appears to "continue" between two views… **This helps the user maintain their context**」「You should consider using a connected animation … **whenever there is an image or other piece of UI shared between the source and destination views**」；前进导航用 Gravity 配置，后退用 Direct（**150ms、decelerate easing**——"returns the user to their previous state as fast as possible"）；「you shouldn't wait more than **~250 milliseconds** in between the two steps because the presence of the source element may become distracting」；Recommendations：共享元素页面过渡用之、不要在 prepare 与 start 之间等待网络请求、与默认导航转场互斥（SuppressNavigationTransitionInfo）。

## B4. prefers-reduced-motion —— 规范原文与实现惯例

- **W3C Media Queries Level 5 §12.1**（状态：**W3C Working Draft, 2026-02-19**——尚未成 Rec，如实标注）：「The prefers-reduced-motion media feature is used to detect if the user has requested the system minimize the amount of **non-essential motion** it uses.」值：`no-preference`（评估为假）/ `reduce`（评估为真）。
- **MDN**（Baseline widely available，2020-01 起）：动机会触发前庭不适——「Animations such as **scaling or panning large objects** can be vestibular motion triggers」；实现惯例 = 默认写全动效，再在同特异性、靠后的源顺序用 `@media (prefers-reduced-motion: reduce)` 覆盖，**用 opacity 型动效替代 scale/pan 型**；OS 开关：Windows 11 设置>辅助功能>视觉效果>动画效果；macOS 辅助功能>显示>减少动态（macOS 25+ 移至 运动）；iOS 设置>辅助功能>动态效果；Android 9+ 移除动画；GNOME/KDE 均有对应项。

## B5. 反例清单（公开批评来源）

| 反模式 | 批评来源与原文要点 | 类型 |
|---|---|---|
| 无意义装饰动画（如常驻 squiggle） | NN/g《The Role of Animation and Motion in UX》：实例点名 Outline 页面 moving squiggle「adds no benefit, but needlessly draws the attention of the user away from the content」 | 研究机构 |
| 注意力劫持式动画 | 同上文：「using animation to hijack the users' attention or create a fear of loss is a **dark pattern**」 | 研究机构 |
| 动效滥用的一般原理 | 同上文：「Animation in UX must be **unobtrusive, brief, and subtle**. Use it for feedback, state-change and navigation metaphors, and to enhance signifiers」；人眼杆状细胞对运动天然敏感→「we are sensitive and prone to be distracted by any type of motion (meaningful or not)」 | 研究机构 |
| 视差滚动 | NN/g《What Parallax Lacks》：视差常带来加载慢、可读性差等可用性问题 | 研究机构 |
| 前庭伤害（视差/大位移/旋转） | A List Apart《Accessibility for Vestibular Disorders》（前庭障碍第一人称经典文）；MDN/Apple HIG 同向（见 B2/B4） | 实务+规范 |
| 自动触发/多数 UI 动画本身 | Trevor Calabro《Most UI Animations Shouldn't Exist》：auto-triggered motion 增加认知负荷与可访问性障碍 | **观点文**（标注） |
| 为动而动 | Apple HIG 原文（B2「Don't add motion for the sake of adding motion…physically uncomfortable」） | 平台规范 |
| 自转轮播/加载装饰 | NN/g 动效总则（brief/unobtrusive）+ HIG「avoid adding motion to UI interactions that occur frequently」间接覆盖；未见单篇官方专文，标注为**惯例归纳** | 惯例 |

## B6. FAR-Lab 动效白名单（只允许以下动效）

> 总原则（出处见 B1-B5）：Web 用 M3 **Standard set**；进入用 decelerate、退出用 accelerate、面内转移用 standard；高频交互克制（HIG）；一切动效可被 prefers-reduced-motion 降级（MQ5/MDN）；大位移改 fade（HIG visionOS 条款 + MDN 前庭）。

| # | 允许的动效 | FAR-Lab 场景映射 | 规范依据 | 建议 duration / easing（M3 token） | reduced-motion 降级 |
|---|---|---|---|---|---|
| 1 | 状态反馈（hover/press/选中变色） | 表格行 hover、按钮按下、tag 选中 | HIG「brevity and precision in feedback」；M3 小面积短时长 | 100–150ms（short2–short3），standard；仅颜色/描边，**无位移** | 无需降级（非运动动效，纯颜色过渡） |
| 2 | 焦点/选中指示移动（tab、视图切换高亮） | 主导航 tab、假设/证据视图切换 | Fluent Consistent 原则；M3 "Begin and end on screen" | 200–300ms（short4/medium1），standard | 改为瞬时跳转（无滑动） |
| 3 | 展开折叠高度过渡 | 研究计划节点展开、证据分组、表格行详情 | M3 card expanding（enter 长于 exit）；M3 enter/exit 原则 | 进入 250ms standard-decelerate；收起 150–200ms standard-accelerate；height+opacity 联动 | 瞬时展开/收起（无动画） |
| 4 | 共享元素延续（connected/focus 转移） | 文献列表条目 → 文献详情（同元素延续）；列表 → 详情页 | Fluent connected animation 条件：**同页面层间 + 共享元素 + 保持上下文**，启动间隔 ≤250ms；后退更快（150ms decelerate 精神） | 250–300ms（medium1），standard；后退 150–200ms | 降级为 83ms 纯 fade（Fluent Bare Minimum）或直接切换 |
| 5 | 加载骨架（不确定进度的持续指示） | 文献检索、证据表异步加载 | NN/g 反馈类动效合法；MDN：opacity 型非前庭触发 | opacity 脉冲 1–1.5s 循环，低对比度（约 1.5:1 差异），linear | 停止脉冲，显示静态占位底色 |
| 6 | 新内容/状态徽章淡入 | 实验状态变化、新证据到达 toast | M3 enter；Fluent Bare Minimum fade | 淡入 150–250ms standard-decelerate；退出 200ms standard-accelerate | 直接出现/消失 |
| 7 | 数字/文本内容更新 | 指标数值刷新、状态字段变更 | Fluent Bare Minimum（83ms fade） | ≤100ms opacity fade，linear | 保留（opacity 非前庭触发，MDN 认可） |

**绝对禁止（FAR-Lab 黑名单，出处标注）**：
1. 视差滚动（NN/g What Parallax Lacks；前庭风险）；
2. 入场串场/整页编排动画（NN/g gratuitous；HIG "for the sake of adding motion"）；
3. 自动播放的装饰性动效、无限循环非加载指示动画（NN/g 注意力劫持=dark pattern 原则）；
4. 大位移/缩放/旋转转场（MDN 前庭触发原文；HIG 大物体位移应 fade）；
5. 阻塞式动画（动效播完才可操作）（HIG「Let people cancel motion」原文）；
6. 高频交互上的额外动效（HIG「avoid adding motion to UI interactions that occur frequently」原文）；
7. 假进度/装饰 spinner（NN/g 总则"unobtrusive, brief, subtle"推论——惯例归纳）。

**CSS token 落地示例（实践建议，非规范原文）**：
```css
:root {
  --dur-1: 100ms;  --dur-2: 150ms;  --dur-3: 200ms;  --dur-4: 250ms;  --dur-5: 300ms;
  --ease-standard:   cubic-bezier(0.2, 0, 0, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0, 1);     /* 进入 */
  --ease-accelerate: cubic-bezier(0.3, 0, 1, 1);   /* 退出 */
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
（覆盖式写法遵循 MDN 惯例：默认全动效，reduce 块同特异性靠后取胜。）

---

# 来源清单（全部 2026-08-22 访问核验）

| # | 来源 | URL | 状态/性质 |
|---|---|---|---|
| 1 | W3C clreq《中文排版需求》 | https://www.w3.org/TR/clreq/ （本轮 DNOTE-clreq-20260804） | **W3C Group Note Draft**（Note track，非 Recommendation）；编辑草稿 https://w3c.github.io/clreq/zh/ |
| 2 | GB/T 15834—2011《标点符号用法》 | 经 clreq §6.1.1 转引 | 中国国家标准（clreq 内引用） |
| 3 | sofish/typo.css + 设计依据 | https://github.com/sofish/typo.css ；docs/modern-chinese-typography.md | MIT 仓库；其文档逐条映射 clreq→CSS |
| 4 | 中文文案排版指北 | https://github.com/sparanoid/chinese-copywriting-guidelines | MIT 仓库；社区写作层风格规范 |
| 5 | MDN font-variant-numeric | https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric | MDN（Baseline widely available） |
| 6 | Ant Design 字体规范 | https://ant.design/docs/spec/font-cn | 蚂蚁官方设计体系（正文已抓取） |
| 7 | TDesign 字体 | https://tdesign.tencent.com/design/fonts | 腾讯官方设计体系（正文 UNVERIFIED-direct，引官方页搜索快照） |
| 8 | WCAG 2.2 SC 1.4.4 | https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html | W3C WAI 正式指南（已抓原文） |
| 9 | Apple 系统字体清单 | https://developer.apple.com/fonts/system-fonts/ | Apple 官方（PingFang SC/HK 在列） |
| 10 | MDN font-family（system-ui 警告） | https://developer.mozilla.org/en-US/docs/Web/CSS/font-family | MDN |
| 11 | Material 3 Easing & duration（Tokens / Applying） | https://m3.material.io/styles/motion/easing-and-duration/tokens-specs 及 /applying-easing-and-duration | Google 官方（浏览器实抓；注明 easing/duration 体系"no longer maintained"、新方向 spring） |
| 12 | Apple HIG — Motion | https://developer.apple.com/design/human-interface-guidelines/motion | Apple 官方（change log 至 2025-09-09；Gestures 页另述直接操纵） |
| 13 | Motion in Windows | https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/motion | Microsoft Learn（ms.date 2024-07-24，updated 2026-07-14） |
| 14 | Connected animation | https://learn.microsoft.com/en-us/windows/apps/develop/motion/connected-animation | Microsoft Learn（ms.date 2026-07-08） |
| 15 | Media Queries Level 5 §12.1 | https://www.w3.org/TR/mediaqueries-5/ | **W3C Working Draft 2026-02-19**（未成 Rec） |
| 16 | MDN prefers-reduced-motion | https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion | MDN（Baseline） |
| 17 | NN/g Animation Purpose | https://www.nngroup.com/articles/animation-purpose-ux/ | NN/g 研究文章（正文已抓取） |
| 18 | NN/g What Parallax Lacks | https://www.nngroup.com/articles/parallax-usability/ | NN/g 文章 |
| 19 | A List Apart Vestibular | https://alistapart.com/article/accessibility-for-vestibular/ | 实务经典文（前庭障碍） |
| 20 | Most UI Animations Shouldn't Exist | https://trevorcalabro.substack.com/p/most-ui-animations-shouldnt-exist | **个人观点文**（已标注） |

## 诚实声明
- 规范原文（clreq/HIG/Material/Fluent/MQ5/WCAG/MDN/AntD）与社区实践（typo.css/指北）与个人观点（Calabro、蒙纳）在文中分别标注。
- clreq 是 Group Note（非 W3C 正式标准）、MQ5 是 Working Draft、M3 easing/duration 体系官方声明不再维护但仍发布——三处易被误引为"硬标准"，已如实注明。
- TDesign 引文未能直抓页面正文（JS 渲染），标注 UNVERIFIED-direct，但其数值与 AntD 一致可互证。
- 未找到 ISUX 关于中文最小字号的直接公开文章（如实陈述）。
