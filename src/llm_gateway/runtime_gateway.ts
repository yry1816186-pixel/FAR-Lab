// src/llm_gateway/runtime_gateway.ts
// Runtime LLM context resolution for the HTTP server.
//
// The API layer imports only the model-neutral exported context constants. Model
// names and provider-specific environment variables remain inside llm_gateway/.
// No-key environments return null: LLM-dependent endpoints must fail closed and
// must never substitute an offline fixture.

import type { LlmGateway } from './gateway.ts';
import { createCompetitionQwenGateway } from './competition_gateway.ts';
import { COMPETITION_MODEL_SNAPSHOT } from './adapters/aliyun_qwen/snapshot.ts';

/** Runtime environment (explicitly supplied for deterministic tests). */
export type RuntimeEnv = Readonly<Record<string, string | undefined>>;

/** Provider profile created by the built-in runtime resolver. */
export const RUNTIME_PROVIDER_PROFILE = 'competition_aliyun_qwen' as const;

/** Immutable model snapshot paired with the built-in runtime profile. */
export const RUNTIME_MODEL_SNAPSHOT = COMPETITION_MODEL_SNAPSHOT;

/** Supported API-key environment variables, in priority order. */
const API_KEY_ENV_NAMES = ['FAR_DASHSCOPE_API_KEY', 'DASHSCOPE_API_KEY'] as const;

/**
 * Resolve the built-in live gateway.
 *
 * - a non-empty key creates the real competition gateway;
 * - no key returns null;
 * - no replay or synthetic fallback is constructed here.
 */
export function resolveRuntimeGateway(env: RuntimeEnv): LlmGateway | null {
  const apiKey = API_KEY_ENV_NAMES.map((name) => env[name]).find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (apiKey === undefined) {
    return null;
  }
  return createCompetitionQwenGateway({ apiKey });
}
