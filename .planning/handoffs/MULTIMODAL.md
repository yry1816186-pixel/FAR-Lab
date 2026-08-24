# MULTIMODAL — Scientific Artifact Understanding Backend (handoff to HCI)

Lane owner: MULTIMODAL (`work/multimodal-science/`). Landed 2026-08-24;
**extended same day**: fetch-by-ref GET, bytes/xlsx supplements, network
fulltext→SDM wiring, mixed-language fidelity fixes.
Status: deterministic tiers (T2 structure + T3 dataset/panels/symbols) IMPLEMENTED and
tested; VLM tier (T4) contract reserved, BLOCKED-live per the 2026-08-23 directive.

## TLDR for HCI

A file upload no longer means "50k chars of flat text". The backend now produces a
**Structured Document Model (SDM-1)** — typed blocks, figures with captions and panels,
tables with real cell grids and merged cells, equations with LaTeX/MathML and symbol
indexes, citations with DOIs and in-text backlinks, cross-modal references, dataset
profiles with types/missingness/units/significance — every element carrying provenance
(page+bbox for PDFs, elementPath for network routes) and every degradation honestly
flagged. **HCI renders from the SDM; nothing else is authoritative.**

## The stable contract (rely on these; breaking changes require version bump `sdm-2`)

**Schema**: `src/ingest/sdm.ts` (zod = single source of truth; HCI may import types).
Dataset profiles: `src/ingest/dataset.ts` (`dsdp-1`).

1. **Entry points**
   - `POST /api/v1/ingest` — `{ kind:'pdf_text', fileName, payload }` (web collector
     output), `{ kind:'text', fileName, text }`, or `{ kind:'bytes', fileName, base64 }`
     (xlsx/xlsm supplements) → `{ type, artifactRef, sdm|profile }`.
     Errors: HTTP 400 with precise field messages.
   - `GET /api/v1/ingest/:ref` — fetch the FULL stored SDM (`{kind:'sdm', sdm}`) or
     dataset profile (`{kind:'dataset_profile', profile}`) by sha256 ref. Render from
     the store; 404 for non-ingest refs, 400 for malformed refs.
   - `far ingest <file>` (CLI) — text-family + xlsx bytes; refuses PDF with the reason.
   - Library: `src/ingest/index.ts` (all parsers + `ingestSdm`, `ingestTextToSdm`,
     `ingestBytesToProfile`, `loadSdmByRef`, `loadDatasetProfileByRef`).
2. **ID discipline**: `blk_*`, `fig_*`, `tab_*`, `eq_*`, `cit_*` — kind prefix guaranteed.
3. **Provenance rule**: `page/bbox` (pdfjs), `elementPath` (XML routes), `charStart/End`
   (text formats). Absent field = "this route cannot know it" — never render a guess.
4. **Honesty fields to render**:
   - `diagnostics.parseStatus ∈ {ok, partial, failed}` + `warnings[]` (show them).
   - `figure.perception.status === 'not_extracted'` → render "figure pixels not yet
     understood (T4)" — the schema makes inventing impossible.
   - `xref.status === 'unresolved'` → keep visible (negative evidence).
   - Table `grid: []` → "table exists (caption), cells not recovered".
   - `seedTextTruncated` → truncation badge on the text projection.
5. **Determinism**: identical input → byte-identical SDM (test-enforced). Safe to cache,
   diff, and use as revision-chain evidence.
6. **Compat seam**: `projectSeedText(sdm)` → the existing ≤50k seed text, so the current
   seeds pipeline keeps working unchanged while UIs migrate to the structured payload.

## What each upload kind gets (today)

| Kind | Route | Structure |
|---|---|---|
| PDF (web client collects text layer; `web/src/utils/pdfCollect.ts`) | `pdf-text-layer-v1` | blocks+pages+bbox, headings, captions→figures(+panels, region anchor), aligned-row table grids, xrefs; equations/citations honestly absent |
| .md | `markdown-structure-v1` | headings/GFM tables/$$math/images→figures/code blocks/lists |
| .tex | `latex-source-v1` | sections/figures/tabular grids/equations verbatim LaTeX/\cite↔\bibitem |
| .csv/.tsv | `dsdp-1` | types, missingness, units, significance flags, dupes, levels |
| .xlsx/.xlsm | `dsdp-1` (`format:'xlsx'`, no delimiter) | first sheet profiled (others named in warnings), shared/rich/inline strings, bool/error cells preserved as literals, cell gaps, 200k row cap |
| .ipynb | `notebook-json-v1` | cells with execution provenance, stored errors as footnotes |
| .py/.ts/.js | `code-scan-v1` | heuristic symbol index + imports (labeled non-AST) |
| .xml | JATS or TEI sniffed | full structure incl. equations+citations |
| images, scans, docx/pptx, other | **refused honestly** | reason strings, no fake |

Network fulltext routes (`src/sources/fulltext.ts`) now produce an SDM for
every fetched document — `FullTextFetch.sdm` (arxiv_html→LaTeXML,
europepmc_jats→JATS, openalex_tei→GROBID TEI), `origin {kind:'network', url}`,
license carried, legacy `text` byte-identical. Persistence on the corpus
document is lane 04's one-block change: handoff
`.planning/concurrency/handoffs/r2-2026-08-24-05-04-fulltext-sdm-persistence.md`.

Mixed-language fidelity (2026-08-24 fixes, all test-locked): figure/table
labels keep their PRINTED prefix ("图 3" is no longer normalized to "Figure 3"),
panel markers accept full-width CJK punctuation boundaries (。，、；), and
图/表/式 cross-references actually match mid-sentence in CJK text (the old `\b`
boundary never holds adjacent to CJK). Forward references in pdf-text
(mention before caption) get a second resolution pass against the final record
pools.

## HCI integration surface (next)

1. Upload flow: on file pick → `collectPdfText(file)` (PDFs), `file.text()`
   (text kinds), or base64 (xlsx) → POST `/api/v1/ingest` → render from the
   summary; GET `/api/v1/ingest/:artifactRef` for full SDM detail.
   Port record: `.planning/concurrency/handoffs/r2-2026-08-24-05-01-ingest-stopgap-port.md`.
2. Evidence corpus: render figure cards (caption+panels+"not understood" chip), table
   grids, equation LaTeX (KaTeX already in web deps), citation lists with citedFrom.
3. Dataset uploads: render the profile (typed columns, missingness bars, unit chips,
   significance flags) as the dataset's workspace entry — not "file uploaded".

## Reserved T4 (BLOCKED-live): figure perception

`SdmFigurePerception` (axes with units/scale/range, series with pointsRef,
`verifiedBy: 'deterministic-calibration' | 'vlm_proposed_plus_verified'`) is the ONLY
sanctioned shape for numeric figure claims. Rule: VLM proposes, deterministic
calibration (WebPlotDigitizer-style 2-point mapping) verifies; `unverified_vlm_only`
must be treated as non-evidence by every consumer.

## Reproduction

- Tests: `tests/ingest-*.test.ts` (xml, jats, tei, latexml, md-latex, pdftext, dataset,
  code-nb, service, api, pdf-e2e) — all green this session; real-material E2E included.
- Reports: `work/multimodal-science/{AUDIT-BASELINE,RESEARCH-TOOLING,BENCHMARK}.md`.
- Decisions: license table + adopted architecture in RESEARCH-TOOLING.md (Docling=MIT
  future sidecar candidate; Marker GPL / PyMuPDF AGPL refused; MinerU Apache+terms).
