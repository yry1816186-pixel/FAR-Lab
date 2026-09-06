# Security Policy

FAR-Lab treats filesystem, subprocess, network, providers, plugins, MCPs, and
external/retrieved content as **security and trust boundaries**, and applies least
privilege. We would rather state an explicit non-goal than overclaim a protection
we do not provide.

## Table of contents

- [Reporting a vulnerability](#reporting-a-vulnerability)
- [Supported versions](#supported-versions)
- [Secrets and API keys](#secrets-and-api-keys)
- [Threat model](#threat-model)
- [Explicit non-goals](#explicit-non-goals)
- [Scope](#scope)

## Reporting a vulnerability

Do **not** open a public issue. Report privately via a [private GitHub security
advisory](https://github.com/yry1816186-pixel/FAR-Lab/security/advisories/new).

We aim to acknowledge within **48 hours**, assess within **7 days**, and ship fixes
for critical issues within **30 days**. Please include reproduction steps and
impact; we will coordinate disclosure timing with you.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `main` | ✅ |
| `0.x` releases | ✅ (pre-1.0; breaking changes allowed per [VERSIONING.md](VERSIONING.md)) |
| Older `0.x` | ⚠️ best-effort; not actively patched |

## Secrets and API keys

The tool reads model-provider credentials from environment variables (or a local,
gitignored `.far-run/secrets.env`). Rules:

- Never commit `.env`-style files. `.gitignore` enforces this, and
  `zcode-harness/scripts/secret-scan.mjs` scans the tree (HIGH findings fail the
  gate).
- Use scoped/restricted keys where the provider allows it (model-limited,
  spend-capped).
- Keys never enter repository files, logs, prompts, or receipts. Provider adapters
  redact credential-shaped substrings at the persistence chokepoint; receipts
  record hashes only.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Committed `.env` leak | `.gitignore` patterns + secret-scan gate (exact-match synthetic allowlist, documented). |
| Supply chain via dependencies | Single runtime dependency (`zod`, schema validation only — see [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md)); all tooling is a devDependency. |
| Path traversal / SSRF via identifiers | Source adapters encode URL path segments; the artifact store validates sha256 refs; the API validates request paths. |
| Prompt injection via retrieved literature | Per-request random-delimiter untrusted-data fence at the transport layer; structured-output zod contracts. External text is untrusted *evidence*, never a higher-priority instruction. |
| Local server exposure | Loopback bind by default; Host/Origin/Content-Type guards; 1 MB body cap. |
| CI credential exfiltration | Minimal `GITHUB_TOKEN` permissions, `persist-credentials: false`. |
| Malicious/hung external tool (MCP server, JS plugin) | Plugins and MCP servers run as separate subprocesses with timeout bounds (30 s/tool, 2 s/hook) — isolation against **crashes and hangs only, not malicious code**; they execute with the researcher's own OS privileges (industry-standard MCP trust model). Controls: local-directory-only plugin import with a `reviewed:true` gate, staged **DISABLED** on import, per-integration explicit activation, `execute` risk-class default (explore mode denies non-read tools), env/header secrets write-only (masked in every API projection). |
| Agent shell execution (`run_command` proposals) | The agent may only **propose** a command; the approval card shows the exact command text; execution happens after researcher approval (per-conversation remembered grants are explicit opt-ins). Runs in a login shell confined to the workspace root, 30–120 s timeout with process-tree kill, output capped. No sandbox claim — it runs with the researcher's privileges. |
| Integrated terminal (`/api/v1/terminal/*`) | Full shell access by design (the researcher's own login shell on their own machine). Loopback discipline applies; `FARLAB_TERMINAL=off` disables the surface; concurrent-session cap + idle TTL; never exposed on a non-loopback bind without `FARLAB_ALLOW_REMOTE=1`. |
| Proxy / custom CA (`FARLAB_HTTPS_PROXY`, `FARLAB_CA_CERT`) | These change the TLS trust root and the path of every outbound request — treated as credential-grade config. `FARLAB_CA_CERT` is refused when `NODE_EXTRA_CA_CERTS` is already set at boot (no silent double trust roots); `far probe net` verifies the resulting chain with a loopback self-test. |
| Thinking display (reasoning capture) | Model reasoning text is **display-only**: persisted on conversation messages, capped (8k/call, 12k/message), never fed back into prompts, never written into receipts (receipts carry hashes only). |

## Explicit non-goals

**At-rest encryption is an explicit non-goal** for the current single-user local
deployment (decision FA-DAT-03, 2026-09-02). The local SQLite workspaces
(`far.db`, scheduler/artifact stores) and the artifact directory are stored
**unencrypted, by decision**:

- The threat model is a researcher's own machine under their own OS account. Against
  other OS accounts, device theft, or offline disk access, the correct control is
  **full-disk encryption** (BitLocker / FileVault / LUKS) — an application-layer
  cipher adds no boundary the OS does not already enforce, while introducing a
  key-management surface.
- API keys are not stored in the databases (environment / local secrets file;
  receipts carry hashes only).
- **Reopen trigger:** any multi-user, shared-workspace, or server deployment mode
  makes per-workspace encryption (SQLCipher / AES-GCM artifact envelopes) **required**
  before that mode ships. Until such a mode exists, no at-rest-encryption claim is
  made anywhere.

## Scope

Scientific content produced by the pipeline is model output over retrieved
literature — it is *data*, not instructions. Verification of scientific claims is a
separate concern from software security and is handled by the
reproducibility/verification tooling (`far verify`).
