# Handoff 10 -> 12: optional first-class persistence for simulation specs (R2-10)

- **Requested change (optional upgrade, not a blocker):** register
  `simulation_spec: SimulationSpec` in `KIND_SCHEMAS` (`src/persistence/store.ts`, 12's
  file; one line + import from `../domain/index.js`). R2-10 shipped
  `SimulationSpec` in `src/domain/experiment.ts` and its executor persists the spec
  snapshot as a content-addressed artifact + audit events instead, precisely to avoid
  touching 12's file. A registered kind would enable `listObjects('simulation_spec')`
  projections (web timeline, export bundles) without changing executor semantics.
- **Reason:** persistence/domain stewardship is 12's exclusive ownership.
- **Files:** `src/persistence/store.ts` only.
- **Urgency:** P3 (current artifact+event representation is honest and complete for
  execution; the kind is a queryability upgrade).
- **Port-vs-duplicate rule:** the type already exists
  (`src/domain/experiment.ts`, exported via `src/domain/index.js`); register, do not
  re-model.
