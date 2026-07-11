# FAR-Chain 开源发布形态决策（阶段 1）

> 依据：`docs/governance/OPEN_SOURCE_AUDIT.md`（阶段 0 审计）。
> 性质：发布形态的**工程决策 SSOT**。每项决策附理由与诚实标注。涉及不可逆 / 需人类凭证的标 `NEEDS_HUMAN_*`。
> 原则：v0.1.0 = **已实装 + offline 可跑** 的核心价值，发布形态补齐；不伪造、不夸大、不默认调真实 API。

---

## 1. 项目主入口命令

**`far`**（保留现状，不改名）。

理由：`package.json` 已声明 `"bin": {"far": "src/cli/far.ts"}`，16 子命令已实装且 HELP_TEXT 详尽。改名=破坏既有用户与文档，零收益。`packages/cli` 的包名 `@far-chain/cli` 保留。

---

## 2. 普通用户安装方式

**install 脚本（curl / irm 一键）→ `far doctor` → `far demo tess-offline`**。

```
# macOS / Linux / WSL
curl -fsSL <RELEASE_URL>/install.sh | bash
far doctor
far demo tess-offline
```

`install.sh` 行为：clone 仓库到 `~/.far-chain` → `pnpm install`（仅 Node 依赖）→ `pnpm link --global` 注册 `far` → 探测 Python（缺失只 WARN）→ 跑 `far doctor`。

**`NEEDS_RELEASE_PUBLICATION`**：在 GitHub Release 首次发布前，curl 链接用占位符 `https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.sh`，README 标注「Release 发布后生效；当前请用 git clone 开发者安装」。

---

## 3. 开发者安装方式

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install --frozen-lockfile
node scripts/ensure_py_deps.mjs   # 探测 Python 验证轴（缺失只 WARN/skip）
pnpm ci-all                        # 完整 CI 门
```

`Makefile` 保留（`make bootstrap`/`verify`/`demo`），但 README 主推 `pnpm`（Windows 无 make 时直接用 pnpm 命令，Makefile 注释已说明）。

---

## 4. Docker 安装方式

```bash
docker compose up far-demo   # 一键 offline demo（无需 API key）
```

默认 service 跑 offline demo / Web Cockpit。需 live provider 时显式 `.env`（`DASHSCOPE_API_KEY=...`）传入，**默认绝不读取宿主 .env / 注入 key**。

---

## 5. Windows PowerShell 安装方式

```powershell
irm <RELEASE_URL>/install.ps1 | iex
far doctor
far demo tess-offline
```

`install.ps1` 检测 PowerShell 版本、winget/可用 Node、git；优先用 Corepack 启用 pnpm。同样 `NEEDS_RELEASE_PUBLICATION`。

---

## 6. macOS / Linux 安装方式

`install.sh`（见 §2）。检测 `uname -s`（Darwin/Linux/WSL）+ `uname -m`（x86_64/arm64）。不要求 root，装到用户目录 `~/.far-chain`。

---

## 7. 是否发布 PyPI

**v0.1.0：不发布。Roadmap。**

理由：`pyproject.toml` 的 `far-chain-repro` 是 Python 确定性复算**助手包**（非核心 CLI），且依赖 `repro/` 目录结构。独立发布 PyPI 需整理打包边界。v0.1.0 用 `pip install -e .`（开发者本地 editable）。标注 `NEEDS_PYPI_PUBLISH`（roadmap）。

---

## 8. 是否发布 npm

**v0.1.0：发布根 package `far-chain`，但标注 Node 24 技术约束。**

技术难点（审计 §2）：项目无 dist build，根 `package.json` 的 `bin.far` 指向 `src/cli/far.ts`，依赖 Node 24 type-stripping。发布包必须把 `src/`、`examples/tess-offline/`、`schema/migrations/`、`golden_vectors/cases/`、`pyproject.toml` 与运行时脚本一起打进 tarball。

**v0.1.0 务实选择**：`.github/workflows/publish-node.yml` 对根包执行 `npm pack` + 独立目录 `npm install --omit=dev` + `far version` smoke，真实发布时强制从 `v*` tag 运行且 tag/root/CLI version 三者一致。发布前仍需配置 `NPM_TOKEN`，标注 `NEEDS_NPM_PUBLISH`。

---

## 9. 是否发布 Docker image 到 GHCR

**是。** `release.yml` 在 tag 触发时 `docker build/push` 到 `ghcr.io/yry1816186-pixel/far-lab:<tag>`。默认 image 跑 offline demo。标注 `NEEDS_GHCR_PUBLISH`（首次需人类配置 GHCR 权限 + PAT）。

---

## 10. 是否发布 GitHub Release assets

**是。** `release.yml`（tag `v*` 触发）产出：
- `install.sh` / `install.ps1`（从仓库 scripts/ 复制到 release assets）
- `SHA256SUMS`（checksum）
- npm tarball（根 package `far-chain`，由 publish-node workflow 另行验证/发布）
- docker image digest 引用
- 自动生成 release notes（from CHANGELOG + commits）

**`NEEDS_RELEASE_PUBLICATION`**：首次 tag 推送 + Release 发布需人类操作（见 §阶段8）。

---

## 11. 是否需要 Homebrew tap

**v0.1.0：不需要。Roadmap。** Homebrew tap 维护成本高，v0.1.0 用户量不足以支撑。install.sh 已覆盖 macOS。标注 roadmap。

---

## 12. 哪些功能进入 v0.1.0

全部 **已实装 + offline 可跑** 的能力：

- `far` CLI 16 子命令（含新增 `doctor` / `version` / `demo tess-offline` / `verify <positional>`）
- 确定性 R0-R9 五值裁决内核
- 14 Golden Vectors（node/browser 轴）
- FEC V2 编译 + fecHash 篡改检测
- `far export far-proof --demo-chain` + `far verify --bundle`（自验证证明包）
- Python `repro/` 跨语言哈希一致性
- `far api` + frontend Web 仪表盘（offline demo）
- 持久化 `examples/tess-offline/` demo 产物
- install.sh / install.ps1 / Docker / `far doctor`
- 双语 README + 分层 docs + issue/PR 模板 + CITATION

---

## 13. 哪些功能只进入 Roadmap

- 真实多模型 provider 接线（court/arena `--models` 接真实 LLM）— `NEEDS_API_VALIDATION`
- TESS live 数据下载（lightkurve/astroquery）— `NEEDS_REAL_ENV`（P1-6）
- 真实 SymPy/Z3/Dafny/Lean 形式化验证器 spawn — `NEEDS_REAL_ENV`（P2-1）
- 真实 OS 级 sandbox 隔离（07 §188）
- 多节点 PostgreSQL 部署（当前 SQLite 单机）
- PyPI 发布 / Homebrew tap
- 浮点序列化 RFC 8785 JCS 规范化（当前字符串键哈希已证明）
- 音频/视频/表格多模态（当前仅视觉 Qwen-VL）
- 比赛 platform 提交 / GPU 实验 — `NEEDS_GPU_VALIDATION` / `NEEDS_HUMAN_OPERATION`

---

## 14. README 顶部应该展示哪三条命令

```
# 30 秒安装（macOS / Linux / WSL）
curl -fsSL https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.sh | bash
far doctor              # 环境自诊断（无 key 只 WARN 不失败）
far demo tess-offline   # 一键 offline demo（篡改可检测 · 无需任何凭据）
```

（Release 发布前，第一条替换为开发者安装块，并标注 `NEEDS_RELEASE_PUBLICATION`。）

---

## 15. `far doctor` 应检查哪些内容

| # | 检查项 | 失败行为 |
|---|--------|----------|
| 1 | OS / shell / arch | INFO |
| 2 | Node 版本（≥24？） | **FAIL**（type-stripping 硬依赖） |
| 3 | pnpm 是否可用 | WARN（可用 npx 补救指引） |
| 4 | Python 版本（3.11/3.12？） | WARN（offline demo 不依赖 Python；科研轴 skip） |
| 5 | git 是否存在 | WARN |
| 6 | Docker 是否存在 | INFO（可选） |
| 7 | 项目 Node 依赖已安装（`node_modules`） | **FAIL**（指引 `pnpm install`） |
| 8 | Python 依赖（sympy/z3）可 import | WARN（缺失→Python 轴 skip，非阻塞） |
| 9 | `examples/` 存在且含 tess-offline | WARN |
| 10 | `schema/migrations/` 存在 | WARN |
| 11 | 能加载最小 `.far-proof` fixture | **FAIL**（核心能力损坏） |
| 12 | 能 offline verify（`far verify --bundle` 最小 fixture） | **FAIL**（核心能力损坏） |
| 13 | provider key（`DASHSCOPE_API_KEY`）是否配置 | **只 WARN，绝不 FAIL** |
| 14 | `far doctor --live-qwen-smoke` 真实 API smoke | **默认不调用**；仅显式参数时跑，且需 key，缺 key 报错退出 |

**退出码**：0 = 全绿 / 1 = 有 FAIL（核心损坏）/ 2 = 仅 WARN（可用但受限）。`far doctor` 默认零网络、零 API、零密钥读取。

---

## 决策记录

| 决策 | 理由 |
|------|------|
| 主入口 `far` 不改名 | 已实装 16 命令，改名零收益高破坏 |
| npm 发布纳入 v0.1.0 但带技术约束 | 无 dist build + Node24 type-stripping 是硬约束，须打包 src/ 且 engines 锁定 |
| PyPI / Homebrew 推迟 | 维护成本 vs 用户量不匹配 |
| Docker 默认 offline | 红线：默认不要求 key、不调真实 API |
| `far doctor` key 只 WARN | 红线：无 key 不阻塞 offline 体验 |
| GitHub org 用实际 remote `yry1816186-pixel/FAR-Lab` | 修正 `packages/cli` 的错误 `repository.url`（审计 §15） |
| 许可证保留 MIT | 已存在（审计 §12）；变更须人类确认，不擅自改 |
