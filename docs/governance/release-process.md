# Release Process

> FAR-Chain 的发布流程。当前状态：**v0.1.0 准备中**（`NEEDS_RELEASE_PUBLICATION`）。

## 版本号

遵循 [SemVer](https://semver.org/)。当前 `0.1.0`（pre-1.0，API/schema 可能调整）。

- 根 `package.json` version
- `packages/cli/package.json` version（`@far-chain/cli`）—— 须与根对齐
- `CHANGELOG.md` `[Unreleased]` → `[0.1.0] - <date>` 段
- `far version` 输出该值

## 发布步骤

### 1. 冻结变更

- 确认 `CHANGELOG.md` `[Unreleased]` 段完整。
- 跑 `pnpm ci-all` + `node scripts/depth_gate.mjs` 全绿。
- 跑 `far doctor` 全绿（或仅 WARN）。
- 跑 `far demo tess-offline` + `far verify examples/tess-offline/output/demo.far-proof` 通过。

### 2. 打 tag

```bash
# 对齐 version
# package.json + packages/cli/package.json: "version": "0.1.0"
git commit -am "chore(release): v0.1.0"
git tag v0.1.0
git push origin v0.1.0
```

### 3. Release workflow（`NEEDS_RELEASE_PUBLICATION`）

`.github/workflows/release.yml`（tag `v*` 触发；也可由 maintainer 手动 dispatch 并填同一个已存在 tag）产出：

- `install.sh` / `install.ps1`（从 `scripts/` 复制到 release assets）
- `SHA256SUMS`（checksum）
- npm tarball（根 package `far-chain`；`.github/workflows/publish-node.yml` 会 `npm pack` + 独立目录 fresh install + `far version` 验证自包含）
- Docker image digest → GHCR（`ghcr.io/yry1816186-pixel/far-lab:<tag>`，`NEEDS_GHCR_PUBLISH`）
- 自动生成 release notes（from CHANGELOG + commits）

### 4. 人工确认项（`NEEDS_HUMAN_OPERATION`）

首次发布需人类配置（工件无法自证）：

- [ ] GitHub repo Settings → Branches → 默认分支 branch protection（CODEOWNERS 要求 review）
- [ ] GHCR package 权限 + PAT（`packages: write`）
- [ ] npm publish token（若发布 npm）配置为 secret `NPM_TOKEN`；真实发布必须从 `v*` tag 运行 `publish-node.yml` 且 tag/root/CLI version 三者一致
- [ ] 首次 `git tag v0.1.0 && git push origin v0.1.0` 触发 release.yml
- [ ] 校验 release assets（install.sh/ps1 + checksum）可下载且 checksum 匹配
- [ ] 校验 `curl ... install.sh | bash` 在 fresh 机器一键跑通 `far demo tess-offline`

## 发布渠道（v0.1.0 决策）

| 渠道 | v0.1.0 | 状态 |
|------|--------|------|
| GitHub Release assets（install.sh/ps1 + checksum） | ✅ | `NEEDS_RELEASE_PUBLICATION` |
| GHCR Docker image | ✅ | `NEEDS_GHCR_PUBLISH` |
| npm `far-chain` | ✅ 根包发布，Node24 约束 | `NEEDS_NPM_PUBLISH` |
| PyPI `far-chain-repro` | ❌ roadmap | `NEEDS_PYPI_PUBLISH` |
| Homebrew tap | ❌ roadmap | — |

详见 [OPEN_SOURCE_RELEASE_PLAN.md](OPEN_SOURCE_RELEASE_PLAN.md)。

## 回滚

- Release 出问题：GitHub Release 页面删除/转为 draft；tag 可保留（记录历史）。
- npm/ghcr 发布的版本**不可覆盖**（不可变）——只能发 `0.1.1` 修复版。

## 相关

- [RELEASE_READINESS_CHECKLIST.md](RELEASE_READINESS_CHECKLIST.md)（18 项验收）
- [OPEN_SOURCE_AUDIT.md](OPEN_SOURCE_AUDIT.md) · [OPEN_SOURCE_RELEASE_PLAN.md](OPEN_SOURCE_RELEASE_PLAN.md)
