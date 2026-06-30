# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest main | ✅ |
| < 1.0.0 (pre-release) | ⚠️ best effort |

## Reporting a Vulnerability

**DO NOT open public GitHub issues for security vulnerabilities.**

Email: security@far-chain.example.com

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

- `scripts/zero_tolerance_scan.mjs` scans for hardcoded secret patterns on every CI run.
- Pre-commit hooks block commits containing high-entropy strings matching known key formats.
- `.env.example` is the **only** allowed template file — it lists keys without values.
- All CI logs are scrubbed before archival; never `echo` or `console.log` secrets.

### If You Accidentally Commit a Secret

1. **Rotate the secret immediately** (regenerate the API key / token).
2. **Purge from git history** using `git filter-branch` or BFG Repo-Cleaner.
3. **Notify the security contact** (security@far-chain.example.com).
4. Do NOT just add a new commit removing the file — the secret remains in history.

---

## Bailian / DashScope Screenshot Sanitization Rules

When capturing screenshots of DashScope console or Bailian API responses for
evidence or documentation, **all sensitive fields must be redacted** before
committing:

| Field | Action |
|---|---|
| `DASHSCOPE_API_KEY` header value | Full black bar redaction |
| Request ID fragments that reveal account identity | Partial redaction (keep first 4 chars only) |
| Billing / quota numbers | Full redaction |
| Personal account name / avatar | Full redaction |
| Internal DashScope console URLs | Full redaction or replace with placeholder |

**Redaction checklist** before committing any screenshot:
- [ ] Open the screenshot and visually confirm no key material is visible
- [ ] Verify PNG metadata does not contain paths with usernames
- [ ] Place sanitized screenshots in `evidence/dashscope_calls/` with date prefix

---

## Cost Snapshot Archiving

Bailian/DashScope API call cost snapshots are archived for competition evidence
but must NOT expose billing details:

- **Location**: `evidence/dashscope_calls/YYYY-MM-DD_cost_snapshot.json`
- **Required fields**: date, model_id, request_count, total_tokens (sum), verdict
- **Prohibited fields**: unit_price, total_cost_rmb, account_balance, quota_remaining
- **Format**: JSON with `__redacted__` placeholder for any numeric field that
  could reveal pricing
- Cost snapshots are **competition profile** artifacts only — they are never
  required for Core gate passage

---

## Dependency Security

- `pnpm audit` runs on every CI pipeline.
- Python dependencies are pinned in `pyproject.toml` with version ranges.
- Direct dependencies are audited for known CVEs before each release.
- See `FAR_CHAIN_DEV_SPEC/25_安全合规与运维_SECOPS.md` for full SBOM and
  dependency audit procedures.

## Model Neutrality & Security

- Core (`src/llm_gateway/`) must never hard-code Qwen, Bailian, or DashScope.
- Competition adapter (`src/llm_gateway/adapters/aliyun_qwen/`) is the **only**
  location for provider-specific code.
- See `FAR_CHAIN_DEV_SPEC/16_阿里云参与边界与模型中立策略_ALIYUN_MODEL_NEUTRALITY.md`.
