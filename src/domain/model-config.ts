import { z } from 'zod';
import { ModelConfigId } from './ids.js';

/**
 * User-defined model route (custom provider configuration): any OpenAI-compatible
 * or Anthropic-compatible endpoint the researcher wants the pipeline to call.
 * This is the PRODUCT configuration layer (created/edited in the UI at runtime);
 * the env chain (FARLAB_MODEL_PROVIDER & per-provider env) stays untouched as the
 * automation/competition layer beneath it.
 */

/** Transport wire the custom endpoint speaks — exactly the two the transport core implements. */
export const ProviderWireProtocol = z.enum(['openai', 'anthropic']);
export type ProviderWireProtocol = z.infer<typeof ProviderWireProtocol>;

/**
 * Per-config REASONING CAPABILITY declaration (product configuration layer):
 * the researcher declares which thinking-parameter dialect the endpoint's model
 * speaks and the default effort gear for conversations. The product is
 * model-agnostic (any OpenAI/Anthropic-compatible route worldwide, incl. local
 * runtimes) — capability is DECLARED here, never inferred from a built-in model
 * catalog. A config without a declaration sends ZERO reasoning fields on the
 * wire (exact legacy behavior).
 */
export const ReasoningStyle = z.enum(['reasoning_effort', 'enable_thinking', 'thinking_budget']);
export type ReasoningStyle = z.infer<typeof ReasoningStyle>;
export const ReasoningGear = z.enum(['low', 'medium', 'high']);
export type ReasoningGear = z.infer<typeof ReasoningGear>;

/** Single owner of the gear→budget-token map (Qwen thinking_budget / Anthropic budget_tokens). */
export const REASONING_GEAR_BUDGET_TOKENS: Readonly<Record<ReasoningGear, number>> = {
  low: 8192,
  medium: 16384,
  high: 32768,
};
export const reasoningBudgetTokens = (gear: ReasoningGear): number => REASONING_GEAR_BUDGET_TOKENS[gear];

/**
 * Dialect↔wire compatibility is validated at the config boundary so an impossible
 * combination never reaches the transport: reasoning_effort / enable_thinking are
 * OpenAI-chat-completions body extensions; thinking_budget is the Anthropic-Messages
 * `thinking` parameter. The refinement lives INSIDE a schema that already sees `wire`
 * (the full config), applied after object construction.
 */
const assertReasoningWireCompat = (
  cfg: { wire: ProviderWireProtocol; reasoning?: { style: ReasoningStyle } },
  ctx: z.RefinementCtx,
): void => {
  if (cfg.reasoning === undefined) return;
  const openaiOnly = cfg.reasoning.style === 'reasoning_effort' || cfg.reasoning.style === 'enable_thinking';
  if (openaiOnly && cfg.wire !== 'openai') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reasoning'], message: `reasoning style "${cfg.reasoning.style}" requires wire "openai"` });
  }
  if (cfg.reasoning.style === 'thinking_budget' && cfg.wire !== 'anthropic') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reasoning'], message: 'reasoning style "thinking_budget" requires wire "anthropic"' });
  }
};

export const ModelProviderConfigBase = z.object({
  id: ModelConfigId,
  /** Human-facing name (shown in run forms and receipts context). */
  label: z.string().trim().min(1).max(80),
  wire: ProviderWireProtocol,
  baseUrl: z.string().url(),
  modelId: z.string().trim().min(1).max(200),
  /**
   * Plaintext only inside local SQLite (.far-run/, gitignored, server bound to
   * 127.0.0.1 — same threat model as .far-run/secrets.env). NEVER serialized back
   * out: API/UI projections carry maskApiKey() output only.
   */
  apiKey: ***,
  /**
   * BP-4 failover chain (LiteLLM-verified semantics, adapted to one-call granularity):
   * ordered ids tried AFTER this config exhausts its own provider-plane retries with
   * a failover-worthy failure (rate_limited/timeout/quota/auth/5xx). 400-class and
   * invalid-output failures do NOT fail over — a malformed request stays malformed.
   * Cycles are cut at resolution time; empty (default) = no failover, zero behavior
   * change for existing configs.
   */
  fallbackConfigIds: z.array(ModelConfigId).max(4).default([]),
  /**
   * BP-4 cost ledger: user-declared list pricing (USD per 1M tokens). FAR-Lab ships
   * NO invented price tables — costs are computed only when the researcher enters
   * their real per-config prices; otherwise usage shows tokens + "pricing unknown".
   */
  pricing: z.object({
    inputUsdPerMTok: z.number().min(0).max(10_000),
    outputUsdPerMTok: z.number().min(0).max(10_000),
  }).optional(),
  /**
   * Declared thinking capability + default effort gear (see ReasoningStyle).
   * Absent = the endpoint gets no thinking fields at all.
   */
  reasoning: z
    .object({ style: ReasoningStyle, defaultGear: ReasoningGear })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const ModelProviderConfig = ModelProviderConfigBase.superRefine(assertReasoningWireCompat);
export type ModelProviderConfig = z.infer<typeof ModelProviderConfig>;

/** Display hint for a stored key: last 4 chars only; empty key stays empty. */
export const maskApiKey = (key: string): string =>
  key.length === 0 ? '' : `••••${key.slice(-4)}`;
