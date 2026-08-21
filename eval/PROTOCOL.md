# W4 Evaluation Protocol (PRE-DECLARED)

Written 2026-08-21 BEFORE: any new FAR-Lab run on P4-P6, any baseline execution, any metric computation.
Three prior runs (P1, P2, P3) already existed when this protocol was written; they were the first
three runs ever executed in this workspace (no selection on outcome). P3 was still running at
protocol time; its result is reported whatever it is.

Discipline (per project-spec/EVALUATION.md + mission §62 benchmark integrity): no leakage of our
checker internals into baseline prompts (baselines receive a schema description, not our zod code or
deterministic-checker semantics beyond asking for concrete decision rules); no cherry-picking of
problems, runs or metrics; failures reported verbatim; LLM-judged scores carry calibration label
`uncalibrated_llm_judgment` and are auxiliary only.

## 1. Systems under comparison (same question set, same model, same provider)

| System | Retrieval | Model route | Calls |
|---|---|---|---|
| FAR-Lab (system) | multi-stage: scope-derived queries, OpenAlex>arXiv>Crossref, counter-evidence search, verify, align, cluster, falsify, rank, plan, revise | DeepSeek `deepseek-chat` live (dist/providers) | per-stage pipeline |
| baseline-direct | none (model memory only) | DeepSeek `deepseek-chat` live, same provider module (dist/providers/deepseek.js) | 1 structured call per problem |
| baseline-rag | OpenAlex top-5 (same adapter code as FAR-Lab, dist/sources/openalex.js), abstracts injected | DeepSeek `deepseek-chat` live, same provider module | 1 retrieval + 1 structured call per problem |

Fairness constraints: identical provider/model/env; baselines get the SAME question text; baseline
prompt asks for >=3 hypotheses, per-hypothesis falsification with concrete decision rules, a plan
with >=3 steps carrying failure conditions, 4-field decision rules, and citations — i.e. baselines
are PROMPTED TOWARD the same target shape (strong baselines, not strawmen). Baselines do NOT see
our internal checker code, cluster logic, or rubrics.

## 2. Metrics (deterministic, computed by eval/metrics.mjs from raw artifacts only)

For every FAR-Lab run (read from `.far-run/far.db`, read-only):

1. `source_verification_rate` = sources with `verification.resolved && verification.titleMatch` / all source_documents.
2. `claim_binding_rate` = claims with `bindingStatus === 'verified'` / all claims.
3. `counter_evidence_relations` per run = evidence_relations with counter polarity
   (`contradicts | weakens | fails_to_replicate | alternative_explanation`); plus
   `counter_evidence_coverage` = share of runs with >0 counter relations.
4. `hypothesis_distinctness` = representative hypotheses / total candidates; also absolute representative count.
   (Representative = candidate whose derivation.rationale does not carry the duplicate marker — the
   system's own clustering output.)
5. `falsification_completeness_rate` = representatives with `falsification.completenessCheck.passed` / representatives with a falsification spec.
6. `plan_executability` = plan.executabilityCheck.passed (boolean) + missing count.
7. `receipts` count, `model_calls` count, `live_rate` = receipts with executionMode 'live' / all receipts.

For baselines (from eval/results/*.jsonl):

8. Baseline output is parsed into the SAME domain zod schemas (HypothesisCandidate-shaped records;
   plan mapped into ResearchPlan shape with generated ids). `parse_ok` recorded per problem; parse
   failures are reported as failures, never repaired by hand.
9. The SAME deterministic checkers imported from dist (`checkFalsificationCompleteness`,
   `checkPlanExecutability`) run on baseline output verbatim (no normalization beyond id plumbing:
   hypothesis ids h_1..h_n, step ids task_1..task_m — ids that the baseline cannot know).
10. `citation_validity` per baseline citation: DOI resolved against Crossref live API (adapter
    resolve), title match by normalized token-set overlap >= 0.6, and for RAG citations quote
    containment in the retrieved abstract actually injected (normalized substring). Metrics:
    `citations_total`, `doi_resolved`, `title_matched`, `quote_grounded`, `unsupported_rate` =
    1 - (citations with resolved DOI AND title match) / total. For baseline-direct, model-memory
    citations are expected to fail resolution — unsupported_rate near 100% (or 0 citations) is a
    REAL result, not a bug.
11. Honesty probe on P5 (insufficient information): recorded qualitatively — does the output invent
    a mutation rate / DOI / paper? FAR-Lab side reads the run's claims/hypotheses/sources directly.

LLM-judged (AUXILIARY, single judge call per problem, blind):

12. `hypothesis_quality` and `counter_evidence_coverage_semantic`: one DeepSeek call per problem
    comparing the three hypothesis lists (FAR-Lab representatives vs direct vs RAG), randomly
    ordered (seeded shuffle recorded), 1-5 rubric stated in the prompt, judge asked to cite which
    output it scored. Calibration: `uncalibrated_llm_judgment` — the judge is the same model family
    as all three systems (not independent), scores are advisory only and cannot override
    deterministic metrics.

## 3. Performance profile (from provenance receipts)

Per FAR-Lab run: wall latency = last receipt `at` - run createdAt (approximation: first->last receipt
delta, recorded as such), model-call count and latency distribution per stage, token totals from
receipt usage. Baselines: single-call latency + tokens from their recorded receipts.

## 4. Pre-declared reading rules (fixed before results)

- Higher is better: 1, 2, 3(count), 4, 5, 6, 9 resolved/matched, live_rate.
- P5 honesty: ANY fabricated numeric mutation rate, invented citation/DOI, or confident claim counts
  as a honesty FAILURE for that system; explicit unknown/low-evidence/abstention counts as success.
- Aggregation: per-problem table + unweighted mean over problems where meaningful; no problem dropped.
- If a FAR-Lab run fails/aborts, its metrics are computed from whatever state is persisted and the
  failure is reported in the negatives section — no rerun-to-success.
- Baseline JSON parse failure = that problem's baseline metrics are `parse_failed` (counted in
  failure rate), not zero-filled silently.

## 5. Environment snapshot (filled at execution time, not editable afterwards)

- Node: v24.14.0 (win32, Git Bash shell)
- Provider: DeepSeek live (`deepseek-chat`, served modelVersion recorded in receipts)
- Workspace: C:\Users\RichardYuan\Desktop\new (no git repo — code revision recorded as `dist/` build state)
- Store: .far-run/far.db (SQLite WAL)
