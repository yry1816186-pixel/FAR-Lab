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
      userPayload: { outputContract: describeShape(opts.schema), input: opts.payload },
      outputKind: 'json',
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      purpose: opts.purpose,
    },
    (raw) => {
      const attempt = (input: unknown) => opts.schema.safeParse(input);
      // null-as-meaningful schemas (e.g. value:null = not assessable) pass on the raw attempt;
      // null-for-absent-optional tolerates the stripped retry. Required nulls fail both.
      let parsed = attempt(raw);
      if (!parsed.success) parsed = attempt(stripNulls(raw));
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

/**
 * Models routinely emit `null` for optional fields; canonical stage schemas use `.optional()`.
 * Strip null-valued properties (recursively) before validation: null becomes absent.
 * Required fields are unaffected — a required null becomes absent and still fails validation.
 */
const stripNulls = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== null) out[k] = stripNulls(val);
    }
    return out;
  }
  return v;
};

/**
 * Compact shape description derived from the zod schema, injected into every call payload.
 * Field-name drift (e.g. "hypothesis" vs "statement") is the dominant structured-output
 * failure mode; showing the exact contract reduces it at the root for all stages.
 */
const describeShape = (schema: z.ZodTypeAny): string => {
  const walk = (t: z.ZodTypeAny): string => {
    const d = t._def as { typeName?: string; type?: z.ZodTypeAny; values?: unknown; shape?: Record<string, z.ZodTypeAny>; valueType?: z.ZodTypeAny; innerType?: z.ZodTypeAny; options?: Readonly<z.ZodTypeAny[]> };
    switch (d.typeName) {
      case 'ZodObject': {
        const shapeObj = typeof d.shape === 'function' ? (d.shape as () => Record<string, z.ZodTypeAny>)() : ((d.shape as Record<string, z.ZodTypeAny>) ?? {});
        const fields = Object.entries(shapeObj).map(([k, v]) => `${k}: ${walk(v)}`);
        return `{${fields.join(', ')}}`;
      }
      case 'ZodArray': return `${walk((d as { type: z.ZodTypeAny }).type!)}[]`;
      case 'ZodString': return 'string';
      case 'ZodNumber': return 'number';
      case 'ZodBoolean': return 'boolean';
      case 'ZodEnum': return `one of ${(d.values as readonly string[]).map((v) => JSON.stringify(v)).join('|')}`;
      case 'ZodLiteral': return JSON.stringify((d as { value: unknown }).value);
      case 'ZodOptional': case 'ZodNullable': case 'ZodDefault':
        return `${walk((d as { innerType: z.ZodTypeAny }).innerType!)}?`;
      case 'ZodUnion': return (d.options ?? []).map(walk).join('|');
      case 'ZodEffects': case 'ZodPipeline':
        return walk((d as { schema?: z.ZodTypeAny; in?: z.ZodTypeAny }).schema ?? (d as { in: z.ZodTypeAny }).in!);
      case 'ZodRecord': return 'object';
      default: return (d.typeName ?? 'value').replace(/^Zod/, '').toLowerCase();
    }
  };
  return walk(schema);
};
