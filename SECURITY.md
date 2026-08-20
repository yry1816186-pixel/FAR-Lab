# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest main | ✅ |
| < 1.0.0 (pre-release) | ⚠️ best effort |

## Reporting a Vulnerability

**DO NOT open public GitHub issues for security vulnerabilities.**

Primary channel — GitHub Private Vulnerability Reporting (operational, no setup needed):

    https://github.com/yry1816186-pixel/FAR-Lab/security/advisories/new

Response SLA:
- Acknowledgement: 48 hours
- Initial assessment: 7 days
- Fix or mitigation: depends on severity

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (optional)

## Disclosure Policy

1. Vulnerability confirmed → develop fix in private fork
2. Fix released → publish security advisory (GitHub Security Advisories)
3. Credit reporter (if desired)

---

## Hard Rules: Secrets Must Never Enter the Repository

### Prohibited

The following must **never** appear in any committed file (source code, tests,
docs, CI config, scripts, comments, or commit messages):

| Category | Examples |
|---|---|
| API Keys | `DASHSCOPE_API_KEY`, `OPENAI_API_KEY`, any cloud credential |
| Tokens / Secrets | JWT secrets, session secrets, signing keys |
| Connection Strings | Database passwords, Redis passwords, any `user:pass@host` URI |
| Internal URLs | Non-public DashScope/Bailian endpoints, internal IP addresses |
| Private Keys | SSH keys, PGP private keys, TLS cert private keys |

### Enforcement

- CI scans for hardcoded secret patterns on every run.
- Pre-commit hooks block commits containing high-entropy strings matching known key formats.
- `.env.example` is the **only** allowed template file — it lists keys without values.
- All CI logs are scrubbed before archival; never `echo` or `console.log` secrets.

### If You Accidentally Commit a Secret

1. **Rotate the secret immediately** (regenerate the API key / token).
2. **Purge from git history** using `git filter-branch` or BFG Repo-Cleaner.
3. **Notify the security contact** via GitHub Private Vulnerability Reporting.
4. Do NOT just add a new commit removing the file — the secret remains in history.

---

## Dependency Security

- `pnpm audit` runs weekly on `main` via the scheduled dependency-security workflow
  (all deps + prod-only + frontend, `--audit-level=high` gate, plus registry-signature
  verification), and license/supply-chain checks run as part of every release.
- Python dependencies are pinned in `pyproject.toml` with version ranges.
- Direct dependencies are checked for known CVEs by the weekly audit above and the
  release supply-chain gate.

## Model Neutrality & Security

- Core (`src/llm_gateway/`) must never hard-code Qwen, Bailian, or DashScope.
- Competition adapter (`src/llm_gateway/adapters/aliyun_qwen/`) is the **only**
  location for provider-specific code.

---

## Open-Source Install / Doctor Secret Boundary

The new open-source release artifacts (install scripts / `far doctor` / Docker) strictly
follow the secret rules in this file:

| Artifact | Secret boundary |
|------|----------|
| `scripts/install.sh` / `install.ps1` | **never writes** API keys; **never reads** host `.env`; only checks tool presence |
| `far doctor` | only checks whether `DASHSCOPE_API_KEY` is **set and non-empty**; **never reads its value**; missing → WARN only, never FAIL |
| `far doctor --live-qwen-smoke` | calls real API only with explicit flag (reuses `ci/competition_qwen_smoke.ts`); no key → FAIL |
| `Dockerfile` / `docker-compose.yml` | image ships **no** key; real provider only via explicit `docker compose --env-file .env` |
| `far demo tess-offline` / `far verify` | zero network, zero keys, zero real API |

---

## License Integrity

The project license (`LICENSE`) is currently **MIT** (`Copyright (c) 2026 FAR-Lab
Contributors`). This is an irreversible legal decision:

- **Agents must never modify `LICENSE`** without explicit human confirmation.
- Any license change requires syncing `LICENSE`, all `package.json` `license`
  fields, and `CITATION.cff` simultaneously — plus handling contributor IP
  compatibility.
- Third-party code (e.g. frontend Apache-2.0 dependencies) may require
  additional `NOTICE` / `LICENSE` declarations — human audit required.

Default: maintain MIT. Do not change without human directive.
