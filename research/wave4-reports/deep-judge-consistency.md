# Wave-4 Deep Dive: LLM-Judge Self-Consistency / Variance Reduction

Date: 2026-08-22. Scope: judge-consistency mechanisms in cloned repos (gemini-cli primary), FAR-Lab judge pain evidence, port-ready design for `eval/llm-judge.mjs`. All repos read as DATA (never executed). Every load-bearing claim carries file:line.

---

## 1. TL;DR

- **gemini-cli's entire mechanism is one 115-line class**: `evals/llm-judge.ts` — N *identical* parallel yes/no calls (`Promise.all`), plurality vote `yes > no && yes > other`, non-parseable outputs counted as `other` (never dropped), per-pass votes returned to the consumer. Default N=1, only one eval opts into N=3. Temperature is NOT pinned, so pass-to-pass variation is provider sampling noise.
- **gemini-cli has ZERO unit tests for the aggregation logic** — the only check is the live eval assertion itself. This is the single biggest thing NOT to port.
- opencode / deepseek-harness / OpenHands: **no LLM-judge machinery found** (search evidence in §3).
- FAR-Lab pain is real and documented: EV1 judge ±1–2pt per problem on identical data across shuffle seeds (W-EV1 evidence); rediscovery F1 ±0.5 from single-pass judge steps (W-EV2 evidence). Judge v2 (claim-match.mjs) already fixed the matching half; the EV1 quality judge (`llm-judge.mjs`) is still single-pass.
- **Port design**: extract a pure aggregation module (median-over-3 for 1–5 integer scales, lower-median when a pass fails, hard fail below 2 valid passes), vary only the blind-shuffle seed across passes (position bias is the dominant measured variance term), keep v1 output shape 100% additive-compatible, full deterministic offline test suite over fixture pass arrays.

---

## 2. gemini-cli deep dive (PRIMARY)

### 2.1 Judge architecture

File: `C:/Users/RichardYuan/Desktop/new/.cache/repos/gemini-cli/evals/llm-judge.ts` (Apache-2.0, header lines 2–5).

- **N passes, opt-in, default 1**: `JudgeOptions.selfConsistencyRuns?: number` — doc comment: "The number of parallel generations to run for majority voting. Defaults to 1. Use 3 or 5 for self-consistency." (`evals/llm-judge.ts:9-16`). Resolved at `llm-judge.ts:41` (`options.selfConsistencyRuns ?? 1`).
- **Parallel, not sequential**: `const promises = Array.from({ length: runs }).map(() => generateCall()); const rawResults = await Promise.all(promises);` (`evals/llm-judge.ts:70-71`). All N calls are in flight simultaneously; no early-stop.
- **Same prompt every pass — this is sampling self-consistency, not prompt/self-consistency variation**: each `generateCall()` closure sends the identical `question` contents and identical system instruction (`evals/llm-judge.ts:46-58`). No per-pass seed, no per-pass temperature, no prompt paraphrase. The only source of divergence is provider-side sampling.
- **Temperature not pinned**: the request sends only `modelConfigKey: { model }`, `contents`, `systemInstruction`, `promptId`, `role`, `abortSignal` (`evals/llm-judge.ts:48-58`) — no `generateContentConfig`/temperature reaches the call. Pass-to-pass variation therefore rides on the model config / provider default temperature (>0 by default; `packages/core/src/services/modelConfigService.ts:24-33` only discusses *override* mechanics, no judge default).
- **Judge model default**: `gemini-3-flash-base` (`evals/llm-judge.ts:42`) — a cheap fast model; cost discipline via model choice, not pass count.
- **Sole usage site**: `evals/snapshot_fidelity.eval.ts` — "Use LLM-as-a-Judge with Self-Consistency" (`snapshot_fidelity.eval.ts:109`), instantiated at `:110`, invoked with `selfConsistencyRuns: 3` (`snapshot_fidelity.eval.ts:128-130`). No other eval in the repo uses the judge (repo-wide grep for `LLMJudge|judgeYesNo|selfConsistencyRuns` outside `llm-judge.ts` returns only this file).

### 2.2 Aggregation

- **Vote counting with layered text normalization** (`evals/llm-judge.ts:77-103`): each raw response is uppercased and stripped of non-`[A-Z ]` chars (`:79`), then matched in priority order: `"THE ANSWER IS YES"` / `"ANSWER IS YES"` / `endsWith('YES')` → yes (`:80-86`); same for NO (`:87-91`); exact-trim `YES`/`NO` (`:92-95`); fallback scans standalone words (`:97-101`); anything else → `other++` (`:102`).
- **Decision rule — plurality, ties fail**: `const pass = yes > no && yes > other;` (`evals/llm-judge.ts:105-106`). A 1–1–1 split, a yes/no tie, or `other ≥ yes` all produce `verdict: false`. Conservative (fail-closed), though this is documented nowhere.
- **Non-parseable outputs are counted, never dropped**: parse failures become `other` votes (`evals/llm-judge.ts:96-102`); a transport/exception in a pass is caught and converted to the string `ERROR: ...` (`evals/llm-judge.ts:65-67`), which then counts as `other`. A pass can never vanish — but it can also never contribute signal, and `other=N` still fails the item rather than surfacing "judge broken" distinctly.
- **Binary only**: the judge answers a single yes/no question (`judgeYesNo`, `evals/llm-judge.ts:37-40`). No numeric-scale aggregation exists anywhere in the repo. `evals/statistics-helper.ts` has only `average`/`averageNullable`/`roundStat` (`statistics-helper.ts:15-26`) — mean over nullable numbers, no median/mode — and is not used by the judge.

### 2.3 Prompt design

- **System prompt — verdict-only, no CoT**: `You are a strict, impartial expert judge. ... You MUST answer the question with ONLY "YES" or "NO". Do not provide any conversational filler or explanation before your answer.` (`evals/llm-judge.ts:44`). Score-first by construction: the model is forbidden from reasoning aloud, eliminating CoT-vs-score ordering issues at the price of any inspectable rationale.
- **Question template — evidence block + explicitly anchored inclusion/exclusion criteria** (`evals/snapshot_fidelity.eval.ts:112-125`): evidence in triple-quoted block; the question enumerates the exact facts required (file path, error code, directive) and defines both poles: "Answer ONLY with 'YES' if all three are unambiguously present. Answer 'NO' if any of the three are missing, abstracted away, or generalized (e.g., if it says 'found an error' instead of 'COMPILE_ERR_404')" (`:124-125`). The negative example ("found an error" vs "COMPILE_ERR_404") is the scale anchor — same anchoring trick as FAR-Lab's rubric 5/3/1 levels (`eval/llm-judge.mjs:73-76`).
- **Output schema**: none beyond the YES/NO contract; parsing is the layered string matching of §2.2. No JSON schema, no structured output.

### 2.4 Variance reporting

- `JudgeResult` returns `verdict: boolean; reasoning: string[]; votes: { yes: number; no: number; other: number }` (`evals/llm-judge.ts:21-25`, assembled at `:108-112`). `reasoning` is actually the raw per-pass response strings (`:110`, `rawResults`) — full per-pass disclosure, misnamed.
- The consumer embeds votes and raw passes into the assertion failure message: `Votes: ${JSON.stringify(result.votes)} Reasoning: ${JSON.stringify(result.reasoning)}` (`evals/snapshot_fidelity.eval.ts:133-144`). So spread is *observable on failure* but not asserted, not persisted as a metric, and not compared across runs. There is no confidence/spread computation beyond the raw counts.

### 2.5 Cost discipline

- **Opt-in N, cheap judge model**: default 1 pass (`llm-judge.ts:41`), doc suggests 3 or 5 (`:14-15`); default judge model is the flash tier (`:42`). Only one eval in the entire repo pays the N× multiplier (3×).
- **No adaptive N / early-agreement stopping** anywhere: `Promise.all` over a fixed `runs` count (`llm-judge.ts:70-71`); no code path inspects intermediate agreement.
- Eval suites carry an `EvalPolicy` — `ALWAYS_PASSES | USUALLY_PASSES | USUALLY_FAILS` (`evals/test-helper.ts:49`, semantics at `:34`) — so flaky judge-dependent evals can be declared usually-passing rather than hardened. That is their flakiness escape valve, not a variance reduction.

### 2.6 Tests for the aggregation logic

- **There are none.** No `llm-judge.test.ts` exists (`fd llm-judge -e ts` → only `evals/llm-judge.ts`); repo-wide grep for `LLMJudge|judgeYesNo|selfConsistencyRuns` matches only the class and the one eval (§2.1). The vote-normalization cascade (`llm-judge.ts:77-103`) and plurality rule (`:105-106`) are only ever exercised through live model calls inside `snapshot_fidelity.eval.ts`'s assertion (`:136-144`). `evals/test-helper.test.ts` exists but tests the harness, not the judge.
- Consequence for us: their aggregation contains subtle untested behavior (e.g., even-N 1–1 ties silently fail; `endsWith('YES')` would match `NO... WAIT YES`; an exception masquerades as an ordinary `other` vote). We port the *pattern* (parallel identical passes + vote counting + fail-closed ties + per-pass disclosure), not the code.

---

## 3. Other repos — negative results (search evidence)

- **opencode** (MIT): repo-wide search for judge machinery — only hits are legal/terms-of-service prose and a console UI route (`packages/console/app/routes/legal/terms-of-service/index.tsx`); nothing matching in `packages/*` source. No eval/judge module.
- **deepseek-harness** (MIT): "judge" matches only in unrelated files (`vendor/README.md`, `scripts/gen-cordis-catalog.ts`, release scripts, workflow worker tests). No LLM-judge/aggregation code.
- **OpenHands** (MIT clone at `.cache/repos/OpenHands`): no `eval*`/`bench*` directories at depth 2 (fd search), no SWE-bench harness code present in this clone. (The upstream repo has evaluation machinery, but it is not in this snapshot — stated as fact about the clone, not upstream.)
- Conclusion: gemini-cli is the only clone with reusable judge self-consistency machinery, consistent with its assignment as PRIMARY.

---

## 4. FAR-Lab current state (port target)

### 4.1 `eval/llm-judge.mjs` (v1, the thing being hardened)

- **Single judge call per problem** comparing three hypothesis lists (farlab/direct/rag) in seeded blind order (`eval/llm-judge.mjs:1-13`): one `provider.structuredCall` per problem (`:126-147`).
- **temperature 0.0** (`eval/llm-judge.mjs:133`), maxTokens 1024, JSON output kind.
- **Blind shuffle**: seeded mulberry32 PRNG (`:24-29`), Fisher-Yates over the three entries (`:107-112`), seed = `FARLAB_JUDGE_SEED` (default 20260821, `:19`) offset by `p.id.charCodeAt(1)` (`:108`) — the seed changes ONLY the position mapping.
- **Rubric**: two dimensions, 1–5 integers, anchored at 5/3/1 (`:73-76`) — `hypothesis_quality`, `counter_evidence_coverage`. Score-first JSON: `{"X":{...,"one_line_reason"},"Y":...,"Z":...}` (`:123-124`); no CoT-before-score (reason is a single line after the fact).
- **Validation**: per-label integer range check inside the structuredCall validator (`:136-147`); a failed validation fails the whole item (`judge_ok:false`, `scores:null`, `:153-158`) — no retry, no second pass.
- **Output v1 shape** (verified from `eval/results/llm-judge-ev1.jsonl` record 1): `{problemId, problemType, seed, blind_mapping, judge_ok, judge_error, calibration:"uncalibrated_llm_judgment", scores:{<system>:{label, hypothesis_quality, counter_evidence_coverage, one_line_reason}}, receipt, at}`.
- **Consumers**: no programmatic consumer in `eval/metrics.mjs`/`run-ev1-batch.mjs` (grep empty) — consumers are the evidence docs (W-EV1 numbers hand-computed from the jsonl: `evidence/W-EV1/ev1-before-after.md:6`) keyed on `scores.<system>.<dim>` integers and `seed`.

### 4.2 Judge v2 precedent (must not duplicate — generalize its patterns)

`eval/claim-match.mjs` + `eval/rediscovery.mjs` (D-037, 2026-08-22):

- **3-pass decomposition, median by total claim count** (`eval/rediscovery.mjs:209-217`): three identical structured calls at temperature 0 (`:140`), sort by total claims, take middle (`decPasses[1]`, `:214`).
- **Deterministic TF-IDF threshold matching decides extremes**; LLM only adjudicates the borderline band (`eval/claim-match.mjs:87-112`, thresholds `high/low`, borderline = `match:null`).
- **2-of-3 boolean majority for borderline adjudication** (`eval/rediscovery.mjs:231-244`); a failed adjudication pass contributes `[]` (`:239`) — i.e., failed passes degrade to "not matched" votes rather than dropping the item.
- **Offline calibratable + pure + unit-tested**: claim-match.mjs exports pure functions; `eval/claim-match-calibrate.mjs` replays RECORDED judge outputs (`:11-15`); `tests/claim-match.test.ts` (76 lines) covers tokenizer, similarity anchors, threshold bands, adjudicated counting (`:1-76`).
- These are exactly the patterns the EV1 judge port must reuse: pure aggregation core, recorded-output fixtures, deterministic tests, majority only where the deterministic rule cannot decide.

### 4.3 Pain evidence (why this port matters)

- `evidence/W-EV1/ev1-before-after.md:90`: "**Judge variance on identical data is ±1–2 points per problem**" — 3 shuffle seeds on the SAME after-batch data (`:73-75`); per-problem farlab quality/counter across seeds e.g. P1 `5/3, 5/3, 3/4` (`:77`). 3-seed means: farlab 4.07 / direct 3.73 / rag 3.33 (`:83-88`). Explicit honesty rule: "no before→after judge claim is made" because the swing exceeds the effect (`:90-93`).
- `evidence/W-EV2/rediscovery.md:23`: "re-judging the SAME runs moved task F1 by up to ±0.5 (arg 0.17→0.50; crc 1.00→0.48)" — at temperature 0 (`eval/rediscovery.mjs:140`), i.e., provider-level nondeterminism, not just shuffle position.
- Both variance sources are live in the EV1 judge: position bias (shuffle) AND sampling noise (temp-0 nondeterminism).

---

## 5. Port design draft — `eval/llm-judge.mjs` N-pass hardening

**Constraint honored**: no live model route (HTTP 402/429). The design splits into (A) a pure aggregation module implementable and unit-testable offline today, and (B) a thin live-loop change in `llm-judge.mjs` that is a no-op until a route returns. Live variance re-measurement is queued work, not blocked work.

### 5.1 New module `eval/judge-aggregate.mjs` (pure, no I/O, no provider import)

Mirror the claim-match.mjs structure (pure functions, importable by tests and by llm-judge.mjs; llm-judge.mjs cannot itself host them because it executes top-level side effects on import — `eval/llm-judge.mjs:39-51`).

```js
// (a) numeric aggregation for 1-5 integer scales — MEDIAN, lower-median on even counts
export const medianScore = (values) => {
  const nums = values.filter((v) => Number.isInteger(v) && v >= 1 && v <= 5);
  if (nums.length === 0) return { score: null, nOk: 0, nInvalid: values.length };
  const s = [...nums].sort((a, b) => a - b);
  return { score: s[Math.floor((s.length - 1) / 2)], nOk: nums.length, nInvalid: values.length - nums.length };
};
// lower-median (floor index) keeps the output INTEGER for even nOk — [3,4] -> 3, never 3.5.

// (b) categorical aggregation (booleans, e.g. generalized rediscovery adjudication) — strict majority of valid
export const majorityBool = (values) => {
  const valid = values.filter((v) => typeof v === 'boolean');
  const yes = valid.filter(Boolean).length;
  return { verdict: valid.length > 0 && yes * 2 > valid.length ? true : (valid.length - yes) * 2 > valid.length ? false : null,
           nOk: valid.length, tie: yes * 2 === valid.length };  // tie -> null verdict, caller must flag
};

// (c) item-level assembly: per-problem, per-dimension
export const aggregateItem = (passRecords, { minValid = 2 } = {}) => { /* see rules below */ };
```

### 5.2 N and what varies between passes

- **N = 3 fixed** (`FARLAB_JUDGE_PASSES`, default 3, must be odd — reject even values at startup). Rationale: matches gemini-cli's only real usage (`snapshot_fidelity.eval.ts:129`), matches judge-v2's 3-pass median (`eval/rediscovery.mjs:209`), and EV1 judge cost is ~6 problems × 1 call → 3× is trivial for auxiliary evidence.
- **Vary ONLY the blind-shuffle seed per pass; prompt text and temperature stay identical** (temp 0.0 as today, `eval/llm-judge.mjs:133`). Rationale: EV1's dominant documented variance term is position bias — the 3-seed study varied *only the shuffle* (`ev1-before-after.md:73-75`) and still saw ±1–2pt (`:90`). Freezing one arbitrary shuffle (as a same-prompt 3-pass design would) leaves that term intact in every future run; taking the median over 3 different shuffles *cancels* it instead. Concretely: `const rand = rng(SEED + p.id.charCodeAt(1) + passIdx)` (extends `eval/llm-judge.mjs:108`).
- **Rejected: prompt paraphrase variation** (self-consistency over reasoning paths) — it confounds judge variance with prompt-sensitivity and doubles the surface that needs calibration; the borderline-adjudication lesson from claim-match (deterministic core, majority only where needed) points the other way.
- **Rejected: adaptive N / early-agreement stop** (run pass 3 only if passes 1–2 disagree): gemini-cli has nothing like this (`llm-judge.ts:70-71` fires all N unconditionally), it makes the estimator's distribution depend on the data (agreement-biased), adds a stopping rule that itself needs testing, and saves at most 1/3 of a trivially cheap step.

### 5.3 Aggregation rules per score type

| Score type | Rule | Rationale |
|---|---|---|
| `hypothesis_quality`, `counter_evidence_coverage` (1–5 int) | **median** (lower-median if even nOk) | Ordering information matters on a scale; median reuses judge-v2's precedent (`eval/rediscovery.mjs:214`) and is outlier-robust (a single derated pass can't move it). With odd N and integers the median is itself an observed pass value → stays a valid v1 integer. |
| `one_line_reason` (string) | **reason of the lowest-index pass whose score equals the aggregate**, per dimension; if dimensions come from different passes, keep both reasons tagged with their pass index | Deterministic, auditable; no synthesis. |
| boolean adjudications (if reused for rediscovery-style steps) | **strict majority of valid votes** (`majorityBool`); tie → `null` + `tie:true`, item flagged | Generalizes `eval/rediscovery.mjs:241-244` (`vs >= 2`) with explicit tie surfacing instead of implicit. |

### 5.4 Tie handling

- Odd N on an integer scale → the median is never a tie. No tie-breaking constant is needed for the numeric dimensions (this is *why* N must be odd; enforced at startup).
- Even `nOk` (after a parse failure): lower-median (`floor((nOk-1)/2)`) — integer, conservative, deterministic; the even-split hazard that gemini-cli's undocumented `yes > no && yes > other` rule hides (`evals/llm-judge.ts:105-106`) is designed out rather than silently failed.

### 5.5 Parse-failure handling (must not silently drop passes)

Per-pass independent validation with the existing validator (`eval/llm-judge.mjs:136-147`). Then:

- Every pass is recorded in `pass_records[i]` (ok/scores or error kind+message) — nothing dropped, ever (gemini-cli's one good habit: failures become visible `other` votes, `evals/llm-judge.ts:96-102`, and their caught-exception-to-string trick at `:65-67` guarantees a pass can't vanish).
- `nOk >= 2` (i.e., `minValid=2` for N=3): aggregate over valid passes, lower-median on even counts.
- `nOk < 2`: `judge_ok: false`, `scores: null`, `judge_error: { kind: 'too_few_valid_passes', nOk, nFailed }`. Distinct from a single pass's transport error — unlike gemini-cli, where N exceptions are indistinguishable from N "other" votes.
- Item-level failures never abort the run: the v1 skip/error record pattern (`eval/llm-judge.mjs:97, 153-158`) is retained.

### 5.6 Variance disclosure in output JSON

Per-record additive fields (v1 keys untouched — see 5.7):

```json
{
  "judge_version": 2,
  "passes": 3,
  "pass_records": [
    { "pass": 0, "ok": true, "blind_mapping": {"X":"farlab",...},
      "scores": {"farlab":{"label":"X","hypothesis_quality":5,"counter_evidence_coverage":3,"one_line_reason":"..."}, ...},
      "judge_error": null },
    { "pass": 1, "ok": false, "blind_mapping": {...}, "scores": null,
      "judge_error": {"kind":"validation","message":"Y.hypothesis_quality invalid"} }
  ],
  "n_ok": 2,
  "aggregate": { "rule": "lower-median", "minValid": 2 },
  "spread": {
    "farlab":  { "hypothesis_quality": {"min":4,"max":5,"range":1,"values":[5,4]}, "counter_evidence_coverage": {"min":3,"max":3,"range":0,"values":[3,3]} },
    ...
  },
  "agreement": { "farlab": {"hypothesis_quality": 0.5, "counter_evidence_coverage": 1.0}, ... }
}
```

`agreement` = fraction of valid passes whose score equals the aggregate. Run-level summary printed at the end: mean per-item spread per dimension (directly comparable against the v1 ±1–2pt baseline at `ev1-before-after.md:90` when a live route returns).

### 5.7 Backward compatibility

- Top-level v1 keys preserved verbatim: `problemId, problemType, seed, blind_mapping, judge_ok, judge_error, calibration, scores, receipt, at` (shape verified against `eval/results/llm-judge-ev1.jsonl`).
- `scores.<system>.<dim>` remains a **1–5 integer** in every reachable case (odd-N median of integers; even-nOk lower-median of integers) — the W-EV1 evidence numbers were hand-computed from exactly these fields (`ev1-before-after.md:6`), so evidence recomputation scripts and future diffs keep working.
- `blind_mapping` = mapping of the pass that supplied the median `hypothesis_quality` (lowest index on ties); all other mappings live in `pass_records`.
- `receipt` = receipt of that same median pass; all receipts additive in `pass_records[i].receipt`.
- All new fields (`judge_version, passes, pass_records, n_ok, aggregate, spread, agreement`) are additive — v1 consumers ignore unknown keys, and no programmatic consumer exists today (grep of `metrics.mjs`/`run-ev1-batch.mjs` for `llm-judge` is empty).
- `seed` semantics unchanged: still `FARLAB_JUDGE_SEED` (default 20260821, `eval/llm-judge.mjs:19`); pass shuffles derive from it deterministically (`SEED + idOffset + passIdx`), so a seed fully reproduces a run offline.

### 5.8 Live-loop change in `llm-judge.mjs` (small, gated by route availability)

Replace the single `structuredCall` (`eval/llm-judge.mjs:126-147`) with a loop of N calls — same task text (rebuilt per pass only because labels/shuffle differ), each with its own shuffle + validator, results fed to `aggregateItem`. Since `Promise.all` parallelism (gemini-cli `evals/llm-judge.ts:70-71`) buys only latency here (N=3, ~6 problems, sequential is seconds), sequential passes are acceptable and keep rate-limit pressure minimal under a fragile route; parallelism is a one-line change later. Output file: default stays `llm-judge.jsonl`; variance studies keep using `FARLAB_JUDGE_OUT` (`eval/llm-judge.mjs:166`) so v1 files are never overwritten by v2 runs (write `llm-judge-v2*.jsonl` explicitly when the route returns).

### 5.9 Queued live verification (when a model route returns)

1. Rerun `node eval/llm-judge.mjs` (N=3) on the frozen EV1 after-batch data → `llm-judge-v2-live.jsonl`.
2. Report per-item spread vs the v1 baseline (±1–2pt) — the success criterion is *reduced decision-level variance*: per-problem farlab-vs-direct ordering stable across reruns, mean spread < 1.0pt.
3. Cross-check: aggregate median scores should stay within the v1 3-seed mean band (farlab 4.07 / direct 3.73 / rag 3.33, `ev1-before-after.md:88`); a systematic shift means the shuffle-variation design changed generosity and must be documented, not hidden.

---

## 6. Test plan (deterministic, offline; fixtures are pass-record arrays, following `tests/claim-match.test.ts` style)

New file `tests/judge-aggregate.test.ts` (vitest, importing pure functions from `eval/judge-aggregate.mjs`):

1. **all-agree**: `[{hq:4,cc:3},{hq:4,cc:3},{hq:4,cc:3}]` → score 4/3, `agreement 1.0`, `range 0`, `judge_ok true`.
2. **2–1 split (outlier high)**: `[5,5,3]` → 5, agreement 2/3 — the majority survives one derating pass.
3. **outlier low**: `[2,4,4]` → 4 — a single failed/derated pass cannot drag the median.
4. **one parse failure**: `[ok(4), fail(validation), ok(5)]` → `n_ok 2`, lower-median of [4,5] = **4** (integer — assert `Number.isInteger`), `nFailed 1` recorded, `judge_ok true`; assert the failed pass is still present in `pass_records` (never dropped).
5. **all parse failure**: three fails → `judge_ok false`, `scores null`, `judge_error.kind === 'too_few_valid_passes'`, and the record still carries all three `pass_records` — catches "silently drop the item" regressions.
6. **two parse failures**: `[ok(4), fail, fail]` → `n_ok 1 < minValid 2` → `judge_ok false` even though one valid score exists — catches majority-of-one defects.
7. **categorical majority**: `[true,true,false]` → true; `[true,false,null]` → `nOk 2`, verdict **null + tie flag** (assert NOT resolved by coin-flip or dropped); `[]` → null, nOk 0. Guards the generalization of `eval/rediscovery.mjs:241-244`.
8. **reason selection determinism**: passes `[ {hq:5, reason A}, {hq:4, reason B}, {hq:4, reason C} ]` → median 4 and reason **B** (lowest index matching the aggregate) — same inputs always same reason.
9. **schema compatibility**: for every fixture outcome (1,4,6), the assembled record contains all v1 top-level keys and `scores.<system>.<dim>` are integers in 1..5 — locks the additive-only contract from §5.7.
10. **shuffle derivation determinism**: same `SEED`+problem id → identical `pass_records[*].blind_mapping` across two invocations; mappings differ across pass indices for at least the fixture seed (guards the `rng(SEED + idOffset + passIdx)` derivation).
11. **integration replay (real recorded data)**: feed the recorded v1 outputs (`eval/results/llm-judge-ev1.jsonl`, `llm-judge-ev1-s2.jsonl`, `llm-judge-ev1-s3.jsonl` — three seeds over the same problems) through `aggregateItem` as if they were 3 passes → assert the aggregate equals the hand-computed median and `spread.range` reproduces the documented ±1–2pt behavior (`ev1-before-after.md:77,90`). This proves the offline path runs on real judge outputs, not just synthetic fixtures, and that the new aggregator retroactively explains the old variance study.

These cases specifically catch the real defect classes: dropped passes (gemini-cli never drops but we assert it), majority-of-one, fractional scores breaking v1 consumers, tie-by-accident, and non-reproducible shuffles.

---

## 7. Risks and open concerns

1. **Median over 3 shuffles may not fully cancel position bias** — 3 draws of a 3-position shuffle is thin; residual bias is possible in one direction (e.g., farlab consistently landing last). Mitigation: per-pass mappings are recorded, so a position-effect audit (score vs label position) is a pure function over `pass_records`; run it once live before trusting aggregates.
2. **3× judge cost + fragile route** — under 402/429 throttling, sequential N=3 triples exposure to rate-limit failures, which then trip `minValid` and produce `judge_ok:false` noise. Mitigation: pass-level retry stays the provider's existing retry semantics; if live failure rate is high, queue reruns rather than lowering `minValid` (never weaken the gate to fake completion).
3. **Version mixing in evidence comparisons** — v2 medians and v1 single-pass scores are different estimators; before/after tables must not mix them in one column. Mitigation: `judge_version` field + separate output filenames (§5.8); W-EV1 doc gets an addendum, never an edit of recorded numbers.
