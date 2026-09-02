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
| Agent shell execution (`run_command` proposals) | The agent may only PROPOSE a command; the approval card shows the exact command text; execution happens after researcher approval (per-conversation remembered grants are explicit opt-ins). Execution: login shell, cwd confined to the workspace root, 30–120s timeout with process-tree kill, output capped. No sandbox claim — it runs with the researcher's privileges (same trust model as plugin hosts). |
| Integrated terminal (`/api/v1/terminal/*`) | Full shell access by design (the researcher's own login shell on their own machine; same trust model as plugin hosts). Loopback-bind server discipline applies; `FARLAB_TERMINAL=off` kills the surface entirely; concurrent-session cap + idle TTL; sessions never exposed on a non-loopback bind (server refuses non-loopback HOST without `FARLAB_ALLOW_REMOTE=1`). |
| Proxy / custom CA (`FARLAB_HTTPS_PROXY`, `FARLAB_CA_CERT`) | These change the TLS trust root and the path of every outbound request — treated as credential-grade config from the researcher's environment/.env (same boundary as API keys). `FARLAB_CA_CERT` is refused when `NODE_EXTRA_CA_CERTS` is already set at boot (no silent double trust roots); `far probe net` verifies the resulting chain with a loopback self-test before a run depends on it. |
| Thinking display (reasoning capture) | Model reasoning text is DISPLAY-ONLY: persisted on conversation messages, capped (8k/call, 12k/message), never fed back into prompts, never written into receipts (receipts carry hashes only). |

## At-Rest Encryption — Explicit Non-Goal (decision FA-DAT-03, 2026-09-02)

The local SQLite workspaces (`far.db`, scheduler/artifact stores) and the artifact directory are
stored **unencrypted**, by decision, for the current single-user local deployment:

- The threat model is a researcher's own machine with their own OS account. Against other OS
  accounts / device theft / offline disk access, the correct control is full-disk encryption
  (BitLocker/FileVault/LUKS) — an application-layer cipher adds no boundary the OS does not
  already enforce for a local single-user process, while adding a key-management surface
  (where does the app key live? same disk → no gain; OS keychain → new secret-sprawl).
- API keys are NOT in the databases (env/local secrets file; receipts carry hashes only).
- **Reopen trigger** (D-DAT-03): any multi-user, shared-workspace, or server deployment mode
  makes per-workspace encryption (SQLCipher / AES-GCM artifact envelopes) REQUIRED before that
  mode ships. Until such a mode exists, no at-rest-encryption claim is made anywhere.

## Scope

Scientific content produced by the pipeline is model output over retrieved literature — it is
data, not instructions. Verification of scientific claims is a separate concern from software
security and is covered by the reproducibility/verification tooling (`far verify`).
