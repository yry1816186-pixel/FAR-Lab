# Wave-PRODUCT R2 · 线2：科学/数据工具设计语言解剖（10 案例）

- 核验日期：2026-08-22（全部来源当日访问）
- 方法：官网/官方文档（WebFetch / webReader 抓取）+ 官方开源仓库 token 源码（raw.githubusercontent / gh api / unpkg）+ 生产 CSS 直接取证。字体名只在官方披露处（文档、官方样式表、开源 token 定义）引用；查不到的字段标"未公开"，不猜测。
- 证据分级标注：`[docs]`=官方文档原文；`[code]`=官方开源代码/生产 CSS 实测；`[3rd]`=第三方描述（非官方，仅辅证）；`[mk]`=营销页原文。

---

## 1. Observable（observablehq.com）

来源：
- https://observablehq.com/ （webReader 渲染 + 生产 CSS `/_next/static/css/687942b053c8dbbd.css` 直接抓取）
- https://github.com/observablehq/framework —— `src/style/global.css`、`src/style/layout.css`、`docs/themes.md.ts`、`examples/custom-stylesheet/src/style.css`

**字体系统** `[code]`
- observablehq.com 首页生产 CSS 中唯一 `font-family` 声明：`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`。另预加载 3 个 woff2（哈希文件名，家族名未在页面/CSS 标注）→ **web 应用具体品牌字体：未公开**。
- Observable Framework（官方开源）默认三栈极清晰：
  - 正文 `--serif: "Source Serif 4", "Iowan Old Style", "Apple Garamond", "Palatino Linotype", "Times New Roman", ...`，正文 `font: 17px/1.5 var(--serif)` —— **数据笔记本的正文用衬线，像论文不像 dashboard**；
  - UI 骨架（侧栏/菜单/小号标签）用 `--sans-serif`（-apple-system…avenir…roboto 栈），典型 12–16px；
  - 代码 `--monospace: Menlo, Consolas, monospace`，`--monospace-font: 14px/1.5`。

**色彩策略** `[code]`
- Framework 主题变量（`docs/themes.md.ts`）：`--theme-foreground / --theme-background / --theme-background-alt / --theme-foreground-alt / --theme-foreground-focus` + 派生序列 `muted(60%) / faint(50%) / fainter(30%) / faintest(14%)`——派生灰阶不是手写灰色，而是 `color-mix(in srgb, var(--theme-foreground) X%, var(--theme-background))`，换主题自动重算。
- 语法高亮独立成 `--syntax-keyword / --syntax-entity` 等变量（示例值 #ff7b72、#d2a8ff）。
- Observable Plot 默认分类色（官网首页内嵌代码可见）`[code]`：`#4269d0 / #efb118 / #ff725c` 等。

**密度与间距**：首页 hero 直接用"代码单元+SQL+渲染图表并排"当产品演示——产品截图=使用中的真实单元格，无装饰性插画。

**状态与信任呈现** `[mk]`
- 首页导航有 "Minimap"（响应式数据流图总览）入口——把计算依赖图当一等公民导航。
- 运行状态视觉细节未在所查页面公开 → 未公开。

**偷师点**：① 衬线正文 + 无衬线 UI 骨架 + 等宽代码的"三栈分工"（文档感 vs 工具感分开）；② 用 `color-mix` 从前景/背景两个 token 派生全部灰阶——FAR-Lab 换主题时语义色阶自动一致。

---

## 2. JupyterLab（jupyter.org）

来源：
- https://jupyterlab.readthedocs.io/en/stable/user/interface.html `[docs]`
- https://jupyterlab.readthedocs.io/en/stable/user/notebook.html `[docs]`
- https://github.com/jupyterlab/jupyterlab/blob/main/packages/theme-light-extension/style/variables.css `[code]`
- 执行号星号描述：https://experienceleague.adobe.com/en/docs/experience-platform/data-science-workspace/jupyterlab/overview `[3rd]`（官方用户文档未在所查页面用文字描述 In [*]）

**字体系统** `[code]`（浅色主题默认变量，源码实测）：
- UI 字体 `--jp-ui-font-family: system-ui, -apple-system, "Segoe UI", helvetica, arial, sans-serif`；正文内容同栈；代码 `--jp-code-font-family-default: menlo, consolas, "DejaVu Sans Mono", monospace`；`--jp-code-font-size: 13px`；字号缩放因子 `--jp-ui-font-scale-factor: 1.2`。

**色彩策略** `[docs]`：官方文档几乎不谈"设计色"——活动标签页"a colored top border (blue by default)"（蓝色默认顶边）。模式区分用边框色：Edit Mode=蓝边，Command Mode=灰边（"A blue cell border indicates Edit Mode… A gray cell border indicates Command Mode"）。色彩被刻意压到最低。

**密度与间距** `[docs]`：`--jp-cell-prompt-width: 64px`（In/Out 提示列固定宽）`[code]`；面板可拖拽重排（tab 拖到面板中心=移动，拖到边缘=分裂）；Simple Interface Mode 一键退回单文档。

**状态与信任呈现**：
- 执行状态：单元格显示 `[1]: [2]:` 执行序号 `[docs]`；运行中星号 `In [*]`→完成后变数字 `[3rd]`（Adobe 文档："An asterisk (*) is displayed in the cell's execution counter when the kernel is processing the execution, and is replaced with an integer upon completion"）。
- 提示列透明度即状态：`--jp-cell-prompt-not-active-opacity: 0.5` vs 激活 `1` `[code]`——非当前单元的 In[] 半透明退后。
- Kernel 是独立进程、可中断/重启、"All output is displayed asynchronously" `[docs]`；"only code cells can be trusted; the Markdown cells are always sanitised" `[docs]`——Jupyter 明确用"trusted"一词管理信任。

**偷师点**："朴素但可信"的机制=每个可执行单元永久携带**执行序号**，输出永远可追溯到某次运行；运行中序号位变 `*`。FAR-Lab 的假设/证据卡片可类比为"生成序号+来源状态"，而非装饰性 badge。

---

## 3. RStudio / Posit（posit.co, docs.posit.co）

来源：
- https://posit.co/ （品牌页无设计系统链接，字体/色值：未公开）
- https://docs.posit.co/ide/user/ide/guide/ui/appearance.html `[docs]`
- 主题史：https://posit.co/blog/rstudio-dark-theme （检索摘要辅证）

**字体系统**：官方外观文档不列字体名；自定义主题基于 CSS 选择器 `.ace_keyword`、`.ace_gutter` 等（编辑器=ACE 编辑器体系 `[code 事实：文档描述的选择器前缀]`）。**默认编辑器字体：未公开**。

**色彩策略** `[docs]`：全局 UI 主题仅两个——**Modern（默认，"flattens all user interface elements with a default white background"）**与 **Sky（"light blue background"）**。克制到极点：IDE 颜色个性全部让位给"编辑器主题"（语法色），内置主题含 Ambiance/Chaos/Chrome 等示例，用户可导入 TextMate tmTheme 自动转 `.rstheme`（纯 CSS 格式）。

**密度与间距**：文档将"Pane Layout"独立成篇（四窗格：源码/控制台/环境/输出可自定义排布——此为 IDE 常识布局，官方 Pane Layout 文档存在）。主题文档明确警告：非 `rstheme_`/`ace_` 前缀的类"are subject to change at anytime, and so unsafe to use" `[docs]`——公开稳定的样式契约面。

**状态与信任呈现**：发布说明提及 changelist/diff 面板跟随编辑器主题 `[docs 检索摘要]`；帮助页从固定浅色改为跟随 IDE 主题。

**偷师点**：把"个性/主题"与"结构布局"解耦——UI 骨架只有 2 个全局主题，而内容区（编辑器）开放完整主题生态+公开 CSS 契约。FAR-Lab 可学：**界面框架稳定克制，用户可主题化的只有工作区内容层**。

---

## 4. Wolfram Mathematica / Wolfram Alpha（wolfram.com）

来源：
- https://www.wolfram.com/mathematica/ 、https://www.wolfram.com/notebooks/ （webReader）`[mk]`
- 官网全局字体 CSS：`https://files.wolframcdn.com/pub/fonts/source-sans-pro/1.0/global.css`（官网 `<head>` 直接引用）`[code]`
- 支持文章：https://support.wolfram.com/39039 （Input/Output 单元格字体修改）`[docs]`

**字体系统** `[code]`：官网全站自托管 **Source Sans Pro**（weights 200/300/400/600 + italic，从自家 CDN 按需加载）。笔记本内部默认字体名：**未公开**（支持文章只教"Format ▻ Edit Stylesheet → 分别改 Input / Output 样式"，确认 Input/Output 是两个独立可配置的样式单元 `[docs]`；社区称历史默认 Courier/Times——不作官方事实引用）。

**色彩策略**：营销原文自述设计观 `[mk]`："sophisticated computational aesthetics and award-winning design"、"publication-quality documents"。笔记本页 `wolfram.com/notebooks`：不强调配色，强调排版。

**密度与间距 / 笔记本结构** `[mk]`（官网笔记本页原文）：
- "Input and output are organized in cells"；
- **"Cell brackets show document structure"**——右侧边距的括号层级=文档结构可视化；
- "Closed cell hides code for a cleaner workflow"——收起 cell 即隐藏代码，阅读态/代码态切换；
- "Mathematical typesetting for optimal display"——数学排版是一等能力；
- SHIFT+ENTER 求值、`%` 引用上次输出、悬停函数名弹出文档。

**状态与信任呈现**：输入→输出以 cell 配对、括号分组；未求值与已求值单元的视觉差异未在所查页面描述（未公开）。

**偷师点**：**Cell bracket（单元括号）**——用极简的右边距括号同时表达"分组、层级、可收起"。FAR-Lab 的假设-证据-计划区块可借这一符号语言：结构线不打断正文，收起即得"干净阅读版"。

---

## 5. Streamlit（streamlit.io）——反面教材视角

来源：
- https://docs.streamlit.io/develop/concepts/configuration/theming `[docs]`
- https://docs.streamlit.io/develop/concepts/configuration/config.toml （官方示例 `primaryColor = "#F63366"`）`[docs]`

**字体系统** `[docs]`：主题含 "Base font"（基础字重/字号）与各表面 "Font family / Font style"；经典配置为 `font = "sans serif" | "serif" | "monospace"` 三选一（映射的具体字体家族：未公开）。

**色彩策略** `[docs]`：新版主题体系为 `[theme.light] / [theme.dark] × [theme.light.sidebar] / [theme.dark.sidebar]` 四表面，每表面各自配 Text/Primary/Background/Border 色；顶层还有 "Base color scheme / Base font / Chart color / Sidebar border"。经典选项：`primaryColor / backgroundColor / secondaryBackgroundColor / textColor`。

**为什么容易显得廉价（基于其设计模型的解剖，非官方自评）**：
1. **颜色即配置项而非语义系统**：用户任意填 primaryColor，没有 token 语义层（无 success/error/背景层级派生），默认观感依赖用户品味；
2. 组件逐个渲染、无文档级排版（对照 Observable Framework 的衬线正文三栈）；
3. "Chart color" 独立设置，图表色与 UI 色无继承关系时易冲突。
（前两条是从其官方主题配置面推导的结构性判断，标注为分析而非引文。）

**状态与信任呈现**：`theme.fontFace` 修改需重启服务（热重载例外）`[docs]`——主题配置的生效边界有明示。

**偷师点（反向）**：FAR-Lab 主题应提供**语义 token 层**（brand/positive/negative/muted + 表面层级），而不是把裸颜色暴露给用户；裸色配置是 Streamlit demo 感的根源。

---

## 6. Grafana（grafana.com / @grafana/design-tokens）

来源：
- npm 包 `@grafana/design-tokens@0.2.2`：unpkg 实测 `generated/tokens.css`、`dist/css/legacy/default.css`、文件清单 `[code]`
- https://github.com/grafana/grafana/issues/78865 、#130167 （新 token 体系演进）`[docs]`
- 插件最佳实践：https://grafana.com/developers/plugin-tools/key-concepts/best-practices （"use `theme.colors.primary.main` etc. via useTheme2(), never hardcode"）`[docs]`

**字体系统**：token 包含 typography 组（npm 描述 `[docs]`）；具体家族名：未公开（所查 CSS 未含 font-family 声明）。

**色彩策略** `[code]`（tokens.css 实测）——语义色是**角色族**而非单色：
- 每个语义（success/error/warning/info/primary/critical）派生固定角色：`-main / -text / -border / -border-transparent / -shade / -contrast-text / -transparent(15%不透明)`；
- 旧语义层映射（light 模式）：success→green（main `rgb(10.59% 52.16% 36.86%)`≈#1b855e，text 更深）、error→red（main `rgb(87.84% 13.33% 43.14%)`≈#e1226e…按百分比换算，原文如此）、warning→orange（main `rgb(100% 60% 0%)`=#ff9900）、primary→blue；
- 新层：`accent` 全阶映射 `brand-orange-*`（50–950）——Grafana 品牌色=橙，且是有完整色阶的 token；
- 中性面：`background: canvas / primary / secondary / elevated` 四级表面 + `border: weak / medium / strong`；
- 暗色：`@media (prefers-color-scheme: dark)` 自动切换，legacy 语义色有整套 dark 变量。

**密度与间距**：token 化 border-radius（2px→9999px 九档）、border-width（1/2/4px）`[code]`——监控面板小空间多组件，尺寸系统全 token。

**状态与信任呈现**：`-transparent`（15% 底色）与 `-contrast-text` 保证"淡底+对比文字"的徽章/横幅在双色模式都可读；这是告警/阈值呈现的标准角色集。

**偷师点**：语义色=**角色族**（main/text/border/transparent/contrast-text），一个"证据可信度"语义在 FAR-Lab 里也应派生"强调条/正文/边框/淡底 badge"全套，而不是只定义一个绿。

---

## 7. Metabase（metabase.com）

来源：
- https://www.metabase.com/ `[mk]`
- https://www.metabase.com/docs/latest/configuring-metabase/appearance `[docs]`
- https://www.metabase.com/docs/latest/embedding/sdk/api/MetabaseTheme 、MetabaseColors（brand 默认值：未公开）`[docs]`

**字体系统** `[docs]`：实例级单字体设置（"the primary font used in charts and throughout the Metabase application"）；SDK 主题 `fontFamily` 默认取实例字体；`fontSize` 默认 ~14px（0.875em），表格单元格 ~12.5px、数据透视单元格 ~12px。具体默认字体家族：未公开。

**色彩策略** `[docs]`：管理台仅三个语义位——"First color"（按钮/链接/默认图表色）、"Second color"（聚合与分组）、"Third color"（过滤器与筛选组件）——**UI 与图表共享一套语义色位**；图表色最多 24 个 hex，不足自动生成，且"系列颜色由 Metabase 按区分度挑选，不按你给的顺序"。暗色为用户级偏好，管理台只可控部分 UI 色。

**密度与信任呈现**：
- 加载文案默认 **"Doing science…"**（备选 "Running query…"/"Loading results…"）`[docs]`——把等待时刻变成品牌人格+真实状态；
- 核心信任卖点在首页 `[mk]`："Inspect the query behind every answer"——每个答案可下钻到底层 SQL；点击图表 drill-down "find the 'why'"；
- SDK 细节：表格 id 列底色 `lighten(brand)`、文本用 brand——主色以功能方式复用 `[docs]`。

**偷师点**：① 每个结论卡片强制"Inspect the query behind every answer"入口（FAR-Lab=每个假设/结论可展开证据链与 prompt/来源）；② 等待文案人格化但真实（Doing science…）。

---

## 8. Zotero（zotero.org）

来源：
- https://www.zotero.org/ `[mk]`
- Zotero 7 发布公告：https://www.zotero.org/blog/zotero-7/ `[docs]`

**字体系统**：发布公告未提字体变化；UI 字体：未公开。

**色彩策略** `[docs]`："every part of the new design was created with dark mode in mind"——暗色模式是一等公民（含 PDF/EPUB 内容的基础暗色支持，可关）。

**密度与间距** `[docs]`（Zotero 7 原文）：
- **"two density options… Compact and Comfortable"**，默认 Comfortable（"more approachable for new users"）——列表密度成为显式设置；
- 条目面板（Info/Tags/Notes）从水平 tab 改为**可折叠纵向分区+侧导航**，插件可挂自定义分区；
- 可定制头部：仅显示 title / title+author+date / 完整书目条目——**同一列表行按需切换元数据密度**，折叠时头部仍可见。

**状态与信任呈现** `[mk]`：定位语"free, easy-to-use…collect, organize, annotate, cite, and share"；开源+非营利组织是信任背书；9,000+ 引文样式。视觉状态标记未公开。

**偷师点**：**元数据密度的用户可选**（Compact/Comfortable + 头部三档信息量）。FAR-Lab 的文献/证据列表同理：科研用户对"每行显示多少元数据"偏好分裂，给档位而不是给唯一样式。

---

## 9. LaTeX / Overleaf（overleaf.com, docs.overleaf.com）

来源：
- https://docs.overleaf.com/navigating-in-the-editor/editor-display-font `[docs]`
- https://docs.overleaf.com/getting-started/how-do-i-use-overleaf/redesigned-overleaf-editor `[docs]`

**字体系统** `[docs]`：编辑器等宽字体三选：**"Monaco / Menlo / Consolas"、"Lucida / Source Code Pro"、"OpenDyslexic Mono"**；字号 10–24px；行距 Compact/Normal/Wide。默认值未公开。PDF 侧当然渲染 LaTeX 排版字体（Computer Modern 系）——工具 UI 用等宽+无衬线，**成果物**保留学术衬线排版：两套字体系统并存。

**色彩策略**：设置面板含主题切换（overall theme / editor theme）`[docs]`；色值未公开。

**密度与间距 / 布局** `[docs]`：左编辑/右 PDF 双栏永恒；重设计后"editing pane remains on the left and the PDF viewer on the right"，顶栏收敛为 Overleaf 图标+File/Edit/View/Help+项目菜单；新**左侧竖栏**自上而下：文件树→搜索→集成→Review（修订/评论）→Chat，底部 Help/Settings；SyncTeX 跳转箭头在分栏线上。

**状态与信任呈现** `[docs]`：Recompile 常驻 PDF 视图左上；错误日志就在 Recompile 旁（"with a new design"）+ AI Error Assistant——**错误与触发编译的按钮同址**，不藏在别处。

**偷师点**：成果物排版（学术衬线、公式）与工具界面（等宽+无衬线）**分离并存**；以及"日志/错误就放在动作按钮旁边"的就近反馈。

---

## 10. GitHub 代码 / diff 呈现（primer.style + primer/primitives）

来源：
- https://primer.style/foundations/color （JS 索引页；数值以下列仓库为准）
- https://github.com/primer/primitives —— `src/tokens/functional/color/bgColor.json5`、`functional/typography/font-stack.json5`、`base/color/light/light.json5`、`contributor-docs/adrs/`（ADR-003 neutral-scales 等）`[code]`

**字体系统** `[code]`（font-stack.json5 原文）：
- 无衬线：`'Mona Sans VF', -apple-system, ..., 'Noto Sans', Helvetica, Arial, sans-serif`（GitHub 自有可变字体 **Mona Sans** 打头），heading 用语义独立的 `sansSerifDisplay`（同栈异名）；
- 等宽：`ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace`，描述写明规则："**MUST use for all code display. Use for technical content requiring fixed-width characters**"（含 tabular-numbers 用途）。

**色彩策略 / diff 语义** `[code]`：
- diff 底色=语义 token：新增行 `bgColor.success.muted` → `base.color.green.0` = **#dafbe1**（light），删除行 `bgColor.danger.muted` → `red.0` = **#ffebe9**——极淡的底色，文字仍是正常前景色；
- 语义描述直白："Subtle success background for positive feedback and completed states"；强调层 `emphasis` 的用法枚举为 `'merge-button', 'confirm-action', 'success-badge'`——**强色只给动作/徽章，弱色给信息底色**；
- token 内嵌机器可读使用规则（`org.primer.llm` 扩展：usage/rules 字段）；
- 中性色独立 ADR（ADR-003 neutral-scales）；主题= light/dark/high-contrast/dimmed 多套并行文件。

**密度与间距**：等宽+行号列；typography token 含 display/title/body/caption 级，display 描述"Use sparingly for hero sections" `[code]`。

**状态与信任呈现**：红/绿/灰的克制=**语义三段**：danger(红)/success(绿)/neutral(灰阶派生)，色深=层级（muted 底色→emphasis 实底白字 contrast-text）。

**偷师点**：diff 的"淡底不改文字色"原则（保证可读性与无障碍），以及**把 token 用法规则写进 token 文件**（机器+人都能读的 usage/rules）——FAR-Lab 的证据置信色可直接采用 muted 底色+正常文字，emphasis 只用于动作。

---

# 科学工具设计共识与 FAR-Lab 差异化机会

**跨案例共识（均有上文证据支撑）**

1. **衬线=文档，无衬线=工具，等宽=计算**：Observable Framework 正文 Source Serif 4、Overleaf 成果物 LaTeX 衬线、Wolfram "publication-quality"——科学界把"衬线正文"读作"这是文档/论文，不是 app"。UI 骨架一律无衬线，代码一律等宽（Menlo/Consolas 出现在 Observable、JupyterLab、GitHub 三家的默认栈里）。
2. **色彩极度克制，语义压倒装饰**：JupyterLab 全局只有"蓝=编辑态/灰=命令态/蓝顶边=活动页"；RStudio 全局主题只有 Modern/Sky 两个；GitHub diff 只用淡绿/淡红/灰。**没有一个严肃科学工具用渐变、多主色或高饱和 dashboard 风。**
3. **执行/来源状态是界面的一等公民**：Jupyter 的执行序号（In [n]→In [*]）、Metabase 的"Inspect the query behind every answer"、Overleaf 的"日志在 Recompile 旁"、GitHub 的 diff 底色。信任=可追溯，且可追溯性有专门视觉位。
4. **灰阶/派生色来自机制而非手写**：Observable `color-mix` 派生 muted→faintest；Grafana 语义色角色族；Primer scale+semantic 两层 + 机器可读 usage 规则。
5. **密度可调或分层**：Zotero Compact/Comfortable + 头部三档元数据；JupyterLab Simple Interface Mode；RStudio 面板自定义。科研用户对密度偏好分裂，成熟工具都给档位。
6. **结构用几何符号而非重色块**：Wolfram cell bracket、JupyterLab cell 边框色、GitHub 行号+底色。

**FAR-Lab 差异化机会（对标后发现的空白）**

- 没有任何被解剖工具把"**不确定性/反证/置信度**"做成一级视觉语义（Grafana 只有 success/error/warning/info；GitHub 只有红绿灰）。科学方法操作系统需要第五类语义：**未验证/UNVERIFIED、已反驳、证据冲突**——这是 FAR-Lab 独有的色彩语义责任区。
- 证据链的"执行序号"（Jupyter 模式）+ "Inspect behind every answer"（Metabase 模式）可组合成 FAR-Lab 的**假设-证据可追溯视觉**：每张卡片带生成/验证序号与来源下钻。
- 排版方向建议直接采纳三栈分工：假设叙述区用衬线（Source Serif 4 栈）、工具 chrome 无衬线（system-ui）、数据/代码等宽；灰阶用 color-mix 机制派生，杜绝手写灰。
- 密度档位（Zotero 式 Compact/Comfortable）应进入 FAR-Lab 设置而非硬编码；结构分组可借 Wolfram cell bracket 的括号语言表达"假设块/证据块/计划块"的层级与折叠。

（以上"机会"为基于案例的设计判断，非案例原文。）
