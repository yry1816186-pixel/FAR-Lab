# Scout C 报告：设计系统基座与科学可视化选型（Groups A–G）

- 日期：2026-08-23 ｜ Scout：C ｜ 状态：**DONE（决策已饱和）**
- 方法：npm registry 权威字段（`npm view` 实跑：version/license/dist.unpackedSize/peerDependencies，2026-08-23）+ GitHub 仓库 LICENSE 原文（zread 直读）+ 官方文档/changelog（web 检索）。仓库现状实读：`web/package.json`（React 18.3.1 + Vite 6.0.3 + Tailwind 4.3.3 `@tailwindcss/vite` CSS-first；已有 sonner/lucide-react/katex/diff/pdfjs-dist/citation-js；**cmdk 未在依赖中**——F 组验证结论：当前未使用）。
- 决策词汇：ADOPT / DEFER / REJECT / BUILD（沿用 oss-due-diligence 技能）。
- 免责标注：min+gzip 体积凡未实测者标 `EST`（基于官方文档或生态公认值）；unpacked size 为 npm 实值。

## 0. 执行摘要（推荐栈）

| 组 | 决策 | 选型 | 一句话理由 |
|---|---|---|---|
| A 基座 | **ADOPT** | **shadcn/ui copy-in，底座 radix-ui（npm）** | Tailwind v4 官方一等支持 + 代码归我们所有；Radix 最成熟、与 Tailwind 4 兼容证据最充分 |
| B 动效 | **ADOPT（分层）** | **CSS + View Transitions 为主，motion（npm）按需** | same-document VT 已 Baseline（2025-10-14，FF 144 补齐）；motion 仅用于拖拽排序/布局动画等交互物理 |
| C 图可视化 | **ADOPT** | **@xyflow/react 12** | 中等规模图 + 自定义 React 节点（drill-down 即节点组件）是它的主场；MIT 活跃 |
| D 科学图表 | **ADOPT** | **echarts 6（echarts/core 按需）** | boxplot/beeswarm/误差线（custom series）/断轴等科学图表原生齐备，v6 动态主题+暗色；visx 作为 DEFER 备选 |
| E 内容渲染 | **ADOPT** | **react-markdown + remark-gfm + shiki 细粒度 + @tanstack/react-virtual** | 全 MIT、体积可控、与现有 katex 正交 |
| F 命令面板 | **ADOPT** | **cmdk（经 shadcn Command copy-in）** | shadcn Command = Dialog + cmdk 的标准组合，sr-only 头 + `**:` 样式投射已是成熟模式 |
| G 工作台 IA | **提炼** | 12 条原则（见 §4） | 源自 JupyterLab/VS Code/W&B/Grafana/Dagster 的可迁移结构 |

## 1. 逐组尽调与对比

### A. 可访问基元 / 组件系统

| 候选 | npm 包（实测 version/license） | 维护（证据） | 体积 | Tailwind 4 / React 18 | 结论 |
|---|---|---|---|---|---|
| Radix UI | `radix-ui` 1.6.7 MIT（单包 `@radix-ui/react-dialog` 1.1.23） | WorkOS 投入维护；统一包 `radix-ui` 为官方推荐安装路径（shadcn 2026-02 changelog 迁移至统一包）；社区对统一包同步节奏有抱怨（issue #3854） | unpacked 106kB（统一包为 re-export 层，实际体积来自所用子包） | peer `^16.8\|\|^17\|\|^18\|\|^19` ✓；shadcn 2025-02 起官方支持 Tailwind v4（`@theme`/`data-slot`/new-york 默认）；已知小坑：Radix 全局样式与 TW4 utilities 偶发冲突需 `!important` | **ADOPT（底座）** |
| Base UI | `@base-ui/react` **1.7.0** MIT（注意：旧 scope `@base-ui-components/react` latest 永远停在 `1.0.0-rc.0`，勿装错） | **stable 1.0 于 2025-12-11 发布**，35 个无样式组件，月度发布；MUI 全职工程 + 前 Radix/Floating UI 核心维护者；tldraw 在评估迁移 | unpacked 9.5MB（含全部组件+地图，ESM 可摇树，非按引入成本） | peer `^17\|\|^18\|\|^19` ✓ | **DEFER**（观望/反悔选项：shadcn 新架构支持换底座） |
| shadcn/ui | CLI `shadcn`（非运行时包）+ copy-in 源码 | 官方 changelog 持续活跃：2025-02 Tailwind v4 全面支持（`@theme`、`@theme inline`、`data-slot`、new-york 默认）；2026-02 迁移统一 `radix-ui` 包；新架构支持 Radix / Base UI / React Aria 多底座（`shards` 懒加载映射） | 0 运行时（代码进仓库）；依赖 `radix-ui` + `class-variance-authority` + `clsx` + `tailwind-merge` + `cmdk` 等 | Vite 官方支持路径（`shadcn init -t vite`）；Tailwind v4 一等 | **ADOPT（copy-in 层）** |
| React Aria | `react-aria-components` 1.20.0 **Apache-2.0**（注意：非 MIT） | Adobe 持续维护（1.20.0） | unpacked 6.4MB（组件全量） | peer `^16.8–19` ✓ | **REJECT（作基座）**：行为最强但 API 面重、DOM 骨架不同（`ModalOverlay+Modal+Dialog` vs Radix `Root+Portal+Overlay+Content`），与"copy-in 自有样式"路线的摩擦最大 |

**推荐与集成（Tailwind4 + Vite6 + React18）**：
1. `npx shadcn@latest init`（Vite 模板）→ `components.json` + `cn()`（clsx + tailwind-merge）+ CSS 变量写入 TW4 `@theme`。
2. 只 copy-in 用得上的组件（dialog / dropdown-menu / tabs / tooltip / table / command / sonner 包装 / sheet / scroll-area…），删掉不用的——shadcn 本身就主张裁剪。
3. npm 侧依赖统一走 `radix-ui` 新包（shadcn 2026-02 路径），别散装 `@radix-ui/react-*`。
4. 兼容性坑预案：Radix 全局样式与 TW4 冲突时优先查 `@layer` 顺序与 `!` 前缀，不做样式 fork。
5. 反悔触发器：若 Radix 统一包发布滞后影响安全修复，且 Base UI 保持月度节奏 → 走 shadcn 官方多底座路径切 `@base-ui/react`（迁移工具已内建，绞杀者模式逐组件替换）。

### B. 动效

| 候选 | 许可/版本（实测） | 维护 | 体积 | 结论 |
|---|---|---|---|---|
| motion（framer-motion 后继） | `motion` 13.1.1 MIT（与 `framer-motion` 13.1.1 同版本号，确认后继配对） | pmndrs/motion = motion.dev，Framer/Figma 生产使用 | 官方文档：完整 `motion/react` ≈181kB min / **60.6kB gzip**；tree-shaken `motion` 组件 ≈22–24kB gzip；`m`+`LazyMotion`(domMin) 更小；`motion/react-mini` 的 `animate` 仅 2.3kB | **ADOPT（受限使用）** |
| CSS + View Transitions | 浏览器原生 | — | 0 | **ADOPT（默认路径）** |

- 事实核验：**same-document View Transitions 已 Baseline Newly Available（2025-10-14，Firefox 144 补齐；Chrome/Edge 111+、Safari 18+）**；cross-document 仅 Chromium+Safari（Firefox 进行中）→ 只用 same-document 形态（SPA 完全够）。
- 分层纪律：
  1. 视图/面板级过渡（workbench 布局切换、详情进入/退出）→ CSS transitions + `document.startViewTransition()`，`@media (prefers-reduced-motion: reduce)` 下直接跳变。
  2. 交互物理（假设卡片拖拽重排、对比视图 layout 动画、流式 skeleton）→ `motion/react`，根节点 `<MotionConfig reducedMotion="user">`（自动尊重系统设置），组件内可用 `useReducedMotion()` 分支。
  3. React 18 peer `^18||^19` ✓；建议 `LazyMotion strict` + `m` 控制在 ~20kB gzip 档位。
- REJECT 无（不二选一，是分层）。

### C. 图可视化（证据图 / 溯源图 / 假设对比）

| 候选 | version/license（实测） | LICENSE 原文 | 维护 | 适配 | 结论 |
|---|---|---|---|---|---|
| @xyflow/react | 12.11.3 MIT | 已直读：MIT © 2019-2025 webkid GmbH | xyflow 公司持续发版（12.x 线活跃）；核心 MIT 开源，商业化仅在 pro 示例 | 自定义节点=React 组件（drill-down-to-source 天然实现：节点即卡片，点击开侧栏）；minimap/fitView/controlled flow；peer `>=17` ✓ | **ADOPT** |
| sigma.js + graphology | `sigma` 3.0.3 MIT / `graphology` 0.26.0 MIT | sigma LICENSE.txt 已直读（MIT，Alexis Jacomy 等） | v3 线健康；`@react-sigma/core` 5.0.6 MIT 也有维护 | WebGL 渲染，千级–万级节点主场；交互与 React 定制节点弱于 React Flow | **DEFER**（规模反悔触发器） |
| cytoscape.js | 3.34.1 MIT | 已直读（Cytoscape Consortium） | 极稳（2016 起连续版权记录）但节奏慢；命令式 API，React 包装层（社区）非官方 | 图分析与布局算法最全，但样式/React 集成成本高 | **REJECT** |

- 集成注：`import '@xyflow/react/dist/style.css'` 后用 TW4 tokens 覆写节点/边样式；溯源图用 controlled nodes + `onNodeClick` → 右侧 inspector；tens-to-hundreds 节点规模下 React Flow 无性能压力（其性能红线约在数百节点 + 高频交互，届时再看 sigma）。
- 反悔触发器：单一视图节点 >1k 或需要 WebGL 密集图 → 引入 sigma+graphology 做专项视图，React Flow 保留为交互主图。

### D. 科学图表（分布 / 对比 / 不确定性 / 趋势）

| 候选 | version/license（实测） | 维护 | 体积 | 科学图表能力 | 结论 |
|---|---|---|---|---|---|
| echarts | 6.1.0 **Apache-2.0**（LICENSE 已直读；含 d3 BSD-3 子组件声明：treemap/tree/force/number 工具文件） | Apache 项目；**6.0 于 2025-07-30 发布**（新默认主题、动态主题切换、暗色模式、chord、**beeswarm**、broken axis） | unpacked 60MB（含一切）；实际用 `echarts/core` + 按需 charts/components/renderer，典型 300–400kB min（EST）；全量 ≈1MB min / ≈330kB gzip（EST） | boxplot 原生、误差线/CI 用 custom series 或 markLine/errorBar 模式、beeswarm 原生（v6 新增，分布展示直接受益）、dataset 数据驱动 | **ADOPT（主力）** |
| plotly.js | 3.7.0 MIT | 活跃（3.x 线） | **unpacked 98MB**；dist 单文件 ~3.5MB+ min（EST），无 ESM tree-shaking（partial-dist 拼包方案粗糙） | 误差棒/色标/3D 最全 | **REJECT**（体积不可接受，Vite 主包会被拖垮） |
| visx | `@visx/scale`/`@visx/group` 4.0.0 MIT（npm 实测；注意生态常记 Apache-2.0，以包字段为准） | Airbnb 维护，节奏平缓 | 模块化 SVG 原语，按需组合，体积最可控 | 能力=自己组装（无开箱图表） | **DEFER**（echarts 表达不了的定制不确定性图形时再上） |
| recharts | 3.10.1 MIT | 活跃（v3 重写线） | unpacked 7.5MB；实际 gzip 约 50–70kB 档（EST） | 常规统计图 OK，`ErrorBar` 有但科学图表深度一般；shadcn charts 默认用它（其迁移工具对 recharts 组件"故意跳过"） | **REJECT（作主力）**（不采用 shadcn chart 组件，避免被 recharts 绑定） |
| Chart.js | 4.5.1 MIT | 稳定 | ~70kB min（EST），最轻 | 误差棒需插件；科学场景浅 | **REJECT** |

- 可访问性权衡（canvas vs svg）：echarts 默认 canvas（也可 `renderer:'svg'`）。canvas 对屏幕阅读器是黑盒 → 集成纪律：**每个图表配 `aria: true`（echarts aria 组件生成描述）+ 提供 DOM `<table>` 数据回退/摘要**；SVG 渲染器仅在需要导出矢量时切换（SVG 场景注意 v6 主题默认变更）。visx/recharts 的 SVG 路线天然 DOM 可及，但键盘/ARIA 仍需自建——无论如何"图表的可访问数据等价物"是必须做的产品行为，不是库属性。
- 集成注（Vite6）：`echarts/core` + `GridComponent/TooltipComponent/LegendComponent/DataZoomComponent` + `BarChart/BoxPlotChart/LineChart/ScatterChart/CustomChart` + `CanvasRenderer`；`registerTheme` 用 TW4 design tokens 生成 light/dark 两套，v6 支持运行时动态切换；按路由 `import()` 懒加载图表模块。
- 合规注：Apache-2.0 需随发行物保留 LICENSE+NOTICE（内嵌 d3 BSD-3 条款）；MIT 系列保留版权行。集中放 `THIRD_PARTY_NOTICES`。

### E. 内容渲染

| 候选 | version/license（实测） | 体积/集成 | 结论 |
|---|---|---|---|
| react-markdown | 10.1.0 MIT | unpacked 53kB；peer `react>=18` ✓ | **ADOPT**（+ remark-gfm 4.0.1 MIT） |
| shiki | 4.4.3 MIT | **细粒度是关键**：`shiki/core` + `createJavaScriptRegexEngine`（免 wasm、更小）+ `@shikijs/langs/*` + `@shikijs/themes/*` 动态 import；`shiki/bundle/web` 为折中预设；双主题输出 CSS 变量（`--shiki-dark`）天然适配 TW4 暗色 | **ADOPT（细粒度形态）** |
| @tanstack/react-virtual | 3.14.10 MIT | unpacked 57kB；`estimateSize` + `measureElement` 支持变高行 | **ADOPT**（大证据列表/表格虚拟化） |

- 集成注：react-markdown `components` 映射到 TW4 样式化元素；数学沿用现有 katex（当前 react-katex，后续可评估 rehype-katex 统一管线，非本次决策）；代码高亮单例 `createHighlighterCore` + 按需 4–6 门语言（json/python/markdown/typescript/bash）+ 2 主题，lazy 初始化；证据表用 virtualizer 包住 table body 或行卡片。

### F. 命令面板

- 验证结论：**cmdk 当前不在 `web/package.json`（未使用）**。
- `cmdk` 1.1.1 MIT，peer `^18||^19` ✓，unpacked 82kB（运行时约 10–15kB gzip EST）。pacocoursey 维护（Vercel 生态，Geist 同作者）。
- shadcn 的组合方式（源码巡礼证实）：`CommandDialog` = `Dialog` 包 `Command`；`DialogHeader` 视觉隐藏（`sr-only`）保屏幕阅读器语义；用 TW `**:` 修饰符把样式投射进 cmdk 内部组件。
- **ADOPT：copy-in shadcn `command` 组件（自动带上 cmdk npm 依赖）**，FAR-Lab 的命令注册表（导航/新建假设/跳转证据/运行对比…）自建 BUILD 层，逐条映射到 CommandItem。

## 2. 推荐栈汇总（Tailwind 4 + Vite 6 + React 18 集成清单）

**npm 安装（运行时依赖）**
```
radix-ui            # 底座原语（shadcn 2026-02 统一包路径）
cmdk                # Command 底层（shadcn command 依赖）
class-variance-authority clsx tailwind-merge   # shadcn cn/variant 运行时
motion              # motion/react；MotionConfig reducedMotion="user"；LazyMotion 可选
@xyflow/react       # 图；记得 import 其 style.css
echarts             # 只从 echarts/core 按需 import；懒加载
react-markdown remark-gfm
shiki @shikijs/langs @shikijs/themes   # 细粒度
@tanstack/react-virtual
```
（已有可复用：sonner（shadcn sonner 组件直接包它）、lucide-react、katex/react-katex、diff、pdfjs-dist。）

**copy-in（shadcn 式，代码归仓库所有，随后裁剪改造）**
dialog、command、dropdown-menu、context-menu、tabs、tooltip、popover、sheet、scroll-area、table、separator、sonner(包装)、skeleton、badge、button、input、select、toggle-group。**不 copy**：chart（绑定 recharts）、calendar（引 date-fns）等不需要的。

**自建 BUILD**
- workbench 外壳（分区布局/面板/标签/拆分/布局持久化）——无成熟 MIT 整包可直接 copy 且这是产品核心 IA，不外包给库。
- 溯源/证据图节点组件（基于 @xyflow/react 自定义节点）。
- echarts 主题桥（TW4 tokens → registerTheme）+ 图表 a11y 回退表。
- 命令注册表（action → id/label/keybinding → CommandItem）。
- 虚拟化证据表行组件（measureElement 变高）。

## 3. 许可合规总表

| 库 | 许可（证据源） | 合规动作 |
|---|---|---|
| radix-ui / cmdk / motion / @xyflow/react / sigma / graphology / cytoscape / recharts / chart.js / visx / react-markdown / remark-gfm / shiki / @tanstack/react-virtual / shadcn(源码) | MIT（npm license 字段实测；其中 xyflow/sigma/cytoscape/echarts/tanstack 另读 LICENSE 原文确认） | THIRD_PARTY_NOTICES 保留版权行 |
| echarts | Apache-2.0（LICENSE 原文） | 保留 LICENSE + NOTICE；注意内嵌 d3 BSD-3 子组件条款 |
| react-aria-components（未采用） | Apache-2.0 | 无动作 |
| Base UI（未采用，备选） | MIT | 无动作 |

无任何 GPL/AGPL 风险项。shadcn 源码 copy-in 后按其 MIT 保留来源标注即可修改。

## 4. 工作台 IA 原则（G 组提炼，编号可执行）

来源标注：[JL]=JupyterLab 源码巡礼（application shell/state DB/文件浏览器）、[VS]=VS Code、[WB]=Weights & Biases、[GF]=Grafana、[DG]=Dagster 源码巡礼（mainNavigationItems/资产目录/血缘/事件日志）。

1. **固定命名分区的 app shell**：左侧导航栏（领域对象列表）+ 上下文侧栏 + 主区多标签可拆分 + 底部可折叠面板 + 常驻状态栏。布局状态持久化并在重载后恢复（JL 的 StateDB `restore()` 模式）。[JL][VS]
2. **一切操作皆命令**：每个 UI 动作注册为 `id+label+快捷键` 的命令进入命令面板；面板是渐进披露的引擎，高级功能可以只存在于面板。[VS]
3. **多面板 = 同一模型的多个投影，而非孤岛**：同一实体（假设/证据/运行）可在目录表、详情页、图视图中打开；跨面板选择同步（当前焦点是 shell 级状态）。[DG][WB]
4. **密集表格是主对象列表**：列排序/过滤/分组/固定列 + 保存视图；行点击 → 侧栏抽屉或独立详情页。[WB][DG run list]
5. **对比是一等视图模式而非导出**：勾选 N 项 → 对齐列 diff 视图，高亮 config/参数/指标差异（含"未变更"折叠）。[WB run compare][VS diff][DG]
6. **溯源图做导航，侧栏做检查**：图节点承载状态徽标，点击节点 → 侧栏展示来源/新鲜度/检查结果与原始证据链接；图负责"在哪"，面板负责"是什么"。[DG global lineage]
7. **层级式渐进披露**：总览 → 过滤列表 → 详情 → 原始日志/JSON，每层一步之遥；原始数据默认折叠在 expander 后。[DG event log][WB]
8. **全局作用域控件跨面板共享**：时间范围/过滤条件/变量是 shell 级唯一权威状态，面板订阅而非各自维护（Grafana 的 time range + variables 即此模式）。[GF][WB]
9. **append-only 事件流与当前状态投影分离呈现**：历史时间线永不覆盖；"当前状态"是从事件派生的第二视图。[DG EventLog vs RunStorage]
10. **状态永远派生且可见**：新鲜度/健康/检查徽标由事件计算，不存在手工编辑状态；状态不可得时显示 unknown 而非默认绿。[DG AssetHealthStatus]（与 FAR-Lab 真实性纪律直接对齐）
11. **密度优先的视觉基调**：UI 文本 12–13px、紧凑 8px 间距网格、chrome 极简化，把像素留给数据。[VS][GF]
12. **URL 即工作区状态**：每个视图可深链，布局+选择可在重载/分享后还原。[JL workspace restore][VS]

## 5. 残余不确定性与反悔触发器

- Radix 统一包发布滞后（issue #3854 是真实信号）→ 触发 Base UI 切换评估（shadcn 多底座路径已就绪）。
- 图规模 >1k 节点 → sigma+graphology 专项视图。
- 合规要求 DOM 级可访问图表 → visx BUILD 路径替代 canvas echarts（a11y 回退表无论如何先做）。
- motion 若实际只用到 view transition 场景 → 移除，保持 0 依赖动画。
- 体积数字中标 EST 的项，落地时以 `vite-bundle-visualizer` 实测覆盖。

## 6. 证据清单（关键来源）

- npm registry 实跑（2026-08-23）：上表全部 version/license/unpackedSize/peerDependencies。
- LICENSE 原文直读（zread）：xyflow/xyflow（MIT, webkid）、jacomyal/sigma.js（MIT）、cytoscape/cytoscape.js（MIT, Cytoscape Consortium）、apache/echarts（Apache-2.0 + d3 BSD-3 子组件）、TanStack/virtual（MIT）。radix/pmndrs-motion/cmdk/shiki 的 LICENSE 文件未逐一直读（zread 超时/文件名不符），以 npm license 字段为准——两源一致性高，风险低。
- shadcn-ui/ui 仓库巡礼（zread）：Tailwind v4 支持（2025-02 changelog）、统一 radix-ui 包（2026-02 changelog）、Command=Dialog+cmdk 组合与 sr-only/`**:` 模式、多底座架构（Radix/Base UI/React Aria）、recharts 组件迁移"故意跳过"。
- Base UI stable 1.0（2025-12-11）与 `@base-ui/react` 1.7.0：npm 实测 + base-ui.com/InfoQ 报道。
- motion 体积：motion.dev 官方 reduce-bundle-size 文档（181kB min/60.6kB gzip；tree-shaken 22–24kB；mini 2.3kB）。
- View Transitions：web.dev "Baseline Newly available 2025-10-14"（Firefox 144 = 最后一环）；cross-document 仍 Chromium+Safari。
- ECharts 6.0（2025-07-30）：官方 handbook v6-feature（新主题/动态主题/暗色/chord/beeswarm/broken axis）与 upgrade guide（renderer 仍可选 canvas/svg）。
- JupyterLab/Dagster 源码巡礼（zread）：shell 分区与 StateDB restore；mainNavigationItems/资产目录/血缘/EventLog vs RunStorage。
