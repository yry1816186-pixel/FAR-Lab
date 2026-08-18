# Maintainers

**Lead Maintainer**: Richard Yuan (`@yry1816186-pixel`) — decisions + merge + release.

> Bus factor = 1（诚实声明，见 [bus-factor assessment](#bus-factor-assessment)）。
> 安全披露：`SECURITY.md`（GitHub Security Advisory · 私有路径，48h 确认 / 7 天初评）。

## Roles

| Role | Holder | Authority |
|------|--------|-----------|
| Lead Maintainer | `@yry1816186-pixel` | merge / release / final decision |
| Trust-kernel reviewers | Lead Maintainer (acting) | `src/falsifiability` `src/evidence_log` `src/far_proof` `src/canonical` `src/fec` 高风险审查（AGENTS.md §7 协议的 GitHub 侧落点，CODEOWNERS 强制） |
| Security response | Lead Maintainer | 私密披露分诊（`SECURITY.md` SLA） |

新增维护者：连续 5 个被合并的高质量 PR + 对信任内核边界的评审记录 → 由 Lead
Maintainer 提名并登记本表（候选登记即继任管道的一部分）。

## Decision process

1. 常规变更：PR + CI 全绿（typecheck / lint / test / 附加门）即可合并；
2. 信任内核/架构变更：额外走 `CONTRIBUTING.md` "Architecture Authority" 的
   高风险协议（正/负/边界/篡改测试 + cannot-prove 声明）；
3. 重大设计：issue 先行公开讨论 ≥72h（RFC 标签），结论回写本文件或
   `CONTRIBUTING.md`，不留在私信里；
4. 紧急安全修复：允许受控 embargo（私密分支修复 → 发布时公开 advisory，
   见 `SECURITY.md` Disclosure Policy）——embargo 是例外且必须事后可审计。

## Conflict resolution

- 技术分歧：以证据为准（测试/基准/可复现输出），引用宪法式约束
  （fail-closed、确定性、无假 demo）优先于偏好；
- 无法收敛时 Lead Maintainer 裁决并记录理由；社区成员可 fork（MIT）。

## Release authority

- 版本号与发布：仅 Lead Maintainer 执行（`git tag` / Release / Zenodo 归档）；
- 发布门：`scripts/release_check.mjs` + CI release workflow 全绿为前置条件；
- 供应链：依赖变更经 `scripts/check-supply-chain.mjs`，锁文件漂移即红。

## Succession

- 继任标准：对仓库 5+ 已合并实质性 PR、通过信任内核协议评审演练、
  公开承诺 ≤7 天发布响应；
- 继任流程：候选在 Roles 表登记为 reviewer → 90 天共同维护期 → Lead
  Maintainer 移交（本文件 + CODEOWNERS + GitHub 权限三处同步）；
- 无人继任时的兜底：仓库转为 archival 状态并在 README 顶部声明（不静默弃坑）。

## Inactivity policy

- Lead Maintainer 连续 **90 天**无 commit/issue 响应：任意贡献者可在 issue
  中发起接管流程（fork + 本文件的继任标准公开核验）；
- 连续 **180 天**无响应：社区可基于最近 tag 建 community fork 并在本仓库
  README 声明指向（MIT 许可允许）。

## Bus-factor assessment

- 当前 `busFactor = 1`（诚实登记，不声称社区治理成熟）；
- 缓解措施：(a) 本文件的继任/不活跃条款使接管路径可执行；(b) 机器门
  （CI/复杂度预算/依赖方向 fitness）使知识存在于仓库而非个人；
- 退出「critical」的条件：≥2 名活跃维护者登记于 Roles 表。
