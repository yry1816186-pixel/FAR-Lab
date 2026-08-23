# PROPOSAL — Screening Loop (ASReview-pattern) + Desktop Release Triad + Artifact GC

Status: PROPOSED (awaiting user approval per HCI hard gate). Everything below is
designed to the point of direct implementation; zero new runtime deps in the Node
product (deterministic TS only).

## 1. Active-learning screening loop (OSS diff action #1 — biggest differentiator)

Problem: retrieval returns a ranked pool; the researcher either accepts it whole or
re-runs. ASReview's validated pattern (Nature MI; saves ~95% screening effort with
WSS@95 stop rules) turns this into a loop: researcher marks include/exclude → pool
reranks deterministically → stop criterion + recall-risk disclosure.

Design (all deterministic, no Python):
- **Objects** (zod, store): `screening_session { id, runId, poolKey, includeKeys[], excludeKeys[], state }` + `screening_decision { id, sessionId, srcKey, verdict: 'include'|'exclude', reason?, at }` (append-only).
- **Rerank** (`src/pipeline/screening.ts`, pure): TF-IDF over pool abstracts → logistic regression trained on labeled rows (include=1) → score unlabeled; next-up = highest score + highest uncertainty (label entropy) mix. Seeded, byte-deterministic.
- **Stop rule**: WSS@95-style — after ≥15 labels, estimate the fraction of relevant docs found; when the 10 most-recently-screened are all predicted-exclude with p<0.05 relevant, propose stop with an honest recall-risk line (e.g. "估计已覆盖 95% 相关文献（WSS@95，n=…）——继续筛选的边际收益低").
- **UI**: corpus tab gains "筛选" mode — one card at a time (title+abstract+why-it-ranked), include/exclude buttons, progress + stop-criterion state (never invented: shows n labeled, estimate, uncertainty).
- **Pipeline integration**: a screened corpus feeds build_evidence with include-set only; excluded docs stay visible in provenance with the researcher's verdicts (negative evidence preserved).
- Tests: determinism (same labels → same order), stop-rule math on golden fixtures, include-only evidence flow, UI contract.

## 2. Desktop release triad (OSS diff action #3)

- **CSP**: tauri.conf.json `app.security.csp` from null → `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ipc: http://ipc.localhost http://127.0.0.1:3196"` (verify against dev proxy needs before landing).
- **bundle.active**: enable (NSIS+MSI); prerequisite check that vite `base` is relative for the embedded asset path.
- **Updater**: add tauri-plugin-updater (official, MIT/Apache-2.0) with **forced signing**; signing key is a USER step (`npm run tauri signer generate`), config lands with env-var placeholders `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`; app shows "更新不可用（未配置签名）" honestly when unset. No auto-update server bundled — a `latest.json` URL is set at release time.
- **Crash reporting, local-first**: store minidumps under `%APPDATA%/FAR-Lab/crashes/` (tauri-plugin-crash-handler or process-level), UI shows crash count + "导出诊断包" button; NO Sentry SaaS by default (secrets/local-first red line). Upload-offline unless the user opts in explicitly.
- BLOCKED-user: signing key generation + release server URL.

## 3. Artifact GC (`far gc`, gap R7)

- New CLI `far gc --dry-run|--apply`: enumerate artifacts blob hashes → scan all objects' refs (bundles, fullTextRef, receipts' artifact refs) → list/ delete unreferenced blobs + empty shard dirs. Deterministic, idempotent, prints counts. Test: seed orphan blob → dry-run lists → apply removes → referenced blob survives.

## Sequencing after approval
Screening loop first (product value), then release triad (CSP+bundle can land immediately; updater waits on key), GC last (small).
