---
kind: configuration_system
name: FAR-Lab 配置系统：分层解析、类型化 Schema 与来源谱系
category: configuration_system
scope:
    - '**'
source_files:
    - src/platform/config.ts
    - .env.example
    - src/cli/parse_options.ts
    - src/cli/paths.ts
    - package.json
    - pyproject.toml
    - frontend/vite.config.ts
    - schema/json/data-manifest.schema.json
    - schema/json/proof-envelope.schema.json
    - schema/json/verdict.schema.json
    - schema/openapi.json
---

## 1. 总体方案

FAR-Lab 采用「声明式 typed schema + 五层优先级解析 + 来源 provenance」的配置体系，核心位于 `src/platform/config.ts`。该模块定义了统一的 `ConfigSpec`（key/type/default/sensitive/experimental/description），并通过 `resolveConfig()` 按固定顺序从各层取值：`runtime-arg > cli > env > file > default`。所有键必须匹配正则 `^[A-Z][A-Z0-9_]*$`（ENV_STYLE_UPPER），未知键通过 `checkUnknownKeys()` 默认 reject（显式收紧）。

实验功能受宪法约束：标记 `experimental: true` 的键只能由 `runtime-arg` 或 `cli` 两层开启，来自 `env`/`file` 的开启值会被降级为默认 OFF，并记录 violation。

敏感字段在生成的 provenance 中一律 mask 为 `***`（连长度也不泄露），保证运行审计可复现且不泄漏凭据。

## 2. 关键文件与包

- `src/platform/config.ts` — 单一 typed 配置 schema、层级解析器、unknown-key 门、provenance 导出、spec diff 工具。
- `.env.example` — 环境变量模板，列出 `DASHSCOPE_API_KEY`、`COMPETITION_BASE_URL`、`OPENAI_COMPATIBLE_BASE_URL`、`PORT`、`HOST`、`NODE_ENV` 等；明确 `.env` 被 gitignore，禁止提交真实密钥。
- `package.json` — Node 引擎要求 `>=24.0.0`，定义 `bin.far = src/cli/far.ts`，脚本统一通过 `scripts/*.mjs` 编排测试/构建。
- `pyproject.toml` — Python repro 包的依赖锁定（numpy/sympy/z3-solver/threadpoolctl），可选 `science` 依赖（lightkurve/astroquery）仅在真实 TESS 场景手动安装，缺失时优雅降级。
- `frontend/vite.config.ts` — 前端开发服务器端口 5173，代理 `/api/v1`、`/health`、`/ready` 到 `localhost:3000`；可通过 `VITE_API_BASE_URL` 覆盖跨源部署。
- `src/cli/parse_options.ts` — 无外部依赖的声明式 CLI 参数解析器（支持 `--flag value` / `--flag=value` / boolean / enum / positional / validate），错误收集后由调用方 fail-closed。
- `src/cli/paths.ts` — 重导出共享路径工具（PACKAGE_ROOT、crossPlatformTmpDir 等），CLI 命令统一通过此入口获取平台无关路径。
- `schema/json/*.schema.json` + `schema/migrations/*.sql` + `schema/openapi.json` — 数据契约与数据库迁移作为运行时存储配置的单一事实源。

## 3. 架构与约定

### 3.1 配置来源与优先级

| 层级 | 说明 | 示例 |
|---|---|---|
| runtime-arg | 函数调用传入，最高优先级 | `resolveConfig(specs, { runtimeArg: { ... } })` |
| cli | CLI 标志解析结果 | `--profile competition_aliyun_qwen` |
| env | `process.env` 读取 | `FAR_DASHSCOPE_API_KEY`、`PORT` |
| file | 配置文件（当前未实现加载器，预留层） | 预留 |
| default | `ConfigSpec.defaultValue` | 安全默认值 |

### 3.2 现有已收编的环境变量（CONFIG_SPECS）

- `FAR_DASHSCOPE_API_KEY` — DashScope 模型凭据，`sensitive: true`，缺失时 LLM 端点 fail-closed。
- `FAR_RETRIEVAL_CACHE` / `FAR_RETRIEVAL_CACHE_DIR` — VCR 检索缓存开关与根目录。
- `FAR_RESEARCH_RUNS_DIR` — 研究 run 存储根（`.far/research-runs`）。
- `FAR_RESEARCH_MEMORY` — 研究记忆 store 开关。
- `FAR_SESSION_RECORD` — 会话录制，`experimental: true`，仅 runtime-arg/CLI 可开。
- `PORT` — API 服务端口（默认 3000）。
- `CROSSREF_MAILTO` / `OPENALEX_MAILTO` — 礼貌池邮箱。

此外，多处代码仍直接读取 `process.env.DASHSCOPE_API_KEY`（兼容旧键）、`FAR_JWT_SECRET`、`PYTHONPATH`（用于子进程隔离 Python 环境）等，这些尚未全部迁移至 CONFIG_SPECS，属于渐进迁移中的遗留模式。

### 3.3 前端配置

前端通过 Vite 内置的 `import.meta.env.*` 注入构建期常量，并在 `vite.config.ts` 中以相对路径代理后端 API；生产部署时可设置 `VITE_API_BASE_URL` 绕过代理直连远端 API。

### 3.4 Python 侧配置

Python repro 包通过 `pyproject.toml` 声明依赖版本范围，不依赖环境变量；科学数据集获取（lightkurve/astroquery）作为 optional-dependency，缺失时 `dataset_fetch.py` 返回 `{ok: false}` 并回退到 cached fixture。

## 4. 约定与约束

- **键命名**：所有 CONFIG_SPECS 的 key 必须符合 `^[A-Z][A-Z0-9_]*$`（ENV_STYLE_UPPER），新增配置必须在此登记。
- **实验功能默认 OFF**：`experimental: true` 的键不能通过 env/file 开启，违反即记录 violation —— 这是宪法级红线。
- **敏感字段 mask**：provenance 输出中敏感值一律替换为 `***`，不得泄露原始值或长度。
- **未知键拒绝**：`checkUnknownKeys()` 默认 reject 未在 specs 中声明的键，防止拼写错误或废弃键静默生效。
- **默认值变更需 diff**：`diffConfigSpecs()` 提供 before/after 规格对比，配合 CI 门禁强制行为/成本/风险审查。
- **.env 禁止入库**：`.env.example` 顶部警告 `.env` 被 gitignore，真实密钥不得提交仓库。
- **LLM 凭据双键兼容**：代码同时接受 `FAR_DASHSCOPE_API_KEY` 和 `DASHSCOPE_API_KEY`，新代码应优先使用 `FAR_*` 前缀。
- **Node 编译缓存**：`.env.example` 注明 Node ≥24 的 `NODE_COMPILE_CACHE` 行为，推荐绝对路径或 `NODE_DISABLE_COMPILE_CACHE=1`，避免污染仓库。
- **Python PATH 隔离**：多个 CLI 命令在执行 Python 子进程前临时修改 `PYTHONPATH` 指向 `.python-deps/bin`，执行后恢复，确保 repro 确定性。

## 5. 现状评估

配置系统已在 `src/platform/config.ts` 建立完整规范（schema、解析器、provenance、diff），但尚未完全收编全仓散落的 `process.env.*` 读取点——部分模块（如 `src/api/routes/research.ts`、`src/cli/commands/api.ts`、`ci/competition_qwen_smoke.ts`）仍直接访问环境变量。迁移策略是「规格表先行收编既有事实，消费端逐步改走统一接口」，属于渐进式治理而非一次性重构。
