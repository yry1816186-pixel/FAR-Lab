# 开源 CLI/TUI 案例源码级研究：OpenROAD / PyHessian / Hermes + 补充案例

- 日期：2026-08-22
- 方法：zread 直读 GitHub 仓库源码（get_repo_structure / read_file / search_doc）+ WebFetch 抓 raw.githubusercontent.com。每条结论附仓库文件路径；读不到的标 UNVERIFIED。
- 用途：FAR-Lab（Node/TypeScript，Web React 工作台 + 手写 CLI）的 CLI 输出设计借鉴。所有"可抄元素"均给出处。

---

## 1. OpenROAD（The-OpenROAD-Project/OpenROAD，C++ EDA）

### 1.1 CLI 形态：TCL shell + linenoise REPL

- 可执行入口 `src/Main.cc`：`Tcl_Main(1, argv, ord::tclAppInit)` 起 TCL shell；交互模式进入 linenoise REPL（`tclOrdReplInit` → `::tclreadline::Loop`，见 `src/Main.cc` 中 `tcl_readline_setup.cc` 的注释 "linenoise-backed REPL"）。即：**无独立子命令 CLI，一切功能是 TCL 命令**（`detailed_route`、`read_db` 等），批处理用 `openroad -exit cmd_file.tcl`。
- 命令行旗标（`src/Main.cc::showUsage`，原文 printf）：`-help/-version/-no_init/-no_splash/-exit/-gui/-web/-threads count|max/-log file_name/-metrics file_name/-db/-no_settings/-minimize/-python`。
- Splash banner（`src/Main.cc::showSplash`）不走 printf，走 `logger->report(...)` 四行：版本+git describe、特性矩阵 `Features included (+) or not (-): +GPU +GUI +Python`、两行 license 声明。`-no_splash` 可关。

### 1.2 日志系统：自写 `utl::Logger` 包 spdlog（确认，非猜测）

- `src/utl/src/Logger.cpp` 构造函数直接证据：sinks = `spdlog::sinks::stdout_color_sink_mt` + 可选 `basic_file_sink_mt`（`-log`），格式化用 `spdlog::pattern_formatter`。另有独立 JSON metrics sink（`-metrics`）与可选 Prometheus 端点（`startPrometheusEndpoint`）。
- **消息格式**（`src/utl/include/utl/Logger.h::log()` 模板）：`[{} {}-{:04d}] {message}` → `[LEVEL TOOL-NNNN] message`。spdlog pattern_ = `"%v"`（仅消息本体，无时间戳），级别+模块+编号全部内嵌在消息前缀。
- 实际输出样例（测试 golden 文件，逐字）：
  - `src/utl/test/test_info.ok`：`[INFO ANT-0044] Arbitrary error message`
  - `src/utl/test/test_error.ok`：`[ERROR CTS-0099] Arbitrary CTS error message`（第二行 `CTS-0099` 是 error 抛出的 runtime_error 文本）
- ToolId 是枚举（`src/utl/include/utl/Logger.h` FOREACH_TOOL）：38 个三字母缩写（ANT/CTS/DRT/GRT/ORD/UTL/...）。**每条消息有稳定唯一编号** `(TOOL, id)`，构建系统在编译期强制 (MODULE, NUMBER) → 消息一一对应（zread 开发者指南页 29-developer-guide-for-new-modules 摘录，源出 `src/exa` 模板）。
- 级别名（`Logger.h::level_names`）：`TRACE/DEBUG/INFO/WARNING/ERROR/CRITICAL/OFF`。

### 1.3 可靠性细节（这是 OpenROAD 最值得抄的部分）

- **消息限流**：`max_message_print = 1000`，同一 (tool,id) 消息打印满 1000 条后输出一条 `[ORD-0030] message limit (1000) reached. This message will no longer print.`（`Logger.h::log()`）；TCL 侧可 `suppress_message/unsuppress_message`（`LoggerCommon.cpp`）。计数矩阵 `std::array<std::atomic_int16_t, 10000>`，无锁多线程安全。
- **error ≠ 打印**：`error()` 打印后 `throw std::runtime_error("ORD-0051")`，由 swig/TCL 捕获决定退出码；`critical()` 打印后直接 `exit(EXIT_FAILURE)`（`Logger.h`）。
- **report 流**：`logger->report()` 用 `level::off` 无前缀输出——banner、结果表格走这条干净通道，与日志流分离（`Logger.h::report`）。
- **redirect/tee**：`redirectFileBegin/teeFileBegin/redirectStringBegin...` 支持把全部输出重定向或三通到文件/字符串（`Logger.cpp`），对应 TCL `sta::redirect` 命令族，测试 golden 见 `src/utl/test/tee_*.rptok`、`logger_redirection_*.rptok`。
- **debug 分组**：`debugPrint(logger, tool, group, level, ...)` 宏 + `setDebugLevel`，惰性求值（`Logger.h`）。
- **崩溃可诊断**：`src/Main.cc` 注册 SIGABRT/SIGSEGV/SIGFPE/SIGBUS/SIGILL handler，崩溃时打印 `Signal N received` + boost::stacktrace 栈回溯到 stderr。
- **metrics 汇总**：退出时 `finalizeMetrics()` 自动写 `flow__warnings__count`、`flow__errors__count`、按 (tool,id) 细分的 warning 计数到 JSON（`Logger.cpp::addWarningMetrics`）——CI 可比对的机器可读结果。

### 1.4 颜色 / 进度 / 表格 / banner

- 颜色：spdlog `stdout_color_sink_mt` 按 spdlog 级别默认色整行着色（黄=warn，红=err 等，spdlog 库默认行为）；无自定义色板。重定向到文件时不着色（basic_file_sink 天然无色）。
- 进度：**传统上没有 CLI 进度条**。2025 年新增 `utl::Progress` 抽象 + `CommandLineProgress`，但当前 CLI 实现 `start/update/end/deleted` 四个方法全空（`src/utl/src/CommandLineProgress.cpp`，2025 版权头）——Progress reporter 接口为 GUI/web 视图预留。`OpenRoad.cc::init` 里 `utl::Progress::setBatchMode(batch_mode)`。
- 表格：各模块用 `logger->report()` 输出固定宽度报告（如 `report_checks` 时序报告）；模块文档统一用 markdown 选项表（`src/drt/README.md` 的 "Switch Name | Description" 两列表）。没有通用表格库。
- REPL 体验：linenoise 提供 history/补全（`src/cli_completer.cc/.h` 存在补全器源码）。

### 1.5 对 FAR-Lab CLI 可抄清单

1. `[LEVEL MOD-NNNN] message` 前缀格式：稳定编号可直接 grep 进文档/issue（我们 Node CLI 可给每条 warning/error 一个 ID，文档列全量）。
2. `report()` 干净通道 vs `info/warn/error` 日志通道分离：banner、最终结果表不掺日志前缀。
3. 消息限流 + "message limit reached" 显式声明，防止刷屏掩盖真错误。
4. error 打印+异常+退出码三层语义；critical 直接退。
5. `-log file` tee 到文件、`-metrics file` JSON 结果摘要（CLI 跑完产出机器可比对 JSON，对我们"研究计划执行结果"输出直接适用）。
6. 崩溃信号 handler 打栈回溯。
7. splash 可关（`-no_splash`），banner 内容是版本+特性矩阵+license。

---

## 2. PyHessian（amirgholami/PyHessian，Python）

### 2.1 输出方式（源码确认）

- `pyhessian/hessian.py`（master，WebFetch raw 全文）：**零输出**——无 print、无 logging、无 tqdm、无 ANSI 色。`eigenvalues()/trace()/density()` 纯计算返回值（`return eigenvalues, eigenvectors` 等）。库 import 仅 torch/math/numpy/pyhessian.utils。
- 仓库结构（GitHub API contents）：`pyhessian/` 仅 3 文件 `__init__.py`、`hessian.py`、`utils.py`。**无 CLI 入口、无 setup entry_points**（README 用法是 `python training.py` + `python example_pyhessian_analysis.py` 两步脚本）。
- 实际运行输出形态 = example 脚本的 print（`example_pyhessian_analysis.py`，WebFetch raw 全文确认，共 4 处）：
  - 参数回显循环 `print(arg, getattr(args, arg))`
  - `print('********** finish data londing and begin Hessian computation **********')`（原文拼写错误 "londing"）
  - `print('\n***Top Eigenvalues: ', top_eigenvalues)`
  - `print('\n***Trace: ', np.mean(trace))`
  - 结果呈现：旧式逗号 print，无小数位控制、无格式化、无颜色、无进度条；谱密度结果 `get_esd_plot(...)` 存成 `example.pdf`（README 原句 "The output density plot is saved as example.pdf"）。
- README（WebFetch raw）：无任何终端输出样例，两张结果图片引用（pyhessian-01.png / hessian.png），无依赖列表章节。

### 2.2 可抄元素（多为反面教材 + 两点正面）

- 反面：长计算（幂迭代 100 轮、Lanczos）完全静默，用户无进度感；结果输出无数字格式控制（直接 str numpy 数组）；`***` 手搓分隔符。
- 正面 1：**库与呈现彻底分离**——hessian.py 不做任何 I/O，呈现全部在调用方脚本。对我们 Node CLI 的启示：核心引擎不 print，CLI 层统一渲染（但要补上引擎进度回调，这是 PyHessian 缺的）。
- 正面 2：argparse 参数先全量回显再干活（`print(arg, getattr(args, arg))`），可复现性铺垫（虽然它没做完整 provenance）。

---

## 3. Hermes 歧义调查（3 候选）

| 候选 | 结论 | 证据 |
|---|---|---|
| **NousResearch/hermes-agent** | **最强候选，CLI/TUI 工程极重**，"CLI 做得好的工具项目"语境下成立 | 见 3.1 |
| facebook/hermes | React Native 的 JS 引擎，嵌入式库为主，CLI（`./bin/hermes`）仅开发/调试场景 | README 原文 "Hermes is a JavaScript engine optimized for fast start-up of React Native apps"；"If you just want to use pre-built Hermes in a React Native app...you do not need...direct access to the Hermes source"（WebFetch raw README） |
| NousResearch/Hermes（模型权重仓） | **UNVERIFIED**：GitHub API 返回 404（仓库已改名/迁移或删除），无法核实其 README/CLI 状况。其模型线当前活跃载体即 hermes-agent | WebFetch api.github.com/repos/NousResearch/Hermes → 404 |

### 3.1 NousResearch/hermes-agent（Python + TypeScript）

定位："The self-improving AI agent"（`pyproject.toml` description）。与 FAR-Lab 同为"模型无关 agent 工具"，CLI 工程密集，是最可对标的一案。

**CLI/TUI 架构**：
- 入口三件套（`pyproject.toml [project.scripts]`）：`hermes = "hermes_cli.main:main"`、`hermes-agent`、`hermes-acp`。
- **双前端**：Python 交互 REPL 用 **prompt_toolkit**（`pyproject.toml` 依赖注释原句 "Interactive CLI (prompt_toolkit is used directly by cli.py)"，`cli.py` 在根目录）；图形 TUI 用 **Ink（React for terminal）**：`ui-tui/package.json` 显示 react 19 + `@hermes/ink`（vendored fork）+ ink-text-input + nanostores + unicode-animations；Python 侧经 `tui_gateway/`（PTY bridge）桥接。输出渲染核心依赖 **rich==14.3.3**。
- 子命令面（搜索结果 + 仓库 docs）：`hermes status`、`hermes cron`、`hermes kanban`、`hermes logs --component ...`、`hermes tools`、`hermes dashboard` 等（docs 路径 `website/docs/reference/cli-commands.md` 存在；具体命令全表 UNVERIFIED-未逐条读）。
- CLI 是完整 TUI：multiline 编辑、slash 命令自动补全、会话历史（官方文档页 hermes-agent.nousresearch.com/docs/user-guide/cli，搜索结果摘录："the CLI is a full terminal user interface (TUI)...multiline editing, slash-command autocomplete, and conversation history"）。

**日志系统（`hermes_logging.py`，全文已读）**——本案例最大金矿：
- Python stdlib logging，**按 severity + 组件双维分文件**：`agent.log`(INFO+, 全量)、`errors.log`(WARNING+, 快速分诊)、`gateway.log`、`gui.log`（按 logger 名前缀 `_ComponentFilter` 分流，COMPONENT_PREFIXES 表）。
- 格式 `_LOG_FORMAT = "%(asctime)s %(levelname)s%(session_tag)s %(name)s: %(message)s"`；**session_tag `[session_id]` 经 LogRecord factory 全局注入**，每条日志可关联到会话（`set_session_context()`）——多会话 CLI 日志追踪的直接模板。
- **RedactingFormatter**（`agent/redact.py`）：secrets 永不落盘。
- 文件写入全部走 **QueueHandler/QueueListener 异步队列**（`_register_queued_handler`）：文件 I/O / 跨进程 rotation 锁永不阻塞 asyncio 事件循环。
- Windows 工程化到极致：`ConcurrentRotatingFileHandler`（跨进程 rotation 锁，规避 WinError 32）、`_safe_stderr()` 把 stderr 包成 UTF-8 errors='replace'（防 em-dash 崩溃）、`tzdata` 平台标记、pywinpty。连"Cygwin 终端检测"都有注释链。
- 第三方噪音压制：`_NOISY_LOGGERS`（openai/httpx/asyncio/websockets...）统一压到 WARNING。
- 退出路径分级：`flush_log_queue()`（阻塞排空）vs `drain_log_queue(timeout=1.0)`（硬退出时限时放弃尾部日志，注释原句 "Availability beats the last log line"）。
- 依赖策略：核心依赖全部精确 pin（`==X.Y.Z`），注释明说是供应链攻击防御（Mini Shai-Hulud 事件）；可选后端 lazy-install。

**可抄**：session-tag 注入、errors.log 快速分诊文件、异步日志队列 + 分级退出排空、RedactingFormatter、TTY/非 TTY 与 Windows 编码防御、噪音 logger 白名单压制。

---

## 4. 补充高质量案例（5 个，均源码级）

### 4.1 Snakemake（snakemake/snakemake，Python 工作流引擎）

- 实现：stdlib logging + **自写 `ColorizingTextHandler`**（`src/snakemake/logging.py`），不依赖 rich/colorlog。ANSI 常量 `RESET_SEQ="\033[0m"`、`COLOR_SEQ="\033[%dm"`、`BOLD_SEQ="\033[1m"`。
- 颜色语义（类内 `colors` 表）：`WARNING=YELLOW, INFO=GREEN, DEBUG=BLUE, CRITICAL=MAGENTA, ERROR=RED`；且**事件级覆盖**：`yellow_info_events`（RUN_INFO/SHELLCMD/JOB_STARTED）把 INFO 也染黄——"运行叙述"与"结果"用颜色区分。
- **事件驱动格式化**：LogRecord 携带 `event` 属性（JOB_INFO/JOB_ERROR/PROGRESS/...），`DefaultFormatter.format` 按事件分发到专门 formatter（`src/snakemake/logging.py`）。
- 进度文本：`format_progress` → `"N of M steps (X%) done"`；`format_percentage` 的精度算法逐位加精度直到不会把 99.6% 显示成 100%（代码原文）。
- **错误呈现（最佳实践）**：`format_job_error` 产出结构块——`Error in rule X:` + 4 空格缩进字段 `message/jobid/input/output/log/shellcmd`，shellcmd 附 `(command exited with non-zero exit code)`；`--show-failed-logs` 时直接把失败 job 的日志文件内容用 `====` 分隔线内嵌进错误报告（`show_logs()`，行宽 min(80, max_line)）。
- TTY 检测：`TERM == "dumb"` 或非 TTY 或 Windows → 不着色（`can_color_tty()`）；线程锁 `_output_lock` 保证多线程 job 并发输出不交错。
- 过滤面：`--quiet rules|progress|all|reason|host...` 分通道静音（`DefaultFilter` + Quietness 枚举）；日志文件自动写 `.snakemake/log/<ISO时间戳>.snakemake.log`。
- 插件化：`snakemake-interface-logger-plugins`，自定义 handler 也走 QueueListener（`LoggerManager._setup_plugins`）。

### 4.2 GitHub CLI gh（cli/cli，Go）

- 颜色/终端层：`pkg/iostreams/iostreams.go` + `pkg/iostreams/color.go`（全文已读）。
  - **语义化色 API**：`Red/Yellow/Green/Cyan/CyanBold/Muted/Highlight`；图标 `SuccessIcon()=Green("✓")`、`WarningIcon()=Yellow("!")`、`FailureIcon()=Red("X")`。
  - 能力探测链：colorEnabled / 256 / truecolor / `GLAMOUR_STYLE` / **终端背景主题 light/dark/none**（`DetectTerminalTheme`）；`TableHeader` 按主题用 `white+du` / `black+hu` / `default+u`（下划线表头，不抢数据视觉）。
  - 无障碍：`accessibleColorsEnabled` 退回用户终端可自定义的 16 基础色；`accessiblePrompterEnabled`。
  - Muted 语义化弱化文本，256 色下用 `\x1b[38;5;242m`（color.go `gray256`）。
- 进度：`StartProgressIndicatorWithLabel` 用 **briandowns/spinner** braille 字符集 `CharSets[11]`（⣾⣷⣽⣻⡿）120ms 间隔 fgCyan，**写 stderr 不污染 stdout 数据流**；spinner 被禁用时降级打印 `Cyan("Working... ...")` 一行文本（`startTextualProgressIndicator`）。
- 长输出：自动 pager（`StartPager`：PAGER env、注入 `LESS=FRX`、`LV=-c`）；alternate screen buffer `\x1b[?1049h` + Ctrl-C 恢复；`RefreshScreen` `\x1b[0;0H`+`\x1b[J`。
- Windows：go-colorable 把 ANSI 翻译成 console syscall；go-isatty 处理 Cygwin TTY。
- 可测性：`IOStreams` 全部可 override（SetStdoutTTY 等），`Test()` 返回 buffer 三件套。

### 4.3 Optuna（optuna/optuna，Python 超参优化）

- 实现：stdlib logging + **colorlog** `TTYColoredFormatter`（`optuna/logging.py`）。
- 日志格式：`"[%(levelname)1.1s %(asctime)s] %(message)s"` → 实际形态 `[I 2021-10-31 05:35:17,232] A new study created in RDB with name: ...`（**单字母级别 I/W/E/C + 空格 + 时间戳**，docstring 内嵌官方输出样例，逐字）。
- **库 logger 隔离**：`library_root_logger.propagate = False` + `disable_default_handler()/enable_default_handler()/set_verbosity()` 公共 API——作为库被 import 时不污染宿主应用日志（`optuna/logging.py`）。
- 进度条：`tqdm.auto`（`optuna/progress_bar.py`）：`_TqdmLoggingHandler.emit` 用 **`tqdm.write()`** 输出日志避免打断进度条重绘；进度条激活期间临时替换默认 handler、关闭时恢复。**进度条 desc 实时显示 `Best trial: N. Best value: X`**（`update()`），timeout 模式 bar_format `"{desc} {percentage:3.0f}%|{bar}| {elapsed}/{total}"`。n_trials 与 timeout 均未知时明确 warn 不显示进度条。

### 4.4 btop（aristocratos/btop，C++23 系统监视 TUI）

- 零依赖自绘 TUI（README "all system information gathering will be written from scratch without any external libraries"）。
- **颜色降级链**（README Prerequisites 节）：24-bit truecolor 优先 → `-lc/--low-color` 转 256 色（6x6x6 cube）→ 检测真实 tty 自动 16 色 TTY 主题（`-t/--tty` 强制）。
- 图形字符分级：`graph_symbol = braille|block|tty` 可按 box（cpu/mem/net/proc）单独设置；Braille U+2800-U+28FF 最高分辨率、TTY 模式换安全字符集；README 专节讲字体回退导致的渲染错位归因（终端/字体问题而非程序 bug）。
- **主题系统**：`.theme` 文件与 bpytop/bashtop 通用；系统目录（`/usr/share/btop/themes` 等）+ 用户目录（`$XDG_CONFIG_HOME/btop/themes`）+ `--themes-dir` 覆盖，三级优先。
- 配置即 UI：所有选项可在 UI 内改（btop.conf TOML 自动生成）；`rounded_corners`、`terminal_sync`（terminal synchronized output 减闪烁）、presets 布局、`vim_keys`。
- 减闪烁技术：terminal synchronized output sequences（btop.conf `terminal_sync = true`）。

### 4.5 lazygit（jesseduffield/lazygit，Go git TUI）

- **文档化的颜色语义 FAQ**（README "What do the commit colors represent?" 原文）：
  - `Green: the commit is included in the master branch`
  - `Yellow: the commit is not included in the master branch`
  - `Red: the commit has not been pushed to the upstream branch`
  （颜色语义写进 README FAQ，用户可查——颜色不是装饰而是状态编码。）
- 调试体验：`lazygit --debug` 一窗 + `lazygit --logs` 一窗**并排看 UI 与日志**（README "Debugging Locally" 原文）——TUI 与日志分离查看的产品化设计。
- 文档形态：每个功能一个压缩 GIF（`assets/demo/*.gif`）而非截图——动态交互用动图文档化；键位表独立成 docs/keybindings。
- 集成而非重复造轮子：PR 状态图标直接消费 `gh` CLI 的认证（"requires the gh tool to be installed, and you need to do gh auth login once"，README 原文）。
- 实现 TUI 库：README 未提及，UNVERIFIED（未读 go.mod）。

（PyTorch Lightning、DVC、MLflow 本轮未做源码级调查，不列入——宁缺毋滥。）

---

## 5. 共性收敛（≥2 个独立项目采用才收入，均标注）

### 5.1 颜色语义

| 语义 | 颜色 | 采用项目（证据） |
|---|---|---|
| 成功/正常完成/正向 | 绿 | gh（SuccessIcon=Green ✓）、Snakemake（INFO=GREEN）、lazygit（绿色=已并入 master） |
| 错误/危险 | 红 | gh（FailureIcon=Red X）、Snakemake（ERROR=RED）、lazygit（红=未推送） |
| 警告/需注意/未完成态 | 黄 | gh（WarningIcon=Yellow !）、Snakemake（WARNING=YELLOW + yellow_info_events）、lazygit（黄=未并入 master）、Optuna（colorlog 默认 warning=黄，库默认） |
| 进行中/交互提示 | 青 cyan | gh（spinner fgCyan、文本进度 Cyan） |
| 次要/元信息 | 灰/muted | gh（Muted/gray256 表头 white+du） |
结论：**红/黄/绿语义高度一致（4/6 项目命中），cyan=进行中、muted=元信息是 gh 独有但值得抄的细分**。OpenROAD 依赖 spdlog 默认级别色，语义等价。

### 5.2 能力探测与降级（"永远能跑"而非"最好效果"）

- TTY/非 TTY：gh（isatty + Cygwin + 全套 override）、Snakemake（isatty + TERM=dumb）、hermes（`_safe_stderr` 编码降级）。**非 TTY 自动去色**是共同底线（3/6）。
- 颜色档位降级链：btop（truecolor→256→16）、gh（truecolor/256/base16-accessible）。
- Windows 专门工程：gh（go-colorable）、hermes（ConcurrentRotatingFileHandler、UTF-8 replace、pywinpty）、Snakemake（Windows 不着色）。
- spinner/进度条降级为纯文本：gh（"Working... ..."）。

### 5.3 进度呈现

- 已知总量 → `N of M (X%)` 或百分比条：Snakemake（steps done）、Optuna（tqdm total=n_trials）。
- 未知时长 → braille spinner：gh（CharSets[11]）；时间预算型 → elapsed/total：Optuna timeout bar_format、gh textual indicator。
- **进度与日志共存问题有两种解**：Optuna 用 `tqdm.write()`；gh 把 spinner 写 **stderr**、数据写 stdout（管道友好）。OpenROAD 的教训：长任务完全静默（CommandLineProgress 空实现），被 GUI/web 视图需求倒逼出 Progress 抽象——**接口先行、渲染器可替换**（`swapProgress`）是对的，空 CLI 实现是缺口。
- 进度条承载实时最优值：Optuna（desc=Best trial/value）——对我们"研究方案迭代"输出当前最优假设有直接映射。
- 百分比诚实：Snakemake `format_percentage` 防止 99.6% 显示成 100%（与 FAR-Lab 宪章"不发明百分比"同源）。

### 5.4 日志层级与消息治理

- 标准 5-7 级全覆盖（OpenROAD TRACE..OFF、Snakemake/Optuna/hermes stdlib、gh 无 logging 框架但图标等价）。
- **每条消息可定位**：OpenROAD (TOOL, NNNN) 稳定编号、Snakemake LogEvent 枚举、hermes `[session_id]` 注入——三种不同的"消息身份"方案（编号制/事件制/会话制），共同点是**可 grep、可抑制、可统计**。
- 刷屏治理：OpenROAD 1000 条限流 + suppress_message、Snakemake `--quiet` 分通道、hermes _NOISY_LOGGERS 压制第三方。
- **库/CLI 分离**：Optuna propagate=False、PyHessian（零输出的极端）、OpenROAD report() 干净通道——库不污染宿主输出是 Python 科学生态共识。
- 双文件策略：hermes agent.log + errors.log（WARNING+ 单独快速分诊）。
- 结构化结果旁路：OpenROAD `-metrics` JSON、Snakemake `.snakemake/log/*.log` 时间戳文件——**人读日志 + 机读指标分离**。

### 5.5 错误呈现

- **错误块=标题+缩进字段+证据内嵌**：Snakemake（Error in rule + input/output/shellcmd + `--show-failed-logs` 内嵌日志原文 `====` 分隔）是最佳模板；OpenROAD（编号 + throw + exit code 分层）是机器语义最佳。
- 状态图标编码：gh ✓/!/X（绿色/黄/红）。
- 反面：PyHessian `print('\n***Trace: ', x)`——无上下文、无格式、无层级。
- 崩溃路径：OpenROAD signal handler + stacktrace；gh alternate-screen 退出恢复；hermes drain_log_queue 超时放弃尾部。

### 5.6 表格对齐

- 表头弱化+下划线：gh `TableHeader`（white+du/black+hu，主题感知，不与数据争色）。
- 固定前缀等宽对齐：OpenROAD `[INFO ANT-0044]`（模块缩写定宽 + 编号 4 位补零）。
- 结构化字段缩进：Snakemake 4 空格缩进字段块。
- 共性：**表头/元数据永远弱于数据**；编号定宽补零保证多行对齐（`{:04d}`）。

---

## 6. 对 FAR-Lab CLI 的落地建议（按优先级）

1. **消息身份制**：`[LEVEL FAR-NNNN]` 前缀（学 OpenROAD），错误/警告编号进文档；研究流程各阶段（hypothesis/evidence/rank/plan）可学 Snakemake LogEvent 做事件枚举。
2. **结果流与日志流分离**：banner/最终研究计划/排名表走无前缀 report 通道（OpenROAD report()），日志走带前缀通道；同时 `-o result.json` 机读输出（学 `-metrics`）。
3. **颜色语义表**：红=验证失败/错误，黄=警告/未验证（UNVERIFIED 态直接映射），绿=通过/完成，cyan=进行中，muted=来源/时间戳等元信息（gh + lazygit 共识）。`NO_COLOR`/非 TTY 自动降级。
4. **进度诚实**：已知步数用 `N of M (X%)`（防 99.6%→100%，学 Snakemake）；未知时长长任务（LLM 调用）用 stderr braille spinner（学 gh）；进度条 desc 显示"当前最优假设分值"（学 Optuna）。
5. **错误块模板**：标题行 + 缩进字段（输入/命令/退出码）+ 可选内嵌原始证据摘录 + `====` 分隔（学 Snakemake show_failed_logs）。
6. **日志基建**：agent.log + errors.log 双文件（hermes）；异步队列防事件循环阻塞（hermes QueueListener）；secret 脱敏 formatter（hermes RedactingFormatter）；会话 tag 注入（hermes session_tag）；Windows 编码防御（hermes _safe_stderr / gh go-colorable 思路在 Node 即启用 VT 处理）。
7. **消息限流**：同 ID 消息 N 条后停 + 显式声明（OpenROAD），配合 CLI `--quiet stage|progress` 分通道（Snakemake）。

---

## 7. 证据索引（仓库路径汇总）

**OpenROAD（The-OpenROAD-Project/OpenROAD，master）**：`src/Main.cc`（splash/usage/REPL/信号栈回溯）、`src/OpenRoad.cc`（组件装配、setThreadCount 打印）、`src/utl/include/utl/Logger.h`（消息格式/限流/级别名/pattern_="%v"/error-throw）、`src/utl/src/Logger.cpp`（spdlog sinks/metrics/redirect-tee）、`src/utl/src/LoggerCommon.cpp`（TCL 绑定 report/info/warn/error/critical/metric/suppress）、`src/utl/src/CommandLineProgress.cpp`（空实现）、`src/utl/test/test_info.ok`、`src/utl/test/test_error.ok`（输出样例 golden）、`src/utl/test/tee_*.rptok`、`src/drt/README.md`（TCL 命令面 + markdown 选项表）、`src/cli_completer.cc/.h`

**PyHessian（amirgholami/PyHessian，master）**：`pyhessian/hessian.py`、`pyhessian/{__init__.py,utils.py}`（GitHub API）、`example_pyhessian_analysis.py`、`README.md`（均 WebFetch raw）

**hermes-agent（NousResearch/hermes-agent，master）**：`pyproject.toml`（入口/依赖/pin 策略）、`hermes_logging.py`（全文）、`ui-tui/package.json`（Ink 栈）、`cli.py`、`tui_gateway/`、`hermes_cli/`、`website/docs/reference/cli-commands.md`（存在性经搜索确认，未逐条读）

**Snakemake（snakemake/snakemake，master）**：`src/snakemake/logging.py`（全文）

**gh（cli/cli，master）**：`pkg/iostreams/iostreams.go`（全文）、`pkg/iostreams/color.go`（全文）、`pkg/cmd/`（命令树结构）

**Optuna（optuna/optuna，master）**：`optuna/logging.py`（全文）、`optuna/progress_bar.py`（全文）

**btop（aristocratos/btop，master）**：`README.md`（颜色降级/主题/graph symbol/btop.conf）、`themes/`（主题文件目录）

**lazygit（jesseduffield/lazygit，master）**：`README.md`（颜色 FAQ/debug+logs/GIF 文档化）

**UNVERIFIED 项**：NousResearch/Hermes 仓库现状（API 404）；hermes-agent 具体子命令全表；lazygit TUI 库（go.mod 未读）；OpenROAD 完整真实运行 log（样例来自测试 golden 文件与 docstring，非现场抓取的端到端日志）。
