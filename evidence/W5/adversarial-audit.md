# W5 Independent Adversarial Audit — FAR-Lab (2026-08-21)

- Auditor: independent adversarial auditor (W5). Authored none of the audited code/evidence.
- Method: repository + `.far-run/far.db` (temp copy, read-only) + live network (Crossref) + live server/GUI drive + full test-suite rerun. No repo mutation; one-off scripts ran outside the workspace (`%TEMP%/far-audit/`).
- Audited claim surface: `project-spec/ACCEPTANCE.md` (ACC-01..20) + `.control/ACCEPTANCE_STATUS.json` (17 live_verified / 2 tested / 1 not_started; completion gates G-01..07 all unsatisfied).

## Executive verdict

**PASS (conditional) — the "fake completion" hypothesis is NOT confirmed.**

The strongest attacks failed: citations are genuinely grounded (58/58 claims independently re-verified against stored abstracts; 3/3 DOIs live-resolved at Crossref with verbatim quote presence), the revision loop is causally real (v0→v1 diff driven by expert feedback, full v0 archived content-addressed), resume/cancel is evented and real, `test-stub` is unreachable from production paths, 186/186 tests re-ran green in this audit, and the web GUI was live-driven against the real API with no dead controls or fake progress. Crucially, the workspace has **not** claimed completion (`node zcode-harness/scripts/completion-gate.mjs` → `NOT_READY`, exit 1, ACC-20 honestly `not_started`).

**One P1 provenance violation** was found on an acceptance-cited artifact (below) plus six P2 items. No P0.

---

## Attack surface results

### 1. fake data / mock leakage — **PASS**

- `grep -rniE "mock|fixture|demo|synthetic|fake|stub" src/` → only: test-stub.ts (marked TEST-ONLY), doc comments, and test seams (`providerOverride`, `executor`) that default to the live path (`src/app/composition.ts:69` `opts.providerOverride ?? named ?? defaultLiveProvider()`).
- `TestStubProvider` reachability: `src/providers/index.ts:55-64` — `defaultLiveProvider()` **throws** on `test-stub` or unknown names ("refusing silent fallback"). `getProvider('test-stub')` returns an EMPTY script whose first call throws (`test-stub.ts:48-53`). CLI (`src/cli/main.ts`) and server (`src/server/main.ts`→`createApp()`) never pass `providerName`/`providerOverride`.
- Production receipts audit: all 236 receipts across 6 runs have `executionMode:"live"`; 142 model calls all `deepseek/deepseek-chat` (DB query, temp copy). No `test`/`demo` mode receipt exists in production state.
- Tests write to `os.tmpdir()` mkdtemp dirs (`tests/api.test.ts:386`, `tests/verify.test.ts:23`) — no production-data pollution… except one object-level anomaly covered in §9/P1.

### 2. hard-coded success / silent green — **PASS**

- Provider core `src/providers/http.ts`: fail-closed classification, bounded retries (≤2 transport, 1 corrective), HTTP-200-with-malformed-body is a FAILURE (`parseSuccessBody` returns failure when no `choices[0].message.content`), missing API key → `authFailClosedResult` (no fabricated output). No path converts failure into success.
- `src/pipeline/llm.ts:71-74`: provider failure throws → orchestrator marks stage failed, run `partial`, `lastError` persisted (`orchestrator.ts:142-157`). No swallow.
- `applicable()`-based skips are semantically sound (feedback/revise skip without signals; verify skips only when all verified; export skips only when newest bundle already reflects latest revision — `export.ts:427-437`). Missing handler → stage stays pending and blocks completion (`orchestrator.ts:114,160-162`).
- Deterministic gates are real: `align.ts` (quote↔abstract Jaccard≥0.8 window), `falsify.ts` completeness check (non-trivial fields + decidable-semantics regexes) — `hyp_bjps30gs` honestly failed it (`completenessCheck.passed=false`, `testability=untestable_currently`).

### 3. citation authenticity — **PASS (decisive)**

Independent re-implementation (not the product's code) on a temp copy of `.far-run/far.db`:

- run_7zez1a8ezbbrrgw9begtta0gsw: 15/15 `verified` claims re-checked — 15/15 verbatim substring, jaccard 1.000, 0 mismatches.
- All 6 runs pooled: 58/58 verified claims re-verified (55 verbatim + 3 fuzzy 0.933/0.946/1.000 ≥ 0.8 — e.g. `clm_vfn36j72…`, `clm_p4jkf42…`, `clm_aqk8sexj…`); 0 stored-verified claims failed my recheck.
- Live Crossref (HTTP 200): `10.3390/antibiotics12020328` → "Horizontal Gene Transfer of Antibiotic Resistance Genes in Biofilms" (MDPI 2023, Michaelis & Grohmann), abstract contains claim quote verbatim; `10.1139/cjm-2018-0275` → "Horizontal transfer of ARGs in clinical environments" (CSP 2019), quote "11 of the top 12 priority … naturally transformable" present; `10.1111/j.1574-6976.2008.00136.x` → "Genomic islands: tools of bacterial horizontal gene transfer and evolution" (2009). No hallucinated source found in sampling.

### 4. counter-evidence / falsification substance — **PARTIAL (P2)**

- Substance: 56 relations (41 supports / 11 contradicts / 1 weakens / 3 qualifies); every `contradicts` links a REAL claim to a REAL hypothesis (claimId+targetHypothesisId), e.g. clm_zf8d… ("conjugation greatest influence") counter to the transduction-primary hypothesis. Falsification specs are quantitative and specific (support/weakening/falsification thresholds, confounders incl. "Co-infection or clonal outbreaks…", alternative explanations, data requirements). Latest bundle report §4 renders counter-evidence WITH claim text + source title.
- Defect: the persisted relation records carry a **hardcoded template rationale** — `src/pipeline/stages/falsify.ts:195-196` writes `'critique-linked counter evidence'` for all 12 counter relations, `strength=unrated`. The W1-era evidence report (`evidence/W1/run_7zez…report.md` §4) renders these as contentless lines ("[contradicts] critique-linked counter evidence（strength=unrated）" ×12); the claim-text rendering fix exists only in the later export code/artifact. The model's reason for each counter link is not persisted on the relation.

### 5. revision / version diff authenticity — **PASS**

- Feedback `fbk_zeq8wca…` (human_expert, clonal-confound critique, 12:01:52) → 3 live revise model calls → `rev_em5sy9rk…` (12:02:31) → v1 hypothesis.
- Causal content is real: v1 statement adds "…but only after ruling out clonal expansion as an alternative explanation for observed ARG matches"; two new assumptions (a0 near-identical matches insufficient, a1 SNP-typing controls) map 1:1 to the feedback text; plan got SNP-typing/phylogeny steps and amended decision rules; `VersionDiff.changedFields=[statement,mechanism,assumptions,predictions,uncertainties,version]`.
- v0 is NOT lost: revision operations archive full pre-revision objects content-addressed (sha256:7546ac93…/c7bfbdf17… — both artifact files exist, mtimes 20:02). qualityDelta honestly labeled "LLM self-assessment … calibration: uncalibrated".

### 6. fake resume / provider fallback — **PASS**

- run_7zez event stream proves real failure→resume→attempt-increment: seq 28 `stage_failed build_evidence (partial)` → seq 29 `run_resumed` → attempt 2; generate_hypotheses failed twice (seq 37, 41) before success; final pass attempt=2 visible on rank/plan/etc. W2 cancel/resume evidence files corroborate cross-process cancel (`cancel-demo-run.txt` … `cancel-resume5.txt`).
- `orchestrator.ts:74-92`: completed run reopens only when new feedback exists; plain resume is a no-op. Cancel is checked between stages and persisted (`cancelRequested`), consumed on cancel.
- Bookkeeping defect (P2): on stage completion `setStage(..., rec?.attempt ?? 1)` (`orchestrator.ts:128`) resets the attempt counter to its pre-start value — final run doc shows `attempt=1` while events show `attempt=2`. Events stay truthful; run doc understates retries.
- Observed quirk (explained, not a current defect): seq 82-83 export skipped 14ms after revision creation (12:02:31) — the then-deployed export `applicable()` predated the "revision newer than bundle" rule added in commit c656699 (20:04); a resume 36s later re-exported correctly (bnd_wsavs, full receipt+events).

### 7. UI fake interactions — **PASS**

- Code: every button maps to a real API call (`web/src/api/endpoints.ts` covers the full `/api/v1` surface; `RunControls` cancel/resume POST, `FeedbackForm` POST /feedback, `ProvenanceTab` GET /verify + real bundle download). Progress is determinate-only `<progress max={total} value={done}>` (`common.tsx:125-131`); no decorative charts/canvas/fake terminals (`grep -niE "chart|svg|canvas|fake"` → none).
- Live drive (this audit, Playwright against `node dist/server/main.js` on 127.0.0.1:18790): GUI loaded real runs (6, 9/9 stages), run_7zez detail: cancel disabled with honest reason "不可取消：run 已处于终态（已完成）"; 证据 tab renders all 15 verified claims + "反证与削弱关系（12）"; feedback form live. No dead controls found.

### 8. documentation overclaim — **PARTIAL (P2)**

- Honest positives: completion NOT claimed (gate NOT_READY; gates all false); P5 fabricated-taxon abstention is real and preserved (0 claims, 0 hypotheses in final DB state; `plan "no defensible hypotheses"`); baselines' 94.4% unsupported-citation claim is consistent with the recorded JSONL evidence structure; scorecards carry per-dimension producer + `calibration=uncalibrated_llm_judgment`.
- Inconsistencies found:
  - ACC-05 evidence text "2 real runs 24/24 claims verified-aligned" — DB reality: 15 (run1) + 4 (run2) = 19. The SUBSTANCE is right (all are verified; pooled 58/58 re-verified by me) but the number is not reproducible.
  - `evidence/W4/evaluation-report.md` (mtime 21:08) documents 3/6 completed with P4/P5/P6 failures; post-report fixes (commit 1522579 "eval fixes … all 6 problems complete") re-resumed P4/P6 and `eval/results/metrics.json` was recomputed at 15:17Z (23:17 local) showing **6/6 completed**. The two ACC-18 evidence artifacts are mutually unreconciled (3/6 vs 6/6). Failures ARE preserved in the report/events, so this is evidence-set inconsistency, not fabrication — but a reviewer citing both sees contradictory headline numbers.
  - `.control/EXECUTION_STATE.json` stale (mtime 20:18): still says phase W3, CP-005/CP-006 OPEN, nextAction "Commit W0 baseline…" — contradicts W4 completion and ACCEPTANCE_STATUS (23:18). Constitution §8 requires reconciliation.

### 9. acceptance evidence pointers — **PASS with 1 P1**

Every pointer file exists and is content-relevant (checked: `project-spec/COMPETITION.md` verified-header 2026-08-21; `evidence/W1..W4/*` incl. gui-*.png, security-audit.md, evaluation-report.md; `eval/results/metrics.json`; test files; `far verify` reproduced 10/10 by this audit). Tests re-run: **186/186 passed** (`npx vitest run`). Security fixes verified in code (F-1 Host/Origin/Content-Type guards `api.ts:571-587`; F-2 untrusted-data random fence `http.ts:98-105`); `secret-scan.mjs` PASS (remaining MEDIUMs are masked-env reads / `test-fixture-key-ds`).

**P1 — acceptance-cited bundle created outside the audited production path:**

`bnd_8czp2z9tmzkwanx6h4bd6kmp4c` (run_7zez, objects.created_at `2026-08-21T12:00:01.173Z`) is the bundle ACC-14 cites ("far verify 10/10 verified on bundles bnd_8czp2z9t (run1)"). Systematic cross-check of all 8 bundles in the DB: it is the **only** bundle with NO export receipt within ±10s and NO events around its creation (event seq 71 = 11:37:20 → seq 72 = 12:01:52; no receipt between 11:38 and 12:01:55; its report artifact `a6daea8d…` and bundle artifact `fc06e28a…` have mtime 20:00:01, immediately after the 19:59:52 hash-basis migration re-put of source artifacts). `export.ts:execute` always records a receipt BEFORE `putObject('bundle')`, so no in-repo production path can produce this row. The bundle's CONTENT is internally consistent (37 real receipts, real artifact hashes, lock hash matching the then-current package-lock) and it does verify 10/10 (reproduced), but the artifact was inserted out-of-band (most plausibly a one-off re-export during the W2 "hash-basis fix", commit c656699 20:04) — violating the workspace's own append-only provenance discipline for the exact artifact cited as reproducibility evidence. Mitigation exists in-repo: `bnd_wsavs0jq…` (12:03:07, full receipt+event chain) also verifies 10/10 (reproduced), as does run2's `bnd_w7nm9je5…`.

### 10. duplicate production paths / architecture authority — **PASS**

- CLI (`src/cli/main.ts`), HTTP API (`src/server/api.ts`), and Web (`web/` → `/api/v1`) all sit on the ONE app kernel: `createApp()` (`src/app/composition.ts`) → single `Store` over one SQLite db (`D-004` facade), single artifact store, single provider plane, one orchestrator. The API docstring names the CLI as the behavioral reference and mirrors its validation (verified by reading both feedback/cancel/resume paths). `verifyBundle` is shared by CLI and API. Web adds no second state authority (normalize layer is a projection).
- `FAR-Lab_ZCode_Control_Plane_2.0.0/` at root is the harness/plugin copy, untracked by the final hygiene commit — not a production authority.

---

## Defect list

| # | Severity | Defect | Location / Evidence |
|---|---|---|---|
| D-1 | **P1** | ACC-14-cited bundle `bnd_8czp2z9t…` written with no export receipt and no event-audit entry (out-of-band insert during hash-basis migration window) | `.far-run/far.db` objects/events/receipts cross-check (see §9); artifacts mtimes 19:59:52→20:00:01 |
| D-2 | P2 | Counter-evidence relations persist a template rationale ("critique-linked counter evidence") + strength=unrated; W1 evidence report renders contentless counter lines | `src/pipeline/stages/falsify.ts:195-196`; `evidence/W1/run_7zez…report.md` §4 |
| D-3 | P2 | Stage attempt counter resets on completion (run doc shows attempt=1 where events show attempt=2) | `src/app/orchestrator.ts:128` vs events seq 58/61/… |
| D-4 | P2 | ACC-05 evidence text "24/24" not reproducible from DB (actual run1+run2 = 19; all verified) | `.control/ACCEPTANCE_STATUS.json` ACC-05 vs DB claim counts |
| D-5 | P2 | Evaluation report (3/6 completed) vs recomputed metrics.json (6/6 after post-fix re-resumes) mutually unreconciled under ACC-18 | `evidence/W4/evaluation-report.md` §2/§4 (mtime 21:08) vs `eval/results/metrics.json` computedAt 15:17Z |
| D-6 | P2 | `.control/EXECUTION_STATE.json` stale (phase W3, CP-005/006 OPEN, W0-era nextAction) vs W4-complete reality | file mtime 20:18 vs W4 evidence/commits 23:18 |
| D-7 | P2 | Abstained run (P5) ends `status=completed` with skipped middle stages — semantically an abstention; list-level status alone can mislead (detail tabs disclose it) | run_9w34j5fs events seq 335-397; evaluation-report §5 notes the gap |

**No P0 found.**

## Required repairs (minimum)

1. (D-1) Re-evidence ACC-14 on the fully evented bundle `bnd_wsavs0jq…` (or a fresh product-path re-export), and append a documented explanation of the 20:00 out-of-band re-export to W2 evidence — or restore receipt/event rows for `bnd_8czp2z9t…` via an explicit, marked migration note. The product's own standard ("attempts are provenance facts") must apply to its evidence artifacts.
2. (D-2) Persist the model's per-relation reason (or a deterministic derivation of it) on counter/support relations instead of the constant string.
3. (D-4/D-5/D-6) Reconcile numbers: fix ACC-05 text to the reproducible count; add a post-fix addendum to the evaluation report (or recompute table) stating metrics.json reflects post-fix re-runs while §2/§4 preserve the original failures; refresh EXECUTION_STATE.json to W4-complete reality.
4. (D-3) Keep cumulative attempt counts in the run doc (`attempt` should not regress on success).

## Closest-to-success attack stories

1. **The orphan bundle (landed, P1).** Hunting why ACC-14's "10/10 verified" bundle existed at all: every other bundle had a receipt+event twin; `bnd_8czp2z9t…` had neither, born 9 seconds after a migration script re-hashed the artifact basis. The verification tool cannot see creation provenance (it checks internal consistency only), so a hand-inserted green evidence artifact passes `far verify` — exactly the blind spot an append-only audit exists to close. It became acceptance evidence for ACC-14.
2. **The 3-vs-6 completion gap (landed, P2).** The evaluation report pre-declares "no rerun-to-success; failures kept" (3/6 completed, P4/P5/P6 partial) — then fixes land, the failed runs are re-resumed to 6/6, and metrics.json is silently recomputed at 23:17 while the cited report still says 3/6. Neither artifact is false alone; together they let ACC-18 borrow whichever number flatters.
3. **The template counter-evidence (landed, P2).** "11 contradicts relations" sounds like substantive counter-evidence work, but every relation's persisted rationale is the same 8-word constant from `falsify.ts:195`, and the W1 report (the file ACC-06 points at) renders twelve identical content-free lines. The substance survives only through the claim-join — strip that and the "counter-evidence" layer is a link table with boilerplate.

All three attacks found real defects, none rose to P0: the underlying capabilities (grounded citations, causal revision, evented recovery, live UI) survived independent recomputation end-to-end.
