# EVALUATION.md — Scientific and Product Evaluation

Evaluation must be defined before seeing the results it is meant to judge. Software checks, scientific validity, HCI quality and performance are separate evidence planes.

## 1. Representative problem set

Select a small but diverse, defensible problem set from the official Direction-A space or equivalent real scientific questions. Record why each problem is representative, what sources/data are available and what domain expertise is required. Do not claim all-domain generality from a narrow set.

## 2. Runnable baselines

At minimum compare against baselines that can actually be run under the same question/evidence budget, such as:
- a high-quality model with a direct structured prompt;
- the same model with a simple retrieval + structured-answer pipeline;
- any current open system that is genuinely runnable and decision-relevant.

Published systems/papers that cannot be run under comparable conditions may be reference comparators, not fake benchmark competitors.

## 3. Scientific metrics

Measure with a predeclared sampling/rubric protocol rather than arbitrary “large number = rigorous” thresholds:
- source/citation resolvability;
- claim-source alignment;
- supporting/counter-evidence coverage and diversity;
- contradiction/uncertainty handling;
- hypothesis distinctness/diversity;
- plausibility with limits clearly stated;
- falsifiability/testability quality;
- plan completeness/executability;
- revision fidelity and evidence of improvement;
- unsupported/fabricated claim rate;
- provenance/reproducibility completeness.

Where expert judgment is necessary, record reviewer qualification, independence, rubric, disagreement and sample size. Do not invent a universal “>=2 experts” gate when qualified reviewers are unavailable; evidence level must be stated honestly.

## 4. Iteration evaluation

A revision is only an improvement claim if a predeclared metric/rubric or independent review supports it. Preserve cases where feedback makes a version worse or inconclusive.

Useful comparisons:
`v0 -> new evidence/feedback -> v1 diff -> quality delta`.

## 5. Ablation

Only ablate mechanisms tied to a real product/scientific claim. Candidate examples:
- without counter-evidence search;
- without deterministic citation/falsification checks;
- without structured revision chain.

Do not create ablations merely to inflate experiment count.

## 6. Reliability/security evaluation

Exercise representative provider/source failure, malformed output, rate limit, cancellation, retry/idempotency, checkpoint corruption/resume and secret/injection boundaries. A failure test passes only when state remains truthful/recoverable, not merely when the process avoids crashing.

## 7. Performance/resource evaluation

Measure end-to-end and stage-level latency, provider/tool calls, token/request cost where available, memory and concurrency behavior on representative workloads. Establish budgets **after measurement** and investigate bottlenecks before optimizing. No arbitrary hard 10-minute/concurrency-3 target is treated as scientific fact.

## 8. Human experience evaluation

Use realistic researcher tasks to verify:
- task completion and navigation clarity;
- evidence/hypothesis/plan comparison usability;
- long-run/error/cancel/resume comprehension;
- Web/CLI terminology consistency;
- keyboard/accessibility and representative responsive/large-data states;
- absence of fake controls/progress/visualizations.

Usability feedback is valuable when representative users are available; do not fabricate participants or block all engineering on an unavailable panel.

## 9. Evidence reporting

For each result record environment, code version, model/provider/version/config, source snapshot, sample/problem IDs, metric/rubric, repeated-run/uncertainty treatment and raw artifact location. Report negative/inconclusive results, not only winners.
