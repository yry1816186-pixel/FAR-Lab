import { z } from 'zod';
import { strictSchemaOrUndefined } from '../providers/http.js';
import { validateStructured, recordModelReceipt, describeShape, withModelSlot } from '../pipeline/llm.js';
import type { RunBudgetView } from '../app/run-budget.js';
import type { ModelProvider, ArtifactStore } from '../shared/ports.js';
import type { AgentTurnRecord } from '../domain/agent.js';
import { AgentActionSchema, type AgentAction, type AgentEventSink, type ReceiptSink, type TranscriptEntry } from './protocol.js';
import type { RolloutWriter, InterruptedTurnDisposition } from './rollout.js';
import { ToolRegistry, validateToolArgs, type ToolContext, type ToolResult } from './tool.js';
import type { ExtensionBus } from './hooks.js';
import type { PermissionEngine } from './permissions.js';
import type { SessionTelemetry } from './telemetry.js';
import { defaultBudget, type TokenBudget } from './budget.js';
import { microcompact, compactedTranscript, transcriptTokens, transcriptTokensBySource, HANDOFF_PROMPT } from './compaction.js';

/**
 * Agent kernel loop (H1) — the FAR-Lab equivalent of Codex CodexThread / Claude Code
 * query() / pi agentLoop, adapted to this codebase's invariants: every model call gets a
 * receipt, every step emits a typed event through a sink that persists FIRST, failures
 * are fail-closed (the provider plane owns bounded retries), and tool failures feed back
 * to the model as structured errors instead of crashing the session.
 */

const PROTOCOL_PROMPT = `You act inside a tool-using agent loop. Each turn you MUST answer with exactly ONE JSON object, one of:
{"action":"use_tool","tool":"<a name from tools>","args":{...},"reason":"<why this advances the task>"}
{"action":"finish","reason":"<why the objective is met>","result":{...the task's result contract...}}
Rules:
- One tool call per turn. Read the tool_result in the transcript before your next move.
- Your turn budget is in turnBudget of every payload. Budget tool calls: finish as soon as the result contract can be satisfied honestly. When turnsRemaining is low, finish NOW with what you have.
- Empty tool results ARE findings — report them honestly (e.g. no counter-evidence found) instead of re-querying with variations.
- Never fabricate tool output, sources or numbers. If a tool fails, state the failure honestly in the final result.
- Only postpone finishing when a specific, named piece of evidence is still missing and one more tool call can plausibly get it.`;

export interface AgentLoopConfig {
  capability: string;
  systemPrompt: string;
  task: string;
  contextEntries?: Array<{ label: string; payload: unknown }>;
  maxTurns?: number;
  budget?: TokenBudget;
  /**
   * Dual timeout (Wave-S v2-harness, mastra loop/timeout lineage): per-TURN budget and
   * TOTAL session budget in ms, enforced cooperatively at turn boundaries, at
   * model-call return and before tool execution — the in-flight provider call itself is
   * bounded by the provider plane's own timeout/retry discipline. Distinct statuses
   * ('step_timeout' | 'total_timeout') keep "one turn hung" separable from "session out
   * of budget" in the rollout.
   */
  stepTimeoutMs?: number;
  totalTimeoutMs?: number;
  /**
   * Composable stop conditions (vercel/ai StopCondition lineage), evaluated at turn
   * boundaries BEFORE work starts; the first firing condition ends the loop with
   * status 'stop_condition' and its name in the error. Combine freely — the loop owns
   * no opinion about what "enough" means.
   */
  stopWhen?: readonly LoopStopCondition[];
  /** Capability result contract; finish payloads failing it are fed back (bounded re-asks). */
  resultSchema?: z.ZodType<unknown>;
  maxFinishReasks?: number;
  maxConsecutiveInvalid?: number;
  /** Polled between turns; non-null text is injected as a steering entry (pi steering queue). */
  steer?: () => string | null;
  /** Cooperative abort, checked at turn boundaries and before tool execution. */
  shouldAbort?: () => boolean;
  /** Compaction window: tool results kept verbatim (default 4). */
  keepLast?: number;
  /**
   * Resume (H6, Codex rollout semantics): continue a persisted session instead of
   * starting fresh. initialTranscript is the reconstructed rollout transcript;
   * resume.priorTurns continues turn numbering within the SAME maxTurns budget.
   */
  initialTranscript?: TranscriptEntry[];
  resume?: { priorTurns: number; openTurn?: { turn: number; tool: string; disposition: InterruptedTurnDisposition } };
}

/** Read-only facts about the session a stop condition may predicate on. */
export interface LoopStopContext {
  turn: number;
  turnsRemaining: number;
  tokensUsed: number;
  transcriptTokens: number;
}

export interface LoopStopCondition {
  name: string;
  shouldStop: (ctx: LoopStopContext) => boolean;
}

/** Hard turn ceiling independent of maxTurns (e.g. capability-tier quotas). */
export const stopAfterTurns = (n: number): LoopStopCondition => ({
  name: `turns>=${n}`,
  shouldStop: (ctx) => ctx.turn >= n,
});

/** Session token ceiling (sum of receipt usage totals across model calls). */
export const stopOnTokenBudget = (maxTokens: number): LoopStopCondition => ({
  name: `tokens>=${maxTokens}`,
  shouldStop: (ctx) => ctx.tokensUsed >= maxTokens,
});

export interface AgentLoopDeps {
  provider: ModelProvider;
  tools: ToolRegistry;
  permissions: PermissionEngine;
  sessionId: string;
  /** Receipt purpose prefix, e.g. 'agent:refine-evidence-gaps' (stage field of receipts). */
  purpose: string;
  emit: AgentEventSink;
  recordReceipt: ReceiptSink;
  telemetry: SessionTelemetry;
  /**
   * Run token-budget governance (BP-1 unified model plane): gates NEW turns before
   * the model call and records usage after — an agent session bound to a run spends
   * from the SAME receipt-derived budget the pipeline honors. Absent = unlimited
   * (sessions without a run, minimal harnesses).
   */
  budget?: RunBudgetView;
  /**
   * Reasoning effort for EVERY model call in this session (conversation gear >
   * config default). Absent = no reasoning fields on the wire — the resolved route's
   * declared capability decides whether this is honored or simply not sent.
   */
  reasoning?: { style: 'reasoning_effort' | 'enable_thinking' | 'thinking_budget'; gear: 'low' | 'medium' | 'high' };
  hooks?: ExtensionBus;
  /** Enables spill-to-artifact for oversized tool results (content-addressed ref). */
  artifacts?: ArtifactStore;
  /** Append-only session rollout (H6 durability). Absent = in-memory session only. */
  rollout?: RolloutWriter;
  /** Sub-agent rollout factory; children get their own JSONL files when present. */
  rolloutFactory?: (sessionId: string) => RolloutWriter;
  parentSessionId?: string;
  /** Sub-agent depth (0 = main session). */
  depth?: number;
  clock?: () => string;
}

export type AgentLoopStatus = 'completed' | 'max_turns' | 'aborted' | 'failed' | 'step_timeout' | 'total_timeout' | 'stop_condition';

export interface AgentLoopResult {
  status: AgentLoopStatus;
  turns: AgentTurnRecord[];
  result?: Record<string, unknown>;
  error?: string;
  transcript: TranscriptEntry[];
}

export async function runAgentLoop(cfg: AgentLoopConfig, deps: AgentLoopDeps): Promise<AgentLoopResult> {
  const maxTurns = cfg.maxTurns ?? 12;
  const budget = cfg.budget ?? defaultBudget();
  const keepLast = cfg.keepLast ?? 4;
  const maxFinishReasks = cfg.maxFinishReasks ?? 2;
  const maxConsecutiveInvalid = cfg.maxConsecutiveInvalid ?? 3;
  const at = (): string => deps.clock?.() ?? new Date().toISOString();
  const signal = { aborted: false };
  const rl = (): { append(line: Parameters<RolloutWriter['append']>[0]): void } => deps.rollout ?? { append: () => {} };

  const transcript: TranscriptEntry[] = [];
  const turns: AgentTurnRecord[] = [];
  /** Every transcript mutation flows through here so the rollout cannot drift from memory. */
  const pushEntry = (entry: TranscriptEntry): void => {
    transcript.push(entry);
    rl().append({ type: 'transcript_item', at: at(), entry });
  };
  const pushTurn = (record: AgentTurnRecord): void => {
    turns.push(record);
    rl().append({ type: 'turn_record', at: at(), record });
  };

  if (cfg.initialTranscript !== undefined) {
    transcript.push(...cfg.initialTranscript);
    rl().append({
      type: 'resumed', at: at(), priorTurns: cfg.resume?.priorTurns ?? 0,
      ...(cfg.resume?.openTurn !== undefined ? { disposition: cfg.resume.openTurn.disposition } : {}),
    });
    // Orphaned tool_use repair (Claude Code pattern): the interrupted turn's missing
    // tool_result is synthesized so the model sees an honest, valid transcript.
    const open = cfg.resume?.openTurn;
    if (open !== undefined) {
      pushEntry({
        kind: 'tool_result', turn: open.turn, tool: open.tool, ok: false,
        payload: {
          interrupted: true, disposition: open.disposition,
          note: open.disposition === 'tool_outcome_unknown'
            ? 'the session crashed during this tool call — its outcome is unknown; do not assume it succeeded'
            : 'the session was interrupted before this tool call started',
        },
      });
      pushTurn({ turn: open.turn, action: 'tool_error', tool: open.tool, ok: false, reason: `interrupted: ${open.disposition}` });
    }
  } else {
    pushEntry({ kind: 'task', text: cfg.task });
    for (const c of cfg.contextEntries ?? []) pushEntry({ kind: 'context', label: c.label, payload: c.payload });
    rl().append({
      type: 'session_meta', at: at(), sessionId: deps.sessionId, capability: cfg.capability, purpose: deps.purpose,
      task: cfg.task, maxTurns,
      ...(deps.parentSessionId !== undefined ? { parentSessionId: deps.parentSessionId } : {}),
    });
  }

  const finish = (status: AgentLoopStatus, extra: Partial<AgentLoopResult>): AgentLoopResult => {
    rl().append({ type: 'session_end', at: at(), status });
    deps.emit({ type: 'session_finished', sessionId: deps.sessionId, status, turns: turns.length, at: at() });
    return { status, turns, transcript, ...extra };
  };

  deps.emit({
    type: 'session_started', sessionId: deps.sessionId, capability: cfg.capability, task: cfg.task, maxTurns,
    ...(deps.parentSessionId !== undefined ? { parentSessionId: deps.parentSessionId } : {}), at: at(),
  });

  let consecutiveInvalid = 0;
  let finishReasks = 0;
  let totalTokens = 0;
  const totalDeadline = cfg.totalTimeoutMs !== undefined ? Date.now() + cfg.totalTimeoutMs : null;

  for (let turn = (cfg.resume?.priorTurns ?? 0) + 1; turn <= maxTurns; turn++) {
    if (cfg.shouldAbort?.() === true) return finish('aborted', { error: 'aborted by caller' });
    if (totalDeadline !== null && Date.now() >= totalDeadline) {
      return finish('total_timeout', { error: `session exceeded totalTimeoutMs (${cfg.totalTimeoutMs}ms) before turn ${turn}` });
    }
    for (const condition of cfg.stopWhen ?? []) {
      const ctx: LoopStopContext = {
        turn,
        turnsRemaining: maxTurns - turn + 1,
        tokensUsed: totalTokens,
        transcriptTokens: transcriptTokens(transcript),
      };
      if (condition.shouldStop(ctx)) {
        return finish('stop_condition', { error: `stop condition fired before turn ${turn}: ${condition.name}` });
      }
    }
    const stepDeadline = cfg.stepTimeoutMs !== undefined ? Date.now() + cfg.stepTimeoutMs : null;

    const steerText = cfg.steer?.() ?? null;
    if (steerText !== null) {
      pushEntry({ kind: 'steer', text: steerText });
      pushTurn({ turn, action: 'steer', reason: steerText.slice(0, 200) });
      deps.emit({ type: 'steered', sessionId: deps.sessionId, turn, at: at() });
    }

    deps.telemetry.recordTurn();
    deps.emit({ type: 'turn_started', sessionId: deps.sessionId, turn, at: at() });

    // --- compaction gate (H2): micro beyond soft, full handoff before hard, degrade as last resort ---
    const tokensBefore = transcriptTokens(transcript);
    if (tokensBefore > budget.transcriptSoft) {
      const micro = microcompact(transcript, deps.tools, keepLast);
      const afterMicro = transcriptTokens(micro);
      if (afterMicro > budget.transcriptHard) {
        const summary = await handoffSummary(deps, transcript, cfg.task);
        const compacted = compactedTranscript(micro, cfg.task, summary, keepLast);
        transcript.length = 0;
        transcript.push(...compacted);
        rl().append({ type: 'compacted', at: at(), summary });
        deps.telemetry.recordCompaction();
        // The handoff model call really happened (receipted) — its event is emitted
        // even when degradation follows; layers tell the full story.
        deps.emit({ type: 'compaction', sessionId: deps.sessionId, layer: 'full', tokensBefore, tokensAfter: transcriptTokens(transcript), bySourceAfter: transcriptTokensBySource(transcript), at: at() });
        let after = transcriptTokens(transcript);
        // Degradation chain (Codex skip-summary fallback): if even the handoff baseline
        // exceeds the hard limit, DROP oldest tool results entirely rather than overflow.
        if (after > budget.transcriptHard) {
          while (transcriptTokens(transcript) > budget.transcriptHard) {
            const idx = transcript.findIndex((e) => e.kind === 'tool_result');
            if (idx < 0) break;
            transcript.splice(idx, 1);
          }
          after = transcriptTokens(transcript);
          deps.telemetry.recordCompaction();
          deps.emit({ type: 'compaction', sessionId: deps.sessionId, layer: 'degrade', tokensBefore, tokensAfter: after, bySourceAfter: transcriptTokensBySource(transcript), at: at() });
        }
        pushTurn({ turn, action: 'compaction', reason: 'full handoff' });
      } else if (afterMicro < tokensBefore) {
        transcript.length = 0;
        transcript.push(...micro);
        deps.telemetry.recordCompaction();
        deps.emit({ type: 'compaction', sessionId: deps.sessionId, layer: 'micro', tokensBefore, tokensAfter: afterMicro, bySourceAfter: transcriptTokensBySource(transcript), at: at() });
      }
    }

    // --- model call (fail-closed; plane owns retries; budget gates NEW turns) ---
    if (deps.budget !== undefined && !deps.budget.hasRemaining()) {
      return finish('stop_condition', { error: `run token budget exhausted before turn ${turn} — raise FARLAB_RUN_TOKEN_BUDGET and resume` });
    }
    const res = await withModelSlot(() => deps.provider.structuredCall(
      {
        task: `${deps.purpose}:turn`,
        systemPrompt: `${cfg.systemPrompt}\n\n${PROTOCOL_PROMPT}`,
        userPayload: {
          task: cfg.task,
          transcript,
          tools: deps.tools.catalog(),
          turnBudget: { turn, maxTurns, turnsRemaining: maxTurns - turn },
          // Same lesson as callStructured's outputContract: field-name drift is the
          // dominant structured-output failure mode — the model must SEE the finish shape.
          ...(cfg.resultSchema !== undefined ? { resultContract: describeShape(cfg.resultSchema) } : {}),
        },
        outputKind: 'json',
        maxTokens: 4096,
        jsonSchema: strictSchemaOrUndefined(AgentActionSchema),
        ...(deps.reasoning !== undefined ? { reasoning: deps.reasoning } : {}),
        purpose: `${deps.purpose}:turn`,
      },
      (raw) => validateStructured<AgentAction>(raw, AgentActionSchema),
    ));
    recordModelReceipt(deps.recordReceipt, { stage: deps.purpose }, res);
    deps.budget?.spend(res.receipt.usage.totalTokens);
    totalTokens += res.receipt.usage.totalTokens ?? 0;
    deps.telemetry.recordModelCall(res.receipt.usage);
    deps.emit({
      type: 'model_call_done', sessionId: deps.sessionId, turn, latencyMs: res.receipt.latencyMs,
      ...(res.receipt.usage.totalTokens !== undefined ? { usage: res.receipt.usage } : {}), at: at(),
    });
    // Step timeout (cooperative): the model call itself is bounded by the provider plane;
    // an over-deadline turn ends HERE instead of paying for a tool call it cannot finish.
    if (stepDeadline !== null && Date.now() >= stepDeadline) {
      pushTurn({ turn, action: 'tool_error', tool: '-', ok: false, reason: `step timeout ${cfg.stepTimeoutMs}ms` });
      return finish('step_timeout', { error: `turn ${turn} exceeded stepTimeoutMs (${cfg.stepTimeoutMs}ms) after the model call — not starting the tool phase` });
    }

    if (!res.ok || res.data === undefined) {
      const err = res.error ?? { kind: 'provider_error' as const, message: 'unknown provider failure' };
      if (err.kind === 'invalid_output') {
        // Corrective feedback: the model answered outside the action contract.
        consecutiveInvalid += 1;
        pushEntry({ kind: 'error', turn, message: `your reply was not a valid action object: ${err.message}` });
        pushTurn({ turn, action: 'invalid_action', ok: false, reason: err.message.slice(0, 500) });
        if (consecutiveInvalid >= maxConsecutiveInvalid) {
          return finish('failed', { error: `${consecutiveInvalid} consecutive invalid model actions` });
        }
        continue;
      }
      return finish('failed', { error: `model call failed (${err.kind}): ${err.message}` });
    }
    const action = res.data;

    // --- finish ---
    if (action.action === 'finish') {
      pushEntry({ kind: 'action', turn, action: 'finish', reason: action.reason });
      if (cfg.resultSchema !== undefined) {
        const check = cfg.resultSchema.safeParse(action.result);
        if (!check.success) {
          finishReasks += 1;
          if (finishReasks > maxFinishReasks) {
            return finish('failed', { error: `finish payload rejected ${finishReasks} times: ${check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join('; ')}` });
          }
          pushEntry({
            kind: 'error', turn,
            message: `finish payload rejected by the result contract: ${check.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).slice(0, 5).join('; ')} — fix the payload and finish again`,
          });
          pushTurn({ turn, action: 'invalid_action', reason: 'finish-rejected' });
          continue;
        }
        await deps.hooks?.turnEnd({ turn, action: 'finish', finished: true });
        pushTurn({ turn, action: 'finish', ok: true, reason: action.reason.slice(0, 200) });
        return finish('completed', { result: check.data as Record<string, unknown> });
      }
      await deps.hooks?.turnEnd({ turn, action: 'finish', finished: true });
      pushTurn({ turn, action: 'finish', ok: true, reason: action.reason.slice(0, 200) });
      return finish('completed', { result: action.result });
    }

    // --- use_tool ---
    pushEntry({ kind: 'action', turn, action: 'use_tool', tool: action.tool, args: action.args, reason: action.reason });
    const tool = deps.tools.get(action.tool);
    if (tool === undefined) {
      consecutiveInvalid += 1;
      pushEntry({ kind: 'error', turn, message: `unknown tool '${action.tool}' — available: ${deps.tools.names().join(', ')}` });
      pushTurn({ turn, action: 'invalid_action', tool: action.tool, ok: false });
      if (consecutiveInvalid >= maxConsecutiveInvalid) return finish('failed', { error: `${consecutiveInvalid} consecutive invalid actions` });
      continue;
    }

    const decision = await deps.permissions.decide(action.tool, action.args, tool.riskClass);
    if (decision.asked) deps.telemetry.recordAsk();
    if (decision.asked || decision.cachedGrant) {
      deps.emit({ type: 'permission_asked', sessionId: deps.sessionId, turn, tool: action.tool, granted: decision.effect === 'allow', at: at() });
    }
    if (decision.effect !== 'allow') {
      pushEntry({ kind: 'tool_result', turn, tool: action.tool, ok: false, payload: { denied: true, reason: decision.rule ?? 'permission denied' } });
      pushTurn({ turn, action: 'permission_denied', tool: action.tool, ok: false, reason: decision.rule });
      await deps.hooks?.turnEnd({ turn, action: 'use_tool', finished: false });
      continue;
    }

    const hookOut = await deps.hooks?.beforeToolCall({ tool: action.tool, args: action.args, turn });
    if (hookOut?.terminate !== undefined) return finish('aborted', { error: `terminated by hook: ${hookOut.terminate}` });
    if (hookOut?.blocked !== undefined) {
      pushEntry({ kind: 'tool_result', turn, tool: action.tool, ok: false, payload: { blocked: true, reason: hookOut.blocked } });
      pushTurn({ turn, action: 'permission_denied', tool: action.tool, ok: false, reason: `hook: ${hookOut.blocked}` });
      await deps.hooks?.turnEnd({ turn, action: 'use_tool', finished: false });
      continue;
    }
    const hookArgs = hookOut?.args !== undefined ? hookOut.args : action.args;

    const validated = validateToolArgs(tool, hookArgs);
    if (!validated.ok) {
      consecutiveInvalid += 1;
      pushEntry({ kind: 'tool_result', turn, tool: action.tool, ok: false, payload: { validationError: validated.message } });
      pushTurn({ turn, action: 'invalid_action', tool: action.tool, ok: false, reason: 'args validation failed' });
      if (consecutiveInvalid >= maxConsecutiveInvalid) return finish('failed', { error: `${consecutiveInvalid} consecutive invalid actions` });
      continue;
    }
    consecutiveInvalid = 0;

    if (cfg.shouldAbort?.() === true) return finish('aborted', { error: 'aborted by caller' });
    signal.aborted = cfg.shouldAbort?.() === true;
    // Step timeout before tool spend: a turn already over budget must not pay for tools.
    if (stepDeadline !== null && Date.now() >= stepDeadline) {
      pushEntry({ kind: 'tool_result', turn, tool: action.tool, ok: false, payload: { skipped: true, reason: 'step timeout' } });
      pushTurn({ turn, action: 'tool_error', tool: action.tool, ok: false, reason: `step timeout ${cfg.stepTimeoutMs}ms` });
      return finish('step_timeout', { error: `turn ${turn} exceeded stepTimeoutMs (${cfg.stepTimeoutMs}ms) before tool execution` });
    }

    const startedMs = Date.now();
    let result: ToolResult;
    const toolCtx: ToolContext = {
      signal,
      emit: (note, detail) => deps.emit({ type: 'tool_note', sessionId: deps.sessionId, turn, tool: action.tool, note, ...(detail !== undefined ? { detail } : {}), at: at() }),
      recordReceipt: deps.recordReceipt,
      depth: deps.depth ?? 0,
    };
    // Rollout write order is the crash-classification contract (rollout.ts):
    // started marker BEFORE execution; tool_result BEFORE the finished marker.
    rl().append({ type: 'tool_lifecycle', at: at(), turn, tool: action.tool, phase: 'started' });
    try {
      result = await tool.execute(validated.value, toolCtx);
    } catch (e) {
      result = { ok: false, error: { kind: 'execution', message: e instanceof Error ? e.message : String(e) } };
    }
    const durationMs = Date.now() - startedMs;

    // Result-size discipline: spill oversized payloads to the artifact store, else head-trim.
    let payload: unknown = result.ok ? (result.data ?? null) : { error: result.error };
    let truncated: boolean | undefined;
    let spilledTo: string | undefined;
    const serialized = safeJson(payload);
    if (serialized !== null && serialized.length > budget.maxToolResultChars) {
      if (deps.artifacts !== undefined) {
        const put = await deps.artifacts.put(serialized);
        spilledTo = put.ref;
        payload = { spilledTo: put.ref, sizeChars: serialized.length };
      } else {
        payload = { truncated: true, head: serialized.slice(0, budget.maxToolResultChars), originalChars: serialized.length };
        truncated = true;
      }
    }

    pushEntry({ kind: 'tool_result', turn, tool: action.tool, ok: result.ok, payload, ...(truncated === true ? { truncated } : {}), ...(spilledTo !== undefined ? { spilledTo } : {}) });
    rl().append({ type: 'tool_lifecycle', at: at(), turn, tool: action.tool, phase: 'finished' });
    deps.telemetry.recordToolCall(result.ok);
    pushTurn({ turn, action: 'use_tool', tool: action.tool, ok: result.ok, reason: result.summary, latencyMs: durationMs });
    deps.emit({
      type: 'tool_used', sessionId: deps.sessionId, turn, tool: action.tool, ok: result.ok, durationMs,
      ...(truncated === true ? { truncated } : {}), ...(spilledTo !== undefined ? { spilledTo } : {}),
      ...(result.summary !== undefined ? { summary: result.summary } : {}), at: at(),
    });
    await deps.hooks?.afterToolCall({ tool: action.tool, args: validated.value, turn }, result);
    await deps.hooks?.turnEnd({ turn, action: 'use_tool', finished: false });
  }

  return finish('max_turns', { error: `reached max turns (${maxTurns}) without a valid finish` });
}

const safeJson = (v: unknown): string | null => {
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
};

/** Full handoff compaction: one structured LLM call (receipted); failure is fail-closed. */
const handoffSummary = async (deps: AgentLoopDeps, transcript: readonly TranscriptEntry[], task: string): Promise<string> => {
  const schema = z.object({ summary: z.string().min(1).max(8000) });
  // No budget GATE here (deliberate): compaction is what lets the session CONTINUE
  // under its context budget — gating it would deadlock an over-soft-limit session.
  // The call is still receipted and SPENDS from the run budget (honest accounting).
  const res = await withModelSlot(() => deps.provider.structuredCall(
    {
      task: `${deps.purpose}:compact`,
      systemPrompt: HANDOFF_PROMPT,
      userPayload: { task, transcript },
      outputKind: 'json',
      maxTokens: 2048,
      purpose: `${deps.purpose}:compact`,
    },
    (raw) => validateStructured<{ summary: string }>(raw, schema),
  ));
  recordModelReceipt(deps.recordReceipt, { stage: deps.purpose }, res);
  deps.budget?.spend(res.receipt.usage.totalTokens);
  deps.telemetry.recordModelCall(res.receipt.usage);
  if (!res.ok || res.data === undefined) {
    const err = res.error ?? { kind: 'provider_error' as const, message: 'unknown provider failure' };
    throw new Error(`handoff compaction model call failed (${err.kind}): ${err.message}`);
  }
  return res.data.summary;
};
