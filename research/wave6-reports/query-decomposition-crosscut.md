# Wave-6 scout report: Query decomposition / rewriting crosscut

Date: 2026-08-22. Mission: collect evidence to revisit the deferred registry decision
`research/TECH_CANDIDATES.md:46` — "Query decomposition/sufficiency iteration | DEFER | As evaluated
experiment only". One local repo read (upstream code = DATA, never executed) + paper-level research.

**TL;DR.** The decomposition/rewriting literature splits cleanly: (a) *multi-query expansion +
rank fusion* has the strongest positive evidence (including a 2026 industry-grade re-evaluation
with CIs, replicated inside the local repo), but the lift concentrates in recall-scarce regimes and
requires enough rewrites (N≥3) and a lexical channel — single-rewrite vector-only fusion is a wash;
(b) *pseudo-document methods* (query2doc/HyDE) are poisoned by the knowledge-leakage re-evaluation
(2504.14175) that already drove FAR-Lab's D-019 HyDE rejection, and are inapplicable anyway —
OpenAlex/arXiv/Crossref take keyword phrases, not documents; (c) *sub-question decomposition /
iterative interleaving* is multi-hop-QA machinery whose 2025 re-evaluations say decomposition alone
adds noise requiring reranking, and production stacks ship it off by default. FAR-Lab's current
pipeline already sits in the strong configuration the evidence favors (multi-list pool, N=3-4
distinct purpose queries × 3 lexical-ish keyword families, RRF k=60 + rerank + counter quota), so
the remaining upside is marginal reshaping, not a missing family. Recommended: one evaluate-first
candidate (purpose-aware expansion inside the existing single planning call + offline
purpose-weight RRF replay), reject the new-stage iterative re-query, weak evaluate-first on
goalType-conditional plan shapes.

---

## 1. Local source inventory: Raudaschl/rag-fusion (MIT)

Path: `C:\Users\RichardYuan\Desktop\new\.cache\repos\rag-fusion`. The local copy is a fork of the
reference implementation of the RAG-Fusion blog technique, extended with a full 2026 replication
experiment (§1.3).

### 1.1 Multi-query generation

- `main.py:22-41` `generate_queries_chatgpt(original_query, diverse=False)`:
  - Default prompt (`main.py:32-34`): system "You are a helpful assistant that generates multiple
    search queries based on a single input query" + user "Generate multiple search queries related
    to: {q}" + "OUTPUT (4 queries):".
  - Diversity variant (`main.py:26-28`, `diverse=True`): "Generate diverse search queries that
    explore different aspects… Each query should target a different angle: use synonyms, vary
    specificity (broader/narrower), and consider related sub-topics. Avoid generating queries that
    are just minor rewordings of each other."
  - **Count: fixed at 4** (both variants).
  - **Dedup: none.** Parsing is a naive newline split (`main.py:40`). Exact-duplicate query strings
    collapse only implicitly as dict keys in the results map (`main.py:140-145`); there is no
    semantic or near-duplicate dedup anywhere in the repo. The rag-fusion eval variants
    (`eval/retrieval.py:50-92`) inherit this.
  - Original query is always searched alongside the 4 generated ones (`main.py:141-142`), i.e.
    effective N=5 lists.
- Model called: `gpt-5.1-chat-latest` (`main.py:37`) — the fork was modernized past the original
  `gpt-3.5-turbo`.

### 1.2 Reciprocal Rank Fusion

- `main.py:79-101` `reciprocal_rank_fusion(search_results_dict, k=60, query_weights=None)`:
  - **k constant: 60** (default parameter, `main.py:79`) — the SIGIR-2009 Cormack standard.
  - **Score formula** (`main.py:90-94`): for each list, sort by score desc, then
    `fused_scores[doc] += weight * 1/(rank + k)` where `rank` is **0-based** (`enumerate`) and
    `weight` defaults to 1.0 (`main.py:89`). This is an **off-by-one vs the canonical
    1/(k + r_1based)**; with k=60 the distortion is negligible but real.
  - Supports **query weights** (`query_weights`), used by the eval variant
    `rag_fusion_weighted_retrieve` (`eval/retrieval.py:71-80`) with weight **3.0 on the original
    query** to anchor the plan to user intent.
- Comparison point — FAR-Lab is canonical: `src/pipeline/stages/retrieve.ts:163-164`
  `rrfScore = sum 1/(RRF_K + rank + 1)` with 0-based rank ≡ 1/(60 + r_1based).

### 1.3 The embedded 2026 re-evaluation (the most decision-relevant local evidence)

`experiments/arxiv-2603-02153-replication/README.md` replicates arXiv 2603.02153v1 ("Scaling RAG
Fusion: Lessons from an Industry Deployment", March 2026) — an industry paper claiming RAG-Fusion
gains "evaporate" after cross-encoder reranking + Top-K truncation. Replication on NFCorpus (BEIR,
biomedical), n=200, paired-bootstrap CIs, three rerankers. Note the README's own disclosure (line
32): the replicator authored the original 2024 RAG-Fusion article (stake disclosed; design gives
the critique a fair shot).

Positive evidence (strong variant = BM25+vector per query × LLM rewrites → RRF → rerank):
- `hybrid_diverse+rerank` NDCG@10 **+0.021 [+0.007, +0.036]** over baseline+rerank; significant on
  all difficulty buckets; survives all three rerankers (bge-base +0.023, FlashRank +0.014,
  bge-large +0.021, CIs exclude zero; README:79-87).
- LLM-judge answer quality: mean 1.17 vs 1.07, W/T/L 25/164/11 (README:212-216) — the lift survives
  into answers, and the "diverse context confuses the synthesizer" failure mode (vector-only, rich
  queries: net −8) is eliminated by the lexical channel (README:216-218).
- Deployment preconditions (README:248-254): terminology mismatch between query and corpus;
  recall > precision; downstream consumer handles breadth; **hybrid (lexical+semantic) channel
  mandatory**.

Negative/cautionary evidence (same file):
- **Vector-only fusion is a wash** (+0.005, CI crosses zero) and net-negative on rich queries at
  answer level (README:59, 203).
- **N=1 rewrite (the industry paper's config) shows no lift** (−0.011 CI crosses zero); lift needs
  N≈3-4, plateauing ~+0.010 NDCG@10 (README:107-117, 237).
- Lift does not grow with pool size (flat-to-decreasing, README:95-105).
- Small loss tail remains (6%) → **adaptive routing** (fire expansion only on a weakness signal) is
  the recommended production shape (README:239, 273-281).
- Wall-clock: the rewrite LLM call is structurally serial, +600-1500 ms p50 before any retrieval
  (README:299-311).
- Fit boundaries (README:265-271): skip on tiny/curated corpora, code/identifier search, structured
  data; skip when latency budgets are sub-second. **FAR-Lab's regime — specialist scholarly
  literature, recall-dominated, async analytical workflow — is named as fusion's strongest fit
  case** (README:258, 326).

---

## 2. Paper-level mechanism inventory

All arXiv ids verified against abstract pages on 2026-08-22. Evidence graded: [+] positive, [−]
negative/mixed, [~] applicability caveat.

### A. Multi-query expansion + rank fusion (RAG-Fusion family)
- **2402.03367** "RAG-Fusion: a New Take on Retrieval-Augmented Generation" (Zackary Rackauckas;
  unpublished/Infoneon whitepaper). 4 GPT-generated queries per user query, RRF (k=60) fusion,
  vector search; evaluated **manually on an internal product-info assistant** (accuracy/relevance/
  comprehensiveness), no public benchmark, no CIs. [+] mechanism; [−] evidence class is weak — do
  not cite as empirical proof.
- **2406.18960** "A Surprisingly Simple yet Effective Multi-Query Rewriting Method for
  Conversational Passage Retrieval" (Kostric & Balog, SIGIR 2024). [+] Combining retrieval results
  from **multiple rewrites of the same utterance beats selecting a single best rewrite**, at almost
  no extra compute — direct support for fusing a query *set* rather than picking one. Follow-up
  2026.eacl-long.383 (Abbasiantaeb, EACL 2026) extends to multi-aspect query generation [+].
- **2411.13154** "DMQR-RAG: Diverse Multi-Query Rewriting for RAG" (Li et al., EMNLP 2024
  Findings). Rewriting at four information levels; adaptive selection strategy minimizes number of
  rewrites. [+] diverse rewrites help both retrieval and generation; [+] cost-aware selection —
  i.e., *not all queries need all variants*.
- **2603.02153 + local replication** (§1.3): the full positive/negative picture with CIs.
- Applicability to FAR-Lab: **direct** — this is the family FAR-Lab already implements
  (purpose-diverse queries × families × RRF k=60). Open question is only shape/count/weight.

### B. Pseudo-document expansion (query2doc / HyDE)
- **2303.07678** "query2doc: Query Expansion with Large Language Models" (Wang, Yang, Wei; EMNLP
  2023). Appends LLM-generated pseudo-documents to the query; [+] BM25 +3-15% on MS MARCO/TREC DL;
  also helps dense. Mechanism: query disambiguation via LLM knowledge.
- **2504.14175** "Hypothetical Documents or Knowledge Leakage? Rethinking LLM-based Query
  Expansion" (Yoon et al., ACL 2025 Findings). [−] **Causal re-evaluation: query-expansion gains
  via LLM-generated documents occur only when the LLM already knows the claim** (entailed by gold
  evidence); outside-knowledge settings show no improvement. This is the same evidence class that
  drove FAR-Lab's D-019 HyDE REJECT (`.control/DECISIONS.jsonl` D-019).
- Applicability to FAR-Lab: **structurally inapplicable** — OpenAlex/arXiv/Crossref search endpoints
  take keyword/phrase queries (title-abstract-term matching, fielded search), not embedded
  documents. Both the mechanism and the leakage confound argue against. **Family verdict: reject.**

### C. Step-back prompting (abstraction-then-reasoning)
- **2310.06117** "Take a Step Back: Evoking Reasoning via Abstraction in Large Language Models"
  (Zheng et al., ICLR 2024). Generates a higher-abstraction "step-back question" + concepts before
  answering; [+] MMLU Physics/Chemistry +7%/+11%, TimeQA +27%, MuSiQue +7% (PaLM-2L, some with
  retrieval).
- [~] It is primarily a *reasoning-time* technique; its retrieval-side use (broader query for
  context gathering) maps onto what FAR-Lab's `discovery` slots already do ("map the field
  broadly", `retrieve.ts:54`). FAR-Lab equivalent exists; marginal value is in varying the
  specificity axis (rag-fusion's diverse prompt names broader/narrower explicitly,
  `main.py:26`), not in a new mechanism.

### D. Sub-question decomposition / iterative interleaving
- **1906.02916** DecompRC (Min et al., ACL 2019): decompose multi-hop question into sub-questions
  answered by single-hop readers, rerank decomposition candidates. [+] on HotpotQA-era tasks;
  [~] **supervised**, decomposition-specific reranker — not a zero-shot recipe.
- **2212.10509** IRCoT (Trivedi et al., ACL 2023): interleave retrieval with CoT reasoning;
  [+] up to +21 retrieval / +15 QA points on multi-hop benchmarks; reduces hallucination.
  [~] multi-hop QA with gold-decomposable questions; costs multiple sequential LLM+retrieval
  rounds.
- **2507.00355** "Question Decomposition for RAG" (Chazan et al., ACL SRW 2025). [~] decomposition
  **assembles complementary documents, but introduces irrelevant passages — reranking is required
  to control the noise** (HotpotQA/MuSiQue).
- **2510.18633** "Query Decomposition for RAG: Balancing Exploration-Exploitation" (Petcu et al.,
  2025). [~] naive/static decomposition is suboptimal; dynamic selection of which sub-queries to
  pursue (rank + judgment signals) yields ~35% document-precision gains — i.e., *selection* is
  where the value is, not decomposition itself.
- Production signal: **NVIDIA RAG Blueprint ships query decomposition disabled by default**,
  recommended only for multi-hop use cases (docs.nvidia.com/rag/2.3.0/query_decomposition.html).
- Applicability to FAR-Lab: FAR-Lab questions are research hypotheses, not compositional lookup
  chains; there is no gold decomposition, and the noise-then-rerank cost lands on an LLM rerank
  call FAR-Lab already runs under wall-clock pressure. The *iterative* variant (IRCoT-style
  sufficiency loop) is the deferred registry item.

### E. Multi-query + self-consistency
- No dedicated paper found that applies self-consistency voting at the *query* level for retrieval
  (searched 2024-2026; closest: AirRAG 2501.10053 uses generation diversity + self-consistency
  inside agentic exploration; 2505.09031 combines CoT+RAG+SC at the *answer* level). Honest state:
  this sub-family is **under-evidenced**; treat as unproven, not as support.

### F. LLM query generation for scholarly keyword engines (FAR-Lab's actual interface)
- **2302.03495** "Can ChatGPT Write a Good Boolean Query for Systematic Review Literature Search?"
  (Wang, Scells et al., 2023). [+] LLM-generated Boolean/keyword queries for PubMed are effective
  *as a starting point*; human refinement still needed — the direct scholarly-search analogue of
  FAR-Lab's planning call.
- Adam et al., JAMIA Open 2024: LLM mapping review descriptions → Boolean queries, with datasets
  for train/eval. [+] feasibility.
- Reed et al., JMLA 2025 pilot: ChatGPT-produced PubMed Boolean strings are usable but
  quality-inconsistent. [~]
- **Lieberum et al. 2025 scoping review** (37 studies; cited 183): LLMs for systematic-review
  conduct "on the rise, but **not yet ready for use**" — searching is one of the three main tested
  areas, with reliability the open issue. [−] caution for trusting unsupervised LLM query plans.
- Net: LLM keyword-query generation for scholarly engines is real but needs **deterministic
  structure and verification around it** — which is exactly FAR-Lab's design (zod schema, R-05
  regex, receipts). This family supports *constrained* expansion inside a validated schema, not
  free-form iteration.

---

## 3. FAR-Lab current state and gap analysis

`src/pipeline/stages/retrieve.ts` (read in full, 465 lines):
- ONE planning call → fixed schema: discovery×2, supporting×1-2, counter×2
  (`retrieve.ts:23-34`); counter vocabulary regex-enforced R-05 (`:42-50`, `:131-138`); prompt
  demands keyword phrases, no boolean/quotes, no invented entities (`:52-60`).
- Every planned query × 3 families × limit 6: counter[0]→OpenAlex, counter[1]→arXiv; discovery/
  supporting → all three families (`:111-128`) → **11-14 searches per run**.
- Fusion: RRF k=60 canonical (`:163-164`), deterministic tie-breaks (`:170-181`), LLM listwise
  rerank over top-24 only under cap pressure (`:393-422`), cap 12 with counter-min-seats 4
  (`:189-207`).
- Searches run **sequentially** (`:307-372`) — wall-clock scales linearly with query count.
- D-029b constraint in-code (`:106-109`): OpenAlex keyless now has a hard daily budget
  ("Insufficient budget… Resets at midnight UTC", live-observed); Crossref added 2026-08-22 as the
  stable third family.

North-star context (`eval/north-star.json`):
- `retrieval-verified-rate` 0.9667 → target 0.98 / stretch 0.995 (`:47-53`). **The entire residual
  gap is one run**: P5 in `eval/results/metrics-ev1.json:412-422` — 12/15 sources verified (0.8),
  **0 claims, 0 relations, no plan** — a degenerate run shape, not a query-diversity failure. No
  evidence today attributes any verify-rate failure to insufficient decomposition.
- `counter-evidence-substantive-hit` **null (metric not yet defined)** → 0.7/0.85 (`:54-61`) — the
  metric a better counter-query mix would plausibly move first.
- `run-wall-clock` 6-8 min typical → p50 ≤6 min hard (`:70-77`). Each added planned query = +3
  sequential searches ≈ +3-9 s; a re-query round (planning call + 6-15 searches + rerank) ≈ +30-90 s
  — material against a 360 s budget that already runs hot.
- `rediscovery-mean-f1` 0.58 → 0.7 (`:6-13`) — the other metric retrieval-side improvements could
  move (more/better sources → more rediscoverable findings).

Position vs evidence: FAR-Lab already runs the configuration the 2026 replication identifies as the
strong variant — multiple purpose-diverse queries (N=3-4 effective lists after dedup), three
lexical-leaning keyword families (≈ the BM25/hybrid channel role for scholarly engines), RRF k=60,
rerank-after-fusion ordering, quota protection. What it does NOT have from the evidence-backed
menu: (i) explicit diversity axes instruction (synonyms/specificity/sub-topics, `main.py:26`);
(ii) purpose-weighted RRF (original-query weight 3.0, `eval/retrieval.py:71-80`) — FAR-Lab uses
seat quotas instead of score weights; (iii) any weakness-triggered (adaptive) second round.

**Offline evaluation enabler (key finding):** every run persists per-(query, family) receipts with
`contentHashes` in rank order (`retrieve.ts:314-326`, records enumerated by rank at `:327`). The
full pool + multi-list rank structure is therefore reconstructible from archived runs, so **any
fusion-side change (purpose weights, k, cap, quota, rerank cutoff) can be A/B-replayed
deterministically with zero API calls and zero LLM calls** (LLM live routes currently blocked by
DeepSeek 402; OpenAlex keyless daily budget makes query-side live A/B expensive). Query-text-side
changes (new/rewritten queries) cannot be replayed offline — they need a small live fixture set
when a model route is funded. Downstream metric movement (counter-hit) can then be estimated with
the D-037 judge v2 deterministic TF-IDF layer on archived claim sets.

---

## 4. Candidate designs (3)

### C1. Purpose-aware multi-query expansion inside the existing single planning call
(evaluate-first; lean ADOPT-candidate if gate passes)

**Design.** Keep ONE planning call and the deterministic schema shape. Two sub-parts, separable:
- **C1a (fusion-side, zero-API offline-testable NOW):** purpose-weighted RRF — counter_evidence
  lists get weight w>1 (or supporting<1) in `rrfScore`, as a *complement* to (or replacement of)
  seat quotas, mirroring `eval/retrieval.py:71-80` (weight 3.0 on the anchored query). Replayed
  offline over archived receipts.
- **C1b (plan-side):** extend the prompt with the rag-fusion diversity instruction (synonyms /
  broader-narrower specificity / distinct sub-topics; `main.py:26`) and optionally widen
  `supporting` to exactly 2 (from 1-2) with a required specificity contrast. Discovery stays 2,
  counter stays exactly 2 (R-05 invariant preserved). Effective lists ≈ current +1-2.

**Expected mechanism → metric path.** More angle coverage per purpose → larger multi-list pool →
higher-ranked counter/supporting docs at cap. Path: pool composition → counter-origin documents
surviving cap AND relation-judging as genuine counter signal (`counter-evidence-substantive-hit`
null→0.7) → rediscovery F1 via more rediscoverable findings. Verify-rate path is **weak** — the one
0.8 run is a degenerate-run failure, not a query failure; claim honestly.
**Cost.** C1a: zero (deterministic replay). C1b: +1-2 queries × 3 families = +3-6 sequential
searches/run (≈ +3-18 s wall-clock; +1-2 OpenAlex calls/run against the keyless daily budget),
zero extra LLM calls.
**Risk.** Wall-clock regression (hard gate) — bounded by the +3-6 search count, measured before
adoption; pool dilution pushing counter docs below the rerank cutoff (2507.00355's noise finding)
— mitigated by C1a weights + existing quota floor; OpenAlex budget burn.
**Offline/deterministic evaluation.** C1a: receipts-replay A/B over all archived runs (selected
corpus diff, counter-seat retention, counter-origin rank distribution) + D-037 deterministic
matcher for downstream estimate. C1b: needs a funded model route for the planning call + a small
live fixture (5-10 questions), evaluated with the wave's deterministic retrieval-quality baseline
harness (wave prompt precondition) — compare pool size, counter-hit proxy, wall-clock delta.
**Evidence gate.** ≥5% improvement on counter-evidence-substantive-hit (or rediscovery F1) with
zero north-star regression (wall-clock p50 ≤6 min, verify-rate ≥0.9667) on ≥5 archived/fixture
runs; C1a alone may proceed on offline replay + one live confirmation run when a route is funded.

### C2. Iterative sufficiency re-query after the evidence stage (new stage)
**Design.** After extract/relation stages, an LLM sufficiency judge proposes gap queries
(discovery/supporting/counter), runs another retrieve round, merges pools, re-fuses.
**Verdict: REJECT now (keep DEFER with sharpened trigger).** Reasons: (i) no demonstrated failure
class — the only sub-0.98 verify-rate run is degenerate (P5: 0 claims, no plan), not
sufficiency-limited; (ii) evidence against naive iteration: 2507.00355 (decomposition adds noise
needing rerank), 2510.18633 (static decomposition suboptimal; value is in *selection*), NVIDIA
default-off; (iii) cost: +1-2 LLM calls + 6-15 searches + rerank ≈ +30-90 s against a hard 360 s
p50 gate; (iv) new stage + merge semantics = architecture surface (workspace constitution §5:
every addition must earn its complexity). **Sharpened DEFER trigger:** ≥3 live runs where a
documented evidence gap (e.g. zero non-low rerank counter docs, or claim-level UNVERIFIED sources
traceable to query blind spots) is attributed to query insufficiency — then run it as the registry
already demands: "as evaluated experiment only", ideally in the adaptive-routing shape the 2026
replication recommends (fire only when a cheap weakness signal trips, README:273-281).

### C3. Question-type-conditional plan shapes (goalType/scope → query mix)
**Design.** `ctx.run` already carries `goalType`/`scope` into the planning payload
(`retrieve.ts:283-294`). Condition the plan on it: e.g. mechanism-questions get a methods-vocabulary
discovery query; effect/intervention questions get per-population/per-outcome supporting queries;
comparison questions get per-entity supporting queries; recent-claim questions get recency-tilted
counter vocabulary. Schema shape (2/1-2/2) and R-05 stay invariant — only prompt-level conditioning
plus optional per-goalType vocabulary hints.
**Expected mechanism → metric path.** Better lexical alignment between question type and scholarly
index vocabulary → supporting/counter precision → counter-hit and rediscovery F1; no effect on
verify-rate expected.
**Cost.** Zero extra searches, zero extra LLM calls; only prompt/schema-hint complexity.
**Risk.** Low: worst case is neutral prompt change; main risk is schema variance breaking the
fixed shape — keep `.length()` invariants and R-05 untouched.
**Offline/deterministic evaluation.** Cannot be replayed offline (changes query text); evaluate on
the live fixture set with C1b, same gate. Unit-testable determinism: plan-shape validator per
goalType against recorded question set.
**Verdict: evaluate-first** (lower priority than C1; piggyback on the same fixture run — no
separate experiment needed).

### Explicitly not candidates
- **query2doc/HyDE pseudo-documents**: inapplicable interface (keyword engines) + leakage re-eval
  (2504.14175) + D-019 precedent. Reject.
- **Step-back as a separate mechanism**: FAR-Lab discovery slots already implement the abstraction
  axis; fold "vary specificity" wording into C1b instead.
- **Query-level self-consistency voting**: no supporting evidence found; do not build.

---

## 5. Verdict summary

| Candidate | Verdict | Evidence gate |
|---|---|---|
| C1a purpose-weighted RRF | **evaluate-first (offline NOW), highest evidence-per-cost** | Receipts-replay A/B on all archived runs: counter-seat retention / counter-origin rank ≥5% better, selection diff explained, zero selection regressions on non-counter docs; one live confirmation when model route funded |
| C1b diversity-instruction + supporting→2 | **evaluate-first, lean ADOPT-candidate** | ≥5% counter-evidence-substantive-hit or rediscovery-F1 gain on ≥5-run live fixture; wall-clock p50 ≤6 min; verify-rate ≥0.9667 |
| C2 sufficiency re-query stage | **REJECT now; DEFER with sharpened trigger** | Trigger: ≥3 live runs with query-insufficiency-attributed documented evidence gaps; then experiment-only, adaptive-routing shape |
| C3 goalType-conditional shapes | **evaluate-first (weak, bundled with C1b fixture)** | Same fixture gate as C1b; zero-cost bundling |
| Pseudo-doc expansion (query2doc/HyDE) | **REJECT** (interface + leakage + D-019) | New primary evidence only |

Registry recommendation: keep `research/TECH_CANDIDATES.md:46` DEFER for C2 (with the sharpened
trigger above), and register C1a/C1b as the evaluated experiment the deferral already requires —
C1a is executable offline today (zero API/LLM dependency) and therefore the correct first move for
this wave's "deterministic retrieval-quality baseline first" precondition.

## Sources

- Local repo (read-only): `C:\Users\RichardYuan\Desktop\new\.cache\repos\rag-fusion` — `main.py`,
  `eval/retrieval.py`, `experiments/arxiv-2603-02153-replication/README.md` (+ `results/`).
- FAR-Lab: `src/pipeline/stages/retrieve.ts`, `eval/north-star.json`,
  `eval/results/metrics-ev1.json`, `research/TECH_CANDIDATES.md:46`,
  `.control/DECISIONS.jsonl` (D-019, D-029, D-037).
- Papers: [2303.07678](https://arxiv.org/abs/2303.07678) query2doc (EMNLP 2023);
  [2310.06117](https://arxiv.org/abs/2310.06117) step-back (ICLR 2024);
  [2212.10509](https://arxiv.org/abs/2212.10509) IRCoT (ACL 2023);
  [2402.03367](https://arxiv.org/abs/2402.03367) RAG-Fusion (Rackauckas);
  [1906.02916](https://arxiv.org/abs/1906.02916) DecompRC (Min et al., ACL 2019);
  [2406.18960](https://arxiv.org/abs/2406.18960) Kostric & Balog (SIGIR 2024);
  [2411.13154](https://arxiv.org/abs/2411.13154) DMQR-RAG (EMNLP 2024 Findings);
  [2504.14175](https://arxiv.org/abs/2504.14175) HyDE knowledge leakage (ACL 2025 Findings);
  [2507.00355](https://arxiv.org/abs/2507.00355) question decomposition for RAG (ACL SRW 2025);
  [2510.18633](https://arxiv.org/abs/2510.18633) exploration-exploitation query decomposition;
  [2302.03495](https://arxiv.org/abs/2302.03495) ChatGPT Boolean queries for SRs (Wang, Scells);
  Lieberum et al. 2025 scoping review (LLMs for systematic reviews, "not yet ready");
  [NVIDIA RAG Blueprint: query decomposition](https://docs.nvidia.com/rag/2.3.0/query_decomposition.html);
  arXiv 2603.02153v1 via local replication README.
