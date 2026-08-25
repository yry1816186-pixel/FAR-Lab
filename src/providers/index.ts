import type { ModelProvider } from '../shared/ports.js';
import { createZaiProvider } from './zai.js';
import { createDashScopeProvider } from './dashscope.js';
import { createDeepSeekProvider } from './deepseek.js';
import { createUniversalProvider, UNIVERSAL_PROVIDER_NAME, ENV_BASE_URL, ENV_MODEL, ENV_API_KEY, ENV_WIRE } from './universal.js';
import { createTestStubProvider } from './test-stub.js';

/**
 * Model Execution Plane registry (OPEN SET, user directive 2026-08-26: the product
 * freely routes to ALL models worldwide — no vendor bans, no closed national set).
 *
 * Built-in names are CONVENIENCE adapters over the shared transport core:
 *   - 'zai'        Zhipu GLM via the Anthropic-compatible endpoint (funded dev route)
 *   - 'dashscope'  Alibaba Bailian Qwen via the OpenAI-compatible mode
 *   - 'deepseek'   DeepSeek via the OpenAI wire (unbanned 2026-08-26)
 *   - 'universal'  ANY endpoint on earth — wire/baseUrl/model/key all from
 *                  FARLAB_UNIVERSAL_* env (openai|anthropic|gemini wires)
 * Beyond these, the product layer (UI custom configs, custom:<mcfg id>) constructs
 * unlimited per-researcher routes to any endpoint — the registry never was and is
 * not a capability whitelist.
 *
 * Live providers are constructed from the real environment at call time (env is
 * read once per getProvider call — cheap, and keeps liveReady truthful for
 * freshly-provided credentials). The TEST-ONLY stub is listed for discovery but
 * `defaultLiveProvider()` refuses to select it or any unknown name — no silent
 * fallback, ever.
 */

export const LIVE_PROVIDER_NAMES = ['zai', 'dashscope', 'deepseek', 'universal'] as const;
export type LiveProviderName = (typeof LIVE_PROVIDER_NAMES)[number];
export const DEFAULT_LIVE_PROVIDER: LiveProviderName = 'zai';
export const TEST_STUB_PROVIDER_NAME = 'test-stub';
const ENV_PROVIDER = 'FARLAB_MODEL_PROVIDER';

export interface ProviderInfo {
  name: string;
  kind: 'live' | 'test';
  liveReady: boolean;
  modelId: string;
  baseUrl: string;
  apiKeyEnvVar: string;
}

/**
 * Resolve a provider by name ('zai' | 'dashscope' | 'deepseek' | 'universal' |
 * 'test-stub'), or undefined. Note: 'test-stub' resolves to an EMPTY script — its
 * first call throws a script-exhausted error by design. Tests should construct
 * scripted stubs via createTestStubProvider(steps) directly.
 */
export function getProvider(name: string): ModelProvider | undefined {
  switch (name.trim().toLowerCase()) {
    case 'zai':
      return createZaiProvider();
    case 'dashscope':
      return createDashScopeProvider();
    case 'deepseek':
      return createDeepSeekProvider();
    case UNIVERSAL_PROVIDER_NAME:
      return createUniversalProvider();
    case TEST_STUB_PROVIDER_NAME:
      return createTestStubProvider([]);
    default:
      return undefined;
  }
}

/**
 * The default live provider: env FARLAB_MODEL_PROVIDER (any built-in live name,
 * default 'zai'). Throws on unknown or TEST-ONLY names instead of falling back —
 * misconfiguration must be visible, not papered over. For an arbitrary endpoint
 * not covered by a convenience name, set FARLAB_MODEL_PROVIDER=universal and drive
 * it with the FARLAB_UNIVERSAL_* env (or skip the env chain entirely and use a UI
 * custom config, which accepts every endpoint).
 */
export function defaultLiveProvider(): ModelProvider {
  const configured = (process.env[ENV_PROVIDER] ?? DEFAULT_LIVE_PROVIDER).trim().toLowerCase();
  if (configured === TEST_STUB_PROVIDER_NAME || !LIVE_PROVIDER_NAMES.includes(configured as LiveProviderName)) {
    throw new Error(
      `${ENV_PROVIDER}="${configured}" does not name a live provider ` +
        `(live options: ${LIVE_PROVIDER_NAMES.join(', ')}; default: ${DEFAULT_LIVE_PROVIDER}); ` +
        `refusing silent fallback`,
    );
  }
  return getProvider(configured)!;
}

/** Discovery view of the plane (no secrets: env var NAMES only, never values). */
export function listProviders(): ProviderInfo[] {
  const zai = createZaiProvider();
  const bailian = createDashScopeProvider();
  const deepseek = createDeepSeekProvider();
  const universal = createUniversalProvider();
  return [
    {
      name: 'zai',
      kind: 'live',
      liveReady: zai.liveReady,
      modelId: zai.modelId,
      baseUrl: zai.baseUrl,
      apiKeyEnvVar: 'ZAI_API_KEY (legacy ZHIPU_API_KEY)',
    },
    {
      name: 'dashscope',
      kind: 'live',
      liveReady: bailian.liveReady,
      modelId: bailian.modelId,
      baseUrl: bailian.baseUrl,
      apiKeyEnvVar: 'DASHSCOPE_API_KEY',
    },
    {
      name: 'deepseek',
      kind: 'live',
      liveReady: deepseek.liveReady,
      modelId: deepseek.modelId,
      baseUrl: deepseek.baseUrl,
      apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    },
    {
      name: UNIVERSAL_PROVIDER_NAME,
      kind: 'live',
      liveReady: universal.liveReady,
      modelId: universal.modelId,
      baseUrl: universal.baseUrl,
      apiKeyEnvVar: `${ENV_API_KEY} (wire: ${ENV_WIRE}; route: ${ENV_BASE_URL} + ${ENV_MODEL})`,
    },
    {
      name: TEST_STUB_PROVIDER_NAME,
      kind: 'test',
      liveReady: false,
      modelId: '(scripted)',
      baseUrl: '(in-process)',
      apiKeyEnvVar: '(none — TEST-ONLY)',
    },
  ];
}
