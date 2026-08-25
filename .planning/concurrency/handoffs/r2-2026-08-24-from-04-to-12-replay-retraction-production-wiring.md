# Handoff 04 → 12: production wiring for the response cache, replay mode, and Retraction Watch table

- **Date**: 2026-08-24
- **From**: lane 04 (retrieval-evidence)
- **To**: lane 12 (platform-data-api — `src/app/composition.ts` / server wiring)
- **Urgency**: medium (engines are complete + tested; without this they stay test-only)

## Background (with a finding you should know regardless)

`rg 'responseCache' src/` shows `ctx.responseCache` is CONSUMED by the retrieve
stage and typed in `src/pipeline/types.ts`, but NO production code constructs
`openResponseCacheStore(...)` — composition never wires it. That means the
entire RU-10 read-through response cache (planned searches, and as of lane 04's
R2 commits also citation-chase ops) is currently ACTIVE ONLY in tests. Whoever
owns composition should wire it once and get the caching/QoS behavior in
production:

```ts
import { openResponseCacheStore, withRetractions } from '../sources/response-cache.js';
import { parseRetractionWatchCsv } from '../sources/retraction-watch.js';
import { readFileSync } from 'node:fs';

const db = /* the run-data sqlite handle or a dedicated cache db file */;
const base = openResponseCacheStore(db);
const cache = process.env.FARLAB_RETRACTION_WATCH_CSV
  ? withRetractions(base, parseRetractionWatchCsv(readFileSync(process.env.FARLAB_RETRACTION_WATCH_CSV, 'utf8')))
  : base;
// pass `cache` as ctx.responseCache when building stage contexts
```

## Requested changes (all in your files; engines are lane-04-owned and landed)

1. **Wire `ctx.responseCache`** in stage-context construction (see above).
   Runtime failure semantics are fail-visible and tested offline; the cache is
   additive (absent = exact legacy behavior).
2. **Replay mode knob** (optional, cheap): when `FARLAB_RETRIEVAL_REPLAY=1`
   (or an API/CLI flag if you prefer), construct
   `openResponseCacheStore(db, 'replay')` instead. Replay semantics (already
   implemented + tested in lane 04, commit 60cddca): planned-search cache miss
   = explicit run failure (`retrieve/replay: ... exact replay refused`);
   chase miss = visible degradation recorded in `fusion.citationChase.failure`;
   every served retrieval is receipted `cache=replay`. The LLM plan/rerank
   calls are NOT part of the replay guarantee (source-layer replay only —
   documented).
3. **Retraction Watch CSV path** (optional): `FARLAB_RETRACTION_WATCH_CSV`
   env → parse once at composition, attach via `withRetractions` (above).
   Dataset: gitlab.com/crossref/retraction-watch-data (`retraction_watch.csv`,
   updated each working day); the fetch itself is BLOCKED-live per the
   2026-08-23 no-live-API rule — a manual download placed at the configured
   path is the offline-legal integration. Parser is README-pinned and
   fixture-tested; a format change throws an honest error naming the missing
   column.

## Files

- Yours: `src/app/composition.ts` (or wherever stage contexts are built)
- Mine (already landed, no action needed): `src/sources/response-cache.ts`,
  `src/sources/retraction-watch.ts`, `src/sources/retraction.ts`,
  `src/pipeline/stages/retrieve.ts`, `src/pipeline/stages/evidence.ts`

## Status

Engine IMPLEMENTED + tested (lane 04, R2 commits 60cddca & 71e7821-series);
production wiring REQUESTED.
