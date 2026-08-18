# Support

## Read the docs first

- Entry: `README.md`
- Quickstart: `README` · Installation: `README`
- Architecture: `README`
- Concepts & glossary: `README` (core concept table) + `far <command> --help`

## Self-diagnosis

```bash
node src/cli/far.ts doctor     # environment self-diagnosis (no API key needed)
node src/cli/far.ts status     # project status
```

## Where to ask

- **Usage questions / architecture discussion**: GitHub Discussions
- **Bugs**: GitHub Issue (`.github/ISSUE_TEMPLATE/bug_report.yml`)
- **Feature requests**: GitHub Issue (`.github/ISSUE_TEMPLATE/feature_request.yml`)
- **Reproducibility failure** (a verdict you cannot reproduce): GitHub Issue
  (`.github/ISSUE_TEMPLATE/reproducibility_failure.yml` — reproducibility is a first-class concern)

## Security vulnerabilities

**Do not open a public issue.** See `SECURITY.md` for private disclosure
(GitHub Private Vulnerability Reporting — preferred:
`https://github.com/yry1816186-pixel/FAR-Lab/security/advisories/new`).

## Response time

Best-effort, single-maintainer project, no SLA committed yet. See `MAINTAINERS.md`.

## Out of scope

FAR-Lab does **not**:

- prove scientific truth
- provide physical tamper-proofing guarantees
- replace peer review or wet-lab validation
- act as a general-purpose AI4S benchmark
