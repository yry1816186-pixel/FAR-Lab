# Wave-6 Scout · assafelovic/gpt-researcher (main-agent read)

Apache-2.0 (LICENSE verified). Read by main agent (subagent route rate-limited 3×).
Upstream code treated as DATA only. Focus: orchestration/evaluation mechanisms — its
retrieval backends (tavily/serper/…) are API-bound and out of scope for FAR-Lab.

## Mechanisms (file:line → gpt_researcher/…)

| # | mechanism | source | what it does | value for FAR-Lab | cost | risk | FAR-Lab mapping |
|---|---|---|---|---|---|---|---|
| 1 | breadth×depth recursive deep-research loop | skills/deep_research.py:378-560 (`deep_research`), defaults `breadth=4, depth=2, concurrency=2` (:243-246) | Each level: generate breadth queries → run nested researchers → extract learnings+followUpQuestions → recurse with `new_breadth = max(2, breadth//2)`, `depth-1` (:530-532) | The canonical query-tree descent shape; breadth-halving is a cost-control primitive | medium | Web-page reading dependency (its nested researchers scrape URLs); LLM-heavy (strategic+smart+fast model split) | partial (single-level plan; no descent) |
| 2 | query + researchGoal pairs | skills/deep_research.py:260-276 (`generate_search_queries` prompt), parsed :92-115 | Each generated query carries an explicit research goal; goals drive next-level query synthesis (:539-543 `next_query = Previous research goal + Follow-up questions`) | Goal-conditioned queries give the descent direction; portable to our plan schema | small | none (prompt-shape only) | missing |
| 3 | learnings + citations + followUpQuestions extraction | skills/deep_research.py:331-371 (`process_research_results`), dual-format parse :124-176 (JSON → line-regex fallback) | Per-level LLM pass turns raw results into (insight, sourceUrl) pairs + next questions; citations keyed per learning | Structured intermediate compression with per-insight citation binding; our zod strict-FC replaces their dual-parse tolerance chain | small | LLM-only (blocked live now) | partial (evidence cards bind claims, not learnings) |
| 4 | all-branches-failed stop guard | skills/deep_research.py:504-520 (#1579) | If every branch at a level fails (bad key/offline), STOP descent instead of endlessly generating follow-ups from empty learnings | Same class as our fail-closed retrieval; good defensive pattern for any future iterative retrieval | small | none | have (equivalent semantics in `retrieve` all-failed abort) |
| 5 | word-budget context trim (25k words, keep most recent) | skills/deep_research.py:222-239 (`trim_context_to_word_limit`), MAX_CONTEXT_WORDS=25 (:17) | Deterministic word-count budget; iterates reversed(context) keeping most-recent-first, first-overflow item hard-truncated then break | Deterministic (non-LLM) budget primitive; same spirit as our abstract-excerpt caps | small | loses old context silently (we prefer visible truncation notes) | partial (fixed excerpt caps, no global budget arithmetic) |
| 6 | SourceCurator (LLM source ranking) | skills/curator.py:15-100 | LLM ranks/curates retrieved sources by credibility+relevance before writing (CURATE_SOURCES gate) | Same role as our listwise rerank (D-015 already covers) | — | LLM-only | have (superseded by our rerank+counter-seats) |
| 7 | semaphore-bounded query concurrency | skills/deep_research.py:423-431 (`asyncio.Semaphore(concurrency_limit)`) | Bounds parallel nested researchers (default 2) | Concurrency discipline for multi-family searches (we run serially today; arXiv politeness constrains this anyway) | small | politeness/rate limits differ per family | missing (serial by design; revisit only with wall-clock pressure) |
| 8 | retriever/scraper abstraction layers | gpt_researcher/retrievers/, scraper/ | Pluggable backends (tavily/serper/duckduckgo/…), URL scraping pipeline | Architecture reference only — API-bound; our three-source keyless adapters already fill this role | — | commercial APIs | n.a. (boundary: no new API backends) |

## Verdict

Fusion candidates: **#2 researchGoal-conditioned queries** (cheap prompt/schema addition for any
future iterative retrieval — but registry C2 already rejected iterative re-query on evidence; tie
to that gate) and **#5 deterministic word-budget trim** (only if evidence-stage context ever needs
a global budget — currently no demonstrated failure). **#1's breadth-halving descent** is the
strongest shape but depends on reading full web pages (like ODR's finding) and live LLM — keep as
design reference, do not fuse this wave. #4/#6/#8 map to existing/forbidden surfaces.

Honest bottom line: gpt-researcher's distinctive value for FAR-Lab is the **descent shape with
goal-carried queries and the all-failed stop guard** — both are iteration-loop features, and both
this wave's crosscut evidence (query-decomposition-crosscut.md C2) currently rejects adding an
iterative loop (no demonstrated failure class that iteration fixes; wall-clock hard gate). Adopt
mechanism reference only.
