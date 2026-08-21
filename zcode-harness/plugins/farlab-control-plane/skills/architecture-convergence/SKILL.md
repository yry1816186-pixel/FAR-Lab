---
name: architecture-convergence
description: Use for consequential FAR-Lab architecture/state/runtime/persistence/protocol decisions. Compare real alternatives, make ownership explicit, spike key uncertainty, then converge with evidence.
when_to_use: Architecture-changing decisions or unresolved technical hypotheses with high downstream cost.
metadata:
  version: "1.0.0"
---

# Architecture Convergence

1. Define the product/scientific requirement and protected invariants before technology names.
2. Classify the capability as Commodity, Integration, or Unique Core.
3. Produce at least two genuinely distinct viable routes when the decision is consequential; do not create cosmetic alternatives.
4. Compare correctness, complexity, performance, reliability, security, portability, extensibility, maintainability, DX/UX, operational cost, ecosystem, implementation risk and long-term evolution as applicable.
5. Make ownership explicit for state/data, persistence, execution/lifecycle, retries/errors/cancellation, permissions/security, provenance/observability, compatibility/upgrades and migrations.
6. Identify assumptions that documentation cannot settle. Use a small isolated Spike only when real execution can materially reduce uncertainty.
7. Attack the preferred route for failure modes, scale limits, duplicate authority, irreversible coupling and migration traps.
8. Converge using Evidence -> Decision -> Exit Gate. Do not code a major irreversible foundation while a Critical Architecture Issue remains unresolved.
9. Record a compact decision and reversal trigger. Delete failed spikes and superseded design clutter after conclusions are preserved.
