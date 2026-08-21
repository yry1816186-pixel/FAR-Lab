import type { ModelProvider } from '../shared/ports.js';
import { createDeepSeekProvider } from './deepseek.js';
import { createZaiProvider } from './zai.js';
import { createTestStubProvider } from './test-stub.js';

/**
 * Model Execution Plane registry.
 *
 * Live providers are constructed from the real environment at call time (env is
 * read once per getProvider call — cheap, and keeps liveReady truthful for
 * freshly-provided credentials). The TEST-ONLY stub is listed for discovery but
 * `defaultLiveProvider()` refuses to select it or any unknown name — no silent
 * fallback, ever.
 */

export const LIVE_PROVIDER_NAMES = ['deepseek', 'zai'] as const;
export type LiveProviderName = (typeof LIVE_PROVIDER_NAMES)[number];
export const DEFAULT_LIVE_PROVIDER: LiveProviderName = 'deepseek';
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
 * Resolve a provider by name ('deepseek' | 'zai' | 'test-stub'), or undefined.
 * Note: 'test-stub' resolves to an EMPTY script — its first call throws a
 * script-exhausted error by design. Tests should construct scripted stubs via
 * createTestStubProvider(steps) directly.
 */
export function getProvider(name: string): ModelProvider | undefined {
  switch (name.trim().toLowerCase()) {
    case 'deepseek':
      return createDeepSeekProvider();
    case 'zai':
      return createZaiProvider();
    case TEST_STUB_PROVIDER_NAME:
      return createTestStubProvider([]);
    default:
      return undefined;
  }
}

/**
 * The default live provider: env FARLAB_MODEL_PROVIDER, default 'deepseek'
 * (W0-spike-verified live route). Throws on unknown or TEST-ONLY names instead
 * of falling back — misconfiguration must be visible, not papered over.
 */
export function defaultLiveProvider(): ModelProvider {
  const configured = (process.env[ENV_PROVIDER] ?? DEFAULT_LIVE_PROVIDER).trim().toLowerCase();
  if (configured === TEST_STUB_PROVIDER_NAME || !LIVE_PROVIDER_NAMES.includes(configured as LiveProviderName)) {
    throw new Error(
      `${ENV_PROVIDER}="${configured}" does not name a live provider ` +
        `(live options: ${LIVE_PROVIDER_NAMES.join(', ')}; default: ${DEFAULT_LIVE_PROVIDER}); refusing silent fallback`,
    );
  }
  return configured === 'zai' ? createZaiProvider() : createDeepSeekProvider();
}

/** Discovery view of the plane (no secrets: env var NAMES only, never values). */
export function listProviders(): ProviderInfo[] {
  const ds = createDeepSeekProvider();
  const zai = createZaiProvider();
  return [
    {
      name: 'deepseek',
      kind: 'live',
      liveReady: ds.liveReady,
      modelId: ds.modelId,
      baseUrl: ds.baseUrl,
      apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    },
    {
      name: 'zai',
      kind: 'live',
      liveReady: zai.liveReady,
      modelId: zai.modelId,
      baseUrl: zai.baseUrl,
      apiKeyEnvVar: 'ZHIPU_API_KEY',
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
