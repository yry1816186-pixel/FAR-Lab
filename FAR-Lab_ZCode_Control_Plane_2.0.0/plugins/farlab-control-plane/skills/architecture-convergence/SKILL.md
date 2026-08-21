---
name: architecture-convergence
description: Use for consequential FAR-Lab architecture, platform, data, workflow, runtime, agent, model, tool, protocol or subsystem decisions. Force evidence-driven convergence, explicit ownership, alternatives, reversal triggers and migration discipline instead of framework churn or architecture collage.
when_to_use: Major architecture/ADR decisions, subsystem replacement, new infrastructure boundaries, repeated structural failures, scaling/recovery/security problems, or when a stronger external route may justify change.
metadata:
  version: "2.0.0"
---

# Architecture Convergence

1. Define the product/scientific requirement and protected invariants before naming technologies.
2. Classify the capability as **Commodity / Integration / Unique Core**.
3. For consequential decisions, compare at least two genuinely distinct viable routes; do not create cosmetic alternatives.
4. Compare only relevant dimensions: correctness, scientific semantics, complexity, reliability/recovery, security/trust, performance/scale, portability, interoperability, maintainability, ecosystem, migration cost, DX/UX and long-term evolution.
5. Make ownership explicit for state/data, persistence, execution/lifecycle, retry/error/cancel/recovery, permissions/security, provenance/observability, schema/version compatibility and upgrades.
6. Identify assumptions documentation cannot settle. Run a small isolated spike only when execution can materially reduce uncertainty.
7. Attack the preferred route for duplicate authority, hidden coupling, irreversible lock-in, migration traps, performance cliffs and false extensibility.
8. Converge with `Evidence -> Decision -> Exit Gate`. Do not implement a major irreversible foundation while a critical architecture uncertainty remains unresolved.
9. Record decisive evidence, rejected alternatives and a reversal trigger. Preserve migration safety; remove obsolete duplicate production paths after replacement is proven.
10. Reopen architecture only for measured structural evidence: repeated failure, scientific-semantic mismatch, security blocker, recovery impossibility, measured bottleneck, or a materially stronger external solution.
