# FAR-Lab Documentation Index

> **New here? Start here.** This is the single index for FAR-Lab's docs and governance.
> （本文件是文档与治理的唯一导航源；根目录不再保留转发页。）

## Quick start (for judges / new visitors)

| You are... | Read this first |
|---|---|
| **A learner** (2-3 days, from zero to contributor) | [learning/00_START_HERE.md](learning/00_START_HERE.md) — 完整学习路径（13 章） |
| **A competition judge** (5 min) | [JUDGE_QUICKSTART.md](JUDGE_QUICKSTART.md) |
| **A developer** (15 min) | [../README.md](../README.md) §30-second install → §2-minute Quickstart |
| **An architecture reviewer** | [design/01_EXECUTIVE_DESIGN_CONTRACT.md](design/01_EXECUTIVE_DESIGN_CONTRACT.md) |
| **A security auditor** | [../SECURITY.md](../SECURITY.md) → [audits/](audits/) |

## Learning Path (学习路径)

> 从零到扩展者的完整课程——13 章 + 动手练习。适合想系统学透 FAR-Lab 的人。

| Chapter | What you learn |
|---------|----------------|
| [00 从这里开始](learning/00_START_HERE.md) | 三条路径选一条，学习契约，仓库地图 |
| [01 问题域](learning/01_FOUNDATIONS.md) | AI4S 可复现性危机、四个真实案例（Bem/OSC/LK-99/Theranos） |
| [02 系统走查](learning/02_SYSTEM_TOUR.md) | 数据流、25 命令全景、`far demo` 解读 |
| [03 信任内核](learning/03_TRUST_KERNEL.md) | R0-R9 规则树逐条拆解、golden vectors |
| [04 统计引擎](learning/04_STATISTICS.md) | z/t 检验、效应量、多重比较校正、功效 |
| [05 反剧场检测](learning/05_ANTI_THEATER.md) | 23 个检测器逐个拆解（以实测为准）、freeze→recompute→compare |
| [06 证据链](learning/06_EVIDENCE_CHAIN.md) | SHA-256 哈希链、Merkle 根、跨语言一致 |
| [07 证明包](learning/07_PROOF_BUNDLE.md) | `.far-proof` 导出→验证→篡改检测 |
| [08 CLI 与 API](learning/08_CLI_AND_API.md) | 25 命令分组、退出码契约、16 REST 端点 |
| [09 前端可视化](learning/09_FRONTEND.md) | 15 页面、数据流、完整性徽章 |
| [10 Benchmark](learning/10_BENCHMARKS.md) | 30 科学问题种子解剖 |
| [11 生产化](learning/11_PRODUCTION.md) | Docker、安全、CI、供应链 |
| [12 扩展指南](learning/12_EXTENDING.md) | 加检测器/种子/命令 + 毕业挑战 |
| [动手练习](learning/exercises/README.md) | 每章配套练习（含进阶题） |

## Getting Started

| Document | Audience |
|----------|----------|
| [quickstart.md](quickstart.md) | First-time users — 5-minute setup + offline demo |
| [installation.md](installation.md) | All platforms (macOS / Linux / Windows / Docker) |

## Core Concepts

| Document | Description |
|----------|-------------|
| [concepts/claim.md](concepts/claim.md) | What makes a falsifiable claim (falsificationSpec) |
| [concepts/evidence.md](concepts/evidence.md) | What counts as evidence + provenance red lines |
| [concepts/verdict.md](concepts/verdict.md) | The five-value verdict + the deterministic R0–R9 kernel |
| [concepts/fec.md](concepts/fec.md) | Falsifiability Evidence Contract (frozen measurement plan) |
| [concepts/anti-theater.md](concepts/anti-theater.md) | 23 fake-green detectors that block a seal |
| [concepts/determinism.md](concepts/determinism.md) | Why the LLM is never the verdict arbiter |
| [concepts/evidence-ledger.md](concepts/evidence-ledger.md) | Append-only content-addressed hash chain (mechanics) |
| [concepts/far-proof.md](concepts/far-proof.md) | Self-verifiable `.far-proof` proof bundles |

## Providers

| Document | Description |
|----------|-------------|
| [providers/qwen-dashscope.md](providers/qwen-dashscope.md) | Qwen / DashScope / Bailian live inference |

## Reference

| Document | Description |
|----------|-------------|
| [reference/cli-reference.md](reference/cli-reference.md) | All `far` commands, flags, and exit codes |
| [reference/api-reference.md](reference/api-reference.md) | REST API endpoints (`far api`) |

## Core project documents (root)

| Document | Purpose | Audience |
|---|---|---|
| [../README.md](../README.md) | Project overview + install + quickstart | Everyone |
| [../README.zh-CN.md](../README.zh-CN.md) | Chinese README | Chinese-speaking visitors |
| [../AGENTS.md](../AGENTS.md) | Agent operating contract (auto-loaded) | AI agents |
| [../CLAUDE.md](../CLAUDE.md) | Claude Code integration config | AI agents |

## Quality and process

| Document | Purpose |
|---|---|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | PR workflow + quality gates |
| [../CHANGELOG.md](../CHANGELOG.md) | Version history |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community standards |
| [../GOVERNANCE.md](../GOVERNANCE.md) | Project governance |
| [../SECURITY.md](../SECURITY.md) | Security policy + reporting |
| [../SUPPORT.md](../SUPPORT.md) | Getting help |

## Strategy and planning

| Document | Purpose |
|---|---|
| [charter/COMPETITION_STRATEGY.md](charter/COMPETITION_STRATEGY.md) | Competition positioning + gap analysis |
| [charter/GOAL.md](charter/GOAL.md) | Project priorities ("watermelon vs sesame") |
| [development/DEVELOPMENT_ROADMAP.yaml](development/DEVELOPMENT_ROADMAP.yaml) | Phased development roadmap |
| [development/PROGRESS.md](development/PROGRESS.md) | Latest progress checkpoint |

## Audit reports (historical, dated snapshots)

These are point-in-time audit snapshots. For current state, check the live gates:
`pnpm run typecheck && pnpm run lint && pnpm test`

| Report | Date | Focus |
|---|---|---|
| [archive/audits-2026-07/science_audit_report.md](archive/audits-2026-07/science_audit_report.md) | 2026-07-24 | Scientific rigor assessment |
| [archive/audits-2026-07/architecture_audit_report_20260724.md](archive/audits-2026-07/architecture_audit_report_20260724.md) | 2026-07-24 | Architecture review |
| [archive/audits-2026-07/formal_audit_report_20260724.md](archive/audits-2026-07/formal_audit_report_20260724.md) | 2026-07-24 | Formal verification analysis |
| [archive/audits-2026-07/product_audit_report.md](archive/audits-2026-07/product_audit_report.md) | 2026-07-24 | Product strategy review |
| [archive/audits-2026-07/security_audit_report_20260724.md](archive/audits-2026-07/security_audit_report_20260724.md) | 2026-07-24 | Security audit |
| [audits/SYSTEMIC_RISKS_2026-08-06.md](audits/SYSTEMIC_RISKS_2026-08-06.md) | 2026-08-06 | Systemic risk checklist (32 items, all verified) |

## Design documentation

> **全景入口**: [design/ULTIMATE_DESIGN.md](design/ULTIMATE_DESIGN.md)（2026-08-05 系统设计圣经——愿景、不可变原则、架构总览）。正式设计文档见下。

33 design documents live in [design/](design/). Reading order:

1. **01 Executive Design Contract** — one-page project overview
2. **02 Fact Baseline** — what actually exists (vs planned)
3. **09 Product Thesis** — frozen product definition
4. **10-12 Scientific authority / Domain model / Evidence & proof** — trust kernel semantics
5. **14 Architecture views** — structural decisions + ADRs (24 records in `.far-design/DECISIONS/`)
6. **13 Requirements** — 121 atomic requirements + 20 quality scenarios

See [design/00_INDEX_AND_READING_ORDER.md](design/00_INDEX_AND_READING_ORDER.md) for the full guide.

## Operational references (archived)

| Document | Purpose |
|---|---|
| [archive/agent-materials/PI_RUNBOOK.md](archive/agent-materials/PI_RUNBOOK.md) | Pi agent execution runbook (archived) |
| [archive/agent-materials/plan.md](archive/agent-materials/plan.md) | Pi execution plan (v2, includes v1→v2 adaptation) (archived) |
| [archive/agent-materials/3.md](archive/agent-materials/3.md) | Historical boot sequence (Step 1-15) (archived) |

> 历史性 agent 运行材料已归档至 `docs/archive/agent-materials/`（保留 git 历史与原始内容）。
> `docs/archive/` 整体为只读归档：不维护、不更新，导航入口仅本 INDEX。

## Root-Level Governance Files

| File | Description |
|------|-------------|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guide + quality gates |
| [../SECURITY.md](../SECURITY.md) | Security policy + license integrity |
| [../GOVERNANCE.md](../GOVERNANCE.md) | Project governance |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Contributor Covenant |
| [../CHANGELOG.md](../CHANGELOG.md) | Release changelog |
| [../SUPPORT.md](../SUPPORT.md) | Support channels |
| [governance/MAINTAINERS.md](governance/MAINTAINERS.md) | Maintainer list |
| [governance/](governance/) | Release operations + open-source plan + agent lifecycle (AGENT-LIFECYCLE / AGENT-ORCHESTRATION / AGENT-MEMORY / OPENCODE-PLANNING / ROOT-HYGIENE-POLICY) |
| [charter/ULTIMATE_EXECUTION_PRIME.md](charter/ULTIMATE_EXECUTION_PRIME.md) | Full lifecycle execution charter (Phase A–H) |

## Live quality gates

Verify current state at any time:

```bash
pnpm run typecheck   # TypeScript strict mode (0 errors expected)
pnpm run lint        # ESLint --max-warnings 0 (0 errors expected)
pnpm test            # 2278 tests (2272 pass / 0 fail / 6 skip — 以实测为准)
pnpm audit           # 0 known vulnerabilities
node scripts/repo_hygiene_gate.mjs   # 仓库卫生门禁（根目录白名单 / 无垃圾落根 / .far-proof 产物未跟踪）
```
