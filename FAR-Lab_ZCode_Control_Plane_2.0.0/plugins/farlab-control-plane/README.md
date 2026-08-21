# FAR-Lab Control Plane 2.0.0

A deliberately compact ZCode plugin for long-horizon FAR-Lab engineering and autonomous R&D. It is not a second product specification and it does not teach generic coding skills the model already has. It supplies the control mechanisms that are easiest to lose during a large mission: critical-path orchestration, decision-focused research, scientific validity, integration ownership, evidence-based verification, anti-fake completion, frontier opportunity saturation, recoverable state, and deterministic safety hooks.

## What changed from 1.2.0

- Completion is now two-level: **Acceptance Floor** first, then **Frontier Gate**. Passing competition/product acceptance is no longer equivalent to finishing the mission.
- Adds `mission-orchestration` and `frontier-evaluation` skills.
- Adds `frontier-scout` independent subagent.
- Adds `/frontier-sweep` and `/frontier-gate` commands.
- Adds a Stop hook that can reject premature completion while respecting ZCode's finite continuation limit and bounded tasks.
- Session context now injects compact acceptance, blocker, critical-problem, frontier and protocol state.
- Failure hook detects repeated identical failures without storing raw secrets.
- Destructive guard covers a wider set of Git/filesystem/container/infrastructure/database destructive operations while reserving hard deny for obviously catastrophic targets.
- Removes semantic dependence on one exact workspace Harness version. The plugin understands the legacy `.control` shape and the optional v2 frontier control file; project-native Harness scripts remain authoritative when present.
- Includes self-tests and deterministic gate scripts for offline verification of the plugin source.

## Installation

This distribution is already a local ZCode marketplace:

```text
farlab-control-plane-2.0.0/
  marketplace.json
  plugins/
    farlab-control-plane/
      .zcode-plugin/plugin.json
      ...
```

In ZCode, add the extracted top-level directory as a custom/local marketplace source, install `farlab-control-plane`, enable it, then start a **new session** so plugin hooks are snapshotted into the runtime.

If using a remote SSH/WSL workspace, use ZCode's plugin sync capability after local installation.

## Recommended operating model

1. Keep durable project instructions in root `AGENTS.md` and canonical `project-spec/*`.
2. Keep truthful execution state in `.control/*`.
3. Use `/goal` for the long-running session objective. Goal is the primary continuation controller.
4. Use this plugin as the R&D control layer around the goal: orchestration, research, review, gates and safety.
5. Use `/mission resume` after interruption/compact when needed.
6. Treat `/completion-gate` as the acceptance floor only.
7. After acceptance, run `/frontier-sweep`, independent audit, then `/frontier-gate`.

Do not use the Stop hook as a substitute for `/goal`; ZCode intentionally limits consecutive Stop continuations.

## Stop guard modes

The packaged default is `mission_strict`, but strict continuation engages only when `.control` explicitly marks a live mission; otherwise behavior safely degrades to guarding premature completion claims. A workspace can override this through its execution state using `stopGuard: "off"`, `stopGuard: "completion_claims"`, or `stopGuard: "strict"` when that field is compatible with the project's canonical control schema.

The guard does **not** continue a mission that is explicitly paused, globally externally blocked, waiting for required user authorization, or budget-limited.

## Optional frontier state

For the strongest FAR-Lab mission contract, copy `templates/FRONTIER_STATUS.json` into `.control/FRONTIER_STATUS.json` when the workspace does not already define an equivalent canonical frontier record. Do not create a duplicate state authority if the project's existing control schema already models the same information.

`templates/CONTROL_PROTOCOL.json` is optional metadata for explicit control-protocol compatibility. Absence is treated as legacy-compatible, not as failure.

## Offline plugin verification

From the plugin source directory:

```bash
node scripts/plugin-doctor.mjs
node scripts/self-test.mjs
```

These validate package structure and local hook/gate behavior. They do **not** prove that the installed ZCode client loaded the plugin. Runtime proof still requires enabling the plugin and exercising it in a new ZCode session.
