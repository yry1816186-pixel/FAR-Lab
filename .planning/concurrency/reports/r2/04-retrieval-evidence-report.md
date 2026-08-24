# R2 Lane 04 — Retrieval & Evidence Intelligence Report

- **Branch**: `ws/r2/04-retrieval-evidence` (worktree `work/r2-04-retrieval-evidence`)
- **Base**: `baseline/parallel-r2` = `47cc373cf70f8314123816f993ef36edf3548e1f` (verified: worktree HEAD at creation matched `git rev-parse baseline/parallel-r2`; R2 delta proven planning-only via `git diff --stat baseline/2026-08-24 baseline/parallel-r2` → only `.planning/concurrency/`)
- **Date**: 2026-08-24 (late)
- **Scope owned**: `src/sources/**`, `src/pipeline/stages/{retrieve,evidence}.ts`, retrieval semantics per OWNERSHIP.md lane 04

## 1. Commits on the lane branch

| SHA | Subject | Nature |
|---|---|---|
| 5aa4b49 | feat(retrieval): citation chasing, publication types, saturation/diversity signals, replicability relations + known-answer benchmark | PORT (cherry-pick -x of residue `ebe3c37`) |
| 11e7b7a | feat(retrieval): hop-2 chase, retraction cap demotion, fulltext captions, full benchmark matrix | PORT (residue `cfa5168`) |
| 39198e4 | fix(retrieval): audit findings + is_retracted (frontier cand.1) | PORT (residue `22b02db`) |
| 60cddca | feat(retrieval): chase response caching + cache-exclusive exact replay mode (frontier cand.3) | NEW this round |
| ff12785 | feat(retrieval): offline Retraction Watch table with reasons (frontier cand.2) | NEW this round |
| (this commit) | docs(retrieval): R2 lane report + cross-lane handoffs | NEW |

Ports applied with `git cherry-pick -x` (original authorship + "(cherry picked
from commit …)" attribution in each message). Zero conflicts: the residue
base (`21f6233`, hx lineage) differs from the R2 base only by campaign/
artifact-diff/revise files with no overlap against the retrieval surface.

## 2. What this round delivered beyond the port

The ported lane state (9 capability gaps closed, independent adversarial audit
VERIFIED_WITH_ISSUES with fixes folded in, benchmark matrix over 12 case types)
is documented in `.planning/handoffs/RETRIEVAL.md` (came along with the port;
kept as the historical record). This round executed the two accepted-but-
unexecuted frontier candidates:

### Frontier candidate 3 — chase response caching + cache-exclusive exact replay (60cddca)

- `cachedValue<T>` generic core in `src/sources/response-cache.ts` (single
  implementation; `cachedSearch` is now a typed wrapper — no duplicate engine).
  Chase ops (`refs:` / `cites:` / `batch:` keys, limit 0 = no-limit) ride the
  SAME sqlite `source_response_cache` table and TTLs as planned searches.
  Fixes residue limitation §6.1 ("chase is uncached").
- **Replay mode**: `openResponseCacheStore(db, 'replay')` — never calls live;
  TTLs do not apply (byte-identical reproduction, not freshness); miss throws
  `ReplayCacheMissError`. Stage semantics:
  - planned-search miss → the whole replay refuses explicitly
    (`retrieve/replay: N of M planned search(es) missing … exact replay refused`);
    no failover attempts (every family serves the same cache).
  - chase miss → VISIBLE degradation: `fusion.citationChase.failure` + failed
    receipt + summary line; the planned corpus still replays.
  - every served retrieval receipted `cache: 'replay'` (enum extended from
    {hit, stale}; additive — old receipts parse unchanged).
- Honest scope boundary: this is SOURCE-layer replay. The LLM query plan and
  rerank calls are model-dependent and are NOT part of the replay guarantee
  (in tests they are the deterministic scripted stub).
- Proof (`tests/retrieval-replay.test.ts`, 3 tests, real stage code, zero
  network): byte-identical corpus reproduction with THROWING adapters
  (content-hash/title/query/chase/diversity sequences equal; adapter contact
  count 0; every retrieval receipt `cache=replay`); explicit refusal on empty
  cache; visible-only degradation when chase entries are absent.

### Frontier candidate 2 — offline Retraction Watch table with reasons (ff12785)

- `src/sources/retraction-watch.ts`: zero-dep RFC-4180 parser + table, format
  pinned against the dataset README fetched 2026-08-24 (20 columns;
  semicolon-separated lists; RetractionNature ∈ {Retraction, Correction,
  Expression of concern, Reinstatement}; OriginalPaperDOI may be
  blank/'unavailable'). Honest-error guards: missing required column throws
  naming the header; unavailable-DOI and unrecognized-nature rows are counted
  and skipped, never guessed; duplicate notices merge (strictest nature wins,
  reasons union in first-seen order). NO dataset bytes vendored (BLOCKED-live
  fetch; synthetic fixtures only).
- `retractionInfo(record, table?)` in `src/sources/retraction.ts` unifies the
  three signals with explicit precedence **update-to > Retraction Watch >
  OpenAlex is_retracted** (curated table outranks the boolean, whose documented
  false-positive window makes it the weakest); `retractionStatusFrom` stays as
  the status-only view (verify.ts re-export unchanged).
- Retrieve stage: table hit ⇒ demotion out of cap competition (same tier as
  the other hints) + `SourceDocument.retractionReasons`/`retractionClass`
  persisted + demotion summary line attributes the offline-table share.
- Evidence stage: `retractionUncertaintyNote(doc)` (exported pure function) —
  verification-gated retraction note; reasons ride the wording; the search-time
  hint speaks ONLY while unverified (a CLEAN resolution silences it — the
  false-positive window must not survive verification). GRADE floor stays
  resolve-time-verification-gated (conservative by design; reasons are visible
  in notes, not gating).
- Proof (`tests/retraction-watch.test.ts`, 21 tests): parser format cases
  (quoted commas/""-escapes/CRLF/semicolon reasons/BOM/case-insensitive DOI),
  classification conservatism, precedence matrix, note gating, and
  stage-integration (over-cap demotion with attribution; under-cap retention
  with reasons+class persisted; no-table = exact legacy behavior).

## 3. Evidence (commands + outcomes, run in this worktree)

- Setup gates: `npm ci` ×3 (root/web/tui) OK; `npm run typecheck` exit 0 and
  `npm run build` exit 0 on the PRISTINE base before any edit (INTEGRATION_RULES
  step 4).
- Port verification: `npx vitest run tests/citation-chase.test.ts
  tests/retrieval-known-answer.test.ts tests/retraction-gate.test.ts
  tests/sources-fulltext.test.ts` → **84 passed** on the R2 base.
- Lane suites after both new commits: same 4 suites + the 2 new ones →
  **108 passed** (84 + 3 replay + 21 retraction-watch).
- Full suite (`npm run build` then `npx vitest run`): **1515 passed / 1 failed
  / 4 skipped (1520)**. The single failure is `tests/storage-hardening.test.ts`
  RU-7.3 — a pre-existing TIME-BOMB test on the R2 base, mechanism-proven and
  handed off (see §4); lane commits touch no persistence file. Note: the
  citation-entries/file-ingest failures recorded on the old hx base do NOT
  reproduce here (web deps installed) — the R2 base is otherwise fully green.
- `npx eslint <all changed files>` exit 0; `npx tsc -p tsconfig.json --noEmit`
  exit 0.
- `node zcode-harness/scripts/secret-scan.mjs` → status PASS (only the known
  .venv oversized-file allowance); `node zcode-harness/scripts/path-hygiene.mjs`
  exit 0.

## 4. Handoffs

GIVEN (files in `.planning/concurrency/handoffs/`):
1. `r2-2026-08-24-from-04-to-13-storage-hardening-timebomb.md` — RU-7.3 is
   deterministically broken for every machine after 2026-08-24T12:00Z
   (`createRun` anchors the backwards-clock floor to real `Date.now()` via the
   `run_created` event; observed regressedSeconds = realNow−12:00Z). Proposed
   one-line test fix included. HIGH urgency: every full-suite run on this
   lineage shows 1 failure until it lands.
2. `r2-2026-08-24-from-04-to-12-replay-retraction-production-wiring.md` —
   production wiring request (composition): wire `ctx.responseCache` at all
   (currently test-only — finding), optional `FARLAB_RETRIEVAL_REPLAY` and
   `FARLAB_RETRACTION_WATCH_CSV` knobs. Engines complete + tested; proposed
   patch sketch included.

RECEIVED: none.

## 5. Conflict notes / shared-file discipline

- Files touched outside the strict lane-04 list, each additive and
  handoff-noted here per OWNERSHIP domain-edit rule:
  - `src/domain/source.ts` (12 stewards structure): +`retractionReasons?`,
    +`retractionClass?` on SourceDocument — optional fields; legacy objects
    parse unchanged. (Same pattern the residue used for `retractionStatus`.)
  - `src/domain/provenance.ts`: receipt `cache` enum += `'replay'` — additive
    enum extension; old receipts parse unchanged.
- `src/shared/ports.ts`: untouched this round (the residue's optional
  `citations` port came in via cherry-pick).
- No sibling files touched; commits use explicit file lists (no `git add -A`).

## 6. Deviations

1. **Residue port under rule 3**: the three retrieval commits listed in
   BASELINE.md's out-of-lineage residue table were ported by cherry-pick -x
   from `retrieval/evidence-lane` (tip 22b02db) instead of being rebuilt. The
   residue branch itself is untouched (read-only source). Deviating detail:
   BASELINE.md's truth table misprints the first SHA as `cbe3c37`; the real
   SHA is `ebe3c37` (worth a one-char fix in BASELINE.md by lane 15).
2. **Branch naming**: OWNERSHIP/INTEGRATION_RULES mandate `ws/r2/04-<slug>`;
   the mission prompt header said `ws/r2-retrieval-evidence/main`. The
   concurrency contract was followed (it is the R2 single source of truth the
   prompt itself defers to).
3. **Replay/chase cache mode + retraction table ride `ctx.responseCache`**
   (optional, feature-detected fields on a lane-04-owned interface) rather
   than a new StageContext field — zero edits to lane-06's `types.ts`;
   production construction goes through the lane-12 handoff.

## 7. Known limitations / honest state

- Live field-name verification of the three OpenAlex citation endpoints and
  `is_retracted` payloads, and the real Retraction Watch dataset fetch, remain
  BLOCKED-live (2026-08-23 no-live-API rule). All are coded against documented
  shapes with fixture tests; the first live run should watch one receipt each.
- Replay is source-layer only (LLM plan/rerank not replayed); a replay of a
  run whose plan differs from the recorded one will miss queries and refuse —
  by design, explicitly.
- The GRADE-floor decision stays verification-gated; RW reasons surface in
  uncertainty notes and document metadata, not as an additional floor trigger
  (documented conservative choice).
- Residue-era limitations still open (from the ported handoff): MinHash
  short-abstract sensitivity calibration, author disambiguation (rejected for
  now), translated-title dedup (deliberately not faked), table BODIES dropped
  from fulltext, supplementary materials not fetched, arXiv-id-only records
  without DOI get no retraction check even from the table (no DOI key).
- Rejected-with-triggers from the frontier sweep stand unchanged (dense/
  hybrid embeddings, S2AG 5th family, publisher-authority rerank signals,
  scite, snapshots).
