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

export const ModelProviderConfig = z.object({
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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ModelProviderConfig = z.infer<typeof ModelProviderConfig>;

/** Display hint for a stored key: last 4 chars only; empty key stays empty. */
export const maskApiKey = (key: string): string =>
  key.length === 0 ? '' : `••••${key.slice(-4)}`;
