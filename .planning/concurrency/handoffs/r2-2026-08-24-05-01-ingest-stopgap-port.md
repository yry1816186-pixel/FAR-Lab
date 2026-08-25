# Handoff r2-2026-08-24 — 05 → 01 — server ingest boundary is authoritative; port web/src/utils/ingest.ts to API calls

- **From:** lane 05 multimodal-ingest
- **To:** lane 01 hx-web-product (owner of `web/src/utils/**`)
- **Urgency:** normal
- **Status:** OPEN

## What the server boundary now covers (all deterministic, all tested)

`POST /api/v1/ingest` — three producer kinds:

| kind | body | covers |
|---|---|---|
| `text` | `{ fileName, text }` | .md .tex .csv .tsv .ipynb .py/.ts/.js/.tsx/.jsx .xml (JATS/TEI sniffed) |
| `bytes` | `{ fileName, base64 }` | .xlsx/.xlsm supplements (zip+SheetML parsed server-side, zero web deps) |
| `pdf_text` | `{ fileName, payload }` | pdfjs collector output (`web/src/utils/pdfCollect.ts`, lane-05-owned) |

`GET /api/v1/ingest/:ref` — fetch the full stored SDM (`kind:'sdm'`) or dataset
profile (`kind:'dataset_profile'`) by the sha256 ref returned from POST.
404 for any other artifact ref; 400 for malformed refs.

Responses: SDM summary + `artifactRef` + `seedTextTruncated` (sdm) or typed
column profile (dataset_profile). Full detail via GET-by-ref.

## Requested port (your file, your call on internals)

`web/src/utils/ingest.ts` currently parses PDFs (pdfjs), office formats
(mammoth/SheetJS/jszip) and text client-side. Per OWNERSHIP the server boundary
is authoritative; the client copy should shrink to:

1. PDF → `collectPdfText(file)` (pdfCollect.ts) → POST `pdf_text`. (Already
   the better path — the server understands geometry; the stopgap only
   extracted flat text.)
2. Text-family files → `file.text()` → POST `text`.
3. .xlsx/.xlsm → `FileReader`/`file.arrayBuffer()` → base64 → POST `bytes`.
4. Render from the POST response summary + GET-by-ref for full SDM detail —
   no client-side SDM caching.
5. Keep: paste-kind detection + doi/bibtex/ris citation parsing — that is the
   seeds surface, not the artifact-understanding surface (not lane 05's scope).
6. mammoth (docx) / pptx / odt parsing: NO server route exists yet — either
   keep those client-only with an explicit "client-side parse, no SDM" label,
   or drop them until a server route lands. Do not silently pretend parity.

## Evidence

- `tests/ingest-api.test.ts` — POST/GET round-trips for all three kinds,
  honest refusals (400 with reasons), real sample.xlsx E2E.
- CLI parity: `far ingest <file>` covers the same matrix (usage string updated).

Contract details for renderers: `.planning/handoffs/MULTIMODAL.md` (updated
same day with the GET-by-ref + bytes/xlsx additions).
