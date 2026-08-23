# RU-10 CORPUS — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research. Status: SOURCE_VERIFIED where runtime probes were
possible on this machine; network-blocked items recorded honestly.

## Problem
Corpus-plane gaps: A2.8 near-dup detection/merge (+A4.5 hypothesis dedup —
same primitive), A2.9 cross-run corpus memory, A2.11 non-English literature
(FTS5 unicode61 blocks zh), A2.14 BYO-corpus import (PDF/BibTeX/RIS/Zotero),
A2.15 entity grounding (Wikidata-class).

## Search vocabulary run
- dedup: `minhash lsh typescript`, `near duplicate detection shingle`, `datasketch`, `simhash vs minhash`, `jaccard dedup corpus`
- multilingual: `fts5 trigram tokenizer cjk`, `sqlite unicode61 chinese`, `nodejieba pure javascript jieba`, `char bigram indexing`, `openalex chinese search`
- import: `bibtex parser javascript`, `ris parser js`, `zotero export format csl json`, `pdf text extraction pdfjs`
- entity: `wikidata sparql endpoint rate limit`, `wbsearchentities api`, `entity linking scholarly concepts`, `comunica heavy`
- cross-run: `content addressed corpus store`, `doi canonicalization lowercase`, `openalex id stability`

## Runtime facts (FACT — probed live)
| Probe | Result | Consequence |
|---|---|---|
| FTS5 `tokenize='trigram'` in Node 24 bundled SQLite 3.51.2 | **AVAILABLE** | zh search possible with ZERO new deps |
| trigram zh phrase query 「遗忘机制」 | HIT | phrase/substring queries work for CJK |
| trigram zh single char query 「遗忘」(2 chars) | MISS | <3-char terms need char-ngram transform or prefix fallback at index time |
| OpenAlex `filter=title.search:记忆` | count=7,979; results include ja/en/zh titles | **OpenAlex metadata search is CJK-capable TODAY** — retrieval-side multilingual is an API-parameter change, not infra |
| OpenAlex fulltext.search 记忆 | 40,349 hits | fulltext zh also indexed server-side |
| Wikidata Query Service + www.wikidata.org API from this host | TIMEOUT (HTTP 000) | endpoint unreachable here; design must treat it as optional enrichment, not hard dep |

## Candidate table
| Candidate | Org | License | Maturity | Solves | Family | Tag |
|---|---|---|---|---|---|---|
| MinHash-LSH (algorithm) | Broder 1997 / datasketch reference | public algorithm; datasketch MIT (py ≥3.9, v2.0.0 active) | mature standard | near-dup at zero deps (~150 LoC TS) | probabilistic set similarity | SR(algorithm)+SC(datasketch) |
| SimHash | Manku et al. | public algorithm | mature | cheap near-dup fingerprint | alternative family; weaker recall for short texts | PR |
| embedding dedup via fastembed sidecar | Qdrant | Apache-2.0 | gated by RU-1 evidence trigger | semantic near-dup beyond lexical | deferred until FTS5/minhash measured insufficient | SC |
| @retorquere/bibtex-parser | retorquere | ISC | active v10.0.1 (2026-08-11) | robust BibTeX/CSL-JSON parse | parser | SC |
| @citation-js/core | citation-js org | MIT | active (2026-07-13) | BibTeX+RIS+CSL-JSON conversion, already known to project (web pkg) | parser+converter | SC |
| pdfjs-dist | Mozilla | Apache-2.0 | already in web pkg | PDF text extraction for BYO import | extractor (reuse, no new dep) | FACT(in-repo) |
| nodejieba / @node-rs/jieba | community | MIT/native+napi | active but native binaries | zh segmentation | REJECT — violates zero-native-dep gate; unnecessary given trigram route | SC |
| Wikidata SPARQL / wbsearchentities | Wikimedia | CC0 data | global service | concept grounding, cross-lingual anchors | thin-fetch enrichment client | SC(network-blocked locally) |
| Comunica | comunica | MIT | active | full SPARQL engine in JS | REJECT as dependency (heavyweight); raw fetch suffices for our 3 fixed query shapes | SC |
| DOI canonicalization | Crossref pattern | n/a | standard | `10.####/suffix` case-insensitive suffix, url-decode, strip `https://doi.org/` prefix | normalization rule | PR |

## Source-level findings
1. **MinHash-LSH TS port**: algorithm needs only murmur-ish hash + banding;
   reference semantics from datasketch (LSH with num_perm=128, threshold→bands
   formula). One module `src/domain/minhash.ts` owns BOTH corpus dedup (A2.8)
   and hypothesis dedup (A4.5). Shingle unit = word 3-grams EN / char
   2-grams CJK (script-detected by unicode range — deterministic).
2. **zh retrieval decision tree**: index-time, write BOTH a trigram-indexed
   column and keep unicode61 column; queries ≥3 chars → trigram MATCH with
   quoted phrase; <3 chars → LIKE '%term%' scan on capped corpus (acceptable
   ≤1e4 rows) or char-bigram auxiliary table if profiling demands. No
   segmentation dependency ever enters core.
3. **Cross-run corpus cache shape**: artifacts are already content-addressed;
   add `corpus_items(doi_canon, openalex_id, title_norm_hash, source_url,
   license, first_seen_run_id, payload_ref)` keyed by canonical identifier;
   runs get a view (run-scoped membership table), never own copies.
   Reuse = read-through: retrieve stage checks corpus_items before hitting
   external APIs; staleness policy = revalidate TTL per source family (7d
   bibliographic, 1d fulltext) recorded in receipts.
4. **BYO import pipeline**: single stage `import_corpus`: accepts
   folder/PDF/BibTeX/RIS/CSL-JSON/Zotero-export; citation-js converts all
   bib formats → CSL-JSON (one schema); pdfjs extracts text (first N pages
   configurable); every item lands through the SAME dedup gate as retrieved
   corpus; license field REQUIRED when user asserts one, else
   `license: user-supplied-unverified` (honest label, UX truth law).
5. **Entity grounding**: thin `fetch` util against wbsearchentities +
   per-entity claims; treat service as OPTIONAL enrichment (network probe
   gates calls; offline = feature silently unavailable, no fake results);
   analogy-distance features deferred to RU-15/A4.7 linkage.

## Adjacent-field findings
- IR practice: trigram indexes are the established zero-tokenizer answer for
  CJK substring search in SQLite-class stores (Postgres pg_trgm precedent);
  recall cost is index size ~3x, acceptable at our scale caps.
- Dedup evaluation methodology: synthetic mutation corpus (truncate, swap
  sentences, OCR-noise injection) with planted gold pairs gives measurable
  P/R without external datasets.

## Verdicts (main-Agent, closed vocab)
- MinHash-LSH module: **BUILD** (~150 LoC TS, single owner for A2.8+A4.5)
- SimHash: **REJECT** (weaker for short scholarly text; one mechanism rule)
- fastembed-based semantic dedup: **DEFER** — trigger: measured MinHash P/R miss on replayed real corpora (ties RU-1 gate)
- @citation-js/core promotion web→shared import path: **ADOPT** (already licensed/in-tree adjacent)
- @retorquere/bibtex-parser: **REJECT** (citation-js covers; two parsers = two authorities)
- zh retrieval via trigram + API-side CJK search: **BUILD** (probe-proven, zero deps)
- jieba anything (native): **REJECT** (dep gate; unnecessary)
- corpus_items cross-run store: **BUILD** (schema above; migration v6 batch)
- BYO import stage: **BUILD** (pdfjs+citation-js reuse; honest license labels)
- Wikidata client: **BUILD** (thin fetch, optional-enrichment contract)
- Comunica SDK: **REJECT** (heavyweight; 3 fixed query shapes don't need an engine)

## Integration sketch (owners)
- src/domain/minhash.ts — dedup primitive owner (domain layer, pure fn)
- src/pipeline/stages/import-corpus.ts — BYO ingestion owner
- store.ts — corpus_items DDL + trigram virtual table (migration v6 batch, DDL-only)
- retrieve.ts — read-through cache check before external calls; receipts note cache hit/miss
- web — import UI rides existing ingestion panel patterns (PEX-lane coordination needed before any web work)

## Deterministic validation workload (offline)
- dedup P/R on synthetic mutation corpus (planted gold pairs, incl. CJK samples)
- trigram zh recall fixtures (abstracts w/ known hit terms; <3-char edge cases)
- import round-trip fixtures (BibTeX/RIS/CSL samples → CSL-JSON → corpus_items)
- read-through cache test (mock HTTP once, second run serves from corpus_items, receipt says cached)
- DOI canonicalization property tests (case/url-form/whitespace variants)

## UNVERIFIED
- Wikidata live behavior from typical user networks (blocked on THIS host only — probe at integration time)
- trigram index size multiplier on real corpus (needs >1e4-item fixture bench)
- Zotero export CSV dialect coverage (RIS/CSL verified paths only)
