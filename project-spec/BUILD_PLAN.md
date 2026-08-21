# BUILD_PLAN.md — Vertical Construction Plan

This is a dependency-aware build order, not a calendar plan. Progress is driven by verified capability, not arbitrary time boxes.

## W0 — Foundation decisions and real spikes

Goal: remove architecture uncertainty before large code volume.

- initialize Git/repository hygiene; choose the package/runtime/toolchain only after the relevant W0 architecture evidence, then create the smallest CI-ready scripts;
- define canonical domain schemas and run state transitions;
- prove a live structured-call path and receipt capture on the model route required by the current official rules;
- prove at least one real source-adapter/citation-resolution path;
- compare and prove the minimal persistence/state-ownership route (SQLite is only a candidate), plus append-only audit/receipt and immutable artifact semantics;
- define the primary researcher task flow/IA before Web components;
- choose only dependencies whose W0 evidence beats simpler alternatives.

Exit: no critical unresolved foundation issue; evidence/decision recorded. Fixtures may test structure but **do not count as product completion**.

## W1 — First real Direction-A vertical slice

From a real scientific question through:
`scope -> live retrieval -> source verification -> evidence/counter-evidence -> multiple genuinely distinct hypotheses (normally 3+ when scientifically supportable; never pad weak candidates to hit a quota) -> falsification/testability -> ranking -> executable plan -> live provider/model provenance -> CLI result/export`.

Also implement one real failure path, persisted state and resume checkpoint.

Exit: a third party can inspect inputs/sources/hypotheses/plan/provenance and reproduce the run to the defined evidence level.

## W2 — Feedback, revision and evidence hardening

- structured human/evidence/tool feedback;
- causal revision chain + version diff;
- stronger counter-evidence/conflict/uncertainty handling;
- content-depth/source adapters required by representative claims (including full text/data where needed/allowed);
- deterministic citation/falsification/plan-completeness checks;
- cancellation, retry/idempotency and corrupted-checkpoint behavior.

## W3 — Mature product experience

Implement the real Web workbench over the same application/domain layer:
- question/run creation and control;
- evidence/source inspection;
- hypothesis comparison/falsification;
- plan editing/review;
- revision/provenance navigation;
- accessible loading/error/partial/cancel/resume states;
- responsive/performance behavior on representative data volume.

No presentation-only or fake dashboard paths.

## W4 — Evaluation and hardening

- predeclared representative scientific problem set;
- runnable strong baselines and ablations where decision-relevant;
- claim/citation/evidence sampling protocol;
- failure/adversarial/recovery/security tests;
- measured performance/resource profile and budgets derived from evidence;
- independent scientific/engineering review at the evidence level actually available.

## W5 — Release/reproducibility

- complete Acceptance evidence;
- independent adversarial audit;
- clean dependency/security/repository/release checks;
- reproducibility bundle independently exercised;
- current official competition compliance rechecked;
- user/developer docs updated to verified reality only.

## Per-wave rule

`Design -> Implement -> Integrate -> Use real path -> Test relevant risk -> Adversarial check when material -> Measure -> Simplify -> Persist evidence -> Reassess critical problem set`.

Do not perform fixed-interval audits or rerun full suites without a change/risk reason. Do not build all layers horizontally before exercising a vertical path.
