import { z } from 'zod';
import type { StageContext } from './types.js';
import type { RunStageName } from '../domain/run.js';
import { ProvenanceReceipt } from '../domain/provenance.js';
import { newId } from '../domain/ids.js';
import type { Store } from '../persistence/store.js';
import type { ModelProvider, StructuredCallResult } from '../shared/ports.js';
import { strictSchemaOrUndefined } from '../providers/http.js';
import { UNTRUSTED_DATA_RULE } from '../shared/untrusted.js';
import { clampGearForModel, stageReasoningGear } from '../domain/model-config.js';
import type { ReasoningStyle, ReasoningGear } from '../domain/model-config.js';
import { collectEnvSecrets, describeViolation, scanOutbound } from '../shared/exfil-guard.js';
import { RunBudgetExhaustedError } from '../app/run-budget.js';

export interface LlmCallOptions {
  stage: RunStageName;
  purpose: string;
  systemPrompt: string;
  /** Structured payload serialized into the user message (must be JSON-safe). */
  payload: unknown;
  schema: z.ZodType<unknown>;
  temperature?: number;
  maxTokens?: number;
  /** RU-9 GO2: explicit per-call reasoning override — wins over the stage-table derivation. */
  reasoning?: { style: ReasoningStyle; gear: ReasoningGear };
}

export interface LlmResult<T> {
  data: T;
  provider: string;
  modelId: string;
  latencyMs: number;
}

/**
 * Invocation options for the unified model plane. `stage` is a free-form string:
 * pipeline stages pass the RunStageName; the agent kernel uses 'agent:<capability>',
 * research actions 'action:<name>', the experiment executors 'execute'.
 */
export interface InvokeOptions extends Omit<LlmCallOptions, 'stage'> {
  stage: string;
}

/** What a caller must supply to reach the model plane — the four disciplines in one type. */
export interface ModelPlaneDeps {
  provider: ModelProvider;
  /** Run-budget governance (BP-1); absent = unlimited (tests, minimal harnesses). */
  budget?: Parameters<typeof callStructured>[0]['budget'];
  /** Receipt sink: StageContext.recordReceipt (lease-aware) or makeStoreReceiptRecorder. */
  recordReceipt: (partial: ModelReceiptPartial) => void;
  /** Run id for the budget-exhaustion error (non-pipeline callers bound their own run). */
  runId?: string;
  /**
   * RU-9 GO2 effort plane: the resolved route's declared reasoning capability.
   * Present → invokeStructured derives the per-call gear from the stage table
   * (+ per-model clamps) unless the caller passed an explicit gear. Absent →
   * zero reasoning fields on the wire (exact legacy behavior).
   */
  reasoningRoute?: { style: ReasoningStyle; defaultGear: ReasoningGear; modelId: string };
}

/**
 * Process-wide in-flight cap on provider structured calls (FIFO queue, no new
 * dependencies): parallel stage batches (mapBounded) overlap politely instead of
 * stampeding one route. Transport-level 429 backoff stays the deeper guard
 * (src/providers/http.ts); this is the proactive ceiling. FARLAB_MODEL_CONCURRENCY
 * (floor 1) overrides for tight-quota deployments.
 */
const MODEL_CALL_CONCURRENCY = Math.max(1, Number(process.env.FARLAB_MODEL_CONCURRENCY ?? 6) || 6);
let modelCallsInFlight = 0;
const modelCallWaiters: Array<() => void> = [];

const acquireModelSlot = async (): Promise<void> => {
  if (modelCallsInFlight < MODEL_CALL_CONCURRENCY) {
    modelCallsInFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => modelCallWaiters.push(resolve));
  modelCallsInFlight += 1;
};

const releaseModelSlot = (): void => {
  modelCallsInFlight -= 1;
  modelCallWaiters.shift()?.();
};

/** Run one provider call under the global in-flight cap (the agent kernel routes its bespoke calls through this too). */
export const withModelSlot = async <T>(fn: () => Promise<T>): Promise<T> => {
  await acquireModelSlot();
  try {
    return await fn();
  } finally {
    releaseModelSlot();
  }
};

/**
 * THE unified model-plane entry: every non-pipeline caller (research actions,
 * experiment spec-draft/meta-extraction, agent kernel helpers) goes through this
 * so budget governance, receipt shape, structured-output tolerance and the
 * concurrency cap cannot drift per call site. Pipeline stages reach it via the
 * callStructured wrapper below (same discipline, StageContext-shaped).
 */
export async function invokeStructured<T>(deps: ModelPlaneDeps, opts: InvokeOptions): Promise<LlmResult<T>> {
  // BP-1 budget governance: refuse NEW model calls once the run's token cap is spent.
  // In-flight provider work is bounded by the provider plane's own discipline; this
  // gate keeps the NEXT call from starting (fail-visible, never a fabricated result).
  if (deps.budget !== undefined && !deps.budget.hasRemaining()) {
    throw new RunBudgetExhaustedError(deps.runId ?? 'unknown', deps.budget.cap ?? 0, deps.budget.spent);
  }
  // RU-3 T4 exfil tripwire (provider boundary): the request body is a legal
  // egress carrying the whole research context — it must never contain a
  // configured secret VALUE, an active session canary, or exceed the runaway
  // size ceiling. Fail-closed; violation names the secret, never its value.
  {
    const outbound = JSON.stringify({ systemPrompt: opts.systemPrompt, input: opts.payload });
    const violation = scanOutbound(outbound, { secrets: collectEnvSecrets() });
    if (violation !== null) throw new Error(describeViolation(violation));
  }
  const res = await withModelSlot(() => deps.provider.structuredCall(
    {
      task: opts.purpose,
      // RU-3 T1: the unified entry appends the canonical untrusted-content rule so
      // no LLM surface (stage, action, spec-draft, meta-extraction) can miss it.
      systemPrompt: `${opts.systemPrompt}\n\n${UNTRUSTED_DATA_RULE}`,
      userPayload: { outputContract: describeShape(opts.schema), input: opts.payload },
      outputKind: 'json',
      temperature: opts.temperature,
      // Default output budget: large structured payloads (rank/plan) must not truncate mid-JSON.
      maxTokens: opts.maxTokens ?? 8192,
      // Strict-FC projection for providers with server-side tool-schema enforcement
      // (D-026); schemas containing nodes with no strict-FC shape (records/unknowns)
      // return undefined and stay on the json_object transport (audit P2-1 fix —
      // the beta endpoint 400s on bare-{} subschemas, live-probed 2026-08-22).
      jsonSchema: strictSchemaOrUndefined(opts.schema),
      purpose: opts.purpose,
      ...(opts.reasoning !== undefined
        ? { reasoning: opts.reasoning }
        : deps.reasoningRoute !== undefined
          ? { reasoning: { style: deps.reasoningRoute.style, gear: clampGearForModel(stageReasoningGear(opts.stage), deps.reasoningRoute.modelId) } }
          : {}),
    },
    (raw) => validateStructured<T>(raw, opts.schema),
  ));
  deps.budget?.spend(res.receipt.usage.totalTokens);
  recordModelReceipt(deps.recordReceipt, { stage: opts.stage }, res);
  if (!res.ok || res.data === undefined) {
    const err = res.error ?? { kind: 'provider_error', message: 'unknown provider failure' };
    throw new Error(`model call failed (${err.kind}) in ${opts.stage}/${opts.purpose}: ${err.message}`);
  }
  return { data: res.data, provider: res.receipt.provider, modelId: res.receipt.modelId, latencyMs: res.receipt.latencyMs };
}

/**
 * Single disciplined bridge from stages to the model plane: one call, deterministic zod
 * validation, receipt recorded, provider failure thrown (fail-closed — never fabricate).
 */
export async function callStructured<T>(ctx: StageContext, opts: LlmCallOptions): Promise<LlmResult<T>> {
  return invokeStructured(
    { provider: ctx.provider, budget: ctx.budget, recordReceipt: ctx.recordReceipt, runId: ctx.run.id, ...(ctx.reasoningRoute !== undefined ? { reasoningRoute: ctx.reasoningRoute } : {}) },
    { ...opts, stage: opts.stage },
  );
}

/** Receipt partial accepted by recordModelReceipt — stage is free-form (agent sessions use 'agent:<capability>'). */
export type ModelReceiptPartial = Omit<ProvenanceReceipt, 'id' | 'runId' | 'at'> & { at?: string };

/** receipt_recorded event detail — ONE shape for every recording path (orchestrator, store recorder). */
export const receiptEventDetail = (receipt: ProvenanceReceipt): Record<string, unknown> => ({
  kind: receipt.kind,
  id: receipt.id,
  ...(receipt.modelCall !== undefined ? {
    provider: receipt.modelCall.provider,
    modelId: receipt.modelCall.modelId,
    latencyMs: receipt.modelCall.latencyMs,
    ...(receipt.modelCall.usage.totalTokens !== undefined ? { totalTokens: receipt.modelCall.usage.totalTokens } : {}),
  } : {}),
  ...(receipt.sourceRetrieval !== undefined ? {
    family: receipt.sourceRetrieval.family,
    query: receipt.sourceRetrieval.query,
    httpStatus: receipt.sourceRetrieval.httpStatus,
    resultCount: receipt.sourceRetrieval.resultCount,
  } : {}),
});

/**
 * Store-backed receipt sink for NON-pipeline callers (research actions, experiment
 * executors): same ProvenanceReceipt.parse + putObject + receipt_recorded event as
 * the orchestrator's context sink, minus lease heartbeating (no lease outside
 * execute()). Building the recorder (not recording inline in callers) keeps the
 * receipt body and event shape from drifting per call site.
 */
export const makeStoreReceiptRecorder = (store: Store, runId: string): ((partial: ModelReceiptPartial) => void) => {
  return (partial) => {
    const receipt = ProvenanceReceipt.parse({
      ...partial,
      id: newId('rcp'),
      runId,
      at: partial.at ?? new Date().toISOString(),
    });
    store.putObject('receipt', receipt);
    store.appendEvent(runId, {
      type: 'receipt_recorded',
      stage: partial.stage,
      detail: receiptEventDetail(receipt),
      receiptId: receipt.id,
    });
  };
};

/**
 * Shape the model-call receipt for ANY caller (stages via callStructured AND the agent
 * kernel). Single source for the receipt body so the two paths cannot drift.
 */
export const recordModelReceipt = (
  record: (partial: ModelReceiptPartial) => void,
  meta: { stage?: string },
  res: StructuredCallResult<unknown>,
): void => {
  record({
    kind: 'model_call',
    executionMode: res.receipt.executionMode,
    stage: meta.stage,
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
      ...(res.receipt.transportRetries !== undefined ? { transportRetries: res.receipt.transportRetries } : {}),
      ...(res.receipt.correctiveReasks !== undefined ? { correctiveReasks: res.receipt.correctiveReasks } : {}),
      ...(res.receipt.params !== undefined ? { params: res.receipt.params } : {}),
      ...(res.receipt.routing !== undefined ? { routing: res.receipt.routing } : {}),
    },
  });
};

/**
 * Tolerance-chain structured validation (the parse callback of callStructured, exported
 * for the agent kernel so both callers share one validation authority).
 * Candidates in order; every candidate must still satisfy the FULL schema:
 *   1. as-is
 *   2. null-valued properties stripped (models emit null for optional fields)
 *   3. single-key envelope unwrapped (models wrap the payload in the task name,
 *      e.g. {"falsification-spec": {...}} — live DeepSeek failure 2026-08-22 P2)
 *   4. enum-variant normalization on top of each base
 */
export const validateStructured = <T>(raw: unknown, schema: z.ZodType<unknown>): T | Error => {
  const unwrapped = unwrapSingleKeyEnvelope(raw);
  const candidates: unknown[] = [];
  for (const base of unwrapped === raw ? [raw] : [raw, unwrapped]) {
    candidates.push(base, stripNulls(base), normalizeEnumFields(stripNulls(base), schema));
  }
  let firstError: z.ZodError | null = null;
  for (const candidate of candidates) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) return parsed.data as T;
    firstError ??= parsed.error;
  }
  return new Error(`schema validation failed: ${firstError!.issues.map((i) => `${i.path.join('.')}:${i.message}`).slice(0, 5).join('; ')}`);
};

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
export const describeShape = (schema: z.ZodTypeAny): string => {
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
      case 'ZodOptional': case 'ZodNullable': case 'ZodDefault': case 'ZodCatch':
        return `${walk((d as { innerType?: z.ZodTypeAny; type?: z.ZodTypeAny }).innerType ?? (d as { type: z.ZodTypeAny }).type!)}?`;
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
      d.typeName === 'ZodCatch' || d.typeName === 'ZodEffects' || d.typeName === 'ZodPipeline'
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
