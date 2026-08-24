# Handoff: Retrieval & Evidence Intelligence Lane

- **Worktree**: `work/retrieval-evidence` @ branch `retrieval/evidence-lane`, BASE SHA `21f6233` (= sibling `science/intelligence-layer` base)
- **Date**: 2026-08-24
- **Owner**: Retrieval & Evidence lane (this session)
- **Status**: IMPLEMENTED + tested (offline/deterministic). Live-API behavior UNVERIFIED per the 2026-08-23 no-live-API rule — OpenAlex citation endpoints (`select=referenced_works`, `filter=cites:`, `filter=openalex_id:W1|W2`) are coded against the documented API shape with fixture-fetch unit tests; first live run should confirm field names.

## 1. Note on coordination files

The mission referenced `.planning/concurrency/{BASELINE,OWNERSHIP,INTEGRATION_RULES}.md` — these files did not exist at task start. BASE SHA was inferred from the existing sibling worktree (`work/scientific-intelligence` @ 21f6233) and this lane followed the same isolation pattern (own branch, no main-tree writes, no `git add -A`). If a concurrency protocol is later formalized, this lane's commits are isolated and mergeable.

## 2. Audit summary (what was already strong — NOT rebuilt)

The existing pipeline is substantially mature. Verified present and tested before this lane:

- LLM query planning (discovery×2 / supporting×1-2 / counter×2) with R-05 forced counter vocabulary + deterministic counter-anchor repair (topic-drift guard)
- 4-family search (OpenAlex/arXiv/Crossref/EuropePMC) + openalex→europepmc failover + arXiv zero-result k4/k2 recovery cascade + read-through response cache
- Fusion: RRF k=60 + RankGPT-style sliding-window listwise rerank (w=24 s=12, cache-stable payload)
- 3-layer dedup: primary identifier → normalized title+year (CJK-aware) → MinHash near-dup
- Counter-evidence seat floor (≥4/12) structurally protected
- Full-text deepening ≤3 docs/run via arXiv LaTeXML / EuropePMC JATS / OpenAlex GROBID TEI (keyed), citation-marker stripping, honest not_available
- Evidence binding: verbatim quote → deterministic alignment gate (fail-closed `resolved_unaligned`), GRIM + range forensics, retraction demotion (GRADE floor very_low + uncertainty notes)
- Cross-claim relations with topical-overlap prefilter + not_comparable default (false-contradiction guard)
- Evidence body: Σlog-LR bands, QBAF, Carneades proof standards, per-source cap, independent-source count
- Retrospective replay benchmark (`eval/retrieval-baseline.mjs`, BEIR-provenance nDCG@k/MRR/recall_cap/hole over persisted runs)

## 3. Gaps found → capabilities built this lane

| # | Gap (with evidence) | Delivered |
|---|---|---|
| 1 | **Citation chasing absent** — `cited_by` appeared only in volatile-exclusion lists; no `referenced_works`/`cites:` usage anywhere | `CitationChaseAdapter` port (optional on `SourceAdapter`, feature-detected); OpenAlex implementation (`referencedWorkIds` via `select=referenced_works`, `citingWorks` via `filter=cites:` + explicit `cited_by_count:desc` sort, `worksByIds` batch ≤50); bounded chase in retrieve stage (seeds ≤3: top-2 fused + first counter-origin; ≤3 refs + ≤5 cites per seed; ≤8 new pool docs; aborts on budget-429; every search receipted incl. 0-result) |
| 2 | **Publication type invisible** — adapters never read `type`; reviews/preprints/errata pooled as undifferentiated | `PublicationType` canonical enum; per-family mapping (`src/sources/pubtype.ts` single source); persisted on `SourceDocument.publicationType`; visible to listwise rerank; counted in diversity |
| 3 | **No saturation signal** — nothing measurable on diminishing returns | Novelty rate per record-bearing search (share new-to-pool at flush); `saturationMetrics` (mean + tail-mean, saturated = n≥4 ∧ tail<0.2); persisted `fusion.saturation` + summary line; decision input for gap-seek/iteration, never a silent stop |
| 4 | **No corpus-diversity observation** — single-family corpora possible and unobservable | `diversitySnapshot` (family counts + max-family concentration, year spread, publication-type mix) persisted `fusion.diversity` + summary line. Measurement first; enforcement deliberately NOT added without a measured pathology |
| 5 | **REPLICATES / FAILS_TO_REPLICATE structurally unproducible** — stance enum 4 values; cross verdicts persisted only 3 | Cross-relation verdicts extended with anchored definitions (independent reproduction w/ new data ≠ agreement; failed replication requires explicit replication language); both now persist as `EvidenceRelation` |
| 6 | **No known-answer benchmark** — existing eval replays historical runs only | `tests/retrieval-known-answer.test.ts`: full REAL retrieve stage over a fixture universe with known gold set (details §3b) |
| 7 | **Chase was 1-hop only** — method-lineage depth (the methodology BEHIND the method paper) unreachable | Bounded depth-2 backward chase (`planHop2Seed`: first chase-added resolvable entry, insertion order; ≤2 refs; 1 seed max; +1 request budget → chase ≤8 requests/run). Forward-of-forward deliberately excluded (recency noise, not lineage). Persisted `fusion.citationChase.hop2 {seed, added}` |
| 8 | **Retracted papers competed for cap seats** — retraction only demoted claims AFTER verification; a retracted high-citation search hit could displace valid evidence from the 12-doc cap | Search-time demotion: `retractionStatusFrom` moved to shared `src/sources/retraction.ts` (verify re-exports; resolve-time stays authoritative); retracted pool entries partitioned out of `selectFinal` competition, appended only when the pool cannot fill the cap (visibility over silent drop); top-level `SourceDocument.retractionStatus` hint persisted; `fusion.retractedDemoted` + summary line |
| 9 | **Fulltext figure/table/equation content 100% discarded** — TEI stripped `<figure>` wholesale (figDesc prose lost); a regex boundary bug (`table\b` matching `table-wrap`) silently swallowed JATS table captions; equations degraded to MathML glyph soup | TEI: each `<figure>` reduced to its `<figDesc>` paragraph in place. LaTeXML: math replaced by its original LaTeX from `alttext` (equations enter reasoning readably; no-alttext degrades to removal, never fabricated). Table element match made name-exact. Numeric table BODIES stay dropped (numeric mash is not claim material — documented decision) |

### 3b. Benchmark matrix (mission §7) — every named case type now covered

`tests/retrieval-known-answer.test.ts` (6 cases, real retrieve stage, zero network, zero LLM judgment):

| Case type | Assertion |
|---|---|
| known-answer | 6/6 gold recall@12 (support×2, counter×2, chase-only, hop-2-only) |
| known-counterevidence | both counter golds survive the cap; `counterSeatsKept` ≥ floor |
| precision | gold-precision@5 = 0.4 recorded (on-topic fillers legitimately interleave); EVERY keyword gold in top-8 of the 16-pool corpus |
| hard negatives | H1 (near-title different work) NOT merged — pinned by poolSize |
| citation-chain | G5 reachable ONLY via hop-1 backward chase (receipts + queries asserted) |
| multi-hop | G7 (1979 minimal-model paper) reachable ONLY via hop-2 chase off W900; `hop2 {seed:'W900', added:1}`; `batch:W950` called |
| duplicate/version | arXiv preprint + DOI published = ONE pool entry (poolSize-pinned) |
| recent-vs-classic | yearMin 1979 (hop-2 classic) → yearMax 2024 |
| cross-domain | adjacent-domain gold (exercise physiology) found only by the adjacent query, 2-list RRF earns a cap seat at pool 13 > cap 12 |
| multilingual | same CJK title from two families merges (poolSize 1); translated title honestly does NOT (poolSize 2 — embedding-level merge deliberately not faked) |
| retracted-paper | over-cap: retracted rank-1-everywhere doc takes NO cap seat (`retractedDemoted:1`, corpus 12 valid); under-cap: kept WITH `retractionStatus:'retracted'` persisted |
| saturation honesty | positive (all-seen tail → saturated) + negative control (fresh serial docs → NOT saturated) |

Supporting suites: `tests/citation-chase.test.ts` (34 cases incl. hop-2 seed selection/DOI fallback/abort classification/pubtype maps/chase adapter request shapes), `tests/sources-fulltext.test.ts` (33 cases incl. figDesc retention, alttext equations, JATS caption survival, table-body still dropped), `tests/retraction-gate.test.ts` (unchanged, green after the shared-module move), `eval/retrieval-baseline.mjs` (BEIR-provenance nDCG@k/MRR/recall_cap/hole over persisted runs — the judgment-based layer for live corpora).

## 4. Schema/contract changes (merge attention)

Additive only — all new fields optional, old objects parse unchanged:

- `SourceDocument.publicationType?: PublicationType` (enum: primary_research/review/preprint/editorial_letter/book_chapter/correction/other)
- `SourceDocument.retractionStatus?: 'retracted'|'corrected'|'expression_of_concern'|'reinstated'` — TOP-LEVEL search-time hint; `verification.retractionStatus` (resolve-time) stays authoritative
- `RetrievalQuery.purpose` += `'citation_chase'`
- `RetrievalFusion` += optional `citationChase` (now with optional `hop2 {seed, added}`) / `saturation` / `diversity` / `retractedDemoted`
- `RawSourceRecord.publicationType?`; `SourceAdapter.citations?: CitationChaseAdapter` (shared/ports.ts)
- evidence stage: cross-relation verdict enum += replicates/fails_to_replicate (persistable set extended)
- behavior change (intended): retracted search hits no longer occupy cap seats under pool pressure

## 5. Boundaries respected / handoffs to other lanes

- **Scientific Intelligence lane** (sibling): search-strategy adaptivity from research state (mission §5) — this lane provides the deterministic signals (`fusion.saturation`, `fusion.diversity`, chase provenance, `retractedDemoted`) as inputs; an LLM advisory iteration planner remains theirs. The unused-but-reserved `methodological` query purpose is now trivially wireable if they decide method-paper searches are a distinct round type.
- **Web/UI lane**: `tests/citation-entries.test.ts` (3 test failures) and `tests/file-ingest.test.ts` (collection failure: `@citation-js/core` unresolvable — web deps not installed in this worktree) are BOTH pre-existing at BASE (re-verified this session by stash-run on the pristine tree) — web ingest surface is that lane's territory, NOT fixed here.
- **Experiment Runtime / Statistics**: untouched.

## 6. Known limitations / follow-ups (honest)

1. **Chase is OpenAlex-only and uncached** (now ≤8 requests/run incl. hop-2, aborts on budget-429). Wire `cachedSearch` over chase queries if live runs show repeat pressure.
2. **MinHash short-abstract sensitivity (observed via benchmark)**: the 0.5 merge threshold assumes abstract-mass dominance; records with short (~30-word) abstracts sharing boilerplate can false-merge. Real corpora (150+ word abstracts) are safe per the original calibration, but a `MINHASH_MIN_SHINGLES` raise (8 → ~20) is worth calibrating if metadata-heavy sources grow. The benchmark fixture documents this explicitly.
3. **Author/entity disambiguation** not addressed (author ids available in OpenAlex authorships but not captured) — low evidential leverage vs cost; revisit only if claim-level author reasoning becomes a requirement.
4. **Multilingual retrieval** stays English-query-only (by design for these engines); CJK same-title dedup covered by benchmark; TRANSLATED-title dedup needs embeddings and is deliberately not faked (documented in the benchmark case).
5. **arXiv-only records get no retraction check** (no DOI → no Crossref update-to path). Withdrawal detection in arXiv abstracts not implemented (withdrawn papers surface rarely; publicationType=preprint already flags the weaker epistemic class).
6. **Retraction demotion is best-effort at retrieve time** — it fires only when the surfacing family carried update-to metadata (Crossref-family records). Resolve-time verification remains the authoritative gate.
7. **Table BODIES still dropped from fulltext** (numeric mash): captions/descriptions/equations now retained; full table comprehension (cell-level) would need structured extraction — revisit only with a measured need.
8. **Supplementary materials not fetched** — fulltext routes cover the main document only (arXiv HTML / PMC JATS / GROBID TEI of the primary); supplementary-information PDFs (where methods details often live) are a separate acquisition surface with no keyless route for most publishers.
9. Live field-name verification of the three citation endpoints (§ Status) — first live run should watch one receipt.

## 7. Evidence (commands + outcomes)

- `npx vitest run tests/citation-chase.test.ts` → 34 passed
- `npx vitest run tests/retrieval-known-answer.test.ts` → 6 passed
- `npx vitest run tests/sources-fulltext.test.ts` → 33 passed
- `npx vitest run tests/retraction-gate.test.ts` → 4 passed (unchanged by the shared-module move)
- `npx vitest run` (full, after `npm run build`) → **1484 passed / 3 failed / 4 skipped**; the 3 failures + 1 collection failure are `tests/citation-entries.test.ts` + `tests/file-ingest.test.ts` (web ingest, pre-existing at BASE 21f6233 — re-verified by stash-run on the pristine tree this session)
- `npx tsc -p tsconfig.json --noEmit` → clean; `npx eslint <all changed files>` → exit 0
