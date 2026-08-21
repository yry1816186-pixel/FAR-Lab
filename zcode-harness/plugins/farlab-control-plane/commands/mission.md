---
description: Reconstruct or resume the FAR-Lab long-horizon mission from truthful state, rebuild the Critical Problem Set and dependency-aware work graph, then execute the highest-leverage path instead of returning only a plan/status.
argument-hint: "[status|resume|reassess]"
skills: mission-orchestration,verification-audit
---

Mission operation: `$ARGUMENTS`

Read root `AGENTS.md`, the minimum relevant canonical `project-spec`, `.control`, current Git/workspace/runtime truth and the evidence needed for the current problem. Reconcile stale persisted state before trusting it.

- `status`: return only compact current truth, Critical Problem Set, blockers, acceptance/frontier gaps, active delegated work and exact next action. Do not invent progress.
- `resume` or omitted: resume the highest-leverage executable `nextAction` and do real work. Rebuild the dependency-aware work graph if stale. Use useful parallel subagents for independent work; use foreground when results are prerequisites and background only when ZCode actually supports/chooses it and the critical path can continue safely.
- `reassess`: after a major slice, recompute global Critical Problem Set and critical path from real evidence before continuing.

Keep the main Agent as architecture/interface/state-ownership/integration authority. Preserve project-native `.control` conventions. If the control schema explicitly supports mission-active/frontier fields, keep them truthful; do not invent incompatible state fields merely to satisfy this plugin.

A completed phase/test/commit is a checkpoint, not automatically the mission end.
