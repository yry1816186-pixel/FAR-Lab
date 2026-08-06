# Governance Operations

This directory holds the operational side of project governance — release process,
release readiness, and open-source preparation checklists.

The high-level governance rules (roles, decision process, keystone files,
succession) live in the root-level [`GOVERNANCE.md`](../../GOVERNANCE.md).

## Documents

| Document | Purpose |
|----------|---------|
| [release-process.md](release-process.md) | Tagging, release workflow, and release-assets checklist |
| [OPEN_SOURCE_RELEASE_PLAN.md](OPEN_SOURCE_RELEASE_PLAN.md) | Open-source release-form decisions and remaining actions |
| [disaster-recovery-runbook.md](disaster-recovery-runbook.md) | Backup/restore procedures, DR drill status (Phase 5) |

> **Status note (2026-07-25 governance audit):** the following documents are
> intentionally gitignored as they contain local audit snapshots rather than
> shipped governance content. They are listed here so contributors do not
> recreate them as tracked files:
> - `OPEN_SOURCE_AUDIT.md` — one-shot audit, local-only
> - `RELEASE_READINESS_CHECKLIST.md` — release-specific checklist, local-only
> - `P1_2_PROOF_AUDIT.md` — proof audit snapshot, local-only
>
> These patterns are recorded in `.gitignore` (search "Local-only docs").

## See also

- [GOVERNANCE.md](../../GOVERNANCE.md) — roles, decision process, keystone files
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — contribution guide + quality gates
- [SECURITY.md](../../SECURITY.md) — security policy and secret boundaries
- [MAINTAINERS.md](../../MAINTAINERS.md) — maintainer roster (`NEEDS_MAINTAINER_ASSIGNMENT`)
- [../charter/ULTIMATE_EXECUTION_PRIME.md](../charter/ULTIMATE_EXECUTION_PRIME.md) — full lifecycle execution charter
