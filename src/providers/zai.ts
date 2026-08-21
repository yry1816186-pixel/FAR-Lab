import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import {
  authFailClosedResult,
  runOpenAICompatStructuredCall,
  type FetchLike,
  type SleepLike,
} from './http.js';

/**
 * Z.ai / GLM live adapter (OpenAI-compatible paas/v4 route).
 *
 * W0 spike status: protocol reachable and key valid (model list 200), but live
 * chat was BLOCKED 2026-08-21 by code 1113 (insufficient balance, surfaced as
 * HTTP 429). The core therefore classifies 429+1113 as quota_exceeded — NOT a
 * transient rate limit — so it is never blindly retried. Once the account is
 * recharged, `node scripts/live-check-model.mjs --provider zai` completes the
 * live evidence without code changes.
 */

export const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
export const ZAI_DEFAULT_MODEL = 'glm-4.6';
const ENV_API_KEY = 'ZHIPU_API_KEY';
const ENV_MODEL = 'FARLAB_ZAI_MODEL';

export interface ZaiProviderOptions {
  /** Overrides ZHIPU_API_KEY (tests inject a fake value; real secrets never enter files/logs). */
  apiKey?: string;
  /** Overrides model selection (default: glm-4.6; env override: FARLAB_ZAI_MODEL). */
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  sleep?: SleepLike;
  totalTimeoutMs?: number;
}

export interface ZaiProvider extends ModelProvider {
  readonly modelId: string;
  readonly baseUrl: string;
}

export function createZaiProvider(opts: ZaiProviderOptions = {}): ZaiProvider {
  const apiKey = opts.apiKey ?? process.env[ENV_API_KEY] ?? '';
  const modelId = opts.model ?? process.env[ENV_MODEL] ?? ZAI_DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? ZAI_BASE_URL;
  return {
    name: 'zai',
    liveReady: apiKey.length > 0,
    modelId,
    baseUrl,
    structuredCall<T>(
      req: StructuredCallRequest,
      parse: (raw: unknown) => T | Error,
    ): Promise<StructuredCallResult<T>> {
      if (!apiKey) {
        // Fail closed: no key -> no network, no fabricated output.
        return Promise.resolve(
          authFailClosedResult({ providerName: 'zai', modelId, executionMode: 'live' }, req, ENV_API_KEY),
        );
      }
      return runOpenAICompatStructuredCall(
        { providerName: 'zai', baseUrl, apiKey, modelId, executionMode: 'live' },
        // Strict-FC tool payloads are a DeepSeek-beta capability (D-026); zai never opted
        // into tools and is unverified there (audit P1-3, 2026-08-22) — strip the
        // projection so this route stays on the json_object transport it was built for.
        req.jsonSchema === undefined ? req : { ...req, jsonSchema: undefined },
        parse,
        { fetchImpl: opts.fetchImpl, sleep: opts.sleep, totalTimeoutMs: opts.totalTimeoutMs },
      );
    },
  };
}
