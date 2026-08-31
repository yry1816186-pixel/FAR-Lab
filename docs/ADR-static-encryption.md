# ADR — Static At-Rest Encryption

Status: accepted (2026-09-01, Wave A)
Scope: workspace databases, artifact store, backups, provider credentials.

## Context

FAR-Lab's on-disk static surface consists of:

| surface | content | sensitivity |
| --- | --- | --- |
| `far.db` (SQLite, better-sqlite3 stock build) | runs, events, objects, memory, lineage, receipts | scientific record — the product |
| `far-scheduler.db` | experiment job queue | operational |
| `source-cache.db` | retrieval response cache | QoS only |
| artifact store | content-addressed files (sources, reports, bundles, datasets) | scientific record |
| backup sets (`far backup`) | `VACUUM INTO` snapshots + manifest, same plaintext as the originals | scientific record |
| provider credentials | **never written to disk** — resolved from `process.env` at call time (see `src/platform/dotenv.ts`, `src/providers/*`); `far` prints only which env var names are missing, never values | highest |

Deployment model: a single-researcher local workstation (Windows/macOS/Linux), occasionally a shared lab machine. The database engine is stock `better-sqlite3`; enabling SQLCipher would require a custom compiled build on all three platforms, diverging from the npm lockfile everyone installs.

## Decision

**FAR-Lab does not implement its own at-rest encryption. Static protection is delegated to the operating system's full-disk encryption (BitLocker on Windows, FileVault on macOS, LUKS on Linux), and this delegation is documented honestly wherever data lands.**

Rationale:

1. **Key management would be theater.** A local app that encrypts its own database must store the key on the same machine (or behind a password prompt per launch). On a single-user workstation the OS already gates disk access with the same authentication boundary; an app-layer key adds no adversary it can actually stop.
2. **Engine-level encryption breaks the deterministic supply chain.** better-sqlite3 with SQLCipher means a custom build matrix on three OSes for every CI job and every contributor, replacing `npm ci` reproducibility — the exact property the license/SBOM and clean-clone gates exist to protect.
3. **Field-level encryption destroys queryability.** Encrypting columns would break FTS, `EXPLAIN`-audited indexes, and the verbatim-binding guarantees the verify chain depends on.

What we keep doing instead:

- Credentials stay env-only and never enter any file, log, or export (`R7` credential discipline, secret-scan gate).
- `far backup` sets are explicitly documented as plaintext copies of the workspace (docs/backup-restore.md) so users route them to encrypted storage.
- Workspaces on shared machines are per-user directories relying on OS file permissions.

## Consequences

- On an unencrypted disk, a physical-disk attacker can read everything except provider keys. This is stated, not hidden.
- Institutional/compliance deployments needing app-layer encryption (e.g. multi-user terminal servers) are a **registered roadmap decision**, not an implicit gap: the migration path would be SQLCipher via an opt-in build, or full-disk encryption policy enforcement at deployment.
- A `far doctor` check (Wave E) will detect and report "workspace not on an OS-encrypted volume" as a warning-grade finding with this ADR as its reference.
