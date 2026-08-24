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
| 7 | **Chase was 1-hop only** — method-lineage depth (the methodology BEHIND the method paper) unreachable | Bounded depth-2 backward chase (`planHop2Seed`: first chase-added resolvable entry, insertion order; ≤2 refs; 1 seed max). Worst-case chase cost: ≤11 HTTP requests/run (3 seeds × [refs+batch+cites] + hop-2 [refs+batch]); `CHASE_MAX_NEW=8` caps NEW POOL ENTRIES (not requests). Forward-of-forward deliberately excluded (recency noise, not lineage). Persisted `fusion.citationChase.hop2 {seed, added}` |
| 8 | **Retracted papers competed for cap seats** — retraction only demoted claims AFTER verification; a retracted high-citation search hit could displace valid evidence from the 12-doc cap | Search-time demotion: `retractionStatusFrom` moved to shared `src/sources/retraction.ts` (verify re-exports; resolve-time stays authoritative); retracted pool entries partitioned out of `selectFinal` competition, appended only when the pool cannot fill the cap (visibility over silent drop); top-level `SourceDocument.retractionStatus` hint persisted; `fusion.retractedDemoted` + summary line. Signals: Crossref `update-to` (richer classification) + OpenAlex `is_retracted` boolean fallback (frontier cand.1 — extends coverage to the primary evidence family at zero request cost; strict-boolean, never overrides update-to; documented false-positive window ⇒ hint semantics) |
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

Supporting suites: `tests/citation-chase.test.ts` (35 cases incl. hop-2 seed selection/DOI fallback/abort classification pinned to the REAL SourceAdapterError 429 message shape/pubtype maps/chase adapter request shapes), `tests/sources-fulltext.test.ts` (33 cases incl. figDesc retention, alttext equations, JATS caption survival, table-body still dropped), `tests/retraction-gate.test.ts` (10 cases: 6 original + 4 `is_retracted` fallback/precedence/no-coercion), `eval/retrieval-baseline.mjs` (BEIR-provenance nDCG@k/MRR/recall_cap/hole over persisted runs — the judgment-based layer for live corpora).

## 3c. Independent adversarial audit (farlab-control-plane auditor, 2026-08-24)

Verdict **VERIFIED_WITH_ISSUES** — all capability claims independently reproduced (79/79 lane tests re-run at audit time, tsc/eslint/build/full-suite reproduced, BASE pre-existing failures confirmed via a temporary BASE worktree). Issues found and FIXED in this lane's final commit:
- P2-1 "chase ≤8 requests/run" was wrong arithmetic (confused the pool-addition cap with request count) → handoff corrected to ≤11 requests / 8 new-pool-entries (above).
- P2-2 aborted chase requests carried no receipt → `failedReceipt` added to all three abort branches (attempts are provenance facts).
- P3: retraction-gate count misquoted as 4 (real 6, now 10); tautological `recall` assertion removed (per-gold loop is the real assertion); `counterSeatsKept` pinned exactly to the engineered 4; `isChaseAbortError`↔`SourceAdapterError` message-format coupling pinned by test.
Audit noted (accepted, no action): rerank identity permutation tests the pipeline not ranking quality (documented in-test); the fixture benchmark is the only known-answer evidence until the judged-qrels layer (frontier cand.4, live-blocked).

## 3d. Frontier sweep (farlab-control-plane scout, 2026-08-24) — saturated for this surface

Accepted candidates:
1. **OpenAlex `is_retracted` read** — EXECUTED (§3-8): one-branch fix, extends retraction demotion from Crossref-family-only to the primary evidence family at zero request cost. Sources: OpenAlex docs; Hauschke & Nazarovets 2025 (doi:10.1177/0165551525132247) documents a false-positive window in the flag → integrated as hint-only, never overriding update-to. Live payload check rides the same first-live-run receipt review as the citation endpoints.
2. **Retraction Watch CSV as offline authoritative retraction table with REASONS** (effort S/M; NOT executed) — gitlab.com/crossref/retraction-watch-data (~66k retractions, updated weekdays): closes the arXiv/no-update-to coverage gap (§6.5) and feeds misconduct-vs-honest-error into the GRADE floor / uncertainty notes. Integration + sample-fixture tests offline-buildable NOW; the real dataset fetch needs a network window (BLOCKED-live component).
3. **Cache-exclusive exact-replay mode** (effort S/M; NOT executed) — `source_response_cache` already persists raw JSON; a `replayFromCache` run mode (network disabled, cache-miss = explicit failure, receipts marked `cache=replay`) upgrades provenance claims from "replay metrics over projections" to deterministic byte-identical re-execution. Prerequisite: wire `cachedSearch` over chase queries (§6.1). Fully offline-verifiable.
4. **Judged-qrels accumulation layer** — DEFERRED, live-blocked (LLM judging of live-run corpora; tools exist: `eval/llm-judge.mjs`, agreement/variance harnesses). Changes benchmark-strength claims when executed.

Rejected with re-evaluation triggers: dense/hybrid embeddings (SPECTER2/ColBERTv2 — no measured recall failure at the 12-doc cap; trigger = candidate-4 qrels showing one), Semantic Scholar S2AG as 5th family (1 RPS key limit, relation classification already LLM-owned; trigger = measured relation-classification failure), publisher-authority/altmetrics (contradicts the evidence-over-prestige rerank instruction), scite (commercial key; subsumed by S2AG candidate), full OpenAlex/S2AG snapshots (scale mismatch), Crossref `relation` preprint↔published links (residual narrow gap below decision threshold — noted for the main Agent), MinHash shingle-floor raise (already conditional in §6.2, no decisive change).

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

1. **Chase is OpenAlex-only and uncached** (worst case ≤11 HTTP requests/run incl. hop-2 — 3 seeds × [refs+batch+cites] + hop-2 [refs+batch]; `CHASE_MAX_NEW=8` caps new pool entries; aborts on 429/budget with the abort attempt receipted). Wire `cachedSearch` over chase queries if live runs show repeat pressure.
2. **MinHash short-abstract sensitivity (observed via benchmark)**: the 0.5 merge threshold assumes abstract-mass dominance; records with short (~30-word) abstracts sharing boilerplate can false-merge. Real corpora (150+ word abstracts) are safe per the original calibration, but a `MINHASH_MIN_SHINGLES` raise (8 → ~20) is worth calibrating if metadata-heavy sources grow. The benchmark fixture documents this explicitly.
3. **Author/entity disambiguation** not addressed (author ids available in OpenAlex authorships but not captured) — low evidential leverage vs cost; revisit only if claim-level author reasoning becomes a requirement.
4. **Multilingual retrieval** stays English-query-only (by design for these engines); CJK same-title dedup covered by benchmark; TRANSLATED-title dedup needs embeddings and is deliberately not faked (documented in the benchmark case).
5. **arXiv-only records without OpenAlex/Crossref carriage still get no retraction check** — coverage now spans Crossref `update-to` + OpenAlex `is_retracted` (via mapWork's whole-object `normalized`), but a bare arXiv-id record surfaced only by the arXiv family carries neither signal. Retraction Watch CSV (§3d cand.2) closes this by DOI... arXiv-id-only records have no DOI either — full closure needs an arXiv→DOI mapping step; both documented follow-ups.
6. **Retraction demotion is best-effort at retrieve time** — fires only when the surfacing family carried `update-to` or `is_retracted` metadata; the OpenAlex flag has a documented false-positive window (hint semantics, never overrides update-to). Resolve-time verification remains the authoritative gate.
7. **Table BODIES still dropped from fulltext** (numeric mash): captions/descriptions/equations now retained; full table comprehension (cell-level) would need structured extraction — revisit only with a measured need.
8. **Supplementary materials not fetched** — fulltext routes cover the main document only (arXiv HTML / PMC JATS / GROBID TEI of the primary); supplementary-information PDFs (where methods details often live) are a separate acquisition surface with no keyless route for most publishers.
9. Live field-name verification of the three citation endpoints + the `is_retracted` live payload presence (§ Status) — first live run should watch one receipt.

## 7. Evidence (commands + outcomes)

Final state (after audit fixes + is_retracted):

- `npx vitest run tests/citation-chase.test.ts tests/retrieval-known-answer.test.ts tests/retraction-gate.test.ts tests/sources-fulltext.test.ts` → **84 passed** (35 / 6 / 10 / 33)
- `npx vitest run` (full, after `npm run build`) → **1489 passed / 3 failed / 4 skipped**; the only failures are `tests/citation-entries.test.ts` (3 test failures) + `tests/file-ingest.test.ts` (collection failure, `@citation-js/core` unresolvable) — web ingest, pre-existing at BASE 21f6233, independently confirmed by the adversarial audit via a temporary BASE worktree
- `npx tsc -p tsconfig.json --noEmit` → clean; `npx eslint <all changed files>` → exit 0
- Independent adversarial audit verdict: VERIFIED_WITH_ISSUES → issues fixed in final commit (§3c)
