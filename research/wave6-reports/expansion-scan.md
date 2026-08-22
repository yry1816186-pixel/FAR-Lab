# Wave-6 Expansion Scan — Candidate Discovery Report

- Date: 2026-08-22
- Scout: Wave-6 proactive-expansion (web discovery + repo verification)
- Scope: systems NOT covered by other Wave-6 scouts (paper-qa, gpt-researcher, open_deep_research, dzhng/deep-research, node-DeepResearch, RankGPT, beir, rag-fusion, OpenScholar, AI-Scientist v1/v2, aviary, robin, mlrbench, harness repos — all excluded)
- Constraints honored: FAR-Lab = three-source keyless scholarly retrieval (OpenAlex + arXiv + Crossref), zero runtime deps, NO commercial search API backends (orchestration/eval mechanisms only)

## Method

1. Web search (WebSearch / web_search_prime) per family.
2. Existence verification: codeload probe `curl -s -o /dev/null -w "%{http_code}" --max-time 30 https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD` (run from `.cache/repos`).
3. License via `gh api repos/<slug>` (GitHub license detection = actual LICENSE file in tree; NOT guessed). `null` = no license file detected; `NOASSERTION` = unclassifiable custom license file.
4. Backend/API facts (ScholarQA, RefChecker, OpenDeepSearch, deer-flow) verified from repo READMEs, not memory.

## Family 1 — Question-driven inquiry / query planning

| Repo | Probe | License | What it does | FAR-Lab relevance | Rec |
|---|---|---|---|---|---|
| stanford-oval/storm | 200 | MIT (LICENSE file confirmed via API) | Perspective-guided multi-turn question asking (persona diversity) → retrieval → grounded Wikipedia-style article with citations | Strongest open "inquiry engine" for hypothesis-stage questioning; perspective table maps directly to counter-evidence seat assignment; search backends pluggable (SearXNG/keyless possible) | **FETCH** |
| allenai/ai2-scholarqa-lib | 200 | Apache-2.0 | ScholarQA: query decomposition w/ metadata filters (year/venue/FoS) → S2 snippet+keyword retrieval → mxbai cross-encoder rerank → quote extraction → clustering → outline → per-section synthesis w/ inline citations | Best-in-class attribution/quote-extraction pipeline = claim-source alignment mechanism; retrieval is S2-only w/ `S2_API_KEY` (public API keyless at low rps is a viable pattern) | **FETCH** |
| bytedance/deer-flow | 200 | MIT | LangGraph deep-research orchestrator: planner → researcher → reporter, human-in-the-loop feedback, pod/citation management | Search backends = Tavily + BytePlus InfoQuest (commercial-bound) → mechanism-only reference for plan-execute-report state machine | NOTE |
| sentient-agi/OpenDeepSearch | 200 | Apache-2.0 | smolagents-based OpenSearch/CodeSearch agents w/ iterative refinement | Default Serper.dev (commercial free-tier); SearXNG escape hatch exists; agents are thin wrappers — low mechanism value | SKIP |
| StonyBrookNLP/ircot | 200 | Apache-2.0 | IRCoT: interleaved retrieval + chain-of-thought for multi-hop QA (wiki corpora, retrieve-then-reason decomposition) | Multi-hop decomposition mechanism reference; research code, stale since 2024-06 | NOTE |
| jzbjyb/FLARE | 200 | MIT | Lookahead active retrieval: predicts next sentence, triggers retrieval only on low-confidence tokens — "when/what to retrieve" | Direct stop-criteria/sufficiency signal mechanism (see Q2 below); stale since 2023-11 | NOTE |
| starsuzi/Adaptive-RAG | 200 | Apache-2.0 | Classifier routes query by complexity → no-retrieval / single-step / multi-step pipeline | Complexity-gated retrieval budget = deterministic sufficiency proxy; research code, stale | NOTE |
| AkariAsai/self-rag | 200 | MIT | Self-RAG: reflection tokens decide retrieval-need, relevance, groundedness, utility during generation | Retrieval-need + grounding self-check mechanism (distinct repo from covered OpenScholar); training-bound (needs fine-tuned model) | NOTE |

## Family 2 — Academic RAG / scholarly search / citation verification

| Repo | Probe | License | What it does | FAR-Lab relevance | Rec |
|---|---|---|---|---|---|
| markrussinovich/refchecker | 200 | MIT | Verifies references in papers against Semantic Scholar + OpenAlex + Crossref + DBLP + ACL Anthology; single/bulk/OpenReview scans; catches fabricated refs + metadata mismatches; optional LLM deep-search hallucination check; Python + TS/Tauri UI | **Exact FAR-Lab API stack (keyless-friendly scholarly DBs)**; reference-verification depth directly targets retrieval-verified-rate 0.9667→0.98; active (pushed 2026-08-17), 472 stars | **FETCH (top priority)** |
| danielnsilva/semanticscholar | 200 | MIT | Community-maintained Python client for S2 Graph API (paper/author/search endpoints, rate-limit handling) | Keyless-safe S2 client patterns (rate-limit/retry/backoff); FAR-Lab is TS/zero-deps so pattern reference only | NOTE |
| allenai/ai2-scholarqa-eval | 200 | **null (no license file)** | Eval code/data for ScholarQA-CS2 benchmarking | Unusable as code (all-rights-reserved default); benchmark design ideas only | SKIP |
| DWFlanagan/llm-citation-verifier | 200 | **null (no license file)** | Crossref DOI-check plugin flagging fake DOIs in real time | Tiny (7 stars), unlicensed; RefChecker supersedes it | SKIP |
| hadipourh/verifyref | 200 | **NOASSERTION (custom/unrecognized)** | Verifies PDF bibliography authenticity across academic DBs | License unclear; skip code, glance at DB coverage list only | SKIP |

## Family 3 — Retrieval evaluation utilities

| Repo | Probe | License | What it does | FAR-Lab relevance | Rec |
|---|---|---|---|---|---|
| AmenRa/ranx (correct home; AmedeoBertucci/ranx 404) | 200 | MIT | Numba-vectorized IR metrics (nDCG, MAP, recall, MRR...) + **ranx.fuse rank fusion** (RRF, CombMNZ, weighted fusion) | Metric definitions as cross-check oracle for FAR-Lab's own TS metrics; **rank-fusion methods directly apply to merging OpenAlex+arXiv+Crossref result lists** | **FETCH** |
| joaopalotti/trectools (CornellNLP/trectools 404) | 200 | BSD-3-Clause | pandas-based TREC run/qrel analysis (elementary metrics + statistical comparison) | Deterministic regression comparison patterns; Python, stale since 2024-08 | NOTE |
| castorini/pyserini | 200 | Apache-2.0 (re-confirmed) | Sparse/dense retrieval + reproducible IR eval (trec_eval integration, BEIR/MSMARCO protocols) | Gold-standard eval protocol reference; Java-dependent → oracle/cross-validation only, never runtime | NOTE |

**TS/JS-native IR metrics: none found.** npm registry search surfaces only observability/metrics-monitoring packages (prom-client, otel, etc.) — no mature dedicated nDCG/recall/MRR evaluation library. Conclusion: FAR-Lab implementing its own small typed metrics module is justified; validate it against ranx/trec_eval on shared fixtures.

## Family 4 — Reranking beyond RankGPT

| Repo | Probe | License | What it does | FAR-Lab relevance | Rec |
|---|---|---|---|---|---|
| castorini/rank_llm | 200 | Apache-2.0 | Productionized LLM reranking framework: listwise (RankGPT/RankVicuna/RankZephyr) + pointwise + pairwise, sliding-window prompts, **suffix-based likelihood trick**, multi-provider, integrated Pyserini/trec_eval evaluation | Deterministic rerank regression harness + prompt-mode comparison; complements covered sunnweiwei/RankGPT (research prototype) with maintained, evaluated implementation; active (pushed 2026-08-17) | **FETCH** |
| Rerank uncertainty calibration | — | — | **No mature open orchestration found.** "LLM-Confidence Reranker" (LCR, training-free plug-and-play black-box confidence for RAG rerank) exists as arXiv 2602.13571 paper only; no surfaced repo. Calibration repos found (CritiCal, LLM-Uncertainty-Bench) target QA confidence, not reranking | Gap → FAR-Lab should implement its own (self-reported confidence + temperature/scaling calibration) if rerank uncertainty is needed for evidence-seat gating | GAP (implement in-house) |

## Direct questions answered

1. **Does stanford-oval/storm have a license file?** YES — MIT, confirmed via GitHub API license detection (which reads the tree) + codeload probe 200. Safe to fetch.
2. **Open implementations of "query sufficiency" / stop-criteria?** No mature turnkey library exists. Closest mechanisms, all verified: jzbjyb/FLARE (MIT; lookahead token-confidence gating), AkariAsai/self-rag (MIT; reflection tokens for retrieval-need/groundedness), starsuzi/Adaptive-RAG (Apache-2.0; query-complexity routing to retrieval budget). All are stale research code — extract mechanisms, not dependencies. Practical sufficiency proxies FAR-Lab can implement deterministically: evidence-seat coverage check + per-perspective quote quota + novelty delta between successive result batches (FLARE-style low-yield stop).

## Fetch recommendations (ranked)

1. **markrussinovich/refchecker** — MIT, active, exact keyless scholarly-API verification stack (S2/OpenAlex/Crossref/DBLP/ACL). Direct lever on retrieval-verified-rate and fabricated-reference detection.
2. **stanford-oval/storm** — MIT, 31k stars. Perspective-guided inquiry engine → counter-evidence seat diversity.
3. **allenai/ai2-scholarqa-lib** — Apache-2.0. Quote extraction + clustering + inline-citation attribution pipeline.
4. **castorini/rank_llm** — Apache-2.0, active. Listwise rerank orchestration + suffix-likelihood + eval harness.
5. **AmenRa/ranx** — MIT. Metric oracle + rank-fusion algorithms for three-source list merging.

Note/skip: deer-flow + OpenDeepSearch (commercial-search-bound orchestration references only); ircot/FLARE/Adaptive-RAG/self-rag (mechanism notes); trectools/pyserini (eval oracles); ai2-scholarqa-eval / llm-citation-verifier / verifyref (license problems or superseded).

## Sources

- [AmenRa/ranx](https://github.com/AmenRa/ranx), [ranx docs](https://amenra.github.io/ranx/), [ECIR 2022 ranx paper](https://ecir2022.org/uploads/445.pdf), [ranx.fuse paper](https://dl.acm.org/doi/pdf/10.1145/3511808.3557207)
- [allenai/ai2-scholarqa-lib](https://github.com/allenai/ai2-scholarqa-lib), [Ai2 ScholarQA blog](https://allenai.org/blog/ai2-scholarqa), [ai2-scholarqa-eval](https://github.com/allenai/ai2-scholarqa-eval)
- [markrussinovich/refchecker](https://github.com/markrussinovich/refchecker)
- [DWFlanagan/llm-citation-verifier](https://github.com/DWFlanagan/llm-citation-verifier), [verifyref](https://github.com/hadipourh/verifyref)
- [jzbjyb/FLARE](https://github.com/jzbjyb/FLARE) ([arXiv:2305.06983](https://arxiv.org/abs/2305.06983)), [starsuzi/Adaptive-RAG](https://github.com/starsuzi/Adaptive-RAG) ([arXiv:2403.14403](https://arxiv.org/abs/2403.14403))
- [LLM-Confidence Reranker (LCR)](https://arxiv.org/html/2602.13571v1), [HKUST-KnowComp/CritiCal](https://github.com/HKUST-KnowComp/CritiCal), [smartyfh/LLM-Uncertainty-Bench](https://github.com/smartyfh/LLM-Uncertainty-Bench)
