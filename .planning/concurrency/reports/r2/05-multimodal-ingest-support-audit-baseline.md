# Multimodal Science Understanding — Audit Baseline (2026-08-24)

Owner lane: MULTIMODAL (this directory). Sibling lanes active on: `src/cli/main.ts`,
`src/persistence/store.ts`, `src/server/api.ts`, `tests/time-travel.test.ts` (RU-12 time-travel,
pure additions). Integration into shared files must be additive-only via pathspec commits.

## Verdict (TLDR)

**A file uploading successfully ≠ the system understanding it.** Today every ingest path
terminates in a ≤50,000-char plain-text projection. Structure recovery, page coordinates,
table structure, figure/panel/axis/legend, equations, caption linkage, cross-modal
references, dataset profiling: **absent across the board**. The one honest bright spot:
images/scans are explicitly refused rather than fake-parsed (`web/src/utils/ingest.ts:212`).

## Current capability, format by format (all evidence read from tree)

| Format | Parse path today | What survives | What is LOST |
|---|---|---|---|
| PDF (upload) | pdfjs-dist `getTextContent()` items joined by `' '` — `web/src/utils/ingest.ts:176-195`, first 40 pages | flattened text ≤50k chars | reading order (two-column scrambled), page coords, sections, tables, figures, equations, fonts |
| DOCX | mammoth `extractRawText` — `ingest.ts:296` | body prose | headings→structure, tables, embedded figures, comments |
| XLSX/XLS/CSV/TSV/ODS | SheetJS `sheet_to_csv` with `\|` FS, 500 rows/sheet — `ingest.ts:311-332` | cell strings as TSV-ish text | schema/types/units, merged cells, multi-level headers, missingness, significance notation, >500 rows (silent truncation flagged only by `truncated`) |
| PPTX | jszip + `<a:t>` text runs per slide — `ingest.ts:338` | slide text runs | layout, figures, speaker notes, tables |
| EPUB | zip html parts → textContent — `ingest.ts:404` | chapter text | spine order (uses zip order!), structure |
| HTML upload | DOMParser body textContent — `ingest.ts:386` | visible text | headings, tables, figures |
| JSON upload | re-pretty-print — `ingest.ts:395` | raw JSON text | schema understanding |
| MD/TXT | read as text, 1MB cap | raw text | headings/tables/math structure never recovered downstream |
| BibTeX/RIS | citation-js → CSL-JSON (title/year/authors/doi/keywords) — `ingest.ts:113` | citation metadata | (fine — this is the one genuinely structured path) |
| LaTeX (.tex) | **NOT ACCEPTED** (`EXT_KINDS` has no `.tex`) | — | — |
| XML (file) | **NOT ACCEPTED** as upload kind | — | — |
| Images / scans / microscopy | **deliberately refused** (`ingest.ts:210-214`) | — | honest, but no capability |
| Code / .ipynb / logs | **NOT ACCEPTED** | — | — |
| Dataset (as dataset) | flattened into seed text | — | no schema/type/missingness/units/provenance |

## Server/persistence receive path

- `POST /runs seeds[]` — `src/server/api.ts:463-500`: accepts `{title, identifiers[doi|arxiv|url], text≤50k, year, authors}`; stored as `user_provided` SourceDocument (`src/domain/source.ts:25-29`).
- `SourceDocument.contentDepth ∈ {metadata_only, abstract, full_text, data}` (`src/domain/source.ts:8`) + `fullTextRef` → content-addressed artifact store (`src/persistence/artifacts.ts`, sha256, immutable, collision-refused). **The persistence substrate for structured artifacts already exists and is sound.**

## Network fulltext routes (the hidden structure goldmine being flattened)

`src/sources/fulltext.ts` deepens corpus docs via three keyless/clean routes and then
**strips all structure** via `stripMarkup` (`src/sources/text.ts:36`):

1. **arXiv LaTeXML HTML** (`arxiv.org/html/{id}`) — carries `ltx_section`, `ltx_figure`, `ltx_table`, `ltx_Math` (MathML), `ltx_bibliography`.
2. **EuropePMC JATS XML** — full JATS: `<sec>`, `<fig>` with `<caption>`/`<graphic>`, `<table-wrap>`, `<disp-formula>`, `<xref>` cross-refs, `<ref-list>` with DOIs.
3. **OpenAlex GROBID TEI XML** — TEI: `<div>`, `<figure>` with `<figDesc>`, `<table>`, `<formula>` (MathML), `<listBibl>`/`<biblStruct>` with resolved DOIs.

All three arrive **already structure-annotated by best-in-class scientific parsers**
(LaTeXML, publisher JATS, GROBID). Recovering figures/tables/equations/citations from them
is a zero-network-cost, zero-new-dependency, deterministic XML/HTML parse in core.

## Hard constraints for this lane

1. **zod-only core** (`DEPENDENCY_POLICY.md`): no new runtime deps in Node product. Heavy parsers live in `web/` (client, already has pdfjs-dist/mammoth/SheetJS/jszip) or isolated sidecars (experiment-runtime precedent: Python + uv lockfile-pinned).
2. **No live API testing** (2026-08-23 directive): VLM perception paths → design + contract + offline-deterministic parts only; anything needing a live model call is BLOCKED-live.
3. **No DeepSeek**. No ZCode quota for testing (already exhausted this week anyway).
4. Shared files mid-flight by sibling: additive-only integration.
5. `D-019`: local raw-PDF parsing in core rejected once (AGPL minefield). Apache-2.0 pdfjs stays in web/ client-side. GROBID output is consumed via OpenAlex content API (already built).

## Capability tier model (design target)

- **T0 reject-honest**: formats we cannot parse → explicit refusal with reason (never fake).
- **T1 text**: today's flattening (all formats above).
- **T2 structure**: sections/blocks + provenance (page/char offsets) + captions + citation refs + tables as cell grids + equations (source form retained: LaTeX from LaTeXML alttext / TEI; MathML preserved) + figure records with caption/linkage (no pixel understanding).
- **T3 semantic**: dataset profiling (types/missingness/units/distribution), figure→panel/axis/legend via deterministic image processing, equation symbol tables.
- **T4 VLM-assisted perception** (BLOCKED-live): pixel-level figure understanding — VLM proposes, deterministic layer verifies; VLM never independently emits unverifiable numeric conclusions.

Gap summary: the product today is entirely T1 (plus citation metadata). This lane builds T2/T3
deterministically in core + web, defines the contract for T4, and refuses T0 honestly.
