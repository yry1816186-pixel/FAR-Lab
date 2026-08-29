# scripts/surgery — remote-surgery patch plane

This directory is the audit trail of the 2026-08-29 convergence session's
write mechanism for files too large to rewrite whole over the GitHub API
(`src/persistence/store.ts` ~67KB, `src/server/api.ts` ~143KB, `README.md`).

## Why it existed

The session's work surface was remote-only: no local checkout, no shell. The
GitHub contents API and web readers strip TypeScript generics (`<...>`) from
file bodies, so a full-file rewrite of a large TS module risks silent type
corruption. The workaround: committed Node scripts that perform **anchored
insertion** on the runner — exact unique anchor strings, fail-loud if an
anchor is missing or ambiguous, idempotent on re-run — executed by
`.github/workflows/surgery.yml` and committed by the workflow itself with a
reviewable diff.

## What's here

| File | Role |
|------|------|
| `apply-store-protocol.mjs` | Inserted `protocol` / `protocol_execution` kinds + imports into `store.ts` |
| `apply-api-protocol.mjs` | Inserted `GET/POST /runs/:id/protocol(/records)` routes + ops import into `api.ts` |
| `apply-readme-protocol.mjs` | Inserted the research-protocol-layer bullet into `README.md` |
| `dump-api-context.mjs` | Refreshed `api-context.txt`, a structural dump (exports + anchor markers) used to discover stable anchors remotely |
| `api-context.txt` | Last structural dump (session working artifact) |
| `diag.txt` | Last full-suite diagnostics snapshot committed by the diagnose job; the merge-gate evidence for the session (2198 passed / 7 skipped) |

## Current state: dormant

All anchor targets are already applied on `main`; re-running any apply script
no-ops. The workflow triggers only on manual `workflow_dispatch` — no push, no
`pull_request` (it was never allowed on `pull_request`, so untrusted patches
could not ride it). Keep these scripts for provenance; new development should
edit files directly.
