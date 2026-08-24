# Handoff r2-2026-08-24 — 05 → 04 — fulltext fetch now carries the SDM; persist it on the corpus document

- **From:** lane 05 multimodal-ingest
- **To:** lane 04 retrieval-evidence (owner of `src/pipeline/stages/evidence.ts`, `src/pipeline/types.ts`; `src/domain/source.ts` structure co-signed by 12)
- **Urgency:** normal (capability is live on the fetch boundary; nothing breaks until you land it — `sdm` is simply unused)
- **Status:** OPEN

## What changed on my side

`FullTextFetch` (src/sources/fulltext.ts) now carries `sdm: SdmDocument` on every
`fetched` result (network fulltext deepening, all three routes: arxiv_html →
LaTeXML SDM, europepmc_jats → JATS SDM, openalex_tei → GROBID TEI SDM). The
`text` field is byte-identical to before — corpus artifacts, receipts and the
excerpt path are unaffected. The SDM carries `origin { kind:'network', url }`,
license (JATS route), tables/figures/equations/citations with elementPath
provenance, and honest `diagnostics.parseStatus` (ok|partial|failed).

Evidence: `tests/sources-fulltext.test.ts` — "fulltext fetch SDM wiring"
(4 tests: per-route validity + the exact persistence contract below, run
through a real `openArtifactStore`, 160/160 lane suite green).

## Requested change (one block in the evidence deepening loop)

```ts
// src/pipeline/stages/evidence.ts — inside `if (res.status === 'fetched')`:
const put = await ctx.artifacts.put(res.fetch.text);
+ // 05 handoff 2026-08-24: persist the structured understanding next to the
+ // text artifact; failed parses are not worth an artifact (SDM carries the
+ // failure state only for fetched docs).
+ let fullTextSdmRef: string | undefined;
+ if (res.fetch.sdm.diagnostics.parseStatus !== 'failed') {
+   fullTextSdmRef = await persistSdm(ctx.artifacts, res.fetch.sdm);
+ }
const updated: SourceDocument = {
  ...doc,
  contentDepth: 'full_text',
  fullTextRef: put.ref,
+  ...(fullTextSdmRef !== undefined ? { fullTextSdmRef } : {}),
  ...(res.fetch.license !== undefined ? { license: res.fetch.license } : {}),
};
```

Plus the structural field (12 stewardship — note it in your integration report):
`src/domain/source.ts` → `fullTextSdmRef?: string` (artifact-store ref,
fetchable via `GET /api/v1/ingest/:ref`).

Import: `import { persistSdm } from '../../ingest/service.js';`

## Why this matters

Until now the regex text route DROPPED all tables (numeric mash) and figures
from deepened fulltext. With this one-block change, every deepened corpus
document keeps its typed table grids/figure captions/equation LaTeX — the
evidence-corpus rendering (lane 01) and claim-grounding consumers can cite
`fullTextSdmRef` instead of re-parsing.

## Consumer contract to rely on

- `res.fetch.sdm` is ALWAYS present on `fetched` (never undefined).
- Persist only when `parseStatus !== 'failed'` (failed SDMs stay unpersisted;
  the fetch itself still succeeded — text artifact unaffected).
- Determinism: identical payload → byte-identical SDM → stable sha256 ref.
