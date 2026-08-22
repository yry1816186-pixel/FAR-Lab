# FAR-Lab Wave-8 Source Expedition: crewAI + claude-flow

**Date:** 2026-08-22
**Repositories:** crewAIInc/crewAI (MIT), ruvnet/claude-flow (MIT)

## Section 1: crewAI - Durability Framework Analysis

### 1.1 Flow Persistence & Checkpointing

Dual-layer architecture:
1. RuntimeState checkpointing (event-driven, entity graph snapshot)
2. FlowPersistence (method-granular, per-completed-method save)

#### 1.1.1 RuntimeState Checkpoint System

| Dim | Mechanism | Location | Summary | Value | Port Cost |
|-----|-----------|----------|--------|-------|-----------|
| D1 | Event-Driven Auto-Checkpoint | state/checkpoint_listener.py:229-244 | Global handler on all BaseEvent subclasses. Lazy registration. Checkpoints on task_completed by default. | **High - Solves P1** | Medium |
| D1 | SqliteProvider Backend | state/provider/sqlite_provider.py:16-35 | checkpoints(id PK, created_at, parent_id, branch, data JSONB). WAL mode. Prune support. | **High - Same stack** | **Very Low** |
| D1 | Lineage Chain Tracking | state/runtime.py:216-228 | _chain_lineage() sets parent_id after each write. fork() for branches. | Medium | Low |
| D1 | Version Migration | state/runtime.py:89-119 | _migrate() applies version-gated transforms on deserialize. | Medium | Medium |

#### 1.1.2 Flow-Level Persistence

| Dim | Mechanism | Location | Summary | Value | Port Cost |
|-----|-----------|----------|--------|-------|-----------|
| D5 | FlowPersistence Protocol | flow/persistence/base.py:18-117 | ABC with init_db(), save_state(), load_state(), save_pending_feedback() | **High - Method granularity** | Medium |
| D5 | SQLiteFlowPersistence | flow/persistence/sqlite.py:71-113 | Two tables: flow_states + pending_feedback (UNIQUE flow_uuid). WAL mode. | **High - Durable pause/resume** | **Very Low** |
| D5 | @persist Decorator | flow/persistence/decorators.py:147-191 | Metadata stamper. Class/method level scoping. | Medium | Low |

### 1.2 Task Retry & Agent Iteration Control

| Dim | Mechanism | Location | Summary | Value | Port Cost |
|-----|-----------|----------|--------|-------|-----------|
| B4 | Guardrail Retry Loop | task.py:275-282 | guardrail_max_retries=3, retry_count tracker | Medium | Low |
| B4 | Max Iterations Guard | utilities/agent_utils.py:363-373 | has_reached_max_iterations() boolean check | Medium | Low |
| B4 | Graceful Exit | utilities/agent_utils.py:376-409 | Force final answer LLM call on max iterations exceeded | Medium | Low |

### 1.3 Memory Storage Interface

| Dim | Mechanism | Location | Summary | Value | Port Cost |
|-----|-----------|----------|--------|-------|-----------|
| G3 | StorageBackend Protocol | memory/storage/backend.py:44-213 | Protocol with save, search(vector), delete, update, get_record, list_records, get_scope_info, list_scopes, list_categories, count, reset + async variants | **High - Pluggable** | Medium |

### 1.4 Human Input Handling

| Dim | Mechanism | Location | Summary | Value | Port Cost |
|-----|-----------|----------|--------|-------|-----------|
| F1 | Task.human_input Flag | task.py:233-236 | Boolean flag for human review requirement | Low | Zero |
| F1 | @human_feedback Decorator | flow/human_feedback.py:362-386 | DSL decorator with sync/async modes. Async raises HumanFeedbackPending -> persist via save_pending_feedback() | **High - Durable pause/resume** | Medium-High |

### 1.5 Kickoff State & Observability

| Dim | Mechanism | Location | Summary | Value | Port Cost |
|-----|-----------|----------|--------|-------|-----------|
| D6 | Crew.kickoff() with Resume | crew.py:992-1012 | kickoff(from_checkpoint). Auto-restore + recurse. | **High - Transparent resume** | Low |
| D6 | apply_checkpoint() Helper | state/checkpoint_config.py:215-234 | Three-case dispatcher: None/restore_from/config-only | Medium | Low |
| D6 | kickoff_async() | crew.py:1127-1150 | Async wrapper with same from_checkpoint param | Low | Zero |
| D6 | EventRecord DAG | state/event_record.py:99-226 | Directed graph of events. O(1) lookup. RWLock thread-safe. | **High - Causal tracing** | Medium |

## Section 2: claude-flow (Ruflo) - Orchestration Analysis

### Architecture
Agent meta-harness for Claude Code/Codex. Plugin-based. Core engine in excluded crates/ (Rust).

### What Exists in Extracted Portion
- Arena RunStore (plugins/ruflo-arena/src/persistence/run-store.ts:14-98): Simple competition result persistence only. **Low value** for FAR-Lab.

### What Is ABSENT
- Swarm topology/durable task queue: No .ts files in ruflo-swarm/
- Autopilot loop durability: Only declarative assets in ruflo-autopilot/
- Workflow engine step persistence: ruflo-workflows/ directory absent
- Session-resume/checkpoint: Zero grep matches across .ts files

**Honest Assessment:** Extracted portion contains **no durable orchestration primitives** for P1/P2/P3.

## Section 3: FAR-Lab Fusion Candidates

| Rank | Mechanism | Source | Targets | Effort | Risk |
|------|----------|--------|--------|--------|------|
| #1 | SqliteProvider + Auto-Checkpoint | sqlite_provider.py:49-84 + checkpoint_listener.py:229-244 | **P1 frozen-run** | 2-3 days | Low |
| #2 | SQLiteFlowPersistence + Pending Feedback | flow/persistence/sqlite.py:96-113 | **P2 detached-kill** | 1-2 days | Low |
| #3 | Method-Level @persist | flow/persistence/decorators.py:147-191 | **P3 granularity** | 2-3 days | Medium |
| #4 | Max Iterations Guard | agent_utils.py:363-409 | P1/P2 prevention | 0.5 day | Very low |
| #5 | EventRecord DAG | state/event_record.py:99-226 | P1 diagnosis | 3-4 days | Medium |

## Appendix A: Verified File References

**crewAI Core:**
- state/runtime.py:177-509 (RuntimeState)
- state/runtime.py:286-317 (checkpoint method)
- state/runtime.py:392-442 (from_checkpoint)
- state/checkpoint_config.py:160-213 (CheckpointConfig)
- state/checkpoint_listener.py:229-244 (_on_any_event)
- state/provider/sqlite_provider.py:16-166 (SqliteProvider)
- flow/persistence/base.py:18-117 (FlowPersistence ABC)
- flow/persistence/sqlite.py:24-297 (SQLiteFlowPersistence)
- flow/persistence/decorators.py:147-191 (@persist)
- task.py:275-282 (guardrail_max_retries)
- utilities/agent_utils.py:363-409 (max_iterations)
- crew.py:992-1012 (kickoff with resume)
- state/event_record.py:99-226 (EventRecord DAG)

**claude-flow:**
- plugins/ruflo-arena/src/persistence/run-store.ts:14-98 (only persistence found)

## Appendix B: License
Both repositories: **MIT**. Commercial use permitted.

---
*FAR-Lab Wave-8 Source Expedition Agent*
