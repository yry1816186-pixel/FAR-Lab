# FAR-Lab Repository Navigation Guide

> **This page is a thin redirect.** The single source of truth for documentation and
> governance navigation is **[docs/INDEX.md](docs/INDEX.md)** (merged 2026-08-06 governance
> session — includes quick starts, learning path, concepts, references, audits, design docs,
> and root governance files in one index).

Quick access:

- **Learning path (13 chapters + exercises)**: [docs/learning/00_START_HERE.md](docs/learning/00_START_HERE.md)
- **Judges (5 min)**: [docs/JUDGE_QUICKSTART.md](docs/JUDGE_QUICKSTART.md)
- **Developers**: [README.md](README.md) → [docs/INDEX.md](docs/INDEX.md)
- **Architecture reviewers**: [docs/design/00_INDEX_AND_READING_ORDER.md](docs/design/00_INDEX_AND_READING_ORDER.md)
- **Security auditors**: [SECURITY.md](SECURITY.md) → [docs/audits/](docs/audits/)

Live quality gates:

```bash
pnpm run typecheck   # TypeScript strict mode (0 errors expected)
pnpm run lint        # ESLint --max-warnings 0 (0 errors expected)
pnpm test            # 2023 tests (2017 pass / 0 fail / 6 skip)
pnpm audit           # 0 known vulnerabilities
```
