# Breadth report: openai/openai-agents-js (Wave-8, 2026-08-22)

Source: breadth subagent (Explore) over `.cache/repos/openai-agents-js` (MIT verified). Report relayed by main agent (subagent returned content without writing file; file written verbatim by main agent).

## 1. AGENT LOOP PRIMITIVES (D1)

| Dimension | Mechanism | Source Location | Summary | Value | Port Cost | Risk/License | FAR-Lab Status |
|---|---|---|---|---|---|---|---|
| D1 | Run loop state machine (`while(true)` + NextStep discriminated union) | `packages/agents-core/src/run.ts:1433`; `runner/steps.ts:7-26`; `runState.ts:1877-1970` | Infinite loop switching on `state._currentStep.type`; 4 step types: `next_step_run_again` / `next_step_final_output` / `next_step_handoff` / `next_step_interruption`. `_currentTurn++` in turnPreparation.ts:335 except interruption resume. | High: every transition type-safe/exhaustive | Medium: loop skeleton ~100 lines; decoupling from OpenAI protocol types needed | MIT. NOTE: no timeout/frozen-run detection — relies on maxTurns + external AbortSignal, no heartbeat/watchdog | FAR-Lab has implicit stage progression; P1 not addressed by their design |
| D1 | MaxTurns enforcement | `runner/constants.ts:2` (DEFAULT_MAX_TURNS=10); `runner/turnPreparation.ts:155-165`; `errors.ts:38` | Counter check at each new turn; throws MaxTurnsExceededError; `null` = unlimited | Medium | Low | MIT | FAR-Lab has no per-stage budget |
| D1 | Item journal + persistence offset | `runState.ts:1949-1970` (`_generatedItems`, `_currentTurnPersistedItemCount`); `runner/runLoop.ts:207-236` | Each tool execution → typed RunItem appended to `_generatedItems`; `_currentTurnPersistedItemCount` tracks durable boundary within current turn | **Very high**: offset tracking is exactly what enables crash-resume without redoing completed subtasks | Medium-High: item types coupled to OpenAI protocol; FAR-Lab reuses pattern not schema | MIT. Do NOT copy their serialization (v1.20 backward-compat blob) | FAR-Lab events table conceptually identical but lacks persisted-offset subtask tracking (P3) |
| D1 | Resume from serialized state | `runState.ts:1672-1765` (SerializedRunState zod v1.20); `runState.ts:1877+` | Full checkpoint incl. currentTurn, currentAgent, generatedItems, context, pendingInput | High | High (schema is huge) | MIT. Monolithic JSON blob risk | FAR-Lab normalized tables are better; adopt the *fields* that matter |

## 2. HUMAN-IN-THE-LOOP (D4/D7)

| Dimension | Mechanism | Source | Summary | Value | Port Cost | Risk | FAR-Lab |
|---|---|---|---|---|---|---|---|
| D4 | `needsApproval` tool hook → first-class interruption | `tool.ts:487-490` (FunctionTool), `:668` (ComputerTool), `:903` (ShellTool); `runner/toolExecution.ts:915-1032` (`handleFunctionApproval`) | needsApproval true → `next_step_interruption` step, RunToolApprovalItem added to `state.interruptions`, run RETURNS control to caller; host calls `state.approve(item)` / `reject(item, reason)` then re-runs | **Very high**: interruption is a first-class step type, not an error; host decides outside run loop (serverless-friendly) | Medium: pending approvals in objects table; approve/reject = SQL UPDATE | MIT. **No approval TTL — if host never responds, run hangs forever** (FAR-Lab must add TTL) | FAR-Lab has no HITL today |
| D4 | Interruption resume (3 outcomes, no turn burn) | `runner/runLoop.ts:1453-1534`; `:241-336` (`resumeInterruptedTurn`) | resume → return_interruption (still waiting) / rerun_turn (rejected, re-run same turn WITHOUT incrementing counter) / advance_step | High: rejection feedback returns to model without burning a turn | Medium | MIT | Maps to FAR-Lab "resume stage N vs restart stage N vs return to caller" |
| D4 | Approval rejection formatting | `runner/approvalRejection.ts`; `toolExecution.ts:839-913` | Rejection reason → tool_result message back to LLM via configurable ToolErrorFormatter; redaction boundary | Medium | Low | MIT | — |

## 3. HANDOFFS (D5)

| Mechanism | Source | Summary | Value | Port | Risk | FAR-Lab |
|---|---|---|---|---|---|---|
| Handoff as function tool (`transfer_to_*`) | `handoff.ts:64-68`, `:228-236`, `:52-56` | Handoffs are tools; LLM chooses transfer; tool result `{assistant: name}` | High | Medium | MIT | FAR-Lab uses deterministic routing (KEEP for Direction-A determinism) |
| Handoff input filter | `handoff.ts:44`, `:208-218`; `extensions/handoffFilters.ts` | `inputFilter(inputHistory, preHandoffItems, newItems) → filtered` applied after handoff, before next agent's model call | **Very high** for least-privilege inter-agent context | Medium (pure functions) | MIT; filters can drop debug-relevant info | FAR-Lab passes full context between stages |
| State ownership transfer | `runState.ts:1893` (`#startingAgent`), `:1889` (`_currentAgent`) | `_currentAgent` reassigned; items/responses/context carry forward; startingAgent preserved | High | Low | MIT | Direct mapping to FAR-Lab currentStage |

## 4. GUARDRAILS (G3)

| Mechanism | Source | Summary | Value | Port | Risk |
|---|---|---|---|---|---|
| Input guardrails (blocking vs parallel) | `guardrail.ts:132-152`; `runner/guardrails.ts:254-270` (split), `:161-240` (tripwire) | `runInParallel` default true — parallel guardrails race the model call (zero critical-path latency); blocking run first; tripwire → InputGuardrailTripwireTriggered hard-stop | **Very high**: parallel guardrails add no latency | Medium (~200 lines + Promise.all) | Parallel guardrail trip AFTER model start wastes LLM cost |
| Output guardrails + blocked-output persistence | `guardrail.ts:271-297`; `runner/guardrails.ts:388-511`; `runner/blockedOutputPersistence.ts` | Blocked output NOT returned; optionally persisted redacted (persistBlockedOutput + sanitizeRejectedOutput) | High | Medium-High | MIT |
| Guardrail error taxonomy | `errors.ts:159-169`, `:246-256`, `:261-274` | GuardrailExecutionError vs Input/OutputTripwireTriggered — "guardrail broken" ≠ "guardrail fired" | Medium | Low | MIT |

## 5. SESSION/STATE (B4)

| Mechanism | Source | Summary | Value | Port | Risk | FAR-Lab |
|---|---|---|---|---|---|---|
| Session protocol (progressive enhancement) | `memory/session.ts:28-96` (Session), `:104-127` (RunContextAware), `:166-171` (TransactionAware) | getSessionId/getItems/addItems/popItem/clearSession base; context-aware (tenant); transaction-aware (atomic append + replace_suffix with idempotent operationId) | **Very high**: interface design pattern; sqlite = native transactional backend | Medium | MIT | events table maps to addItems; applyHistoryTransaction = BEGIN/COMMIT |
| Session history transaction (CAS) | `memory/session.ts:133-162`; `runner/sessionPersistence.ts:170-218`, `:1842-1899` | append_items / replace_suffix(atomic tail replace, compare-then-swamp) with operationId idempotency | High (compaction without races) | Medium-High | MIT | append-only today; replace_suffix relevant if compaction ever added |
| Persistence tracker (sent-vs-prepared) | `runner/sessionPersistence.ts:546-724`; `:661-692` | Persists what was SENT to model (post-filter), not what was prepared — else resume produces different model input | High (subtle correctness) | Medium | MIT | FAR-Lab sends prepared input directly (simpler) |

## 6. TOOL ERRORS + RETRIES (G3/F1)

| Mechanism | Source | Summary | Value | Port | Risk | FAR-Lab |
|---|---|---|---|---|---|---|
| Error-to-model (non-fatal) | `runner/toolExecution.ts:674-697` (`buildFunctionFailureResult`), `:713-786`; `run.ts:250` (ToolNotFoundBehavior 'return_error_to_model') | Tool failure → tool_result error string BACK to LLM for self-correction; only async schema validation is fatal | **Very high**: correct default for LLM agents | Low-Medium | MIT | FAR-Lab corrective re-asks (0d1706e) already implement this class at callStructured level (KEEP) |
| Model retry policies | `runner/modelRetry.ts:23-27` (250ms init, 2x, 2000ms cap, jitter); `:1005-1151` (policy factory: never/providerSuggested/networkError/httpStatus/retryAfter/any/all); `:1153-1292` (getResponseWithRetry) | Composable policies; **replay-safety classification** (safe/unsafe/unknown for side-effect duplication); failed-attempt usage accumulated into successful response | **Very high**: replay-safety distinction is the production nuance | Medium (~500 lines; core loop portable) | MIT: stateful request retry can duplicate server-side responses | FAR-Lab: Wave-4 F1 retry fusion in flight owns this lane (parallel session) — DO NOT duplicate |
| Per-call timeout | `modelRetry.ts:258-343`; `errors.ts:63-76` (ModelTimeoutError) | AbortController + setTimeout; timeout ≠ abort; parent signal reason preserved | Medium | Low | MIT | FAR-Lab has no per-call timeout (P1 contributor) |
| Concurrent tools + sibling cancellation | `toolExecution.ts:536-594` (`executeToolRunsWithConcurrency`); `runner/siblingCancellation.ts` | Worker pool when maxFunctionToolConcurrency>1; siblings cancelled when one fails fatally | High (wall-clock) | Medium | MIT | FAR-Lab sequential; relevant to W8 stretch parallelization |

## 7. TRACING

Span hierarchy Task→Agent→Turn→Tool (`runner/tracing.ts:118-126`, `:166-186`, `:188-200`) + context propagation (`tracing/context.ts`). Medium value; FAR-Lab receipts already carry equivalent structure per call (KEEP).

## FAR-Lab fusion candidates (subagent ranking, main-agent cross-check pending)

1. **Error-to-model + retry** (P1+P2 partial) — NOTE main agent: FAR-Lab callStructured corrective re-asks already landed (0d1706e, ~99% recovery) and Wave-4 session owns provider retry/backoff; this candidate must be re-ranked at shortlist to avoid double-fusion.
2. **Interruption-based HITL** (P2+P3) — `stage_interrupted` state + pending approval objects + approve/reject resume; MUST add TTL (their gap).
3. **Item journal + persistence offset** (P1+P3) — maps 1:1 to events table; persisted offset = subtask resume boundary. **Strongest P3 match in this repo.**
4. (Honorable) Guardrail framework with parallel execution — pre/post-stage hooks; future G3.
