import { z } from 'zod';
import type { StageContext } from './types.js';
import type { RunStageName } from '../domain/run.js';
import { zodToStrictJsonSchema } from '../providers/http.js';

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
      // Default output budget: large structured payloads (rank/plan) must not truncate mid-JSON.
      maxTokens: opts.maxTokens ?? 8192,
      // Strict-FC projection for providers with server-side tool-schema enforcement
      // (D-026); providers without the capability ignore it, zod stays the authority.
      jsonSchema: zodToStrictJsonSchema(opts.schema),
      purpose: opts.purpose,
    },
    (raw) => {
      const attempt = (input: unknown) => opts.schema.safeParse(input);
      // Tolerance chain, in order; every candidate must still satisfy the FULL schema:
      //   1. as-is
      //   2. null-valued properties stripped (models emit null for optional fields)
      //   3. single-key envelope unwrapped (models wrap the payload in the task name,
      //      e.g. {"falsification-spec": {...}} — live DeepSeek failure 2026-08-22 P2)
      //   4. enum-variant normalization on top of each base
      const unwrapped = unwrapSingleKeyEnvelope(raw);
      const candidates: unknown[] = [];
      for (const base of unwrapped === raw ? [raw] : [raw, unwrapped]) {
        candidates.push(base, stripNulls(base), normalizeEnumFields(stripNulls(base), opts.schema));
      }
      let firstError: z.ZodError | null = null;
      for (const candidate of candidates) {
        const parsed = attempt(candidate);
        if (parsed.success) return parsed.data as T;
        firstError ??= parsed.error;
      }
      return new Error(`schema validation failed: ${firstError!.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 5).join('; ')}`);
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
 * Providers occasionally wrap the whole payload in one envelope key named after
 * the task ("falsification-spec", "result", ...). When the top-level value is an
 * object with exactly one own key whose value is an object or array, return that
 * inner value (bounded to two levels for double wrapping). Returns the input
 * unchanged otherwise. Purely a validation candidate — the caller still applies
 * the full schema to the unwrapped value.
 */
const unwrapSingleKeyEnvelope = (v: unknown, depth = 0): unknown => {
  if (depth >= 2 || v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length !== 1) return v;
  const inner = entries[0]![1];
  if (inner === null || typeof inner !== 'object') return v;
  return unwrapSingleKeyEnvelope(inner, depth + 1);
};

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

/**
 * Path-aware enum-variant normalization: canonical-fold (case/whitespace/hyphen/underscore
 * differences) ONLY at payload locations whose schema type is a ZodEnum. Free-text strings
 * are never rewritten, even when they canonically collide with an enum member living at a
 * different schema path — the earlier flat-set version had exactly that cross-field
 * rewrite hazard (adversarial audit P2, 2026-08-22). Replacements happen only when the
 * fold maps to exactly one enum member; ambiguous folds stay untouched and fail validation
 * rather than guessing.
 */
const foldToMember = (x: string, members: readonly string[]): string => {
  if (members.includes(x)) return x;
  const canon = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const hits = members.filter((m) => canon(m) === canon(x));
  return hits.length === 1 ? hits[0]! : x;
};

const unwrapTypeWrapper = (t: z.ZodTypeAny): z.ZodTypeAny => {
  for (let i = 0; i < 12; i += 1) {
    const d = t._def as { typeName?: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny; in?: z.ZodTypeAny };
    if (
      d.typeName === 'ZodOptional' || d.typeName === 'ZodNullable' || d.typeName === 'ZodDefault' ||
      d.typeName === 'ZodEffects' || d.typeName === 'ZodPipeline'
    ) {
      const next = d.innerType ?? d.schema ?? d.in;
      if (next === undefined || next === t) return t;
      t = next;
    } else {
      return t;
    }
  }
  return t;
};

const normalizeEnumFields = (value: unknown, schema: z.ZodTypeAny, depth = 0): unknown => {
  if (depth > 12) return value;
  const t = unwrapTypeWrapper(schema);
  const d = t._def as { typeName?: string; values?: unknown; type?: z.ZodTypeAny; shape?: unknown };
  if (d.typeName === 'ZodEnum') {
    const members = (d.values as readonly string[]) ?? [];
    return typeof value === 'string' ? foldToMember(value, members) : value; // non-strings left for validation to reject
  }
  if (value === null || typeof value !== 'object') return value;
  if (d.typeName === 'ZodObject' && !Array.isArray(value)) {
    const shapeObj = typeof d.shape === 'function' ? (d.shape as () => Record<string, z.ZodTypeAny>)() : ((d.shape as Record<string, z.ZodTypeAny>) ?? {});
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const field = shapeObj[k];
      out[k] = field === undefined ? v : normalizeEnumFields(v, field, depth + 1); // unknown keys untouched
    }
    return out;
  }
  if (d.typeName === 'ZodArray' && Array.isArray(value)) {
    return value.map((x) => normalizeEnumFields(x, (d as { type: z.ZodTypeAny }).type!, depth + 1));
  }
  return value; // unions/records/primitives: untouched (safe; validation still applies)
};
