# W6 · Fusions F1-F5 — execution evidence (2026-08-22)

All fusions landed AFTER the baseline harness (D-046 hard precondition). Sources, licenses,
mechanism file:line and probe data: `research/WAVE6-SCOUT.md` + `research/wave6-reports/`.

## Commands + evidence chain

1. **Pre-fusion baseline** (before ANY main-path change): `npm test` → 295/295 (19 files),
   `npm run typecheck` exit 0 — 2026-08-22 10:38 local. Frozen harness snapshot:
   `node eval/retrieval-baseline.mjs --db .far-run/far.db --out eval/results/retrieval-baseline-before-w6.json`
   → runs=46 pooledVerifyRate=0.9887 … zeroResultRate=0.4286 counterZero=1.
2. **Trigger probes (live, keyless)**:
   - crossref counter replay: `node spikes/crossref-counter-probe.mjs` → 68/68 ok, **0% zero,
     mean 6.0 results** (`spikes/output/crossref-counter-probe.json`).
   - arXiv truncation: `node spikes/arxiv-truncate-probe.mjs` → full 100% / k6 100% / k4 53.3% /
     k2 6.7% zero, mean 5.0 (`spikes/output/arxiv-truncate-probe.json`); relevance spot-check
     (`spikes/output/arxiv-variant-relevance.json`): k4 specific when nonzero, k2 broad with 1/8 drift.
3. **Fusion code** (all in W6-owned files): retrieve.ts (F1 routing + F2 cascade + F4 windows),
   verify.ts (F3 guard), fulltext.ts (F5 strip), domain/source.ts (3 optional schema fields:
   `wrongPaperSuspect`, `variantSearches`, `rerankWindows`).
4. **Post-fusion verification (W6 surfaces)**:
   - `npx vitest run tests/pipeline-retrieve.test.ts` → **29/29** (22 prior + 7 new W6 tests)
   - `npx vitest run tests/sources-fulltext.test.ts` → **28/28** (24 prior + 4 new)
   - `npx vitest run tests/retrieval-baseline.test.ts` → **10/10** (mutation-checked earlier)
   - `npm run build` emits W6 modules (build has UNRELATED errors in parallel-session files
     falsify.ts/orchestrator.ts — see §Cross-session state; W6 files typecheck-clean in isolation)
5. **Determinism replay + guarded-compare status (audit-corrected, D-056)**: the offline
   harness is a pure function of persisted runs — post-fusion code cannot move offline
   metrics without NEW runs. The same-DB replay
   (`eval/results/retrieval-baseline-determinism-replay-w6.json`) reproduces the before
   snapshot exactly, proving measurement determinism. **The W6 guarded gate is UNDISCHARGED
   until fresh live runs exist** (model routes blocked, D-036); the fusion's behavioral
   evidence today is the probe table below, not the guarded compare.
6. **Behavioral before/after (the fusion's actual claim, measured on the SAME historical query
   populations, not on frozen snapshots)**:
   - counter zero-result: arxiv path 82.3% (measured, 46-run receipts) → crossref path 0%
     (measured, 68/68 replay) — expected counterZero median 1/run → 0.
   - arXiv zero-result: 82.3% → cascade bound 6.7% on the previously-zero population
     (k2 floor), with specificity preference (full → k4 first).
   - Fresh end-to-end runs (verify-rate / pool composition / wall-clock) require live model
     routes — **BLOCKED by D-036, honestly recorded; no live claim made**.

## Adversarial audit + fixes (D-056, same session)

code-reviewer subagent verdict: REQUEST CHANGES — 2 P1 + 4 P2 + 3 P3; ALL fixed at root cause;
W6 suites 70/70 green including 5 new discriminating tests:

| finding | root fix |
|---|---|
| P1-1 cancel swallowed in windowed rerank (stage completed + persisted corpus after user cancel) | `guard.ts isCancellationError`; both retrieve catch blocks rethrow cancellation FIRST; e2e cancel-abort test (driven off real receipt state) asserts no corpus snapshot, no polluting receipts |
| P1-2 "after-w6" was an A/A file (offline metrics cannot move without new runs) | renamed `determinism-replay-w6.json`; guarded gate recorded UNDISCHARGED until live runs (D-056 supersedes D-047's adjacent wording) |
| P2-1 F5 punctuation rule glued prose parens ("results (n = 30)") | absorption only at actual marker removals (leading-space-aware regex); paren tests added |
| P2-2 cancel mid-cascade wrote fake 0-result receipt for an already-successful query | same cancellation rethrow; test asserts zero contradicting receipts |
| P2-3 harness zeroResultRate would be mechanically improved by cascade receipts | receipts carry `arxiv recovery variant` redactionNote; harness splits planned vs variant (new variantRecovery block); guarded metrics measure PLANNED quality only |
| P2-4 windowed-rerank splice-back untested | core extracted to pure `applyWindowedRerank` (permutation-invariant, input non-mutating, wrong-length rejected, mid-window failure propagates) + unit tests |
| P3-1 variant failures unreceipted, one error killed cascade | attempts counted pre-call, failures receipted with real httpStatus, cascade continues past transient errors |
| P3-2 wrongPaperSuspect had no consumer | export renders `⚠️wrongPaperSuspect`; harness counts `verification.wrongPaperSuspect` |
| P3-3 exact-12 corpus mislabeled truncated | poolSize-based flag; truncatedRate 0.8043→0.7391 (46 runs), before snapshot re-baselined with fixed metric definitions |

## Fusion notes for reviewers

- F2 variant searches enter the pool as additional RRF lists under the same target index
  (rank lists from the executed variant) — recovered docs rank via the list that found them;
  pool semantics unchanged otherwise.
- F4 window plan: `rerankWindowPlan(n, 24, 12)` — windows [n-24,n) … [0,24), processed
  bottom-first so the head window re-judges floated-up entries with max context; each window
  is a strict full permutation over its slice (applyRerank validation); any window failure →
  whole rerank fails visibly → deterministic RRF fallback (unchanged semantics).
- F3 never flips `resolved` (identifier-anchored authority, refchecker's own exemption rule);
  it surfaces `wrongPaperSuspect` + a signals note for downstream counting.
- F5 applies at extractor level (LaTeXML/TEI/JATS), BEFORE text is stored/archived; it changes
  future deepened-fulltext snapshots (content-hash basis = per-fetch record, no stored-snapshot
  breakage; see auditor check).

## Wall-clock honesty (north-star run-wall-clock owner)

F1 removes one arXiv call per run (counter[1] moved). F2 adds ≤2 arXiv calls per zero search
(~3.1s politeness each; typical run has 3-4 arXiv searches post-F1 → net ≈ +9s vs 360s p50
budget). F4 adds LLM windows only when pool >24 (median pool 23.5 → most runs unchanged).
No regression claim possible until live runs resume; cost recorded, gate armed.

## Cross-session state (recorded for closeout honesty)

The working tree hosts concurrent parallel sessions (W4 providers/llm.ts; W7/W8/W9/PRODUCT
artifacts; falsify.ts + orchestrator.ts mid-edit — `npm run build` currently fails THERE,
6 tests fail in THEIR files: orchestrator-attempt ×2, pipeline-hypotheses ×4). W6's own files
compile and their suites pass; this evidence doc certifies the W6 partition only. W6 commit
stages W6-owned paths exclusively.
