import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import { runOpenAICompatStructuredCall, authFailClosedResult } from './http.js';

/**
 * Alibaba Bailian (DashScope) OpenAI-compatible provider — the SUBMISSION-MANDATED route
 * (XH-202619: 千问系模型经阿里云百炼调用 + 凭证, project-spec/COMPETITION.md §0).
 *
 * Capability posture mirrors zai: OpenAI-compatible chat/completions with json_object
 * structured output; strict function-calling tools are NOT enabled here (unverified on
 * this route — same capability decision as D-029's zai strip). Fail-closed without a key;
 * live receipts are produced by the pipeline, never fabricated.
 */

export const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_DEFAULT_MODEL = 'qwen-plus';
const ENV_API_KEY = 'DASHSCOPE_API_KEY';
const ENV_MODEL = 'FARLAB_DASHSCOPE_MODEL';
/** Registry-informed (research/reference/models-dev-catalog.json, alibaba entry): the
 * international endpoint serves accounts provisioned outside mainland China with its
 * own key; mainland remains the default. */
const ENV_BASE_URL = 'FARLAB_DASHSCOPE_BASE_URL';

export interface DashScopeProviderOptions {
  /** Overrides DASHSCOPE_API_KEY (tests inject a fake value; real secrets never enter files/logs). */
  apiKey?: string;
  /** Overrides model selection (default qwen-plus; env override: FARLAB_DASHSCOPE_MODEL). */
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  totalTimeoutMs?: number;
}

export interface DashScopeProvider extends ModelProvider {
  readonly modelId: string;
  readonly baseUrl: string;
}

export function createDashScopeProvider(opts: DashScopeProviderOptions = {}): DashScopeProvider {
  const apiKey = opts.apiKey ?? process.env[ENV_API_KEY] ?? '';
  const modelId = opts.model ?? process.env[ENV_MODEL] ?? DASHSCOPE_DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? process.env[ENV_BASE_URL] ?? DASHSCOPE_BASE_URL;
  return {
    name: 'dashscope',
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
          authFailClosedResult({ providerName: 'dashscope', modelId, executionMode: 'live' }, req, ENV_API_KEY),
        );
      }
      return runOpenAICompatStructuredCall(
        { providerName: 'dashscope', baseUrl, apiKey, modelId, executionMode: 'live' },
        // Strict-FC tool payloads are a DeepSeek-beta capability (D-026/D-029); this route
        // stays on the json_object transport it was verified for.
        req.jsonSchema === undefined ? req : { ...req, jsonSchema: undefined },
        parse,
        { fetchImpl: opts.fetchImpl, sleep: opts.sleep, totalTimeoutMs: opts.totalTimeoutMs },
      );
    },
  };
}
