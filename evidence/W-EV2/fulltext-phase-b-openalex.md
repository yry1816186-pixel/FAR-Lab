# Fulltext Phase B — OpenAlex Content API GROBID TEI (W-EV2/Wave-3 #4b)

**Date:** 2026-08-22 · **Decision:** D-028 · **Code:** `src/sources/fulltext.ts` (route `openalex_tei_v1`) · **Tests:** tests/sources-fulltext.test.ts (7 new; suite 255/255)

## Capability facts (official docs + live probes, 2026-08-22)

- OpenAlex content archive: **full-text PDFs + GROBID-parsed TEI XML** for ~60M OA works (source: [help.openalex.org/access/fulltext](https://help.openalex.org/access/fulltext/), [pricing blog](https://blog.openalex.org/openalex-api-new-features-and-usage-based-pricing/)).
- Per-work download: `https://content.openalex.org/works/{W-id}.grobid-xml?api_key=KEY` (or `.pdf`). **API key mandatory**: live probe keyless → HTTP 401 verbatim `{"error":"API key required","message":"Content downloads require an API key. Get one free at https://openalex.org/users"}`.
- Pricing: $0.01/file; free key ($1/day) ≈ 100 files/day — comfortably above FAR-Lab's ≤3 docs/run deepening cap.
- Discovery is FREE and keyless: work objects expose `content_urls.{pdf,grobid_xml}` + `has_content.{pdf,grobid_xml}` (live probe HTTP 200 on a Nature OA work).
- TEI caveats per docs: GROBID errors passed through unchanged; no OCR (scanned PDFs yield little).

## Merged GROBID decision

**Local GROBID Docker sidecar: REJECTED (superseded).** OpenAlex already runs GROBID server-side and sells the output per file at negligible cost within the free tier. A local sidecar would duplicate that with JVM+Docker maintenance against the minimal-architecture bar. Registry §B updated with a re-open trigger (material pricing/access change).

## Implementation

- Routing (`fullTextRoute`): third priority after arXiv LaTeXML and EuropePMC JATS — keyed channels with richer render stay first; `openalex` W-ids route to the content endpoint deterministically.
- `fetchOpenAlexTeiFullText`: **no key → honest `not_available`** (reason names OPENALEX_API_KEY; zero network calls, zero cost — keyless docs simply stay abstract-depth); 401/403 → not_available (key rejected); 404 → not_available (no content); non-TEI 200 → not_available; 5xx → visible error.
- `extractTeiBodyText`: TEI contract marker, body extraction, teiHeader/figure/listBibl dropped, same paragraph-preserving collapse as phase A.
- Deepening flow (`build_evidence`) is variant-generic (receipts carry `family: variant`), so phase-B docs flow through the same artifact/receipt/excerpt path with no stage changes.

## Verification state (honest)

- Unit: 7 new tests (routing incl. priority, TEI extraction incl. header/bib drops, no-key zero-network, keyed 200, 401/404 vs 5xx classification). Suite 255/255, tsc clean, lint clean.
- Live: metadata-side probes verified keyless (content_urls/has_content 200; download 401 shape). **Full TEI fetch is credential-gated**: needs a user-provided `OPENALEX_API_KEY` (free at openalex.org/users); unlike B-QWEN this is an OPTIONAL capability, not a submission gate — phase A already covers arXiv+PMC keyless. Once a key is present, one research run deepens DOI-only OA docs and the receipt/artifact trail verifies end-to-end.
