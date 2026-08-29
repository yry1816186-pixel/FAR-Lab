# scripts/surgery — remote-surgery patch plane

This directory is the audit trail of the 2026-08-29 convergence session's
write mechanism for files too large to rewrite whole over the GitHub API
(`src/persistence/store.ts` ~67KB, `src/server/api.ts` ~143KB,
`web/src/lab/StudyMap.tsx` ~52KB, `web/src/i18n/dict.ts` ~190KB).

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
| `apply-store-protocol.mjs` | Inserted `protocol` / `protocol_execution` kinds + imports into `store.ts` (slice 1) |
| `apply-api-protocol.mjs` | Inserted `GET/POST /runs/:id/protocol(/records)` routes + ops import into `api.ts` (slice 1) |
| `apply-readme-protocol.mjs` | Inserted the research-protocol-layer bullet into `README.md` (slice 1) |
| `apply-web-protocol.mjs` | Web slice 2: StudyMap protocol band (import/state/fetch/JSX before the verdict section), `map.protocol.*` zh+en dict keys, lab.css band styles. Line-prefix regex anchors + a bounded walk-up to the verdict `<section>` — chosen so every anchor survives generic/JSX-stripping remote reads |
| `dump-api-context.mjs` | Refreshed `api-context.txt`, a structural dump (exports + anchor markers) used to discover stable anchors remotely |
| `api-context.txt` | Last structural dump (session working artifact) |
| `diag.txt` | Last full-suite diagnostics snapshot committed by the diagnose job (merge-gate evidence) |

## Branch lifecycle (per slice)

While a slice is in flight, `surgery.yml` carries push triggers scoped to
that slice's `converge/**` branch (paths: `scripts/surgery/**` + the workflow
file) — never `pull_request`, so untrusted patches cannot ride it. The LAST
commit of every slice re-neutralizes the workflow to `workflow_dispatch`
only, so `main` always ends up with a dormant patch plane. All apply scripts
no-op on already-patched trees (unique done-markers per edit), so a manual
dispatch is safe.

## Current state: dormant on main

All anchor targets are already applied on `main`; re-running any apply script
no-ops. On `main` the workflow triggers only on manual `workflow_dispatch`.
Keep these scripts for provenance; new local development should edit files
directly.
