# Support

## Read the docs first

- Entry: `README.md`
- Quickstart: `docs/quickstart.md` · Installation: `docs/installation.md`
- Concepts: `docs/concepts/` (`far-proof`, `evidence-ledger`)
- Architecture: `docs/INDEX.md`
- Glossary: `docs/concepts/`
- Release operations: `docs/governance/`

## Self-diagnosis

```bash
node src/cli/far.ts doctor     # environment self-diagnosis (no API key needed)
node src/cli/far.ts status     # project status
```

## Where to ask

- **Usage questions / architecture discussion**: GitHub Discussions
  (`NEEDS_MAINTAINER_ASSIGNMENT` to enable)
- **Bugs**: GitHub Issue (`.github/ISSUE_TEMPLATE/bug_report.yml`)
- **Feature requests**: GitHub Issue (`.github/ISSUE_TEMPLATE/feature_request.yml`)
- **Reproducibility failure** (a verdict you cannot reproduce): GitHub Issue
  (`.github/ISSUE_TEMPLATE/` — reproducibility is a first-class concern)

## Security vulnerabilities

**Do not open a public issue.** See `SECURITY.md` for private disclosure
(`security@far-lab.example.com`).

## Response time

`NEEDS_MAINTAINER_ASSIGNMENT` — best-effort, single-maintainer project, no SLA
committed yet.

## Out of scope

FAR-Lab does **not**:

- prove scientific truth
- provide physical tamper-proofing guarantees
- replace peer review or wet-lab validation
- act as a general-purpose AI4S benchmark
