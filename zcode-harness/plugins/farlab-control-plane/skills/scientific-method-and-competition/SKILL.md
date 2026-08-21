---
name: scientific-method-and-competition
description: Use for FAR-Lab scientific claims, evidence chains, hypotheses, falsification, research plans, information-seeking actions, feedback/revision, evaluation, reproducibility or Track-1 Direction-A compliance. Separate scientific validity from software correctness; treat competition requirements as a floor/boundary rather than the scientific quality ceiling.
when_to_use: Scientific domain model, evidence/citation logic, hypothesis/plan pipeline, statistics/causal/experimental reasoning, evaluation design, Qwen/Bailian or competition evidence, scientific benchmarks, reproducibility or research-quality claims.
metadata:
  version: "2.0.0"
---

# Scientific Method + Direction A

## Competition boundary

Revalidate the current official competition source before consequential compliance claims. Preserve Direction A's core loop:

`problem understanding -> knowledge/evidence integration -> candidate hypotheses -> evidence/counter-evidence -> falsification/testability -> executable research plan -> feedback -> causal revision`

Execution/simulation can improve testability and feedback but must not replace the A loop with instrument execution. Competition readiness is a minimum floor, not the project frontier.

## Scientific validity

Inspect separately from software correctness:

- question/scope/constraint clarity;
- source quality, provenance and citation-to-claim binding;
- support, counter-evidence, conflicts, null/negative results and unknowns;
- uncertainty/calibration where meaningful;
- hypothesis diversity, novelty relative to evidence/prior art, assumptions and alternative explanations;
- concrete observables, weakening conditions and falsification conditions;
- plan variables, controls, data/sample, inclusion/exclusion, measurements, methods, statistics, metrics, thresholds, stopping criteria, confounders, resources, cost, risk and ethics when applicable;
- leakage, bias, multiple comparisons, effect size, power/sample adequacy, causal assumptions and dataset shift when applicable;
- whether the next scientific action is informative enough to distinguish competing hypotheses; use expected information gain only when it can be defined and interpreted honestly;
- whether feedback causally changes claims/assumptions/hypotheses/plan rather than cosmetically regenerating text;
- version-difference traceability;
- reproducibility of inputs, retrieval, model/tool configuration, code/data/environment and artifacts.

## Evaluation

Use strong current baselines, realistic tasks, negative/adversarial cases, blind/independent assessment where possible, and ablations when attribution of a claimed mechanism matters. LLM-as-judge may assist but is not automatically scientific ground truth.

Never fabricate citations, experiments, expert review, scores, Qwen/Bailian execution proof, scientific consensus or compliance.
