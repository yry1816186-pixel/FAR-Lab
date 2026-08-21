# FAR-Lab Control Protocol 2

## Authority

The plugin is a control plane, not a replacement for project truth. Resolve conflicts in this order unless higher-priority runtime/user rules say otherwise:

`platform/safety -> current user instruction -> root AGENTS.md -> canonical project-spec -> approved decisions -> observed code/runtime/test/benchmark evidence -> external primary evidence -> model memory`

## Completion semantics

Mission completion is intentionally split:

1. **Acceptance Floor** — canonical critical acceptance is evidence-backed, no actionable P0/P1 remains, and project-native gates are satisfied.
2. **Independent Audit** — a fresh reviewer tries to reject the completion claim against real paths and evidence.
3. **Frontier Gate** — scientific, engineering, product, architecture, performance, evaluation, innovation, ecosystem and reproducibility dimensions are verified to the level justified by the mission.
4. **Opportunity Saturation** — a problem-driven frontier sweep no longer finds materially stronger, executable, in-scope work with significant marginal value.

A green acceptance matrix is therefore necessary but not sufficient for a frontier-grade mission.

## Control-state compatibility

The plugin reads the established FAR-Lab files when present:

- `.control/EXECUTION_STATE.json`
- `.control/ACCEPTANCE_STATUS.json`
- `.control/BLOCKERS.json`
- `.control/DECISIONS.jsonl`
- `.control/DELEGATION_LEDGER.json`
- optional `.control/FRONTIER_STATUS.json`
- optional `.control/CONTROL_PROTOCOL.json`

It intentionally uses tolerant readers so older workspaces can continue operating. A newer unknown protocol version produces a compatibility warning rather than pretending full verification.

## Mission-active signal

The strict Stop guard only treats the workspace as an active autonomous mission when that intent is explicit in control state, for example one of:

- `missionActive: true`
- `mission.active: true`
- `mode: "mission"` together with a non-terminal mission state
- `stopGuard: "strict"`

This prevents the plugin from hijacking unrelated bounded conversations in an unfinished repository.

## Subagent policy

Use subagents to maximize **useful** parallelism, not agent count. The main Agent retains architecture, interface, state-ownership, integration and final-acceptance authority.

- Foreground parallel subagents: use when their results are required before the critical path can continue.
- Background subagents: use for longer independent investigation when ZCode chooses/supports background execution and the main Agent can continue safely without the result.
- Prefer built-in `Explore` for read-only repository archaeology and search.
- Avoid overlapping write ownership. If coupling is high, parallelize read-only investigation and centralize the write/integration step.

## Evidence ceiling

Never promote a claim above the strongest proof actually obtained. For software, a useful ladder is:

`source -> build/typecheck -> focused test -> subsystem -> integration -> production main path -> researcher workflow -> realistic workload -> benchmark -> adversarial failure -> domain/scientific validation -> independent reproduction`

Scientific validity is evaluated separately from software correctness.
