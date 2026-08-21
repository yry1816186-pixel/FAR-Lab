import { z } from 'zod';
import type { StageContext } from './types.js';
import type { RunStageName } from '../domain/run.js';

export interface LlmCallOptions {
  stage: RunStageName;
  purpose: string;
  systemPrompt: string;
  /** Structured payload serialized into the user message (must be JSON-safe). */
  payload: unknown;
  schema: z.ZodType<unknown>;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResult<T> {
  data: T;
  provider: string;
  modelId: string;
  latencyMs: number;
}

/**
 * Single disciplined bridge from stages to the model plane: one call, deterministic zod
 * validation, receipt recorded, provider failure thrown (fail-closed — never fabricate).
 */
export async function callStructured<T>(ctx: StageContext, opts: LlmCallOptions): Promise<LlmResult<T>> {
  const res = await ctx.provider.structuredCall(
    {
      task: opts.purpose,
      systemPrompt: opts.systemPrompt,
      userPayload: opts.payload,
      outputKind: 'json',
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      purpose: opts.purpose,
    },
    (raw) => {
      const parsed = opts.schema.safeParse(raw);
      return parsed.success ? (parsed.data as T) : new Error(`schema validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 5).join('; ')}`);
    },
  );
  ctx.recordReceipt({
    kind: 'model_call',
    executionMode: res.receipt.executionMode,
    stage: opts.stage,
    redactionNote: 'raw prompts/responses not retained; hashes only',
    modelCall: {
      provider: res.receipt.provider,
      modelId: res.receipt.modelId,
      modelVersion: res.receipt.modelVersion,
      usage: res.receipt.usage,
      latencyMs: res.receipt.latencyMs,
      requestHash: res.receipt.requestHash,
      outputHash: res.receipt.outputHash,
      finishReason: res.receipt.finishReason,
    },
  });
  if (!res.ok || res.data === undefined) {
    const err = res.error ?? { kind: 'provider_error', message: 'unknown provider failure' };
    throw new Error(`model call failed (${err.kind}) in ${opts.stage}/${opts.purpose}: ${err.message}`);
  }
  return { data: res.data, provider: res.receipt.provider, modelId: res.receipt.modelId, latencyMs: res.receipt.latencyMs };
}
