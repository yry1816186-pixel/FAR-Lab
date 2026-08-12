# Governance

> How decisions are made in the FAR-Lab project. For release operations see
> `docs/governance/`.

## 1. Project vision

FAR-Lab is a claim-level verification layer for AI4S scientific claims — a
fourth layer that orthogonally sits across the agent execution stack and
verifies (not produces) claims. See `README.md`.

## 2. Roles

| Role | Who | Authority |
|---|---|---|
| **Maintainer** | `@yry1816186-pixel` (lead; `NEEDS_MAINTAINER_ASSIGNMENT` for additional maintainers) | decisions + merge + release |
| **Committer** | nominated by Maintainer | drive PRs in a subsystem |
| **Contributor** | anyone | propose PRs |

## 3. Decision process

- **Routine changes**: PR → review → merge (see `CONTRIBUTING.md`).
- **Significant changes** (architecture / schema / red-line / evaluation
  threshold / release gate): open an issue or RFC → Maintainer review.
- **Trust-root changes are REJECTED**: the 0001 five-table DDL, the
  canonicalHash algorithm, and the five-value VerdictKind enum must never change.

## 4. Keystone files (CODEOWNERS-protected)

The following files require Maintainer review on every change (see `.github/CODEOWNERS`):

- all `.github/workflows/*.yml`
- `package.json`, `tsconfig.json`, `schema/migrations/`

## 5. Progress definition

"Done" = production callers drive real dependencies (SymPy / DashScope HTTP /
venv subprocess / hash recomputation) — **not** "tests are green". Re-running an
already-green suite is zero progress.

## 6. Succession

Contributor → Committer → Maintainer, by nomination + review by existing
Maintainers. `NEEDS_MAINTAINER_ASSIGNMENT`: bus factor is currently 1; the
succession path and a second maintainer are outstanding.

### 6.1 Bus-factor mitigation

- **现状（诚实声明）**：bus factor = 1（lead maintainer `@yry1816186-pixel`）。
  全部信任内核（verdict kernel / FEC / evidence chain / proof envelope）与发布路径
  由单人持有。这不是可接受的长稳态——以下缓解立即生效：
- **第二维护者候选（待提名）**：本项目是单人主导的开源竞赛项目，候选名单
  **不编造**——由 lead 在社区/团队内提名，满足 §6.2 标准后登记至
  `docs/governance/MAINTAINERS.md`。提名前，以下机制降低单点风险：
- **继任标准（§6.2）**：候选须满足全部——
  1. 独立完成 ≥1 个信任内核改动（verdict/FEC/evidence_log 域）并通过全量回归；
  2. 独立完成 ≥1 次 `far release` 演练（dry-run，含 SHA256SUMS/sbom 资产核对）；
  3. 通过一次对抗性代码审查（反剧场扫盲：`:any`/`@ts-ignore`/空 catch/改测试期望
     四个反模式能识别并解释危害）；
  4. 阅读并同意 `AGENTS.md` §7（信任内核约束）与 `CONTRIBUTING.md` 零容忍清单。
- **时间线**：Lead 每季度复核一次候选名单；候选满足 §6.2 后 2 周内完成登记 +
  双人签名确认（登记于 MAINTAINERS.md 变更 commit）。
- **缓解措施（提名前即时生效）**：
  1. 全部信任内核文件已被 `.github/CODEOWNERS` 保护（任何变更需 Maintainer 显式审查）；
  2. 发布资产（SHA256SUMS.txt / sbom.json）由 CI 生成并可复算（不依赖单人记忆）；
  3. 本仓库为公开 GitHub 仓库——任何提交历史/版本均可由他人 fork 续接（代码级
     bus-factor 缓解；组织级访问权仍为单点，待第二维护者登记后授予）。

## 7. Security & conduct

- Vulnerability disclosure: `SECURITY.md` (private, **not** public issues).
- Conduct: `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).

## 8. References

- Release operations: `docs/governance/release-process.md`
- Contribution guide: `CONTRIBUTING.md`
- Project overview: `README.md`
