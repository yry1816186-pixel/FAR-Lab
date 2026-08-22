import { z } from 'zod';
import { idOf, RunId } from './ids.js';

/**
 * Agent-harness domain objects (H1-H5, HARNESS_SURVEY_2026-08): an agent session is the
 * audit unit for LLM-loop work that does not fit the linear stage pipeline (iterative
 * refinement, parallel sub-agent research); the report is its validated outcome.
 * Receipts remain the per-call truth (provenance.ts) — sessions reference, never duplicate.
 */

export const AgentSessionId = idOf('ags');
export type AgentSessionId = z.infer<typeof AgentSessionId>;
export const AgentReportId = idOf('agr');
export type AgentReportId = z.infer<typeof AgentReportId>;

export const AgentSessionStatus = z.enum(['running', 'completed', 'failed', 'cancelled']);
export type AgentSessionStatus = z.infer<typeof AgentSessionStatus>;

/** What the loop actually did each turn — the compact, replayable view (full tool payloads stay in receipts/artifacts). */
export const AgentActionKind = z.enum([
  'use_tool', 'finish', 'invalid_action', 'permission_denied', 'tool_error', 'steer', 'compaction',
]);
export type AgentActionKind = z.infer<typeof AgentActionKind>;

export const TokenUsage = z.object({
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

export const AgentTurnRecord = z.object({
  turn: z.number().int().positive(),
  action: AgentActionKind,
  tool: z.string().optional(),
  ok: z.boolean().optional(),
  reason: z.string().max(2000).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  usage: TokenUsage.optional(),
});
export type AgentTurnRecord = z.infer<typeof AgentTurnRecord>;

export const AgentSession = z.object({
  id: AgentSessionId,
  runId: RunId,
  capability: z.string().min(1),
  /** Sub-agent lineage: a child session points at the session that spawned it. */
  parentSessionId: AgentSessionId.optional(),
  /** Provenance purpose prefix; receipts from this session carry `${purpose}:turn` etc. */
  purpose: z.string().min(1),
  status: AgentSessionStatus,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  task: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  turns: z.array(AgentTurnRecord).default([]),
  lastError: z.string().optional(),
});
export type AgentSession = z.infer<typeof AgentSession>;

export const AgentTelemetrySummary = z.object({
  turns: z.number().int().nonnegative(),
  modelCalls: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  failedToolCalls: z.number().int().nonnegative(),
  permissionAsks: z.number().int().nonnegative(),
  compactions: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  wallMs: z.number().int().nonnegative(),
});
export type AgentTelemetrySummary = z.infer<typeof AgentTelemetrySummary>;

export const AgentReport = z.object({
  id: AgentReportId,
  runId: RunId,
  sessionId: AgentSessionId,
  capability: z.string().min(1),
  createdAt: z.string().datetime(),
  /** Capability-validated outcome payload; shape is owned by the capability, not the kernel. */
  result: z.record(z.string(), z.unknown()),
  telemetry: AgentTelemetrySummary,
});
export type AgentReport = z.infer<typeof AgentReport>;
