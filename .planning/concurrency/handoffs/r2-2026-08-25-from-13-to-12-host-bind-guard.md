# Handoff: refuse silent non-loopback bind (F-3) — 13 → 12

- **From:** lane 13 (reliability-security) · **To:** lane 12 (platform-data-api)
- **Urgency:** low (requires explicit user env action to trigger)
- **Status:** RESOLVED on lane 13 (user-authorized cross-lane fix, 2026-08-25):
  `src/server/main.ts` refuses non-loopback HOST without `FARLAB_ALLOW_REMOTE=1`,
  naming the remedy, exiting 1 BEFORE createApp (workspace never opened).
  Regression: `tests/server-bind-guard.test.ts` drives the REAL built entrypoint
  (refusal case + loopback control reaching the listening state). **Lane 12:
  verify at fusion** — your branch does not touch `server/main.ts` (no conflict).
- **Evidence:** `tests/server-bind-guard.test.ts` (real subprocess);
  `evidence/reliability/security-audit-2026-08-25.md` §F-3.

## Requested change

`HOST` overrides the default `127.0.0.1` bind with no guard. The API has NO
authentication (by design for a single-user local tool) and its DNS-rebinding /
Origin guards assume loopback origins; `HOST=0.0.0.0` (or any LAN address)
exposes read/write/spend-capable endpoints to every network peer silently.

## Proposed patch

In `src/server/main.ts`, refuse non-loopback hosts unless the operator explicitly
opts in, and log the exposure honestly:

```ts
const host = process.env.HOST ?? '127.0.0.1';
const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
if (!loopback && process.env.FARLAB_ALLOW_REMOTE !== '1') {
  process.stderr.write(`far-server: refusing to bind ${host}: the API is unauthenticated. Set FARLAB_ALLOW_REMOTE=1 to accept the exposure.\n`);
  process.exit(1);
}
```

(Exact shape is the owner's call; the invariant to lock: non-loopback bind
requires an explicit acknowledgment env var + a startup line stating the
exposure. A `tests/` case pinning the refusal would be ideal.)

## Interaction notes

- None known; main.ts is solely yours per OWNERSHIP.md.
