# START_HERE — FAR-Lab Workspace Entry

Current truth lives in `.control/EXECUTION_STATE.json`. Read order for any new session:

1. `AGENTS.md` (workspace constitution)
2. `.control/EXECUTION_STATE.json` (current phase, critical problems, next action)
3. `task_plan.md` (this build's static plan snapshot)
4. Domain policies on demand: `project-spec/policies/README.md` (load map — do not preload)

## What this workspace is

FAR-Lab: evidence-constrained, falsifiable, revisable scientific hypothesis generation and
research-plan design. Target: XH-202619 Track 1 / Direction 1 / A. Greenfield build that
started 2026-08-21 from zero product code; construction state is tracked in `.control/`.

## Build in progress

- Product code: `src/` (domain, app, persistence, providers, sources, pipeline, cli), `web/` later.
- Evidence: `evidence/` (per-wave real run outputs), spikes under `spikes/`.
- Gates: `node zcode-harness/scripts/completion-gate.mjs` (must exit 0 before any completion claim).
- Formal build controller: `FINAL_BUILD_PROMPT.md`.
