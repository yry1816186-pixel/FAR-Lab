---
kind: build_system
name: FAR-Lab 多语言构建与发布流水线（pnpm + Node/Python + Docker + GitHub Actions）
category: build_system
scope:
    - '**'
source_files:
    - Makefile
    - package.json
    - pyproject.toml
    - Dockerfile
    - .github/workflows/ci.yml
    - .github/workflows/build-integrity.yml
    - .github/workflows/release.yml
    - .github/workflows/security-audit.yml
    - frontend/package.json
    - scripts/ensure_native_deps.mjs
    - scripts/ensure_py_deps.mjs
    - scripts/run_py_tests.mjs
    - scripts/requirements_compile.mjs
    - scripts/check-supply-chain.mjs
    - scripts/coverage_gate.mjs
    - scripts/secret_scan.mjs
    - scripts/generate_sbom.mjs
    - scripts/verify_release_checksums.mjs
    - scripts/install.sh
    - scripts/install.ps1
---

## 1. 系统概览

FAR-Lab 采用 **pnpm workspace** 作为根级依赖管理与脚本编排中心，结合 **Makefile**、**Dockerfile** 与 **GitHub Actions** 工作流，统一构建 TypeScript 后端 CLI（`src/cli/far.ts`）、React/Vite 前端（`frontend/`）以及 Python repro 工具集（`repro/`）。构建产物通过 GitHub Release 分发源码安装脚本（`scripts/install.sh`、`scripts/install.ps1`），并推送 Docker 镜像至 GHCR；不发布到 npm registry。

- Node 版本：`>=24.0.0`（`package.json.engines`），CI 固定 `node:24`。
- pnpm 版本：`10.29.3`（`package.packageManager` + CI `PNPM_VERSION` 环境变量，双处 SSOT）。
- Python 版本：`>=3.11`（`pyproject.toml.requires-python`），CI 固定 `3.11`。
- 前端独立使用 `npm ci --legacy-peer-deps`（`frontend/package-lock.json`），非 root pnpm workspace 成员。

## 2. 关键文件与入口

| 角色 | 文件 | 说明 |
|---|---|---|
| 顶层入口 | `Makefile` | 暴露 `bootstrap`、`verify`、`demo`、`typecheck`、`test`、`test-py` 等目标，封装 pnpm/pip 调用 |
| 包元数据 | `package.json` | 定义 `bin.far`、`files`（发布清单）、`scripts`（test/lint/typecheck/build/smoke-core 等）、`dependencies`/`devDependencies`、`pnpm.overrides` |
| Python 包 | `pyproject.toml` | 定义 `far-lab-repro` 包、`repro/tests` pytest 路径、可选 `science` 依赖（lightkurve/astroquery） |
| 容器镜像 | `Dockerfile` | 基于 `node:24-slim`，预装 build-essential/python3 以支持 better-sqlite3 node-gyp 兜底，默认运行 `far demo tess-offline` |
| 主 CI | `.github/workflows/ci.yml` | 12+ 步串行门禁链（install → typecheck → lint → py_typecheck → test_ts → test_py → openapi_contract → test_registry → repro_check → cross_lang → competition_qwen_smoke → verify_chain/merkle_integrity → offline_release_smoke → latex_compile → blocking_gates） |
| 构建完整性 | `.github/workflows/build-integrity.yml` | R9-2 双构建（tsc + Vite）+ 可复现性校验（同 commit 两次 dist 哈希对比）+ 模型中立 grep |
| 安全审计 | `.github/workflows/security-audit.yml` | 每周 cron 执行 `pnpm audit`、`npm audit`、`pnpm audit signatures`、`check-supply-chain.mjs` |
| 发布流程 | `.github/workflows/release.yml` | tag v* 触发，校验 tag ↔ package.json version，运行全量质量门，生成 SBOM/SHA256SUMS，push GHCR 镜像，创建 GitHub Release |
| 前端构建 | `frontend/package.json` | `build = tsc -b && vite build`，`test = vitest run` |
| 辅助脚本 | `scripts/*.mjs` | 需求编译、覆盖率门禁、供应链检查、fuzz、secret scan、claim_lint、doc_command_check 等 |

## 3. 架构与约定

### 3.1 分层构建

1. **依赖层**：`pnpm install --frozen-lockfile`（Node）+ `pip install -e .`（Python repro 包）。
2. **类型检查**：`tsc --noEmit`（零容忍，ESLint `--max-warnings 0`）+ `tsc -b`（前端 tsconfig reference 感知）。
3. **测试层**：`node --test` 分片执行（3 shard，每 shard 带 `--test-timeout=180000`），Python 侧用 `unittest`（`pnpm run test:py`）。
4. **交叉语言一致性**：`tests/evidence_log/cross_lang_consistency.test.ts` 断言 TS `canonicalHash` 与 Python `canonical_hash` byte-equal，标记为 R2 最高优先闸门。
5. **构建产物**：前端 `dist/`（Vite 构建），CLI 直接以 `.ts` 源运行（Node 24 原生 ES module 加载）。
6. **容器化**：`Dockerfile` 将源码 COPY 进镜像，设置 `FAR_CHAIN_OFFLINE=1`，ENTRYPOINT 指向 `src/cli/far.ts`。

### 3.2 CI 门禁链（按优先级排序）

- **阻断型**：typecheck → lint → py_typecheck → test_ts（含 cross_lang）→ test_py → openapi_contract/json_schema contract → coverage_gate（行≥85%/分支≥75%）→ zero_tolerance_scan → anti_theater_deterministic_scan → secret_scan → claim_lint → complexity_budget → mutation_gate。
- **条件型**：`competition_qwen_smoke` 仅在 PR 之外且存在 `DASHSCOPE_API_KEY` 时运行，否则 skip 不 block。
- **独立并行**：`latex_compile`（pdflatex 编译报告）、`security-audit.yml`（周度 cron）。
- **发布前验证**：`offline_release_smoke` 在 CI 中跑 `far doctor` + `far demo tess-offline` + `far export far-proof` + `far verify .far-proof`，确保 README 顶部命令对陌生用户可运行。

### 3.3 可复现性保障

- `build-integrity.yml` 的 `reproducible_build` job 对同一 commit 执行两次 `npm run build`，递归计算 `dist/` 下所有文件 sha256sum 并 diff，任何非确定性源（时间戳/随机值/路径注入）导致失败。
- Docker 基础镜像注释要求钉住 `node:24-slim@sha256:<digest>`（TODO 记录 digest 变更）。
- 所有 Action 版本硬编码 SHA（如 `actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`、`pnpm/action-setup@a8198c4bff370c8506180b035930dea56dbd5288`）。

### 3.4 发布工件

- **源码分发**：`git clone` + `node src/cli/far.ts`（无 npm registry 发布）。
- **安装脚本**：`scripts/install.sh`、`scripts/install.ps1`，附带 `SHA256SUMS` 校验。
- **SBOM**：`scripts/generate_sbom.mjs` 输出 `.far-release/sbom.json`，随 release 上传。
- **Docker 镜像**：`ghcr.io/<owner>/far-lab:<tag>` + `latest`，镜像内不内置任何 provider key（离线优先）。
- **CHANGELOG 提取**：release notes 从 `CHANGELOG.md` 对应版本段提取，无匹配则回退自动生成。

## 4. 约定与约束

- **pnpm 版本 SSOT**：`package.json.packageManager` 与 CI `PNPM_VERSION` 必须一致，避免 pnpm9/10 行为漂移（见 `ci.yml` 顶部注释）。
- **Node 编译缓存隔离**：CI 设置 `NODE_COMPILE_CACHE=/tmp/node-compile-cache`，防止 `<cwd>/0/` 污染仓库树（被 `repo_hygiene_gate` 检测）。
- **零容忍代码质量**：`eslint.config.js` 配置零容忍规则（Z1/Z2/Z3），`pnpm run lint` 以 `--max-warnings 0` 执行。
- **OpenAPI/JSON Schema 契约冻结**：`pnpm run openapi:check` 与 `generate_json_schema.mts --check` 保证字节稳定，禁止契约漂移。
- **模型中立强制**：核心目录（`src/evidence_log`、`src/falsifiability`、`src/proof_envelope`、`src/far_proof`、`src/agent_loop`、`src/fec`、`src/report`、`src/db`、`src/schema`、`src/api`、`src/anti_theater`、`src/confounding_gate`）禁止出现 `qwen`、`dashscope.aliyuncs`、`bailian` 字面量（build-integrity.yml 扫描）。
- **审计器常量不可绕过**：禁止 `process.env.AUDITOR_ENABLED`、禁止 `AUDITOR_ENABLED=false` 残留、禁止注释掉 `AUDITOR_ENABLED = true as const`（R9-2 四重 grep 断言）。
- **Secret 管理**：`DASHSCOPE_API_KEY` 仅在工作流 dispatch 且默认分支时读取，PR head 代码无法获取凭据。
- **性能预算**：`scripts/perf_budget.json` 定义阈值，CI 通过 wall-clock 计时（test 步骤起点到 perf_budget gate）检测退化，基线约 600s（5× 余量）。
- **覆盖率红线**：行覆盖率 ≥85%、分支覆盖率 ≥75%，由 `scripts/coverage_gate.mjs` 强制执行。
- **Python 科学轴可选**：`science` optional-dependency 缺装时 `dataset_fetch.py` 返回 `{ok:false}` 降级，不影响核心测试。
- **数据库迁移只增不改**：`schema/migrations/` 下 `0001_initial.sql` 至 `0025_v2_receipts_owner.sql`，V1 阶段不交付可运行迁移机（down/up-down-up 属 V2 R-MIG）。
- **Docker 镜像设计原则**：默认 offline（`FAR_CHAIN_OFFLINE=1`），真实 Qwen/百炼 provider 需显式注入 env-file，绝不默认读取。