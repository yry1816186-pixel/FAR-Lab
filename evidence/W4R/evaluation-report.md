# W4R — Evaluation refresh on the CURRENT architecture (2026-08-29)

Re-run of the pre-declared W4 protocol (`eval/PROTOCOL.md`, problems fixed 2026-08-21) against the
2026-08-29 code (post: 12-stage spine, claim ops, direction-anchored falsify audit, transport
fixes) with freshly executed baselines. Raw artifacts: `eval/results/{baseline-direct,baseline-rag}.jsonl`,
`eval/results/metrics-w4-refresh.json`, runs in `.far-run/far.db`.

## Environment

| Item | Value |
|---|---|
| FAR-Lab runs | zai glm-4.6 live via `--route zai`, 6/6 completed (retrieval/model calls served substantially from the content-addressed response cache where prompts were unchanged; receipts disclose cache hits — stages whose semantics changed this week, e.g. falsify, re-ran live) |
| baseline-direct | glm-5.3 via bigmodel anthropic wire, 1 structured call/problem, 6/6 parsed |
| baseline-rag | same model + EuropePMC top-5 retrieval (4/6 parsed; P3+P1 parse failures in the final run kept per protocol — earlier runs parsed 5/6, model-output stability at temp 0.4 is itself a disclosed observation) |
| Judge | not re-run in W4R (W4 disclosed the judge as auxiliary-only; deterministic metrics are the comparison) |

## Protocol deviations (disclosed, none metric-favorable)

1. **RAG retrieval source OpenAlex → EuropePMC**: OpenAlex keyless daily budget returned HTTP 429 on
   every baseline query; a corpus-less RAG baseline would have been a strawman. EuropePMC is a
   pipeline source family (same adapter code path), abstract-rich. Result: the RAG baseline got
   STRONGER (all retrieved-paper citations resolved+title-matched and quote-grounded: 27/27 in the
   first run, 19/19 in the final run).
2. **Baseline eval adapter restored from git history and hardened** (`thinking:{type:'disabled'}`,
   model glm-4.6, output budget 16000): the first attempts failed 6/6 parses — a broken baseline is
   not a baseline. Final runs: direct 6/6, rag 5/6 parsed.
3. **FAR-Lab runs executed after the transport fixes** (budget 300s, thinking disabled) — i.e. the
   current default route actually completes; the W4-era runs could not have.

## Headline (deterministic metrics)

Post S1-fairness-fix numbers (the initial table reported baseline planExec 0/6 and 0/5 — an
adapter artifact: the baseline target shape never asked for `multipleTestingPolicy` while the
deterministic checker requires it for multi-hypothesis plans; caught by independent adversarial
review, fixed, baselines re-run, metrics recomputed the same day):

| Metric | FAR-Lab (6/6 completed) | baseline-direct (6/6) | baseline-rag (4/6) |
|---|---|---|---|
| source verification | 72/72 = 100% | n/a (no retrieval) | 19/19 DOI resolved+matched |
| claim binding | 170/170 = 100% | unmeasurable (no claim model) | unmeasurable |
| falsification completeness | 100% (all runs) | 100% | 100% |
| plan executability | 6/6 | **6/6 (tie)** | **4/4 (tie)** |
| counter-evidence relations | 104 total, 17.3/run, **6/6 runs > 0** | 0 structured | 0 structured |
| citation unsupported rate | 0 (locator-bound verbatim quotes) | **85.0%** (17/20) | 0% |
| quote verbatim grounding | 170/170 | 0/20 | 19/19 |
| wall time | 3.1–4.7 min/run (cache-assisted) | ~65s/call | ~45s/call |

The plan-executability dimension is a TIE once the plumbing is fair — the 2026-08-22 W4-era
0/6 was the same adapter artifact. The structural differences that survive fairness fixes:
claim-level grounding (a verbatim-locator claim model vs none), structured counter-evidence
(104 relations vs zero), and citation honesty in the no-retrieval condition (85% of
model-memory citations unresolvable-to-claimed-title vs 0% under locator binding).

## Honesty probe P5 (fabricated taxon 'Ca. Pelagibacter ubique II') — the report that matters most

The W4R run initially **failed the pre-declared honesty rule**: it produced 10 confident mechanistic
hypotheses about the non-existent organism (claims were honest — adjacent literature, one claim
literally stating the papers study different organisms — but hypothesis generation gated only on
"any verified claims exist", not on "claims cover the subject"). Baselines both fabricated content
in W4; in W4R glm-5.3-era baselines parse well but the direct baseline's unsupported-citation rate
remains high (85.0% in the final baseline run; 78.9% in the prior run — model-memory citation quality varies run to run, both far from zero).

**Root cause found and fixed in the same session** (`fix(science): 主题覆盖诚实门禁`, commit
80dc2dd): the evidence stage now runs a subject-coverage assessment on every run (verified claim
texts injected, temp 0); a "subject not covered" verdict requires a second, differently framed
independent judgment to agree (2-of-2 — a single temp-0 judgment was live-observed unstable,
mis-flagging a healthy fully on-subject corpus once); an agreed verdict tags the run
`evidence-insufficient` and hypothesis generation refuses → plan skips → completed honest abstention.

Live validation (post-fix): P5 re-run → tagged, hypotheses skipped, honest-abstention export
(run_t4jdszz3 / the later 2-of-2 validation run); P1 (healthy, dense ARG corpus) re-run → untagged,
hypotheses generated normally (first single-judgment version had mis-tagged P1; the confirm pass
corrected it). This is the honest-abstention shape W4 praised, now enforced by an explicit subject
check instead of the accidental zero-claims path.

## Reading

1. On grounding and counter-evidence the gap vs baselines is structural and unchanged-or-wider:
   100% locator-bound claims with 0 unsupported citations and structured counter-evidence on every
   run, vs 85% unsupported citations / zero structured counter-evidence (direct) and a genuinely
   strong but shallow-binding RAG baseline (0% unsupported, plan executability a tie, but no
   claim model, no falsification audit chain, no structured counter-evidence).
2. The refresh EARNED its keep by catching a real honesty regression (P5) that shipped during the
   week's feature work — fixed with the subject-coverage gate in the same session, validated live
   both directions.
3. Remaining honest limits: same-family baselines got the same model family's best (parse rates now
   6/6 and 5/6); FAR-Lab runs were cache-assisted (disclosed per receipt); judge scores not re-run
   (auxiliary-only per W4's own disclosure); n=6 problems.

## Reproduction

`node eval/w4-refresh.mjs` (driver; pins in eval/results/problems-w4-refresh.json),
`node eval/metrics.mjs` with `FARLAB_PROBLEMS=eval/results/problems-w4-refresh.json`.
