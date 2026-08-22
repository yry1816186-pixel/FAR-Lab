# Node/TS CLI 视觉库生态调研（颜色 / 进度 / 表格 / 交互 / ink）

- **调研日期**: 2026-08-22
- **服务对象**: FAR-Lab CLI（`src/cli/main.ts`，435 行，纯 `console.log` + `padEnd`，无 ANSI、无视觉库；`package.json` 仅 1 个 runtime 依赖 zod，ESM）
- **数据口径**: 所有版本号 / 发布日期 / license / 依赖数来自 npm registry API（`https://registry.npmjs.org/<pkg>`），周下载量来自 `https://api.npmjs.org/downloads/point/last-week/<pkg>`（2026-08-22 实测），源码行数来自 GitHub raw 实读。全部可复现（node fetch 一段脚本即可）。
- **可信度**: 数字均为实测；个别无法确证处显式标注 UNVERIFIED。

---

## 结论速览（TLDR）

| 层面 | 推荐 | 理由 |
|---|---|---|
| 颜色 | **零依赖复刻 picocolors**（整库仅 76 行，ISC license 可直接抄） | 成本最低、无供应链、NO_COLOR/FORCE_COLOR/CI 检测顺序现成 |
| 进度 | **零依赖 `\r` 静态进度**（自写 ~50 行）；若要 spinner 再考虑 yocto-spinner | FAR-Lab 纪律要求非 TTY 零动画，动画 spinner 本身不是刚需 |
| 表格 | **零依赖 padEnd 增强**（自写 ~40-60 行，补 CJK 宽度） | 项目已在用 padEnd；cli-table3 唯一价值是 string-width 的东亚宽度表 |
| 交互 | **仅当确需 TTY 选择器时引入 `@clack/prompts`**（4 直接依赖，树极浅）；confirm 可用 `--yes` 标志 + 30 行读 stdin 规避 | confirm/select 是唯一自研成本高（raw mode + 按键解析）的领域 |
| ink | **不引入（REJECT）** | 25 运行时依赖 + react/reconciler/yoga，为一个报告型 CLI 引入 React 运行时违背 minimal sufficient architecture |

**推荐组合 A（首选，全零依赖）**: 抄 picocolors 颜色检测 + 16 色映射（76 行）+ 静态进度（~50 行）+ padEnd 表格增强（~40 行）+ 非交互式命令设计（关键操作走 flag 而非交互确认）。总计 ~170 行自研，0 个新依赖。
**推荐组合 B（若要交互选择器）**: 组合 A + `@clack/prompts`（MIT，4 直接依赖 / 展开后约 7 个小包）。
**知名工具背书**: `@nestjs/cli` 的组合是 `ansis + ora + cli-table3 + @inquirer/prompts`；npm CLI 用 `chalk 5 + supports-color`；性能派（pnpm / turbo / wrangler / vercel 发布包）runtime 视觉依赖为 **0**（全部 bundle 进产物）——零视觉依赖在头部工具中本身就是主流做法。

---

## 1. 颜色库对比

实测数据（2026-08-22）：

| 库 | 最新版 | 发布日期 | 周下载 | license | 直接依赖 | 维护状态 |
|---|---|---|---|---|---|---|
| **chalk** | 6.0.0 | 2026-07-26 | ~4.17 亿 | MIT | 0 | 活跃（5.x 线最后为 5.6.2 / 2025-09-08） |
| **picocolors** | 1.1.1 | 2024-10-16 | ~1.91 亿 | ISC | 0 | 近 2 年无新版，但全库 76 行、功能已完备，被 vite 等用作底层 |
| **colorette** | 2.0.20 | 2023-04-16 | ~6,359 万 | MIT | 0 | 3 年+ 未发布，功能冻结 |
| **ansi-colors** | 4.1.3 | 2022-05-16 | ~4,904 万 | MIT | 0 | 4 年+ 未发布，功能冻结 |
| **ansis**（补充发现） | 4.3.1 | 2026-05-31 | ~4,040 万 | ISC | 0 | 活跃新秀，@nestjs/cli 已采用，支持 256/truecolor + 链式 + ESM/CJS 双发 |

要点：
- 任务假设的 "chalk 5" 已过时：**chalk 当前 latest 是 6.0.0**（2026-07-26），且 5.x 与 6.x 均为 **0 依赖**。chalk 5+ 为 ESM-only；FAR-Lab 是 ESM（`"type": "module"`），无兼容障碍。
- 四个候选（除 ansis 的 truecolor 部分外）做的都是同一件事：SGR 30-37/90-97/40-47/100-107 转义序列包装 + 环境检测。picocolors 用 76 行（2.6 KB）做完了全部。
- picocolors 的检测顺序（源码实读，`picocolors.js` 第 3-5 行）——这是零依赖复刻的规范参考：

```js
let isColorSupported =
  !(!!env.NO_COLOR || argv.includes("--no-color")) &&
  (!!env.FORCE_COLOR || argv.includes("--color")
    || p.platform === "win32"
    || ((p.stdout || {}).isTTY && env.TERM !== "dumb")
    || !!env.CI)
```

即：**NO_COLOR / --no-color 是硬否决 → FORCE_COLOR / --color / win32 平台 / (stdout.isTTY 且 TERM!=dumb) / CI 任一成立即开色**。空字符串 `NO_COLOR=""` 不触发禁用（`!!"" === false`），符合 no-color.org 的 "present and not empty" 约定。

**推荐**：零依赖复刻（直接抄 picocolors，ISC license 宽松，76 行含全套 16 色 + bright + bg + 嵌套转义修复 `replaceClose`）。如果团队倾向"引一个库而不是抄代码"，选 **picocolors**（体积/依赖最小、下载 1.9 亿/周证明供应链极稳）或活跃维护的 **ansis**；chalk 6 合理但 API 更重（链式 Builder），对 435 行的 CLI 收益有限。

## 2. 进度 / spinner 对比

| 库 | 最新版 | 发布日期 | 周下载 | license | 直接依赖 | 维护 |
|---|---|---|---|---|---|---|
| **ora** | 9.4.1 | 2026-06-22 | ~7,258 万 | MIT | 8（chalk, cli-cursor, cli-spinners, is-interactive, is-unicode-supported, log-symbols, stdin-discarder, string-width） | 活跃，事实标准 |
| **yocto-spinner** | 1.2.2 | 2026-07-16 | ~785 万 | MIT | 1（yoctocolors，其本身 0 依赖） | 活跃（sindresorhus），Vercel 系风格 |
| **nanospinner** | 1.2.2 | 2024-12-09 | ~261 万 | MIT | 1（picocolors） | 低频维护 |
| **cli-progress** | 3.12.0 | 2023-02-19 | ~921 万 | MIT | 1（string-width） | 3 年半未发布，功能冻结 |

源码级证据（GitHub raw 实读）：

- **yocto-spinner**（`index.js`，433 行）：`isInteractive = stream.isTTY && TERM !== 'dumb' && !('CI' in env)`。**非交互模式行为完全符合 FAR-Lab 纪律**：`start()` 只在 interactive 时起 `setInterval`；非 TTY 时 `#render()` 直接 `string += '\n'` 一次性打印文本，零动画。433 行里大部分是边缘治理：synchronized output（mode 2026）、hook `stream.write` 防并发输出交错、SIGINT/SIGTERM 清理、光标隐藏/恢复、多行清行。
- **nanospinner**（`src/index.ts`，198 行）：同样 TTY 才 loop，非 TTY 打一行；清理用 `\x1b[1G`/`\x1b[2K`/`\x1b[1A`。
- **Unicode 坑的直接证据**（yocto-spinner 源码）：`isUnicodeSupported = platform !== 'win32' || WT_SESSION || TERM_PROGRAM === 'vscode'`——**Windows 上非 Windows Terminal/VSCode 终端时，spinner 帧从盲文 `⠋⠙⠹…` 退回 ASCII `-\|/`**，符号 `✔/✖/⚠/ℹ` 退回 `√/×/‼/i`。

**推荐**：FAR-Lab CLI 是研究工作流的状态/阶段报告，不是长时间单任务等待动画。**首选零依赖静态文本进度**：`\r` + 清行 + `[12/40] stage=hypothesis` 风格，非 TTY（重定向/管道/CI）自动降级为逐行打印——这正是 yocto-spinner 非 TTY 分支的行为，抄它这 10 行逻辑即可，~50 行。若未来确实要 spinner，引 **yocto-spinner**（1 个直接依赖，行为纪律与 FAR-Lab 一致）。ora 功能最全（多 spinner、任务成功/失败符号）但 8 个依赖换来的能力 FAR-Lab 用不上；cli-progress 三年半未更新且进度条渲染对研究报告场景偏重。

## 3. 表格库对比

| 库 | 最新版 | 发布日期 | 周下载 | license | 直接依赖 | 维护 |
|---|---|---|---|---|---|---|
| **cli-table3** | 0.6.5 | 2024-05-12 | ~2,816 万 | MIT | 1（string-width） | 稳定低频（表格渲染是已完成问题） |
| **tty-table** | 5.0.0 | 2025-11-09 | ~56 万 | MIT | 7（chalk, csv, kleur, smartwrap, strip-ansi, wcwidth, yargs） | 活跃但重：连 yargs 都进依赖 |

知名 CLI 采用证据（见第 6 节）：`@nestjs/cli` 与 `cypress` 都用 **cli-table3**；本次调研的 9 个头部工具中 **0 个用 tty-table**。tty-table 的价值（CSV 导出、自动换行、yargs 集成）与 FAR-Lab 需求不匹配，且 7 个依赖里引入了 yargs 整套参数解析。

**推荐**：FAR-Lab 现有输出（runs 列表、checks 列表、providers 列表）都是"固定 3-4 列的状态行"，不是任意宽度边框表格。**零依赖 padEnd 增强**（~40-60 行：列宽采样 + CJK 双宽字符修正 + 超宽截断）足够。cli-table3 唯一实质增量是 `string-width` 的东亚字符宽度表——而这个坑在第 7 节单独给了 15 行的近似解。若未来要做带边框的多行表格（如 hypothesis 对比矩阵），再引 cli-table3（它就是该领域的默认答案）。

## 4. 交互提示库对比

FAR-Lab 明确需要：**确认提示（confirm）+ 选择器（select）**。

| 库 | 最新版 | 发布日期 | 周下载 | license | 直接依赖（树深） | 维护 |
|---|---|---|---|---|---|---|
| **@clack/prompts** | 1.7.0 | 2026-07-03 | ~1,543 万 | MIT | 4（@clack/core, fast-string-width, fast-wrap-ansi, sisteransi）；@clack/core 再依赖 sisteransi + fast-wrap-ansi → **去重后约 6-7 个小包** | 活跃（bombshell-dev/clack，8.0k stars） |
| **@inquirer/prompts** | 8.6.0 | 2026-08-19 | ~3,085 万 | MIT | 10 个子 prompt 包；@inquirer/core 又带 cli-width, mute-stream, signal-exit, @inquirer/ansi, @inquirer/type, fast-wrap-ansi, @inquirer/figures → **树深、包多但都是小工具** | 非常活跃（2026-08-19 刚发版） |
| **enquirer** | 2.4.1 | 2023-07-28 | ~2,837 万 | MIT | 2（ansi-colors, strip-ansi） | **3 年未发布**，nx/lighthouse 仍在用但新项目不应再选 |

API 覆盖（README 实读）：
- @clack/prompts：`intro/outro/isCancel/cancel, text, password, confirm, date, select, multiselect, autocomplete, selectKey, group, spinner, progress, tasks, log(info/success/warn/error), stream, taskLog`——confirm 和 select 都有，且带整套视觉语言（│ 引导线、●/◇ 符号）。
- @inquirer/prompts：模块化（`import { confirm, select } from '@inquirer/prompts'`），生态最大，是 npm 官方脚手架系（create-*）标配。
- enquirer：功能全但停更，pass。

**推荐**：这是唯一"自研不划算"的领域——select 需要 raw mode、ESC 序列按键解析、光标控制、Ctrl-C 语义、CI 检测，yocto-spinner 那 433 行已经展示了这类边缘治理的成本，一个健壮 select 只多不少。**若 FAR-Lab CLI 确需交互式选择器 → 引 @clack/prompts**（树最浅、视觉风格与"研究工作流"气质匹配、`spinner/progress` 与非 TTY 降级逻辑内建）。若交互需求只到"确认"——**用 `--yes` 非交互 flag + 默认值 + 30 行 stdin 读取**即可完全零依赖（这本身也是脚本化/自动化友好的 CLI 设计正道，pnpm 等工具对危险操作走 flag 而非 prompt）。

## 5. ink 是否过度：是（REJECT）

实测：**ink 7.1.1（2026-07-16，MIT）**，**25 个运行时依赖**，含 `react-reconciler`、`scheduler`、`yoga-layout`（布局引擎）、`ws`（WebSocket）、`chalk`、`wrap-ansi`、`slice-ansi`、`cli-boxes` 等；peer 依赖 react；周下载 ~505 万。

判断依据：
1. **依赖质量错配**：FAR-Lab 全 workspace 当前 runtime 依赖只有 zod 一个。为 CLI 视觉引入 React reconciler + yoga 布局引擎 + ws，是给 435 行的状态报告 CLI 配一套 GUI 运行时——直接违反 workspace constitution 的 "every framework must earn its complexity"。
2. **能力错配**：ink 的价值是实时重排的富 TUI（Cloudflare 曾用其做 wrangler 早期交互界面、GitHub CLI 的扩展生态有用），FAR-Lab 的核心输出是阶段状态、证据列表、验收报告——线性日志流，不需要组件树。
3. **知名 CLI 证据反向支撑**：本次调研的 9 个头部工具（npm/pnpm/vercel/wrangler/nest/nx/cypress/turbo/lighthouse）**没有一个 runtime 依赖 ink**。
4. ink 真正的适用场景：需要类 React 状态驱动的全屏 TUI（仪表盘、交互式向导），且团队已投资 React。FAR-Lab 若到那个阶段，届时再评。

## 6. 知名 Node CLI 实际用什么（证据级）

数据来源：npm registry `/latest` 的 `dependencies` 字段实读（即用户实际安装的发布包依赖，比 repo 根 package.json 更真实；打包型工具的视觉库在 bundle 内，显示为 0）。

| CLI | 版本 | runtime 依赖总数 | CLI 视觉相关依赖（实读） |
|---|---|---|---|
| **npm** | 12.0.2 | 68 | `chalk ^5.6.2`、`supports-color ^10.2.2` |
| **@nestjs/cli** | 11.0.24 | 18 | `ansis 4.2.0`（色）、`ora 5.4.1`（spinner）、`cli-table3 0.6.5`（表）、`@inquirer/prompts 7.10.1`（交互）——**教科书式四件套** |
| **nx** | 23.1.1 | 120 | `ora`、`chalk 4.1.2`、`enquirer`、`ansi-colors`、`picocolors`、`cli-spinners`、`log-symbols`、`figures`、`wrap-ansi`、`string-width`、`supports-color`…（历史包袱大杂烩，多版本并存） |
| **cypress** | 15.21.0 | 39 | `chalk ^4.1.0`、`cli-table3 0.6.1`、`log-symbols`、`supports-color`、`request-progress` |
| **lighthouse** | 13.4.1 | 26 | `enquirer ^2.3.6`（仅此一个视觉类） |
| **vercel** | 59.4.0 | 37 | 发布包无独立视觉库（藏在 `@vercel/*` 内部包/打包产物，具体实现 UNVERIFIED） |
| **wrangler** | 4.125.0 | 8 | 无视觉库（esbuild bundle，内部实现 UNVERIFIED） |
| **pnpm** | 11.22.0 | 0 | 单文件 bundle，视觉层内嵌（源码层面 pnpm 使用自有 ANSI 辅助，UNVERIFIED 细节） |
| **turbo** | 2.10.11 | 0 | 同上（npm wrapper，本体 Rust） |

模式结论：
1. **颜色**：头部工具在 chalk（npm/cypress/nx）与轻量零依赖库（ansis@nest、picocolors 系）之间分化；趋势是向轻。
2. **表格**：cli-table3 是唯一被采用者（nest、cypress），tty-table 零采用。
3. **spinner**：ora 是事实标准（nest、nx），但都是"长时间构建等待"场景的工具。
4. **交互**：分化为 @inquirer/prompts（nest）、enquirer（nx/lighthouse，存量）、或干脆非交互 flag。
5. **最关键的反共识证据**：性能/工程纪律最强的四个工具（pnpm、turbo、wrangler、vercel）**发布包视觉依赖为 0**——它们把（通常很薄的）视觉层写死/bundle 进自己代码。"零视觉依赖 + 自写薄层"不是廉价方案，是头部工具的一致选择。

## 7. 零依赖替代的真实成本

### 7.1 行数估算（以实读源码为锚）

| 能力 | 锚（实读） | FAR-Lab 所需估算 |
|---|---|---|
| 16 色 ANSI 映射 + 修饰符 + 环境检测 | picocolors 整库 **76 行 / 2.6 KB**（含嵌套修复） | **~76 行**（直接抄，ISC） |
| 静态进度（`\r` 清行 + 计数） | yocto-spinner 非 TTY 分支 ~10 行逻辑 | **~50 行**（含 TTY 判定 + 降级 + 长度重算） |
| padEnd 表格（列宽 + 截断 + CJK 宽度） | 项目 main.ts 已用 padEnd；cli-table3 的增量主要是 string-width | **~40-60 行** |
| confirm（y/n 读行 + 默认值 + `--yes`） | — | **~30 行**（无 raw mode） |
| select 选择器（raw mode + 按键解析） | @clack/core headless 层 + 渲染层合计上千行 | **~150-250 行且坑多** → 不建议自研 |
| **合计（组合 A）** | | **~170-220 行，0 新依赖** |

### 7.2 坑清单（按踩坑概率排序）

1. **NO_COLOR / FORCE_COLOR 检测顺序**：必须照 picocolors 的顺序写——`NO_COLOR`（非空）与 `--no-color` 是**硬否决**，先于一切；`FORCE_COLOR`/`--color`/win32/isTTY/CI 任一为真才开色。顺序写反（比如先查 isTTY 再查 NO_COLOR）会在 CI 里漏出颜色码污染日志。空字符串 `NO_COLOR=""` 应视为"未设置"。
2. **Windows ANSI 支持**：Microsoft Learn（Console Virtual Terminal Sequences，2025-08 更新版）确认：Windows 10 Anniversary Update 起 conhost 支持 VT/SGR 序列，但**原生 console 应用需经 `SetConsoleMode` 开启 `ENABLE_VIRTUAL_TERMINAL_PROCESSING`**；Windows Terminal / VSCode 终端无此要求。Node.js 的 TTY 流在 Windows 上由 libuv 侧启用 VT 处理（具体引入的 Node 精确版本号 UNVERIFIED，不做断言）。**生态实践证据**：picocolors 直接把 `platform === 'win32'` 判为支持颜色（不查 isTTY），说明"现代 Node + Win10+"下 ANSI 可用是行业共识；真正的风险残留在 Windows 8/老版 Server + 老 conhost，会显示原始转义码。
3. **Unicode 符号在 Windows 老终端变方块**：`✔ ⠋ ℹ` 在非 WT/VSCode 的 conhost 渲染异常。yocto-spinner 的判定可直接抄：`platform !== 'win32' || WT_SESSION || TERM_PROGRAM === 'vscode'`，否则退 ASCII（`√ - \ | / i`）。
4. **CJK 双宽字符导致 padEnd 错位**：`padEnd` 按 UTF-16 code unit 计数，中文/emoji 占 2 列却计 1，列必歪。FAR-Lab 输出含中文，必须自写宽度函数：`\u4e00-\u9fff`、全角标点等 range 计 2（15-25 行的近似实现即可覆盖中日韩 + 常用 emoji；完整 East Asian Width 表就是 string-width 那个包存在的理由——近似解的已知残缺：组合字符、罕见 emoji ZWJ 序列）。
5. **重定向 / 管道 / CI 降级**：`stdout.isTTY === false`（`| tee`、`> file`、CI）时：禁色 + 进度从 `\r` 原地刷新降级为逐行追加。两个 spinner 库的降级行为（打印一次 + `\n`）就是模板。
6. **stderr vs stdout**：进度/状态类输出写 stderr（不污染管道数据流），yocto-spinner 默认 `process.stderr`；FAR-Lab 若未来支持 `far-lab runs --json` 之类的机器输出，人读视觉必须全走 stderr。

### 7.3 结论

"只抄视觉"（16 色 + `\r` 静态进度 + padEnd 表格）真实成本 **~170-220 行 + 第 7.2 节 6 个坑的意识**，其中 5 个坑的现成答案就在 picocolors / yocto-spinner 源码里（本报告已引用行级出处）。唯一不值得自研的是**交互选择器**——那是 raw mode 输入处理的深水区。

---

## 8. 决策建议（oss-due-diligence 词汇）

- 颜色 / 静态进度 / 表格：**BUILD**（自研零依赖）。最强成熟替代 picocolors 仅 76 行 ISC——"引入依赖"与"抄写"的边际收益为负（供应链 + 版本管理 vs 76 行静态代码），符合 BUILD 决策的正当性要求。
- confirm：**BUILD**（`--yes` flag + stdin 读行 ~30 行），同时满足自动化/脚本友好。
- select（若需要）：**ADOPT @clack/prompts@1.7.0**（MIT；直接依赖 4 个、树浅；2026-07 活跃发版）。备选 @inquirer/prompts（更活跃更大）；enquirer REJECT（停更 3 年）。
- ora / cli-progress / tty-table / ink：**REJECT**（依赖或场景错配，理由见各节）。
- 复盘触发条件（reversal triggers）：CLI 演进为全屏 TUI → 重评 ink；出现任意宽度边框表格需求 → 重评 cli-table3；出现长时间任务动画等待 → 重评 yocto-spinner。

## 附录：数据复现命令

```bash
node -e "fetch('https://registry.npmjs.org/<pkg>').then(r=>r.json()).then(d=>{const l=d['dist-tags'].latest;console.log(d.name,l,d.time[l].slice(0,10),d.versions[l].license,Object.keys(d.versions[l].dependencies||{}).length)})"
node -e "fetch('https://api.npmjs.org/downloads/point/last-week/<pkg>').then(r=>r.json()).then(d=>console.log(d.package,d.downloads))"
```

源码实读（本报告引用）：`picocolors.js`（76 行）、`yocto-spinner/index.js`（433 行）、`nanospinner/src/index.ts`（198 行）、Microsoft Learn "Console Virtual Terminal Sequences"。
