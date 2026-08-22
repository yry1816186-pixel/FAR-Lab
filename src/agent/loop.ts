import { z } from 'zod';
import { strictSchemaOrUndefined } from '../providers/http.js';
import { validateStructured, recordModelReceipt, describeShape } from '../pipeline/llm.js';
import type { ModelProvider, ArtifactStore } from '../shared/ports.js';
import type { AgentTurnRecord } from '../domain/agent.js';
import { AgentActionSchema, type AgentAction, type AgentEventSink, type ReceiptSink, type TranscriptEntry } from './protocol.js';
import { ToolRegistry, validateToolArgs, type ToolContext, type ToolResult } from './tool.js';
import type { ExtensionBus } from './hooks.js';
import type { PermissionEngine } from './permissions.js';
import type { SessionTelemetry } from './telemetry.js';
import { defaultBudget, type TokenBudget } from './budget.js';
import { microcompact, compactedTranscript, transcriptTokens, HANDOFF_PROMPT } from './compaction.js';

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
}

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
  hooks?: ExtensionBus;
  /** Enables spill-to-artifact for oversized tool results (content-addressed ref). */
  artifacts?: ArtifactStore;
  parentSessionId?: string;
  /** Sub-agent depth (0 = main session). */
  depth?: number;
  clock?: () => string;
}

export type AgentLoopStatus = 'completed' | 'max_turns' | 'aborted' | 'failed';

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

  const transcript: TranscriptEntry[] = [
    { kind: 'task', text: cfg.task },
    ...(cfg.contextEntries ?? []).map((c): TranscriptEntry => ({ kind: 'context', label: c.label, payload: c.payload })),
  ];
  const turns: AgentTurnRecord[] = [];
  const finish = (status: AgentLoopStatus, extra: Partial<AgentLoopResult>): AgentLoopResult => {
    deps.emit({ type: 'session_finished', sessionId: deps.sessionId, status, turns: turns.length, at: at() });
    return { status, turns, transcript, ...extra };
  };

  deps.emit({
    type: 'session_started', sessionId: deps.sessionId, capability: cfg.capability, task: cfg.task, maxTurns,
    ...(deps.parentSessionId !== undefined ? { parentSessionId: deps.parentSessionId } : {}), at: at(),
  });

  let consecutiveInvalid = 0;
  let finishReasks = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (cfg.shouldAbort?.() === true) return finish('aborted', { error: 'aborted by caller' });

    const steerText = cfg.steer?.() ?? null;
    if (steerText !== null) {
      transcript.push({ kind: 'steer', text: steerText });
      turns.push({ turn, action: 'steer', reason: steerText.slice(0, 200) });
      deps.emit({ type: 'steered', sessionId: deps.sessionId, turn, at: at() });
    }

    deps.telemetry.recordTurn();
    deps.emit({ type: 'turn_started', sessionId: deps.sessionId, turn, at: at() });

    // --- compaction gate (H2): micro beyond soft, full handoff before hard ---
    const tokensBefore = transcriptTokens(transcript);
    if (tokensBefore > budget.transcriptSoft) {
      const micro = microcompact(transcript, deps.tools, keepLast);
      const afterMicro = transcriptTokens(micro);
      if (afterMicro > budget.transcriptHard) {
        const summary = await handoffSummary(deps, transcript, cfg.task);
        const compacted = compactedTranscript(micro, cfg.task, summary, keepLast);
        transcript.length = 0;
        transcript.push(...compacted);
        deps.telemetry.recordCompaction();
        deps.emit({ type: 'compaction', sessionId: deps.sessionId, layer: 'full', tokensBefore, tokensAfter: transcriptTokens(transcript), at: at() });
        turns.push({ turn, action: 'compaction', reason: 'full handoff' });
      } else if (afterMicro < tokensBefore) {
        transcript.length = 0;
        transcript.push(...micro);
        deps.telemetry.recordCompaction();
        deps.emit({ type: 'compaction', sessionId: deps.sessionId, layer: 'micro', tokensBefore, tokensAfter: afterMicro, at: at() });
      }
    }

    // --- model call (fail-closed; plane owns retries) ---
    const res = await deps.provider.structuredCall(
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
        purpose: `${deps.purpose}:turn`,
      },
      (raw) => validateStructured<AgentAction>(raw, AgentActionSchema),
    );
    recordModelReceipt(deps.recordReceipt, { stage: deps.purpose }, res);
    deps.telemetry.recordModelCall(res.receipt.usage);
    deps.emit({
      type: 'model_call_done', sessionId: deps.sessionId, turn, latencyMs: res.receipt.latencyMs,
      ...(res.receipt.usage.totalTokens !== undefined ? { usage: res.receipt.usage } : {}), at: at(),
    });

    if (!res.ok || res.data === undefined) {
      const err = res.error ?? { kind: 'provider_error' as const, message: 'unknown provider failure' };
      if (err.kind === 'invalid_output') {
        // Corrective feedback: the model answered outside the action contract.
        consecutiveInvalid += 1;
        transcript.push({ kind: 'error', turn, message: `your reply was not a valid action object: ${err.message}` });
        turns.push({ turn, action: 'invalid_action', ok: false, reason: err.message.slice(0, 500) });
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
      transcript.push({ kind: 'action', turn, action: 'finish', reason: action.reason });
      if (cfg.resultSchema !== undefined) {
        const check = cfg.resultSchema.safeParse(action.result);
        if (!check.success) {
          finishReasks += 1;
          if (finishReasks > maxFinishReasks) {
            return finish('failed', { error: `finish payload rejected ${finishReasks} times: ${check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join('; ')}` });
          }
          transcript.push({
            kind: 'error', turn,
            message: `finish payload rejected by the result contract: ${check.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).slice(0, 5).join('; ')} — fix the payload and finish again`,
          });
          turns.push({ turn, action: 'invalid_action', reason: 'finish-rejected' });
          continue;
        }
        await deps.hooks?.turnEnd({ turn, action: 'finish', finished: true });
        return finish('completed', { result: check.data as Record<string, unknown> });
      }
      await deps.hooks?.turnEnd({ turn, action: 'finish', finished: true });
      return finish('completed', { result: action.result });
    }

    // --- use_tool ---
    transcript.push({ kind: 'action', turn, action: 'use_tool', tool: action.tool, args: action.args, reason: action.reason });
    const tool = deps.tools.get(action.tool);
    if (tool === undefined) {
      consecutiveInvalid += 1;
      transcript.push({ kind: 'error', turn, message: `unknown tool '${action.tool}' — available: ${deps.tools.names().join(', ')}` });
      turns.push({ turn, action: 'invalid_action', tool: action.tool, ok: false });
      if (consecutiveInvalid >= maxConsecutiveInvalid) return finish('failed', { error: `${consecutiveInvalid} consecutive invalid actions` });
      continue;
    }

    const decision = await deps.permissions.decide(action.tool, action.args);
    if (decision.asked) deps.telemetry.recordAsk();
    if (decision.asked || decision.cachedGrant) {
      deps.emit({ type: 'permission_asked', sessionId: deps.sessionId, turn, tool: action.tool, granted: decision.effect === 'allow', at: at() });
    }
    if (decision.effect !== 'allow') {
      transcript.push({ kind: 'tool_result', turn, tool: action.tool, ok: false, payload: { denied: true, reason: decision.rule ?? 'permission denied' } });
      turns.push({ turn, action: 'permission_denied', tool: action.tool, ok: false, reason: decision.rule });
      await deps.hooks?.turnEnd({ turn, action: 'use_tool', finished: false });
      continue;
    }

    const hookOut = await deps.hooks?.beforeToolCall({ tool: action.tool, args: action.args, turn });
    if (hookOut?.terminate !== undefined) return finish('aborted', { error: `terminated by hook: ${hookOut.terminate}` });
    if (hookOut?.blocked !== undefined) {
      transcript.push({ kind: 'tool_result', turn, tool: action.tool, ok: false, payload: { blocked: true, reason: hookOut.blocked } });
      turns.push({ turn, action: 'permission_denied', tool: action.tool, ok: false, reason: `hook: ${hookOut.blocked}` });
      await deps.hooks?.turnEnd({ turn, action: 'use_tool', finished: false });
      continue;
    }
    const hookArgs = hookOut?.args !== undefined ? hookOut.args : action.args;

    const validated = validateToolArgs(tool, hookArgs);
    if (!validated.ok) {
      consecutiveInvalid += 1;
      transcript.push({ kind: 'tool_result', turn, tool: action.tool, ok: false, payload: { validationError: validated.message } });
      turns.push({ turn, action: 'invalid_action', tool: action.tool, ok: false, reason: 'args validation failed' });
      if (consecutiveInvalid >= maxConsecutiveInvalid) return finish('failed', { error: `${consecutiveInvalid} consecutive invalid actions` });
      continue;
    }
    consecutiveInvalid = 0;

    if (cfg.shouldAbort?.() === true) return finish('aborted', { error: 'aborted by caller' });
    signal.aborted = cfg.shouldAbort?.() === true;

    const startedMs = Date.now();
    let result: ToolResult;
    const toolCtx: ToolContext = {
      signal,
      emit: (note, detail) => deps.emit({ type: 'tool_note', sessionId: deps.sessionId, turn, tool: action.tool, note, ...(detail !== undefined ? { detail } : {}), at: at() }),
      recordReceipt: deps.recordReceipt,
      depth: deps.depth ?? 0,
    };
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

    transcript.push({ kind: 'tool_result', turn, tool: action.tool, ok: result.ok, payload, ...(truncated === true ? { truncated } : {}), ...(spilledTo !== undefined ? { spilledTo } : {}) });
    deps.telemetry.recordToolCall(result.ok);
    turns.push({ turn, action: 'use_tool', tool: action.tool, ok: result.ok, reason: result.summary, latencyMs: durationMs });
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
  const res = await deps.provider.structuredCall(
    {
      task: `${deps.purpose}:compact`,
      systemPrompt: HANDOFF_PROMPT,
      userPayload: { task, transcript },
      outputKind: 'json',
      maxTokens: 2048,
      purpose: `${deps.purpose}:compact`,
    },
    (raw) => validateStructured<{ summary: string }>(raw, schema),
  );
  recordModelReceipt(deps.recordReceipt, { stage: deps.purpose }, res);
  deps.telemetry.recordModelCall(res.receipt.usage);
  if (!res.ok || res.data === undefined) {
    const err = res.error ?? { kind: 'provider_error' as const, message: 'unknown provider failure' };
    throw new Error(`handoff compaction model call failed (${err.kind}): ${err.message}`);
  }
  return res.data.summary;
};
