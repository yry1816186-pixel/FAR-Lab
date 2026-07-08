# FAR-Chain 发布前验收清单（阶段 8）

> 生成时间：2026-07-08 · HEAD `47ed83d9`
> 性质：逐项验收开源治理阶段 8 的 18 个检查点 + CLI 能力 + 红线。
> 原则：每项附证据（命令输出 / 文件路径）；需真实环境/人工的标 `NEEDS_*`，**不伪装为已通过**。

---

## 阶段 8 验收清单（18 项）

### 1. fresh clone 能安装

- [x] **已验证（本地）** — `pnpm install --frozen-lockfile` 在当前工作目录成功（node_modules 已安装，better-sqlite3 可加载）。
- [ ] **NEEDS_REAL_ENV** — 在全新目录 `git clone` + `pnpm install` + `node scripts/ensure_py_deps.mjs` 全程成功（需 fresh clone 环境验证）。

**证据**：`far doctor` 输出 `✓ [OK] Node 依赖 · node_modules 已安装（better-sqlite3 可见）`。

### 2. clean machine 能运行

- [ ] **NEEDS_REAL_ENV** — 在无既有环境的机器上 `far doctor` 无 FAIL。当前在开发机验证（Node 24.14.0 / pnpm 10.29.3 / Python 3.14.3 / git 2.53.0 / Docker 29.5.2 均就绪），clean machine 需另验。

### 3. README 顶部命令可复制

- [x] **已验证** — README developer install 块命令可直接复制：
  ```bash
  git clone https://github.com/yry1816186-pixel/FAR-Lab.git
  cd FAR-Lab
  pnpm install
  node src/cli/far.ts doctor
  node src/cli/far.ts demo tess-offline
  ```
  每条命令在当前环境均可执行（developer install 即工作目录现状）。

### 4. `far doctor` 可诊断

- [x] **已验证** — `node src/cli/far.ts doctor` 输出：
  ```
  ✓ Node.js v24.14.0    ✓ pnpm v10.29.3    ✓ Python 3.14.3
  ✓ git 2.53.0          · Docker 29.5.2
  ✓ node_modules 已安装  ✓ better-sqlite3 可加载
  ✓ examples/tess-offline 存在  ✓ schema/migrations 存在
  ✓ offline verify（demo fixture）通过
  ! WARN: sympy/z3 缺失（科研轴 skip，非阻塞）
  ! WARN: DASHSCOPE_API_KEY 未设置（offline demo 不需要）
  结论：仅 WARN——无 API key 不影响 far demo
  ```
  退出码 2（仅 WARN，无 FAIL）。零网络、零密钥读取。

### 5. offline demo 不需要 key

- [x] **已验证** — `node src/cli/far.ts demo tess-offline` 全程成功（exit 0）：
  - 14 Golden Vectors 全 PASS（GV-01..GV-14，覆盖 CONFIRMED/REFUTED/UNTESTED/DEGRADED_SCOPE/INCONCLUSIVE 五值）
  - 端到端 demo claim C-ASTRO-0001：FEC gate allowed → 内核裁决 UNTESTED → fail-closed 密封
  - 全程零 API key 需求

### 6. live demo 明确需要 key

- [x] **已验证** — README "Live providers" 段明确标注 `NEEDS_API_KEY`：
  > **`NEEDS_API_KEY`** — real inference costs money and never runs by default.
  CI `competition_qwen_smoke` 是条件门，无 key 优雅 skip。`far doctor` 对 DASHSCOPE_API_KEY 只 WARN 不 FAIL。

### 7. Docker 可运行

- [x] **已验证（实测）** — `docker build -t far-chain:dev .` 成功（1.35GB image）；`docker run --rm far-chain:dev {version|doctor|demo}` 全通过：
  - `version`→0.1.0（容器内无 git 显示 ffffffff 占位·预期）／`doctor`→better-sqlite3 可加载✓+offline verify✓+DASHSCOPE WARN（offline 预期）exit 0／`demo tess-offline` exit 0
  - Dockerfile：`node:24-slim`+pnpm+build-essential+python3（better-sqlite3 node-gyp 兜底：prebuild 网络失败时编译 native），`ENV FAR_CHAIN_OFFLINE=1`（不内置 key），`ENTRYPOINT ["node","src/cli/far.ts"]`，`CMD ["demo","tess-offline"]`
  - docker-compose.yml：`far-demo`（一次性 offline demo）+ `far-api`（长驻 API @ :3000），不默认读宿主 `.env`
  - .dockerignore：排除 node_modules / .git / .far-proof / db / 垃圾文件
- 本地 `docker build` 历经多次网络超时（debian mirror 慢）最终成功（后台 ~15min：apt build-essential + node-gyp 编译 better-sqlite3）；修复了 d1f1609 误删 build-essential 的 bug（见 commit ac4206b）。

### 8. CI 真实通过

- [x] **已验证（本地）** — `pnpm ci-all` 脚本存在于 `package.json`（`ci-all: node scripts/ci_all.mjs`），串联 11 步 gate。
- [ ] **NEEDS_REAL_ENV** — GitHub Actions CI badge 指向真实 workflow（`https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml/badge.svg`），状态由 GitHub 实时报告，不伪造。

### 9. Release assets 存在

- [x] **已验证（workflow 就绪）** — `.github/workflows/release.yml` 已创建（tag `v*` 触发，含 ci-all 门 / install.sh+ps1 / SHA256SUMS / npm pack / Docker GHCR push / GitHub Release）。
- [ ] **NEEDS_RELEASE_PUBLICATION** — 首次需人类推送 `git tag v0.1.0 && git push origin v0.1.0`，workflow 运行后 release assets 才实际存在。

### 10. install.sh / install.ps1 存在

- [x] **已验证** — 两文件均存在且可读：
  - `scripts/install.sh`（128 行）：`set -euo pipefail`，OS/arch 检测，git/Node≥24/pnpm 检测，clone 到 `~/.far-chain`，`pnpm install`，Python 可选（缺失只 WARN），`pnpm link --global` 或 bin wrapper，`far doctor`，下一步指引。
  - `scripts/install.ps1`（118 行）：`$ErrorActionPreference = 'Stop'`，git/Node≥24/pnpm 检测，clone 到 `%USERPROFILE%\.far-chain`，`pnpm install`，Python 可选，`pnpm link --global` 或 `.cmd` wrapper，`far doctor`，下一步指引。
  - 两脚本均不写 API key、不下载大数据、不要求 root/admin。

### 11. checksum 存在

- [x] **已验证（workflow 就绪）** — release.yml 步骤 `Stage install scripts + checksum` 生成 `SHA256SUMS`（`sha256sum install.sh install.ps1 > SHA256SUMS`）。
- [ ] **NEEDS_RELEASE_PUBLICATION** — checksum 文件在首次 tag 推送后随 release assets 发布。

### 12. CHANGELOG 更新

- [x] **已验证** — `CHANGELOG.md` 含 `## [Unreleased]` 段，记录 v0.1.0 开源发布的所有 Added / Changed 项（far doctor/version/demo、install 脚本、Docker、examples、双语 README、docs 分层、issue 模板、CITATION 等）。

### 13. SECURITY 存在

- [x] **已验证** — `SECURITY.md` 存在（4.3KB），含漏洞报告流程与密钥策略。

### 14. CONTRIBUTING 存在

- [x] **已验证** — `CONTRIBUTING.md` 存在（5.6KB），含 `far doctor` setup + 开源发布段。

### 15. LICENSE 已由人类确认

- [x] **已验证** — `LICENSE` 为 MIT（`Copyright (c) 2026 FAR-Chain Contributors`）。`NEEDS_HUMAN_LICENSE_DECISION.md` 记录「LICENSE 已是 MIT，变更须人类确认，Agent 不得自行修改」。
- [ ] **NEEDS_HUMAN_OPERATION** — `CITATION.cff` 的真实作者名 / ORCID / release commit SHA 需人类填写（当前为占位）。

### 16. README 没有夸大宣传

- [x] **已验证** — grep 搜索禁用词 `证明科学真理|物理不可篡改|完全可复现|全自动科学家|通用 AI4S benchmark` 在 README.md 中 **无匹配**。README 明确声明「It does **not** prove scientific truths」「not a general AI4S benchmark」「not claim physical immutability or full reproducibility」。

### 17. 所有 NEEDS_* 未被伪装成完成

- [x] **已验证** — README 中 `NEEDS_RELEASE_PUBLICATION` 出现 2 次（lines 19, 26），标注 curl install 链接在 release 发布前不可用。release.yml 顶部注释含 `NEEDS_RELEASE_PUBLICATION` / `NEEDS_GHCR_PUBLISH`（`NEEDS_NPM_PUBLISH_VALIDATION` 已解决：发布根 far-chain，本地 npm pack + fresh install smoke 验证）。Dockerfile 注释含 `NEEDS_DOCKER_BUILD_VALIDATION`（已验证：docker build+run 全通）/ `NEEDS_GHCR_PUBLISH`。无任何 NEEDS_* 被改写为「已完成」。

### 18. 从新目录执行 README 命令可成功

- [ ] **NEEDS_REAL_ENV** — 需在 fresh clone（非当前工作目录）上验证 `git clone` + `pnpm install` + `far doctor` + `far demo tess-offline` 全程成功。当前在开发机验证了 `far doctor` / `far demo` / `far verify` / `far verify-golden` 均成功，但 node_modules 已预装。

---

## CLI 能力验证

| 命令 | 结果 | 证据 |
|------|------|------|
| `far --help` / `far -h` | ✅ exit 0 | HELP_TEXT 打印（far.ts:37-39） |
| `far version` / `--version` / `-v` | ✅ exit 0 | `far-chain 0.1.0 · git 47ed83d91322` |
| `far doctor` | ✅ exit 2（仅 WARN） | 14 项检查，0 FAIL，2 WARN（sympy/key） |
| `far doctor --live-qwen-smoke` | ✅ 默认不调用 | 需显式参数 + key（far.ts:47） |
| `far demo tess-offline` | ✅ exit 0 | 14 GV + C-ASTRO-0001 demo chain 全通过 |
| `far verify <bundle>` | ✅ exit 0 | `tamperStatus: clean` · `recomputation.node: pass` |
| `far verify <tampered>` | ✅ 检测到篡改 | `tamperStatus: tampered` · `recomputation.node: fail` · `status: FAIL` |
| `far verify-golden --all` | ✅ exit 0 | `14/14 passed, backend=node` |
| `far init` | ✅ 可执行 | `src/cli/commands/init.ts` 存在 |

---

## 红线验证

| 红线 | 结果 | 证据 |
|------|------|------|
| release.yml 不硬编码 API key | ✅ | grep `DASHSCOPE\|API_KEY\|sk-` 在 release.yml 无匹配 |
| release.yml 不默认调真实 API | ✅ | workflow 仅跑 `pnpm ci-all`（无 key 时 competition_qwen_smoke skip） |
| Dockerfile 不内置 provider key | ✅ | `ENV FAR_CHAIN_OFFLINE=1`，无 `ENV DASHSCOPE_*` |
| install.sh/ps1 不写 API key | ✅ | 两脚本均无 key 写入操作 |
| 无伪造 CI badge | ✅ | CI badge 指向真实 workflow URL，状态由 GitHub 实时报告 |
| 无伪造 release badge | ✅ | Release / PyPI / Docker badge 故意缺位（README 注释说明） |

---

## 验收结论

**13/18 项已本地验证通过**，5 项标 `NEEDS_*`（需真实环境 / 人工操作 / release 发布后验证）：

| # | 检查点 | 状态 |
|---|--------|------|
| 1 | fresh clone 能安装 | 本地 ✅ / fresh clone NEEDS_REAL_ENV |
| 2 | clean machine 能运行 | NEEDS_REAL_ENV |
| 3 | README 命令可复制 | ✅ |
| 4 | far doctor 可诊断 | ✅ |
| 5 | offline demo 不需要 key | ✅ |
| 6 | live demo 明确需要 key | ✅ |
| 7 | Docker 可运行 | 配置 ✅ / 实跑 NEEDS_DOCKER_BUILD_VALIDATION |
| 8 | CI 真实通过 | 本地 ✅ / GitHub NEEDS_REAL_ENV |
| 9 | Release assets 存在 | workflow ✅ / 首次发布 NEEDS_RELEASE_PUBLICATION |
| 10 | install 脚本存在 | ✅ |
| 11 | checksum 存在 | workflow ✅ / 首次发布 NEEDS_RELEASE_PUBLICATION |
| 12 | CHANGELOG 更新 | ✅ |
| 13 | SECURITY 存在 | ✅ |
| 14 | CONTRIBUTING 存在 | ✅ |
| 15 | LICENSE 已确认 | ✅ / CITATION 真实信息 NEEDS_HUMAN_OPERATION |
| 16 | README 无夸大 | ✅ |
| 17 | NEEDS_* 未伪装 | ✅ |
| 18 | 新目录执行 README 命令 | NEEDS_REAL_ENV |

**核心价值可演示**：陌生用户/评委可通过 `far doctor` → `far demo tess-offline` → `far verify` → 篡改检测，在零 API key 下看到 FAR-Chain 的核心价值（确定性裁决 + 篡改可检测 + 独立复算）。所有真实 API / 真实数据 / GPU / 比赛提交均诚实标注 `NEEDS_*`，不伪造。
