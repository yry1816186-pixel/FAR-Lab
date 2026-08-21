import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import {
  authFailClosedResult,
  runOpenAICompatStructuredCall,
  type FetchLike,
  type SleepLike,
} from './http.js';

/**
 * DeepSeek live adapter — the W0-spike-verified production route
 * (evidence/W0/model-spike-report.md: T1/T2 schema-valid, usage fields stable,
 * error envelope OpenAI-style). `deepseek-chat` is an alias that currently
 * routes to deepseek-v4-flash; the actually served model is recorded as
 * receipt.modelVersion from the response body.
 */

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
/** Beta base URL: enables strict function calling (server-side tool-schema enforcement). */
export const DEEPSEEK_STRICT_BASE_URL = 'https://api.deepseek.com/beta';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';
const ENV_API_KEY = 'DEEPSEEK_API_KEY';
const ENV_MODEL = 'FARLAB_DEEPSEEK_MODEL';
const ENV_STRICT = 'FARLAB_DEEPSEEK_STRICT';

export interface DeepSeekProviderOptions {
  /** Overrides DEEPSEEK_API_KEY (tests inject a fake value; real secrets never enter files/logs). */
  apiKey?: string;
  /** Overrides model selection (default: deepseek-chat; env override: FARLAB_DEEPSEEK_MODEL). */
  model?: string;
  baseUrl?: string;
  /**
   * Strict function calling via the beta base URL (probe-verified 2026-08-22, D-026):
   * requests carrying jsonSchema get server-side tool-schema enforcement. Default ON;
   * set false or FARLAB_DEEPSEEK_STRICT=0 to stay on the stable json_object path.
   * No mid-flight fallback: the mode is fixed at construction and failures stay visible.
   */
  strictTools?: boolean;
  fetchImpl?: FetchLike;
  sleep?: SleepLike;
  totalTimeoutMs?: number;
}

export interface DeepSeekProvider extends ModelProvider {
  readonly modelId: string;
  readonly baseUrl: string;
  readonly strictTools: boolean;
}

export function createDeepSeekProvider(opts: DeepSeekProviderOptions = {}): DeepSeekProvider {
  const apiKey = opts.apiKey ?? process.env[ENV_API_KEY] ?? '';
  const modelId = opts.model ?? process.env[ENV_MODEL] ?? DEEPSEEK_DEFAULT_MODEL;
  const strictTools = opts.strictTools ?? process.env[ENV_STRICT] !== '0';
  const baseUrl = opts.baseUrl ?? (strictTools ? DEEPSEEK_STRICT_BASE_URL : DEEPSEEK_BASE_URL);
  return {
    name: 'deepseek',
    liveReady: apiKey.length > 0,
    modelId,
    baseUrl,
    strictTools,
    structuredCall<T>(
      req: StructuredCallRequest,
      parse: (raw: unknown) => T | Error,
    ): Promise<StructuredCallResult<T>> {
      if (!apiKey) {
        // Fail closed: no key -> no network, no fabricated output.
        return Promise.resolve(
          authFailClosedResult({ providerName: 'deepseek', modelId, executionMode: 'live' }, req, ENV_API_KEY),
        );
      }
      return runOpenAICompatStructuredCall(
        { providerName: 'deepseek', baseUrl, apiKey, modelId, executionMode: 'live' },
        // jsonSchema rides the request only in strict mode (the request-hash contract
        // changes otherwise for callers that never opted into tools form)
        strictTools || req.jsonSchema === undefined ? req : { ...req, jsonSchema: undefined },
        parse,
        { fetchImpl: opts.fetchImpl, sleep: opts.sleep, totalTimeoutMs: opts.totalTimeoutMs },
      );
    },
  };
}
