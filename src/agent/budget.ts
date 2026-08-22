/**
 * Context budget (H2, Claude Code per-source budget discipline). Token counts are
 * ESTIMATES (serialized-chars/4) — no tokenizer dependency; the budget exists to trigger
 * compaction early, not to bill anyone. Estimates are labeled as such everywhere they
 * surface (events, telemetry).
 */

export interface TokenBudget {
  /** Soft limit (estimated transcript tokens) — microcompaction engages beyond it. */
  transcriptSoft: number;
  /** Hard limit — full handoff compaction before the next model call. */
  transcriptHard: number;
  /** Max serialized chars of one tool-result payload before truncate/spill. */
  maxToolResultChars: number;
}

/**
 * Defaults derived from the provider context window: transcript gets ~18% soft / ~28%
 * hard — the rest is reserved for system prompt, tool catalog and the model's output
 * (Claude Code reserves explicit headroom for compaction output itself).
 */
export const defaultBudget = (contextWindowTokens = 128_000): TokenBudget => ({
  transcriptSoft: Math.floor(contextWindowTokens * 0.18),
  transcriptHard: Math.floor(contextWindowTokens * 0.28),
  maxToolResultChars: 6_000,
});

export const estimateTokens = (value: unknown): number => {
  let text: string;
  try {
    text = JSON.stringify(value) ?? 'null';
  } catch {
    text = String(value);
  }
  return Math.ceil(text.length / 4);
};
