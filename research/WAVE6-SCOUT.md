# Wave-6 Scout — Retrieval & RAG Infrastructure Source Expedition (2026-08-22)

**Mission** (user /goal): deep-read retrieval/RAG/query-planning infrastructure sources —
FAR-Lab's evidence-quality upstream — then fuse at source level with before/after retrieval-quality
benchmarks. Hard precondition honored: the deterministic retrieval-quality baseline harness landed
FIRST (`eval/retrieval-baseline.mjs` + tests + frozen before-snapshot; see
`evidence/W6/retrieval-baseline-harness.md`).

**Constraints honored**: three-source keyless backend (OpenAlex/arXiv/Crossref) — commercial-search
systems contribute orchestration/evaluation mechanisms only; zod-only zero-runtime-dep invariant;
Direction-A soul boundary; live LLM routes blocked (D-036) → offline/deterministic verification.

## 0. Source inventory (all local under `.cache/repos/`, gitignored; DATA never executed)

| repo | license (verified) | report |
|---|---|---|
| Future-House/paper-qa | Apache-2.0 | wave6-reports/paper-qa-retrieval.md |
| assafelovic/gpt-researcher | Apache-2.0 | wave6-reports/gpt-researcher.md (main-agent read) |
| langchain-ai/open_deep_research | MIT | wave6-reports/open-deep-research.md |
| dzhng/deep-research | MIT | wave6-reports/ts-deep-research-comparison.md |
| jina-ai/node-DeepResearch | Apache-2.0 | wave6-reports/ts-deep-research-comparison.md |
| sunnweiwei/RankGPT | Apache-2.0 | wave6-reports/rankgpt-source-detail.md |
| beir-cellar/beir | Apache-2.0 | wave6-reports/retrieval-eval-baseline-design.md (harness LANDED) |
| Raudaschl/rag-fusion | MIT | wave6-reports/query-decomposition-crosscut.md |
| AkariAsai/OpenScholar | Apache-2.0 | wave6-reports/openscholar-retrieval.md |
| markrussinovich/refchecker | MIT | wave6-reports/refchecker.md (main-agent read) |
| stanford-oval/storm, allenai/ai2-scholarqa-lib, castorini/rank_llm, AmenRa/ranx | MIT/Apache-2.0 | fetched (expansion-scan.md); not deep-read this wave — see §5 deferral triggers |

Main-agent spot-verification of subagent file:line claims: paper-qa types.py:249-262 (pqac),
utils.py:170-180, agents/helpers.py:27-40, rag-fusion main.py:79-101 (RRF weight + off-by-one
vs canonical) — all confirmed verbatim.

## 1. Cross-cutting synthesis (what ≥2 sources independently agree on)

| convergent finding | sources | FAR-Lab verdict |
|---|---|---|
| Short keyword queries for strict AND engines | JR schemas.ts:198 (2-5 words); paper-qa broad/narrow instruction (agents/helpers.py:27-75); our 82.3% arXiv zero-rate on 8-12 word phrases | **real defect, deterministic fix available** |
| Zero-result searches are a first-class failure signal, not silence | ODR utils.py:126-127 + legacy deterministic mutation retry legacy/utils.py:1274-1283; JR agent.ts:324-326 (zero = error signal) | adopt: measure + react |
| Source diversity must be enforced structurally, not hoped for | JR per-host cap 2 (url-tools.ts:451-476); our counter-seat floor (have); gpt-researcher multi-retriever | we have seats; missing family-level routing fairness (see F1) |
| Per-evidence summarization with citation binding before synthesis | paper-qa docs.py:492-586; ODR utils.py:175-213; JR build-ref.ts | have-equivalent (evidence cards, claim binding 100%) |
| Iterative sufficiency loops: value depends on reading page bodies / live LLM | ODR honest assessment; gpt-researcher #1; OpenScholar bounded round | defer with trigger (see §5) |
| Citation hygiene in deepened fulltext | OpenScholar strips [n] markers (open_scholar.py:37-38,717-720) | cheap adopt (F5) |
| RRF k=60 is the standard fuse | rag-fusion main.py:79-101; ranx.fuse; ours (canonical rank+1 form, better than rag-fusion's off-by-one) | have |

## 2. Measured defects in current FAR-Lab retrieval (baseline harness + keyless probes)

1. **arXiv zero-result rate 82.3%** (158/192 searches, 46 runs; mean 0.81 results/search; direct
   DB cross-check independent of harness code). Root cause: NOT syntax (we already send
   `all:t AND …` same as refchecker arxiv_citation.py:162-202) — long-phrase AND intersection
   emptiness.
2. **Counter-evidence effectively single-sourced**: buildTargets (retrieve.ts:111-128) routes
   counter[0]→openalex, counter[1]→arxiv. counterZero median 1/run. Crossref — added precisely as
   the redundancy family (D-029b) — never sees a counter query.
3. **Verify gate is title-Jaccard-only** (verify.ts): a resolved-but-wrong-paper match passes.
   refchecker's production wrong-paper detector (4 multi-signal rules, identifier-anchored
   exemption) is the mature pattern we lack.
4. **Rerank window hard-capped at 24** single window; RankGPT sliding-window (bottom-up, w/2 step)
   is the proven extension for larger pools (ours: poolSize median 23.5, p90 higher).

## 3. Fusion shortlist (EV-ranked; gate = eliminate demonstrated failure class or ≥5% metric gain, zero north-star regression)

| # | fusion | source (file:line) | type | offline-verifiable? | evidence already in hand |
|---|---|---|---|---|---|
| F1 | counter[1] reroute arxiv→crossref | JR agent.ts:305-322 (per-query routing) precedent; our buildTargets | BUILD | deterministic unit tests + live keyless probe | **crossref probe: 68/68 unique historical counter queries → 0% zero, mean 6.0 results** (spikes/output/crossref-counter-probe.json) vs arxiv 82.3% zero on same population |
| F2 | deterministic arXiv query shortening (first-K terms) inside arxiv adapter | JR 2-5-word discipline; ODR deterministic mutation retry | BUILD | live keyless replay probe | spikes/output/arxiv-truncate-probe.json (this file, §3.1) |
| F3 | wrong-paper guard in verify (surname overlap + year gap + venue substring; identifier-anchored exempt; conservative flag not silent flip) | refchecker enhanced_hybrid_checker.py:687-870 | EXTRACT | deterministic unit tests | report §mechanism-1; production-hardened rules v0.7.67 |
| F4 | bottom-up sliding-window rerank for pool>24 (w=24, s=12, per-window renumber, n≤w passthrough) | RankGPT rank_gpt.py:234-244 | EXTRACT | deterministic unit tests (window math); live effect when routes return | rankgpt-source-detail.md §1 |
| F5 | strip inherited [n] citation markers from deepened fulltext | OpenScholar open_scholar.py:717-720 | ADAPT | deterministic unit tests | openscholar-retrieval.md §3 |
| F6 | purpose-weighted RRF (counter lists upweighted) | rag-fusion query_weights (eval/retrieval.py:71-80) | evaluate-first | offline replay from receipts | crosscut C1a; quota floor already guarantees seats — needs a quality proxy metric first |
| F7 | bounded feedback retrieval round (critique→≤2 follow-up queries→RRF merge→replace-within-cap) | OpenScholar open_scholar.py:644-687 | DEFER (needs live LLM) | live-gated | strongest future candidate; trigger = routes return + ≥3 runs with measured query-sufficiency gaps |
| F8 | pqac-style opaque-ID citation binding | paper-qa types.py:249-316 | DEFER (needs live LLM; claim binding already 100%) | live-gated | paper-qa report §1 |
| F9 | LLM support-verification (claim,doc)→Yes/No advisory | OpenScholar instructions.py:282-301 | DEFER (live LLM) | live-gated | — |

Rejected this wave (evidence-gated, registry C): iterative sufficiency loops as a class (crosscut
C2 — no demonstrated failure class that iteration fixes; wall-clock hard gate; ODR's own adaptive
value depends on web-page bodies scholarly APIs don't return), embedding anything (zod-only),
commercial search backends (boundary), tantivy/BM25 local corpus (no local corpus), gpt-researcher
descent loop (web-page dependency + LLM-heavy; design reference only).

## 3.1 arXiv truncation probe (COMPLETE — drives F2 design)

Live keyless replay of 30 historical zero-result queries × {full, k6, k4, k2} first-terms
variants (spikes/output/arxiv-truncate-probe.json; every variant ≥3.1s politeness):

| variant | zero | zeroRate | meanEntries |
|---|---|---|---|
| full (8-12 terms) | 30/30 | 1.000 (by construction) | 0 |
| k6 | 30/30 | 1.000 | 0 |
| k4 | 16/30 | 0.533 | 1.4 |
| k2 | 2/30 | **0.067** | 5.0 |

Relevance spot-check (spikes/output/arxiv-variant-relevance.json, 8 queries): k4 first-results
are specific when nonzero (lapatinib resistance, CRISPR PAM, vitamin-D/COVID); k2 returns
broad-but-related results with occasional drift (1/8: physics paper on "horizontal
symmetries" for a horizontal-gene-transfer query). **Decision: cascade full→k4→k2** — full keeps
proven-relevant matches for the 17.7% currently-working searches, k4 recovers with specificity,
k2 is the near-total fallback; k2 drift is bounded downstream (single-list RRF contribution →
listwise rerank → counter-seats → cap-12). Wall-clock bound: ≤2 extra arXiv calls per zero
search (~+3.1s each, politeness clock), and F1 removes one arXiv call per run (counter[1] moves
to crossref), net ≈ +9s typical vs 360s p50 budget — recorded as the honest cost.

## 4. Measurement plan (per common-baseline discipline)

- BEFORE (frozen): `eval/results/retrieval-baseline-before-w6.json` (46 runs) + full suite
  295/295 + typecheck 0 (2026-08-22).
- F1/F2 (retrieval behavior): deterministic unit tests on target-building/query-construction +
  live keyless probes (arxiv.org / api.crossref.org reachable) replaying HISTORICAL queries —
  before/after zero-rate on the same query population = the benchmark. Wall-clock: F1 net-zero
  (reroute), F2 bounded cascade (≤2 extra arXiv calls per zero search, ~+9s typical).
- F3/F4/F5 (deterministic logic): unit tests incl. failure paths; full suite + build after.
- AFTER (audit-corrected, D-056): offline harness metrics are a pure function of PERSISTED
  runs — post-fusion code cannot move them without new runs. The same-DB rerun
  (`retrieval-baseline-determinism-replay-w6.json`) proves measurement determinism only; the
  W6 guarded gate is **UNDISCHARGED until fresh live runs exist** (model routes blocked D-036).
  The behavioral before/after evidence today = the probe table (§3/§3.1); guarded compare on
  live runs discharges the gate when routes return.
- Adversarial audit of the fused code after landing (subagent or main-agent red review), fixes to
  root cause, evidence/W6/ artifacts.

## 5. Deferred registry updates (reversal triggers)

- storm / ai2-scholarqa-lib / rank_llm / ranx fetched, not deep-read: trigger = F1-F5 fused and a
  residual defect in their dimension (query planning / pipeline alignment / rerank orchestration /
  metric oracle) or next wave's budget.
- F7 bounded feedback round is the top live-gated candidate (OpenScholar's replace-within-cap
  design preserves claim binding + counter seats); trigger = any model route returns.
- S2AG citation contexts: unchanged (probe evidence, deferred).

## 6. Scout-session verification record

- 9/9 planned lines + 1 proactive expansion line have reports (3 main-agent authored after
  subagent rate-limit failures — noted honestly in each report).
- Every load-bearing upstream claim used in fusions carries file:line; main agent spot-verified
  the highest-load ones (§0).
- Probes: crossref-counter (complete, §3-F1), arxiv-truncate (§3.1), all keyless, outputs under
  spikes/output/.
