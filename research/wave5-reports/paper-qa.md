# Wave-5 Deep Dissection: Future-House/paper-qa (PaperQA2)

- Target: `.cache/repos/paper-qa` (local snapshot; CalVer era, post-`v2025.12.17` lineage, i.e. "PaperQA2" / v5+ architecture)
- License: Apache-2.0 (root `LICENSE`) — verified in-repo. Deep extraction/adaptation allowed with attribution.
- Upstream code treated as data only; never executed.
- All file:line references are relative to the snapshot root.

---

## 0. License & Layout

Apache-2.0. Python 3.11+, ~8.8k LOC in core. Key dependency stack: `litellm` (via `lmi`) for model calls, `pydantic` v2, `tiktoken` (chunking/scoring), `numpy` (vector store), `tantivy` (BM25 index), `aviary` (agent env/tool framework), `httpx` + `tenacity` (HTTP retry), `pybtex` (citations).

```
src/paperqa/
  types.py      (1383L)  Data models: Doc, Text, Context, PQASession, ParsedText/Media/Metadata, DocDetails
  docs.py       (721L)   Docs collection: add/read/embed/retrieve, aget_evidence, aquery
  core.py       (400L)   llm_parse_json (tolerant JSON repair), map_fxn_summary (evidence-card factory)
  readers.py    (556L)   Parsing + chunking: chunk_pdf / chunk_text / chunk_code_text, read_doc
  llms.py       (585L)   VectorStore ABC, NumpyVectorStore (MMR), QdrantVectorStore, embedding factory
  settings.py   (1290L)  All knobs: Answer/Parsing/Prompt/Index/Agent settings, context_serializer
  prompts.py    (241L)   All prompt templates incl. citation constraints
  utils.py      (716L)   strip_citations, extract_score, get_citation_ids, doc_id hashing, retrying
  agents/
    tools.py    (712L)   PaperSearch, GatherEvidence, GenerateAnswer, Reset, Complete, ClinicalTrialsSearch
    env.py      (387L)   PaperQAEnvironment, settings_to_tools, status regexes
    main.py     (437L)   agent_query/run_agent, fake agent, timeout failover, answer index
    search.py   (718L)   SearchIndex (tantivy BM25), get_directory_index, process_file
    helpers.py  (107L)   litellm_get_search_query (LLM query generation)
    models.py   (156L)   AnswerResponse, AgentStatus (FAIL/SUCCESS/TRUNCATED/UNSURE)
  clients/               Metadata: semantic_scholar, crossref, openalex, unpaywall, retractions,
                         journal_quality (31k-row journal tier CSV)
  configs/               Bundled known-good settings: fast, high_quality, wikicrow, contracrow, ...
packages/                Optional readers: paper-qa-pypdf, paper-qa-pymupdf, paper-qa-docling, paper-qa-nemotron
```

Upstream README's own pipeline summary (README.md "PaperQA2 Algorithm"): **1. Paper Search** (LLM keyword queries → chunk/embed/add) → **2. Gather Evidence** (vector rank top-k chunks → scored contextual summary each → LLM re-score/select) → **3. Generate Answer** (best summaries into prompt → answer), with a language agent free to interleave tools.

---

## 1. Data Models (with file:line)

| Model | file:line | Essentials |
|---|---|---|
| `Doc` | types.py:75-153 | `docname`, `dockey`, `citation`, `content_hash`; `matches_filter_criteria` supports `!field` (invert) and `?field` (missing-key-passes) operators (types.py:109-125). |
| `Text` (chunk) | types.py:155-235 | `text`, `name` (e.g. `"Docname pages 1-3"`), `media: list[ParsedMedia]`, back-ref `doc`. `extra="allow"` so chunk-level metadata can be attached. `get_embeddable_text(with_enrichment)` (types.py:208-235): media **enrichment descriptions are appended for embedding only, never to the quotation text** — embedding-space boost without corrupting the anchor text. |
| `Context` (evidence card) | types.py:238-316 | `context` (question-focused summary), `question` (may differ from user query — sub-questions), `text` (source chunk), `score` 0-10 (`UNSET_RELEVANCE=-1`). `id` auto-derived `pqac-{8 hex}` = md5(question + first 500 chars of summary) (REFERENCE_TEMPLATE types.py:282; `populate_id` types.py:304-316). `extra="allow"` so summary JSON can grow extra structured fields. |
| `PQASession` | types.py:319-527 | `question`, `raw_answer` (contains context IDs), `answer`, `formatted_answer`, `references`, `contexts`, `token_counts` per model, `cost`, `config_md5` (frozen hash of full Settings, types.py:371-377), `tool_history`. `used_contexts` computed field = context IDs actually cited in raw_answer (types.py:398-402) — citation-recall signal. |
| `ChunkMetadata` / `ParsedMetadata` | types.py:529-564 | Records chunk size/overlap + parsing libs + paperqa version; `name` string embeds all params → stable cache key for the parse layer. |
| `ParsedMedia` | types.py:567-694 | Image/table bytes XOR remote URL (validator types.py:602-613 refuses both/none — "ambiguous state"); `info` dict; deterministic UUID from content hash (types.py:625-651); `to_image_url` data-URL fallback. |
| `ParsedText` | types.py:716-760 | `content: dict[page -> (text, media)]` for PDFs; `encode_content` (tiktoken) and `reduce_content`. |
| `DocDetails` | types.py:808-1383 | Full metadata (DOI, authors, journal, `citation_count`, `source_quality` 0-3, `is_retracted`). `formatted_citation` (types.py:1216-1249) appends "**RETRACTED ARTICLE**" warning + citation count + journal-quality phrasing ("is from a highest quality peer-reviewed journal", tiers at types.py:787-792). `__add__` merges two metadata records preferring the newer `publication_date` (preprint vs published, types.py:1267-1371). `doc_id = md5(doi.lower() + content_hash)` (utils.py:253-258, types.py:910-938). |

Pipeline state: `EnvironmentState` (agents/tools.py:47-92) = `{docs, session, status_fn}` with regex-parseable status (below).

---

## 2. Pipeline Map (index → retrieve → rerank → budget → answer → verify)

1. **Local corpus index** (agents/search.py): `get_directory_index` (search.py:622-718) walks `paper_directory`, per file `process_file` (search.py:490-580) runs the full add pipeline, then writes into a **tantivy BM25 index** with fields `title, year, file_location, body` (search.py:638-641) and stores the pickled `Docs` object keyed by `md5(body)` (search.py:298-314). Dedup by body hash via `filecheck` (search.py:263-269); parse failures recorded as `"ERROR"` so they are not retried (search.py:271-273, 536-547). Index name is a hash of parser+embedding+chunk params (settings.py:853-874) — changing chunking invalidates cache automatically.
2. **Add paper** (docs.py `aadd`, docs.py:156-338): `md5` content hash → dockey; peek pages 1-3 → LLM `citation_prompt` infers MLA citation (docs.py:182-213); `structured_citation_prompt` extracts `{title, doi, authors}` JSON (docs.py:225-261, prompt prompts.py:93-99); `DocMetadataClient` hydrates from S2/Crossref/OpenAlex/Unpaywall + retraction DB + journal-quality CSV; `read_doc` parses and chunks.
3. **Chunking** (readers.py, §3 below): defaults `chunk_chars=5000, overlap=250` (settings.py:250); high_quality/wikicrow/contracrow use 7000-char chunks (wikicrow overlap 1750).
4. **Retrieve** (docs.py `retrieve_texts`, docs.py:456-490): query embedded → `max_marginal_relevance_search(k, fetch_k=2k)` over `NumpyVectorStore` (llms.py:241-274, MMR at llms.py:111-170). `mmr_lambda` default 1.0 = pure relevance (MMR off). Deleted docs filtered post-hoc.
5. **Evidence cards** (docs.py `aget_evidence`, docs.py:492-586): top `evidence_k` chunks (default 10; wikicrow 25; contracrow 30) → concurrent `map_fxn_summary` (core.py:178-380): per chunk, `summary_llm` returns JSON `{summary, relevance_score 0-10}` (system prompt prompts.py:108-119); `strip_citations` removes the *paper's own* citations from the summary (core.py:359, utils.py:127-131); score>0 and non-duplicate contexts kept (dedup via `Context.__hash__`, docs.py:579-585, types.py:288-302).
6. **Context assembly + answer** (docs.py `aquery`, docs.py:588-721): optional `pre` prompt → `context_serializer` (settings.py:1202-1273): sort contexts by `(-score, name)`, cap at `answer_max_sources` (default 5; wikicrow 12; contracrow 15), drop below `evidence_relevance_score_cutoff=1`, render each as `{pqac-id}: {summary}\nFrom {formatted_citation}` (CONTEXT_INNER_PROMPT prompts.py:166-167) and append **`Valid Keys: pqac-…, pqac-…`** whitelist (CONTEXT_OUTER_PROMPT prompts.py:164, settings.py:1270-1273). `qa_prompt` (prompts.py:52-69) demands per-sentence citation keys with explicit valid/invalid examples. Prior answer injected via `answer_iteration_prompt` (prompts.py:30-36).
7. **Post-process/verify** (`populate_formatted_answers_and_bib_from_raw_answer`, types.py:474-526): parenthetical extraction (nested-safe, utils.py:170-188) → `get_citation_ids` regex `pqac-[a-zA-Z0-9]{8}` (utils.py:191-194) → per-parenthetical dedup preserving order → map ids→`text.name` (which for PDFs is `"Docname pages X-Y"`) → build numbered References list → **strip hallucinated keys** not in `id_to_name_map` (types.py:510-515). Empty-context sentinel → "I cannot answer" path (prompts.py:28,165; docs.py:649-654).
8. **Agent loop** (agents/env.py, tools.py): ToolSelector (function-calling agent) calls `paper_search` / `gather_evidence` / `gen_answer` / `reset` / `complete`. Every tool returns the answer/evidence **plus a status line** `"Status: Paper Count=N | Relevant Papers=N | Current Evidence=N | Current Cost=$X"` (tools.py:27-44) which the agent reads and which downstream code re-parses with `STATUS_SEARCH_REGEX_PATTERN` (tools.py:63-66) to split answer from status (tools.py:376-386). `complete(has_successful_answer: bool)` terminates. Guards: `max_answer_attempts` forces done (env.py:295-305); wall-clock `timeout=500s` → status TRUNCATED → forced final `gen_answer` failover (main.py:151-179).

---

## 3. Citation-Anchoring Deep Dive (C4/C5 focus)

**Critical finding: PaperQA2 v5 has NO verbatim quote-verification loop.** The PaperQA1 `answer.py`/`asker.py` quote-validity machinery does not exist in this snapshot (rejection note §7). Anchoring is **context-id-based** at chunk granularity, made robust by four cooperating layers:

1. **Stable short anchor IDs.** Every evidence card gets `pqac-{8 hex}` derived from md5(question+summary[:500]) (types.py:279-316). Short, regex-friendly (`\bpqac-[a-zA-Z0-9]{8}\b`, utils.py:192), collision-managed by construction. If two contexts hash identically they become the same key (dedup side effect).
2. **Prompt-side whitelist + few-shot constraints.** The answer prompt embeds `CITATION_KEY_CONSTRAINTS` (prompts.py:38-50): 2 valid examples (`(pqac-d79ef6fa, pqac-0f650d59)`) and 5 invalid ones (semicolons, "and", concatenations, `Author et al. (2023)` style). Plus the trailing `Valid Keys: …` list from context_outer (settings.py:1270-1273). The example citation is stripped from any answer that echoed it (docs.py:684-685).
3. **Deterministic post-sanitization.** `populate_formatted_answers_and_bib_from_raw_answer` (types.py:474-526):
   - nested-parenthetical-safe extraction (utils.py:170-188 keeps a stack of open-paren indices, innermost-first);
   - order-preserving in-parenthetical dedup via `dict.fromkeys` (types.py:489-493);
   - unknown/hallucinated ids silently removed from the formatted answer (types.py:510-515);
   - ids remapped to human-readable `text.name` — for PDFs that name is **`"{docname} pages {lower}-{upper}"`** (readers.py:92-102), so final rendered citations look like `(Qian2011Neural pages 1-2)` — page-range anchoring reaches the user;
   - bibliography built in first-use order with `formatted_citation` (which itself appends citation count / journal tier / RETRACTED badge, types.py:1216-1249).
   Test suite encodes the exact semantics incl. dedup, hallucination-drop, nested parens (tests/test_paperqa.py:3440-3462).
4. **Collision prophylaxis upstream.** The *paper's own* inline citations (`Author et al. 2023`, `(Smith 2021)`) are stripped from evidence summaries before they can collide with pqac keys (utils.py:127-131 applied at core.py:359), controllable via `skip_evidence_citation_strip` (settings.py:170-173).

Additionally, quote fidelity inside the anchor is prompt-enforced, not verified: the summary prompts demand "report specific numbers, equations, or direct quotes (marked with quotation marks)" (prompts.py:6-17), so verbatim material survives into summaries that the answer LLM can quote. `used_contexts` (types.py:398-402) then gives a zero-cost **citation-recall** measure (which of the offered contexts were actually cited).

---

## 4. Context-Budget Deep Dive (B5/B6 focus)

There is **no runtime token counter in v5** (no TokenizerWrapper; tiktoken appears only in `chunk_text`/`encode_content`). The budget is enforced structurally, at four gates:

| Gate | Knob | Default | Known-good configs |
|---|---|---|---|
| Chunks summarized per gather | `answer.evidence_k` | 10 | fast 2, high_quality 20, wikicrow 25, contracrow 30 (configs/*.json) |
| Summary length per chunk | `answer.evidence_summary_length` | "about 100 words" | wikicrow/contracrow "about 300 words" |
| Contexts into answer prompt | `answer.answer_max_sources` | 5 | wikicrow 12, contracrow 15 |
| Relevance floor | `answer.evidence_relevance_score_cutoff` | 1 | — |

- **Compressed-context pattern (RCS):** the answer LLM never sees raw chunks — only ~100-300-word scored summaries + citation strings. Effective answer-context budget ≈ `answer_max_sources × evidence_summary_length` (default ≈ 500 words; wikicrow ≈ 3,600). Raw text cost is bounded separately by `evidence_k × chunk_chars`.
- **Priority ordering is deterministic:** sort by `(-score, x.text.name)` (settings.py:1215-1218) — relevance first, lexicographic name as stable tiebreak → reproducible budgets.
- **Token-aware chunking without a runtime tokenizer dependency for scoring:** `chunk_text` measures the document's own chars-per-token ratio with tiktoken once at parse time, then converts the char budget into a token window so cuts land at token boundaries (readers.py:291-296). (Port note: the *ratio* idea is portable to TS without tiktoken; exactness is not.)
- **Per-page guard:** `page_size_limit=1_280_000` chars raises `ImpossibleParsingError` on pathological reads (settings.py:238-245; readers.py:185-191; pypdf reader packages/paper-qa-pypdf/src/paperqa_pypdf/reader.py:145-150).
- **Grouping option:** `group_contexts_by_question` renders evidence grouped under sub-question headings (settings.py:1228-1254) — useful when `gather_evidence` was called with multiple sub-questions.
- **Empty-context sentinel:** `EMPTY_CONTEXTS` = length of a formatted empty outer prompt; below it the system short-circuits to "I cannot answer" instead of hallucinating (prompts.py:165; docs.py:649-654).
- **Cost/observability:** per-model prompt/completion token counts and USD cost accumulate on the session (types.py:414-433) and are surfaced in the agent-visible status line (tools.py:27-34) — budget pressure is *shown to the agent*, which can decide to stop.
- **Prompt-caching aware:** system messages get `cache_control` injection points (settings.py:740-743).

---

## 5. Retrieval-Quality Loop (detail)

- **LLM query generation:** `litellm_get_search_query` (agents/helpers.py:27-75), `temperature=1.0` for diversity, prompt demands "unique keyword searches… some broad and some narrow", strips list numbering/quotes. Fake agent seeds 3 such searches (main.py:236-243).
- **Search continuation/paging:** `paper_search` keys `previous_searches[(query, year-range)] → offset` (tools.py:118, 167-173, 203-204); repeating the identical call pages deeper (`search_count=8` default, 12 in wikicrow). Tool docstring explicitly tells the agent "Repeat previous calls with the same query and years to continue a search. Only repeat a maximum of twice." (tools.py:130).
- **BM25 over local corpus:** tantivy `parse_query` with query-character cleaning regex and a possessive-stripping retry (search.py:396-418); `field_subset` drops `year` from query fields (tools.py:181).
- **Dense + optional sparse hybrid:** embedding string prefixes route to factories — `hybrid-<dense>` = dense + `SparseEmbeddingModel`, `st-<name>` = local SentenceTransformers, `litellm-<name>` = API (llms.py:526-585). Wikicrow (superhuman WikiBench config) uses `hybrid-text-embedding-3-small`; contracrow `hybrid-text-embedding-3-large`.
- **MMR diversification** available via `texts_index_mmr_lambda < 1` (llms.py:111-170; settings.py:804-806), off by default.
- **LLM re-rank = contextual summarization scoring:** the `relevance_score 0-10` produced during evidence-card creation *is* the rerank signal (core.py:316-341); contexts below cutoff never reach the answer prompt. This is "RCS as rerank".
- **Feedback to agent:** `gather_evidence` returns "Added N pieces of evidence" + top `agent_evidence_n=1` best context text + status (tools.py:279-311); `paper_search` can optionally return title/year lists (`return_paper_metadata`, settings.py:648-654).
- **Stopping:** agent-judged (status line + complete tool), `max_timesteps`, `timeout`, `max_answer_attempts`; `Reset` tool wipes evidence when stuck (tools.py:389-402).

---

## 6. Answer Synthesis, Status & Self-Eval

- **Incremental revision:** `answer_iteration_prompt` injects the prior answer with the rule "You can not use context keys from the prior answer which are not also included in the above context" (prompts.py:30-36) — explicit key invalidation on revision.
- **Certainty protocol:** `complete(has_successful_answer)` → UNSURE vs SUCCESS (tools.py:415-441; models.py:29-38); `has_successful_answer is None` means truncated/forced.
- **Status line as a typed channel:** one human-and-regex-readable string carries 4 counters + cost through every tool response (tools.py:27-44,63-66); answer-vs-status split regex at tools.py:376-386; clinical-trials variant extends the same pattern (env.py:143-165). This is a cheap, framework-agnostic state-feedback protocol.
- **Provenance:** `config_md5` = hash of the entire Settings object frozen onto the session (settings.py:843-846; types.py:371-377) — any answer is reproducible/attributable to an exact configuration. Answers themselves are indexed into a searchable "answers" index (main.py:64-85).
- **Self-eval (J1-ish) in-repo:** LitQA2 splits ship in docs/ (`2024-10-16_litqa2-splits.json5`); multiple-choice grading via `EVAL_PROMPT_TEMPLATE` (prompts.py:154-162) + `MultipleChoiceQuestion`; `used_contexts` gives citation recall; one consistency test asserts cited contexts ≤ `answer_max_sources` (tests/test_agents.py:809). **The full human-eval harness and citation precision tooling described in the PaperQA2 paper are NOT in this repo** (they live in FutureHouse-internal/other repos) — treat any "J1 replication" claim from this snapshot as unsupported.

## 6b. Temperature / Structured-Output / Tool-Schema Mechanisms (§7 of tasking)

- **Temperature policy:** global `temperature=0.0` (settings.py:802) with an auto-override that *forces* temperature 1 for `o1*`/`gpt-5*` reasoning models, with a user warning (settings.py:823-841); search-query generation deliberately uses `temperature=1.0` for diversity (helpers.py:32). So: deterministic for synthesis, hot for exploration — encoded in defaults, not left to callers.
- **Structured outputs are prompt-begged + repaired, not schema-enforced:** `llm_parse_json` (core.py:19-124) is a production-grade tolerant-repair pipeline for `{"summary":…, "relevance_score":…}`: strips `<think>` blocks, unwraps ```json fences, converts fraction scores (`8/10`→8, `"3/5"`→6), escapes raw newlines inside quoted strings (regex from regex101, core.py:47), fixes invalid backslash escapes, inserts missing commas, removes trailing/duplicate commas, and as last resort regex-extracts `summary`+`relevance_score` directly (core.py:95-105). Score-key drift is normalized (any key matching `relevance|score` renamed, core.py:110-112). On `LLMBadContextJSONError` the whole evidence-card creation retries **once with the failure message appended to the prompt** (`_prior_attempt`, core.py:214-224, 383-401); non-retryable classes (timeout, provider failure) abandon that one context while the rest continue (fail-soft, core.py:136-176).
- **Tool schema design:** docstring-is-the-schema (`Tool.from_function`, env.py:71-72); hidden `state` parameter; `CONCURRENCY_SAFE` class flag gates parallel tool execution (tools.py:102-104; env.py:321-329 `exec_tool_calls(concurrency=True)`); tool prompts can be swapped when the toolset changes (clinical-trials override of gather_evidence docstring, tools.py:456-471, env.py:95-104); dynamic schema text (`{current_year}` injected into param descriptions, env.py:80-83); `Complete` always placed last in the tool list (env.py:136-139).
- **Extensible summary schema via model extras:** `Context` allows extra fields, so a config can ask the summary LLM for more fields (wikicrow asks for `gene_name`, configs/wikicrow.json `summary_json_system`) and they flow into the answer prompt automatically (`**(c.model_extra or {})` in context_inner formatting, settings.py:1244). A domain claim-extraction field rides the same rails.

---

## 7. Mechanism Inventory → FAR-Lab Mapping

FAR-Lab verdicts: 已有 (already present) / 部分 (partial) / 缺失 (missing) / 不适用 (not applicable).

| # | Dimension | Mechanism | file:line | Summary | Why valuable | Port cost (TS/zero-dep) | Risk | FAR-Lab |
|---|---|---|---|---|---|---|---|---|
| 1 | Citation anchoring | `pqac-{hash}` context IDs + `Valid Keys` whitelist + CITATION_KEY_CONSTRAINTS few-shot | types.py:279-316; settings.py:1270-1273; prompts.py:38-69 | Stable short per-evidence anchors; prompt forbids malformed citations | Direct implementation of per-sentence claim→evidence binding | Low (md5 + template) | Hash collision on identical question+summary-prefix merges contexts (usually desired dedup) | 部分 (claim→doc binding exists; short-key + whitelist prompting absent) |
| 2 | Citation presentation | Post-hoc sanitization: nested-paren extraction, order-preserving dedup, hallucinated-key stripping, first-use-ordered bibliography | types.py:474-526; utils.py:170-194 | Deterministic render pipeline raw→formatted answer | Fail-closed citation presentation (C5) | Low (pure string ops) | Silent removal could mask model misbehavior if not logged | 缺失 |
| 3 | Citation anchoring | Page-range chunk names as user-visible anchors (`Docname pages 1-3`) | readers.py:92-102; types.py:480-498 | Id→name remap puts page anchors in rendered citations | Paragraph/page-level citation UX | Low | PDF-only names; HTML sources need section anchors | 部分 (excerpt truncation exists; page/section anchor naming absent) |
| 4 | Grounding hygiene | `strip_citations` removes source-paper inline citations from evidence text | utils.py:127-131; core.py:359 | Prevents (Author 2020) collisions with system keys | Cleaner claim matching — likely direct F1 lever for rediscovery eval (0.58→0.70) | Low | Over-strips legitimate parentheticals (e.g. statistics) — needs tests | 缺失 |
| 5 | Evidence fidelity | Quote-preserving summary prompts ("specific numbers, equations, or direct quotes") | prompts.py:6-17, 108-119 | Verbatim material survives compression | B6 fidelity without a verifier | Low (prompt text) | Unverified quotes can drift | 部分 (claim extraction exists; quote-preservation instruction not systematic) |
| 6 | Evidence schema | Summary JSON `{summary, relevance_score}` + extras riding `model_extra` into answer prompt | core.py:19-124, 316-341; settings.py:1244; configs/wikicrow.json | Extensible per-chunk structured extraction (wikicrow adds `gene_name`) | Same rails fit FAR-Lab claim extraction (structured claim fields per chunk) | Medium (zod parse + prompt) | Schema drift; needs repair loop | 部分 |
| 7 | Structured output | Tolerant JSON repair + single retry with failure-feedback appended | core.py:19-124, 214-224, 383-401 | Fraction scores, newline escapes, commas fixed; retry once w/ error message | Robustness without provider JSON-mode lock-in (model-agnostic) | Medium (port regexes; TS equivalents straightforward) | Repair masks model incapability — cap retries at 1 as upstream does | 部分 (zod exists; repair-with-feedback loop likely absent) |
| 8 | Context budget | Score-then-cap serializer: sort `(-score, name)`, cap `answer_max_sources`, floor cutoff | settings.py:1202-1273 | Deterministic priority + caps at every gate | B5 budget discipline; reproducible context sets | Low | Caps can starve multi-source synthesis if too low (they tune 5→15 for hard tasks) | 部分 |
| 9 | Context budget | RCS compressed context: answer sees only summaries, never raw chunks | docs.py:643-673; prompts.py:166-167 | Raw-text cost decoupled from answer budget | Cheaper + more focused answer prompts | Low (already conceptually near FAR-Lab evidence cards) | Summaries lose nuance — mitigated by #5 | 已有 (evidence cards) — adopt the explicit word-length knob |
| 10 | Context budget | Token-ratio chunk sizing (chars-per-token measured per doc) | readers.py:291-296 | Char budget converted to token window at parse time | Token-safe chunks without runtime tokenizer | Medium (tiktoken not importable; approximate with chars/token≈4 heuristic or provider tokenizer) | Approximation drift across languages | 部分 (word-boundary truncation exists; token-aware sizing absent) |
| 11 | Retrieval | LLM query gen at temperature 1.0, broad+narrow mix | helpers.py:27-75 | Diverse query fan-out | Better recall on hard scopes | Low | Junk queries — keep count small (3) | 部分 (retrieval exists; query-diversity policy unclear) |
| 12 | Retrieval | Search continuation via `(query, years)→offset` map; "repeat max twice" instruction | tools.py:118, 167-173, 130 | Identical repeat = deeper paging, not duplicate | Cheap deepening without new queries | Low | Offset drift if index changes mid-run | 缺失/部分 |
| 13 | Retrieval | Hybrid dense+sparse embeddings; MMR diversification | llms.py:526-585, 111-170; configs/wikicrow.json | `hybrid-` prefix; `mmr_lambda` knob | Wikicrow's superhuman config chose hybrid — recall signal | High in zero-dep TS (needs sparse impl; MMR alone is cheap) | Complexity creep; MMR off by default upstream | 缺失 (RRF+listwise exists; MMR absent) |
| 14 | Answer revision | `answer_iteration_prompt` prior-answer injection with explicit key invalidation | prompts.py:30-36; docs.py:657-673 | New answer must re-cite only currently-valid keys | Prevents stale citations surviving revision (FAR-Lab revise stage) | Low | Model may still copy prior keys → #2 catches | 部分 (revise exists; key-invalidation rule likely absent) |
| 15 | State feedback | Machine-parseable status line through every tool result; answer/status split regex | tools.py:27-44, 63-66, 376-386 | Counters + cost inline in tool responses | Framework-agnostic observability; agent self-regulation | Low | Regex coupling — version the format | 部分 |
| 16 | Self-eval | `used_contexts` computed citation-recall signal | types.py:398-402 | Which offered contexts got cited | Free precision/recall instrumentation for eval harness | Low | Measures citation not truth | 缺失 |
| 17 | Provenance | `config_md5` frozen onto every session | settings.py:843-846; types.py:371-377 | Exact-config hash per answer | Reproducibility/export provenance | Low | Hash breaks on config renames (fine) | 部分 (FAR-Lab has provenance export; config-hash binding unclear) |
| 18 | Doc identity | `doc_id = md5(doi.lower()+content_hash)`; DocDetails merge prefers newer publication_date | utils.py:253-258; types.py:910-938, 1267-1371 | Cross-provider dedup + preprint/published resolution | Direct answer to multi-source duplicate papers in retrieve stage | Low (pure hashing) | None notable | 部分 |
| 19 | Source quality | Journal tier 0-3 + citation_count + RETRACTED badge rendered into `formatted_citation` | types.py:787-792, 1216-1249; clients/journal_quality.py | Quality context at citation time | Hypothesis-ranking feature + trust display | Medium (needs the journal-tier data source) | Tier CSV maintenance; US-centric list | 不适用→部分 (FAR-Lab rank uses tournament; a quality prior could feed it) |
| 20 | Robustness | Fail-soft evidence creation: retryable vs non-retryable error taxonomy; per-context abandonment | core.py:127-176, 383-401 | One bad chunk never kills the gather | Availability under provider flakiness | Low | Silent context loss — keep counters | 部分 |
| 21 | Multimodal | Media parsing (tables/figures) + LLM enrichment with RELEVANT/IRRELEVANT labels; enrichment in embedding space only | types.py:208-235; settings.py:1051-1193; pypdf reader | Figures/tables become retrievable evidence | Out of FAR-Lab text scope for now | High | — | 不适用 |
| 22 | Local corpus | Tantivy BM25 index over paper directory with parse-cache keyed by params hash | search.py:113-434; settings.py:853-874 | Reusable full-text corpus | FAR-Lab retrieves via APIs; only useful if local PDF caching lands | High | — | 不适用 (currently) |
| 23 | Temperature policy | 0.0 default synthesis; 1.0 query gen; forced 1 on reasoning models w/ warning | settings.py:802, 823-841; helpers.py:32 | Exploration vs determinism split | Small but principled default | Low | None | 部分 |
| 24 | Budget observability | Per-model token counts + USD cost on session, surfaced in status line | types.py:414-433; tools.py:27-34 | Cost pressure visible to agent + logs | Spend control for long research runs | Low | Provider pricing table maintenance | 部分 |

---

## 8. Top-10 Ranked for FAR-Lab Fusion

Ranked by (C4/C5 + B5/B6 leverage) × (low port cost) ÷ risk:

1. **Citation sanitization pipeline** (types.py:474-526 + utils.py:170-194). Nested-paren extraction, order-preserving dedup, hallucinated-key strip, first-use-ordered bibliography. Pure string ops; ports to TS in a day; makes FAR-Lab citation presentation fail-closed. Maps to C5 + verify stage.
2. **`strip_citations` on evidence text** (utils.py:127-131). Remove source-paper inline citations before claim extraction/matching. Cheapest plausible lever on the rediscovery-eval F1 pain (0.58→0.70): `(Smith et al. 2020)` noise inside excerpts corrupts claim matching.
3. **pqac-style anchor keys + `Valid Keys` whitelist + malformed-citation few-shot** (types.py:279-316; settings.py:1270-1273; prompts.py:38-69). Short stable ids per evidence card, whitelist restated at synthesis time, valid/invalid citation examples in-prompt. Complements FAR-Lab's fail-closed verify with fail-closed *generation*.
4. **Quote/number-preserving summary instructions** (prompts.py:6-17). One-line prompt change that makes compressed evidence carry verbatim numbers/equations/quotes — fidelity (B6) without a verification pass.
5. **Extensible summary schema via extras** (core.py:316-341; settings.py:1244; configs/wikicrow.json). Structured domain fields (wikicrow: `gene_name`) extracted per chunk alongside the summary and auto-injected into downstream prompts — the exact rail FAR-Lab claim extraction could ride, with zod replacing the regex repair.
6. **JSON repair + retry-with-failure-feedback** (core.py:19-124, 214-224). Model-agnostic structured-output robustness: repair once deterministically, retry once with the error message appended, then abandon that unit fail-soft. Ports to a zod `safeParse` loop.
7. **Score-then-cap budget serializer with deterministic tiebreak** (settings.py:1202-1273). `(-score, name)` sort, hard cap, floor cutoff, optional group-by-question rendering — reproducible context sets (B5), plus the known-good knob ladder (10/5/100w default → 25-30/12-15/300w for hard tasks) as calibration data.
8. **`answer_iteration_prompt` key invalidation** (prompts.py:30-36). Revision must re-cite only currently-valid keys — prevents stale citations surviving FAR-Lab's revise loop; pairs with #1/#3 as the safety net.
9. **Status-line state protocol** (tools.py:27-66, 376-386). One regex-parseable string (counters + cost) threaded through every step; agent reads it, logs parse it, answers split on it. Cheap, framework-free feedback channel for FAR-Lab's long pipelines.
10. **`used_contexts` citation-recall signal** (types.py:398-402) + **config_md5 provenance** (settings.py:843-846). Two ~10-line computed fields that turn every run into eval instrumentation (which evidence was actually cited) and make every export reproducible to an exact config.

## 9. Rejection Notes (what NOT to chase in this repo)

- **No quote-verification loop.** PaperQA1's `answer.py`/`asker.py` quote-validity checking does not exist in the v5+ snapshot; there is no `summary.py` hierarchical paper-summary module either. Anyone porting "PaperQA's quote verifier" from this code will find nothing — anchoring is summary+id-based. (If FAR-Lab needs verbatim-quote verification, its own excerpt binding is already ahead of upstream here.)
- **No J1/self-eval harness in-repo.** Human-eval tooling and citation precision/recall scorers from the PaperQA2 paper are not in this snapshot; only LitQA2 splits + a multiple-choice grader prompt exist. Reproduction claims must not cite this repo as source.
- **tiktoken is a real dependency** (chunk_text, ParsedText.encode_content) — must be re-implemented or approximated in TS (chars/token ratio heuristic is the portable part).
- **The aviary/lmi/litellm agent runtime, Qdrant store, tantivy index, multimodal media pipeline** — all either replaceable by FAR-Lab's own runtime or out of scope; not worth porting.
- **`agent_evidence_n=1` etc. are tuned to GPT-4o-era models**; the bundled configs are calibration hints, not laws.
- **Known quirks to avoid copying:** silent hallucinated-citation removal (log it instead); `extract_score` heuristics (utils.py:134-167) tolerate out-of-100 scores by dividing — a normalization smell FAR-Lab's zod enums should not replicate; `Context.id` hash collisions are accepted as dedup by design.
