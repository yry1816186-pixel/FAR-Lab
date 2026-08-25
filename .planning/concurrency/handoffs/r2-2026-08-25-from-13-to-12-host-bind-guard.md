# Handoff: refuse silent non-loopback bind (F-3) — 13 → 12

- **From:** lane 13 (reliability-security) · **To:** lane 12 (platform-data-api)
- **Urgency:** low (requires explicit user env action to trigger)
- **Status:** OPEN — code-read finding, `src/server/main.ts:23`

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
