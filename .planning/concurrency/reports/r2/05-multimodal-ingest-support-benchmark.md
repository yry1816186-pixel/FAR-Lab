# Multimodal Benchmark — Real Complex Materials (2026-08-24)

All numbers below are from actual runs on this machine (commands + outputs cited);
no estimated values. Offline-deterministic per the 2026-08-23 no-live-API directive.

## 1. Real paper, full chain — `jss_metafor.pdf` (Viechtbauer 2010, JSS 36(3), 48 pp)

Pipeline: pdfjs text-layer collection (web collector, Node legacy build)
→ zod `PdfTextPayload` validation → deterministic understanding (`pdf-text-layer-v1`)
→ SDM-1 contract validation → seed-text projection.

Run: `tests/ingest-pdf-e2e.test.ts` (+ benchmark dump), all green.

| Metric | Value |
|---|---|
| Pages collected / total | 48 / 48 (no truncation) |
| Text items collected | 5,454 |
| parseStatus | ok |
| SDM passes its own zod contract | yes |
| Blocks | 338 = 14 headings + 311 paragraphs + 13 captions |
| Figures (label+caption+panels+region anchor) | 11 |
| Tables (caption records) | 8 — of which 6 also got a reconstructed cell grid from aligned text rows (pp. 21/25/27/29/33/48) |
| Equations | **0 — honestly refused** (text-layer glyph soup; warning emitted: requires OCR/VLM = T4) |
| Citations | **0 — honestly not claimed** (reference-list structure needs GROBID/JATS routes; printed "[n]" markers preserved in text) |
| Cross-modal refs | 32 found, 22 resolved to figure/table records (69%); 10 unresolved kept as negative evidence |
| Seed projection | 50,000 chars (cap hit, `truncated: true` — honest) |
| Page provenance on every block | yes (`provenance.page` + bbox) |

Reading-order honesty: JSS is single-column; the two-column detector correctly did NOT
fire (no false corridor). Column re-flow behavior is covered by the synthetic two-column
fixture test (`tests/ingest-pdftext.test.ts`).

## 2. Failure-path honesty (tested, not asserted)

| Case | Behavior | Evidence |
|---|---|---|
| Scanned / no-text-layer PDF (valid minimal PDF with no text objects, constructed byte-exact in test) | collector returns empty items; understanding fails `failed` with `no_text_layer` message; zero fabricated blocks | `tests/ingest-pdf-e2e.test.ts` |
| PDF via CLI (core cannot collect text layer — pdfjs-dist is a web dep, zod-only invariant) | exit 2 with the exact reason + the working alternatives | live run: `node dist/cli/main.js ingest jss_metafor.pdf` → refusal, EXIT 2 |
| Unsupported kind (`.rs`, `.txt`) | exit 2 listing the supported matrix | live run: `far ingest tests/fixtures/sample.txt` → refusal, EXIT 2 |
| Malformed XML (JATS/TEI/LaTeXML) | `parseStatus: 'failed'` with the parser's precise offset message, empty document | `tests/ingest-{jats,tei,latexml}.test.ts` |
| Header-only TEI / frontmatter-only JATS | `partial`, metadata recovered, no invented body | same files |
| Notebook with stored error outputs | errors preserved as footnote blocks + warning (research truth, not noise) | `tests/ingest-code-nb.test.ts` |
| Image outputs in notebooks | counted + referenced by cell/output index; pixels never inlined (T4) | same |
| Figure perception (axis/series/values) | `perception.status = 'not_extracted'` on every record — the T4 reservation is schema-enforced, nothing invented | all fixtures |

## 3. Network-route structure recovery (fixtures modeled on the exact producer schemas)

EuropePMC JATS / OpenAlex GROBID TEI / arXiv LaTeXML XHTML fixtures (offline, shaped
from the real formats the production routes fetch — no live calls):

| Capability | JATS | GROBID TEI | LaTeXML HTML |
|---|---|---|---|
| Frontmatter (title/authors/year/DOI) | ✓ | ✓ | ✓ (title + meta authors) |
| Section hierarchy w/ parent linkage | ✓ | ✓ | ✓ |
| Figures: label/caption/**panels**/graphicRef | ✓ | ✓ (+ coords→region when GROBID emits them) | ✓ |
| Tables: header rows / **merged cells** / footnotes | ✓ (thead + colspan) | ✓ (role=label + cols/rows + note) | ✓ (thead) |
| Equations: LaTeX / MathML + symbol index + context | ✓ tex-math | ✓ MathML verbatim | ✓ alttext LaTeX (highest fidelity) |
| Citations: DOI/year/authors + **citedFrom backlink** | ✓ | ✓ | ✓ |
| Forward reference resolution (xref before target) | ✓ two-pass | ✓ two-pass | ✓ pre-registered anchors |
| Unresolved refs preserved | ✓ | ✓ | ✓ |

## 4. Dataset profiling on realistic CSV

Quoted fields with embedded commas/newlines (RFC4180), significance notation
(`0.42***`), missing tokens, duplicate rows, unit hints, zh headers — all covered in
`tests/ingest-dataset.test.ts` (16 tests). Live CLI evidence:
`far ingest cohort.csv` → `3 rows × 5 cols`, typed columns
(`study(string) year(integer) effect (g)(float, miss 1) n(integer) group(string)`),
artifact `sha256:33c27c…`.

## 5. Coverage honesty (what this lane does NOT claim)

- **Equations from PDFs**: needs OCR/VLM (T4, BLOCKED-live per directive). Network
  routes DO carry them (LaTeXML alttext ≈ verbatim LaTeX).
- **Citation list structure from PDFs**: needs reference parsing (GROBID route has it).
- **Figure pixel understanding** (axes/legends/series/values/uncertainty): T4 contract
  reserved (`SdmFigurePerception`), requires deterministic calibration + VLM proposal
  with verification stamps; VLM alone may never emit numeric conclusions.
- **Scanned PDFs**: fail visibly `no_text_layer`. OCR tier not built (no clean-license
  offline OCR adopted yet; see RESEARCH-TOOLING.md).
- Mixed-language fixture: zh language detection covered in JATS + dataset tests; a full
  mixed-language PDF E2E is NOT yet run (fixture gap, listed in handoff next steps).
- Supplement/large-spreadsheet stress: row cap 200k with honest truncation flag; not
  benchmarked at scale this session.
