# R2 Lane 06 Report — scientific-reasoning (hypothesis/falsification/ranking/planning/revision methodology)

- **Branch:** `ws/r2/06-scientific-reasoning` (worktree `work/r2-06-scientific-reasoning`)
- **Base:** `baseline/parallel-r2` = `47cc373` (verified: lane first commit parents from it)
- **Date:** 2026-08-25
- **Scope owned:** `src/pipeline/stages/{scope,verify,hypotheses,hypothesis-dedup,falsify,rank,plan,plan-formal,revise,guard,shared,execute,feedback}.ts`, `src/pipeline/{llm,types}.ts`, `src/app/{evaluators,quality-gate,iteration,verify}.ts`, `src/server/hypothesis-ops.ts`, semantic edits to the listed `src/domain/*` files.

## 1. Commits (lane branch, in order)

| SHA | Subject | Kind |
|---|---|---|
| `f7db526`..`190be4c` | 7 cherry-picked commits (`-x` attribution preserved): campaign GO2–GO4, RU-12 structured diff, worktree-ignore chore, **science formal-evidence revival (f6f8077)**, **citation chase + prereg gate + eValue (2db6a24)** | residue PORT (rule 3) |
| `bdf21e2` | fix(forensics): sentence-scope extractMeanN — pseudo-GRIM falsely downgraded certainty | fix |
| `d285100` | fix(science): pin decode temperature on generation/cluster/novelty/falsify calls | fix |
| `50ac7ce` | feat(revision): wire revision-predicates + semantic material-delta in iteration | feat |
| `e91f00d` | feat(evidence): deterministic CI anchoring for D-018 contradiction judgment | feat |
| `44170fa` | feat(rank): deterministic evidence-body grounding replaces LLM self-score | feat |
| (this commit) | handoffs + lane report | docs |

## 2. Residue port (deviation note, rule 3/4)

The R1 science-intelligence residue chain `2dcc474^..2db6a24` (branch
`science/intelligence-layer`, worktree clean — not in-flight) was cherry-picked with
`-x` attribution BEFORE any lane work: the lane's audit surface must include the
already-fixed P0s (inert evidence-strength layer, broken contradiction closure,
dead `primary_falsified` rule, unpinned rank/revise decode, e_value hollow promise) or
every improvement would duplicate shipped residue (anti-pattern: rebuilding what
exists). File overlap with the R1-fusion delta was verified empty
(`git diff --name-only 91df82b baseline/parallel-r2` ∩ `...2db6a24` = ∅), and the
cherry-pick applied clean. The port carries two non-lane-06 commits (campaign GO2–GO4,
RU-12) as hard dependencies of the science commits — flagged for the Integrator, who
already lists them as build/hx residue to fuse (identical content lineage, so fusion
sees common history).

## 3. What the lane changed (defect → fix, all on the authoritative path)

### 3.1 P0 — deterministic evidence measurement now DRIVES ranking (was display-only)
`rank.ts`: the `evidence_grounding` dimension — largest composite weight (0.20) — was
an uncalibrated LLM self-score, while the deterministic evidence body (Σlog-LR band,
QBAF over relationStrength-v1, independent sources) was computed after ordering and
rendered as display only. Now: bodies are computed pre-scoring; `deterministicEvidenceGrounding()`
(pure, exported, band-base × QBAF mean, zero-sources → exactly 0) REPLACES the LLM
dimension (calibration `deterministic`, producer named, derivation in the rationale);
the scoring payload carries `evidenceBodyDigest` so other evidence-sensitive dimensions
are anchored to the measurement; `overallRationale` discloses which dimensions are
deterministic vs uncalibrated. Ladder semantics: counter bands ground BELOW neutral
(net counter-evidence is worse than no evidence).

### 3.2 P0 — revision quality is no longer LLM self-report
`revise.ts` + `src/domain/revision-predicates.ts` + `src/app/iteration.ts`: the RU-14
predicate module (decisionRulePreservation / falsifiabilityRetention / scopeDelta) had
zero production callers (not even re-exported from domain index — deep-imported now,
no index.ts churn). Wired: every hypothesis revision computes the predicate vector;
violations are disclosed monotonically on the object + stage summary + deterministic
`semanticFlags` on the VersionDiff entry. The iteration controller's no-material-delta
fingerprint gains `semanticRevisionChanges` (recomputed deterministically from
persisted version_diff entries: scope-field changes + predicate violations) — a
cosmetic rewrite loop now counts as no-delta and stops. Plan-revision `changedFields`
switched from insertion-order `JSON.stringify` to `canonicalJson` (the WP2 F1 fix the
hypothesis path already had; the plan path could fabricate changes from key order).
`IterationSnapshot.semanticRevisionChanges` is additive with `.default(0)` — legacy
records still parse.

### 3.3 P1 — pseudo-GRIM false downgrades (extractMeanN)
`stat-forensics.ts`: mean×n pairing was the full cross product over a quote — two
group statistics in one sentence produced 4 checks, 2 spurious, and spurious GRIM
INCONSISTENT stepped the claim's `gradeCertainty` DOWN via `forensicFails`. Forensic
checks are advisory, so precision outranks recall: a mean pairs with an n only within
the same sentence segment containing exactly one mean and one n; anything ambiguous
pairs nothing (honest silence beats a false certainty downgrade).

### 3.4 P1 — decode-temperature discipline closed
`hypotheses.ts` (3 strategy-generation calls → 0.7 deliberate sampling diversity,
clustering 0.2, diversity supplement 0.7, novelty labels 0.2) and `falsify.ts` (spec
authoring 0.2) — the same defect class the SCIENCE lane fixed for rank/revise. Every
`callStructured` site in `src/pipeline/stages/**` now pins temperature; a source-scan
regression test (`tests/judge-temp-pin.test.ts`) fails on any future unpinned call
site, plus locks the known judgment values (rank scoring 0 / pair judging 0.1 / revise
0 / evidence 0).

### 3.5 P1 — D-018 contradiction judgment gets a deterministic numeric anchor
`stat-forensics.ts` + `evidence.ts`: `ciPairContext()` (pure) extracts the CI-vs-CI
arithmetic between two quotes (disjoint / opposite-signs). When both quotes carry CIs
the pair payload rides `numericContext` (NON-OVERLAPPING = direct contradiction
evidence; overlap licenses nothing), and disjoint intervals get an idempotent
deterministic heterogeneity disclosure on BOTH claims **regardless of the LLM verdict**
(verified in-test with a `not_comparable` verdict). Also fixed in passing:
`extractStats` CI/point regexes now capture signs — difference-measure CIs span
negatives, and the old unsigned capture silently corrupted every downstream numeric
check on such quotes.

## 4. Evidence (commands + exit codes + key output)

- Setup gates (fresh worktree at `47cc373`): `npm ci` exit 0; `npm run typecheck` exit
  0; `npm run build` exit 0; `web && npm ci` exit 0 (required — 3 baseline test-file
  failures were missing web deps: `@citation-js/core` unresolvable; green after
  install: 17/17).
- Port verification: `npx vitest run tests/science-*.test.ts tests/plan-formal.test.ts
  tests/stat-forensics.test.ts tests/pipeline-{evidence,retrieve}.test.ts
  tests/campaign-*.test.ts tests/retraction-gate.test.ts` → **10 files / 137 tests
  passed**.
- Per-unit proof (all in-lane, worktree-local):
  - `tests/stat-forensics.test.ts` — sentence-scoping + signed-CI + ciPairContext
    arithmetic (lock tests: cross-product case → []).
  - `tests/judge-temp-pin.test.ts` — call-site/temperature count equality + value locks.
  - `tests/revision-quality-wiring.test.ts` — predicate flags through the REAL revise
    stage (falsifiability_retained:false on an unfalsifiable carried state; healthy
    revision flags retained:true + scope_delta naming fields); cosmetic-vs-semantic
    counting; legacy-snapshot default parse.
  - `tests/pipeline-evidence.test.ts` (new case) — not_comparable verdict still yields
    2 deterministic heterogeneity disclosures; summary line asserted.
  - `tests/science-rank-statistics.test.ts` (new block) — grounding ladder: zero-source
    → 0, mean(base, QBAF) exact values, counter<neutral ordering, full-band monotonicity.
  - `tests/pipeline-hypotheses.test.ts` (updated locked behavior) — deterministic
    override through the real rank stage: value 0.3 (1 unrated source) vs 0.0 exact,
    calibration `deterministic` on grounding / `uncalibrated_llm_judgment` on the rest,
    engineered composite tie 0.4600/0.4600 broken by deterministic grounding 0.3 > 0.0.
- Final gates: `npm run typecheck` exit 0; `npm run build` exit 0; `node
  zcode-harness/scripts/secret-scan.mjs` exit 0 (PASS). Full vitest suite executed in
  five alphabetical chunks (single-process full runs crash in this session's
  memory-constrained environment — tinypool spawn/heap OOM; chunking is semantically
  identical): **150 files / 1500 tests: 1449 passed / 15 failed / 4 skipped — every
  failure proven pre-existing or environmental, zero lane regressions**:
  - `tests/experiment.test.ts` 9, `tests/dataset-audit.test.ts` 3,
    `tests/cli-experiment.test.ts` 1, `tests/exploration-runner.test.ts` 1 — all
    real-python-sidecar tests failing with
    `ValueError: Out of range float values are not JSON compliant: nan`. **Decisive
    baseline proof:** a temp worktree at the untouched base tag `47cc373` (fresh
    `npm ci`) fails `tests/experiment.test.ts` IDENTICALLY (9 failed / 17 passed,
    same NaN ValueError) — the shared uv/python sidecar environment drifted after the
    morning baseline run (where these passed). Lane-10 surface; flagged in the
    06→10 handoff.
  - `tests/storage-hardening.test.ts > RU-7.3` 1 — time-dependent environmental
    failure (expects 3600; observed value varies with wall clock: 18245, 88123 across
    runs), reproduces at the untouched base tag; lane-13's file.
  - `tests/research-tools.test.ts > explore_code` 1 — heap-OOM flake under chunk
    pressure; **passes 4/4 when run isolated** (`--maxWorkers=2`, exit 0).

### Pre-existing failure (NOT lane-caused; lane 13's file)
`tests/storage-hardening.test.ts > RU-7.3 backwards-clock detection` expects 3600,
observes a wall-clock-dependent value on THIS machine at the R2 baseline itself (first
observed in the untouched-baseline full run 2026-08-25, before any lane edit). It
reproduces at the base tag, so it is environmental/pre-existing, in a lane-13-owned
file, and left untouched per hard rule 2. Same classification applies to the sidecar
family above (lane-10 surface, base-tag-proven).

## 5. Conflict notes (shared files this lane touched)

- `src/domain/stat-forensics.ts`, `src/domain/iteration.ts` — lane-06 semantic domain
  files per OWNERSHIP (handoff-note requirement satisfied by this report §3.3/§3.2).
- `src/domain/conformal.ts` — NOT edited; kept as the deterministic primitive, wiring
  handed to lane 10 (single-owner import, no copy).
- `src/pipeline/stages/evidence.ts`/`retrieve.ts` — lane-06-owned stage files; the
  ported citation-chase code inside `retrieve.ts` originates from the residue chain
  (lane-04 semantics, ported verbatim under rule 3 with attribution — Integrator
  reconciles 04-side at fusion).
- `tests/pipeline-hypotheses.test.ts`, `tests/science-rank-statistics.test.ts`,
  `tests/stat-forensics.test.ts`, `tests/pipeline-evidence.test.ts` — tests for
  behavior this lane changed (rule: edit tests only for behavior you changed).
- No web/, src/server/api.ts, orchestrator, experiment, provider files touched.

## 6. Handoffs

- **Given:** `handoffs/r2-2026-08-25-06-to-10-statistical-executors.md` (conformal
  wiring, Hartung-Knapp, Holm, RatingDistribution/entropy, executor-set widening) —
  status: open.
- **Given:** `handoffs/r2-2026-08-25-06-to-04-search-allocation.md` (allocateSamples
  wire-or-delete) — status: open.
- **Received:** none this round.
- **Suggested to 15 (not filed, low urgency):** extend `zcode-harness` prompt
  regression to lock `temperature:` call-sites repo-wide; lane 06's
  `tests/judge-temp-pin.test.ts` already covers `src/pipeline/stages/**`.

## 7. Deviations

1. Branch name `ws/r2/06-scientific-reasoning` (repo contract) instead of the goal
   prompt's template `ws/r2-scientific-reasoning/main` — matches lanes 01–04 and the
   Integrator's report path convention; recorded here as deliberate.
2. Residue port (see §2): 7 commits cherry-picked with `-x`; two of them (campaign
   GO2–GO4, RU-12) are outside lane-06 ownership but are hard prerequisites of the
   science commits — flagged for fusion reconciliation, not silently absorbed.
3. `domain/revision-predicates.ts` deep-import in `revise.ts` instead of adding a
   re-export to `src/domain/index.ts` (12's structural file) — minimal-churn choice.
4. Environmental incidents during the session, disclosed for the record: two shell
   cwd-drift episodes (one produced a transient false-green on the primary tree's old
   code; one appended a test block to the primary tree's
   `tests/science-rank-statistics.test.ts` — diff-verified to contain ONLY lane-06
   content and restored via `git checkout --` before any sibling exposure; primary
   `git status` for that file confirmed clean afterward). No sibling in-flight file
   was ever committed or modified beyond this restored case.

## 8. Unverified / remaining (honest)

- Live-LLM behavioral claims (e.g. that anchored payloads improve contradiction
  precision from the handoff-measured ~30%) are **BLOCKED-live** under the no-live-API
  policy; what is proven offline is the deterministic layer: anchoring reaches the
  payload, arithmetic disclosures fire verdict-independently, override exactness.
- Not attempted this round (recorded, prioritized): GRADE-domain proxies
  (imprecision=has-numbers etc.) beyond the strength mapping; n-solver/exact power
  (needs experiment-plane sample sizes); BCa bootstrap (percentile CI disclosed);
  hypothesis_diversity evaluator beyond strategy-count (MinHash cluster count would be
  the next step); entity normalization + language-bias disclosure (lane 04);
  rediscovery gold-set diversity (lane 14).
- Subagent parallel audit was quota-blocked (usage limit until 2026-08-29); the audit
  was executed solo by the main agent — four-cluster coverage maintained, wall-clock
  longer.
