# Release Readiness Checklist (v0.1.0)

> 每项标注真实状态：✅ **DONE**（已实测/已就绪）/ ⚠️ **NEEDS_VERIFICATION**（设计就绪，需真实环境跑一次）/
> 🔧 **NEEDS_HUMAN**（需人类操作/凭证/确认，工件无法自证）。
> 诚实原则：不把「设计就绪」伪装成「已验证通过」。

## A. 安装与运行

| # | 项 | 状态 | 证据 / 说明 |
|---|----|------|------|
| 1 | fresh clone 能安装 | ✅ DONE（本地） | git worktree 干净 checkout HEAD 47ed83d → `pnpm install --frozen-lockfile` 从零 3.1s（共享 store）→ `far doctor`/`demo tess-offline`/`verify` 全通。注：pnpm 10 报 "Ignored build scripts: esbuild" 但不影响 better-sqlite3（prebuilt）。 |
| 2 | clean machine 能运行 | ✅ DONE（本地） | 同 #1：fresh checkout（无 node_modules）从零 install 后 far 全链路 exit 0/2。CI `offline_release_smoke`（ci.yml STEP15）ubuntu runner 同样验证（GitHub 实跑待 push）。 |
| 3 | README 顶部命令可复制 | ✅ DONE | `far doctor` / `far demo tess-offline` / `far verify examples/...` 本地实测通过；`curl install.sh` 链接标 `NEEDS_RELEASE_PUBLICATION`。 |
| 4 | `far doctor` 可诊断 | ✅ DONE | 本地实测 exit 2（仅 WARN），13 项检查正确，零密钥读取。 |
| 5 | offline demo 不需 key | ✅ DONE | `far demo tess-offline` 本地实测零密钥、零网络、exit 0。 |
| 6 | live demo 明确需 key | ✅ DONE | `far doctor --live-qwen-smoke` 显式才调 API；`docs/providers/qwen-dashscope.md` 标 `NEEDS_API_KEY`。 |
| 7 | Docker 可运行 | ⚠️ NEEDS_DOCKER_BUILD_VALIDATION | `Dockerfile`（已优化：移除 build-essential，better-sqlite3 prebuilt）+ `docker-compose.yml`（`compose config` valid）；本地 Docker Desktop 29.5.2 daemon 已起，但 `docker build` 因 debian mirror + npm registry 网络慢多次超时（800s/500s 未完成）。CI runner（GitHub 网络）会在 release.yml docker job 验证。 |
| 18 | 从新目录执行 README 命令 | ✅ DONE（本地） | fresh checkout 跑 `far version`(0.1.0)/`far doctor`(exit 2)/`far demo tess-offline`(exit 0)/`far verify examples/.../demo.far-proof`(tamper clean exit 0) 全通。 |

## B. 发布物

| # | 项 | 状态 | 证据 / 说明 |
|---|----|------|------|
| 8 | CI 真实通过 | ⚠️ NEEDS_CI_RUN | ci.yml（含新增 `offline_release_smoke`）+ release.yml + publish-node.yml YAML 语法全 valid；未在 GitHub Actions 实跑（需 push 触发）。 |
| 9 | Release assets 存在 | 🔧 NEEDS_RELEASE_PUBLICATION | `release.yml`（tag `v*` 触发）会生成 install.sh/ps1 + SHA256SUMS；**首次 `git tag v0.1.0 && git push` 需人类操作**。 |
| 10 | install.sh / install.ps1 存在 | ✅ DONE | `scripts/install.sh`（chmod +x，`bash -n` 过）+ `scripts/install.ps1`。 |
| 11 | checksum 存在 | 🔧 NEEDS_RELEASE_PUBLICATION | `release.yml` build_assets job 生成 `SHA256SUMS`；随 release 发布后存在。 |
| 12 | CHANGELOG 更新 | ✅ DONE | `CHANGELOG.md` `[Unreleased]` 段含 Added/Changed（开源治理 v0.1.0）。 |

## C. 治理与诚信

| # | 项 | 状态 | 证据 / 说明 |
|---|----|------|------|
| 13 | SECURITY 存在 | ✅ DONE | `SECURITY.md`（含密钥红线 + 新增开源 install/doctor 密钥边界节 + 标注已归档 spec 引用）。 |
| 14 | CONTRIBUTING 存在 | ✅ DONE | `CONTRIBUTING.md`（含质量门 + 零容忍 + 新增 `far doctor` 与开源发布节）。 |
| 15 | LICENSE 已由人类确认 | ⚠️ NEEDS_HUMAN_CONFIRMATION | `LICENSE` 已是 **MIT**；`NEEDS_HUMAN_LICENSE_DECISION.md` 记录：默认维持 MIT，变更须人类确认。**默认无动作**。 |
| 16 | README 无夸大宣传 | ✅ DONE | 自查：无「证明科学真理」「全自动科学家」「物理不可篡改」「完全可复现」等禁用词；demo verdict 明确标 offline fixture 非真实裁决。 |
| 17 | 所有 NEEDS_* 未伪装成完成 | ✅ DONE | 全文 `NEEDS_API_VALIDATION`/`NEEDS_REAL_ENV`/`NEEDS_GPU_VALIDATION`/`NEEDS_HUMAN_OPERATION`/`NEEDS_RELEASE_PUBLICATION`/`NEEDS_DOCKER_BUILD_VALIDATION`/`NEEDS_NPM_PUBLISH_VALIDATION` 均诚实标注，未伪装。 |

## D. 汇总

- **✅ DONE**：13 项（#1,2,3,4,5,6,10,12,13,14,16,17,18）—— 命令链路、文档、治理、诚信边界已就绪；fresh-clone 端到端本地实测通过（git worktree HEAD 47ed83d）。
- **⚠️ NEEDS_VERIFICATION**：2 项（#7 Docker build, #8 GitHub CI 实跑）—— 设计/语法就绪，需真实 Docker daemon / GitHub push。
- **🔧 NEEDS_HUMAN**：3 项（#9,11,15）—— 首次 tag 推送发布、LICENSE 维持确认，需人类操作（工件无法自证）。

## 发布前必做（人工，按序）

1. [ ] push 当前分支 → 合并到默认分支（触发 ci.yml 全门 + `offline_release_smoke`）。
2. [ ] 在 GitHub Actions 确认 ci.yml 全绿（含新增 offline_release_smoke）。
3. [ ] 可选：本地起 Docker daemon，跑 `docker compose up far-demo` 验证（#7）。
4. [x] fresh-clone 端到端已本地验证（git worktree HEAD 47ed83d，#1/#2/#18 ✅）；可选再跑 `bash scripts/install.sh` 验证 install 脚本本身。
5. [ ] 确认 `LICENSE` 维持 MIT（#15，默认无动作）。
6. [ ] `git tag v0.1.0 && git push origin v0.1.0` → 触发 `release.yml` → 生成 release assets + GHCR image（#9/#11）。
7. [ ] 校验 release 页面 install.sh/ps1 + SHA256SUMS 可下载、checksum 匹配。
8. [ ] （可选，若 npm）解决 `packages/cli` 打包自包含（`publish-node.yml` validate gate），配 `NPM_TOKEN`，手动触发 publish。

## 不可对外宣称的事项（诚实边界）

- ❌ 不宣称「CI 全绿」——未在 GitHub 实跑（#8）。
- ❌ 不宣称「Docker 已验证」——未实测 build（#7）。
- ❌ 不宣称「一键安装已发布」——release 未发布（#9）。
- ❌ 不宣称 npm / PyPI 已发布 —— npm 需打包验证（NEEDS_NPM_PUBLISH_VALIDATION），PyPI 是 roadmap。
- ❌ 不宣称 demo verdict 是真实科学裁决 —— 是 offline fixture。
