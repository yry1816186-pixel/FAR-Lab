/**
 * research/llm — shared structured-JSON LLM call helper for the Track-1A layer.
 *
 * All model calls in the research module go through callStructuredJson: it
 * issues a structured-output request, JSON-parses, and zod-validates the result
 * locally (a model's structured output is never trusted without local schema
 * validation — directive §10). At most two repair attempts are made; a second
 * failure propagates (fail-closed, never a swallowed JSON error producing a
 * default research payload).
 *
 * The returned CallMeta carries the provider identity/usage facts the stage
 * receipt needs (directive §3.3): model id, provider request id, snapshot
 * state, provider-reported token usage, cost status, latency, attempts.
 * Fields the provider did not return are null — never invented.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { LlmCallCredential, LlmMessage, ProviderProfile } from '../llm_gateway/types.ts';
import {
  modelSnapshotState,
  toReceiptCost,
  toReceiptTokenUsage,
  type ReceiptCost,
  type ReceiptTokenUsage,
} from './provenance.ts';

/** Provider identity + usage facts for one structured call (never invented). */
export interface CallMeta {
  /** Provider profile the call went to. */
  readonly provider: string;
  /** Model id actually invoked. */
  readonly modelId: string | null;
  /** Provider request/response id (null = provider did not return one). */
  readonly requestId: string | null;
  /** Snapshot state (provided / not_provided_by_provider / unknown). */
  readonly modelSnapshot: 'provided' | 'not_provided_by_provider' | 'unknown';
  /** Provider-reported token usage (null = unavailable). */
  readonly tokenUsage: ReceiptTokenUsage | null;
  /** Cost status. */
  readonly cost: ReceiptCost;
  /** Wall-clock latency of the final (successful) attempt, ms. */
  readonly latencyMs: number;
  /** Number of repair attempts consumed (1 = first try succeeded). */
  readonly attempts: number;
  /** Provider-side 429/5xx retries consumed inside the adapter (0 = none). */
  readonly providerRetries: number;
  /** Provider-reported finish reason (null = provider did not report one). */
  readonly finishReason: string | null;
  /** UTC ISO timestamp of the call. */
  readonly isoTimestamp: string;
}

/** The result of callStructuredJson: validated data + provenance metadata. */
export interface StructuredCall<T> {
  readonly data: T;
  readonly meta: CallMeta;
}

/** Reduce a gateway credential + timing into a CallMeta. */
function toCallMeta(
  profile: ProviderProfile,
  credential: LlmCallCredential,
  latencyMs: number,
  attempts: number,
): CallMeta {
  const adapterMeta = credential.adapterMeta;
  const providerRetries =
    adapterMeta !== undefined && typeof adapterMeta['providerRetries'] === 'number'
      ? adapterMeta['providerRetries']
      : 0;
  return {
    provider: credential.providerProfile,
    modelId: credential.modelId,
    requestId: credential.providerRequestId,
    modelSnapshot: modelSnapshotState(String(profile), credential.modelVersion),
    tokenUsage: toReceiptTokenUsage(credential.tokenUsage),
    cost: toReceiptCost(credential.costSnapshot),
    latencyMs,
    attempts,
    providerRetries,
    finishReason: credential.finishReason ?? null,
    isoTimestamp: credential.isoTimestamp,
  };
}

/**
 * Call the gateway with structured JSON output and validate locally.
 *
 * @param gateway   the LLM gateway (live or offline_replay)
 * @param profile   the provider profile to call
 * @param stageId   fixture/stage key (offline_replay registry matches on this)
 * @param schema    zod schema to validate the parsed output
 * @param messages  system + user messages (external content must be pre-sanitized)
 * @param maxTokens output-token cap (adapter default 2048 truncates large
 *                  structured payloads like hypothesis sets — callers pass an
 *                  explicit budget sized to their stage)
 *
 * @throws on the 2nd consecutive schema/JSON failure (fail-closed)
 */
export async function callStructuredJson<T>(
  gateway: LlmGateway,
  profile: ProviderProfile,
  stageId: string,
  schema: z.ZodType<T>,
  messages: readonly LlmMessage[],
  maxTokens = 4096,
): Promise<StructuredCall<T>> {
  const jsonSchema = zodToJsonSchema(schema, { name: stageId }) as Record<string, unknown>;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    // Attempt 2 is a REPAIR: the validation error is fed back to the model so
    // it can correct the specific violation instead of re-emitting it verbatim
    // (an identical retry cannot succeed where the first attempt failed).
    const attemptMessages: readonly LlmMessage[] = attempt === 1
      ? messages
      : [
          ...messages,
          {
            role: 'user',
            content:
              `Your previous reply failed local schema validation: ${
                lastError instanceof Error ? lastError.message : String(lastError)
              }. ` +
              'Return ONLY the corrected JSON object satisfying the schema — no prose, no markdown fences.',
          },
        ];
    const response = await gateway.callLlm(profile, {
      messages: attemptMessages,
      responseFormat: 'json_schema',
      jsonSchema: { name: stageId, schema: jsonSchema, strict: true },
      stageId,
      maxTokens,
    });
    try {
      const parsed: unknown = JSON.parse(response.content);
      // Live-evidence repair (2026-08-14, DashScope compatible-mode): on large
      // inputs the model occasionally returns the JSON object DOUBLE-ENCODED —
      // the root parses to a string containing the real object. Unwrap once and
      // re-validate against the schema; the unwrap counts within the attempt
      // budget (no silent acceptance, no weakened schema).
      const data =
        typeof parsed === 'string'
          ? schema.parse(JSON.parse(parsed))
          : schema.parse(parsed);
      return {
        data,
        meta: toCallMeta(profile, response.credential, Date.now() - startedAt, attempt),
      };
    } catch (err) {
      lastError = err;
      // attempt 2 falls through to throw; attempt 1 retries once (structured repair).
    }
  }

  throw new Error(
    `research[${stageId}]: structured output failed local schema validation after 2 attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
