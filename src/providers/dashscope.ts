import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import { runOpenAICompatStructuredCall, authFailClosedResult } from './http.js';
import { capabilitiesForModel, negotiateStructuredOutput } from '../model-plane/capabilities.js';

/**
 * Alibaba Bailian (DashScope) OpenAI-compatible provider — the SUBMISSION-MANDATED route
 * (XH-202619: 千问系模型经阿里云百炼调用 + 凭证, work/model-plane/RESEARCH-competition-2026-08-24.md §A1).
 *
 * Structured-output negotiation is CAPABILITY-REGISTRY DRIVEN (2026-08-24): the official
 * qwen-structured-output doc verifies `response_format json_schema strict:true` for the
 * qwen3.7-plus / qwen3.7-max / qwen3.8-max families — those models now get server-side
 * schema enforcement (req.jsonSchema re-shaped into responseJsonSchema). Models without
 * that verification keep the json_object transport. Strict function-calling tools remain
 * a DeepSeek-beta-only capability (D-026/D-029) and stay stripped here. Fail-closed
 * without a key; live receipts are produced by the pipeline, never fabricated.
 */

export const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_DEFAULT_MODEL = 'qwen-plus';
const ENV_API_KEY = 'DASHSCOPE_API_KEY';
const ENV_MODEL = 'FARLAB_DASHSCOPE_MODEL';
/** Thinking control ('off' → explicit enable_thinking:false; see options.thinkingMode). */
const ENV_THINKING = 'FARLAB_DASHSCOPE_THINKING';
/** Registry-informed (research/reference/models-dev-catalog.json, alibaba entry): the
 * international endpoint serves accounts provisioned outside mainland China with its
 * own key; mainland remains the default. 2026-08-24: current Bailian docs document the
 * new MaaS form `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
 * (legacy global endpoint no longer appears in docs — set this env at credential time
 * to the workspace endpoint the console assigns; see research doc §B1). */
const ENV_BASE_URL = 'FARLAB_DASHSCOPE_BASE_URL';

export interface DashScopeProviderOptions {
  /** Overrides DASHSCOPE_API_KEY (tests inject a fake value; real secrets never enter files/logs). */
  apiKey?: string;
  /** Overrides model selection (default qwen-plus; env override: FARLAB_DASHSCOPE_MODEL). */
  model?: string;
  baseUrl?: string;
  /**
   * Thinking control for models whose endpoint default is thinking-ON (live-observed
   * on qwen3.8-flash: reasoning tokens on ~every call when no thinking field is sent).
   * 'off' sends enable_thinking:false explicitly; 'default' sends nothing (endpoint
   * default). Env override: FARLAB_DASHSCOPE_THINKING=off.
   */
  thinkingMode?: 'default' | 'off';
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  totalTimeoutMs?: number;
  /** Deterministic jitter seam for tests (W4-F1). */
  random?: () => number;
}

export interface DashScopeProvider extends ModelProvider {
  readonly modelId: string;
  readonly baseUrl: string;
}

export function createDashScopeProvider(opts: DashScopeProviderOptions = {}): DashScopeProvider {
  const apiKey = opts.apiKey ?? process.env[ENV_API_KEY] ?? '';
  const modelId = opts.model ?? process.env[ENV_MODEL] ?? DASHSCOPE_DEFAULT_MODEL;
  const baseUrl = opts.baseUrl ?? process.env[ENV_BASE_URL] ?? DASHSCOPE_BASE_URL;
  const thinkingOff = (opts.thinkingMode ?? (process.env[ENV_THINKING] === 'off' ? 'off' : 'default')) === 'off';
  const withThinkingOff = <T extends StructuredCallRequest>(req: T): T =>
    thinkingOff ? { ...req, disableThinking: true } : req;
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
      // Capability-registry negotiation (2026-08-24 official doc): qwen3.7-plus /
      // qwen3.7-max / qwen3.8-max families get server-enforced json_schema strict;
      // everything else stays on json_object. Either way max_tokens is stripped —
      // official docs warn it truncates structured output into invalid JSON (W7-F3),
      // and strict-tools (DeepSeek beta) remains off on this route.
      const negotiation = negotiateStructuredOutput(
        capabilitiesForModel('dashscope', modelId),
        req.jsonSchema,
      );
      return runOpenAICompatStructuredCall(
        { providerName: 'dashscope', baseUrl, apiKey, modelId, executionMode: 'live' },
        withThinkingOff(
          negotiation.mode === 'json_schema_strict'
            ? { ...req, jsonSchema: undefined, responseJsonSchema: negotiation.schema, maxTokens: undefined }
            : {
                ...req,
                jsonSchema: undefined,
                maxTokens: undefined,
              },
        ),
        parse,
        { fetchImpl: opts.fetchImpl, sleep: opts.sleep, totalTimeoutMs: opts.totalTimeoutMs, random: opts.random },
      );
    },
  };
}
