import type { Store } from '../persistence/store.js';
import type { ResearchRun } from '../domain/run.js';
import type { ModelProvider } from '../shared/ports.js';
import type { ModelProviderConfig } from '../domain/model-config.js';
import { createCustomProvider, missingConfigProvider, CUSTOM_PROVIDER_PREFIX } from '../providers/custom.js';
import { createFallbackProvider } from '../providers/fallback.js';

/**
 * Runtime model-route resolution for the user configuration layer:
 *   1. run.providerConfigId (explicitly chosen when the run was created)
 *   2. meta activeModelConfigId (the user's global default)
 *   3. caller's fallback (the env chain — FARLAB_MODEL_PROVIDER; competition/
 *      automation route, untouched)
 *
 * Rebuilt from SQLite on every makeContext — config edits (key/model/endpoint) apply
 * to the next stage of a live run and every receipt records what actually served the
 * call. A dangling config id resolves to a fail-closed provider, never to a
 * silent model swap.
 *
 * BP-4: when the resolved config declares fallbackConfigIds, the returned provider is
 * a failover CHAIN (primary first, then its fallbacks, cycles cut, depth-bounded).
 * A config without fallbacks resolves exactly as before — opt-in behavior change.
 */

export const ACTIVE_MODEL_CONFIG_META_KEY = 'activeModelConfigId';

/** Max routes in a chain: primary + 4 declared fallbacks (schema max) — cycles are cut, not errors. */
const buildChain = (store: Store, firstConfigId: string): ModelProviderConfigChain => {
  const routes: Array<{ provider: ModelProvider; configId: string }> = [];
  const seen = new Set<string>();
  let currentId: string | null = firstConfigId;
  while (currentId !== null && !seen.has(currentId) && routes.length < 5) {
    seen.add(currentId);
    const cfg: ModelProviderConfig | null = store.getObject('model_config', currentId);
    if (cfg === null) {
      if (routes.length === 0) return { kind: 'missing', configId: firstConfigId };
      break; // dangling fallback id: cut the chain here, keep what resolved
    }
    routes.push({ provider: createCustomProvider(cfg), configId: cfg.id });
    currentId = cfg.fallbackConfigIds.length > 0 ? cfg.fallbackConfigIds[0]! : null;
  }
  return { kind: 'routes', routes };
};

type ModelProviderConfigChain =
  | { kind: 'routes'; routes: Array<{ provider: ModelProvider; configId: string }> }
  | { kind: 'missing'; configId: string };

export const resolveRunProvider = (store: Store, run: ResearchRun): ModelProvider | null => {
  const configId = run.providerConfigId ?? store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  if (configId === null) return null;
  const chain = buildChain(store, configId);
  if (chain.kind === 'missing') return missingConfigProvider(configId);
  if (chain.routes.length === 1) return chain.routes[0]!.provider;
  return createFallbackProvider(chain.routes);
};

/** Exposed for tests: the route names a resolved chain would try, in order. */
export const resolveChainNames = (store: Store, firstConfigId: string): string[] => {
  const chain = buildChain(store, firstConfigId);
  return chain.kind === 'missing' ? [`${CUSTOM_PROVIDER_PREFIX}${chain.configId}`] : chain.routes.map((r) => r.provider.name);
};
