import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import type { ModelProviderConfig } from '../domain/model-config.js';
import {
  authFailClosedResult,
  runOpenAICompatStructuredCall,
  type FetchLike,
  type SleepLike,
} from './http.js';
import { createOfflineDevProvider } from './offline.js';

/**
 * User-defined model route: a thin generalization of the zai (anthropic wire),
 * dashscope (openai wire) and gemini-native adapters around the shared transport
 * core. The provider name is `custom:<configId>` so every receipt's
 * modelCall.provider traces back to the exact stored configuration, stable across
 * label edits.
 *
 * NOT part of the provider registry (LIVE_PROVIDER_NAMES / getProvider stay a closed
 * set): custom routes are constructed per-run/per-active-config from SQLite, never
 * selected via FARLAB_MODEL_PROVIDER.
 */

export const CUSTOM_PROVIDER_PREFIX = 'custom:';

export interface CustomProviderOptions {
  fetchImpl?: FetchLike;
  sleep?: SleepLike;
  totalTimeoutMs?: number;
  /** Deterministic jitter seam for tests. */
  random?: () => number;
}

/** Live-transport wires (the transport core implements exactly these). */
type LiveWire = Exclude<ModelProviderConfig['wire'], 'offline'>;

const liveWireOf = (w: ModelProviderConfig['wire']): LiveWire | null => {
  switch (w) {
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'gemini':
      return 'gemini';
    default:
      return null; // 'offline': deterministic in-process route, not a transport wire
  }
};

export const createCustomProvider = (
  cfg: ModelProviderConfig,
  opts: CustomProviderOptions = {},
): ModelProvider => {
  const name = `${CUSTOM_PROVIDER_PREFIX}${cfg.id}`;
  return {
    name,
    // An offline route needs no credentials; live routes need their key.
    liveReady: cfg.wire === 'offline' ? true : cfg.apiKey.length > 0,
    structuredCall<T>(
      req: StructuredCallRequest,
      parse: (raw: unknown) => T | Error,
    ): Promise<StructuredCallResult<T>> {
      const wire = liveWireOf(cfg.wire);
      if (wire === null) {
        // OFFLINE_DEVELOPMENT wire: deterministic in-process route — no network,
        // no key, every receipt executionMode 'test' (providers/offline.ts).
        return createOfflineDevProvider(cfg).structuredCall(req, parse);
      }
      if (cfg.apiKey.length === 0) {
        // Fail closed: no key -> no network, no fabricated output (same rule as zai/dashscope).
        return Promise.resolve(
          authFailClosedResult(
            { providerName: name, modelId: cfg.modelId, executionMode: 'live' },
            req,
            `apiKey of model config "${cfg.label}"`,
          ),
        );
      }
      // Anthropic Messages and Gemini generateContent wires have no OpenAI
      // tools/response_format concepts — same strip as zai (JSON-mode + prompt
      // contract carry the output shape; the caller's zod parse stays the authority).
      const needsStrip = wire !== 'openai' && req.jsonSchema !== undefined;
      const effective = needsStrip ? { ...req, jsonSchema: undefined } : req;
      return runOpenAICompatStructuredCall(
        { providerName: name, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, modelId: cfg.modelId, executionMode: 'live', wire },
        effective,
        parse,
        { fetchImpl: opts.fetchImpl, sleep: opts.sleep, totalTimeoutMs: opts.totalTimeoutMs, random: opts.random },
      );
    },
  };
};

/**
 * A run points at a configuration that no longer exists (deleted after the run was
 * created). Fail closed at every model call instead of silently falling back to the
 * env-chain provider — swapping models under a running pipeline would corrupt
 * reproducibility while looking healthy.
 */
export const missingConfigProvider = (configId: string): ModelProvider => ({
  name: `${CUSTOM_PROVIDER_PREFIX}${configId}`,
  liveReady: false,
  structuredCall<T>(req: StructuredCallRequest): Promise<StructuredCallResult<T>> {
    return Promise.resolve(
      authFailClosedResult(
        { providerName: `${CUSTOM_PROVIDER_PREFIX}${configId}`, modelId: '(config deleted)', executionMode: 'live' },
        req,
        `model config ${configId} (deleted while run references it)`,
      ),
    );
  },
});
