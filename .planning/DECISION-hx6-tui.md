Status: EXECUTED (packages/tui landed; residuals are user-physical: npm publish after login, mintty raw-mode feel-check) — 2026-08-24

# HX6 终端 TUI — 依赖面决策请求（需用户裁决后动工）

Scout B 报告（research/hx/scout-b-terminal-agents.md）定案：Ink（React）+ 独立包 + inline+Static 默认 + rawMode 失败降级 readline（Git Bash/mintty 现实）。但产品宪法 `DEPENDENCY_POLICY.md`：Node 产品 `dependencies` 恰好 = zod。Ink+React（约 1.2MB 解包、React18 peer）无论怎么放都是新的**运行时依赖面**，触发全局变更确认线。三个选项：

## A. 独立发布包 `@far-lab/tui`（推荐）
- TUI 全部代码进新目录（如 `packages/tui/`），自身 package.json 声明 ink/react 依赖，独立 lockfile（experiment-runtime 先例：隔离+锁死）
- 主产品 `far` 命令**零改动**；用户 `npm i -g @far-lab/tui` 后获得 `far tui` 交互模式；未安装时 `far` 提示安装指引（诚实能力边界）
- zod-only 不变量完好；发布面多一个包
- 工作量：~2-3 个施工段（composer/流式渲染/审批/resize+降级链+@xterm/headless 快照测试）

## B. optionalDependencies + 动态 import
- ink/react 进主包 optionalDependencies；`far tui` 动态 import，缺失降级 readline
- 依赖面政策需修订（optionalDependencies 首次出现）；安装体积+锁文件复杂度上升；政策先例风险（下一个"只是可选"的依赖会更容易进来）

## C. 纯 readline 行式增强（零新依赖）
- 无全屏 TUI；做：交互式 composer（多行/历史/粘贴安全）、彩色阶段流、审批 y/n、NO_COLOR 降级——约 A 的 30% 体验、10% 工作量
- 不违反任何不变量，今天就能开工；但达不到任务书"SSH+terminal 舒服完成核心科研工作"的终局标准

**建议：A**（终局标准合规+不变量完好）；若想先快速见效可 C 先行、A 并行。

## HX7（验收旅程正式走查 + Tauri 回归）
不依赖上述裁决，可与 A/C 并行执行。

— 请裁决 A/B/C（或组合），裁决后立即动工。
