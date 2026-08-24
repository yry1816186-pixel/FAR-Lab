# R2 Lane 10 — scientific-execution report (2026-08-25)

Branch `ws/r2/10-scientific-execution`, base `baseline/parallel-r2` (`47cc373`).
Worktree `~/Desktop/new/work/r2-10-scientific-execution`.

## What this lane delivered

The execution substrate entered R2 already strong (local executor with preregistered
statistics + mechanical verdicts + fingerprint dedup + dataset audit; durable scheduler
with fence tokens / DLQ / outbox idempotence; SSH gateway + device registry + remote
executor with device-side kill discipline; meta-analysis executor; hardened exploration
sandbox). The lane mandate's remaining gaps were closed:

1. **Regression workload closure** (`8393b91`) — four regressor builders
   (`dummy_mean`, `linear_regression`, `random_forest_regressor`,
   `gradient_boosting_regressor`) in the reviewed template registry (local
   `builders.py` + mirrored remote `remote/train_eval.py`). Per-row outcome for
   regressors is the SQUARED error, whose mean is exactly MSE — so regression
   comparisons ride the existing bootstrap/verdict chain with an exactly-decomposable
   per-row statistic. Task-coherence validation gates added: no mixed
   classifier/regressor specs, task-matched metric lists, and a per-row decomposition
   gate — comparison `metricKey` must be `accuracy` (classification) or
   `mean_squared_error` (regression); `f1_macro`/`r2`/etc. are report-only (they have
   no exact per-row decomposition; a mislabeled CI is worse than none — this closes a
   pre-existing latent hazard where any non-accuracy comparison would have
   bootstrapped correctness and mislabeled it). Regression specs skip the
   classification-shaped label-issue audit with an explicit disclosed skip event.
2. **Hardware/environment capture** (`8393b91`) — sidecar `env_info` returns
   system/machine/python-implementation/cpu-count; recorded into
   `ExperimentRun.environment.hardware` (reproducibility context; same-device-only
   determinism claim unchanged, D-086-3).
3. **Simulation/numerical workload kind** (`dd735eb`) — `SimulationSpec` +
   `checkSimulationSpec` + reviewed `monte_carlo` sidecar template + executor
   (`src/experiment/executor-simulation.ts`). Per-REPLICATE outcomes (mean /
   block-variance / threshold-indicator) feed the SAME `abs_stats`/`paired_stats`
   → mechanical-verdict → feedback chain (no second statistical engine; shared
   `computeStatReports`/`buildFeedback`, widened signatures). CRN discipline: paired
   simulation comparisons require identical RNG-stream shape (template/family/seed/
   replicates/statistic) — the validator rejects CRN-incompatible pairs; the op draws
   the raw stream first and applies distribution parameters as transforms afterwards,
   so parameter-only differences pair honestly (variance reduction). Binding
   approvals, MDE requirement, `[0,1]` attainability floor for `threshold_prob`,
   sequential-analysis (re-run labelled exploratory) all mirror the ML path. Spec
   snapshot persisted as a content-addressed artifact + audit events (kind
   registration offered to lane 12 by handoff).
4. **Sandbox target operationalization + LIVE remote proof** (`2e534e4`) —
   `experiment-runtime/ssh-target/up.mjs`: one command builds the image, runs the
   container with `--memory/--cpus` caps and loopback-only port publish, generates a
   dedicated ed25519 key, TOFU-pins the host key, waits for real SSH readiness, and
   registers the device in `devices.json`. Live proof executed: a REGRESSION spec
   enqueued for the device and completed by `far experiment worker --device
   ssh-sandbox-2242` — remote Python 3.11.2, paired MSE diff −239.59, CI
   [−327.48, −159.32] entirely below the −10 threshold → mechanical verdict
   `supports`, feedback signal persisted (evidence below). The mirrored remote
   template's regression branch is thereby proven on a real device.
5. **Five live failure-injection drills** (`ca5fecd`) — see Evidence.

## Commits

- `8393b91` feat(experiment): regression workload closure + hardware capture (R2-10)
- `dd735eb` feat(experiment): simulation workload - CRN monte-carlo on shared stats chain (R2-10)
- `2e534e4` feat(experiment): ssh-target ops bring-up helper + live remote regression proof (R2-10)
- `ca5fecd` test(experiment): five live failure-injection drills with captured evidence (R2-10)

## Evidence (commands + exit codes + key output)

Baseline sanity (fresh worktree at `47cc373`, before any edit): `npm ci` exit 0;
`npm run typecheck` exit 0; `npm run build` exit 0.

### Real workloads (offline, deterministic)

- Regression E2E (real uv sidecar): `npx vitest run tests/experiment-regression.test.ts`
  → 8/8 passed. Full chain: split → train → MSE stats → verdict `supports` (paired
  linear-vs-mean diff ≪ −10) → feedback; `mean(perRow) === metrics.mean_squared_error`
  exact to 1e-12; determinism double-run identical; non-numeric target fails with
  verbatim `non-numeric` error and run status `failed`.
- Simulation E2E (real uv sidecar): `npx vitest run tests/experiment-simulation.test.ts`
  → 13/13 passed. CRN affine pair → per-replicate diff constant 1.0 → degenerate CI
  [1,1] → `supports`; absolute `threshold_prob` of N(1.2,1) > 0 → point 0.85–0.92
  (Φ(1.2)=0.8849), exploratory-labelled (no verdict, no feedback); block-variance of
  N(5,2²) → 3.5–4.5 (σ²=4); determinism identical arrays; sequential guard iteration 2
  exploratory; unknown template → loud sidecar error.
- Local-sidecar smoke (regression + hardware): `uv run --frozen python -m
  farlab_experiment_runtime` one-shot (see lane session) →
  `linear_regression` MSE 0.00277 / r2 0.99946, `dummy_mean` MSE 148.80,
  `env_info.hardware = {system: Windows, machine: AMD64, cpuCount: 32}`.

### Live remote execution (Docker sandbox, daemon up at drill time)

- `node experiment-runtime/ssh-target/up.mjs --data-dir <proof> --port 2242` →
  `device ready: ssh-sandbox-2242` (image built, key + TOFU pin, devices.json merged).
- `node experiment-runtime/ssh-target/remote-regression-proof.mjs <proof> ssh-sandbox-2242`
  → job `job_685e648aba428bc7fddacfd7` enqueued for the device.
- `node dist/cli/main.js experiment worker --data-dir <proof> --device ssh-sandbox-2242 --max-jobs 1`
  → `worker(ssh-sandbox-2242) drained: executed=1 failed=0`, exit 0.
- `far experiment status --job ... --json` → job `completed`; far.db run `completed`,
  `executor: remote`, `pythonVersion: remote:3.11.2`, result set + stat report +
  training-log artifact persisted. Stat report: point −239.59, CI [−327.48, −159.32],
  verdict `supports`, derivation string present. Training log:
  `evidence/r2-10-scientific-execution/remote-regression-training-log.txt`.

### Failure injection (all captured under `evidence/r2-10-scientific-execution/`)

`DRILL_DATA_DIR=<proof> node evidence/r2-10-scientific-execution/failure-drills.mjs`
→ exit 0, `ALL DRILLS LANDED IN EXPECTED STATES`:

1. Timeout: RF-2500 on 20k×30 blows the 8s compute budget → run `failed`,
   `sidecar call train_eval timed out after 8000ms` (tripped mid-training).
2. Dependency failure: sidecar module missing → run `failed`,
   `sidecar exited (code 1) before answering env_info`.
3. Cancellation: cooperative flag at 4s mid-training → run `canceled`,
   `cancelRequested: true`.
4. Process death + resume: worker A (real child process) SIGKILLed mid-training;
   after the heartbeat TTL elapsed, worker B reclaimed the stale lease and completed
   → job `completed` with `attempts: 2`, `fenceToken: 2` (temporal sticky-lease held).
5. Resource-capped device: RF-2000 on 40k×120 against the 512m/2-cpu container →
   remote run `failed` with the device-side kill:
   `remote training rf-huge timed out on the device (exit 124: TERM, budget 300000ms)`
   — the ag2 remote kill discipline fired on the capped device (observed mechanism:
   budget timeout under caps, not an OOM kill; labelled honestly in the evidence file).

### Gates (lane-local)

- `npm run typecheck` exit 0; `npm run build` exit 0 (after every batch).
- Lane suites: `tests/experiment*.test.ts` (regression 8/8, simulation 13/13),
  scheduler/gateway/remote-executor/cli-experiment suites green in the full run.
- Full suite at lane head (`npm test`, exit 1 due to the pre-existing failures only):
  **1446 passed / 4 failed / 4 skipped (1454)** vs baseline 1425/4/4 (1433) —
  lane delta +21 tests, +21 passed, **zero new failures**. The 4 failures are
  PRE-EXISTING at the baseline tag and are outside this lane's ownership (identical
  failing set verified by name: file-ingest, citation-entries ×3, storage-hardening
  ×1; details in Conflict notes).
- `node zcode-harness/scripts/secret-scan.mjs` exit 0 (see below).

## Conflict notes (shared files touched)

- `src/domain/experiment.ts` — semantic experiment-domain edits under lane 10's
  mandate (BuilderId +regressors, MetricKey +3 sim keys, per-row decomposition gates,
  EnvInfo.hardware, SimulationSpec + checkSimulationSpec). 12 stewards structure;
  no `index.ts` changes needed (existing `export *`).
- `src/experiment/executor.ts` — widened `computeStatReports`/`buildFeedback` param
  types (behavior-preserving, enables simulation reuse); regression audit-skip branch.
- `experiment-runtime/remote/train_eval.py`, `.../builders.py`, `.../ops.py` —
  regression + simulate templates (lane-owned).
- **Pre-existing baseline failures (NOT this lane's, recorded for the Integrator):**
  at `baseline/parallel-r2` on this machine, `tests/citation-entries.test.ts` fails
  3/4 (`parseCitationEntries` returns null — deterministic parser failure; lane 05's
  ingest domain), `tests/file-ingest.test.ts` fails at file level (lane 05), and
  `tests/storage-hardening.test.ts` RU-7.3 backwards-clock test fails
  (`regressedSeconds` expected 3600 got 22342 — time-bomb test using fixed historical
  timestamps against wall-clock now; lane 12/13). These contradict the recorded R1
  fresh-baseline evidence (141 files/1442 pass) on the same tree — either the
  recorded evidence predates last R1 test edits or is otherwise stale; the R2 delta
  itself is planning-only (verified via `git diff --stat` at baseline).
  I did not touch them (rule 2).

## Handoffs

- **Given:** `r2-2026-08-25-from-10-to-03-cli-surface.md` (P2): `far experiment
  run|enqueue --device <id>` pass-through + `far experiment simulate <simspec.json>`
  surface; engines are exported and tested, CLI file is 03's.
- **Given:** `r2-2026-08-25-from-10-to-12-simulation-spec-kind.md` (P3): optional
  `simulation_spec` KIND_SCHEMAS registration for queryability.
- **Received:** none.

## Deviations

- Lane-prompt branch name `ws/r2-scientific-execution/main` was NOT used; the binding
  repo contract (BASELINE.md/INTEGRATION_RULES: `ws/r2/<nn>-<slug>`) and all seven
  existing lanes use `ws/r2/10-scientific-execution`. Same for the report path
  (`reports/r2/<nn>-<slug>-report.md`).
- Docker Desktop (installed, daemon down) was started by the lane to exercise the
  remote path — the lane prompt requires remote execution "if the current environment
  supports it"; the R1-era blocker note ("user starts Docker daemon") predates this
  session. Local, reversible, and torn down after the drills (`docker rm -f`).
- No live-API/model testing occurred anywhere (no-live-API policy respected);
  the "live" proof above is a local Docker SSH boundary, not a cloud call.
- Residue check performed before building (rule 4): no simulation engine existed
  anywhere (`rg` across tree + residue list); regression existed only as a designed
  gate (validator) + metric keys — closed in place, nothing ported.

## Unverified / honestly bounded claims

- Cross-device bit-identity is NOT claimed (same-device only, D-086-3) — remote
  results carry device identity in fingerprints.
- `sim_variance` block estimator: unbiased for i.i.d. blocks; CRN pairing across
  variance configs shares block structure but the estimator's degenerate-CI behaviour
  under CRN is not asserted anywhere (only mean/threshold_prob CRN degeneracy is
  demonstrated by tests).
- The sandbox container is an ENVIRONMENT boundary (isolated fs/process, capped
  memory/cpu, loopback-only publish), not a full security sandbox — same honest
  framing as gateway.ts.
- Remote regression proof used a synthetic deterministic benchmark CSV (explicitly
  labelled in the driver); no production data was involved.
