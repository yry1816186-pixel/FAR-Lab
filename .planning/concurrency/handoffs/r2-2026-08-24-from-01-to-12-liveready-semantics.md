# Handoff 01 → 12: health `providers[].liveReady` is a persisted claim, not a live probe

- **From:** lane 01 (hx-web-product) — **To:** lane 12 (platform-data-api); cc lane 11 (model-plane)
- **Date:** 2026-08-24 · **Urgency:** P2 (truth-in-labeling) · **Status:** requested

## Observed evidence (lane-01 dogfood)

A lane-local server started with NO provider credentials in env (no
`secrets.env` loaded, `FARLAB_DATA_DIR` pointing at a snapshot copy) still
reports:

```json
{"providers":[{"name":"zai","kind":"live","liveReady":true}, ...]}
```

on BOTH a populated and an empty data dir. The flag matches the persisted
"zai route liveReady 2026-08-22 (post-reset)" workspace state, so it is a
stored claim, not a live reachability/credential probe.

## Why it matters

The web strip renders `研究引擎就绪 · 1/2 个模型可用` from this field. On a
machine without the key loaded the UI asserts availability that a first real
run would contradict — a truthfulness gap the researcher discovers late.

## Requested change (owner decides the semantics)

Either probe lazily with a short TTL and label the source, or expose the
distinction (`liveReady` vs `lastVerifiedAt` timestamp) so the UI can render
`上次验证 08-22` instead of an unconditional "可用". Do not fabricate a
real network probe on every /health call — the field name just needs to tell
the truth about what it measured and when.

## Lane-01 client behavior today

`web/src/hooks/useHealth.ts` renders the count as-is; if the payload grows a
`lastVerifiedAt`, lane 01 will surface it (follow-up on our side once the
field exists).
