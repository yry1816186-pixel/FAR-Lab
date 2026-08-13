/**
 * research/llm — shared structured-JSON LLM call helper for the Track-1A layer.
 *
 * All model calls in the research module go through callStructuredJson: it
 * issues a structured-output request, JSON-parses, and zod-validates the result
 * locally (a model's structured output is never trusted without local schema
 * validation — directive §10). At most two repair attempts are made; a second
 * failure propagates (fail-closed, never a swallowed JSON error producing a
 * default research payload).
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { LlmGateway } from '../llm_gateway/gateway.ts';
import type { LlmMessage, ProviderProfile } from '../llm_gateway/types.ts';

/**
 * Call the gateway with structured JSON output and validate locally.
 *
 * @param gateway   the LLM gateway (live or offline_replay)
 * @param profile   the provider profile to call
 * @param stageId   fixture/stage key (offline_replay registry matches on this)
 * @param schema    zod schema to validate the parsed output
 * @param messages  system + user messages (external content must be pre-sanitized)
 *
 * @throws on the 2nd consecutive schema/JSON failure (fail-closed)
 */
export async function callStructuredJson<T>(
  gateway: LlmGateway,
  profile: ProviderProfile,
  stageId: string,
  schema: z.ZodType<T>,
  messages: readonly LlmMessage[],
): Promise<T> {
  const jsonSchema = zodToJsonSchema(schema, { name: stageId }) as Record<string, unknown>;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await gateway.callLlm(profile, {
      messages,
      responseFormat: 'json_schema',
      jsonSchema: { name: stageId, schema: jsonSchema, strict: true },
      stageId,
    });
    try {
      const parsed: unknown = JSON.parse(response.content);
      return schema.parse(parsed);
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
