import { z } from 'zod';
import type { ProvenanceReceipt } from '../domain/provenance.js';
import { TokenUsage } from '../domain/agent.js';

/**
 * Agent-kernel protocol (H1). The loop speaks ONE model-agnostic action contract
 * (JSON-ReAct: use_tool | finish) instead of provider-native function calling, so every
 * ModelProvider (zai, dashscope, any OpenAI-compatible gateway) drives the same loop with
 * zero transport-specific branches. Events are typed and emitted through a sink that
 * persists BEFORE anything projects them (Codex SQ/EQ + OpenCode event-first).
 */

/** Receipt sink — same partial shape as StageContext.recordReceipt but with free-form stage. */
export type ReceiptSink = (partial: Omit<ProvenanceReceipt, 'id' | 'runId' | 'at'> & { at?: string }) => void;

export const AgentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('use_tool'),
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()).default({}),
    reason: z.string().max(1000).default(''),
  }),
  z.object({
    action: z.literal('finish'),
    reason: z.string().max(1000).default(''),
    result: z.record(z.string(), z.unknown()),
  }),
]);
export type AgentAction = z.infer<typeof AgentActionSchema>;

/** Transcript — the deterministic, serializable loop memory (Codex-rollout shape). */
export const TranscriptEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), text: z.string() }),
  z.object({ kind: z.literal('context'), label: z.string(), payload: z.unknown() }),
  z.object({ kind: z.literal('steer'), text: z.string() }),
  z.object({ kind: z.literal('handoff'), summary: z.string() }),
  z.object({
    kind: z.literal('action'),
    turn: z.number().int().positive(),
    action: z.enum(['use_tool', 'finish']),
    tool: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('tool_result'),
    turn: z.number().int().positive(),
    tool: z.string(),
    ok: z.boolean(),
    payload: z.unknown(),
    truncated: z.boolean().optional(),
    spilledTo: z.string().optional(),
    /** RU-3 T1: set when the producing tool is trust 'external' — content is data, never instructions. */
    untrusted: z.boolean().optional(),
    /** Canonical hash of the executed tool identity + validated args. */
    actionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    /** Present when execution was suppressed and a prior successful result replayed. */
    deduplicatedFromTurn: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal('error'),
    turn: z.number().int().positive().optional(),
    message: z.string(),
  }),
]);
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session_started'), sessionId: z.string(), capability: z.string(), task: z.string(), maxTurns: z.number().int().positive(), parentSessionId: z.string().optional(), at: z.string() }),
  z.object({ type: z.literal('turn_started'), sessionId: z.string(), turn: z.number().int().positive(), at: z.string() }),
  z.object({ type: z.literal('model_call_done'), sessionId: z.string(), turn: z.number().int().positive(), latencyMs: z.number().int().nonnegative(), usage: TokenUsage.optional(), at: z.string(), thinking: z.string().max(8000).optional() }),
  z.object({ type: z.literal('tool_used'), sessionId: z.string(), turn: z.number().int().positive(), tool: z.string(), ok: z.boolean(), durationMs: z.number().int().nonnegative(), truncated: z.boolean().optional(), spilledTo: z.string().optional(), summary: z.string().optional(), actionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), deduplicatedFromTurn: z.number().int().positive().optional(), at: z.string() }),
  z.object({ type: z.literal('permission_asked'), sessionId: z.string(), turn: z.number().int().positive(), tool: z.string(), granted: z.boolean(), at: z.string() }),
  z.object({ type: z.literal('compaction'), sessionId: z.string(), layer: z.enum(['micro', 'full', 'degrade']), tokensBefore: z.number().int().nonnegative(), tokensAfter: z.number().int().nonnegative(), bySourceAfter: z.record(z.string(), z.number().int()).optional(), at: z.string() }),
  z.object({ type: z.literal('steered'), sessionId: z.string(), turn: z.number().int().positive(), at: z.string() }),
  z.object({ type: z.literal('tool_note'), sessionId: z.string(), turn: z.number().int().positive(), tool: z.string(), note: z.string(), detail: z.record(z.string(), z.unknown()).optional(), at: z.string() }),
  z.object({ type: z.literal('session_finished'), sessionId: z.string(), status: z.enum(['completed', 'max_turns', 'aborted', 'failed', 'step_timeout', 'total_timeout', 'stop_condition']), turns: z.number().int().nonnegative(), at: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventSink = (ev: AgentEvent) => void;
