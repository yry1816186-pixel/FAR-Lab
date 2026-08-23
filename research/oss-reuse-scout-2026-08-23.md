# OSS Reuse Scout — Capability Domains (2026-08-23)

Mission: per user directive — build only what the project needs, make it strong,
reuse first-line OSS via MCP instead of hand-writing code. Constraint honored:
zero new runtime deps in Node product (zod-only invariant) → all external
capability enters as standalone MCP servers bridged by existing src/agent/mcp-manager.ts.

## 1. Multimodal document/figure understanding — NEEDED (figures, tables, vector graphics in literature)

| Candidate | What | Fit verdict |
|---|---|---|
| **docling-mcp** (github.com/docling-project/docling-mcp) | OFFICIAL MCP server of IBM Docling: PDF→structured (layout, reading order, figure extraction, table structure TSRecBench ~97.9%, OCR) | **PRIMARY.** Official, MIT, first-line (Docling 30k+★). Figures+tables+formulas out of the box |
| mineru-mcp-server (neosun100/mineru-mcp-server) | MinerU (OpenDataLab, layout detection 97.5 mAP top benchmark), async batch, PDF/PPTX/DOCX/images | **SECONDARY / A-B test.** MinerU SaaS MCP also exists (mineru.net/ecosystem) |
| markitdown MCP (microsoft/markitdown ecosystem) | 29+ formats→Markdown, lightweight | Fallback for quick full-doc text; weaker on figures than Docling/MinerU |

Integration: register docling-mcp as an mcp_server integration (stdio); pipeline
fulltext stage gains a "structured parse" tool call. Figure images extracted by
Docling are then passed to a vision model — that closes multimodal understanding
without touching provider code.

## 2. Computer Use / automation — NEEDED (online platforms, OpenML, bulk downloads)

| Candidate | What | Fit verdict |
|---|---|---|
| **microsoft/playwright-mcp** (official) | Accessibility-tree-driven browser automation over Playwright; semantic locators, resilient to DOM change | **PRIMARY.** Microsoft-official, de-facto standard, MIT. Deterministic a11y-tree > screenshot-pixel agents for reliability |
| browser-use (github.com/browser-use/browser-use, ~80k★) | Vision+DOM hybrid autonomous browsing agent | SECONDARY when tasks need visual reasoning; heavier (Python agent runtime) |

Desktop automation deliberately NOT adopted now: no current product need
(principle #3 — need-based only).

## 3. Already-strong domains — no reuse needed
Function calling / structured output / compaction / MCP manager / academic RAG:
audited strongest-tier (see audit this session); replacing them with OSS would be regression.

## Sequencing (need-first)
1. docling-mcp integration + live verification on a real workspace PDF with figures (highest value: every run reads papers)
2. playwright-mcp integration behind permissions gate (EEL online-experiment surfaces)
3. Optional: MinerU A/B if Docling table quality disappoints on our corpus

## Honesty notes
- Star counts from search results/memory as of 2026-08-23 — UNVERIFIED exact numbers; verify at integration time.
- Subagent fan-out failed this session (DeepSeek 402 balance exhausted); research done directly via web_search_prime instead.
