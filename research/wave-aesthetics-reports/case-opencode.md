# 案例研究：opencode（sst/opencode）TUI/CLI 设计

- 调查日期：2026-08-22
- 方法：zread 直读仓库（repo: sst/opencode，master 分支）+ raw.githubusercontent.com 拉取全文（session/index.tsx 2718 行、run.ts 1016 行、ui.ts 132 行均下载到本地核对行号）
- 定位：终端 AI agent，与 FAR-Lab CLI 同类（Node/TS 技术栈直接可比）
- 版本锚点：`packages/tui/package.json` → `@opencode-ai/tui` v1.18.18

---

## 1. TUI 技术栈

**结论：TypeScript + SolidJS + 自研渲染器 @opentui，不是 Go bubbletea，也不是 Ink。**

- 历史注：最初的 opencode 是 Go 项目，SST 团队 2025-06 用 TypeScript/Bun 重写（zread 仓库档案页 6-about-contributors；模型记忆+二手来源，仅作背景）
- `packages/tui/package.json` 依赖清单：`@opentui/core`、`@opentui/solid`、`@opentui/keymap`、`opentui-spinner`、`solid-js`、`effect`、`fuzzysort`、`strip-ansi`、`diff`；运行时为 Bun（scripts: `bun test`）
- `@opentui` 是 SST 自研的开源终端渲染框架（React/Solid 组件模型 → 终端 renderable 树），提供 `<box>` `<text>` `<spinner>` `<markdown>` `<diff>` `<textarea>` `<scrollbox>` 原语和 flexbox 布局（全文档证据见各组件 tsx 中的 JSX 标签，如 `packages/tui/src/routes/session/index.tsx`）
- 核心渲染代码分布（`packages/tui/src/`）：
  - 路由：`routes/home.tsx`、`routes/session/index.tsx`（2718 行，最复杂组件）
  - 组件：`component/`（dialog-*、prompt/、spinner.tsx、logo.tsx）
  - UI 原语：`ui/`（border.ts、dialog.tsx、dialog-select.tsx、toast.tsx）
  - 主题：`theme/index.ts` + `theme/assets/*.json`（34 套）
- 桌面版（Electron）内嵌同一 TUI；Web 版是独立包 `packages/web` + `packages/session-ui`（CSS 组件，与 TUI 不共享渲染代码）

## 2. 视觉设计系统

### 2.1 颜色体系（语义 token，非硬编码）

`packages/tui/src/theme/index.ts` 定义 `Theme` 类型，全部 UI 只引用语义 token：

- 基础语义：`primary / secondary / accent / error / warning / success / info`
- 文本：`text / textMuted / selectedListItemText`
- 背景四层：`background / backgroundPanel / backgroundElement / backgroundMenu`
- 边框三级：`borderSubtle / border / borderActive`
- diff 专用 14 个：`diffAdded/Removed/Context/HunkHeader/HighlightAdded/HighlightRemoved/AddedBg/RemovedBg/ContextBg/LineNumber/AddedLineNumberBg/RemovedLineNumberBg`
- markdown 16 个 + 语法高亮 9 个（`syntaxComment…syntaxPunctuation`）
- 特殊：`thinkingOpacity: number`（默认 0.6）——思考文本整体降透明度而非换灰色

**34 套内置主题**：`theme/assets/`（catppuccin×3、gruvbox、nord、tokyonight、dracula、vercel、opencode 等）。主题文件格式（`theme/assets/opencode.json`）：

```json
{ "defs": { "darkStep9": "#fab283", ... },
  "theme": { "primary": { "dark": "darkStep9", "light": "lightStep9" }, ... } }
```

特性：`defs` 命名引用链（循环引用显式报错）、dark/light 双模式每 token 单独可变、支持 hex / ANSI 0-255 索引 / `"transparent"` / 引用其他 token（`resolveTheme()`，theme/index.ts）。

**system 主题自动生成**：`generateSystem(colors, mode)` 从终端真实 16 色 palette + 背景色推导全套 token（灰阶按背景亮度 12 级生成、diff 背景用 `tint(bg, green/red, 0.22)` 混合、暗/亮自动判别 `terminalMode()`）。优先级：defaults < plugin < 用户自定义 < system（`listThemes()`）。

默认 opencode 主题配色倾向（opencode.json）：主色暖橙 `#fab283`（dark），secondary 蓝 `#5c9cf5`，accent 紫 `#9d7cd8`，灰阶 `#0a0a0a→#eeeeee` 12 级等差。

### 2.2 边框样式：无框美学 + 单侧竖线

`packages/tui/src/ui/border.ts` 仅两个定义：

- `EmptyBorder`：全空字符（隐藏边框但保留 padding 占位）
- `SplitBorder`：仅左右竖边，竖线字符 `┃`（粗制表符）

**实际用法是"左边线"模式**：消息/工具卡片用 `border=["left"]` + `customBorderChars={SplitBorder.customBorderChars}`，即内容左侧一根 `┃` 色条 + `backgroundPanel` 底色区分层级，不用四边框盒子（见 UserMessage、BlockTool、权限面板、错误面板）。颜色即语义：用户消息=agent 色、权限=warning、错误=error、普通工具卡片=theme.background。

### 2.3 字体样式

- 粗体：标题 `markup.heading`、错误 `error` scope、`extmark.file/agent`（粘贴文件/agent 标记）bold
- 斜体：注释、`markup.quote`、keyword 类、`markup.italic`
- 暗淡：`textMuted` 是独立 token（非 bold/dim 属性），用于 hint、元信息、折叠态
- 删除线：被拒绝的操作整行 `TextAttributes.STRIKETHROUGH`（session/index.tsx InlineToolRow）
- 思考文本：前景色乘 `thinkingOpacity`（0.6）实现降透明度（`generateSubtleSyntax()`，theme/index.ts）

### 2.4 Spinner

- 常规：braille 帧序列 `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`，80ms/帧，颜色默认 textMuted；**动画全局关闭时降级为静态 `⋯`**（`packages/tui/src/component/spinner.tsx`）
- 品牌 spinner："Knight Rider" 双向扫描动画（`packages/tui/src/ui/spinner.ts`，~330 行）：菱形字符集 `⬥◆⬩⬪·`、拖尾指数衰减 `0.65^n`、端点 hold 帧、单色派生（`deriveTrailColors`/`deriveInactiveColor` 用 alpha 而非换色，背景无关）
- CLI 侧无 spinner，靠 `• running / ✓ / ✗` 状态图标

## 3. 布局结构

### 3.1 Home（空态首页，routes/home.tsx）

垂直居中：Logo（上）→ Prompt 输入框（maxWidth = 配置 75 或 `max(75, 70%终端宽)`）→ 插件 slot → 底部 footer slot。输入框有**轮换 placeholder 示例**：`"Fix a TODO in the codebase" / "What is the tech stack of this project?" / "Fix broken tests"`（普通）与 `"ls -la" / "git status" / "pwd"`（shell 模式）——空态即教学。

### 3.2 Session 主界面（routes/session/index.tsx）

```
┌────────────────────────────────────────┬──────────┐
│ 消息流 scrollbox（sticky bottom）        │ Sidebar  │
│  - UserMessage（左色条+panel底）          │ (42 列，  │
│  - AssistantMessage parts               │  >120列  │
│    text(缩进3) / tool行 / thinking      │  常驻；  │
│  - 消息元信息行 ▣ Build · model · 3.2s   │  窄屏   │
│ [权限面板 / 子代理footer / Prompt 输入]   │  遮罩)  │
├────────────────────────────────────────┴──────────┤
│ Footer：工作目录(muted) · △N Permissions · •2 LSP  │
│         · ⊙3 MCP(error红) · /status hint           │
└─────────────────────────────────────────────────────┘
```

- 宽度 >120 列 sidebar 常驻（占 42 列），否则 `<leader>b` 呼出且以 70/255 黑色 alpha 遮罩全屏（session/index.tsx `sidebarVisible`/overlay box）
- Footer（routes/session/footer.tsx）：左=目录路径 textMuted；右=状态指示（`•` LSP 数、`⊙` MCP 数有失败则红、`△` 待权限数 warning）+ `/status` 命令提示；未连接时轮播 "Get started /connect"
- 视觉层级：正文 text > 工具行 textMuted（完成态）> hint textMuted；卡片用背景分层（background→backgroundPanel→backgroundElement hover→backgroundMenu）而非边框加粗

### 3.3 Prompt 输入框（component/prompt/index.tsx + prompt/）

- 多行 textarea，光标色 `theme.primary`；submit=return、换行=shift/ctrl/alt+return；↑↓=历史（prompt/history.tsx，frecency 排序见 prompt/frecency.tsx）
- 内嵌 `/` 命令自动补全（autocomplete.tsx）、`@` 文件引用、粘贴折叠为 `extmark.paste` 标记
- `ctrl+x e`（leader+e）跳外部 $EDITOR 编辑长输入

## 4. 长任务/agent 运行态呈现（核心资产）

全部在 `packages/tui/src/routes/session/index.tsx`：

### 4.1 工具调用：InlineTool / BlockTool 双形态

- **InlineTool（单行，大多数工具）**：`icon 参数摘要`。pending 态显示 `~ Writing command...`；running 态 icon 后跟 spinner；完成态 icon+文本转 textMuted。行首 icon 宽度固定 2（`INLINE_TOOL_ICON_WIDTH`）保证多行工具对齐
- **BlockTool（多行卡片，edit/bash/write/generic）**：左 `┃` 边线 + backgroundPanel，标题行 `# Edit src/foo.ts`（textMuted），内容区语法高亮 diff（>120 列自动 split view 否则 unified）、shell 输出折叠到 10 行、generic 折叠到 3 行 + `Click to expand/collapse`
- 颜色状态机（InlineTool `fg()`）：等待权限→warning；失败→error；完成→textMuted；运行中→text
- **错误**：失败行红显，点击展开完整 error 文本（`errorExpanded`）；被拒绝（permission denied）→整行删除线灰显，与"失败"明确区分（`denied()` 检测 rejected permission / dismissed）
- **完成的成功工具可整体隐藏**：`showDetails=false` 时 completed 工具不渲染（`shouldHide`）——默认展示，可一键降噪

### 4.2 工具 icon 词汇表（与 CLI 共用语义，CLI 侧证据 `packages/opencode/src/cli/cmd/run/tool.ts`）

`⚙ generic · ✱ glob/grep · → read/list/skill · ← write/edit · % webfetch/patch · ◈ websearch · # todos/lsp · ✓ 完成 · │ 运行中 · ✗ 失败 · • CLI 运行中`

### 4.3 思考（ReasoningPart + ReasoningHeader）

- 运行中：`◐ spinner Thinking: <首行标题>`（warning 色带 thinkingOpacity）
- 完成：单行折叠头 `+ Thought: <自动摘要标题> · 4.2s`（`+/-` 前缀表可展开，warning 色），点击展开正文
- 正文用 markdown 语法高亮但整体 0.6 透明度（subtle syntax），与正式回答视觉区分
- `ctx.thinkingMode()`: hide（默认折叠）/expand 两档，`/thinking` 命令切换

### 4.4 子代理 Task（长任务呈现的关键模式）

单行 InlineTool：`✓/│ Agent Task — description` + 状态行：
- 运行中实时镜像子会话当前工具：`↳ Read Finding evidence in paper`（取子会话最近 running/completed 工具的 `state.title`）
- 无 title 时：`↳ 12 toolcalls`
- 重试：`↳ Retrying (attempt 3) · <截断80字符的错误>`（红色）
- 完成：`↳ 12 toolcalls · 1m 20s`
- 点击整行**跳转子会话**查看全程；消息尾部另有 `ctrl+x ↓ view subagents · ctrl+b background` hint 行

### 4.5 流式与消息级状态

- 文本流式：`<markdown streaming={true}>` 增量渲染，代码块 conceal 折叠
- 消息错误：独立左 `┃` error 色条卡片 + backgroundPanel，错误文本 textMuted（errorMessage()）
- 中断：元信息行追加 `· interrupted`（textMuted）
- 回滚（undo）：插入卡片 `N message reverted` + `<leader>r or /redo to restore` + 文件级 `+adds -dels` 着色统计
- Toast（ui/toast.tsx）：success/error/warning 三态短消息（如 "Message copied to clipboard!"）

## 5. 交互

### 5.1 快捷键体系（packages/tui/src/config/keybind.ts，~150 个命名绑定）

- **Leader 键 `ctrl+x`**：高频操作全走 leader 前缀防冲突——`<leader>n new / l list / m model / a agent / t theme / b sidebar / s status / c compact / u undo / r redo / y copy / h conceal / 1-9 quick switch`
- 直接键：`ctrl+p` 命令面板、`ctrl+r` 重命名、`ctrl+d` 删会话、`escape` 中断、`tab/shift+tab` 切 agent、`f2` 循环最近模型、`pageup/pagedown` 滚动、`ctrl+b` 后台化子代理
- 每个绑定都带 `description` 字符串（which-key 面板与帮助对话框共用），用户可整体 override（Schema 校验，未知键名报错 `Unrecognized keybinds`）
- Diff 查看器子键位体系（`[ ] n p b s v ?`）独立成组

### 5.2 确认/权限 UI（routes/session/permission.tsx）

- 内联面板（非模态遮断）：左 `┃` warning 色条 + `△ Permission required` 头 + 工具类型化摘要（`$ <完整命令>` / Read/Edit 路径 / diff 全文可滚动）
- 三选项胶囊 `Allow once / Allow always / Reject`，←→/h/l 切换高亮，enter 确认，escape=Reject
- `Always` 二级确认列出将放行的 pattern 列表；`Reject` 可选填反馈文本（"Tell OpenCode what to do differently"）
- `ctrl+f` 全屏展开长 diff；鼠标可点

### 5.3 列表导航

dialog-select：↑↓/ctrl+p/n 移动、pageup/down 翻页、home/end 跳首尾、return 确认；命令面板 `ctrl+p` 全局（fuzzysort 模糊过滤 + category 分组 + slash 命令同源注册）

## 6. 术语与文案风格

- 动词开头小写中性行文：`Fix a TODO in the codebase`、`Allow once`、`Compact session`、`Fork session`
- 状态词极简：`Thinking` / `Thought: …` / `Delegating...` / `Writing command...` / `Retrying (attempt 2)`
- 元信息用 ` · ` 三点分隔：`▣ Build · anthropic/claude-sonnet-4-5 · 3.2s`
- hint 模式：`<key> <动词>`（key 用主题色，动词 textMuted）：`enter confirm`、`⇆ select`、`ctrl+x ↓ view subagents`
- 错误给人不给码：`Session not found: <id>`、`No assistant messages found`、重试显示原始 message 截断
- 空态靠 placeholder 示例教学而非说明文字

## 7. CLI 非交互模式（与 FAR-Lab 最直接可比）

`packages/opencode/src/cli/cmd/run.ts`（1016 行，文件头注释明示三模式设计）：

1. 非交互默认：单 prompt → 事件流 → session idle 即退出
2. `--mini` 本地交互（split-footer 直连模式，run/ 目录 40+ 文件）
3. `--mini --attach` 连接远程 server

**stdout/stderr 通道分离（关键架构决策）**：`packages/opencode/src/cli/ui.ts` 的 `print/println` 全部写 **stderr**；`--format json` 的 `emit()` 写 **stdout**（`JSON.stringify({type, timestamp, sessionID, ...data})` 逐行 NDJSON）。人读输出与机器输出物理分离，管道安全。

- JSON 事件类型：`tool_use / step_start / step_finish / text / reasoning / error`（emit 调用点，run.ts L679-872）
- 非 TTY 自动降级：isTTY 为 false 时去掉空行 padding 和 ANSI，直接 `stdout.write(text + EOL)`
- 人读格式（formatted 模式）：回合头 `> build · anthropic/claude-sonnet-4-5`；正文前后空行；思考 `Thinking: …` 用 dim+斜体 ANSI；工具行 `icon title dim-description`（`inline()`）；块级工具空行包裹（`block()`）；工具失败 `✗ Read failed`
- CLI 固定 ANSI 调色板（ui.ts Style）：highlight 96 青 / dim 90 / warning 93 / danger 91 / success 92 / info 94，各有 bold 变体——CLI 不加载完整主题系统，用 6 色语义最小集
- 前缀符号约定：`!` 危险/警告、`~` 信息、icon 开头正常行；`empty()` 去重连续空行
- 非交互权限策略：`--auto`? 则自动 once；否则打印 `! permission requested: bash (git push); auto-rejecting` 并自动拒绝——无 TTY 不阻塞
- 退出码：error 事件/失败 → exitCode 1
- `session list --format json` 等管理子命令同样有 json 输出（zread 3-cli-commands）

---

## 8. 可抄清单（对 FAR-Lab CLI：Node/TS，非交互优先 + --json 机器通道）

1. **stdout/stderr 通道分离** — 人读内容（进度、spinner 文本、工具行）全写 stderr；`--json` 时 stdout 只产 NDJSON 事件流 `{type, timestamp, runID, ...}`，事件类型枚举进协议。来源：`packages/opencode/src/cli/ui.ts`（print/println→stderr）+ `packages/opencode/src/cli/cmd/run.ts` L679-698（emit）。FAR-Lab 长程流水线可直接套用：phase/tool/hypothesis 事件化，非 TTY 管道天然安全。
2. **语义色 token 层 + 双模式** — 定义 FAR-Lab 自己的语义 token 集（error/warning/success/info/text/textMuted + 边框三级 + diff 14 色），不硬编码色号；CLI 侧用 opencode 的"6 色固定 ANSI + bold 变体"最小集（ui.ts Style），不引入主题引擎；`NO_COLOR`/非 TTY 自动剥 ANSI（run.ts isTTY 分支）。
3. **工具行两形态 + 状态色机** — 单行 `icon 摘要`（pending `~` / running spinner 或 `•` / done muted / failed 红 / denied 删除线）+ 块级卡片（左 `┃` 色条 + 标题 + 折叠正文 + `+N lines expand`）。icon 词汇表照抄：`✱ 检索 · → 读 · ← 写 · % 抓取 · ◈ 搜索 · ✓ ✗ │`。来源：session/index.tsx InlineToolRow/BlockTool + cli/cmd/run/tool.ts。FAR-Lab 的"证据检索/假设生成/反驳检验"每阶段可映射一个 icon+单行状态。
4. **子任务运行态镜像（Task 模式）** — 长程流水线的子阶段只显示一行 + `↳ 当前原子动作标题 · N toolcalls · 时长`，重试显示 `↳ Retrying (attempt N) · <截断错误>`，完成汇总 `↳ N toolcalls · 1m20s`，可跳转查看全程。来源：session/index.tsx Task 组件（L2230-2310 区域）。FAR-Lab 多阶段流水线每个 stage 就是一个 Task 行。
5. **思考降透明度而非换色 + 折叠头** — reasoning 用 0.6 opacity 同色系渲染 + 单行 `+ Thought: 摘要 · 时长` 折叠头。对 FAR-Lab：模型的中间推理/检索笔记默认折叠成一行摘要，保留可展开审计。来源：theme/index.ts `generateSubtleSyntax` + session/index.tsx ReasoningHeader。
6. **权限/确认三选项内联面板** — 非阻塞内联（不切全屏）、`△ 警示 + 类型化摘要（命令全文/diff/URL）+ Allow once / Always / Reject`、Reject 可附反馈文本；非交互模式自动策略并打印决策。来源：routes/session/permission.tsx + run.ts permission.asked 分支。FAR-Lab 对"高消耗动作/网络抓取/覆盖写入"直接套此模式。
7. **快捷键：leader 键 + 命名绑定表 + 描述内嵌** — 每个键位是 `(default, description)` 数据而非散落代码，leader 前缀收纳高频操作，未知 override 显式报错。FAR-Lab 若做交互模式照此建表。来源：config/keybind.ts。
8. **空态 placeholder 教学** — 无会话时输入框轮换 3 个真实任务示例文案。FAR-Lab CLI 首启/空态给 3 条真实科研流水线示例命令。来源：routes/home.tsx。

### 不建议抄

- Knight Rider 品牌 spinner（330 行，纯品牌装饰，FAR-Lab 用 braille 帧序列足够）
- 34 套社区主题（FAR-Lab 需要的是 1 套严谨语义色 + system 自动适配）
- 完整 SolidJS 响应式 TUI 栈（opentui 尚未验证成熟度/Windows 兼容，FAR-Lab 非交互优先，投入产出不成立）

---

## 证据文件索引（均为仓库内路径）

| 主题 | 文件 |
|---|---|
| 技术栈/依赖 | packages/tui/package.json |
| 主题系统 | packages/tui/src/theme/index.ts；theme/assets/opencode.json（34 套之一） |
| 边框 | packages/tui/src/ui/border.ts |
| Spinner | packages/tui/src/component/spinner.tsx；ui/spinner.ts |
| 布局/消息/工具/思考渲染 | packages/tui/src/routes/session/index.tsx（2718 行） |
| Footer | packages/tui/src/routes/session/footer.tsx |
| 空态首页 | packages/tui/src/routes/home.tsx |
| 权限 UI | packages/tui/src/routes/session/permission.tsx |
| 快捷键 | packages/tui/src/config/keybind.ts |
| 工具输出折叠 | packages/tui/src/util/collapse-tool-output.ts |
| CLI 人读输出/stderr | packages/opencode/src/cli/ui.ts |
| CLI run/--json/事件流 | packages/opencode/src/cli/cmd/run.ts |
| CLI 工具行 icon 映射 | packages/opencode/src/cli/cmd/run/tool.ts |

UNVERIFIED 项：`--mini` 交互模式内部实现（run/ 目录 40+ 文件未逐个读）；opentui 框架本身的成熟度与 Windows 终端兼容性（未实测）；34 主题的逐套配色只抽样了 opencode.json。
