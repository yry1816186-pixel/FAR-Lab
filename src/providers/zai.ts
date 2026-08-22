import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import {
  authFailClosedResult,
  runOpenAICompatStructuredCall,
  type FetchLike,
  type SleepLike,
} from './http.js';

/**
 * Zhipu GLM live adapter (Anthropic-Messages wire on open.bigmodel.cn).
 *
 * Route history: the OpenAI-compat paas/v4 endpoints (api.z.ai AND open.bigmodel.cn)
 * both failed live with 429 code 1113 "insufficient balance" on this account (D-036/
 * D-058). The user-identified correct route for the funded key is the Anthropic-
 * compatible endpoint `open.bigmodel.cn/api/anthropic` (probe-verified 2026-08-22:
 * glm-4.6 chat 200 with real completion + usage on BOTH x-api-key and Bearer auth;
 * the OpenAI-compat path on the same account returns 1113). The provider therefore
 * speaks the Anthropic Messages wire: x-api-key header, top-level system param,
 * content-block responses. The core still classifies 429 + balance-text as
 * quota_exceeded (never a transient rate limit).
 */

export const ZAI_BASE_URL = 'https://open.bigmodel.cn/api/anthropic';
export const ZAI_DEFAULT_MODEL = 'glm-4.6';
// Primary env is ZAI_API_KEY; ZHIPU_API_KEY stays as legacy fallback (W0 convention).
// Precedence matters: a funded ZAI_API_KEY must win over a stale legacy value in the shell.
const ENV_API_KEY = 'ZAI_API_KEY';
const ENV_API_KEY_LEGACY = 'ZHIPU_API_KEY';
const ENV_MODEL = 'FARLAB_ZAI_MODEL';
const ENV_BASE_URL = 'FARLAB_ZAI_BASE_URL';

export interface ZaiProviderOptions {
  /** Overrides ZHIPU_API_KEY (tests inject a fake value; real secrets never enter files/logs). */
  apiKey?: string;
  /** Overrides model selection (default: glm-4.6; env override: FARLAB_ZAI_MODEL). */
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  sleep?: SleepLike;
  totalTimeoutMs?: number;
  /** Deterministic jitter seam for tests (W4-F1). */
  random?: () => number;
}

export interface ZaiProvider extends ModelProvider {
  readonly modelId: string;
  readonly baseUrl: string;
}

export function createZaiProvider(opts: ZaiProviderOptions = {}): ZaiProvider {
  const apiKey = opts.apiKey ?? process.env[ENV_API_KEY] ?? process.env[ENV_API_KEY_LEGACY] ?? '';
  const modelId = opts.model ?? process.env[ENV_MODEL] ?? ZAI_DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? process.env[ENV_BASE_URL] ?? ZAI_BASE_URL;
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
        { providerName: 'zai', baseUrl, apiKey, modelId, executionMode: 'live', wire: 'anthropic' },
        // The Anthropic Messages wire has no tools/response_format concepts — the
        // JSON-only system suffix carries the output contract. Strip any strict-FC
        // projection (zai never opted into tools; audit P1-3 stands).
        req.jsonSchema === undefined ? req : { ...req, jsonSchema: undefined },
        parse,
        { fetchImpl: opts.fetchImpl, sleep: opts.sleep, totalTimeoutMs: opts.totalTimeoutMs, random: opts.random },
      );
    },
  };
}
