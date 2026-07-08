# Installation

FAR-Chain 的主语言是 TypeScript（Node ≥ 24），科研验证轴用 Python 3.11+。前端是独立 npm 工作区。

## 环境要求

| 组件 | 版本 | 必需？ | 说明 |
|------|------|--------|------|
| Node.js | ≥ 24 | **必需** | CLI 用 Node 24 原生 type-stripping 跑 `.ts`（无 dist build） |
| pnpm | 10.x | 必需 | `corepack enable` 即可启用 |
| git | 任意 | 必需 | clone 仓库 |
| Python | 3.11 / 3.12 | 可选 | 仅科研验证轴（SymPy/Z3）；缺失则该轴 skip |
| Docker | 任意 | 可选 | `docker compose up` 一键 demo |

## 方式一：一键安装脚本（终端用户）

> `NEEDS_RELEASE_PUBLICATION`：以下 curl/irm 链接指向 GitHub Release asset，**首次 release 发布后生效**。
> 发布前请用「方式二：开发者安装」，`far` 命令完全一致。

**macOS / Linux / WSL**：
```bash
curl -fsSL https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.sh | bash
far doctor
far demo tess-offline
```

**Windows PowerShell**：
```powershell
irm https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.ps1 | iex
far doctor
far demo tess-offline
```

脚本行为（红线）：
- 装到用户目录（`~/.far-chain` / `%USERPROFILE%\.far-chain`），**不要求 root / 管理员**。
- 检测 Node ≥ 24 / pnpm / Python / git / Docker；缺失项给明确修复指引。
- **不写 API key**、**不下载大数据**、**不启动 GPU/云**。
- 安装完跑 `far doctor` 自诊断，打印下一步。
- 每步 fail-closed（`set -euo pipefail` / `$ErrorActionPreference='Stop'`），失败给明确错误。

## 方式二：开发者安装（git clone）

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install --frozen-lockfile      # Node 依赖
node scripts/ensure_py_deps.mjs      # 探测 Python 验证轴（缺失 graceful skip）
```

可选科研轴（SymPy/Z3 跨语言哈希一致性）：
```bash
pip install -e .                     # 核心科研依赖（threadpoolctl/numpy/sympy/z3-solver）
# 真实 TESS live 数据获取（重依赖·仅 NEEDS_REAL_ENV 场景手动装）：
# pip install -e ".[science]"        # lightkurve + astroquery
```

启用全局 `far` 命令：
```bash
pnpm link --global          # 或直接 node src/cli/far.ts <command>
```

Makefile（macOS/Linux）：`make bootstrap`（装依赖）/ `make verify`（CI 门）/ `make demo`（offline）。
Windows 无 make，直接用 pnpm 命令。

## 方式三：Docker

```bash
docker compose up far-demo      # 一次性 offline TESS demo（无 key）
docker compose up far-api       # 长驻 API server @ http://localhost:3000（offline）
```

默认 image 跑 offline demo / 匿名 API，**绝不**要求 key。真实 provider 需显式 env 文件：
```bash
echo "DASHSCOPE_API_KEY=sk-..." > .env
docker compose --env-file .env up far-api
```

> `NEEDS_DOCKER_BUILD_VALIDATION`：镜像设计基于 `node:24-slim` 标准模式；本地 daemon 未运行时无法
> 实测 build。发布到 GHCR 属 release workflow（`NEEDS_GHCR_PUBLISH`）。

## 全栈运行（API + Web 仪表盘）

```bash
pnpm api                                       # 终端 1：REST API @ http://localhost:3000
cd frontend && npm install && npm run dev      # 终端 2：Vite @ http://localhost:5173
```

前端默认连 `localhost:3000`（可用 `VITE_API_BASE_URL` 覆盖）。生产模式：
`pnpm api --persist ./far-chain.db --protected`（需 `FAR_JWT_SECRET`）。

## 故障诊断

| 症状 | 排查 |
|------|------|
| `far` 命令找不到 | `pnpm link --global`；或直接 `node src/cli/far.ts`；或检查 PATH 含 pnpm 全局 bin |
| `node src/cli/far.ts` 报 type-stripping 错 | Node < 24；`nvm install 24` 或装 Node ≥ 24 |
| `pnpm install` 失败 | 删 `node_modules` 重试；确认用 pnpm 10（`corepack enable`） |
| pnpm 报 "Ignored build scripts: esbuild" | 正常（pnpm 10 默认行为）；不影响 better-sqlite3（prebuilt）与 `far` 命令（fresh-clone 实测验证）。若需 vitest/tsx（dev）：`pnpm approve-builds` |
| Python 轴 skip | `node scripts/ensure_py_deps.mjs` 看探测输出；`pip install -e .` |
| better-sqlite3 native 加载失败 | 重装：`pnpm rebuild better-sqlite3`；或确认 Node ≥ 24 匹配 |
| 任何不确定 | `far doctor` —— 它会逐项告诉你哪里有问题 |

## 不可做的事（红线）

- ❌ 不要把 `.env` 或任何含真实 key 的文件提交（`.gitignore` 已忽略；见 [SECURITY.md](../SECURITY.md)）。
- ❌ 不要在 CI / 安装脚本里默认调真实 API（条件门 / 显式参数才调）。
- ❌ 不要把 offline demo 当 live demo 宣称。
