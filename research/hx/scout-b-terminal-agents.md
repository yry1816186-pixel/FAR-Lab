# Scout B 报告:终端优先 AI Agent 交互层源码调研(FAR-Lab 交互终端模式)

- 日期:2026-08-23 | 方法:`mcp__zread__get_repo_structure` / `read_file` 直读 GitHub 源码 + WebSearch/WebFetch 验证许可证与 Windows 陷阱
- 调研对象:OpenCode (sst/opencode)、Gemini CLI (google-gemini/gemini-cli)、Codex CLI (openai/codex)、Aider (Aider-AI/aider)、OpenHands CLI (OpenHands/OpenHands-CLI)、Claude Code(闭源,仅社区逆向证据)
- 结论状态:源码引用均为 IMPLEMENTED 级证据(读到文件/依赖声明);Claude Code 内部实现标注为二手来源(官方 docs 本次网络不可达,UNVERIFIED)

---

## 1. License + TUI 栈总表

| 项目 | 语言/运行时 | TUI 技术栈 | License | 证据位置 |
|---|---|---|---|---|
| Gemini CLI | TypeScript, Node ≥20 | **React 19 + Ink 6 fork**(`"ink": "npm:@jrichman/ink@6.6.9"`,`react 19.2.4`)+ chalk/ansi-escapes/ink-spinner/highlight.js | Apache-2.0 | `packages/cli/package.json`;license 见 package.json `license` 字段 |
| OpenCode | TypeScript, **Bun 运行时** | **Solid.js + OpenTUI**(`@opentui/core`、`@opentui/solid`、`@opentui/keymap`,Zig 原生内核)+ effect;自带 `terminal-win32.ts`(bun:ffi 调 kernel32) | MIT | `packages/tui/package.json`;根 `LICENSE`(MIT, "opencode (2025)") |
| OpenTUI(OpenCode 的地基) | Zig 核心 + TS 绑定 | 独立渲染引擎(非 Ink 系),React/Solid 双 reconciler | MIT | github.com/anomalyco/opentui;`@opentui/core` npm 0.5.3(仍 0.x) |
| Codex CLI | Rust | **ratatui + crossterm**(features:`bracketed-paste`、`event-stream`;ratatui unstable features `scrolling-regions` 等)+ `windows-sys`/`syntect`/`pulldown-cmark` | Apache-2.0 | `codex-rs/tui/Cargo.toml`;根 `LICENSE`(Apache-2.0, Copyright 2025 OpenAI) |
| Aider | Python | **prompt_toolkit**(PromptSession/KeyBindings/FileHistory)+ **rich**(Console/Markdown/Live) | Apache-2.0 | `aider/io.py` imports;`LICENSE.txt` |
| OpenHands CLI | Python 3.12(严格 pin) | **Textual ≥8.0** + textual-autocomplete + textual-serve + rich + typer | MIT | `pyproject.toml`(WebFetch 原文);**README 明示 no longer actively maintained**,官方建议迁移 Agent Canvas |
| Claude Code | 闭源(分发) | 社区逆向:React + Ink,自定义 reconciler + 纯 TS Yoga 布局 | 不可复用代码,只可复用模式 | HN 讨论 + Medium "Claude Code Internals Part 11" + dev.to 逆向文章(多源一致,标 UNVERIFIED) |

**栈分布结论**:TypeScript 系里 Gemini CLI 用 Ink(React),OpenCode 用 OpenTUI(Solid);Rust 系 Codex 用 ratatui;Python 系 Aider 用 prompt_toolkit(行内式)、OpenHands 用 Textual(全屏 widget 式)。没有一家头部 TS agent 选择"纯手写 ANSI"作为主渲染层;行内式(prompt_toolkit/Inline Ink)与全屏式(alternate buffer)是两条真实并存路线。

---

## 2. 分能力模式表(谁做得最好、怎么做、源码路径)

### 2.1 交互式 Composer(多行输入 / 历史 / 附件 / 补全 / 快捷键)

| 子能力 | 最佳实践者 | 实现方式与源码 |
|---|---|---|
| 键盘模型 | **OpenCode** | `packages/tui/src/config/keybind.ts`:200+ 命令的声明式键位表(`Definitions` + `CommandMap`),默认值可被用户配置覆盖,`effect/Schema` 校验非法键名直接报错;leader 键默认 `ctrl+x`;`"none"` 即禁用。含完整编辑器键位(emacs 风格 + undo/redo + 词移动)与 which-key 提示面板(`feature-plugins/system/which-key.tsx`) |
| 自制 textarea | **Codex** | `codex-rs/tui/src/bottom_pane/textarea/`(自研文本区,含 IME 路径);`chat_composer/` 组合历史(`chat_composer_history/`)、命令弹窗(`command_popup.rs`)、文件搜索弹窗(`file_search_popup.rs`)、`@` 提及(`mentions_v2/`) |
| 粘贴鲁棒性 | **Codex** | `bottom_pane/paste_burst.rs`:无 bracketed-paste 终端(**主要是 Windows**)的粘贴检测状态机——8ms 字符间隔、≥3 字符成簇、120ms Enter 抑制窗(防粘贴中的回车触发提交)、Windows 专用 60ms idle 超时、ASCII 首字符 hold 防闪烁、非 ASCII(IME)不 hold、retro-capture 回抓已渲染前缀。纯状态机、不直接碰 UI,可直接移植 TS |
| 文件/@ 提及补全 | **Gemini CLI** | `ui/hooks/atCommandProcessor.ts` + `useAtCompletion.ts`(@文件/agent 提及)、`slashCommandProcessor.ts` + `useSlashCompletion.tsx`(斜杠命令)、`shell-completions/`(git/npm provider 的 shell 模式补全)、`useReverseSearchCompletion.tsx`(Ctrl+R 反向搜索)。多通道补全都收敛为 hook |
| 词法级补全 | Aider | `aider/io.py` `AutoCompleter`:文件名(相对/短名)+ pygments 提词(Token.Name)+ 命令专属补全;≥3 字符触发;`ThreadedCompleter` 防阻塞;`CompleteStyle.MULTI_COLUMN` |
| 外部编辑器 | Aider(最简)/ OpenCode | Aider:`io.py` Ctrl-X Ctrl-E → `aider/editor.py` `pipe_editor`(用 $EDITOR,写临时 .md);OpenCode:`<leader>e` + `src/editor.ts`/`editor-zed.ts`(支持 Zed 深链)。Codex 也有 `external_editor.rs` |
| 多行模式 | Aider / OpenCode | Aider:`io.py` Enter/Alt+Enter 语义随 `multiline_mode` 反转 + `{`/`tag}` 括号多行;OpenCode:keybind `input_newline = shift+return,ctrl+return,alt+return,ctrl+j` 与 `input_submit = return` 分离(不需要模式切换) |
| 输入历史 | 三家均有 | Aider:`prompt_toolkit.history.FileHistory` 持久化 + Ctrl-Up/Down;Gemini:`useInputHistory(Store).ts`;OpenCode:`component/prompt/history.tsx` + frecency(`prompt/frecency.tsx`,按使用频率+近因排序) |
| watch 模式 | Aider | `aider/watch.py` + `watch_prompts.py`:文件变更事件打断输入(`interrupt_input()` 保存半截输入为 placeholder)、自动以注释为 prompt 提交;`io.py` 的 clipboard_watcher 剪贴板监控 |

### 2.2 流式输出与 agent/工具活动渲染

| 子能力 | 最佳实践者 | 实现方式与源码 |
|---|---|---|
| 流式 markdown(行内式) | **Aider** | `aider/mdstream.py` `MarkdownStream`:已定稿行"上移"到 scrollback(`live.console.print`)+ 尾部 6 行 Live 窗口重绘;**自适应节流** `min(max(render_time*10, 1/20), 2)` 秒;`final=True` 全部定稿并停 Live。滚动缓冲区(scrollback/tmux/SSH)天然友好。约 150 行,TS 移植成本极低 |
| 双布局(全屏 vs 行内) | **Gemini CLI** | `ui/hooks/useAlternateBuffer.ts`:有能力且非读屏模式 → alternate buffer + 固定高布局 + `ScrollableList`(虚拟化 VirtualizedList,只渲染可见项);否则 inline 模式用 **Ink `<Static>`** 渲染不重绘历史。配置开关 `terminalBuffer`/`incrementalRendering`(settings 文档)。防闪烁:`useFlickerDetector.ts`、`useBatchedScroll.ts` |
| 状态/加载指示 | Gemini CLI | `GeminiRespondingSpinner.tsx` + `usePhraseCycler.tsx`(spinner 轮播当前动作短语)、`CliSpinner.tsx`、`StatusDisplay.tsx`/`StatusRow.tsx`、`LoadingIndicator.tsx`;工具统计 `ToolStatsDisplay.tsx`、上下文用量 `ContextUsageDisplay.tsx` |
| 流式事件→UI | Gemini CLI | `useGeminiStream.ts` / `useAgentStream.ts`(把 core 的异步事件流折叠为 UI 状态);`useToolScheduler.ts` 工具并发调度 |
| diff 渲染 | **Codex** | `diff_render.rs` + `diff_model.rs`(行级 diff 状态)、`get_git_diff.rs`、inline 可视化 `inline_visualization/`;Gemini 用 `diff` npm 包 + 组件;OpenCode:`feature-plugins/system/diff-viewer*.tsx`(文件树 + split/unified 切换 + hunk 跳转,键位在 keybind.ts diff_* 组) |
| 转录(transcript)与工具输出折叠 | OpenCode | `util/transcript.ts`、`collapse-tool-output.ts`、`tool-display.ts`、`renderer.ts`;Codex:`chatwidget/transcript.rs` + `transcript_reflow.rs` + `history_cell/` |
| resize 处理 | Codex | `resize_reflow_cap.rs` + `width.rs` + `wrapping.rs`(重排上限,防止巨大重绘);终端探测独立成 crate:`codex-rs/terminal-detection/` 与 `tui/src/terminal_probe/`;Gemini:`useTerminalSize.ts` |
| 安全缓冲(流式敏感内容) | Codex | `chatwidget/safety_buffering.rs`(避免把半截密钥/token 渲染出去) |
| 渲染测试 | 两家 | Codex:`vt100` crate(dev-dep)+ `insta` 快照测试 TUI 渲染;Gemini:`@xterm/headless`(dev-dep)+ vitest 快照(`ui/components/__snapshots__`)。**headless 终端模拟器做 UI 回归测试是两家共同模式** |

### 2.3 审批提示 / 权限模式

| 子能力 | 最佳实践者 | 实现方式与源码 |
|---|---|---|
| 权限策略与执行分离 | **Codex** | `codex-rs/execpolicy/`(Rust 确定性求值:allowlist、risk rating、per-profile `suggest`/`auto-edit`/`full-auto`);TUI 只是展示层:`bottom_pane/approval_overlay.rs`、`chatwidget/permission_popups.rs`、`permissions_menu.rs`、`pending_thread_approvals.rs`;Windows 沙箱专提示 `chatwidget/windows_sandbox_prompts.rs`。配置字段 `approval_policy`(zread Configuration Reference 证实) |
| 审批队列化 | **Gemini CLI** | `ToolConfirmationQueue.tsx`(多个待确认工具排队展示)+ `useConfirmingTool.ts` + `ApprovalModeIndicator.tsx`(当前审批模式常驻 footer);plan 模式退出确认 `ExitPlanModeDialog.tsx`;信任链:FolderTrustDialog / MultiFolderTrustDialog / PermissionsModifyTrustDialog |
| "don't ask again" 语义 | **Aider** | `io.py` `confirm_ask`:`(Y)es/(N)o/(A)ll/(S)kip all/(D)on't ask again` + `ConfirmGroup`(同组共享决定)+ `never_prompts` 集合(按 question+subject 记忆);`--yes`/`--dry-run` 全自动。这个交互词汇表是最完整的 |
| 权限求值在确定性代码 | OpenCode | core 侧 `packages/opencode/src/permission/`(`evaluate.ts`/`arity.ts`),TUI 侧只渲染 `routes/session/permission.tsx`,支持 `ctrl+f` 全屏展开审批详情(keybind `permission.prompt.fullscreen`) |
| 权限模式集(闭源参考) | Claude Code | 社区来源:default / acceptEdits / plan / bypassPermissions,Shift+Tab 循环(UNVERIFIED,官方文档本次不可达) |

### 2.4 会话/任务管理(resume / 后台 / 导出)

| 子能力 | 最佳实践者 | 实现方式与源码 |
|---|---|---|
| resume 选择器 | **Codex** | `tui/src/resume_picker/` + `resume_picker_transcript_preview.rs`(恢复前预览转录)+ `named_session_lookup.rs` + `session_resume.rs`;会话存储 `codex-rs/rollout/`(JSONL append-only)+ `thread-store/`;队列化继续输入 `session_queue_commands.rs`;后台:`app-server/` 守护进程 + exec server(`run_tui_with_exec_server.sh`) |
| 会话树/分叉 | **OpenCode** | `dialog-session-list.tsx`、`dialog-timeline.tsx`(消息级时间线)、`dialog-fork-from-timeline.tsx`(从任一消息分叉)、`dialog-move-session.tsx`(跨项目移动)、stash(`prompt/stash.ts`)、quick-switch `<leader>1..9`、subagent 导航(keybind `session_child_*`)、pin;存储 core 侧 sqlite(`storage/`) |
| 会话浏览/rewind | Gemini CLI | `SessionBrowser/` + `useSessionBrowser.ts` + `useSessionResume.ts`;`useRewind.ts` + `RewindViewer.tsx`(回到历史消息) |
| 历史即文件 | Aider | chat 历史直接追加 markdown(`.aider.chat.history.md`,`append_chat_history`,blockquote 记录工具/确认输出)——人可直接读;`/undo` `/resume` 在 `commands.py` |
| 同一 TUI 多端分发 | OpenHands CLI | `textual-serve`:`openhands web` 把同一 Textual 应用服务成浏览器版;`--headless` CI 模式;`--resume`。虽已停止维护,这个"一份 UI 多出口"思路值得借鉴 |

### 2.5 配置与主题

| 子能力 | 最佳实践者 | 实现方式与源码 |
|---|---|---|
| 主题资产化 | **OpenCode** | `packages/tui/src/theme/assets/*.json`:33 个主题(catppuccin/dracula/gruvbox/nord/tokyonight…)纯 JSON 数据 + `theme/index.ts` 加载 + `<leader>t` 弹 `dialog-theme-list.tsx`;light/dark 模式切换与锁定(`theme_switch_mode`/`theme_mode_lock` 键位) |
| 语义色层 | **Gemini CLI** | `ui/themes/semantic-tokens.ts` + `semantic-colors.ts`:组件只用语义 token,error/success 等映射到具体主题;`theme-manager.ts` + `themes/builtin/{dark,light}/` + `themes/builtin/no-color.ts`(无色主题是一等公民);`ThemeDialog.tsx` 终端内切换 |
| 终端调色板探测 | Codex | `tui/src/terminal_palette.rs` + `supports-color` + `terminal_probe/`;`theme_picker.rs`;config `theme` 字段(kebab-case) |
| 配置校验与降级 | Aider | `.aider.conf.yml` + `io.py` `_validate_color_settings()`(非法颜色重置并警告,不崩);`NO_COLOR` 环境变量全局关 pretty;`is_dumb_terminal()` 自动关 fancy input |

### 2.6 无障碍 / 降级 / 通知

- **Gemini CLI**:读屏模式强制 inline 布局(不用 alternate buffer,zread CLI Terminal UI Architecture 章节证实);`CopyModeWarning.tsx`(复制模式警示);no-color 主题。
- **Aider**:`is_dumb_terminal()` → 关 fancy input + pretty;`UnicodeEncodeError` 时 ASCII 替换输出;终端铃声 `\a` + 系统通知(按平台:macOS osascript/terminal-notifier、Linux notify-send/zenity、Windows PowerShell MessageBox,`io.py` `get_default_notification_command`)。
- **Codex**:config `alternate_screen: "never"` = inline 模式;`terminal_title.rs` 设置终端标题;`notifications/`。
- **Gemini CLI**:`useKittyKeyboardProtocol.ts`(kitty 键盘协议渐进增强)、`useMouse.ts`(鼠标可选)。

---

## 3. FAR-Lab 交互终端模式推荐架构

### 3.1 框架决策:Ink(React)+ 行内式为主、覆盖层为辅

**选 Ink,不选 OpenTUI、不选手写 ANSI、不考虑 blessed 系**:

1. **生产先例**:Gemini CLI(Apache-2.0,React 19 + Ink 6)与 Claude Code(Ink)证明 Ink 跑得动头部 agent;FAR-Lab 是 Node/TS + React 技术栈可复用团队心智。OpenTUI 仍 0.x、核心是 Zig 原生模块,且 OpenCode 的 TUI 绑定 Bun(`bun:ffi` 的 win32 守卫无法直接用于 Node),引入即引入原生编译链风险。
2. **Ink 的真实缺口有已知解法**:Gemini 团队 fork 了 Ink(`@jrichman/ink@6.6.9`)说明上游对 agent 级需求(虚拟化滚动/闪烁)有缺口——落地时应预期少量补丁或采用其 fork 思路(自制 VirtualizedList、useFlickerDetector)。
3. **手写 ANSI 不划算**:六家里没有一家这么选;粘贴检测、resize、宽字符、读屏降级全是坑,库已解决大半。
4. **依赖红线对齐**:FAR-Lab Node 产品运行时仅 zod——TUI 属于 human-interaction 前端层,应独立成包(如 `packages/tui`),React/Ink 只进该包,不污染 core(--json 路径零新增依赖)。这是 Gemini CLI `packages/cli`(UI)与 `packages/core`(逻辑)分仓结构的直接复制。
5. **行内式(inline + `<Static>`)为默认,alternate buffer 仅用于可选全屏视图**:scrollback/tmux/SSH/读屏全兼容;Gemini CLI 双布局(`useAlternateBuffer`)证明这是可切换的运行时决策而非架构决策。

### 3.2 分层架构(全部有源码先例)

```
farlab-core (zod-only, 无 UI 依赖)
  └─ 事件流: session events → 确定性 reducer
farlab-tui (独立包: react + ink + zod)
  ├─ 壳: App.tsx(Ink render, alternateBuffer 探测失败/读屏 → inline)
  ├─ 历史区: <Static>(定稿消息,永不重绘)
  ├─ 活动区: spinner + 当前工具卡(tool call/status/diff 摘要)
  ├─ composer: 自制 textarea(见下)
  ├─ 审批队列: y/n/a/s/d + don't-ask-again + 权限模式指示
  └─ 降级链: !isTTY/rawMode 不支持 → readline 行式(绝不能崩)
farlab-cli-json (现有 --json 自动化, 与 TUI 共享 core 事件流)
```

1. **composer**:Enter=提交、Shift/Ctrl/Alt+Enter=换行(OpenCode 的无模式方案,优于 aider 的模式切换);bracketed paste(默认请求)+ **paste-burst 状态机兜底**(移植 Codex `paste_burst.rs`:8ms/3字符/120ms Enter 抑制/Windows 放宽 60ms/IME 不 hold 首字符);`$EDITOR` 外部编辑(aider `pipe_editor` 模式);输入历史持久化文件 + frecency 排序(OpenCode)。
2. **流式渲染**:Aider `mdstream.py` 算法——定稿行上移 + 尾窗 Live + 自适应节流(把 rich Live 换成 Ink 活动区);FAR-Lab 的假说/证据/反证流天然是多块结构,块级定稿即上移。
3. **权限/审批**:求值放确定性代码(Codex execpolicy / OpenCode `permission/evaluate.ts` 同构,FAR-Lab 已有此纪律),UI 只做队列 + 词汇表 y/n/a/s/d + never-prompts 持久化;常驻 footer 显示当前模式(Gemini `ApprovalModeIndicator`)。
4. **键位**:OpenCode 式声明式键位表(zod schema 校验)+ 用户覆盖;斜杠命令注册表与 `--json` 命令共享同一定义源。
5. **主题**:语义 token 层(Gemini)→ JSON 主题资产(OpenCode 33 主题格式可直接兼容)→ no-color 主题一等公民。
6. **测试**:headless 终端模拟器快照(`@xterm/headless` + vitest,即 Gemini CLI 的做法)。

### 3.3 Windows/Git Bash 现实核对(决策依据)

- 用户环境是 Git Bash(mintty):mintty 不给 Node 暴露 Windows console,`stdin.setRawMode()` 直接抛错(Ink issue #378;microsoft/inshellisense#58 就是 Git Bash 复现;Claude Code #404/#5925 同类崩溃)。**FAR-Lab 必须在启动时检测并降级为行式 readline,或提示 `winpty`/Windows Terminal**——这决定"降级链是架构必需而非附加项"。
- Windows Ctrl+C:OpenCode 为让 Ctrl+C 作为输入事件到达,专门用 FFI 清 `ENABLE_PROCESSED_INPUT` 并周期性 enforce(`packages/tui/src/terminal-win32.ts`)——Node 下同样问题存在,Ink 的 `exitOnCtrlC` + 自定义处理需实测 Git Bash 行为。
- resize:Ink issue #153(resize 事件缺失需手动 repaint);conPTY 管道下 `stdout.columns` 可能为 0 → 需 fallback(80)。Gemini `useTerminalSize` + Codex `resize_reflow_cap` 都是应对此问题的实测产物。

---

## 4. Top-5 采纳/抽取候选(license 全部兼容)

| # | 候选 | 来源与 license | 抽取物 | 成本/风险 |
|---|---|---|---|---|
| 1 | **Gemini CLI 架构模板** | google-gemini/gemini-cli,Apache-2.0 | `packages/cli`(`interactiveCli.tsx` / `nonInteractiveCli.ts` 双前端共享 core;`ui/hooks/` 100+ hooks 命名即规格;`ui/components/` 组件清单;themes 双层结构) | 0(参考实现,同栈同许可) |
| 2 | **Aider `mdstream.py` 流式算法** | Aider-AI/aider,Apache-2.0 | stable-行上移 + live 尾窗 + 自适应节流;~150 行 Python → TS 移植 | 低;需配 Ink 活动区而非 rich Live |
| 3 | **Codex `paste_burst.rs` 状态机** | openai/codex,Apache-2.0 | Windows/无 bracketed-paste 终端的粘贴检测;纯状态机 + 完整测试用例(`mod tests`)可直译 TS | 低;注意保留 Windows 60ms 与 IME no-hold 语义 |
| 4 | **Aider `io.py` InputOutput 抽象** | Aider-AI/aider,Apache-2.0 | 单一 IO 门面:pretty/NO_COLOR/dumb-terminal 降级、颜色校验、`confirm_ask` + `ConfirmGroup` + never-prompts、外部编辑器、系统通知(三平台命令表)、UnicodeEncodeError 兜底 | 低;设计模式整体照搬,代码逐段重写为 TS |
| 5 | **OpenCode keybind 表 + 主题 JSON** | sst/opencode,MIT | `config/keybind.ts` 声明式键位 schema(直接参考其 effect Schema → 改 zod);`theme/assets/*.json` 33 主题数据文件格式与资产 | 低;注意其实现依赖 @opentui,只取数据/接口设计 |
| 6(备选) | OpenHands-CLI 多出口思路 | OpenHands/OpenHands-CLI,MIT,已停维护 | textual-serve"同一 TUI 服务到浏览器" + `--headless` CI 模式 | 仅借鉴模式;**仓库本身已停维护,不建议依赖** |

---

## 5. 陷阱清单(Windows conPTY / resize / IME / 读屏)

1. **Git Bash/mintty raw mode 失败**:`setRawMode` 抛 "Raw mode is not supported"(Ink #378;inshellisense #58 在 Git Bash 直接复现)。缓解:启动检测 `process.stdin.isTTY` + try rawMode → 失败降级 readline 行式;提示用户用 Windows Terminal 或 `winpty`;mintty 有 `ConPTY=` 开关。
2. **Windows Ctrl+C 不到 stdin**:console 模式 `ENABLE_PROCESSED_INPUT` 使 Ctrl+C 变 CTRL_C_EVENT;OpenCode 需 FFI 清位 + 100ms 轮询 re-enforce(模式是 console 全局而非 per-process)。Node 侧至少要自定义 ctrl+c 处理与双击退出语义,并在 Git Bash 实测。
3. **bracketed paste 不可靠**:Codex 专门写了 paste-burst 启发式(Windows 下 paste 以高速字符流到达,含 Enter);且 Windows 下 idle 阈值放宽到 60ms。IME/非 ASCII 输入绝不 hold 首字符(感觉像丢输入)。
4. **resize 事件缺失/延迟**:Ink #153;conPTY 下 `columns=0`;tmux/SSH 嵌套下尺寸变化传播不稳定。缓解:`useTerminalSize` 模式 + 轮询兜底 + Codex 式 reflow 上限防大重绘。
5. **alternate buffer 丢 scrollback**:全屏 TUI 的输出不进滚动缓冲;SSH/tmux 用户、复制粘贴工作流受损;读屏器(screen reader)对全屏重绘不友好。Gemini 的结论:读屏模式强制 inline;默认 inline + `<Static>` 是最安全默认。
6. **NO_COLOR / dumb terminal / 非 TTY**:必须支持 `NO_COLOR`(aider 实践)、`TERM=dumb` 自动降级(fancy_input=False)、CI/管道下不进 TUI(Claude Code 在非 TTY stdin 下崩溃的 issue #404/#5925 是反面教材)。`--json` 模式与 TUI 模式的入口分离可彻底规避。
7. **宽字符/emoji/CJK 与 ANSI 截断**:需要 `string-width`/`unicode-segmentation` 类宽度计算(Gemini 依赖 string-width,Codex 依赖 unicode-width + unicode-segmentation);中文用户(FAR-Lab 现实)输入含 CJK,行宽截断与光标列计算必须按显示宽度而非字符数。
8. **kitty 键盘协议/鼠标**:渐进增强,探测失败必须无声降级(Gemini `useKittyKeyboardProtocol`/`useMouse` 的存在即证明终端能力差异是大面积现实)。
9. **Ink 上游维护风险**:Gemini 团队维护了自己的 fork(`@jrichman/ink`);采用 Ink 要预留 patch/fork 能力,并锁定 react 版本(React 19)。
10. **Bun-only 生态陷阱**:OpenCode TUI 代码大量依赖 Bun API(`bun:ffi` 等),**不可直接复制进 Node 项目**——只可参考设计与 MIT 授权的纯逻辑部分。

---

## 6. 关键来源

源码(zread 直读):sst/opencode `packages/tui/{package.json, src/terminal-win32.ts, src/config/keybind.ts, src/theme/assets/}`、`packages/opencode/src/{cli/, permission/, storage/}`;google-gemini/gemini-cli `packages/cli/package.json`、`packages/cli/src/ui/{components/, hooks/, themes/, editors/}`;openai/codex `codex-rs/tui/{Cargo.toml, src/bottom_pane/paste_burst.rs, src/chatwidget/, src/…}`、根 LICENSE;Aider-AI/aider `aider/{io.py, mdstream.py}`、LICENSE.txt;OpenHands/OpenHands-CLI pyproject.toml + README(WebFetch)。

Web 验证:OpenTUI(anomalyco/opentui,MIT,Zig 核心,0.5.3)、Claude Code=React+Ink(HN 46902411、Medium internals Part 11、dev.to 逆向,UNVERIFIED 二手)、Ink Windows 陷阱(ink #378、#153;inshellisense #58;claude-code #404/#5925;mintty ConPTY 文档;node-pty conPTY 说明)、OpenHands-CLI 停维护声明、aider Apache-2.0 LICENSE.txt。
