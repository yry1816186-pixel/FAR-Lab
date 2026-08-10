# Supply Chain Maturity — SLSA 评估（安全面 P3 · 阶段 7 1128）

> 对标 SLSA (Supply-chain Levels for Software Artifacts) L1-L4。
> 诚实 self-assessment（非官方认证）。

## 1. SLSA 级别定义

| 级别 | 要求 |
|------|------|
| L1 | 构建过程有文档（构建脚本可追溯） |
| L2 | 托管源 + 构建服务（非本地构建） |
| L3 | 强化构建平台 + 不可伪造 provenance |
| L4 | 双方审核 + 完全可复现 |

## 2. FAR-Lab 当前状态

| 要求 | 现状 | 证据 | 达标 |
|------|------|------|------|
| 源码托管 | GitHub PUBLIC | github.com/yry1816186-pixel/FAR-Lab | ✅ |
| 构建服务 | GitHub Actions | .github/workflows/ci.yml（8 workflows） | ✅ |
| 依赖锁定 | pnpm-lock + frontend package-lock | exact-pinned（双 lockfile） | ✅ |
| action SHA 固定 | 92 处全 SHA（P1-C-1） | .github/workflows/*.yml（0 浮动 tag） | ✅ |
| install 审计 | SHA256SUMS 双向对账 | scripts/install.sh:89（DR4-01·v1.1.0 线上资产一致） | ✅ |
| 可复现构建 | 双构建哈希一致 | build-integrity.yml reproducible_build job（48 文件 0 差异） | ✅ |
| Provenance | ❌ 无 slsa-github-generator | 无 SLSA provenance action | ❌ |
| 强化构建平台 | GitHub shared runner | 非 hardened（shared infrastructure） | 部分 |
| SBOM 导出 | ❌ 无 SPDX | 无 syft/cyclonedx 工具链 | ❌ |

## 3. 当前级别评估

**推断：SLSA L1-L2 之间**
- L2 达标项：托管源 + 构建服务 + 依赖锁定 + 可复现 ✓
- L3 缺口：provenance（构建出处自动生成）+ hardened platform ✗

## 4. 升级路线（P3 批次）

- [ ] **L2→L3**: 接入 `slsa-framework/slsa-github-generator` action（自动生成 provenance attestation）
- [ ] **L3**: 构建平台信任声明（GitHub Actions shared runner 安全模型文档化）
- [ ] **L3**: SBOM 导出（syft 或 cyclonedx 生成 SPDX/CycloneDX 清单）
- [ ] **L4**: 完全可复现（已部分达标——双构建哈希一致；差第三方独立复算）

## 5. 关联

- **pnpm audit**: frontend 0 漏洞（react-router v7.18.2 升级后·2026-08-10）；后端 workspace 跨包报告 3 moderate（pnpm-lock 与 frontend package-lock 双管理器不一致·已知环境问题）
- **DR4-01**: v1.1.0 Release 资产双向对账全 True（2026-08-10 线上修复）
- **ADR-019**: G7 断路器（budget.ts per-run 硬预算 fail-closed）
- **1121 供应链全固定**: 已勾选（actions SHA + install 审计 + 2FA/provenance N/A 不发布 npm）

## 6. 不能证明什么

1. **self-assessment 非第三方审核**——SLSA 官方认证需独立审计
2. **shared runner 非 hardened**——L3 要求的 "hardened build platform" 是判断项（GitHub Actions shared infrastructure 的隔离强度未经外部评估）
3. **provenance 缺失** = 下游消费者无法自动验证构建出处（只能信任 GitHub + 仓库）
4. **SBOM 缺失** = 依赖传递图不可机器读取（仅 lockfile 平面清单）

*完成时间: 2026-08-10 · 依据: 1121 供应链审查 + DR4-01 修复 + 12 面安全面评估*
