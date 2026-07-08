# Release Readiness Checklist (v0.1.0)

> 每项标注真实状态：✅ **DONE**（已实测/已就绪）/ ⚠️ **NEEDS_VERIFICATION**（设计就绪，需真实环境跑一次）/
> 🔧 **NEEDS_HUMAN**（需人类操作/凭证/确认，工件无法自证）。
> 诚实原则：不把「设计就绪」伪装成「已验证通过」。

## A. 安装与运行

| # | 项 | 状态 | 证据 / 说明 |
|---|----|------|------|
| 1 | fresh clone 能安装 | ⚠️ NEEDS_VERIFICATION | `install.sh`/`install.ps1` 设计就绪（`bash -n` 语法过）；未在干净 fresh clone 实测端到端。本地已实测 `far doctor`/`demo`/`verify` 命令链路通。 |
| 2 | clean machine 能运行 | ⚠️ NEEDS_VERIFICATION | 需在一台仅装 Node≥24+git 的机器跑 `install.sh`。CI `offline_release_smoke` job（ci.yml STEP15）会在 ubuntu runner 验证，但尚未在 GitHub 实跑。 |
| 3 | README 顶部命令可复制 | ✅ DONE | `far doctor` / `far demo tess-offline` / `far verify examples/...` 本地实测通过；`curl install.sh` 链接标 `NEEDS_RELEASE_PUBLICATION`。 |
| 4 | `far doctor` 可诊断 | ✅ DONE | 本地实测 exit 2（仅 WARN），13 项检查正确，零密钥读取。 |
| 5 | offline demo 不需 key | ✅ DONE | `far demo tess-offline` 本地实测零密钥、零网络、exit 0。 |
| 6 | live demo 明确需 key | ✅ DONE | `far doctor --live-qwen-smoke` 显式才调 API；`docs/providers/qwen-dashscope.md` 标 `NEEDS_API_KEY`。 |
| 7 | Docker 可运行 | ⚠️ NEEDS_DOCKER_BUILD_VALIDATION | `Dockerfile`+`docker-compose.yml`（`docker compose config` valid）；本地 Docker daemon 未运行，未实测 `docker build`/`up`。CI runner（ubuntu）有 daemon，`release.yml` 的 docker job 会验证。 |
| 18 | 从新目录执行 README 命令 | ⚠️ NEEDS_VERIFICATION | 命令链路本地通；fresh-clone 端到端见 #1/#2。 |

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

- **✅ DONE**：10 项（#3,4,5,6,10,12,13,14,16,17）—— 命令链路、文档、治理、诚信边界已就绪并本地实测。
- **⚠️ NEEDS_VERIFICATION**：5 项（#1,2,7,8,18）—— 设计/语法就绪，需在真实 CI / fresh clone / Docker daemon 环境跑一次确认。
- **🔧 NEEDS_HUMAN**：3 项（#9,11,15）—— 首次 tag 推送发布、LICENSE 维持确认，需人类操作（工件无法自证）。

## 发布前必做（人工，按序）

1. [ ] push 当前分支 → 合并到默认分支（触发 ci.yml 全门 + `offline_release_smoke`）。
2. [ ] 在 GitHub Actions 确认 ci.yml 全绿（含新增 offline_release_smoke）。
3. [ ] 可选：本地起 Docker daemon，跑 `docker compose up far-demo` 验证（#7）。
4. [ ] （可选）fresh clone 到干净目录跑 `bash scripts/install.sh` 验证（#1/#2/#18）。
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
