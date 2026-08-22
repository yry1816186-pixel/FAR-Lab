# 线 B3：CLI/TUI 体验调研报告（Wave-PRODUCT）

- 日期：2026-08-22 ｜ 调研 Agent：Wave-PRODUCT 线 B3 ｜ 服务对象：《产品全景设计规划方案》第 7 节（CLI 蓝图）
- 方法与证据通道：npm registry（`npm view` + packument JSON 实查，均为 registry 官方数据）、GitHub API（api.github.com/repos/\*，stars/pushed_at/license/archived）、各库 README（npm packument 的 readme 字段或 zread repo 快照——github.com 网页与 raw.githubusercontent 在本环境直连超时，已如实换道）、clig.dev / cli.github.com / pnpm.io / docs.npmjs.com / docs.docker.com / git-scm.com / esbuild.github.io 全文抓取、google-gemini/gemini-cli 仓库文件直读（zread 快照）。
- 本地基线（已读实码）：`src/cli/main.ts`（295 行）与 `package.json`——运行时依赖仅 `zod`；命令面 runs/verify/research start|status|inspect|cancel|resume|export|feedback；全命令 `--json`；退出码 0/1/2（usage error=2）；诊断走 stderr；`padEnd` 对齐；无颜色/spinner/交互提示符；D-031 拒跑 stale dist。

---

## 1. 候选库逐项核验表（全部 npm registry 实查，2026-08-22）

| 库 | 最新版 | 发布日期 | License | 运行时依赖 | GitHub 活跃度（2026-08-22 实查） | 能力（来源：官方 README） |
|---|---|---|---|---|---|---|
| ink | 7.1.1 | 2026-07-16 | MIT | **25 个** + peer `react>=19.2.0`；node>=22；unpacked 557KB | vadimdemedes/ink：39,708 stars，pushed 2026-08-12，未归档 | "React for CLIs"——React 渲染器，Yoga flexbox 布局，React 全特性（hooks 等）；README「Who's Using Ink」自称用于 Claude Code、Gemini CLI、GitHub Copilot CLI、Wrangler、Linear、Gatsby、tap、Terraform CDK 等 |
| @clack/prompts | 1.7.0 | 2026-07-03 | MIT | **4 个**（@clack/core、sisteransi、fast-wrap-ansi、fast-string-width）；node>=20.12 | bombshell-dev/clack：8,013 stars，pushed 2026-08-20（GitHub 仓库 license 显示 NOASSERTION，npm 包为 MIT——monorepo 无根 license 文件所致） | 「opinionated, pre-styled」提示套件，自称「80% smaller than other options」；组件：intro/outro/isCancel/cancel、text/confirm/select/multiselect/groupMultiselect、spinner、**progress（百分比条）**、group、tasks、log.(info/success/step/warn/error)、stream（异步迭代器日志）、taskLog（子进程持续输出） |
| listr2 | 11.0.0 | 2026-07-21 | MIT | **3 个**（cli-truncate、log-update、wrap-ansi）；node>=22.13 | listr2/listr2：681 stars，pushed 2026-08-21，0 open issues，未归档 | 「task lists that feel alive and interactive」；README 仅链接文档站 listr2.kilic.dev；**渲染器清单 UNVERIFIED**（文档站抓取时 HTTP 525 宕机） |
| ora | 9.4.1 | 2026-06-22 | MIT | **8 个**（chalk、cli-cursor、cli-spinners、is-interactive、is-unicode-supported、log-symbols、stdin-discarder、string-width）；node>=20 | sindresorhus/ora：9,738 stars，pushed 2026-06-22 | "Elegant terminal spinner"；prefix/suffixText、多款 spinner 帧、Windows 非 Terminal 环境自动降级 `line` 帧、**默认写 stderr**、`isEnabled` 由其内部判定；README 官方指引「要更小的用 yocto-spinner」 |
| picocolors | 1.1.1 | 2024-10-16 | **ISC** | **0 个**；unpacked 仅 6.4KB；CJS+ESM 双格式 | alexeyraspopov/picocolors：1,746 stars，最后 push 2024-11-18（休眠但库极小且 API 已冻结；被 PostCSS、SVGO、Stylelint、Browserslist 采用） | 「tiniest and the fastest」终端着色；自称比 chalk 小 14 倍、快 2 倍；**NO_COLOR friendly**；无依赖 |
| yocto-spinner | 1.2.2 | 2026-07-16 | MIT | **1 个**（yoctocolors 2.2.0，MIT）；node>=18.19 | sindresorhus/yocto-spinner：313 stars，pushed 2026-07-16 | 「Tiny terminal spinner」；自定义帧/颜色；Unicode 与非 Unicode 环境；**优雅处理 SIGINT/SIGTERM**；info/success/warning/error 状态符；CI 友好；**默认写 stderr** |
| ansi-escapes | 7.3.0 | 2026-02-04 | MIT | **1 个**（environment）；node>=18 | sindresorhus/ansi-escapes：553 stars，pushed 2026-02-04 | ANSI 转义序列常量表：cursorTo/Move/Up/Down/Save/Restore/GetPosition、cursorHide/Show、eraseLines/EndLine/StartLine/Line/Down/Up/Screen、scrollUp/Down 等；浏览器可用（Xterm.js） |
| **cli-table4** | — | — | — | — | — | **npm registry 不存在（E404 实查：`registry.npmjs.org/cli-table4` Not Found）** → 事实上的替代：**cli-table3** 0.6.5（2024-05-12，MIT，1 依赖 string-width，node "10.\|\|>=12"；api 兼容 cli-table/cli-table2；cell 行列跨span、per-cell 样式、词换行、ANSI 感知截断；**两年多未发版**）；另一替代 cli-table 0.3.11（Automattic，2025-07-29，依赖古老的 colors@1.0.3） |
| wrap-ansi | 10.0.1 | **2026-08-17（一周内）** | MIT | **2 个**（ansi-styles、string-width）；node>=20 | chalk/wrap-ansi：139 stars，pushed 2026-08-17 | 对含 ANSI 码字符串按列宽词折行；hard/wordWrap/trim 选项；它是 ink 与 listr2 的传递依赖 |

补充核验（路线 b 用）：**esbuild 0.28.2**（2026-08-08，**MIT**，evanw/esbuild 40,012 stars，pushed 2026-08-09）——npm 包本身 0 个 JS 依赖，二进制经 optionalDependencies 的 `@esbuild/win32-x64` 等平台包分发（实查列表）。官方文档（esbuild.github.io/getting-started）原句：bundling for node 用 `--platform=node`，node 内建模块自动 external，依赖默认打进 bundle；**"The code is completely self-contained and no longer depends on your node_modules directory"**；注意点：`.node` 原生模块、`import.meta.url` 这类 Node 特性不可打包，wasm 等资产需另行处理。

来源 URL：registry.npmjs.org/<pkg>（packument：版本/日期/license/deps/readme）；api.github.com/repos/<owner>/<repo>；github.com/vadimdemedes/ink、github.com/bombshell-dev/clack（packages/prompts/README.md）、github.com/listr2/listr2、github.com/cli-table/cli-table3（以上经 zread 快照）；esbuild.github.io/getting-started/。

---

## 2. 参考系哲学（不候选采纳，只提炼思想）

- **ratatui（Rust，MIT，github.com/ratatui/ratatui）**：显式 draw/event 循环——`loop { terminal.draw(render); event::read() }`，无保留态 UI 框架，widget 即纯渲染单元；2023 年从 tui-rs 分叉续命。思想：**渲染是状态的纯函数，事件驱动重绘**。
- **textual（Python，github.com/Textualize/textual）**：把 Web 开发模型搬进终端——**App 内嵌 CSS**（`Screen { align: center middle; }`）、widget 库、异步框架、同一 app 可 `textual serve` 跑在浏览器、ctrl+p 命令面板。思想：**声明式样式与组件树、终端与 Web 同构**。
- **bubbletea（Go，MIT，github.com/charmbracelet/bubbletea）**：**Elm Architecture**——Model + Init/Update/View 三方法，`Msg` 事件驱动，View 声明整个 UI、框架负责重绘（"you don't have to worry about redrawing logic"）；README 称 18,000+ 应用（gh-dash、MinIO mc、CockroachDB 等）。思想：**单向数据流 + 纯函数视图**。

三者共同点：UI = f(state) 的纯渲染模型。对 FAR-Lab 的启示：当前 `printRun(run)` 恰是「渲染是 run 状态的纯函数」——无需引入框架即可延续这一纪律。

---

## 3. 真实大型 CLI 的公开惯例（各 3 条，注来源）

### Gemini CLI（google-gemini/gemini-cli，Apache-2.0）
1. **终端 UI = React 19 + Ink，且用 overrides 把 ink 钉死到 fork**（`"ink": "npm:@jrichman/ink@6.6.9"`、`react 19.2.4`、`ink-spinner`、`ink-gradient`，均在其 `packages/cli/package.json`）——大型 AI CLI 接受 React 组件模型做终端渲染，但通过 fork 固定以锁行为。
2. **发布产物是单文件 esbuild bundle，零运行时 npm 依赖**：仓库根 `package.json` 中 `"bin": {"gemini": "bundle/gemini.js"}`、`"files": ["bundle/", ...]`、`scripts.bundle = "... node esbuild.config.js && node scripts/copy_bundle_assets.js"`、devDeps 含 `esbuild 0.25.0` 与 `esbuild-plugin-wasm`；已发布包 `@google/gemini-cli@0.56.0`（2026-08-19）registry 实测 **dependencies 字段为空、449 个文件、97.9MB unpacked**——自包含发布。开发态仍 tsc+workspaces，仅发布走 bundle。
3. **交互 UI 与非交互输出是两套一等公民代码面**：仓库 `packages/cli/src` 下并列 `interactiveCli.tsx` 与 `nonInteractiveCli.ts`、`jsonoutput.ts`、`output-redirection.test.ts`（zread 仓库结构直读）——机器可读输出路径被独立实现并独立测试。

### npm（docs.npmjs.com/cli/v11/using-npm/config，逐条原文）
1. **进度默认值是环境探测式**：`progress` 默认 "true when not in CI and both stderr and stdout are TTYs and not in a dumb terminal"——双流 TTY + 非 CI 才显示进度条。
2. **颜色规则**：`color` 默认 "true unless the NO_COLOR environ is set to something other than '0'"；true 时 "only prints color codes for tty file descriptors"（TTY 之外不着色）。
3. **失败时给出持久日志路径**：`loglevel`（silent…silly，默认 notice）下 "All logs are written to a debug log, with the path to that file printed if the execution of a command fails"——终端呈现与落盘日志分离，失败可追溯。

### pnpm（pnpm.io/cli/install，选项原文）
1. **reporter 按环境自动降级**：`--reporter` 允许 default/append-only/ndjson/silent；TTY→`default`（光标操纵原地重绘），**非 TTY→`append-only`**（"the output is always appended to the end. No cursor manipulations are performed"）。
2. **ndjson 机器可读进度流**：`ndjson`——"the most verbose reporter. Prints all logs in ndjson format"，进度本身可管道化。
3. **「怎么打」与「打什么」分离**：reporter 管格式，`loglevel` 管信息量；`silent` 连致命错误都不打（"not even fatal errors"），供脚本完全接管输出。

### gh CLI（cli.github.com/manual，逐条原文）
1. **结构化输出三件套**：`--json <fields>` "Output JSON with the specified fields" + `--jq <expression>` "Filter JSON output using a jq expression" + `--template <string>` "Format JSON output using a Go template"；每命令文档枚举全部 JSON fields（如 gh pr list 列出 45 个字段名）。人类表格与机器 JSON 同命令双形态。
2. **环境变量矩阵覆盖颜色/TTY/提示/spinner 四态**（manual/gh_help_environment）：`NO_COLOR` "avoid printing ANSI escape sequences for color output"、`CLICOLOR`=0 禁色、`CLICOLOR_FORCE` 非 0 管道中仍保色；`GH_FORCE_TTY` "force terminal-style output even when the output is redirected"（值为数字即列宽）；`GH_PROMPT_DISABLED` 禁交互提示；**`GH_SPINNER_DISABLED` "replace the spinner animation with a textual progress indicator"**——连 spinner 都提供无动画文本替身。
3. **调试走 stderr 且分级**：`GH_DEBUG` "verbose output on standard error. Set to api to additionally log details of HTTP traffic"；列表类命令默认上限 30 + `-L/--limit` 显式分页语义。

---

## 4. clig.dev 要点（全文抓取，2026-08-22）

- **流纪律**：结果进 stdout（管道默认读取处）；"Log messages, errors, and so on should all be sent to stderr"；且"不要把 stderr 当 log 文件"（无 log 级别前缀，除非 verbose）。
- **退出码**：成功 0，失败非零，"Map the non-zero exit codes to the most important failure modes"；未规定 1 vs 2 的具体语义（FAR-Lab 现行 2=usage error 属常见惯例，非 clig.dev 强制）。
- **颜色**：非终端或用户要求即禁用；触发条件逐流检查 TTY、`NO_COLOR` 非空即禁（不看值）、`TERM=dumb`、`--no-color`；提及 `FORCE_COLOR` 强制开色。
- **人类默认 vs --json**："Human-readable output is paramount / Humans come first"；`--json` 时输出 JSON；建议提供 `--plain` 纯表格供 grep/awk；`-q` 抑制非必要输出；verbose 用 `-d`（`-v` 有歧义）。
- **破坏性操作**："Confirm before doing anything dangerous"，分三级：轻度可提示；中度（目录/批量删除）应提示并提供 dry-run；重度要"难以误确认"（输入资源名或 `--confirm="name-of-thing"`）；提示仅在 stdin 是 TTY 时出现；**"Never require a prompt"**——总有 flag/参数途径；`--no-input` 全程禁交互；保留 Ctrl-C 逃生。
- **配置优先级**（高→低）：**flags > 环境变量 > 项目级配置 > 用户级 > 系统级**；遵循 XDG；secrets 不放 env，用 credential 文件/管道/secret service。
- **长任务与健壮性**："Print something to the user in <100ms"；长操作显示进度或预估时间以免像挂死；**stdout 非交互时不显示任何动画**；出错时打印被进度条遮蔽的日志；要有超时；"Make it recoverable"（重跑接续上次进度）与 "Make it crash-only"；Ctrl-C 尽快退出，第二次 Ctrl-C 可跳过慢清理。

---

## 5. 长任务进度的诚实范式（可中断/可恢复）

- **git fetch**（git-scm.com/docs/git-fetch，原文）：`--progress`——"Progress status is reported on the standard error stream by default when it is attached to a terminal, unless -q is specified. This flag forces progress status even if the standard error stream is not directed to a terminal."。即：**进度默认只进 stderr 且只在 TTY；-q 全静默；--progress 显式强制**（供 `2>fetch.log` 场景）。远端侧 `remote: Enumerating objects…` 分相计数行属公开可观察行为，本次未从官方文档核验（UNVERIFIED-in-docs）。
- **docker pull**（docs.docker.com/engine/reference/commandline/pull/）：样例输出含每层状态行 "Pulling fs layer"、"Download complete"、"Pull complete"，结尾固定 `Digest: sha256:…` 与 `Status: …`（幂等判据："Status: Image is up to date…"）；`-q/--quiet` "Suppress verbose output"。**可恢复性是内容寻址层的文档化行为**：层已存在本地时 "only pulls its metadata, but not its layers"，同层不重复下载存储。文档亦明确连接断开/杀进程时 Engine 终止拉取（未承诺断点续传）。样例中未出现 Already exists/Waiting/Extracting 等状态与逐层百分比——这些属公开可观察行为，官方参考页未载（如实标注）。
- **综合范式**（与 FAR-Lab「诚实进度」哲学对齐）：步进阶段行（done/total + 当前阶段 + attempt/error），不用发明百分比；pnpm 的 append-only 降级、gh 的 GH_SPINNER_DISABLED 文本替身、clig.dev 的「非 TTY 无动画」共同构成准则：**进度呈现是环境的函数（TTY? CI? --json?），不是装饰**。FAR-Lab 现行 `progress: done/total stages`（无百分比）已在范式内。

---

## 6. 零依赖不变量下的三条技术路线

| 路线 | 内容 | 利 | 弊/门槛 |
|---|---|---|---|
| **(a) 维持零依赖手写**（padEnd 模式增强） | 手写或 vendored 单文件实现：宽度感知对齐（East-Asian width）、ANSI 开关色（NO_COLOR/非 TTY/--color）、步进阶段行；交互提示符如需要才最小手写 | 不变量零风险；dist↔src 同构，D-031 stale 检查、tsc 直出、调试与测试模型全部保持；供应链审计面最小（符合安全红线）；与「无装饰动画」哲学一致——我们需要的本就不是 spinner 而是阶段行；零启动开销 | 宽度/ANSI 感知截断手写易错（wrap-ansi/string-width 的存在证明此坑真实）；select/confirm 类 TUI 手写成本高；无组件生态。**最小外包点**：picocolors（ISC、0 依赖、6.4KB、NO_COLOR friendly）可整源 vendored（附 ISC 声明），或直接手写同等 ANSI 表（约几十行） |
| **(b) esbuild 构建期打包进单文件 dist** | devDependencies 加 esbuild，release 产物 bundle 化，运行时 node_modules 仍只有 zod | 满足不变量的论证成立：esbuild 官方文档明言 bundle 后 "completely self-contained and no longer depends on your node_modules directory"；**生产先例=Gemini CLI**（`bin: bundle/gemini.js` + esbuild.config.js + copy_bundle_assets.js + esbuild-plugin-wasm，发布包 0 依赖）；解锁 ink/clack 全生态；esbuild MIT、40k stars、活跃（0.28.2，2026-08-08） | dist 不再与 src 文件对应——**D-031 与现有「tsc 直出逐文件」验证/运维模型需重做**（stale-dist 检查、sourcemap、堆栈可读性）；ink 拉入 25 个依赖与 yoga/wasm 资产（Gemini CLI 需专门的 copy 脚本与 wasm 插件先例可证复杂度）；供应链与 license 合规面扩大（bundle 需携带各 MIT/ISC 版权声明）；构建关键路径新增打包器。**须按硬约束记 DECISIONS 例外条目** |
| **(c) CLI 库放独立包** | 如 `@far-lab/tui`（workspace 包），核心 dist 不变 | 不变量完全不动；TUI 层自由选型、独立版本 | 引入 monorepo/发布编排成本；CLI 是 FAR-Lab 主产品面，体验层与核心分离会制造两套状态投影，违背「一个不变量一个权威 owner」；用户侧可能两跳安装；当前规模下无收益场景 |

**推荐**：
1. **现阶段选 (a)**：CLI 的真实缺口是「宽度感知对齐 + 受控颜色 + 阶段行呈现」，不是组件框架；三者均可零依赖手写或 vendored picocolors（ISC）解决，且与诚实进度/信息密度哲学直接对齐。
2. **(b) 作为触发式升级路径保留**并写入 DECISIONS 候选：触发条件 = 出现全屏交互 TUI 的真需求（如假设浏览/证据树交互视窗）且 (a) 成本超阈值；届时按 Gemini CLI 模式（devDep esbuild + 单文件 bundle + 资产 copy 脚本 + 0 依赖发布）实施，并同步重设计 D-031 类 dist 校验。
3. **(c) 不推荐**：无对应收益场景，徒增权威分裂。
4. 若走 (b)，注意 @clack/prompts 的 `progress` 是百分比条组件，与「不发明百分比」冲突——进度呈现仍应使用阶段行。

---

## 7. 证据边界与 UNVERIFIED 清单

- **listr2 渲染器清单（default/verbose/simple/test/silent）UNVERIFIED**：官方文档站 listr2.kilic.dev 抓取时 HTTP 525 宕机；README 仅链接文档站未罗列。
- ink「Who's Using Ink」名单是 README 自述（用户报告性质，未经独立审计）；其中「Gemini CLI 用 Ink」已由 Gemini CLI 仓库 package.json（fork `@jrichman/ink@6.6.9`）独立佐证为真。
- Gemini CLI 仓库文件经 zread 快照读取，快照版本 0.52.0-nightly.20260707（约 2026-07-07）；发布结论以 registry 实测的 @0.56.0（0 依赖、449 文件、97.9MB）为准，两者相互印证但非同一时点。
- docker pull 的 Already exists/Waiting/Downloading/Extracting/Verifying Checksum 状态行与逐层百分比、git fetch 的 `remote: Enumerating…` sideband 行：公开可观察行为，官方参考页样例未包含，本文仅以文档化内容为断言基础。
- GitHub stars/pushed_at 为 2026-08-22 api.github.com 实测瞬时值。
- github.com 网页与 raw.githubusercontent.com 在本环境直连超时；README 获取改道 npm packument（registry 官方字段）与 zread（repo 文件快照），内容属性仍为官方一手，但通道已如实说明。
