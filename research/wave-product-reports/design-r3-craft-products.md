# 设计卓越产品视觉解剖（Wave-PRODUCT R3 · 线 3）

- 核验日期：2026-08-22（全部案例当日访问核验）
- 方法：直接抓取官方设计系统页 / 品牌页 / 官方博客 / 官方开源仓库（WebFetch / webReader / raw.githubusercontent）。只述公开可见与官方披露；文本化抓取不可见的视觉细节（具体渲染效果、CSS 值）一律标注"未核验"而非推测。
- 诚实例注：Linear / Stripe 营销页 / Things 3 / Raycast 均无公开 token 文档，其段落只引用可核验的公开事实。第三方逆向值（博客扒 CSS 等）一律不采用。
- 用途：为 FAR-Lab（科学方法操作系统）Web 端美学方案提供可迁移的视觉决策与 token 级细节。所有"可抄"指结构与决策，非逐像素复制。

---

## 1. Linear — 克制本身作为身份

**URL**：https://linear.app/brand 、https://linear.app/method/introduction 、https://linear.app/quality 、https://linear.app（首页结构）

**对抗通用感的核心手法**：把品牌暴露为一套"工程规格书"——品牌页只公开两个色值和一个定性描述，首页章节用 1.0–5.0 / 2.1 式编号、配图标注 "FIG 0.2"。设计权威来自规格书式的编号纪律与真实产品截图，而非插画与渐变堆叠。

**解剖（公开证据）**：
- 品牌页公开的仅有的色彩事实：**Mercury White #F4F5F8**（RGB 244,245,248）、**Nordic Gray #222326**（RGB 34,35,38），主品牌色仅描述为 "a subtle desaturated blue"，**未公开 hex**。
- 资产原则原话："Make them big or make them small, but give them room to breathe"；品牌色要求 "comfortable against light and dark backgrounds"。
- Method 引言立场："There is a lost art of building true quality software"；"Productivity software needs to be designed for purpose"（反对过度可配置）；"Don't invent terms if possible"；"Aim for brevity"。
- Quality 页只给出两条可引用定义："What is quality? ... hard to describe and even harder to measure, but you can feel it when it's there." / "You know it when you experience it."
- 首页结构（2026-08 版）：编辑式编号系统（Intake/Plan/Build/Diffs/Monitor = 1.0–5.0），内嵌**真实运行态产品界面**（Slack 消息原文、agent "Thinking..." 状态、状态 pill "In Progress / At risk / On track"），并把一段真实 React/TS 代码 diff 作为视觉主角。

**可抄细节**：
1. 色彩预算：品牌层只有 2 个中性锚点色 + 1 个"去饱和蓝"叙事位；不给品牌色高饱和 hex 的做法本身就是纪律——彩色只属于产品语义（状态/标签），不属于 chrome。
2. 章节编号系统（1.0 / 2.1 / FIG 0.2）+ "规格书语感"：给专业工具页面一种"被撰写"而非"被生成"的权威感。FAR-Lab 的工作流步骤（scope→hypotheses→plan）天然适配这种编号。
3. 真实内容当视觉主角：用真实研究计划的截图/diff（假设修订历史、证据链）替代装饰性插画。

**何时不该学 / 诚实限制**：
- Linear **未公开**字体 token、动效规范、界面色阶（所谓 Inter 用法、发光参数均无官方文档；第三方逆向值不采信）。任务原问"Inter 如何被用得不廉价"无法从官方来源回答——标记 UNVERIFIED。
- 规格书式编号对频繁改版的营销页维护成本高，适合产品文档/工作流页，不适合落地页。

---

## 2. Stripe — 色彩作为感知科学

**URL**：https://stripe.com/blog/accessible-color-systems （官方博客，2026-08-22 核验可访问）；https://docs.stripe.com （现文档域，stripe.com/docs 301 至此）

**对抗通用感的核心手法**：把配色做成**等对比度等级系统**——同一 level 上每个色相对白底携带相同对比度，颜色选择由可验证的数学性质决定，而不是"挑一组好看的颜色"。通用 AI 感配色（随机 pastel / 均匀 HSL 分档）在这里结构上就不可能发生。

**解剖（官方披露）**：
- 拒绝两条常见路径：手工挑色逐个校验（"too dependent on trial and error"）；从基色机械生成 tint/shade（"produced dull or muted colors, which can be difficult to distinguish from each other"）——直接点名 AI/模板配色最爱用的"基色生成梯度"是低质来源。
- 拒绝 HSL："the way HSL calculates lightness is flawed"（数学等亮的黄和蓝看起来不等亮）。采用 **CIELAB** 感知均匀空间，把每个色相的感知亮度调到"same curve"，结果 "yellow has the same contrast range as blue, but they still look like our colors"。
- 等级规则（内部产出）：小文本配对至少 **5 级差**、图标与大文本至少 **4 级差**；同 level 全部色相同对比度；验证场景为白底 + 该色相最浅 tint 底两套。
- 三条设计目标：可预测的无障碍达标、色相可辨、视觉重量一致（no single color visually dominates）。
- 应用示例：Badge 组件文本与背景整体上移一级，避免逐对微调。

**docs.stripe.com 可核验事实**：全站任意页加 `.md` 后缀可输出纯 Markdown（本轮实测首页/文档页均可用）；首页信息架构按**任务用例**（Accept payments online / Set up the customer portal…）而非产品名组织。代码块视觉样式（语言 Tab、高亮主题）在文本化抓取中不可见——**未核验，不描述**。

**可抄细节**：
1. 等级制 palette 结构：`hue × level` 矩阵，level 的定义是对比度常量；配对规则写成硬约束（≥5 级/≥4 级）。FAR-Lab 的证据类型色（supporting/counter/uncertain）可直接套此结构，保证任何搭配可读。
2. 用 Lab（或 OKLCH）而非 HSL 生成色阶；拒绝机械 tint/shade。
3. 文档站提供 `.md` 端点（内容即 API）；任务导向 IA。

**何时不该学**：营销页著名的斜切渐变**无任何官方规范文档**，具体参数不作引用；等对比度系统需要自建可视化工具链，小团队起步可先只做"等级差校验"这一条。

---

## 3. Vercel / Geist — 黑白优先的层级来自结构与字轨

**URL**：https://vercel.com/geist/introduction 、/geist/colors 、/geist/typography 、/geist/materials 、/geist/grid（各页均可用 `.md` 后缀，实测）

**对抗通用感的核心手法**：层级几乎不用色彩表达——色彩刻度的每一档被**语义占位**（400=默认边框），背景只有两档，阴影只用序数；层级靠字号双轨（Label vs Copy）、网格线可见、mono/sans 配对规则撑起来。把"基础设施审美"（网格、trailing slash）当作品牌资产。

**解剖（官方 token 结构）**：
- 色彩：10 个刻度（backgrounds, gray, gray-alpha, blue, red, amber, green, teal, purple, pink），非背景刻度各 10 档 **100–1000**，命名 `--ds-{scale}-{step}`，**同一步数跨刻度同用途**：
  - 100=默认背景 / 200=hover 背景 / 300=active 背景 / 400=默认边框 / 500=hover 边框 / 600=active 边框 / 700=高对比背景 / 800=hover 高对比背景 / 900=次级文本 / 1000=主文本。
- backgrounds 刻度仅 2 档：`--ds-background-100`（默认）与 `--ds-background-200`（"a subtle background differentiation"，官方明言应 sparingly 使用）；叠色场景强制用 Background 1。
- 排版（Tailwind 类捆绑 font-size + line-height + letter-spacing + font-weight，数值规格在 Geist Core Figma，页面不公开数字）：
  - 阶梯：Heading 72/64/56/48/40/32/24/20/16/14；Button 16/14/12；Label 20–12；Copy 24–13。
  - **Label 与 Copy 双轨**：Label 为单行设计（配图标、可高亮），Copy 行高更高用于多行阅读——同为 14px 却是两个 token。
  - mono 配对规则：`label-14-mono` 是"最大 mono，配 >14 的文本"；`label-13-mono` 配 Label 14；`copy-13-mono` 用于行内代码。数字场景用 **tabular figures** 保证等宽。
  - 字重不设独立类：Subtle/Strong 由嵌套 `<strong>` 实现。
- materials：圆角仅 3 档——6px（base/small/tooltip）、12px（medium/large/menu/modal）、16px（fullscreen）；阴影为序数双轴：surface（base→small→medium→large，贴页）与 floating（tooltip→menu→modal→fullscreen，浮层），**不公开具体阴影数值**；tooltip 是唯一带三角茎的浮层。
- grid：官方称网格线是 "a core part of the Vercel aesthetic"——单元格边框可见，美学建立在结构线的诚实暴露上。

**可抄细节**：
1. 10 档语义刻度 + "400=边框"式全刻度同位映射（FAR-Lab 中性色可直接采用此结构，另加一档 hover 语义）。
2. 背景 2 档纪律；Label/Copy 双字号轨；mono 比 sans 小 1px 的配对规则。
3. 阴影用序数（elevation-1/2/3）而非散落的 box-shadow 值；圆角收敛到 3 档。

**何时不该学**：纯黑白+冷灰对内容情感化、需要说服力的场景（评审报告、对外展示）过于冷淡——FAR-Lab 可在数据密集视图用 Geist 式纪律、在叙事视图放宽；具体 hex 官方不公开，只可抄结构。

---

## 4. GitHub Primer — 语义角色先于色名

**URL**：https://primer.style/foundations （入口）、https://primer.style/foundations/color 与 /product/primitives/color（token 明细；MIT 许可，官方开源）

**对抗通用感的核心手法**：token 命名里**没有一处出现裸色名**（blue/red 只在数据可视化层存在）——一切颜色以用途命名，且每个语义角色同时备好 `emphasis`（实色）/`muted`（浅 tint）两个完成度，状态色永远不会靠临时调 alpha 拼出来。

**解剖（官方 token，light 主题实测值）**：
- 两层结构：Foundational（`--fgColor-* / --bgColor-* / --borderColor-* / --shadow-*`）+ Pattern（`--button-* / --control-* / --focus-* / --overlay-* / --data-*`）。
- 语义角色：accent、attention、danger（=closed 别名）、success（=open 别名）、severe、done（=upsell 别名）、sponsors、neutral、muted、inverse、onEmphasis… 语义别名机制让"issue 状态"与"警示色"同源。
- emphasis/muted 配对（实色 / 浅 tint）：accent `#0969da`/`#ddf4ff`；danger `#d1242f`（bg `#cf222e`）/`#ffebe9`；success `#1a7f37`（bg `#1f883d`）/`#dafbe1`；attention `#9a6700`/`#fff8c5`；severe `#bc4c00`/`#fff1e5`；done `#8250df`/`#fbefff`。
- 中性链（8 级）：`#ffffff / #f6f8fa / #eff2f5 / #d1d9e0 / #818b98 / #59636e / #25292e / #1f2328`。
- 交互状态后缀：`rest / hover / active / disabled / selected`（例：`--button-primary-bgColor-rest #1f883d` → hover `#1c8139` → active `#197935`，仅动色相明度微调）。
- 透明度直接嵌 8 位 hex：`#818b981f`、`#d1d9e0b3`、`--overlay-backdrop-bgColor #c8d1da66`。
- 焦点：`--focus-outlineColor #0969da` 与 accent 同源。
- 数据可视化独立成体系：17 个具名色相（auburn…yellow）各带 emphasis/muted（如 blue `#006edb`/`#d1f0ff`）。

**可抄细节**：
1. emphasis/muted 配对 + 状态后缀（FAR-Lab 证据状态色：supporting=success 系、counter=severe 系、uncertain=attention 系，直接可建）。
2. 8 位 hex alpha 取代独立透明度变量；语义别名（一个色值多个用途名）。
3. 焦点色与 accent 同源，不另造一套。

**何时不该学**：17 个数据 viz 色相是 GitHub 数据密度所需，FAR-Lab 图表 6–8 色足够；无编号灰阶（gray-500 式）在跨团队口头沟通上不如 Geist 的编号刻度直观，可混用。

---

## 5. Figma — chrome 让位于画布，属性栏只做次级动作

**URL**：https://developers.figma.com/docs/widgets/ （figma.com/widget-docs 301 至此）、/docs/widgets/handling-user-events/ 、/docs/widgets/api/type-PropertyMenu/

**对抗通用感的核心手法**：UI chrome 的信息组织以"**直接操作优先**"为最高原则——官方明确属性菜单仅用于 "secondary actions that cannot be done directly on the widget"（如 formatting、settings），复杂输入才开 iFrame。面板不是功能抽屉，是画布的注释层。

**解剖（官方文档）**：
- 交互层级（官方建议顺序）：画布内直接操作（节点 onClick）→ property menu（次级动作）→ iFrame（复杂输入，如 textbox）。
- PropertyMenu API 佐证其组织法：条目 = `propertyName + tooltip + itemType`（action/toggle/select…），toggle 用 `isToggled` 高亮——属性条目是"命名回调"而非自由 UI。
- 文档方法：概念靠**对比定义**（"Unlike plugins that run for a specific person, everyone can see and interact with the same widget"），并显式消歧术语冲突（widget 的 "components" ≠ Figma 的 components）。
- 文档站为 Docusaurus 三栏（左 nav / 中内容 / 右 on-this-page TOC）。

**可抄细节**：
1. "主操作在对象上、属性栏只放次级动作"的分层原则——FAR-Lab 画布/卡片式视图（假设卡片、证据节点）适用：主要动作就地完成，侧栏只收格式与设置。
2. 对比式概念定义 + 显式术语消歧（FAR-Lab 域内 "hypothesis/claim/evidence" 的文档写法可循此）。
3. 属性条目=命名回调 + tooltip + toggle 高亮的极简控件模型。

**何时不该学**：画布范式不适用于线性表单流；Figma 无公开视觉 token，不宜作为色值来源。

---

## 6. Arc Browser — 个性预算集中制

**URL**：https://arc.net（DOM/资源公开可见层，2026-08-22 抓取）

**对抗通用感的核心手法**：全部品牌个性压缩到**两个元素**——一个高饱和锚点色 + 一支定制衬线展示字体；其余界面决策全部服务可用性与真实产品叙事。个性集中而非均布，是"大胆但仍可用"的解法。

**解剖（公开可见证据）**：
- 页面 `<meta name="theme-color" content="rgba(49, 57, 251, 1)">` ——即 **#3139FB**，品牌紫蓝锚点，为页面唯一公开声明的颜色。
- 预载字体 `/fonts/marlin.woff2` 与 `MarlinSoftBasic-Regular.otf / -Italic.otf` ——自有衬线字体 Marlin（软衬线、圆润）用于标题层，正文回落系统 sans：手写感衬线 × 工程感 sans 的对照即个性来源。
- 产品展示全部为视频（`.mp4` poster），真实操作叙事而非静态修图；文案关键词 "clean and calm"。
- 首屏即双平台 CTA（Windows/Mac），个性不减可用性入口。

**可抄细节**：
1. 锚点色单点策略：一个品牌色承担全部识别，UI 其余保持中性（与 Geist/Primer 的彩色预算纪律同向）。
2. 定制展示字体只用于标题层（一支即可制造对照），正文不跟。
3. 产品演示用真实操作视频/动效录屏。

**何时不该学**：Arc 是消费级"个人化浏览器"，高饱和蓝紫+软衬线的情绪收益高；FAR-Lab 是科研信任优先的专业工具，锚点色饱和度应降档（Linear 式 desaturated）；Arc 无公开设计系统，不可当规范引用。

---

## 7. Raycast — 产品即 Hero

**URL**：https://raycast.com（2026-08-22 抓取）

**对抗通用感的核心手法**：首页不放插画，直接放**可交互的命令面板本体**（"Type to filter entries..." 的真实输入框演示）——用交互解释交互型产品，装饰预算为零。

**解剖（公开可见证据）**：
- 首屏即 launcher 交互演示：类型过滤器（All Types）、搜索框、快捷键提示；产品价值由"试用一个真实控件"传达。
- 生态内容（扩展/命令）以紧凑列表+网格组织，密度高但以 launcher 为单一心智入口。
- 口号 "Take shortcuts, not detours." 与结构一致：一切入口收敛到一个命令面板。

**可抄细节**：
1. 首页 hero = 最小可信交互 demo（FAR-Lab 可放一个真的"问题→假设"命令面板）。
2. 键盘优先 + 单一入口的信息架构（命令面板范式适配科研工作流的高频操作）。
3. 用列表/网格的紧凑密度呈现长尾功能，而非每个功能一张营销大卡。

**何时不该学 / 诚实限制**：Raycast 未公开品牌 token（其暗色+红紫渐变的具体值无官方文档，**不作引用**）；命令面板范式要求用户高频键盘操作，低频审阅场景仍需常规导航。

---

## 8. Things 3 / Notion — 纸感的构成

**Notion URL**：https://www.notion.com/help/customize-and-style-your-content （官方 Help，核验可访问）；https://www.notion.com（webReader 抓取）

**对抗通用感的核心手法**："纸感" = **白底 + 浅灰细描边的容器 + chrome 无色化**——官方对 callout 的描述直接给出配方："Default turns the block white with a light gray outline"。内容即纸张，界面只是纸的边。

**解剖（官方/公开证据）**：
- 官网当前预载字体为 `NotionInter-Regular/Medium/Bold.woff2`（front-static 资源，公开可见）——自定制 Inter 承载正文，无第二竞争字体。
- 排版自由度收敛到最小集合（官方 Help）：字体 **Default / Serif / Mono 三选一**、字号 Small text 开关、Full width 开关。少而确定的排版控制本身就是设计立场。
- 色彩几乎全部让给**内容高亮**（用户文本 highlight），界面 chrome 基本无彩色。
- 诚实备注：营销层曾用定制衬线（坊间传 "Vincent"）——**官方来源未确认，不采信**；本文只记 NotionInter。

**Things 3 URL**：https://culturedcode.com/things/ ——官网为极简单栏营销流（hero→交替特性段→分平台下载块）；**未见任何公开设计 token/规范文档**，文本抓取无法核验其衬线/配色具体值，不作描述。其公开可引用的只有立场：单窗口、无设置面板偏好、极简信息架构（官网结构与文案印证）。

**可抄细节**：
1. "白底 + 1px 浅灰 outline" 的容器配方（FAR-Lab 文档视图/报告页可直接用：内容区即纸，面板只描边不上色）。
2. 排版控制最小集：字体 3 选 1 + 小字号开关 + 全宽开关——给用户"确定的自由"。
3. chrome 无色、颜色只属于内容语义（Notion 高亮 ≈ FAR-Lab 证据标注色）。

**何时不该学**：无 chrome、无强状态指示的美学对多状态专业工具（异步任务、失败/重试/部分结果）信息量不足——FAR-Lab 需要明确的状态可见性，纸感只应用于内容编辑/阅读视图。

---

## 9. IBM Carbon — 几何纪律的完整规范（可大量引用）

**URL**：https://carbondesignsystem.com/elements/typography/type-sets/ 、/elements/2x-grid/overview/ 、/elements/spacing/overview/ 、/elements/color/tokens/ 、/elements/color/usage/（注意：旧 `/guidelines/...` 路径已失效）

**对抗通用感的核心手法**：一切尺寸是 **8px mini-unit 的倍数**，"divide or multiply by two, forming a visual rhythm"——几何自洽让每个布局决策可推导，"看起来对"变成"算得出"。这是 IBM 工程传统的直接产物，也是"科学血统"设计系统的可引用范本。

**解剖（官方规范，全部当日核验）**：
- **Type ramp（px / line-height / weight）**：
  - Productive 集（-01 后缀，基 14px，固定尺寸，产品 UI 密集容器用）：body-compact-01 14/18/400；body-01 14/20/400；heading-01 14/20/600；heading-02 16/24/600；heading-03 20/28/400；heading-04 28/36/400；heading-05 32/40/400；heading-06 42/50/**300**；heading-07 54/64/**300**；code-01 12/16/400（Plex Mono）；label-01 12/16/400。
  - Expressive 集（-02 后缀，基 16px，fluid 响应式，营销/叙事用）：body-02 16/24/400；fluid-heading-05 42/50/300；fluid-display-01 54/64/300；fluid-display-04 92/102/300；fluid-quotation-01/02 用 **Plex Serif**（衬线只给引言）。
  - 纪律：**大字用 300 轻字重、小字用 600**——反差制造层级而非放大加粗。
- **Spacing scale**：`$spacing-01..13` = 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160 px（"multiples of two, four, and eight"，小档做组件内、大档做页面密度）。
- **2x Grid**：8px mini-unit；断点表：sm 320/4 列/padding16/margin0；md 672/8 列/margin16；lg 1056/16 列；xl 1312/16 列；max 1584/16 列/margin24。列内 margin 在断点内固定；box 间距 = padding×2 = **gutter 32px**（16 margin + 16 padding）；盒子宽高比白名单 1:1、2:1、2:3、3:2、4:3、16:9；文字对齐到 box padding 边缘。
- **色彩**：各色族 10–100 每 10 一档（Gray 10 `#f4f4f4`、30 `#c6c6c6`、50 `#8d8d8d`、80 `#393939`、100 `#161616`；Blue 60 `#0f62fe`…）。状态 token：`$support-error` Red60 `#da1e28`、`$support-success` Green50 `#24a148`、`$support-warning` Yellow30 `#f1c21b`、`$support-info` Blue70 `#0043ce`，且每个都有 **inverse 变体**（error-inverse `#fa4d56` 提亮一档用于深底）+ caution-minor/major/undefined（undefined 用 Purple60 `#8a3ffc`——"未知状态"有专属色）。`$interactive`/`$focus` = Blue60 `#0f62fe`，官方注明满足 **3:1 AA**。
- **层级（layer）系统**：token 后缀 -00/-01/-02/-03 对应层叠深度（`$layer-02`、`$field-03`、`$border-strong-03`），层序固定；交互色不参与层级步进。深浅模式由 token 对（White/Gray10 = light；Gray90/Gray100 = dark）切换，禁硬编码值。
- IBM Plex 家族（Sans/Mono/Serif）**开源可授权使用**，是"科学感"字体的零成本正解。

**可抄细节**：
1. 双轨 type ramp（productive 14px 基 / expressive 16px 基）——FAR-Lab 工作台用 productive、报告与叙事页用 expressive，一套 ramp 两种密度。
2. spacing 13 档 + 8px mini-unit + gutter=32 推导式；宽高比白名单。
3. 状态色 + inverse 变体 + "undefined 状态专属色"（FAR-Lab 的 UNKNOWN/UNVERIFIED 状态可直接对应 caution-undefined 思路）。
4. heading-06/07 用 300 字重的"大字轻"纪律。

**何时不该学**：Carbon 的规范体量（断点表、layer 系统、双主题 token 对）对三人团队是官僚负担——可只取 ramp + spacing + 状态色三件套；Plex 的工程感若无数据密度支撑会显得空。

---

## 10. Atlassian Design System + Shopify Polaris — token 治理两条路

### Atlassian
**URL**：https://atlassian.design/foundations/color （2026-08-22 核验）

- 命名五段式：`color.{property}.{role}.{emphasis}.{state}`（如 `color.background.accent.bold.hovered`）——把"属性/角色/强度/状态"四维拆开，token 即文档。
- 9 个 saturated ramp（blue/teal/green/lime/yellow/orange/red/magenta/purple）**只定义 100–500**：强调色走到中程即止，体系内不存在"深饱和大按钮色"。
- 中性色 light 与 dark 各自独立成 ramp（dark 非由 light 反转生成），另有独立 alpha 色组。
- emphasis 三级 subtlest/subtle/default/bold（B400 及以上为 bold），语义映射背景→前景递进。
- 对比纪律写进 token 层：交互组件 3:1、文本 4.5:1（WCAG AA），bold 大文本例外 3:1；`warning` 与 `warning.inverse` 分开定义（黄在白底不可读，深底版换色）。
- **可抄**：a) 强调色半程截断；b) 五段式命名；c) warning 双版本（浅底警告色≠深底警告色）。
- **何时不该学**：五段式全量铺开 token 数量爆炸，起步可先用三段（role.emphasis.state）。

### Polaris
**URL**：https://shopify.dev/docs/api/polaris （polaris.shopify.com 已 301 收窄至此）；https://github.com/Shopify/polaris-tokens （官方 README 自标 **LEGACY**）

- 官方定位句式："Shopify's unified UI framework **built on web components**, to deliver a consistent experience across the platform"——一个框架覆盖全部 surface（admin/checkout/POS/customer account），一致性是产品需求而非美学口号。
- LEGACY token 仓库仍展示两条可迁移工程决策：token 一次定义、**多端分发**（npm JS/JSON/SCSS/CSS custom properties/Ruby gem/Android/iOS/macOS/Sketch/Adobe Swatch）；命名 `color-blue-text` 式语义后缀 + spacing 语义词（`loose`）。
- v11 token 架构旧页（palette/alias 双层重构）已随站点迁移下线，**本轮未能核验当前官方 token 全集**——不作转述。
- **可抄**：a) "单框架多 surface"的一致性定位；b) token 单源多格式（CSS vars + JSON + SCSS）输出管线。
- **何时不该学**：web components 多端分发是大厂规模需求；FAR-Lab 单 Web 端先用 CSS custom properties 单格式即可。

---

## 十条反通用感手法汇总

1. **语义占位制色彩刻度**：每个色阶档位绑定用途（Geist 400=边框/900=次级文本；Primer 全语义命名）——先用途后颜色，"随机好看的颜色"在结构上无入口。
2. **等对比度等级制**（Stripe）：同 level 全色相同对比度，配对规则 ≥5 级（小文本）/≥4 级（图标大文本）；用 Lab/OKLCH 校正感知亮度，拒绝 HSL 与机械 tint/shade。
3. **强调色只走半程**（Atlassian saturated ramp 止于 500）+ **品牌个性预算集中**（Arc：一锚点色 #3139FB + 一支定制标题衬线）。
4. **背景 ≤ 2 档**（Geist Background 100/200，官方明言第二档 sparingly）——大面积色分层不是层级手段。
5. **灰阶给全链+对比度注释**（Primer 8 级白→黑；Carbon `#f4f4f4…#161616` + 3:1 AA 注记）：中性色的完成度决定"贵不贵"。
6. **字号双轨制**（Carbon productive 14px 基/expressive 16px 基；Geist Label/Copy 同尺寸不同行高）——密度与叙事分层，而不是全局一套 scale。
7. **大字轻、小字重**（Carbon heading-06 42px/300 vs heading-01 14px/600）——用字重反差替代"放大加粗"。
8. **几何纪律可推导**（Carbon 8px mini-unit、spacing 13 档、gutter=2×padding、圆角 3 档、宽高比白名单；Geist 阴影只用序数）——每个间距算得出，"感觉"换成"系统"。
9. **状态色成体系而非单点**（Carbon support 四态+inverse+undefined 专属紫；Primer emphasis/muted 配对+状态后缀）：inverse 变体解决深底可读，undefined 状态有专属色——科研工具的 UNKNOWN/UNVERIFIED 直接可映射。
10. **真实产品当视觉主角**（Linear 规格书编号 1.0/FIG 0.2 + 真实截图与代码 diff；Raycast 可交互 hero；Arc 操作视频；Figma 属性栏只收次级动作）——权威与个性来自真实内容与结构纪律，从不来自装饰性插画、渐变横幅或入场动画。

---

*线 3 报告完。核验工具：WebFetch / webReader / raw.githubusercontent（GitHub API 元数据佐证 polaris-tokens 仓库存在且公开）。所有未能核验处均已在正文标注。*
