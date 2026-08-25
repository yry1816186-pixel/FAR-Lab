import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import type { ProviderWireProtocol } from '../domain/model-config.js';
import {
  authFailClosedResult,
  runOpenAICompatStructuredCall,
  type FetchLike,
  type SleepLike,
} from './http.js';

/**
 * UNIVERSAL live adapter (user directive 2026-08-26: the product freely routes to
 * ANY model worldwide, any protocol). A single env-driven route pointing at any
 * endpoint on earth:
 *
 *   FARLAB_UNIVERSAL_WIRE     openai | anthropic | gemini   (default: openai)
 *   FARLAB_UNIVERSAL_BASE_URL e.g. https://api.openai.com/v1, https://api.anthropic.com,
 *                             https://generativelanguage.googleapis.com, an OpenRouter/
 *                             Groq/Mistral/Together/xAI/vLLM/Ollama/… base, anything
 *   FARLAB_UNIVERSAL_MODEL    the exact model id the endpoint serves
 *   FARLAB_UNIVERSAL_API_KEY  the endpoint credential
 *
 * liveReady only when ALL FOUR are resolvable (wire defaults count as resolved);
 * a missing piece fails closed with the exact env var named — never a silent
 * fallback to some other route. This is the env-chain twin of the UI custom-config
 * layer (custom:<id>): same transport core, same three wires, no vendor list.
 */

export const UNIVERSAL_PROVIDER_NAME = 'universal';
export const ENV_WIRE = 'FARLAB_UNIVERSAL_WIRE';
export const ENV_BASE_URL = 'FARLAB_UNIVERSAL_BASE_URL';
export const ENV_MODEL = 'FARLAB_UNIVERSAL_MODEL';
export const ENV_API_KEY = 'FARLAB_UNIVERSAL_API_KEY';

const WIRES: readonly ProviderWireProtocol[] = ['openai', 'anthropic', 'gemini'];

export interface UniversalProviderOptions {
  /** Overrides the env chain (tests inject fakes; builtin-route UI override sits here). */
  wire?: ProviderWireProtocol;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchLike;
  sleep?: SleepLike;
  totalTimeoutMs?: number;
  /** Deterministic jitter seam for tests. */
  random?: () => number;
}

export interface UniversalProvider extends ModelProvider {
  readonly modelId: string;
  readonly baseUrl: string;
  /** Absent when FARLAB_UNIVERSAL_WIRE held an unparseable value (liveReady false). */
  readonly wire?: ProviderWireProtocol;
}

export function createUniversalProvider(opts: UniversalProviderOptions = {}): UniversalProvider {
  const wireRaw = opts.wire ?? process.env[ENV_WIRE] ?? 'openai';
  const wire = (WIRES as readonly string[]).includes(wireRaw.trim().toLowerCase())
    ? (wireRaw.trim().toLowerCase() as ProviderWireProtocol)
    : null;
  const baseUrl = opts.baseUrl ?? process.env[ENV_BASE_URL] ?? '';
  const modelId = opts.model ?? process.env[ENV_MODEL] ?? '';
  const apiKey = opts.apiKey ?? process.env[ENV_API_KEY] ?? '';

  const missing: string[] = [];
  if (wire === null) missing.push(`${ENV_WIRE} (must be openai|anthropic|gemini, got "${wireRaw}")`);
  if (baseUrl.length === 0) missing.push(ENV_BASE_URL);
  if (modelId.length === 0) missing.push(ENV_MODEL);
  if (apiKey.length === 0) missing.push(ENV_API_KEY);
  const ready = missing.length === 0;

  return {
    name: UNIVERSAL_PROVIDER_NAME,
    liveReady: ready,
    modelId: modelId.length > 0 ? modelId : '(unset)',
    baseUrl: baseUrl.length > 0 ? baseUrl : '(unset)',
    ...(wire !== null ? { wire } : {}),
    structuredCall<T>(
      req: StructuredCallRequest,
      parse: (raw: unknown) => T | Error,
    ): Promise<StructuredCallResult<T>> {
      if (!ready || wire === null) {
        // Fail closed: name EVERY missing env var so misconfiguration is actionable.
        return Promise.resolve(
          authFailClosedResult(
            { providerName: UNIVERSAL_PROVIDER_NAME, modelId: modelId.length > 0 ? modelId : '(unset)', executionMode: 'live' },
            req,
            missing.join(', '),
          ),
        );
      }
      // Non-openai wires have no OpenAI tools/response_format concepts — strip the
      // strict-FC projection (same policy as zai/custom.ts; JSON mode + prompt
      // contract carry the output shape on anthropic/gemini wires).
      const needsStrip = wire !== 'openai' && req.jsonSchema !== undefined;
      const effective = needsStrip ? { ...req, jsonSchema: undefined } : req;
      return runOpenAICompatStructuredCall(
        { providerName: UNIVERSAL_PROVIDER_NAME, baseUrl, apiKey, modelId, executionMode: 'live', wire },
        effective,
        parse,
        { fetchImpl: opts.fetchImpl, sleep: opts.sleep, totalTimeoutMs: opts.totalTimeoutMs, random: opts.random },
      );
    },
  };
}
