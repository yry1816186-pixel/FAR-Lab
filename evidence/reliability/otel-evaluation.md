# OpenTelemetry Evaluation — FAR-Lab Reliability Workstream (2026-08-24)

Decision required by the observability domain: adopt the OTel SDK, or align
semantics without the dependency. Verdict first.

## Verdict

**REJECT the OTel SDK for the current product; ADOPT OTel semantic conventions
in our own spine.** No dependency added. Two concrete reversal triggers below.

## Why (evidence, not taste)

1. **Zero-runtime-dependency is a protected invariant.** `.control/EXECUTION_STATE.json`
   protectedInvariants: "Zero new runtime dependencies in the Node product
   (zod-only)". `@opentelemetry/sdk-node` + auto-instrumentations transitively
   pulls 30+ packages (sdk-trace-base, resources, exporters, instrumentation
   hooks per instrumented module). That is a supply-chain and review surface
   (project-spec DEPENDENCY_POLICY) far larger than the problem it solves for a
   single-machine local product.

2. **We already have span-shaped data with stronger guarantees than OTel.**
   The append-only event spine (`events` table) is DB-enforced immutable
   (migration v7 triggers) and hash-chained (`prev_hash`); model-call receipts
   carry provider/modelId/latencyMs/usage/requestHash. OTel spans are in-memory
   constructs with best-effort export; our spine is transactional with the
   state it describes. Replacing that with OTel would be a downgrade in
   durability, not an upgrade in observability.

3. **No collector in the deployment model.** FAR-Lab runs as a local
   researcher workbench (CLI + local web server + node:sqlite). There is no
   telemetry backend to export to; OTLP-over-HTTP to localhost with nothing
   listening would be pure overhead.

4. **What was actually missing was classification and sampling, not tracing.**
   The gaps found (unified error taxonomy, resource/storage samples, derived
   recovery phases) are solved by `src/app/observability.ts` +
   `src/app/recovery-state.ts` at zero new dependencies.

## Semantic alignment (what we adopted)

| OTel semantic convention | FAR-Lab carrier | Notes |
|---|---|---|
| trace_id | `run_id` | one research run = one trace |
| span (name) | `stage` + `stageAttempt` | attempts preserved as provenance (orchestrator setStage) |
| span duration | stage `startedAt`/`endedAt`; receipt `latencyMs` | receipts = instrument-level spans |
| span events | `events` rows (`receipt_recorded`, `stage_*`) | seq-ordered, hash-chained |
| log records | event `detail` payloads | append-only, queryable (`listEvents`) |
| attributes | `CorrelationSpan` fields (observability.ts §3) | one join vocabulary |
| error type | `ErrorCategory` taxonomy (classifyError) | maps onto OTel's `error.type` values |
| resource metrics | `sampleProcess`/`sampleStorage` | RSS/heap/handles/db/wal/artifacts |
| status (OK/ERROR) | `RunStatus` + stage `state` | richer: skipped has machine reasons |

A future OTLP exporter can project this table losslessly — nothing in the
schema fights the convention.

## Reversal triggers (record, do not guess)

1. **Multi-host execution** (remote experiment gateways beyond the current
   SSH sidecar, campaign execution across machines): cross-process trace
   correlation stops being local; then an OTLP exporter writing from the
   orchestrator is cheaper than reimplementing context propagation.
2. **A deployment where researchers run shared/production instances** with an
   ops team that already operates a collector: then export beats file/DB
   sampling for their workflow.

Either trigger ⇒ revisit with an oss-due-diligence pass on the current OTel
JS SDK version (license Apache-2.0 is fine; the cost is the dependency graph).

## What we explicitly did NOT build

- A homegrown tracing framework (the anti-goal in the workstream brief): no
  span tree, no context propagation, no exporters. Only classification,
  sampling, and a correlation vocabulary over the existing spine.
- Time-series metrics storage: `sampleStorage`/`sampleProcess` are point-in-
  time samples consumed by soak harnesses and `far data obs`; persistence of
  samples is the soak evidence files' job, not a new table.
