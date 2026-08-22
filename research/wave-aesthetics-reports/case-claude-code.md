# 案例研究：Claude Code（@anthropic-ai/claude-code）CLI/TUI 设计

- 调查日期：2026-08-22
- 方法：官方文档（code.claude.com/docs，docs.anthropic.com 已 301 迁移至此）+ npm 包一手解包分析 + 本地真实运行（--help / -p 错误路径 / 退出码实测）+ 社区拆解文章交叉验证
- 版本锚点：npm latest `2.1.239`（原生二进制分发，323MB，`bin/claude.exe`，`engines.node>=22`，无 dependencies）；解包分析用 `1.0.110`（36MB tarball，`cli.js` 9.3MB 单文件 bundle + `yoga.wasm` 88KB）
- 定位：终端编码 agent 事实标杆，Anthropic 官方出品，闭源 npm 包

---

## 0. TLDR

Claude Code 的 TUI 本质是**"React 组件树 → 终端"的声明式渲染**（Ink 起家、深度魔改），视觉上是**极简符号系统 + 语义色 token + 三层色深降级 + 平台自适应字形降级**，交互核心是**流式转写 + 分层可展开（Ctrl+O 进 verbose）+ 权限确认即界面**，CLI 侧用**同一进程双模式**（REPL / `-p` print）+ `--output-format json|stream-json` 结构化通道 + 稳定 result 信封（`subtype` + `is_error` + metering 字段）。所有关键结论均有一手 bundle 证据或官方文档出处。

## 1. 交互体验特征（官方文档核验）

### 1.1 消息块与符号系统

- 默认渲染是**流式转写式（scrollback-style）**：输出直接追加进终端回滚区，用户可正常滚动/复制/搜索，不用备选屏（classic 模式）；备选屏 fullscreen 是可选项，含同步输出（DECSET 2025）探测防闪烁（来源：https://code.claude.com/docs/en/fullscreen 及 terminal-config.md "Rendering modes" 节）
- 圆角边框 `╭─╮ ╰─╯`：一手 bundle 证据（Ink round 边框预设原样出现在 cli.js）：

  ```
  round:{topLeft:"╭",top:"─",topRight:"╮",right:"│",bottomRight:"╯",bottom:"─",bottomLeft:"╰",left:"│"}
  ```
- 符号 ⏺/● **按平台降级**（cli.js 原文）：`var oM=aA.platform==="darwin"?"⏺":"●"` —— macOS 用 U+23FA，其他平台用兼容性更好的 U+25CF 实心圆。⏺ 前缀 assistant 消息/工具调用行，○/⏘ 前缀用户消息（1.0.110 版代际；现版文档将用户消息符号记为 ⏘/○）
- 品牌符 `✻`（Claude 星标）：出现在欢迎语（`"✻ Welcome to "` bold + "Claude Code"）和思考态 `✻ Thinking…`（italic + secondaryText 色），渲染用自定义主题色 `color:"claude"`
- spinner 帧（cli.js 原文，两套平台降级）：`return["·","✢","✳","✶","✻","*"]`（非 stty 兜底），darwin 用 `["·","✢","✳","✶",...]`；社区逐帧逆向见 https://medium.com/@kyletmartinez/reverse-engineering-claudes-ascii-spinner-animation-eec2804626e0 与 https://blog.alexbeals.com/posts/claude-codes-thinking-animation
- 思考态动词随机化增加"生命感"（bundle 证据）：`Musing / Pondering / Herding / Vibing / Thinking…`

### 1.2 快捷键与 verbose 分层（官方 interactive-mode.md 全表）

| 键 | 行为 |
|---|---|
| `Ctrl+O` | **切换 verbose 模式，内联展开完整对账（rollout）**：LLM 原始输出、全量命令输出、逐文件完整 diff（"view the complete outputs and diffs for all files"） |
| `Ctrl+E` | 打开最近一次对话的外部编辑器（$EDITOR），保存即作为下一条 prompt |
| `Ctrl+R` | 展开完整转写（tool 结果原文、全量 diff），再按折叠 |
| `Ctrl+T` | 切换 todo 列表显示（任务分解/长任务进度感的官方载体） |
| `Ctrl+B` | 切换后台 shell 输出显示 |
| Tab | 模式循环：normal → auto-accept edits → plan mode |
| Shift+Tab（反向） | 同上反向 |
| Esc | 中断当前流式生成/工具执行；连按 Esc 两下回退到之前消息 |
| Esc Esc（编辑器中） | 编辑历史上一条消息 |
| `!` | 进入 bash 直通模式，`#` 前缀压缩为内存 |
| `#` | 初始化/压缩内存 |
| `/` | 斜杠命令；`@` 引用文件/目录；`!`+bash；四种输入模式（默认 bash 直通/记忆/粘贴图片）由提示行按键循环 |
| 双击 Tab | 插入文件路径补全（交互中插 `tabtab`，shell 补全另有 `claude install-completion`） |
| `Alt+方向键`/`Alt+.` | 遍历 prompt 历史 |

- 底部提示行（bundle 证据 + 文档）：`("? for shortcuts")`、"esc to interrupt"（`dimColor` 渲染）、"(tab to auto-accept)" 等，全部暗淡色、只占一行、随模式变化
- 粘贴折叠（terminal-config.md）：>800 字符或 >2 行的粘贴自动折叠为 `[Pasted text #1 +120 lines]` 占位符，Ctrl+E 展开原文

### 1.3 长任务呈现

- **工具调用一行摘要 + 可展开详情**：`⏺ Tool(args)` 粗体工具名 + 暗淡参数（如 `Read(file)`、`Bash(cmd)`、`Update(file)`），流式进行中 spinner+动词，完成后定格为一行；Ctrl+O/Ctrl+R 才展开原始输入输出。工具结果 "will be truncated by default"（interactive-mode.md FAQ，防刷屏）
- **多步骤进度感 = todo 列表**（Ctrl+T 持续显示，勾选推进），而不是进度条百分比——契合本 workspace "不发明百分比" 原则
- **metering 收口**：每个 result 信封带 `duration_ms / duration_api_ms / num_turns / usage`（input/output/cache token 数、cost_usd 等在 usage 字段），文档见 headless.md "JSON output fields"
- 后台 shell：`Ctrl+B` 才显示输出，前台不打扰

### 1.4 权限/确认 UI（bundle + 文档双证）

- 权限选项文案（cli.js 中各出现 5 次）：
  - `Yes, and don't ask again`（本会话/规则持久化）
  - `No, and tell Claude what to do differently`
  - 另有 `Yes, allow once` / `Yes, and auto-accept edits in the future` 变体（编辑类）
- 呈现方式：上下键选单（Ink Select 类组件），bash/危险命令以 `bashBorder` 专用色边框整块框住命令原文再问询；主题有独立 `permission` 语义色
- 模式切换即 UI 切换：Tab 切 normal/auto-accept/plan，auto-accept 有专属 `autoAccept` 色（紫）；plan 模式只读、Ctrl+Enter 提交计划
- `/permissions` 斜杠命令可视化管理 allow/deny/ask 规则；非交互用 `--allowedTools "Bash(git:*) Edit"` 粒度预授权（--help 实测原文）
- `--dangerously-skip-permissions` 官方措辞自带警告："Bypass all permission checks. Recommended only for sandboxes with no internet access."

## 2. 视觉系统（一手 bundle 证据为主）

### 2.1 主题 = 语义 token，且按色深三档降级

cli.js 中每个主题存在**同名三份**：truecolor `rgb(...)` 版、16 色 ANSI hex 版（`#cd00cd` 一类）、以及色觉无障碍变体。核心 token（1.0.110 dark truecolor 原文）：

```
claude:"rgb(255,153,51)"            // 品牌珊瑚橙（Anthropic 官方品牌色的终端近似）
claudeShimmer:"rgb(255,183,101)"    // 品牌色高光（shimmer 动画用）
autoAccept:"rgb(135,0,255)"         // 自动接受模式紫
bashBorder:"rgb(0,102,204)"         // bash 命令框蓝
permission:"rgb(51,102,255)"        // 权限确认蓝
planMode:"rgb(51,102,102)"          // 计划模式青灰
ide:"rgb(...)"; secondaryBorder:...; text:...; inverseText:...
diffAdded / diffRemoved             // diff 绿/红（各 33 处引用）
red/blue/green/yellow/purple/orange/pink/cyan_FOR_SUBAGENTS_ONLY  // 8 个子代理专用区分色
```

- 16 色降级版同 token 全部换成 ANSI hex（如 `claude:"#cdcd00"`、`permission:"#5c5cff"`），保证老终端语义不丢
- 文档主题清单（terminal-config.md）：`dark / dark-daltonized / dark-protanopia-and-deuteranopia / light / light-daltonized / light-protanopia-and-deuteranopia`，`/theme` 或 `claude config set -g theme dark` 设置；bundle 中亦见 `dark`、`dark-daltonized`、`light`、`light-daltonized` 名称
- 明暗策略：正文默认前景色；元信息一律 `dimColor`（"to interrupt"、参数、hint）；强调用 bold（工具名、关键数字）；`secondaryText` 188 处引用是第二高频色 token，`"claude"` 46 处、`permission` 94 处、`"error"` 516 处
- 边框：圆角 `round` 为主（欢迎框、确认框），bash 命令框用专用色直角/圆角混用；分隔靠空行与缩进（`paddingLeft:2`）多于横线
- 表格/列表：斜杠命令面板、/permissions、状态面板均为 Ink Box flex 布局的两列/三列文本表，无 ASCII 制表线表格

### 2.2 渲染细节（社区拆解 + GitHub issue 佐证）

- CJK 双宽字符、emoji 序列、内嵌 ANSI 转义在文本渲染层专门处理（https://claude-code-from-source.com/ch13-terminal-ui/）
- spinner 字形在部分终端（Ghostty）存在双宽/垂直居中兼容性问题（https://github.com/ghostty-org/ghostty/discussions/12692、https://github.com/dakra/ghostel/issues/142）——符号系统的代价实证
- 曾长期闪烁，靠同步输出（DECSET 2025）+ 重绘策略修复（https://news.ycombinator.com/item?id=46699072，Anthropic 员工参与讨论）

## 3. CLI 侧（非交互，实测 + 文档）

### 3.1 双模式同进程（--help 实测原文）

- 默认进入 REPL；`-p, --print` "Print response and exit (useful for pipes)"，且明确 "-p 模式跳过 workspace trust 对话框，只在信任目录用"
- `--output-format <format>`：`text`（默认）/ `json`（单 result 信封）/ `stream-json`（NDJSON 实时流）；仅 `-p` 下有效
- `--input-format stream-json`：stdin 也是 NDJSON 流（双向流式，供 SDK/编排器驱动）；`--include-partial-messages` 输出 token 级增量（`stream_event` 事件透传 API SSE）
- `--permission-mode <mode>`：`acceptEdits / bypassPermissions / default / plan` 四态
- `--fallback-model`：过载自动降级模型（仅 print 模式）——长任务无人值守的韧性设计

### 3.2 result 信封与退出码（本机 1.0.110 实测，网络被 483 拦截恰好测到错误路径）

- json 模式 API 出错时的真实输出（原文截取）：

  ```json
  {"type":"result","subtype":"success","is_error":true,"duration_ms":970,"duration_api_ms":0,"num_turns":3,"result":"API Error: 483 <!DOCTYPE html>..."}
  ```

  **注意 `subtype:"success"`（CLI 运行本身成功完成）+ `is_error:true`（业务失败）分离设计**；错误原文不吞不美化，直接进 `result` 字段
- 文档定义 subtype 全集：`success / error_max_turns / error_during_execution`（headless.md）
- 退出码实测：text 出错=1、json 出错=1、`-p` 无输入=1（stderr 明确报 "Input must be provided either through stdin or as a prompt argument when using --print"）；正常=0
- stream-json 事件序（headless.md + sdk.mjs 证据）：`system(init)` → 交替 `assistant` / `user(tool_result)` → `result`；tool_use 的 `input_json_delta` 增量流式
- **非交互模式的"进度"**：text 模式 -p 默认**无 spinner 无进度**（静默直到结果，可用 --verbose 打印完整日志）；结构化进度走 stream-json 通道（每条 assistant/tool_use 事件即进度）。这是"人看 TUI、机器看 stream-json"的双轨哲学

## 4. Ink 实现的可核验证据

1. **npm 包一手证据（1.0.110 解包）**：`cli.js` 中 `ink-root`/`ink-box`/`ink-text`（Ink 内部 DOM 类名）共 18 处；`Ink` 标识 3 处；`yoga.wasm` 88KB 随包分发（Ink 的 flexbox 布局引擎）；"ink" 字符串 131 处
2. **React createElement 满屏**：`S8.default.createElement(y,{flexDirection:"column"},...)` 等（y=Box 组件），Ink 的 `createElement(O,{color:"claude"},"✻ ")` 直接可见
3. **社区拆解交叉验证**：
   - "Claude Code started with Ink, then forked it beyond recognition"（https://claude-code-from-source.com/ch13-terminal-ui/）
   - "isn't raw escape codes... built with React and Ink"（https://kotrotsos.medium.com/claude-code-internals-part-11-terminal-ui-542fe17db016）
   - 泄露 source map 还原出完整技术栈 Bun + React/Ink + Zod + Commander（https://www.facebook.com/0xSojalSec/posts/... 、恢复源码 https://github.com/chauncygu/collection-claude-code-source-code）
   - 自研 25+ 组件（REPL/Select/PromptInput/Spinner）的复刻实践（https://dev.to/minnzen/i-studied-claude-codes-leaked-source-and-built-a-terminal-ui-toolkit-from-it-4poh）
4. **Anthropic 官方间接承认**：HN "Claude Chill" 讨论（https://news.ycombinator.com/item?id=46699072）中官方人员称 "We originally built Claude Code on Ink"
5. **版本演进注**：`2.x` 起 npm 包改为原生二进制分发（本机实测 2.1.239 仅含 `bin/claude.exe` + install.cjs，无 JS bundle），Ink 证据须查 1.x 存档包

## 5. 可抄清单（对 FAR-Lab CLI 的映射）

FAR-Lab 场景：Node/TS、交互非必需、长程多阶段科学流水线、需 --json 通道。

1. **`⏺ Tool(args)` 一行摘要 + Ctrl+O/Ctrl+R 分层展开**：流水线每阶段（检索/假设生成/证伪/排序）默认只打一行粗体阶段名+关键参数，verbose 键内联展开完整证据原文——长任务不刷屏但细节零丢失
2. **result 信封 schema 直接照抄**：`{type:"result", subtype:"success|error_max_turns|error_during_execution", is_error, duration_ms, duration_api_ms, num_turns, result, session_id, usage}` + 错误原文进 result + 稳定退出码——FAR-Lab 的 --json 通道、CI、断点续跑全部受益；`subtype`（执行形态）与 `is_error`（业务成败）分离是好设计
3. **语义色 token + 三档色深降级 + 无障碍变体**：定义 `farlab/secondaryText/permission/planMode/diffAdded/diffRemoved` 级别 token；truecolor→256→16 三份实现；科学结论不确定性用独立 `uncertainty` 色（比 Claude Code 更贴科研语义）
4. **平台自适应字形降级**：`darwin?"⏺":"●"` 模式——FAR-Lab 符号系统（阶段标记、证据/反证据标记）每符号配 ASCII 兜底（`*` `o` `!` `?`），NO_COLOR/哑终端自动降级，规避 Ghostty 类双宽字形坑
5. **进度 = todo 阶段清单而非百分比**：`Ctrl+T` 式常驻阶段列表（勾选推进）+ spinner 用动词短语（"检索文献…" "生成假设…"）而非百分比——科学流水线阶段时长不可预估，百分比必然造假
6. **双模式单二进制 + 双向 stream-json**：交互 TUI 与 `-p` 无头模式同一入口；FAR-Lab 流水线可用 `--input-format stream-json` 接上游编排器、`--output-format stream-json` 供下游增量消费，每阶段完成即发事件
7. **权限确认即产品**：危险操作（删证据、改 .control/、外部 API 花钱）用带色边框框住操作原文 + "允许一次/本运行总是/拒绝并说明" 三选项 + `--allowed-tools "Bash(git:*)"` 式规则预授权 + `--permission-mode` 四态
8. **粘贴折叠 + dimColor 提示行**：长输入折叠为 `[Pasted #1 +N lines]`；底部一行暗淡 hint（"? 查看快捷键" / "esc 中断" / "tab 切模式"）随模式变——低成本高密度的终端礼仪

## 6. 未尽事项 / UNVERIFIED

- 2.x 原生二进制内部的渲染层是否仍为 Ink 系（无 JS bundle 可 grep，仅社区恢复源码侧证）——UNVERIFIED
- 现版用户消息符号 ⏘/○ 的精确选用逻辑（文档代际差异，1.0.110 bundle 中只见 ⏺/●/○/◯ 字形）——部分 UNVERIFIED
- token/cost 的 TUI 内呈现样式（/cost 输出格式）未逐字核验——UNVERIFIED（信封字段已一手核验）

## 来源清单

官方文档（均经 301 迁移至 code.claude.com，2026-08-22 抓取）：
- https://code.claude.com/docs/en/cli-reference（CLI 标志全表）
- https://code.claude.com/docs/en/interactive-mode（快捷键/斜杠命令/输入模式全表）
- https://code.claude.com/docs/en/terminal-config（主题清单/粘贴折叠/终端探测）
- https://code.claude.com/docs/en/headless（result 信封/subtype/stream-json 事件序/退出码）
- https://code.claude.com/docs/en/fullscreen（渲染模式/同步输出）
- npm：`npm view @anthropic-ai/claude-code`（2.1.239 元数据）；1.0.110 tarball 解包（一手）

一手实测（本机 win32，Node v24.14.0，2026-08-22）：
- `node cli.js --help`（全标志表）、`--version`
- `node cli.js -p "hello"`（text/json 两模式错误路径输出原文）、三场景退出码实测（1/1/1）
- bundle grep：ink-root/ink-box/ink-text、round 边框字面量、`darwin?"⏺":"●"`、spinner 帧、主题 token（claude rgb(255,153,51) 等）、权限选项文案、"✻ Thinking…"

社区拆解（交叉验证）：
- https://claude-code-from-source.com/ch13-terminal-ui/
- https://kotrotsos.medium.com/claude-code-internals-part-11-terminal-ui-542fe17db016
- https://dev.to/minnzen/i-studied-claude-codes-leaked-source-and-built-a-terminal-ui-toolkit-from-it-4poh
- https://medium.com/@kyletmartinez/reverse-engineering-claudes-ascii-spinner-animation-eec2804626e0
- https://blog.alexbeals.com/posts/claude-codes-thinking-animation
- https://github.com/chauncygu/collection-claude-code-source-code（泄露 source map 恢复档）
- https://news.ycombinator.com/item?id=46699072（官方人员承认 Ink 起家）
- https://github.com/ghostty-org/ghostty/discussions/12692（spinner 字形兼容性）
