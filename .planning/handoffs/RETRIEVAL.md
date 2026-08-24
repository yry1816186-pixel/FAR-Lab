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
- Retrospective replay benchmark (`eval/retrieval-baseline.mjs`, BEIR-provenance metrics over persisted runs)

## 3. Gaps found → capabilities built this lane

| # | Gap (with evidence) | Delivered |
|---|---|---|
| 1 | **Citation chasing absent** — `cited_by` appeared only in volatile-exclusion lists; no `referenced_works`/`cites:` usage anywhere | `CitationChaseAdapter` port (optional on `SourceAdapter`, feature-detected); OpenAlex implementation (`referencedWorkIds` via `select=referenced_works`, `citingWorks` via `filter=cites:` + explicit `cited_by_count:desc` sort, `worksByIds` batch ≤50); bounded chase in retrieve stage (seeds ≤3: top-2 fused + first counter-origin; ≤3 refs + ≤5 cites per seed; ≤8 new pool docs; aborts on budget-429; every search receipted incl. 0-result) |
| 2 | **Publication type invisible** — adapters never read `type`; reviews/preprints/errata pooled as undifferentiated | `PublicationType` canonical enum; per-family mapping (`src/sources/pubtype.ts` single source); persisted on `SourceDocument.publicationType`; visible to listwise rerank; counted in diversity |
| 3 | **No saturation signal** — nothing measurable on diminishing returns | Novelty rate per record-bearing search (share new-to-pool at flush); `saturationMetrics` (mean + tail-mean, saturated = n≥4 ∧ tail<0.2); persisted `fusion.saturation` + summary line; decision input for gap-seek/iteration, never a silent stop |
| 4 | **No corpus-diversity observation** — single-family corpora possible and unobservable | `diversitySnapshot` (family counts + max-family concentration, year spread, publication-type mix) persisted `fusion.diversity` + summary line. Measurement first; enforcement deliberately NOT added without a measured pathology |
| 5 | **REPLICATES / FAILS_TO_REPLICATE structurally unproducible** — stance enum 4 values; cross verdicts persisted only 3 | Cross-relation verdicts extended with anchored definitions (independent reproduction w/ new data ≠ agreement; failed replication requires explicit replication language); both now persist as `EvidenceRelation` |
| 6 | **No known-answer benchmark** — existing eval replays historical runs only | `tests/retrieval-known-answer.test.ts`: full REAL retrieve stage over a fixture universe with known gold set — recall@cap 5/5 (incl. chase-only gold), counter-recall 2/2, version/preprint merge (arXiv preprint + DOI published = 1 entry, poolSize-pinned), hard-negative non-merge, citation-chain reachability, ≥3-family diversity, 1998–2024 year spread, saturation positive + negative controls, publicationType persistence, chase provenance (receipts + queries) |

Supporting tests: `tests/citation-chase.test.ts` (31 cases: plan bounds/counter-passthrough/dedup, workRef path-safety incl. hostile ids, abort classification, adapter request shapes incl. budget-429 no-retry, pubtype mappings, saturation/diversity pure functions).

## 4. Schema/contract changes (merge attention)

Additive only — all new fields optional, old objects parse unchanged:

- `SourceDocument.publicationType?: PublicationType` (new enum: primary_research/review/preprint/editorial_letter/book_chapter/correction/other)
- `RetrievalQuery.purpose` += `'citation_chase'`
- `RetrievalFusion` += optional `citationChase` / `saturation` / `diversity`
- `RawSourceRecord.publicationType?`; `SourceAdapter.citations?: CitationChaseAdapter` (shared/ports.ts)
- evidence stage: cross-relation verdict enum += replicates/fails_to_replicate (persistable set extended)

## 5. Boundaries respected / handoffs to other lanes

- **Scientific Intelligence lane** (sibling): search-strategy adaptivity from research state (mission §5) — this lane provides the deterministic signals (`fusion.saturation`, `fusion.diversity`, chase provenance) as inputs; an LLM advisory iteration planner remains theirs. The unused-but-reserved `methodological` query purpose is now trivially wireable if they decide method-paper searches are a distinct round type.
- **Web/UI lane**: `web/src/utils/ingest` citation-entries tests fail at BASE (3 cases, `parseCitationEntries` returns null) — pre-existing, verified by stash-test on pristine BASE; web ingest surface is that lane's territory, NOT fixed here.
- **Experiment Runtime / Statistics**: untouched.

## 6. Known limitations / follow-ups (honest)

1. **Chase is OpenAlex-only and uncached in v1** (≤6 requests/run, aborts on budget-429). Wire `cachedSearch` over chase queries if live runs show repeat pressure.
2. **MinHash short-abstract sensitivity (observed via benchmark)**: the 0.5 merge threshold assumes abstract-mass dominance; records with short (~30-word) abstracts sharing boilerplate can false-merge. Real corpora (150+ word abstracts) are safe per the original calibration, but a `MINHASH_MIN_SHINGLES` raise (8 → ~20) is worth calibrating if metadata-heavy sources grow. The benchmark fixture documents this explicitly.
3. **Author/entity disambiguation** not addressed (author ids available in OpenAlex authorships but not captured) — low evidential leverage vs cost; revisit only if claim-level author reasoning becomes a requirement.
4. **Multilingual retrieval** stays English-query-only (by design for these engines); CJK dedup normalization already handled.
5. **arXiv-only records get no retraction check** (no DOI → no Crossref update-to path). Withdrawal detection in arXiv abstracts not implemented (withdrawn papers surface rarely; publicationType=preprint already flags the weaker epistemic class).
6. Live field-name verification of the three citation endpoints (§ Status) — first live run should watch one receipt.

## 7. Evidence (commands + outcomes)

- `npx vitest run tests/citation-chase.test.ts` → 31 passed
- `npx vitest run tests/retrieval-known-answer.test.ts` → 2 passed (recall@cap + saturation negative control)
- `npx vitest run` (full, after `npm run build` for dist-dependent suites) → **1472 passed / 3 failed / 4 skipped**; the 3 failures are `tests/citation-entries.test.ts` (web ingest, pre-existing at BASE 21f6233 — verified by running the same files on a stashed pristine tree: same 5 files red there)
- `npx tsc -p tsconfig.json --noEmit` → clean; `npx eslint <all changed files>` → 0 problems
