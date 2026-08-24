# Multimodal Tooling Research — Decisions (2026-08-24)

All licenses below were read from the repos' own LICENSE files today (not blog claims —
the web was contradictory: two sources claimed MinerU is AGPL; the repo LICENSE.md
says Apache-2.0 + additional terms, © 2026).

## PDF/document parsing layer

| Tool | License (source-read) | Verdict for FAR-Lab |
|---|---|---|
| **Docling** (docling-project/docling, IBM) | MIT | Only clean-license heavy local parser. CPU-capable. NOT adopted now (multi-GB torch dep; our chosen lanes don't need it). **Future local-parsing sidecar candidate #1.** |
| **MinerU** (opendatalab/MinerU) | Apache-2.0 + additional terms: commercial license required at ≥100M MAU or ≥$20M monthly revenue; online services must prominently attribute MinerU; breach terminates license | Top OmniDocBench accuracy (team's own benchmark, CVPR 2025 — self-published, treat as upper bound). Attribution obligation conflicts with white-product branding. Not adopted. |
| **Marker** (datalal-to/marker, Endless Labs) | GPL-3.0-or-later | **REFUSED.** Copyleft; cannot ship/vend into a proprietary-track product. (texify same author, GPL-family — same verdict.) |
| **PyMuPDF** | AGPL-3.0 | **REFUSED** (D-019 already recorded this minefield). |
| **pdfjs-dist** | Apache-2.0 | Already in web/ deps. Our client-side PDF lane. |
| **GROBID** | Apache-2.0 | Consumed remotely via OpenAlex content API (already built, `src/sources/fulltext.ts`); no local JVM infra. |
| **Unstructured** | Apache-2.0 | Generic partitioner; no scientific semantics (fig/panel/equation) beyond ours. Not adopted. |

## Figures / tables / equations / VLM layer (design input only — T4 is BLOCKED-live)

- **pdffigures2** (AllenAI): Scala, figure+caption+region extraction from scholarly PDFs; its *output semantics* (figure regions, caption-text offsets, section titles, body-text regions) inform our FigureRecord contract. Not adopted (Scala/JVM, aging).
- **UniMERNet** (opendatalab, CVPR 2026): formula image→LaTeX, best published real-world MER. Candidate for T4 equation OCR. License not yet inspected (gate before any adoption).
- **WebPlotDigitizer** (automeris.io): the reference algorithm family for axis-calibrated plot digitization (2-point calibration → linear map → point extraction). Our T4 figure-values contract requires exactly this shape: VLM proposes, deterministic calibration+residual check verifies. VLM never emits unverifiable numbers alone.
- Multi-panel figure separation: deep-learning segmentation (bioimaging literature) — T4, BLOCKED-live.

## Benchmarks consulted (not re-run)

OmniDocBench (CVPR 2025, 1651 pages/10 doc types), Uni-Parser (arXiv 2512.15098),
Docling technical report (arXiv 2408.09869). Self-published benchmarks → directional only.

## What we RUN ourselves (this lane, offline-deterministic)

1. pdfjs-dist on real complex PDFs (repo carries `jss_metafor.pdf`; fixtures built for
   two-column / scanned-no-text-layer / mixed-language) — structural fidelity measured.
2. Our JATS/TEI/LaTeXML structure-recovery parsers on representative fixtures —
   figure/table/equation/citation recall + grounding measured against hand-checked truth.
3. Dataset profiler on real-shaped CSVs (missingness/units/significance columns).

## Decision

**Adopted architecture (no new runtime deps, zero supply-chain surface):**
- **Core (Node, zod-only):** deterministic structure recovery from the three network
  fulltext routes (EuropePMC JATS, OpenAlex GROBID TEI, arXiv LaTeXML HTML) — these
  arrive pre-parsed by GROBID/publishers/LaTeXML and are currently flattened; plus
  Markdown / LaTeX source / CSV-TSV dataset profiling / code & notebook indexing.
- **Web (client, existing Apache/MIT deps):** pdfjs structured extraction (coordinates →
  lines → columns → reading order → headings/captions/tables) emitting SDM payloads.
- **Scanned/image-only PDFs:** honest fail-closed `no_text_layer` → T4 (BLOCKED-live).
- **Reversal trigger for a Python sidecar:** if network routes + client pdfjs prove
  insufficient on real corpora (measured in this lane's benchmark), spike Docling (MIT)
  in an isolated uv-locked sidecar following the experiment-runtime precedent.

Sources: [MinerU LICENSE.md](https://github.com/opendatalab/MinerU/blob/master/LICENSE.md),
[Docling LICENSE](https://github.com/docling-project/docling/blob/master/LICENSE),
[Marker LICENSE](https://github.com/datalab-to/marker/blob/master/LICENSE),
[pdffigures2](https://github.com/allenai/pdffigures2),
[UniMERNet](https://github.com/opendatalab/unimernet),
[texify](https://github.com/VikParuchuri/texify),
[WebPlotDigitizer](https://automeris.io/),
[OmniDocBench](https://github.com/opendatalab/OmniDocBench),
[Docling tech report](https://arxiv.org/html/2408.09869v4).
