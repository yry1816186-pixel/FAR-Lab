import type { Store } from '../persistence/store.js';
import type { ReasoningStyle, ReasoningGear } from '../domain/model-config.js';
import type { ResearchRun } from '../domain/run.js';
import type { ModelProvider } from '../shared/ports.js';
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

/** Max routes in a chain (primary + declared fallbacks, cycles cut by the visited set). */
const MAX_CHAIN_ROUTES = 6;

/**
 * Flatten the declared failover chain breadth-first: primary, then ITS fallbacks in
 * declared order, then each fallback's own fallbacks — a declared fallback is never
 * silently ignored (red-team P1-2). Cycles are cut by the visited set; dangling ids
 * stop that branch without failing the rest of the chain.
 */
const buildChain = (store: Store, firstConfigId: string): ModelProviderConfigChain => {
  const firstCfg = store.getObject('model_config', firstConfigId);
  if (firstCfg === null) return { kind: 'missing', configId: firstConfigId };
  const routes: Array<{ provider: ModelProvider; configId: string }> = [];
  const seen = new Set<string>();
  const queue: string[] = [firstConfigId];
  while (queue.length > 0 && routes.length < MAX_CHAIN_ROUTES) {
    const configId = queue.shift()!;
    if (seen.has(configId)) continue;
    seen.add(configId);
    const cfg = store.getObject('model_config', configId);
    if (cfg === null) continue; // dangling id: cut this branch, keep the rest
    routes.push({ provider: createCustomProvider(cfg), configId: cfg.id });
    queue.push(...cfg.fallbackConfigIds);
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

/**
 * RU-9 GO2: the run's reasoning route — FIRST config in the resolved chain
 * that declares a reasoning capability (style+defaultGear from its config).
 * null for env builtin routes / undeclared configs = zero reasoning fields
 * on the wire (exact legacy behavior).
 */
export const resolveRunReasoningRoute = (
  store: Store,
  run: ResearchRun,
): { style: ReasoningStyle; defaultGear: ReasoningGear; modelId: string } | null => {
  const configId = run.providerConfigId ?? store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  if (configId === null) return null;
  const chain = buildChain(store, configId);
  if (chain.kind === 'missing') return null;
  for (const route of chain.routes) {
    const cfg = store.getObject('model_config', route.configId);
    if (cfg?.reasoning !== undefined) {
      return { style: cfg.reasoning.style, defaultGear: cfg.reasoning.defaultGear, modelId: cfg.modelId };
    }
  }
  return null;
};

/** Exposed for tests: the route names a resolved chain would try, in order. */
export const resolveChainNames = (store: Store, firstConfigId: string): string[] => {
  const chain = buildChain(store, firstConfigId);
  return chain.kind === 'missing' ? [`${CUSTOM_PROVIDER_PREFIX}${chain.configId}`] : chain.routes.map((r) => r.provider.name);
};
