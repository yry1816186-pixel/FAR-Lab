import { z } from 'zod';
import { ReasoningGear } from './model-config.js';

/**
 * Conversation (conversation-first flow, PROPOSAL-conversation-first): the
 * durable dialogue where the researcher and the RESIDENT agent discuss the
 * whole workspace — brainstorming before a run, inspecting runs/hypotheses/
 * evidence/plans after, proposing actions that the researcher approves in
 * chat. The transcript lives inside the conversation doc (single-object
 * atomic turns); per-turn usage summaries ride on each agent message. Full
 * provenance receipts remain run-scoped and start when a run is launched.
 */

export const ConversationSeedSchema = z.object({
  title: z.string().min(1).max(500),
  identifiers: z.array(z.object({
    kind: z.enum(['doi', 'arxiv', 'url', 'other']),
    value: z.string().min(1).max(500),
  })).max(20),
  text: z.string().max(50_000).optional(),
  year: z.number().int().optional(),
  authors: z.array(z.string().max(300)).max(50),
});
export type ConversationSeed = z.infer<typeof ConversationSeedSchema>;

export const CandidateQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(2000),
  rationale: z.string().max(2000),
});
export type CandidateQuestion = z.infer<typeof CandidateQuestionSchema>;

/** Kinds of work the resident agent can propose; execution is researcher-gated. */
export const ConversationActionKind = z.enum(['launch_research', 'cancel_run', 'create_automation', 'cancel_automation', 'create_tool_integration', 'run_command']);
export type ConversationActionKind = z.infer<typeof ConversationActionKind>;

const ISO = z.string().min(1);

/** One proposed action and its honest lifecycle (never executes without approval). */
export const ConversationProposalSchema = z.object({
  id: z.string().regex(/^act_[a-z0-9]+$/, 'act_ id'),
  kind: ConversationActionKind,
  /** Human-readable one-liner shown on the approval card. */
  title: z.string().min(1).max(300),
  args: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'executed', 'rejected', 'failed']),
  /** Outcome summary (or honest error text when status='failed'). */
  result: z.string().max(2000).optional(),
  /** True when executed under a remembered "don't ask again for this kind" grant. */
  autoApproved: z.boolean().optional(),
  /**
   * RU-3 T6 anti-gaming: SERVER-COMPUTED structured disclosure. `title` is
   * model-authored free text and can never be the sole justification shown to
   * the researcher — riskLevel comes from the action-kind mapping and
   * argSummary is deterministically rendered from the validated args; neither
   * is accepted from model input.
   */
  riskLevel: z.enum(['low', 'moderate', 'high']).optional(),
  argSummary: z.record(z.string(), z.string()).optional(),
  createdAt: ISO,
  resolvedAt: ISO.optional(),
});
export type ConversationProposal = z.infer<typeof ConversationProposalSchema>;

/** Compact per-tool record of one agent turn (UI action bar; never the payloads). */
export const ToolTraceSchema = z.object({
  tool: z.string().min(1).max(64),
  ok: z.boolean(),
  summary: z.string().max(300).optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type ToolTrace = z.infer<typeof ToolTraceSchema>;

export const MessageUsageSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  latencyMs: z.number(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  /** Kernel-loop facts: model calls and tool calls behind this reply. */
  modelCalls: z.number().int().nonnegative().optional(),
  toolCalls: z.number().int().nonnegative().optional(),
});

export const ConversationMessageSchema = z.object({
  id: z.string().regex(/^cmsg_[a-z0-9]+$/, 'cmsg_ id'),
  /**
   * researcher = human input; agent = real model reply; automation =
   * deterministic system record (trigger notices, action outcomes) — never a
   * model call, styled distinctly in the UI.
   */
  role: z.enum(['researcher', 'agent', 'automation']),
  content: z.string().min(1),
  /** Researcher attachments carried by this message (inherited by launched runs). */
  seeds: z.array(ConversationSeedSchema).max(50).optional(),
  /** Agent-proposed candidate research questions (this turn). */
  candidates: z.array(CandidateQuestionSchema).max(5).optional(),
  /** Tools the agent actually used this turn (visible action bar). */
  toolTrace: z.array(ToolTraceSchema).max(40).optional(),
  /** Actions proposed this turn; resolved by researcher approval/rejection. */
  proposals: z.array(ConversationProposalSchema).max(10).optional(),
  /** Honest per-turn model usage summary (receipts stay run-scoped). */
  usage: MessageUsageSchema.optional(),
  /**
   * researcher-message-only: why this message's agent reply failed (provider/
   * model error). The researcher's words are history — they persist even when
   * the turn fails; landing a reply (post-retry or re-run) clears this. Absent
   * = replied, or reply never attempted.
   */
  replyError: z.string().max(2000).optional(),
  createdAt: ISO,
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ConversationSchema = z.object({
  id: z.string().regex(/^conv_[a-z0-9]+$/, 'conv_ id'),
  title: z.string().min(1).max(120),
  status: z.enum(['open', 'converged']),
  providerConfigId: z.string().regex(/^mcfg_[a-z0-9]+$/).optional(),
  /**
   * Researcher's reasoning-effort override for this conversation (low|medium|high).
   * Effective ONLY when the resolved model route declared a reasoning capability;
   * absent = the route's declared defaultGear applies. Persisted so every turn and
   * every automation fire on this conversation uses the same effort.
   */
  reasoningGear: ReasoningGear.optional(),
  messages: z.array(ConversationMessageSchema).max(2000),
  /** Runs launched from this conversation, oldest first. */
  runIds: z.array(z.string().regex(/^run_[a-z0-9]+$/)).max(200),
  turns: z.number().int().min(0),
  /** Action kinds the researcher marked "don't ask again" in THIS conversation. */
  autoApprove: z.array(ConversationActionKind).max(10).default([]),
  createdAt: ISO,
  updatedAt: ISO,
});
export type Conversation = z.infer<typeof ConversationSchema>;
