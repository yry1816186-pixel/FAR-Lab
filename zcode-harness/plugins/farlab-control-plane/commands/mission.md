---
description: Reconstruct truthful FAR-Lab mission state after interruption/compact, or show status and continue from the highest-leverage next action.
argument-hint: "[status|resume]"
---

Mission operation: `$ARGUMENTS`

Read root `AGENTS.md`, `.control/EXECUTION_STATE.json`, the relevant pending acceptance items, current Git/workspace reality, and only the project-spec documents needed for the current problem. Reconcile stale state before relying on it.

If argument is `status`, report compact current truth, Critical Problem Set, blockers, verification gaps and exact next action without inventing progress.

If argument is `resume` or omitted, resume the highest-leverage executable `nextAction`; do real work rather than returning only a status report. Keep the main Agent as architecture/integration authority and use useful parallel subagents for independent work.
