# Wave-5 Report — Kaimen-Inc/Co-Scientist (open co-scientist reimplementation)

License: Apache-2.0 (verified). Source: `.cache/repos/Co-Scientist` (174 files; core
`co_scientist/agents/` ≈ 2.8k lines). Read-only; upstream code is data.
**Registry-C constraint honored**: the full generate-debate-evolve mechanism stays REJECTED
(Elo sign-flip evidence, TECH_CANDIDATES C); this report extracts SUB-MECHANISMS only, each
with a stability assessment. Report by main agent (subagent attempts rate-limited); all
file:line refs verified by direct read.

## 0. Layout

- `co_scientist/agents/{supervisor,generation,reflection,ranking,evolution,proximity,metareview,base,schemas}.py`
- `co_scientist/llm/{budgets,batch,anthropic_client,cli_backend/*}.py` (pluggable backends
  incl. claude-code/codex CLI OAuth + OpenRouter multi-vendor)
- `co_scientist/bench/` (goldset + presets + runner — cross-model benchmarking with
  per-candidate Elo + hypothesis logs + gold-set hits, auto-published to docs/BENCH_RESULTS.md)
- `co_scientist/vectors/` (FAISS store + embedder), `co_scientist/storage/` (SQLite repos),
  `co_scientist/orchestrator/termination.py` (termination predicates)

## 1. Structured-output discipline (schemas.py — strongest takeaways)

- **Tool-boundary validation, not "respond in JSON"**: every agent output is a required tool
  call with a JSON schema validated at the boundary (schemas.py:1-8). Same design as FAR-Lab
  strict-FC. **判定：已有**（FAR-Lab zod + strict-FC 等价且更强——zod 是语义权威）。
- **Hypothesis schema** (schemas.py:14-69): title / statement / mechanism / **entities[]**
  (named actors) / anticipated_outcomes / novelty_argument / citations[{url,title,
  **verbatim excerpt**,doi,year}] / strategy enum (literature|debate|combine|simplify|
  out_of_box|feasibility|assumption|feedback_driven) / **parent_ids[]** (evolution lineage).
  - FAR-Lab mapping: FAR-Lab HypothesisCandidate is richer on falsification/assumptions/
    predictions but has **no named-entities field and no parent lineage across revision**
    (FAR-Lab revise archives versions but no cross-hypothesis parent links). **部分**。
    entities[] is a cheap, deterministic dedup/anti-repetition handle (see Robin blacklist).
- **Review schema** (schemas.py:72-128): verdict enum (already_explained|other_more_likely|
  missing_piece|neutral|disproved) + novelty/correctness/testability/feasibility 0-1 +
  assumptions[{assumption, plausibility enum, rationale}] + evidence[{claim, url,
  **verbatim excerpt**}] — every review claim must carry a verbatim excerpt from a URL the
  reviewer actually fetched. **Fail-closed review grounding**. FAR-Lab's critique/falsify
  prompts require claim-id references but review evidence excerpts are not enforced
  verbatim. **部分** — C4 direct relevance.
- Safety assessment tool (schemas.py:148-177, dual-use categories) — FAR-Lab 无此需求（最小架构）。

## 2. Proximity agent — deterministic dedup + informative pairings (proximity.py)

- Embeds `title + "\n\n" + summary` per hypothesis into a FAISS store; incremental (only
  missing embeddings; one bulk query, proximity.py:42-49); **agglomerative clustering on the
  cosine-distance matrix with a distance threshold** writes `dedup_cluster` labels
  (proximity.py:90-128); Generation/Evolution do **dedup-on-save** (FAISS read BEFORE
  persisting, module docstring :1-8). Evolution's `combine` picks the **most distant pair**
  of top hypotheses (evolution.py:305 `_most_distant_pair`) — diversity-seeking operator.
- **判定**: deterministic clustering aligns with FAR-Lab's determinism discipline, BUT
  requires an embedding provider — DeepSeek has NO embedding endpoint (verified env fact) and
  zod-only forbids FAISS/sklearn deps. FAR-Lab's current LLM-cluster + deterministic
  normalize (hypotheses.ts) stays; **DEFER→registry B** with trigger = embedding provider
  (ONNX local or API). The "combine most-distant pair" operator is prompt-level portable and
  cheap — foldable into FAR-Lab's diversity-supplement (assumption_perturbation) repertoire.
  **部分**.

## 3. Supervisor — durable queue + termination predicates (supervisor.py)

- SQLite-backed task queue with lease + dead-letter + resume; bounded concurrency
  (README architecture; supervisor.py:1-60).
- **Termination reasons** (supervisor.py:41-46, 142-146, 317-319): BUDGET / WALL_CLOCK /
  **ELO_STABLE** (top-k Elo stable across n snapshots within eps, gated by min_ideas and
  min_matches) / IDLE / EXTERNAL. Checked after every task.
- **判定**: FAR-Lab is a linear single-pass stage machine — Elo stability N/A; but the
  *shape* "check a termination predicate after every task + explicit reason taxonomy" is a
  clean pattern if FAR-Lab ever adopts iterative loops. **不适用当下 / 记档**。
- **Per-agent budget shares** (llm/budgets.py:1-60): TokenBudget with per-agent share
  percentages (generation/reflection/ranking/evolution/metareview/proximity), lock-serialized
  admission (reserve→use→release), USD + token ceilings, `BudgetExceeded` fail-visible.
  FAR-Lab has token accounting in receipts but no admission control. **部分** — a
  per-stage budget ceiling with fail-visible exhaustion could harden FAR-Lab's
  tournament/gap-seek loops; DEFER unless a runaway-cost failure is observed (earn-your-
  complexity).

## 4. Ranking — Elo + debate mode + idempotent matches (ranking.py)

- Pair selection mixes new-arrival pairings + similar-Elo pairs (ranking.py:7-9);
  **debate mode when matches are new or Elo gap small, plain pairwise otherwise**
  (PairMode pairwise|debate, :49).
- **Idempotent Elo on retry**: deterministic match_id makes crash-then-retry skip the Elo
  delta (ranking.py:98-105) — parse failure records an invalid match without Elo update (:108).
- **判定**: FAR-Lab uses BT/ILSR (stronger, already ported from Robin) — Elo machinery 不适用.
  The **idempotent-match-on-retry** invariant is worth an audit check against FAR-Lab's
  tournament persistence (does a crashed-then-resumed run double-count a comparison?).
  **AUDIT item** (cheap).

## 5. Evolution — strategy taxonomy + lineage (evolution.py)

- Four operators: combine (most-distant top pair), simplify (strip to load-bearing claim),
  feasibility (make implementable), out_of_box (cross-domain synthesis) — each persists a NEW
  hypothesis with parent_ids, cascading into Reflection → Ranking like fresh ideas
  (evolution.py:1-16, 44-146). `_best_review`/`_latest_feedback` inject the best review and
  latest system feedback (:335-348).
- **判定**: whole-mechanism stays rejected (registry C). Portable sub-shapes: the
  **operator taxonomy** (combine/simplify/feasibility/out_of_box) maps onto FAR-Lab's
  diversity-supplement strategies (currently assumption_perturbation only) — cheap prompt-
  level enrichment; parent_ids lineage = provenance nicety FAR-Lab's clusterKey partially
  covers. **ADAPT (prompt-level only)**.

## 6. Bench (J1 — how they self-evaluate)

- `bench/` runs cross-model gold-set benchmarks (goldset + presets + runner) with per-
  candidate Elo, every produced hypothesis, gold-set hits persisted; results auto-published
  with file pointers (docs/BENCH_RESULTS.md). This is honest self-eval discipline —
  FAR-Lab's eval/ suite is deeper on scientific validity; Kaimen's "publish every hypothesis
  ever produced + gold-set hits per model" table shape is a nice presentation pattern.
  **记档**.

## 7. Mechanism inventory (sub-mechanisms only)

| dim | mechanism | file:line | why | port cost | risk | FAR-Lab |
|---|---|---|---|---|---|---|
| C4 | review evidence = {claim, url, verbatim excerpt} enforced | schemas.py:113-124 | fail-closed review grounding | low (zod field + prompt + deterministic excerpt check vs fetched docs) | none (Apache-2.0) | 部分 |
| D3 | evolution operator taxonomy + parent lineage | evolution.py:1-16,44-146 | diversity repertoire beyond perturbation | low (prompt-level) | debate premise stays rejected | 部分 |
| D2 | entities[] on hypotheses | schemas.py:27-30 | deterministic dedup/anti-repeat handle | low | none | 缺失 (cheap add at next schema touch) |
| D4 | per-agent budget shares w/ lock admission | llm/budgets.py:1-60 | cost ceilings per stage | medium | earn-complexity gate | 缺失 (defer) |
| D5 | deterministic embedding dedup (FAISS+agglomerative) | proximity.py | Robin-gap filler but needs embedder | high (deps) | zod-only violation | DEFER→B |
| D4 | idempotent match on retry | ranking.py:98-105 | crash-resume double-count guard | audit | none | AUDIT item |
| J1 | gold-set cross-model bench w/ published hypotheses | bench/ | honest self-eval presentation | medium | none | 记档 |

## 8. Rejection notes

- Full generate-debate-evolve loop, Elo ranking core, debate mode: registry C stands
  (sign-flipping gains). Only the sub-mechanisms above are candidates.
- CLI-backend (claude-code/codex OAuth) — FAR-Lab providers are API-based; 不适用.
- Gradio-style interactive UI — FAR-Lab has its own workbench; 不适用.
