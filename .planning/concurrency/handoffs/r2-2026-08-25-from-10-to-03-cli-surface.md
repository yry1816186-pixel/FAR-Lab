# Handoff 10 -> 03: experiment CLI surface extensions (R2-10)

- **Requested change:** two small `src/cli/experiment.ts` additions (03 owns `src/cli/**`):
  1. `far experiment run|enqueue <spec.json> --device <id>` — pass-through to the
     existing `enqueueExperiment(store, scheduler, spec, { device })` option
     (scheduler per-device dispatch already implemented; validated live on the
     Docker sandbox target, lane report `evidence/r2-10-scientific-execution/`).
     Validate the id against `openDeviceRegistry(<dataDir>/devices.json)` exactly as
     the `worker` subcommand already does.
  2. `far experiment simulate <simspec.json>` — execute a `SimulationSpec`
     (`checkSimulationSpec` + `executeSimulationExperiment`,
     `src/experiment/executor-simulation.ts`, R2-10) and print the mechanical
     verdicts, mirroring the `rerun` output shape (specId, statReports with verdict,
     feedback ids). No queueing needed for v1 (direct execution).
- **Reason:** R2-10 shipped the engines; the CLI is the product surface and 03 owns it.
- **Files:** `src/cli/experiment.ts` (03), `src/cli/main.ts` usage line (03).
- **Urgency:** P2 (engines are reachable via tests/scripts; CLI is the human surface).
- **Proposed patch:** none attached — both call sites are one-liners against existing
  exported APIs; 03 owns the surface shape (flags, `--json` contract).
- **Reference implementation:** `experiment-runtime/ssh-target/remote-regression-proof.mjs`
  shows the enqueue-with-device call; `tests/experiment-simulation.test.ts` shows the
  simulate execution path.
