# W-EV2 fulltext phase A — live verification (2026-08-22)

Live run `run_8w2h8ctns2a149j0hc0yb9gmep` (DeepSeek route, question: deep learning
architectures for protein-protein interaction prediction, domain computational biology,
goal methodological). Commands: `far research start … --json`; direct sqlite reads of
`.far-run/far.db` (readOnly) below.

## Observed facts (from the run's own persisted state)

- 12 corpus documents; identifier mix arxiv=3, doi=10, openalex=9, **pubmed=8** (new
  OpenAlex `ids.pmcid`/`ids.pmid` mapping live in production).
- build_evidence deepening attempted the top routable docs (cap 3):
  - 1 fetched: `Interpretable Structured Learning with Sparse Gated Sequence …`
    → arXiv LaTeXML HTML `https://arxiv.org/html/2010.08514`, HTTP 200,
    variant `arxiv_html_v1`, receipt recorded (`source_retrieval`, contentHashes=[artifact hash]).
  - Document upgraded: `contentDepth='full_text'`, `fullTextRef='sha256:2440f0af…'`,
    license undefined (arXiv HTML carries no machine-readable license statement in our
    extractor — recorded honestly as absent; Europe PMC JATS extraction does capture licenses).
  - Remaining candidates: not_available (no HTML rendering / not OA) — the common case,
    silent by design.
- Claims from the deepened document: **4 extracted, 4 verified** (quote alignment against
  abstract+fulltext-excerpt combined text). Claim content reaches fulltext-body material
  (contrastive pairwise-ranking loss details, Siamese architecture cost critique) that a
  150-word abstract could not ground.

## Scope statement

- Phase A covers arXiv LaTeXML HTML + Europe PMC fullTextXML (JATS), keyless,
  license-clean, zero new runtime dependencies. PDF extraction deliberately excluded
  (no zero-dep PDF text path; AGPL minefield per D-019).
- Bounds: ≤3 deepen attempts per build_evidence execution, 16,000-char model-view
  excerpt (complete text always artifact-persisted), resume-safe artifact reload.
- Unit/e2e coverage: tests/sources-fulltext.test.ts (17), deepen suite in
  tests/pipeline-evidence.test.ts (5); full suite 233/233 at commit 9107f59.
