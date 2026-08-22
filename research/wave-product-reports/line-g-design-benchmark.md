# 线 G：设计能力强化与外部最佳实践对标 — 设计参考库

- 产出日期：2026-08-22（所有条目核验日期均为 2026-08-22）
- 核验方法：每条 URL 均经 WebFetch 实际访问（内容存在且如文所引）；License 一律以仓库 LICENSE/LICENSE.md 文件直读全文核验（经 zread 直接读取仓库文件，非页面转述）；产品界面只述公开页面/文档可见内容。
- 诚实声明：
  - 「动效实现」维度：本轮全部目标的公开 docs/README 均未披露 CSS/motion 实现细节，该维度整体标注 UNVERIFIED，不作任何凭印象的描述。FAR-Lab 的「无意义动画禁令」不依赖外部证据，独立成立。
  - AGPL 项目（Cal.com / Plausible / Grafana / AppFlowy / Dub）只学公开界面/文档/设计模式，永不复制代码。
  - 无法核验的子项（Arc 界面细节、Dub 仪表盘 UI、Geist 暗色机制、Plausible 暗色）已就地标注 UNVERIFIED 或直接不述。

---

## 1. Cal.com（预约/时区/首启）

| 项 | 内容 |
|---|---|
| 来源 URL | https://github.com/calcom/cal.com（README）· https://github.com/calcom/cal.com/blob/main/LICENSE · https://cal.com/docs/llms.txt（docs 索引）· https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type.md |
| License | **AGPL-3.0**（核心）+ `packages/features/ee`、`apps/api/v2/src/ee` 目录商业许可（LICENSE 文件直读核验："Content outside of the above mentioned directories … is available under the \"AGPLv3\" license"）。AGPL 传染性强：**只学模式，零代码复制**。 |
| 核验方式 | LICENSE 全文直读（zread 仓库文件）+ README 全文直读 + 两个 docs URL WebFetch |

- **前端架构（README 披露）**：Next.js + tRPC + React + Tailwind CSS + Prisma 的 monorepo（README「Built With」节）；`yarn dx` 一键 Docker 起本地栈；Playwright E2E；`NEXT_PUBLIC_LOGGER_LEVEL`（0–6，silly→fatal）对全部 tRPC 查询/变更做分级日志。
- **信息架构**：核心概念为 event types / schedules（availability）/ bookings / routing forms（docs 索引 llms.txt）；docs 提供 `llms.txt` 机器可读索引。
- **时区处理（API 级一等公民）**：slots 端点 `timeZone` 查询参数（IANA 名，示例 `Europe/Rome`），"Defaults to UTC"；查询窗口 `start`/`end` "Must be in UTC timezone as ISO 8601 datestring"，返回槽位带目标时区偏移（`+02:00`）。即：**边界输入统一 UTC、输出按请求时区渲染**。
- **首启 onboarding（README 披露）**："The first time you run Cal.com, a setup wizard will initialize"；seed 数据含专用用户 `onboarding@example.com`（"Onboarding incomplete"）——专门种一个"未完成首启"的用户档供测试；文档明示 setup wizard 中连接日历步骤可跳过（直达 `/event-types`）。
- **信任呈现**：README 公开 AGPL/EE 权限对照表（"all 'Singleplayer APIs' are open-source under AGPLv3. All commercial 'Multiplayer APIs' are under a commercial license"）；公开 Figma 设计系统入口（cal.com/figma 徽章）；CSP strict 模式以 Report-only 渐进铺开（先报告后强制）。
- **FAR-Lab 可采纳**：
  1. 时区契约模式（存储/请求边界统一 UTC + 展示层 IANA 时区渲染）→ 研究计划排期、实验窗口、文献时间戳统一复用；
  2. 「seed 一个 onboarding 未完成用户」→ FAR-Lab 首启向导各中断状态可进入可测试；
  3. 分级 logger 环境变量（信息密度工具也要有可调观测 verbosity）。

## 2. Plausible（分析仪表盘/日期范围/指标卡）

| 项 | 内容 |
|---|---|
| 来源 URL | https://github.com/plausible/analytics（README/LICENSE.md）· https://plausible.io/docs · https://plausible.io/docs/guided-tour · https://plausible.io/blog/check-website-traffic · 公开自用 demo：https://plausible.io/plausible.io |
| License | **AGPL-3.0**（主体，纯 AGPL 无例外）；嵌入式 JS tracker 单独 **MIT**（README："To avoid issues with AGPL virality, we've released the JavaScript tracker … under the MIT license"）。 |
| 核验方式 | README/LICENSE 直读 + 4 个公开页 WebFetch |

- **前端架构（README Technology 节原文）**："standard Elixir/Phoenix application backed by a PostgreSQL database for general data and a Clickhouse database for stats. On the frontend we use TailwindCSS for styling and React to make the dashboard interactive."
- **信息架构（单页高密度）**："Get all the important insights on one single page. No training necessary."；docs："One dashboard with all your essential stats. No sub-menus, no custom reports to build." 顶部指标行（unique visitors / total visits / total page views / views per visit + bounce rate + visit duration）**点击任一指标即切换主图**；下方 Sources / Top Pages（含 Entry/Exit pages）/ Locations / Devices 明细表，可展开（展开表列含 Visitors, Bounce Rate, Visit Duration, Scroll Depth, Unique/Total Conversions, Conversion Rate，点列头排序）。
- **日期范围选择（guided-tour 核验）**：命名预设含 "Month to date"、"Year to date"、"All time"（并明确只有这三类含当日）；Compare 模式（快捷键 "X"）支持 "Previous period" / "Year over year" / "Custom period"，且带 day-of-week 对齐；Realtime 视图显示"最近 5 分钟"访客，30 分钟页面图每 30 秒刷新；图表粒度随窗口自动约束（Today→分钟/小时，28 天→天/周…）。
- **数据诚实呈现**："A dotted line at the right edge marks the current, incomplete day/week/month"（**不完整周期用虚线显式标记**）；Annotations 以图表标记呈现 deploys/outages 等事件；公开自家站点真实数据作 demo（"View live demo"）。
- **空状态（带因果解释）**：guided-tour 记录 Campaigns 标签为空的成因排查——sources "are only recorded when they start a new session"，空状态不止于"暂无数据"，还解释数据何时会出现。
- **FAR-Lab 可采纳**：
  1. 指标行点击切换主图 + 单页无子菜单 → FAR-Lab 证据/文献统计总览页的信息密度骨架（对抗满屏卡片）；
  2. 不完整窗口虚线 + 对比期对齐（含星期对齐）→ 任何"进行中统计"的诚实呈现规范；
  3. 空状态附成因说明 → 新建项目的空工作台文案模式。

## 3. Grafana（面板/状态色语义/告警状态）

| 项 | 内容 |
|---|---|
| 来源 URL | https://grafana.com/docs/grafana/latest/panels-visualizations/ · https://grafana.com/docs/grafana/latest/panels-visualizations/configure-standard-options/ · https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/alert-rule-state-and-health/ · https://github.com/grafana/grafana/blob/master/LICENSE |
| License | **AGPL-3.0**（LICENSE 直读，纯 AGPL）。只学模式，零代码。 |
| 核验方式 | 3 个 docs 页 WebFetch + LICENSE 直读 |

- **面板模型**："Panels are the basic building block in Grafana dashboards"——面板 = 查询 + 可视化的组合，"a graphical representation of query results"。
- **告警状态语义（rule state 与 health 双轴分离）**：规则状态 **Normal / Pending / Firing**（由底层实例状态聚合，实例级为 Alerting/Pending）；健康度 **Ok / Error / No Data / KeepLast**（"{status}, KeepLast — the rule would have received another status but was configured to keep the last state"）。即**业务状态与评估管道健康度是两个正交轴，且"保持旧态"是显式配置而非静默兜底**。
- **色语义（命名色板而非随手取色）**：文档列出精确色板名："Single color"、"Shades of a color"、"From thresholds (by value)"、"Classic palette"、"Classic palette (by series name)"、"Multiple continuous colors (by value)"（调色板 "Green-Yellow-Red"、"Red-Yellow-Green"、"Blue-Yellow-Red"、"Yellow-Red"、"Blue-Purple"、"Yellow-Blue"）、"Single continuous color (by value)"（"Blues/Reds/Greens/Purples"）。**值驱动的颜色来自 thresholds，语义色来自命名调色板**。
- **空值占位**："No value — placeholder for null/empty values; defaults to a hyphen"——空数据显式占位（连字符），不画 0、不留白。
- **单位系统**：自定义单位语法 `suffix:` / `prefix:` / `count:` / `currency:` / `time:YYYY-MM-DD` / `si:`；自动数量级缩放（0.14kW→140W）。
- **FAR-Lab 可采纳**：
  1. 状态×健康度双轴 → 假设/计划条目的科学状态（draft/testable/supported/refuted…）与数据通道健康（ok/error/no-data/keep-last）分离呈现，"No Data" 不与 "失败" 混同；
  2. 命名色板 + threshold 驱动值色 → FAR-Lab 状态色 token 的组织方式；
  3. "No value" 显式占位符 → 证据密度/置信度等指标为空时的呈现规范。

## 4. Home Assistant（实体状态模型/长任务进度/日志）

| 项 | 内容 |
|---|---|
| 来源 URL | https://www.home-assistant.io/docs/configuration/state_object/ · https://www.home-assistant.io/integrations/logbook/ · https://www.home-assistant.io/docs/automation/troubleshooting/ · https://github.com/home-assistant/core/blob/master/LICENSE.md |
| License | **Apache-2.0**（core 仓库 LICENSE.md 直读）。宽松许可，但 FAR-Lab 政策仍为只学公开文档模式。 |
| 核验方式 | 3 个 docs 页 WebFetch + LICENSE 直读 |

- **实体状态模型（state object）**：实体任意时刻恰有一个单值状态 + 属性字典；时间戳三分：`last_changed`（状态变更）/ `last_updated`（状态或属性变更）/ `last_reported`（最近写入，无论是否变化，均 UTC）；`context` 携带 `id` / `user_id` / `parent_id` 因果链（谁/哪个自动化触发）。UI States 面板显示 `on` / `off` / `unavailable` 等原始状态值——**unavailable/unknown 是一等展示状态**。
- **长任务执行可观测（automation trace）**：每次运行记录 "a step-by-step timeline of what was triggered, which conditions were checked, and what each action did"；trace 视图为交互图 "highlighting which path the automation took"，侧栏标签含 **Step Details**（当前步数据与结果）/ **Automation Config**（**运行时刻的 YAML 快照**）/ **Trace Timeline**（执行步骤+时序）/ **Related activity**；条件显示 "Condition passes" / "Condition did not pass"；动作错误 "Select the message to open a dialog with more information about the error"；默认保留最近 5 条 trace（可配置 `stored_traces`）；提供 "Run actions" 测试模式（跳过触发器与条件全量执行）。
- **日志呈现（Logbook/Activity）**："showing all the changes" in "reverse chronological order"（倒序时间线）；高频变化传感器"assumed to change frequently"被自动排除以防噪音；存储依赖 recorder（排除项仍占库的取舍也被文档如实写明）。
- **FAR-Lab 可采纳**：
  1. **Trace 时间线模式 → AI Agent 长任务（文献检索/假设生成/计划执行）的呈现范本**：逐步时间线 + 每步可点详情 + 运行时配置快照 + 有限条数保留策略——这是"无假进度"的直接工程对应物；
  2. 时间戳三分（changed/updated/reported）→ 证据与假设对象的更新语义字段；
  3. context 因果链（user_id/parent_id）→ provenance 溯源的数据模型参照。

## 5. AppFlowy 与 Dub（跨端工作台 / 仪表盘型产品）

### 5a. AppFlowy

| 项 | 内容 |
|---|---|
| 来源 URL | https://github.com/AppFlowy-IO/AppFlowy（README）· https://github.com/AppFlowy-IO/AppFlowy/blob/master/LICENSE |
| License | **AGPL-3.0**（LICENSE 直读，纯 AGPL 无例外条款）。 |
| 核验方式 | README raw 抓取 + LICENSE 直读 |

- **前端架构（README 原文）**："a single codebase written in Flutter and Rust supporting multiple platforms"（macOS/Windows/Linux + iOS/Android）。产品定位 "The Open Source Alternative To Notion"，价值观三句："Data privacy first"、"Reliable native experience"、"Community-driven extensibility"。
- **功能面（README 列举）**：Kanban、database/grid 视图、可发布文档站、内置 AI、模板、自托管。**界面级细节未截图核验，不描述。**
- **FAR-Lab 可采纳**：Flutter+Rust 单码库跨端是 FAR-Lab 计划中桌面 GUI 的候选技术路线之一（仅作记录，最终决策走架构收敛流程，不因对标直接定案）。

### 5b. Dub (dubinc/dub)

| 项 | 内容 |
|---|---|
| 来源 URL | https://github.com/dubinc/dub（README/LICENSE.md/目录结构）· https://dub.co/docs |
| License | **AGPL-3.0**（核心）+ `apps/web/app/(ee)` 等目录商业许可（LICENSE.md 直读，open-core 结构与 Cal.com 同构）。 |
| 核验方式 | README/LICENSE 直读 + 目录结构直读 + docs WebFetch |

- **前端架构（README 披露）**：Next.js + TypeScript + Tailwind + Prisma + Turborepo monorepo；分析管道 Upstash(Redis)+Tinybird；monorepo 内 `packages/ui`（组件包）、`packages/tailwind-config`（含 `themes.css` 主题层）独立成包——**设计 token/主题作为独立可复用包**。
- **docs 信息架构**：卡片组导航（标题+图标+描述）+ SDK 标签页（服务端 TS/Python/Go/PHP/Ruby，客户端 Web/iOS/RN）；提供 `dub.co/llms.txt` 机器可读索引。
- **仪表盘 UI 细节**：公开 docs 未描述应用内统计卡/事件界面 → **UNVERIFIED，本报告不描述**。
- **FAR-Lab 可采纳**：UI 包与主题包在 monorepo 中独立（`packages/tailwind-config/themes.css`）→ FAR-Lab 设计 token 独立成包、供 Web/CLI/桌面三端共享的组织方式。

## 6. Linear（键盘优先/命令面板/Issue 状态模型）

| 项 | 内容 |
|---|---|
| 来源 URL | https://linear.app/method · https://linear.app/method/write-issues-not-user-stories · https://linear.app/docs/select-issues · https://linear.app/changelog/2019-12-18-new-command-menu · https://linear.app/docs/configuring-workflows |
| License | 闭源商业产品——仅引用公开 method/docs/changelog 页面。 |
| 核验方式 | 5 个公开页 WebFetch |

- **键盘优先（官方 docs 核验）**：列表 `J`/`K` 或方向键高亮；`X` 选中（悬停左缘出 checkbox、Shift+点击为鼠标等价物）；`Cmd/Ctrl K` 打开命令栏执行动作；`Cmd/Ctrl A` 全选（先过滤再全选）；`Esc` 清除；`Option/Alt ↑/↓` 批量移动。**每个键位行为都写进官方文档而非藏在产品里**。
- **命令面板范式（changelog 原文）**："The command menu is one of the core components of Linear and lets you execute any command with just a few keystrokes."——命令按功能分组、**组优先级随当前焦点/视图上下文重排**（看 cycles 时 cycle 命令靠前）、组内再按类型细分、图标辅助扫读。
- **Issue 写作规范（Method 章节）**："Write issues not user stories"（称 user stories 为 "cargo cult ritual"）；标题"short, simple, scannable"；描述"optional–not required"；用户反馈**原文粘贴**并链接对话而非转述；好 issue 有 "a clear, defined outcome"（代码/设计/文档/动作），由执行者本人撰写。
- **状态模型（docs 核验）**：默认 "Backlog > Todo > In Progress > Done > Canceled"；**状态名可自定义但类别序固定**（Backlog/Unstarted/Started/Completed/Canceled/Duplicate 六类）；`Duplicate` 为系统保留状态"cannot be renamed or customized"；首个 Backlog 状态默认接收新 issue（可改）；官方示例：Completed 类含 "Done"、Canceled 类含 "Could not reproduce"/"Won't Fix"——**终态可以有多个语义化出口**。
- **FAR-Lab 可采纳**：
  1. 「固定类别 + 可定制状态」→ 假设生命周期：类别（未检验/检验中/已支持/已反驳/已废弃/重复）固定，类别内展示状态可按项目定制；
  2. Cmd+K 命令栏（上下文重排）+ J/K/X 列表键盘协议 → FAR-Lab 工作台全局命令层与高密度列表操作；
  3. Issue 写作品质三件套（可扫读标题/可选描述/原文反馈内嵌）→ FAR-Lab 假设与计划条目的结构化写作模板。

## 7. Vercel Geist 设计系统（token/色板/字体授权）

| 项 | 内容 |
|---|---|
| 来源 URL | https://vercel.com/geist/introduction · https://vercel.com/geist/colors · https://raw.githubusercontent.com/vercel/geist-font/main/LICENSE.txt · https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt |
| License | Geist 字体：**SIL Open Font License 1.1**（"Copyright (c) 2023 Vercel, in collaboration with basement.studio"）；Inter 字体：**SIL OFL 1.1**（"Copyright (c) 2016 The Inter Project Authors"）。二者均可自由嵌入与自托管。组件包 `@vercel/geistcn` 按其包许可另议（本轮未核验包级 license，引用组件前需另查）。 |
| 核验方式 | 2 个 docs 页 WebFetch + 2 个字体 LICENSE 原文抓取 |

- **token 体系（colors 页核验）**：10 个色阶——`backgrounds, gray, gray-alpha, blue, red, amber, green, teal, purple, pink`；每阶 **100–1000 十档**，步进语义全系统统一：`100/200/300` = 背景 Default/Hover/Active；`400/500/600` = 边框 Default/Hover/Active；`700/800` = 高对比背景；`900` = 次级文本/图标；`1000` = 主文本/图标。CSS 变量命名 `var(--ds-background-100)`、`var(--ds-gray-400)` 等；声明 "P3 colors are used on supported browsers and displays"；Foundations 另含 Materials（"Presets for radii, fills, strokes, and shadows"）与 Grid。
- **背景层次纪律**："prefer Background 1… use Background 2 sparingly"——层级克制写进规范。
- **暗色模式**：colors 页所获内容未载明 light/dark 变体机制 → **UNVERIFIED，不述**。
- **文档工程**："append `.md` to any URL"——设计系统文档全量机器可读。
- **FAR-Lab 可采纳**：
  1. 十档语义步进 + `--ds-*` 变量命名结构（**学结构思想，色值自建**，且 FAR-Lab 禁紫蓝渐变，pink/purple 阶不引入）；
  2. Geist Sans/Mono 与 Inter 均 OFL 1.1 → FAR-Lab 自托管字体无授权障碍。

## 8. Raycast（命令面板范式/快捷键文化）

| 项 | 内容 |
|---|---|
| 来源 URL | https://www.raycast.com/ · https://manual.raycast.com/ |
| License | 闭源商业产品——仅引用公开官网/手册。 |
| 核验方式 | 2 页 WebFetch（raycast.com 首次超时，重试成功） |

- **定位（官网原文）**："A collection of powerful productivity tools all within an extendable launcher."；"Fast, ergonomic and reliable."；"Ergonomic. Keyboard First." / "Fast. Think in milliseconds." / "Native. Pure performance."
- **信任与数据诚实**：公开量化可靠性声明 "Reliable. 99.8% crash-free rate."——用真实指标而非形容词背书稳定性。
- **手册信息架构**：Basics（Search Bar、Action Panel、Keyboard Shortcuts、Command Aliases & Hotkeys）/ Core Features（Snippets、Quicklinks、Clipboard History、Notes、Extensions）/ Power Features（Hyper Key、Cloud Sync、Script Commands、Themes）/ AI（"Get answers without leaving your keyboard"）/ iOS；总纲："Raycast puts apps, files, extensions, AI, and dictation one keystroke away"；**手册站自身以 ⌘K/Ctrl+K 提供站内搜索**（产品哲学外溢到文档站）。
- **快捷键文化**：Quicklinks（"Say goodbye to open tabs"）、命令级 hotkeys/aliases、Snippets 关键词展开。
- **FAR-Lab 可采纳**：
  1. 「launcher + 全局命令 + 命令别名/热键」→ FAR-Lab 高频研究动作（检索文献、跑评估、对比假设版本）做成可绑定别名的命令；
  2. 公开 crash-free 类**量化**可靠性指标 → FAR-Lab 对外呈现稳定性时用真实遥测数字而非空话。

## 9. Notion / Figma / Arc（公开品牌页/设计博客）

### 9a. Notion

| 项 | 内容 |
|---|---|
| 来源 URL | https://www.notion.com/help/customize-and-style-your-content |
| License | 闭源商业产品——仅引用公开帮助文档。 |
| 核验方式 | WebFetch（官方品牌指南页为 JS 渲染无法抓取正文，弃用） |

- **已核验模式**：排版自由度收敛为少数开关——字体三选一 "Default", "Serif", "Mono" + "Small text" 开关 + "Full width" 页宽切换；块级颜色用命令（`/red`）；`cmd/ctrl + shift + H` 复用上次颜色；Callout 块（可嵌套/图标/底色）；封面与图标给出工程化建议尺寸（icon "280 x 280 pixels ideal"，封面 "1,500+ pixels wide recommended"）。
- **FAR-Lab 可采纳**：高密度专业工具的排版控制粒度 = 少量枚举开关（字体/字号/页宽），不开放任意样式——既保持一致性又满足长文阅读偏好（FAR-Lab 的论文/计划长文档阅读场景直接适用）。

### 9b. Figma

| 项 | 内容 |
|---|---|
| 来源 URL | https://www.figma.com/resource-library/ · https://www.figma.com/blog/how-to-move-fast-toward-the-right-thing/ · https://www.figma.com/blog/code-craft-and-the-making-of-nested-folders/ |
| License | 闭源商业产品——仅引用公开资源库/博客。 |
| 核验方式 | resource-library 与 blog 首页 WebFetch（两篇文章标题/URL/日期经 blog 首页核验；正文未逐篇抓取，引用止于标题与标签级） |

- **已核验模式**：资源库 261 篇按主题两级分类（"Design basics" 下含 Typography、Color theory、Brand & Storytelling 等子类）；博客有 "craft" 叙事线——"Code, craft, and the making of nested folders"（幕后工程+设计合写，含 "code as a proposal" 提法）、"How to move fast toward the right thing"（标签 Design systems）。
- **FAR-Lab 可采纳**：把"如何做出来"写成公开过程叙事（工程+设计合写）→ FAR-Lab 方法透明/provenance 报告的文体参照。

### 9c. Arc / The Browser Company

| 项 | 内容 |
|---|---|
| 来源 URL | https://thebrowser.company/（arc.net 返回 403 拒绝抓取） |
| License | 闭源商业产品。 |
| 核验方式 | thebrowser.company WebFetch；arc.net 403 |

- **已核验**：极简公司页，仅两产品入口 "Arc Browser" / "Dia Browser" 与一句话使命 "We're building better ways to use the internet with Dia and Arc."
- **Arc 界面级描述：UNVERIFIED**（arc.net 403 无法抓取）——本报告不描述其任何界面特征，不采纳为设计依据。

---

## 跨参考收敛出的 10 条设计共识

1. **命令面板是核心导航器官，不是彩蛋。** Linear 官方称命令菜单为 "core components of Linear"，Raycast 整个产品即 launcher，Plausible 连日期比较都有快捷键（"X"）。键盘优先 = 信息架构决策（FAR-Lab：全局 Cmd+K + 高频研究动作可绑定别名）。
2. **状态模型 = 固定语义类别 + 可定制展示状态。** Linear 六类别序固定而状态名可改、Duplicate 系统保留；Grafana 规则状态与健康度正交；HA 把 `unavailable`/`unknown` 当一等展示状态。FAR-Lab 的假设/证据生命周期应同样"类别不可变、措辞可配置"。
3. **不完整 ≠ 完成的诚实可视化。** Plausible 用虚线标记"当前未完成的天/周/月"，Grafana 用 "No value" 连字符占位空值，Grafana `KeepLast` 连"维持旧值"都要显式配置。FAR-Lab 一切进行中统计（评估进度、文献覆盖）禁止静默补齐。
4. **时间是多字段语义，不是单一时间戳。** HA 的 `last_changed`/`last_updated`/`last_reported` 三分；Cal.com 输入统一 UTC、输出 IANA 时区。FAR-Lab 证据/假设对象需要区分"内容变更/属性更新/上报时间"并统一时区契约。
5. **单页高密度聚合优于多页卡片漫游。** Plausible："one single page… No sub-menus, no custom reports" + 点击指标切换主图；Linear 列表 + 键盘批量操作。与 FAR-Lab "禁止满屏卡片" 政策互证：信息密度来自行内紧凑与可切换焦点，不是卡片网格。
6. **色彩必须语义化命名。** Geist 十档步进（100/200/300=背景默认/悬停/按下…）+ `--ds-*` 变量；Grafana 命名色板（"Green-Yellow-Red"…）与 threshold 驱动值色分离。FAR-Lab 应建"状态语义色 + 值梯度色"两套命名 token，禁裸色值。
7. **空状态与错误必须带因果和出路。** Plausible 空 Campaigns 解释"只有新 session 才记录来源"；HA 错误点击打开详情对话框、条件显式 "did not pass"；Linear "Could not reproduce"/"Won't Fix" 让失败有语义化出口。FAR-Lab 空工作台/检索零结果/评估失败都要回答"为什么空"和"下一步"。
8. **长任务 = 可检查的 trace，不是进度条。** HA trace 提供逐步时间线、每步数据、运行时配置快照、有限保留条数——这是"反假进度"的最强外部工程范本，直接映射到 FAR-Lab 的 Agent 执行呈现（逐步时间线 + 可点错误详情 + 配置快照，宁可"未知时长"也不造百分比）。
9. **可靠性要用真实数字说话。** Raycast 公开 "99.8% crash-free rate"；Cal.com/Plausible/Dub 公开 license 权限对照表与 CE/云版差异表。FAR-Lab 对外呈现能力与稳定性时只引用可复现指标，呈现开源依赖时逐项标注 License。
10. **文档（含设计规范）要机器可读。** cal.com/docs/llms.txt、dub.co/llms.txt、Geist "append .md to any URL"——面向 agent 的文档索引正在成为专业工具标配。FAR-Lab 的设计 token 与产品规范应同时产出人读版与机器可读版（token JSON/MD）。

> 补充共识（超出 10 条主线的观察）：排版自由度收敛为枚举开关（Notion 三字体/全宽/小字；Plausible 图表粒度随时间窗自动约束）——专业工具感来自受约束的选项，而非开放的样式面板。
