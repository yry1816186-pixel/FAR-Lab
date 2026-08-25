# Handoff 01 → 12: /api/v1/health cold-start latency on populated workspaces

- **From:** lane 01 (hx-web-product) — **To:** lane 12 (platform-data-api)
- **Date:** 2026-08-24 · **Urgency:** P1 (first-impression truthfulness) · **Status:** requested

## Requested change

Make the first `GET /api/v1/health` after server start not block on audit-chain
verification over the full event log (populated workspaces: the first call took
long enough to exceed the web client's 30s timeout).

## Observed evidence (lane-01 dogfood, real workspace snapshot)

- Server cold start against a 33.7MB `far.db` (85 runs / 7443 events).
- Page loaded right after start showed `工作台状态：未知（健康检查失败）` for a
  full 30s poll cycle, then recovered to ready.
- Timestamps: server start ~15:17Z; the health response carried
  `auditChain.verifiedAt: 2026-08-24T15:18:53.816Z` — the verification ran
  during/after the first health request; a direct curl at 15:19:11 was fast
  (result cached). Second server start on the same DB: health fast from the
  first call (verifiedAt persisted).
- Root cause lives server-side (lazy audit verify inside the health route or
  its first call path — lane 12 owns `src/server/api.ts`).

## Why it matters

The health strip is the first thing a returning researcher reads; on a
populated workspace the first impression is a false "failed" for up to 30s.

## What lane 01 already did (client-side mitigation, shipped)

`web/src/hooks/useHealth.ts`: first two failures retry after 2.5s (not the
30s cadence) and the strip distinguishes `检查中…` (in flight) from `失败`
(an answered error). Server-side latency remains yours.

## Suggested fix direction (owner decides)

Return 200 immediately with `auditChain: {status: "verifying"}` and verify in
the background, or scope the first verification to the newest run window.
Do not silently drop the audit check.
