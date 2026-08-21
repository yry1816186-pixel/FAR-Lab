# TECH_CANDIDATES.md — External Technology Registry (Evolution Phase)

Merged candidate space = prior baseline (`research/reference/FARLAB_PRE_RESEARCH_INTELLIGENCE_BASELINE.md`, 51 deep records) + 2026-08-22 six-scout open-world expedition. Decision vocabulary per mission. Every ADOPT/ADAPT/EXTRACT below carries scout evidence; reversal triggers recorded in `.control/DECISIONS.jsonl`.

## A. Adopted into Wave-1 fusion (zero new runtime deps)

| Candidate | Source | License | Decision | Capability fused | Evidence |
|---|---|---|---|---|---|
| RankGPT listwise permutation pattern | sunnweiwei/RankGPT (pattern only, no code) | Apache-2.0 | EXTRACT pattern | LLM listwise rerank of retrieval pool before corpus cap | +2.3 nDCG@10 BEIR (EMNLP 2023); listwise degrades least on novel queries (arXiv 2508.16757) |
| Reciprocal Rank Fusion (k=60) | SIGIR 2009 (public algorithm) | n/a | BUILD (~20 lines deterministic TS) | Fuse 8 result lists from executed query plan | RRF beats single ranker/CombMNZ; RAG-Fusion (arXiv 2402.03367) positive |
| Robin pairwise tournament + Bradley-Terry/ILSR | Future-House/robin | Apache-2.0 | EXTRACT mechanism (port choix.ilsr_pairwise to TS, algorithm only) | Selection pressure over hypothesis pool: random pairs → LLM pairwise judge with A/B swap → BT scores + uncertainty | Only open hypothesis-gen system with wet-lab-validated discovery (Nature 2026); Si et al. ICLR 2025: 5 comparisons/candidate predicts human accept 71.4% |
| Evidence-card judging + rubric anchoring | Si et al. / MLR-Bench / Style-Wins findings | papers | ADAPT prompt design | Tournament judges see structured evidence cards (claims+neighbors), not prose; mitigates style bias (SBI 0.57) | Style Wins Substance Loses (arXiv 2608.01666); MLR-Judge rubric alignment |
| Externally-anchored critique (no signal-free self-refine) | Huang et al. ICLR 2024 + CRITIC + Sample-More-Reflect-Less | papers | ADAPT constraint | Any critique/refine step must cite retrieved external evidence; forbidden: intrinsic self-critique loops | Intrinsic self-correction degrades performance (2310.01798); debate no better than self-consistency at matched cost (2311.17371) |
| Literature-grounded novelty (retrieve→facet-rerank→adjudicate) | arXiv 2506.22026 (ACL SDP 2025) + SciMON method (Apache-2.0 code, method borrowed) | papers | ADAPT | Per-hypothesis query expansion → neighbor retrieval → facet rerank → novelty verdict with `unclear` default; two-layer novelty state | +13% expert agreement vs AI-Scientist approach; Beel et al. (2502.14297) showed AI-Scientist novelty misses nearest neighbors |
| Claim-claim cross relations with prefilter + `not_comparable` | NAACL 2025 reference-indeterminacy finding + SDP 2024 zero-shot verification | papers | BUILD | Topic-overlap prefilter (deterministic) → batched LLM pairwise adjudication → populate unused `targetClaimId` | >80% false-contradiction without shared-reference prefilter; GPT-4+ICL ≈ supervised at abstract verification |
| arXiv native HTML endpoint | arxiv.org/html/<id> | content per-article (local use OK) | ADOPT (API) | Structured fulltext for ~90%×97% of TeX submissions, keyless | Scout live-probed HTTP 200 (2026-08-22) |
| Europe PMC fullTextXML | europepmc.org REST | API Apache-2.0; content per-article CC | ADOPT (API) | JATS fulltext (6.5M OA subset incl. methods/results), keyless | Scout live-probed full JATS returned |
| S2AG citation contexts | api.semanticscholar.org | free, attribution required; keyless shared pool / free key 1 RPS | ADOPT (API) | `contexts/intents/isInfluential` per citation = external counter-evidence feed; tldr; openAccessPdf | Scout live-probed keyless 200; exponential backoff required |
| Unpaywall | unpaywall.org | CC0, keyless (email param) | ADOPT (API) | OA discovery + pdf_url resolution | 100k calls/day documented |
| MLR-Bench ideation+proposal stages | chchenhui/mlrbench; data HF CC BY 4.0 | code MIT | ADOPT (eval slice) | External comparability vs published o4-mini/Claude/Gemini/DeepSeek-R1 scores; 9-dim rubric, 6.0 accept line | NeurIPS 2025 D&B; novelty/feasibility dims non-saturated |
| Judge calibration: cross-family panel + order-swap + κ-vs-human | MT-Bench / Judge's Verdict / JDA / SciArena-Eval | papers | ADAPT eval protocol | Pairwise with both orders; panel across model families; report κ on n≥30 human-labeled; anti-leniency mandatory-defect prompt | Position bias nearly eliminated by swap+mean; same-family panels give false consensus; all judges leniency-biased |
| DeepSeek strict function-calling beta (`api.deepseek.com/beta`, tools `strict:true`) | official DeepSeek docs (2026-08-22 recheck) | API ToS | ADOPT (D-026) | Default structured-output transport: zodToStrictJsonSchema projection + tools/tool_choice; zod stays semantic authority; probe + live e2e verified (finishReason=tool_calls, full receipt) | Server-side schema enforcement eliminates malformed-shape class at transport; escape hatch FARLAB_DEEPSEEK_STRICT=0; watch beta stability |
| POPPER multiple-testing discipline (e-value/alpha-spending falsification) | POPPER ICML 2025 paper (code has NO license — untouched) | paper mechanism | EXTRACT (D-025) | multipleTestingPolicy (single_primary/alpha_spending/e_value_accumulation) required by executability gate for >1-hypothesis plans + prompt + export disclosure | Live-verified 2-hypothesis plan asserted single_primary with primary-comparison note |

## B. Deferred (evidence-gated or later-phase)

| Candidate | Decision | Trigger |
|---|---|---|
| GROBID Docker sidecar (Apache-2.0, 0.9.1 active) | REJECT (superseded 2026-08-22, D-028): OpenAlex content API serves SERVER-SIDE GROBID TEI per work ($0.01/file, free key ~100/day ≥ our ≤3/run deepening cap; probe: metadata keyless, download 401-without-key) — same GROBID output, zero JVM/Docker infra. Route `openalex_tei_v1` landed in fulltext phase B | Re-open only if OpenAlex content API pricing/access changes materially |
| docling-serve (MIT) | DEFER | Non-scholarly document need |
| Local ONNX cross-encoder rerank (transformers.js + onnxruntime-node, Apache/MIT) | DEFER | Pool >60 or offline need; requires latency spike; ~227MB optional dep |
| Local ONNX NLI (Xenova/nli-deberta) as claim-relation cross-checker | DEFER (trigger rewritten 2026-08-22, D-023: relation-precision spike measured contradicts 1/8 exact, but the defect pattern = topical distance + label granularity, which NLI does not fix; deterministic topical gate shipped instead) | Re-activate only if a POST-GATE blind re-judging (evidence/W-EV2/relation-precision.md reproduction) still shows low precision on topically-close pairs; would also need a zero-runtime-dep exception |
| OpenAlex API key | ADOPTED 2026-08-22 (partial #4): optional OPENALEX_API_KEY rides api_key= when present; keyless still default (policy-drift adaptation) | Fulltext-download option (PDF/TEI, 60M OA docs) still open; GROBID stays deferred |
| models.dev provider registry snapshot | DEFER (network-blocked 2026-08-22: models.dev unreachable from this environment, curl 000 / fetch failed — no fabricated snapshot) | Retry when network allows; snapshot script is one fetch + summary JSON |
| FIRE-Bench rediscovery eval (arXiv 2602.02905, ICML 2026) | ADAPT (design extracted 2026-08-22, D-029): atomic-claim decomposition + set-matching P/R/F1 vs ESTABLISHED findings — objective GT, no quality-judge circularity. Official repo NO LICENSE (harness self-implemented); HF dataset Apache-2.0 but network-blocked (huggingface.co unreachable) — seed set authored in-repo (eval/rediscovery.mjs), HF import = documented extension | Import HF task set when network allows; never compare hypothesis-level F1 to official full-cycle agent scores |
| CORE API v3 | DEFER | Marginal coverage over A+B |
| Idea2Plan protocol | ADAPT later | Verify repo license before running subset; borrow 5-section template + JudgeEval now (dataset repo 404 as of 2026-08-22 — subset-run BLOCKED, paper-level only) |
| Query decomposition/sufficiency iteration | DEFER | As evaluated experiment only |
| S2AG citation contexts (contrastive-reception discovery) | DEFER (evidence-gated, 2026-08-22 probe spikes/s2ag-probe.mjs: keyless 200 works; intents coverage 0/40 citations, contexts ≤9/20, contrastive hits 0) | Revisit when S2AG intent coverage improves or an API key materially raises citation-context quality; premise (structured contrast intents) does not hold on current data |
| LiteLLM | REJECT (pattern absorbed) | Own provider plane is strong; Python dep incompatible; no silent fallback allowed anyway |
| Temporal / DBOS durable workflow | REJECT (standing) | Persisted state machine passed adversarial audit; adopt only on real requirement failure |
| RO-Crate export envelope | DEFER | Valid enhancement after core-loop fusions; spec status verified in baseline S-005 |

## C. Rejected (with reasons — do not revisit without new evidence)

| Candidate | Reason |
|---|---|
| Google co-scientist full generate-debate-evolve mechanism | No code; most serious open reimplementation (Kaimen, Apache-2.0) measured pipeline-vs-direct Elo gains SIGN-FLIPPING across runs; adopt only its tournament subset (via Robin) |
| Intrinsic self-critique loops (Self-Refine style) absent external signal | Huang ICLR 2024 + CRITIC + arXiv 2607.28576 falsified; agent-theater risk |
| Multi-agent debate as quality mechanism | Smit ICML 2024: no gain at matched sample budget |
| Simulated peer-review committees as truth | Si et al.: all review models ≤53.3% agreement with human accept (≈ random) |
| Pure LLM novelty point-scores as gates | RQ-Bench "novelty illusion" (LLM judges invert expert novelty); IdeaNovel concordant |
| Pointwise 1-10 ranking for final ordering | Pairwise > pointwise replicated; verbosity/style bias |
| HyDE | 2025 re-evaluation: gains were knowledge leakage; fails on unfamiliar domains (FAR-Lab's profile) |
| wink-bm25-text-search | AGPL-3.0 + ~4 years unmaintained |
| MinerU, pymupdf4llm/PyMuPDF | AGPL-3.0 (MinerU confirmed no commercial dual-license); competition product risk |
| nougat | Dormant ~18 months |
| scite.ai | Commercial subscription API |
| S2ORC snapshot route | TB-scale corpus; wrong shape for local app |
| CycleResearcher/CycleReviewer | Requires fine-tuned weights; FAR-Lab is API-based, model-agnostic |
| marker | Code Apache-2.0 but model weights modified OpenRAIL-M with revenue thresholds |
| ResearchAgent code | No LICENSE file — pattern only (refine-weakest-dimension loop absorbed into critique design) |
| AI-Scientist-v2 code/prompt text | Custom NOASSERTION license — mechanism patterns only (ideation conditioning, reviewer ensemble+meta-review) |

## D. Environment facts discovered (2026-08-22)

- OpenAlex `search=` now maps to fulltext-based query (`x_query` shows `fulltext.search` translation) — retrieval semantics broader than title+abstract; verify coverage behavior when touching retrieve.
- OpenAlex keyless polite pool WORKS as of 2026-08-22 01:15 (HTTP 200, real results) — scout-reported "key mandatory" is a production-scale policy, monitor only.
- DeepSeek has NO embedding endpoint (verified) — any embedding route requires a new pluggable provider contract; hence cross-encoder/LLM rerank preferred.
- Semantic Scholar keyless shared pool rate-limits aggressively; free key (1 RPS) recommended before S2AG integration; exponential backoff mandatory.
