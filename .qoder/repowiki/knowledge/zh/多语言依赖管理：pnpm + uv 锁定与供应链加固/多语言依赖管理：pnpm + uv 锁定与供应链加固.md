---
kind: dependency_management
name: 多语言依赖管理：pnpm + uv 锁定与供应链加固
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - frontend/package.json
    - pyproject.toml
    - uv.lock
    - .npmrc
    - scripts/ensure_py_deps.mjs
    - scripts/check-supply-chain.mjs
    - .github/dependabot.yml
    - Makefile
---

## 1. 使用的系统与工具

仓库采用**双栈依赖管理**：
- **Node/TypeScript**：使用 `pnpm`（版本由 `package.json#packageManager` 锁定为 `10.29.3`），通过根级 `package.json`、`pnpm-workspace.yaml` 和 `pnpm-lock.yaml` 管理主工程及 `frontend/` 子工作区的依赖。
- **Python**：使用 `uv` 作为包管理器，`pyproject.toml` 声明项目依赖，`uv.lock` 作为完整解析锁文件；同时提供 `.python-deps/` 自包含目录用于测试时隔离安装。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `package.json` | 根 Node 工程声明（含 `bin`、`dependencies`、`devDependencies`、`pnpm.overrides`） |
| `pnpm-lock.yaml` | pnpm 解析后的精确依赖图（lockfile 即“依赖事实来源”） |
| `pnpm-workspace.yaml` | 仅声明 `onlyBuiltDependencies: [better-sqlite3]`，未启用 workspace 协议，前端通过独立 `frontend/package.json` 管理 |
| `frontend/package.json` | 前端 React/Vite 应用依赖声明 |
| `pyproject.toml` | Python 项目元数据与依赖范围（`threadpoolctl`、`numpy`、`sympy`、`z3-solver`） |
| `uv.lock` | uv 生成的全量解析锁文件（含所有 transitive 依赖的 sha256 hash） |
| `.python-deps/` | 运行时按需 pip 安装的隔离 Python 依赖目录 |
| `scripts/ensure_py_deps.mjs` | 启动时探测缺失模块并 `pip install --target .python-deps` 自动补齐 |
| `scripts/check-supply-chain.mjs` | CI 门禁脚本，强制所有直接依赖精确 pin |
| `.npmrc` | `engine-strict=true`、`save-exact=true` |
| `.github/dependabot.yml` | 每周更新 npm 与 GitHub Actions，按组（typescript / runtime / frontend）生成 PR |

## 3. 架构与约定

### Node 侧
- **精确版本锁定**：`check-supply-chain.mjs` 强制所有 `dependencies`、`devDependencies` 以及 `pnpm.overrides` 中的条目必须为纯数字 semver（如 `11.2.0`），禁止 `^`、`~` 等范围；同时校验 `pnpm-lock.yaml` 中每个 direct dep 的 `specifier` 与 `package.json` 完全一致。违反则 CI 退出码 1。
- **Lockfile 权威**：`.npmrc` 设置 `save-exact=true`，注释明确 “lockfile is the dependency ground truth”。`Makefile bootstrap` 使用 `pnpm install --frozen-lockfile` 拒绝非锁定安装。
- **引擎约束**：`engines.node >= 24.0.0` + `.npmrc engine-strict=true` 确保运行环境匹配。
- **原生依赖白名单**：`pnpm-workspace.yaml` 仅允许 `better-sqlite3` 构建，减少无关 native build。
- **安全覆盖**：通过 `pnpm.overrides` 将 `brace-expansion`、`fast-uri`、`find-my-way` 强制升级到已知安全版本。
- **自动化升级**：Dependabot 每周扫描 `/` 与 `/frontend`，按 TypeScript 生态、`better-sqlite3` 等分组生成 PR，commit message 前缀 `chore(deps)`。

### Python 侧
- **范围声明 + 锁文件**：`pyproject.toml` 用 `>=x,<y` 范围声明核心依赖（如 `numpy>=1.24,<3.0`），`uv.lock` 记录最终解析出的具体版本与全部 transitive 依赖的 sha256，实现可复现安装。
- **可选科学依赖**：`[project.optional-dependencies] science = ["lightkurve", "astroquery"]` 不进入核心依赖，仅在真实 TESS 取数场景手动安装；缺失时 `dataset_fetch.py` 返回 `{ok:false}` 走 cached_fixture 降级。
- **自包含隔离安装**：`ensure_py_deps.mjs` 在首次 import 失败时执行 `pip install --target .python-deps ...`，并通过 `PYTHONPATH` 指向该目录；若 pip 失败或超时（300s），以 exit 0 + warn 方式 graceful skip，不影响离线 demo / verify / kernel 等核心功能。
- **Python 版本约束**：`requires-python = ">=3.11"`，`uv.lock` 中 `resolution-markers` 区分 `python_full_version >= '3.12'` 与 `< '3.12'` 分支。

## 4. 约定与约束

- **Node 依赖必须精确 pin**：由 `scripts/check-supply-chain.mjs` 在 CI 中强制执行，任何 `^`/`~` 范围都会导致 PR 被拒。
- **pnpm lockfile 是事实来源**：`--frozen-lockfile` 安装 + lockfile specifier 一致性检查双重保障。
- **Python 依赖通过 uv.lock 锁定**：新增依赖需先 `uv lock` 生成/更新 `uv.lock`，再提交。
- **Python 依赖可优雅降级**：`ensure_py_deps.mjs` 对 pip 失败、import 失败、超时均做 graceful skip（exit 0），保证核心 TS 流程不受影响。
- **可选依赖显式分离**：science 相关依赖放入 `optional-dependencies`，不在默认安装路径中。
- **原生构建最小化**：`pnpm-workspace.yaml` 仅白名单 `better-sqlite3`，其余依赖避免不必要的 native build。
- **依赖升级自动化但受控**：Dependabot 按周推送 PR，开发者需人工审查后合并，commit message 统一前缀便于审计。
- **安全补丁优先于语义版本**：通过 `pnpm.overrides` 直接覆盖第三方传递依赖的安全漏洞版本，绕过上游发布节奏。

## 5. 适用性说明

本仓库存在完整的跨语言依赖管理体系（pnpm + uv + 自定义脚本 + CI 门禁），因此本类别适用且置信度为 high。