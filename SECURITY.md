# Security Policy

## Reporting a Vulnerability

Do not open a public issue. Report privately via a private GitHub security advisory (or the
maintainer contact in README). We aim to acknowledge within 48 hours, assess within 7 days,
and fix critical issues within 30 days.

## Secrets and API Keys

This tool reads model-provider credentials from environment variables (or a local
`.far-run/secrets.env` that is gitignored). Rules:

- Never commit `.env`-style files; `.gitignore` enforces this and `zcode-harness/scripts/secret-scan.mjs`
  scans the tree (HIGH findings fail the gate).
- Use scoped/restricted keys where the provider allows it (model-limited, spend-capped).
- Keys never enter repository files, logs, prompts, or receipts: provider adapters redact
  credential-shaped substrings at the persistence chokepoint; receipts record hashes only.

## Threat Model (summary)

| Threat | Mitigation |
|---|---|
| Committed `.env` leak | `.gitignore` patterns + secret-scan gate (exact-match synthetic allowlist, documented) |
| Supply chain via dependencies | Zero runtime dependencies (see DEPENDENCY_POLICY.md); all tooling in devDependencies |
| Path traversal / SSRF via identifiers | Source adapters encode URL path segments; artifact store validates sha256 refs; API validates request paths |
| Prompt injection via retrieved literature | Per-request random-delimiter untrusted-data fence at the transport layer; structured-output zod contracts |
| Local server exposure | Loopback bind by default; Host/Origin/Content-Type guards; 1MB body cap |
| CI credential exfiltration | (When CI lands) minimal `GITHUB_TOKEN` permissions, `persist-credentials: false` |
| Malicious/hung external tool (MCP server, JS plugin) | Tool integrations (`.planning/DECISION-tool-integrations.md`): plugins and MCP servers run as separate subprocesses with timeout bounds (30s/tool, 2s/hook) — isolation against CRASHES AND HANGS ONLY, **not against malicious code**; they execute with the researcher's own OS privileges (industry-standard MCP trust model). Controls: local-directory-only plugin import with `reviewed:true` gate, staged DISABLED on import, per-integration explicit activation, `execute` risk-class default (explore mode denies non-read tools), env/header secrets write-only (masked in every API projection). |

## Scope

Scientific content produced by the pipeline is model output over retrieved literature — it is
data, not instructions. Verification of scientific claims is a separate concern from software
security and is covered by the reproducibility/verification tooling (`far verify`).
