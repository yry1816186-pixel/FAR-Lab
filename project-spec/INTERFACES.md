# INTERFACES.md — Canonical Interface Contracts

Exact schemas may evolve during W0/W1; semantics below are the contract.

## 1. Run lifecycle

Canonical lifecycle must support at least:
`created -> queued/running -> paused_or_waiting (when real) -> partial/failed/cancelled/completed` plus persisted stage/checkpoint metadata.

Do not invent percentage progress. Expose determinate stage/subtask counts only when the runtime actually knows them; otherwise expose current stage/status/elapsed information.

## 2. CLI

Human-readable output is the interactive default; stable machine-readable JSON is available for automation.

Representative commands (final names may be simplified):

```text
far research start <question> [--json]
far research status <run-id> [--json]
far research inspect <run-id> --evidence|--hypotheses|--plan|--revisions
far research feedback <run-id> ...
far research cancel <run-id>
far research resume <run-id>
far research export <run-id> --format report|bundle
far verify <bundle-or-run>
```

CLI requirements: meaningful `--help`, stable exit-code policy, stderr for diagnostics, interrupt handling, non-interactive/script use, no fake progress, and no different business rules from Web/API.

## 3. Web application

Primary information architecture centers on:
- Research Questions / Runs;
- Evidence & Sources;
- Hypothesis comparison/falsification;
- Research Plan;
- Feedback/Revision history;
- Provenance/Reproducibility;
- Run control/diagnostics.

Every action maps to a real application use-case. Empty/loading/error/partial/rate-limit/disconnected states are first-class. No judge/demo dashboard or dead controls.

## 4. API/application boundary

Use stable application contracts, whether exposed via HTTP or in-process client. If HTTP is used, provide:
- versioned/compatible request/response schemas;
- idempotency where side effects can repeat;
- structured error code + message + retryability + correlation/run ID;
- streaming/event endpoint only when it carries real state/events.

Do not create endpoints merely to make the project look complete.

## 5. Model adapter

Semantic interface examples:
- structuredGenerate(schema, messages/context, options)
- critique/compare under a validated schema
- optional tool calling where required
- receipt: provider, model, version/snapshot if available, timing/usage, request/output hash, execution mode/status.

The R1 adapter must support the live model route required by the current official competition rules. Test adapters are explicit test-only implementations.

## 6. Source adapter

A source adapter returns normalized metadata plus the exact content/payload available for reasoning and an immutable source reference/hash. It must distinguish metadata/abstract/full text/data and preserve source/licensing/access limits.

Citation resolver converts cited identifiers into a verified source record. Failure to resolve or align means the evidence relation cannot be promoted as verified support.

## 7. Persistence boundary

Repositories/services expose canonical domain operations rather than raw storage semantics. Transactions own mutable run/revision state; append-only events/receipts provide audit history; immutable artifacts hold source/export payloads.

No client, model prompt or exported file may become a second state owner.

## 8. Error contract

Classify at least: validation, authentication/authorization, source unavailable/rate-limited, provider failure/rate-limit, tool failure, conflict/idempotency, cancelled, corrupted state/artifact, internal error.

Errors must say whether retry is safe and whether partial results/checkpoints exist. Production errors never switch invisibly to synthetic output.
