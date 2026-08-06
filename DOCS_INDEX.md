# FAR-Lab Repository Navigation Guide

> New here? Start here. This index organizes all root-level documents into a clear reading path.

## Quick start (for judges / new visitors)

| You are... | Read this first |
|---|---|
| **A competition judge** (5 min) | [docs/JUDGE_QUICKSTART.md](docs/JUDGE_QUICKSTART.md) |
| **A developer** (15 min) | [README.md](README.md) §30-second install → §2-minute Quickstart |
| **An architecture reviewer** | [docs/design/01_EXECUTIVE_DESIGN_CONTRACT.md](docs/design/01_EXECUTIVE_DESIGN_CONTRACT.md) |
| **A security auditor** | [SECURITY.md](SECURITY.md) → [docs/audits/](docs/audits/) |

## Core project documents

| Document | Purpose | Audience |
|---|---|---|
| [README.md](README.md) | Project overview + install + quickstart | Everyone |
| [README.zh-CN.md](README.zh-CN.md) | Chinese README | Chinese-speaking visitors |
| [GOAL.md](GOAL.md) | Project priorities ("watermelon vs sesame") | Contributors |
| [AGENTS.md](AGENTS.md) | Agent operating contract (auto-loaded) | AI agents |
| [CLAUDE.md](CLAUDE.md) | Claude Code integration config | AI agents |

## Quality and process

| Document | Purpose |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | PR workflow + quality gates |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards |
| [GOVERNANCE.md](GOVERNANCE.md) | Project governance |
| [MAINTAINERS.md](MAINTAINERS.md) | Maintainer list |
| [SECURITY.md](SECURITY.md) | Security policy + reporting |
| [SUPPORT.md](SUPPORT.md) | Getting help |

## Strategy and planning

| Document | Purpose |
|---|---|
| [COMPETITION_STRATEGY.md](COMPETITION_STRATEGY.md) | Competition positioning + gap analysis |
| [DEVELOPMENT_ROADMAP.yaml](DEVELOPMENT_ROADMAP.yaml) | Phased development roadmap |
| [PROGRESS.md](PROGRESS.md) | Latest progress checkpoint |
| [DEEP_AUDIT.md](DEEP_AUDIT.md) | Deep audit findings |

## Audit reports (historical, dated snapshots)

These are point-in-time audit snapshots. For current state, check the live gates:
`pnpm run typecheck && pnpm run lint && pnpm test`

| Report | Date | Focus |
|---|---|---|
| [science_audit_report.md](science_audit_report.md) | 2026-07-24 | Scientific rigor assessment |
| [architecture_audit_report_20260724.md](architecture_audit_report_20260724.md) | 2026-07-24 | Architecture review |
| [formal_audit_report_20260724.md](formal_audit_report_20260724.md) | 2026-07-24 | Formal verification analysis |
| [product_audit_report.md](product_audit_report.md) | 2026-07-24 | Product strategy review |
| [security_audit_report_20260724.md](security_audit_report_20260724.md) | 2026-07-24 | Security audit |

## Design documentation

33 design documents live in [docs/design/](docs/design/). Reading order:

1. **01 Executive Design Contract** — one-page project overview
2. **02 Fact Baseline** — what actually exists (vs planned)
3. **09 Product Thesis** — frozen product definition
4. **10-12 Scientific authority / Domain model / Evidence & proof** — trust kernel semantics
5. **14 Architecture views** — structural decisions + ADRs
6. **13 Requirements** — 121 atomic requirements + 20 quality scenarios

See [docs/design/00_INDEX_AND_READING_ORDER.md](docs/design/00_INDEX_AND_READING_ORDER.md) for the full guide.

## Operational references

| Document | Purpose |
|---|---|
| [PI_RUNBOOK.md](PI_RUNBOOK.md) | Pi agent execution runbook |
| [NEW_SESSION_PROMPT.md](NEW_SESSION_PROMPT.md) | Prompt template for new agent sessions |
| [plan.md](plan.md) | Pi execution plan (v2, includes v1→v2 adaptation) |
| [3.md](3.md) | Historical boot sequence (Step 1-15) |

## Live quality gates

Verify current state at any time:

```bash
pnpm run typecheck   # TypeScript strict mode (0 errors expected)
pnpm run lint        # ESLint --max-warnings 0 (0 errors expected)
pnpm test            # 1518+ tests (0 failures expected)
pnpm audit           # 0 known vulnerabilities
```
