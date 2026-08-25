# Handoff 06 → 04 — search-allocation dead module (wire or delete)

- **From:** lane 06 scientific-reasoning (`ws/r2/06-scientific-reasoning`)
- **To:** lane 04 retrieval-evidence
- **Date:** 2026-08-25
- **Urgency:** low (constitution §5 hygiene, not a blocker)

## `allocateSamples` (src/domain/search-allocation.ts) — zero production callers

Lane-06's dead-algorithm sweep (constitution §5: wire or delete) found
`search-allocation.ts`'s `allocateSamples` with no production consumer. Query-budget
allocation across source families is retrieval semantics — your ownership. Options:

1. **Wire** into the retrieve stage's per-family query budgeting (it exists precisely
   for that), with its calibration documented; or
2. **Delete** the module if the current fixed allocation is the deliberate design.

Lane 06 takes no position on which; we only flag that keeping a dead deterministic
module violates the workspace constitution. No lane-06 code depends on it.
