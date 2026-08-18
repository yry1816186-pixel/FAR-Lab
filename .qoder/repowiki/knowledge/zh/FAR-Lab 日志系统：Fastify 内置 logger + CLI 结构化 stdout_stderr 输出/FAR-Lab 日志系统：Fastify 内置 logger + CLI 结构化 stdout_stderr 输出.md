---
kind: logging_system
name: FAR-Lab 日志系统：Fastify 内置 logger + CLI 结构化 stdout/stderr 输出
category: logging_system
scope:
    - '**'
source_files:
    - src/api/server.ts
    - src/api/errors/error_handler.ts
    - src/api/routes/metrics.ts
    - src/cli/render.ts
    - src/cli/far.ts
    - src/cli/commands/doctor.ts
---

## 1. 使用的系统与框架

仓库没有引入第三方日志库（`package.json` 的 dependencies/devDependencies 中无 `pino`、`winston`、`bunyan`、`debug`、`signale`、`chalk` 等）。日志体系由两部分组成：

- **HTTP API 层**：使用 Fastify 5 内置的 `logger` 选项。`src/api/server.ts` 在 `buildServer()` 中以 `logger: config.logger ?? true` 启用，默认开启；测试通过传入 `logger: false` 关闭以抑制请求日志。
- **CLI / 进程入口**：不使用任何日志框架，直接通过 `process.stdout.write`、`process.stderr.write` 和 `console.log/warn/error` 输出人类可读文本或 JSON 结果。

## 2. 关键文件与位置

| 组件 | 关键文件 | 作用 |
|---|---|---|
| HTTP 服务器初始化 | `src/api/server.ts` | 创建 Fastify 实例并设置 `logger` 开关 |
| 统一错误响应 | `src/api/errors/error_handler.ts` | 将错误转为 RFC 7807 Problem Details JSON，不打印堆栈 |
| Prometheus 指标 | `src/api/routes/metrics.ts` | 暴露 `/metrics` 文本格式指标（uptime、内存、evidence_log、verdict 计数等） |
| CLI 渲染层 | `src/cli/render.ts` | ANSI 颜色、spinner、进度条、表格、状态徽章（零依赖、非 TTY 降级） |
| CLI 入口 | `src/cli/far.ts` | 命令注册表 + `main()` 委托 `runCli`，所有子命令 lazy import |
| 诊断命令 | `src/cli/commands/doctor.ts` | 环境自诊断，捕获 `process.stdout` 输出以便组合报告 |
| 脚本工具 | `scripts/*.ts`、`ci/*.ts` | 构建/CI 脚本用 `console.log`/`console.error` 输出结果 |

## 3. 架构与设计约定

### 3.1 HTTP 层：Fastify 内置 logger
- 默认开启（`config.logger ?? true`），测试可显式传 `logger: false` 保持安静。
- 注释明确说明“Fastify 默认不记录请求头/Authorization（无密钥泄漏面）”。
- 未自定义 log level、未注入 pino 适配器——完全依赖 Fastify 默认的 pino 配置。

### 3.2 CLI 输出：stdout 为主，stderr 用于错误
- 正常输出走 `process.stdout.write`（如 `far fsm advance` 的 receipt JSON、`far export far-proof` 的输出），便于管道重定向。
- 错误/用法提示走 `process.stderr.write`（如未知参数、缺失必需参数、子命令名错误）。
- 退出码语义：`0` = 成功，`1` = 运行时失败，`2` = 参数/用法错误（见 `doctor.ts` 注释“exit code: 0 ok / 1 fail / 2 warn”）。

### 3.3 结构化 vs 人类可读
- CLI 支持 `--json` 标志切换机器可读输出（JSON）与人类可读输出（带 ANSI 颜色的表格/徽章），由 `src/cli/render.ts` 提供跨平台安全的 ANSI 渲染。
- `render.ts` 遵循 NO_COLOR 规范：当 `process.env.NO_COLOR` 存在且非空时禁用 ANSI。
- 非 TTY 环境自动关闭 spinner/进度条，避免污染结构化输出。

### 3.4 观测面：指标而非日志
- 项目刻意通过 `/metrics`（Prometheus 文本格式）暴露运行期指标，而不是把业务数据写入日志文件。
- 指标包括：进程 uptime、内存、evidence_log 行数、call_record 总数、verdict 分布、LLM fallback 降级计数、FTS 索引大小等。

### 3.5 错误处理：RFC 7807 Problem Details
- 所有 API 错误经 `errorHandler` 统一转换为 `{ error_code, message, source_anchor, detail? }` 的 JSON，HTTP 状态码映射清晰（400/404/429/500/503）。
- 内部异常不泄露堆栈，仅返回通用 `INTERNAL_ERROR`。

## 4. 约定与约束

| 约定 | 来源/证据 |
|---|---|
| HTTP 层默认开启 Fastify logger，测试需显式关闭 | `src/api/server.ts` L122-124 注释 + 大量测试传 `logger: false` |
| Fastify logger 不记录 Authorization/请求头 | `server.ts` 注释 “Fastify 默认不记录请求头/Authorization” |
| CLI 正常输出走 stdout，错误走 stderr | `far.ts` 中多处 `process.stdout.write` / `process.stderr.write` 模式 |
| CLI 退出码 0/1/2 分别表示成功/失败/用法错误 | `doctor.ts` 顶部注释 “exit code: 0 ok / 1 fail / 2 warn” |
| 禁止 ANSI 污染管道输出 | `render.ts` 检测 `NO_COLOR`、`isTTY`，非 TTY 静默 spinner |
| 业务观测通过 `/metrics` 暴露，不写日志文件 | `src/api/routes/metrics.ts` 注释 “零新依赖（手写 Prometheus 文本格式）” |
| 无第三方日志库依赖 | `package.json` dependencies/devDependencies 中无 pino/winston/bunyan/debug/signale |
| 错误响应统一为 RFC 7807 Problem Details | `src/api/errors/error_handler.ts` 注释 “RFC 7807 Problem Details 子集” |

## 5. 结论

该仓库**没有独立的日志子系统**：HTTP 层依赖 Fastify 内置 logger（默认开启），CLI 层直接使用 Node.js 标准 I/O 流输出结构化 JSON 或人类可读文本，并通过 `/metrics` 端点暴露 Prometheus 指标作为主要观测手段。这种设计保持了极低的依赖面（零第三方日志库），同时通过 `--json` 标志、stderr 错误通道和 Prometheus 指标实现了机器可读性与可观测性。