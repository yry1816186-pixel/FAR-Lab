# RU-5 QUANT — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research. Status: SOURCE_VERIFIED (registry/API level for
all candidates; docling in-run status verified from repo evidence).

## Problem
Quantitative-evidence pipeline: A2.6 document structured parsing consumed
in-run · A3.7 tables/figures→numbers into claims · A3.9 reproducibility-risk
prefilter · A7.2 boundary-only forensics feeding (primary home RU-6) ·
D1.3 symbolic regression → hypothesis generation · D9.1 interpretability →
mechanistic revision input.

## Search vocabulary run
`GROBID table extraction quality`, `docling tableformer benchmark`,
`camelot pdf table lattice stream`, `pdfplumber tables`,
`WebPlotDigitizer chart data extraction`, `chart-to-table vision model 2026`,
`numeric claim extraction LLM scientific text`, `quantity extraction SciQAL`,
`DARPA SCORE replicability prediction`, `paper reproducibility risk predictor`,
`PySR symbolic regression Apache`, `pyoperon Operon BSD symbolic regression`,
`gplearn genetic programming`, `Feyn symbolc regression`,
`SHAP sklearn integration MIT`, `feature attribution research agent loop`

## Candidate table (SR=read, SC=probed)
| Candidate | Org | License | Maturity | Solves | Family | Tag |
|---|---|---|---|---|---|---|
| docling-mcp | IBM | MIT | live-installed in project (uv tool; CLI cross-check verified evidence/oss-integration) | PDF→structured MD + tables + figure images | parsing pipeline | FACT(in-repo, NOT consumed in-run: src/ zero refs) |
| GROBID-class TEI tables | OpenAlex content API serves server-side | API commercial-free tier ($0.01/file, key ~100/day) | production | structured tables for paywalled-ish corpus without local JVM | server-side parsing | SR(prior D-028) |
| Camelot/camelot-py | community | MIT | stable but stale-ish; needs ghostscript+opencv system deps | lattice/stream table extraction to DataFrames | pdf-table specialist | SC |
| pdfplumber | jsvine | MIT | active standard | text+table geometry extraction pure-python | pdf-table generalist | SC |
| WebPlotDigitizer | Ankush Anand | GPL-3 | mature desktop/web tool | chart-image→numeric points (manual-assist) | figure→data | PR(license = no bundling; method reference) |
| chart-vision models (2025-26 multimodal judges) | various | API | emerging | figure→data-table via VLM prompt | vision extraction | CLAIMED accuracy until locally benched |
| PySR (astroautomata/PySR) | Miles Cranmer | Apache-2.0 | very active (pushed 2026-08-22, 3.7k stars); Julia backend auto-install | high-quality symbolic regression → closed-form expressions | SR best-in-class | SC(API redirect resolved) |
| pyoperon (Operon C++) | heal-research | BSD-3 implied (license field empty on PyPI — repo check needed at adoption) | active | GP-based symbolic regression, fast native wheel | SR alternative (no Julia dep) | SC |
| gplearn | trevorstephens | BSD | mature/stable but slow lineage | simple GP regression | SR baseline | SC |
| SHAP | shap/shap (Lundberg) | MIT | production-stable; wheels incl cp314 | TreeSHAP exact attributions for sklearn tree ensembles | interpretability | SC(wheel matrix read) |
| DARPA SCORE outputs | DARPA + performers | program outputs varied | program winding down | replicability-prediction features/models | risk prefilter | PR(no deployable open model verified this wave) |

## Source-level findings
1. **The gap is INTEGRATION, not tools**: docling-mcp is installed and
   independently verified (live-verification-2026-08-23.md: stdio transport,
   conversion mode, CLI cross-check with embedded figures/tables), yet zero
   src/ references. A2.6's PARTIAL→STRONG move is a pipeline change:
   retrieve-stage deepening slot already exists (OpenAlex TEI route pattern);
   add `parse_document` sidecar op reusing the SAME docling install via its
   MCP stdio contract or direct `docling convert` subprocess (no new deps —
   uv-managed tool already present).
2. **Table→claims flow**: parsed tables become `quantitative_extract`
   objects {table_id, row_label, column_label, value, unit?, page, provenance}
   attached to source; claims stage may cite cell coordinates; falsify stage
   can compare predicted-vs-reported effect sizes when both parse. Numbers
   enter the EXISTING zod claim payload as typed fields (not free text) so
   stats forensics (RU-6 GO4) can run on verbatim reported statistics.
3. **Symbolic regression ruling**: PySR is the quality leader and Apache-2.0,
   but Julia runtime = heavy sidecar addition; Operon via pyoperon gives
   competitive SR with prebuilt wheels and BSD family license (confirm SPDX
   from repo before lockfile). Decision: DEFER both behind a real workload
   trigger (≥3 runs whose experiment data would feed formula discovery);
   when triggered, prefer pyoperon first (lighter), PySR if quality ceiling
   demands. gplearn REJECT (quality floor).
4. **Interpretability-as-revision-input (D9.1)**: SHAP is MIT with cp311-cp314
   wheels matching our sidecar pin path; TreeExplainer covers our sklearn
   whitelist templates exactly (tree ensembles). Integration shape: execute-
   stage post-training op emits `attribution_report` artifact (top-k global +
   per-instance top contributors, serialized deterministically); revise stage
   consumes it as STRUCTURED input ("mechanism hint" cards) alongside feedback
   signals — never as autonomous mechanism truth (scores are decision aids).
5. **Reproducibility-risk prefilter (A3.9)**: no deployable open model found;
   honest state = DESIGN note. Deterministic proxy available NOW without ML:
   score claims on observable features (single-study vs meta, N below power
   floor, p-value granularity anomalies via RU-6 GRIM, retraction status via
   RU-6 gate). Reopen trigger: SCORE-class open model appears or frontier
   radar finds validated predictor.
6. **Figure→data**: WebPlotDigitizer GPL = method-reference only (never
   bundle); VLM-based chart reading is CLAIMED-quality and costs tokens —
   DEFER behind workload evidence that figures carry decision-changing
   numbers in our target corpora.

## Verdicts (main-Agent, closed vocab)
- docling-mcp in-run consumption: **BUILD** (retrieve-stage deepening op +
  quantitative_extract schema + receipts; reuse existing install, zero deps)
- OpenAlex TEI tables route: **KEEP** (already adopted pattern, same schema sink)
- camelot/pdfplumber: **REJECT for core** (system deps / overlap once docling
  lands); pdfplumber **DEFER** as fallback if docling table quality benches poorly
- WebPlotDigitizer: **REJECT** bundling (GPL); **ADAPT concept** only
- VLM chart-extraction: **DEFER** (trigger: measured need + live budget)
- PySR: **DEFER** (Apache-2.0 fine; trigger = formula-discovery workload; then evaluate vs pyoperon)
- pyoperon: **DEFER-first-choice** (SPDX verify at adoption; lighter runtime)
- gplearn: **REJECT** (quality floor)
- SHAP attribution reports: **ADOPT-in-sidecar** (MIT; uv lockfile add at implementation wave; deterministic serialization)
- Reproducibility-risk predictor: **BUILD deterministic-proxy now**, ML model DEFER (reopen trigger recorded)

## Integration sketch (owners)
- src/pipeline/stages/retrieve.ts: deepening slot gains parse op (sidecar call)
- src/domain/source.ts (or new quantitative.ts): quantitative_extract zod owner
- experiment-runtime sidecar: attribution op (shap) + optional future SR op (pyoperon) — uv lockfile additions ONLY at implementation wave
- src/pipeline/stages/falsify.ts + claims schema: consume typed numbers
- revise.ts: attribution_report → mechanism-hint card input

## Deterministic validation workload (offline)
- parse golden fixtures: 3 sample PDFs (with known tables) → extracted cells
  match expected values exactly (deterministic parser output snapshot)
- quantitative_extract schema round-trip + provenance resolvability (receipt link required)
- attribution report: fixed synthetic dataset + seeded RF → expected top-k order stable
- forensic handoff: planted inconsistent statistic in parsed table → RU-6 checker flags

## UNVERIFIED
- docling-mcp in-run latency budget on typical fulltexts (install verified, throughput not measured)
- pyoperon SPDX + Windows wheel quality (PyPI metadata incomplete this probe)
- VLM chart-extraction accuracy on our corpora (needs live)
- SCORE program final artifact availability

## Addendum: parallel research-agent reconciliation (2026-08-24, main Agent)
An independent research agent ran the same RU-5 to saturation in parallel.
Convergences: gap-is-our-glue (docling), PySR/Julia DEFER, live-VLM DEFER,
deterministic-proxy-now for reproducibility risk. License CORRECTIONS the
agent primary-sourced: PySR=Apache-2.0 (matches), MAPIE=BSD-3, pint=BSD,
gplearn 0.4.3 still maintained (2026-01 release). FALSIFIED: TSRecBench
benchmark attribution (not found in arXiv/GitHub/web; docling's ~97.9% table
accuracy traces to a vendor blog — use TableFormer TEDS ~93.6-96.75 from
arXiv:2408.09869 as the honest range). Divergences resolved to the packet
above (gplearn REJECT quality-floor stands; SHAP ADOPT-in-sidecar stands).
New GO the agent adds and main Agent landed NOW: **split-conformal intervals
as pure TS** (src/domain/conformal.ts, Angelopoulos-Bates arXiv:2107.07511,
~30 lines, no MAPIE dep) — marginal-coverage-under-exchangeability guarantee
with mandatory alpha+nCalibration disclosure; wiring trigger = next
prediction-interval surface in the verdict layer.
