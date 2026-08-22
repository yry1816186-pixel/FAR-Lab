# Temporal TypeScript SDK: Mechanism Extraction Report for FAR-Lab Wave-8

**Repository**: sdk-typescript (MIT)
**Analysis Date**: 2026-08-22
**Scope**: Mechanism extraction only - whole-framework adoption is registry-REJECTED

---

## Executive Summary

This report documents 6 core durability mechanisms from the Temporal TypeScript SDK that address FAR-Lab P1 (frozen-run), P2 (detached-execution kill), and P3 (resume granularity) pain points.

---

## Mechanism Detail Table

| Dimension | Mechanism | Source | Summary | Value | Cost | Risk | FAR-Lab State |
|---|---|---|---|---|---|---|---|
| D4 | Deterministic Replay | internals.ts:174, interfaces.ts:260 | Activator class replays from event history. isReplaying flag gates side-effects. Completion promises resolved from history during replay. | Solves P1 frozen-run via event-sourced recovery | Medium-High (200-400 lines) | Must ensure deterministic LLM stages | No replay; runs stuck forever |
| B4 | Heartbeat Checkpointing | activity/src/index.ts:385, samples/activities.ts:1 | Context.heartbeat(details) sends progress, enables cancellation, provides resume point on retry. Server detects dead workers via heartbeatTimeout. | Solves P2+P3: incremental progress saves LLM calls on retry | Low-Medium (80-150 lines) | Sqlite write overhead | Zero liveness; 93-243min stuck runs |
| D6 | Retry Classification | retry-policy.ts:9, failure.ts:252 | Two-layer: policy nonRetryableErrorTypes + instance nonRetryable flag. Exponential backoff. Default retryable unless flagged. | Prevents wasted retries on terminal errors | Low (60-100 lines) | None significant | No structured error classification |
| G3 | Worker Liveness | worker-options.ts:398, worker.ts:341 | Sticky queue timeout (default 10s) evicts dead worker ownership. Poller state machine. Eviction reasons enum. | Directly solves P1: auto-detect dead workers | Medium (100-200 lines) | Lease timing for sqlite | Killed worker = permanent stuck |
| D1 | Update/Signal | internals.ts:996, workflow-client.ts:702 | Signals fire-and-forget; Updates request-response with validator. signalWithStart atomic start+signal. Buffered ordering. | Human-in-the-loop control surface | Medium (200-350 lines) | Sqlite buffering order | No external interaction capability |
| B4/D1 | Cancellation Scopes | cancellation-scope.ts:90, errors.ts:30 | Tree-structured scopes with cancelRequested promise. Cooperative cancellation. Non-cancellable shields for cleanup. | Graceful shutdown saves partial work | Medium (150-250 lines) | LLM AbortController support | Abrupt process kill loses all |

---

## FAR-Lab Fusion Candidates (Ranked)

### Candidate 1: SQLite Heartbeat Lease System [P1+P2+P3] HIGHEST
Combine heartbeat progress checkpointing with lease timeout for single-process sqlite.

**Current**: status=running set once, never updated.
**Proposed**: Add last_heartbeat_at, heartbeat_details JSON, lease_expiry columns. Sweep resets stale runs. Resume reads details.

Variant (~120 lines): HeartbeatLeaseManager class with heartbeat(), sweepStaleRuns(), getResumeState() methods.

Evidence: activity/src/index.ts:405-407, worker-options.ts:398-403

### Candidate 2: Event-Sourced Stage Replay Engine [P1] HIGH
Adapt activation-based replay to stage model.

**Current**: In-memory orchestrator; crash loses context.
**Proposed**: Each stage transition emits event. Recovery = replay events to reconstruct state.

Key insight: isReplaying flag suppresses side-effects during replay (interfaces.ts:260).

Variant (~250 lines): StageReplayer class replays events deterministically.

Evidence: internals.ts:174, interfaces.ts:260-272

### Candidate 3: Structured Retry Classifier [P2] MEDIUM-HIGH
Port two-layer classification for LLM stage errors.

**Current**: Ad-hoc or no retry.
**Proposed**: Declarative policy per stage + instance override.

Variant (~80 lines): classifyError() function with policy + error type matching.

Evidence: retry-policy.ts:9-45, failure.ts:252-253

### Candidate 4: Cancellation Scopes [P3] MEDIUM
Port scope tree for cooperative shutdown.

**Current**: Process kill = 100% loss.
**Proposed**: Cancellation flag checked before each LLM call. Cleanup in non-cancellable wrapper.

Variant (~100 lines): StageCancellationScope with cancelRequested promise.

Evidence: cancellation-scope.ts:90-199, errors.ts:30-36

### Candidate 5: Signal/Update Control [Future] LOWER
Enable external interaction mid-execution.

Use cases: Pause pipeline, inject changes, query state.

Evidence: internals.ts:996-1048, workflow-client.ts:702-709

---

## Priority Matrix

| Mechanism | Pain Point | Lines | Deps | Risk | Phase |
|---|---|---|---|---|---|
| Heartbeat Lease | P1+P2+P3 | 120-180 | sqlite | Low | Phase 1 |
| Stage Replay | P1 | 250-400 | sqlite | Medium | Phase 2 |
| Retry Classifier | P2 | 60-100 | None | Low | Phase 1 |
| Cancellation Scopes | P3 | 100-150 | None | Med | Phase 2 |
| Signal/Update | Future | 200-350 | sqlite | Medium | Phase 3 |

---

## Critical Success Factors

1. **Determinism**: Replayed code must produce identical outputs. LLM responses from events, not API calls.
2. **Heartbeat Granularity**: Balance sqlite overhead vs detection latency. Per-subtask + optional time-based.
3. **Lease Timing**: Single-process can use 5-10s timeouts (no network latency).
4. **Error Taxonomy**: Define types before classifier: RateLimit, AuthFail, InvalidInput, NetworkError, LLMProviderError.

---

## References

### Core Files
- packages/workflow/src/internals.ts - Activator, activation handlers
- packages/workflow/src/interfaces.ts - WorkflowInfo, isReplaying flags
- packages/workflow/src/cancellation-scope.ts - CancellationScope
- packages/workflow/src/errors.ts - isCancellation helper
- packages/activity/src/index.ts - Context.heartbeat API
- packages/common/src/retry-policy.ts - RetryPolicy interface
- packages/common/src/failure.ts - ApplicationFailure, nonRetryable
- packages/worker/src/worker.ts - Poller state, eviction
- packages/worker/src/worker-options.ts - Sticky queue config
- packages/worker/src/replay.ts - EvictionReason enum
- packages/client/src/workflow-client.ts - signalWithStart

### Samples
- samples-typescript/activities-cancellation-heartbeating/src/activities.ts

---

*Report generated for FAR-Lab Wave-8. MIT licensed source.*