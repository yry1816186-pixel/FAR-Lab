---
name: frontier-evaluation
description: Use after major FAR-Lab acceptance/milestones or when deciding whether the project has reached a research-grade/frontier-candidate stopping point. Search for high-leverage P2 opportunities, stronger current methods/tools/OSS, untested innovation claims, performance/product/reproducibility gaps, and stop only at evidence-backed opportunity saturation and low marginal value.
when_to_use: Post-acceptance frontier sweep, final mission gate, major release evolution, world-class quality review, high-leverage opportunity search, innovation validation, or deciding whether continued work still has material expected value.
metadata:
  version: "2.0.0"
---

# Frontier Evaluation

Acceptance is the floor. After critical acceptance and P0/P1 repair, evaluate whether materially stronger in-scope work remains.

## Dimensions

Inspect the dimensions relevant to the mission, normally:

- scientific validity and research utility;
- engineering correctness/reliability/recovery/security;
- performance and cost on measured critical paths;
- researcher workflow/product quality;
- architecture coherence and ownership;
- evaluation strength and fairness of baselines;
- innovation evidence, ablation and failure analysis;
- ecosystem/OSS/protocol/tool opportunities;
- provenance and third-party reproducibility.

## Frontier opportunity sweep

1. Reconstruct the strongest current verified state; do not revisit closed work by default.
2. Ask what important technical, scientific, product, operational, security or ecosystem dimension could still change the decision.
3. Use current primary research/OSS evidence for genuinely decision-changing uncertainties.
4. Include high-leverage P2 issues: not acceptance blockers, but capable of materially changing scientific quality, architecture, performance, usability or maintainability.
5. Compare against strong current alternatives/baselines, not deliberately weak ones.
6. For each candidate opportunity decide `EXECUTE / DEFER / REJECT / BLOCKED / LOW_VALUE` with evidence and reason.
7. Continue discovery until decision saturation: additional independent searches mainly return duplicates, clearly weaker options or already represented patterns.
8. Run a marginal-value test: if meaningful executable work with material expected benefit remains, the mission is not frontier-complete.

Do not inflate the project for prestige. A frontier gate rejects both premature stopping and low-value architecture/feature accumulation.
