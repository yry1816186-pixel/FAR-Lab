import type { ModelProvider } from '../shared/ports.js';
import { createZaiProvider } from './zai.js';
import { createDashScopeProvider } from './dashscope.js';
import { createTestStubProvider } from './test-stub.js';

/**
 * Model Execution Plane registry.
 *
 * Live providers are constructed from the real environment at call time (env is
 * read once per getProvider call — cheap, and keeps liveReady truthful for
 * freshly-provided credentials). The TEST-ONLY stub is listed for discovery but
 * `defaultLiveProvider()` refuses to select it or any unknown name — no silent
 * fallback, ever.
 *
 * DEEPSEEK BAN (user directive 2026-08-22, permanent): no DeepSeek model may be
 * used anywhere in this project. 'deepseek' is REMOVED from the live set — explicit
 * selection fails visibly. The adapter file remains only as an archived, unreachable
 * module documenting the historical (pre-ban) live route for old eval provenance.
 */

export const LIVE_PROVIDER_NAMES = ['zai', 'dashscope'] as const;
export type LiveProviderName = (typeof LIVE_PROVIDER_NAMES)[number];
export const DEFAULT_LIVE_PROVIDER: LiveProviderName = 'zai';
export const TEST_STUB_PROVIDER_NAME = 'test-stub';
const ENV_PROVIDER = 'FARLAB_MODEL_PROVIDER';

export interface ProviderInfo {
  name: string;
  kind: 'live' | 'test' | 'archived';
  liveReady: boolean;
  modelId: string;
  baseUrl: string;
  apiKeyEnvVar: string;
}

/**
 * Resolve a provider by name ('zai' | 'dashscope' | 'test-stub'), or undefined.
 * Note: 'test-stub' resolves to an EMPTY script — its first call throws a
 * script-exhausted error by design. Tests should construct scripted stubs via
 * createTestStubProvider(steps) directly.
 */
export function getProvider(name: string): ModelProvider | undefined {
  switch (name.trim().toLowerCase()) {
    case 'zai':
      return createZaiProvider();
    case 'dashscope':
      return createDashScopeProvider();
    case TEST_STUB_PROVIDER_NAME:
      return createTestStubProvider([]);
    default:
      // includes 'deepseek' — banned (user directive 2026-08-22); resolves to nothing
      return undefined;
  }
}

/**
 * The default live provider: env FARLAB_MODEL_PROVIDER, default 'zai' (Zhipu GLM via
 * the Anthropic-compatible endpoint on open.bigmodel.cn — the funded live route after
 * the DeepSeek ban). Throws on unknown, TEST-ONLY, or banned names instead of falling
 * back — misconfiguration must be visible, not papered over.
 */
export function defaultLiveProvider(): ModelProvider {
  const configured = (process.env[ENV_PROVIDER] ?? DEFAULT_LIVE_PROVIDER).trim().toLowerCase();
  if (configured === TEST_STUB_PROVIDER_NAME || !LIVE_PROVIDER_NAMES.includes(configured as LiveProviderName)) {
    throw new Error(
      `${ENV_PROVIDER}="${configured}" does not name a live provider ` +
        `(live options: ${LIVE_PROVIDER_NAMES.join(', ')}; default: ${DEFAULT_LIVE_PROVIDER}` +
        `${configured === 'deepseek' ? '; deepseek is BANNED in this project by user directive' : ''}); refusing silent fallback`,
    );
  }
  return configured === 'zai' ? createZaiProvider() : createDashScopeProvider();
}

/** Discovery view of the plane (no secrets: env var NAMES only, never values). */
export function listProviders(): ProviderInfo[] {
  const zai = createZaiProvider();
  const bailian = createDashScopeProvider();
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
      kind: 'archived',
      liveReady: false,
      modelId: '(banned 2026-08-22)',
      baseUrl: '(unreachable)',
      apiKeyEnvVar: '(banned — user directive)',
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
