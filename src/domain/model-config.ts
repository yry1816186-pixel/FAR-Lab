import { z } from 'zod';
import { ModelConfigId } from './ids.js';

/**
 * User-defined model route (custom provider configuration): any OpenAI-compatible,
 * Anthropic-compatible or Google-Gemini-native endpoint the researcher wants the
 * pipeline to call. This is the PRODUCT configuration layer (created/edited in the
 * UI at runtime); the env chain (FARLAB_MODEL_PROVIDER & per-provider env) stays
 * untouched as the automation/competition layer beneath it.
 */

/**
 * Transport wire the custom endpoint speaks — exactly the three the transport core
 * implements. 'gemini' is the Google generativelanguage generateContent REST shape
 * (the native path for Gemini models worldwide; OpenAI-compat also exists but the
 * native wire carries thinkingConfig/usageMetadata faithfully).
 */
export const ProviderWireProtocol = z.enum(['openai', 'anthropic', 'gemini']);
export type ProviderWireProtocol = z.infer<typeof ProviderWireProtocol>;

/**
 * Per-config REASONING CAPABILITY declaration (product configuration layer):
 * the researcher declares which thinking-parameter dialect the endpoint's model
 * speaks and the default effort gear for conversations. The product is
 * model-agnostic (any OpenAI/Anthropic/Gemini-native route worldwide, incl. local
 * runtimes) — capability is DECLARED here, never inferred from a built-in model
 * catalog. A config without a declaration sends ZERO reasoning fields on the
 * wire (exact legacy behavior).
 */
export const ReasoningStyle = z.enum(['reasoning_effort', 'enable_thinking', 'thinking_budget', 'thinking_config']);
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
 * RU-9 GO2 — stage→reasoning gear defaults (effort plane). Semantic classes:
 * extraction/rerank/adjudication get HIGH (quality-critical judgments over
 * external text); mechanical projections get LOW; the default is MEDIUM.
 * Free-form stage strings ('action:<x>', 'agent:<y>', 'execute') fall back
 * by prefix classes then to medium. Overridable per call (explicit wins).
 */
export const STAGE_REASONING_GEAR: Readonly<Record<string, ReasoningGear>> = {
  retrieve: 'high',          // rerank windows: listwise adjudication
  build_evidence: 'high',    // claim extraction + relation adjudication
  verify_sources: 'low',     // deterministic-guarded checking
  generate_hypotheses: 'high',
  critique_falsify: 'high',
  rank: 'high',
  plan: 'medium',
  execute: 'low',            // preregistered mechanical verdicts
  feedback: 'low',
  revise: 'high',
  export: 'low',
  scope: 'medium',
};
const STAGE_PREFIX_GEAR: ReadonlyArray<readonly [RegExp, ReasoningGear]> = [
  [/^agent:/, 'medium'],
  [/^action:/, 'high'],
];

export const stageReasoningGear = (stage: string): ReasoningGear => {
  const exact = STAGE_REASONING_GEAR[stage];
  if (exact !== undefined) return exact;
  for (const [re, gear] of STAGE_PREFIX_GEAR) if (re.test(stage)) return gear;
  return 'medium';
};

/**
 * Per-model gear clamps (packet-primary-sourced): the GLM-5 family exposes
 * effort ∈ {low, high, max} — NO medium. Clamping UP (medium→high) keeps the
 * quality-critical stages' intent; never silently downgrades.
 */
export const clampGearForModel = (gear: ReasoningGear, modelId: string): ReasoningGear =>
  /^glm-5/i.test(modelId) && gear === 'medium' ? 'high' : gear;

/**
 * Dialect↔wire compatibility is validated at the config boundary so an impossible
 * combination never reaches the transport: reasoning_effort / enable_thinking are
 * OpenAI-chat-completions body extensions; thinking_budget is the Anthropic-Messages
 * `thinking` parameter; thinking_config is the Gemini generationConfig.thinkingConfig
 * parameter. The refinement lives INSIDE a schema that already sees `wire`
 * (the full config), applied after object construction.
 */
const assertReasoningWireCompat = (
  cfg: { wire: ProviderWireProtocol; reasoning?: { style: ReasoningStyle } },
  ctx: z.RefinementCtx,
): void => {
  if (cfg.reasoning === undefined) return;
  const style = cfg.reasoning.style;
  const requiredWire: Record<ReasoningStyle, ProviderWireProtocol> = {
    reasoning_effort: 'openai',
    enable_thinking: 'openai',
    thinking_budget: 'anthropic',
    thinking_config: 'gemini',
  };
  if (cfg.wire !== requiredWire[style]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reasoning'], message: `reasoning style "${style}" requires wire "${requiredWire[style]}"` });
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
  apiKey: z.string(),
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
