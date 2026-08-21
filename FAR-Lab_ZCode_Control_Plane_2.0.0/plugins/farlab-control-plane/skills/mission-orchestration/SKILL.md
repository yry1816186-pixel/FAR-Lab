---
name: mission-orchestration
description: Use for long-horizon FAR-Lab development, rebuild, autonomous R&D, large refactors, cross-system upgrades, mission resume, or any task where the main Agent must rank critical work, build a dependency-aware work graph, coordinate useful foreground/background subagents, preserve recoverable state, and continue until evidence-backed acceptance/frontier stop conditions are met.
when_to_use: Large multi-wave engineering or research missions, /goal work, post-compact recovery, high-concurrency investigation, major project evolution, or when local progress risks drifting from the global outcome.
metadata:
  version: "2.0.0"
---

# FAR-Lab Mission Orchestration

## Mission contract

Own the outcome, not activity. Treat each model round, phase, commit, green test, benchmark, or completed module as a checkpoint unless the mission's real terminal conditions are satisfied.

## Reality first

Before deep planning, reconstruct only the state needed to act:

`AGENTS.md -> relevant canonical project-spec -> .control -> Git/workspace -> real runtime/tests/benchmarks`

Reconcile persisted state against observed reality. Do not restart completed preflight work unless it is actually blocking construction.

## Critical Problem Set

Maintain 3-7 consequential unresolved problems. Rank comparatively:

`P0 correctness/safety/scientific truth/core-loop -> P1 acceptance/reliability/reproducibility -> highest-leverage P2 architecture/product/performance/frontier`

For the chosen problem, be able to explain why solving it now beats the strongest alternative.

## Dependency-aware work graph

Decompose into:

- critical path;
- independent research/inspection branches;
- implementation ownership;
- integration point;
- verification dependency;
- adversarial review.

Do not use a flat to-do list for a coupled mission.

## Useful parallelism

Use subagents when independent work can materially reduce uncertainty or elapsed time.

- Foreground parallel: results are prerequisites for the next main-agent decision.
- Background: use only when ZCode actually chooses/supports background execution and the main Agent can safely keep working without the result.
- Prefer built-in `Explore` for read-only repository archaeology and evidence collection.
- Give every important delegation an objective, why-it-matters, scope, read/write ownership, required actions/evidence, deliverable, and integration destination.
- Avoid overlapping write ownership. Parallelize investigation, then centralize coupled integration.

The main Agent retains architecture, interface, state-ownership, conflict-resolution, integration and final-acceptance authority.

## Execute vertically

For each major slice:

`Inspect -> Decide -> Implement -> Integrate -> Run real path -> Test -> Attack -> Measure -> Fix -> Simplify -> Persist evidence -> Reassess`

An unused abstraction, mock-only path, disconnected UI, design document, or isolated green test is not delivered capability.

## Research only to change decisions

Use external research when it can change architecture, scientific validity, security, integration, ecosystem or performance. Search by problem/capability/failure mode, inspect serious candidates proportionally, and stop at decision saturation.

## Context and continuity

Persist only what a fresh Agent needs in the project's existing `.control` convention: current objective, critical problems, verified facts/evidence locations, decisions/reversal triggers, blockers, in-flight work and exact next action.

Before `/compact` or interruption: finish the atomic action, sync truth, preserve a recoverable Git state, then reload only the minimum Source of Truth.

## Completion discipline

Use two levels:

1. **Acceptance Floor** — canonical critical acceptance with real evidence, no actionable P0/P1.
2. **Frontier Completion** — independent audit, frontier dimensions, opportunity saturation and marginal-value gate.

Do not manufacture infinite work. Continue only while meaningful executable in-scope work has material expected value. Global stop is legitimate when the mission is verified complete, genuinely externally blocked, paused by the user/runtime, budget-limited, out of scope, or saturated at low marginal value.
