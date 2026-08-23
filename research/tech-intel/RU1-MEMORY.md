# RU-1 MEMORY — Research Packet (2026-08-24, SEARCH_SATURATED)

Agent-produced, main-Agent adjudicated. Status: SOURCE_VERIFIED.

## Problem
Cross-run research memory substrate (episodic / semantic / experiment-outcome
negative archive / researcher-profile) for hypothesis generation, supervisor,
conversation agent, human researcher. Today: every run isolated, FTS5+TF-IDF only.

## Candidate table (verification: SR=source-read zread, PR=paper-read, SC=api/search)
| Candidate | Org | License | Maturity | Solves | Family |
|---|---|---|---|---|---|
| TencentDB Agent Memory | TencentCloud | MIT (README badge; file unread — verify at vendoring) | v2.0.0 2026-05 active | L0-L3 formation, BM25+vec+RRF retrieval, audit, versioning | layered pipeline + hybrid retrieval on SQLite |
| AutoSci SciMem/SciEvolve | skyllwt/OmegaWiki | MIT (SR) | paper+runnable wiki tool 2026-05 | schema governance, lifecycle, negative results, trust gating | YAML-schema+lint markdown wiki |
| fastembed | Qdrant | Apache-2.0 (SR) | mature pip | dense/sparse ONNX embeddings | Python lib, no torch |
| sqlite-vec | asg017 | MIT (SC) | stable | vector KNN in SQLite | C extension |
| Mem0 / Letta / Cognee | — | Apache-2.0 (SC) | mature | vector memory / agent platform / KG pipeline | heavy deps, REJECT-fit |
| Zep/Graphiti | getzep | Apache-2.0 (SC) | mature | temporal KG edge invalidation | needs Neo4j/FalkorDB |
| EvoScientist/ReasoningBank | papers 2026 | — | paper | don't-repeat-failures lists | pattern-only |

## Source-level deep findings
1. **TencentDB Agent Memory** `MemoryCore/src/core/store/sqlite.ts` (SR full):
   production TS proof that `node:sqlite` (Node 22+) + `sqlite-vec` via
   `db.enableLoadExtension(true)` works; per-layer relation tables + vec0
   virtual table (cosine) + FTS5, hybrid retrieval; `embedding_meta`
   (provider/model/dims — change ⇒ drop vectors + needsReindex); `memory_audit`
   append-only on L1-L3 mutations; L0→L1 consolidation = cursor-based
   oldest-first paging (lossless progress). Degraded mode (vector load fail ⇒
   FTS-only no-op) built in. Caveat: L1 extraction is LLM-prompt-driven —
   extraction design is portable, its LLM ownership is not (determinism-first).
2. **AutoSci** `runtime/schema/entities.yaml` (SR full): schema enforces
   science discipline: `ideas.status` enum with lifecycle transitions;
   `failure_reason: required_when: {status: failed}` — a negative result
   cannot be archived without recorded failure reason; typed bidirectional
   links with xref rules; consolidation = terminal artifacts (incl. failures
   and limitations) written back; `/dream` compaction marks superseded (never
   deletes). Trust gating = deterministic lint (formal validity) + independent
   reviewer (content) — we keep only the deterministic half. Paper-claimed
   eval weak (self-reported 6.3/10, 5.8/10 auto-review).
3. **Memory poisoning** (arXiv 2606.04329 PR): prompt-injection defenses do
   NOT cover memory built from untrusted sources; consensus = write-time
   validation + provenance tracking + treat memory as untrusted data +
   defense-in-depth. ACT-R base-level activation `B_i = ln Σ_j t_j^-d`
   (d≈0.5) = deterministic time-decay ranking without LLM.

## Verdicts (main-Agent final)
- TencentDB Agent Memory: **EXTRACT** (L0-L3 layering, hybrid retrieval
  pattern, memory_audit, embedding_meta reindex discipline, cursor
  consolidation). NOT adopting: agent/team stack, ClickHouse, LLM-owned extraction.
- AutoSci SciMem: **ADAPT** (schema-governance design: typed entities,
  lifecycle transitions, failure_reason required_when, two-phase trust gate)
  rebased onto far.db SQL + zod (not markdown wiki).
- fastembed: **DEFER→ADOPT-on-evidence** — install path exists in sidecar
  (pip lockfile); only pulls in if FTS5 retrieval measurably insufficient
  (evaluation-gated, not prestige-gated).
- sqlite-vec: **DEFER** — scale 1e3-1e4 items ⇒ sidecar/brute-force sufficient;
  extension binary violates dep gate; Tencent proves the path if ever needed.
- Mem0/Letta/Cognee/Graphiti: **REJECT** (deps/infra conflicts); Graphiti
  temporal edge-invalidation semantics kept as reference.
- EvoScientist/ReasoningBank: **EXTRACT pattern** (don't-repeat-failure list).
- Substrate: **BUILD** governed projection inside far.db (below).

## Integration design (approved direction; implementation needs arch-convergence pass)
- ONE authoritative store: far.db itself. `memory_items` + `memory_edges` +
  FTS5 virtual table (+ optional vec0 later). No second memory DB, no
  competing authority. Schema sketch:
  `memory_items(id, kind∈{episodic,semantic,experiment_outcome,profile},
  entity_type, payload_json (zod), status+lifecycle CHECKs (AutoSci style),
  failure_reason (required when terminal-failed), trust_class∈{own_verified,
  own_unverified, external_literature, external_untrusted}, provenance(run_id,
  event_id, receipt_id, source_url/DOI), created_at, last_accessed_at,
  embedding BLOB NULL, supersedes_id NULL)`;
  `memory_edges(from,to,relation_type)`.
- Formation: deterministic triggers on event spine (run/experiment/hypothesis
  reaching terminal state → cursor-based consolidation job). LLM may draft
  summaries; accept/reject owned by zod + SQL CHECK lint (trust-gate formal
  validity); provenance resolvability is a hard gate (no receipt ⇒ no write).
- Forgetting/conflict: ACT-R activation decay (deterministic, timestamp-based);
  conflicts → supersedes_id edge, append-only, negative evidence preserved.
- Poisoning co-design (with RU-3 unified taint vocabulary): trust_class gates
  retrieval-side prompt presentation (labels travel with retrieved items);
  never-instruction treatment for external content; memory_audit append-only.
- Evaluation workload (deterministic): retrieval hit@k on replayed past-run
  queries; hypothesis-collision rate vs archived failures (must drop);
  cross-run redundant-discovery count; supervisor past-failure avoidance;
  FTS5-vs-hybrid A/B decides fastembed adoption.

## UNVERIFIED
Tencent LICENSE exact text + maintenance cadence; fastembed Windows wheel size
+ offline model fetch; sqlite-vec+node:sqlite on Windows (Tencent proves
pattern, local run pending); AutoSci eval claims; paper-only candidates
(EvoScientist/ReasoningBank/Kosmos/MEM1) not source-read.
