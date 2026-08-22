import type { Store } from '../persistence/store.js';
import type { ResearchRun } from '../domain/run.js';
import type { ModelProvider } from '../shared/ports.js';
import { createCustomProvider, missingConfigProvider } from '../providers/custom.js';

/**
 * Runtime model-route resolution for the user configuration layer:
 *   1. run.providerConfigId (explicitly chosen when the run was created)
 *   2. meta activeModelConfigId (the user's global default)
 *   3. caller's fallback (the env chain — FARLAB_MODEL_PROVIDER; competition/
 *      automation route, untouched)
 *
 * Rebuilt from SQLite on every makeContext — config edits (key/model/endpoint) apply
 * to the next stage of a live run and every receipt records what actually served
 * the call. A dangling config id resolves to a fail-closed provider, never to a
 * silent model swap.
 */

export const ACTIVE_MODEL_CONFIG_META_KEY = 'activeModelConfigId';

export const resolveRunProvider = (store: Store, run: ResearchRun): ModelProvider | null => {
  const configId = run.providerConfigId ?? store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  if (configId === null) return null;
  const cfg = store.getObject('model_config', configId);
  return cfg !== null ? createCustomProvider(cfg) : missingConfigProvider(configId);
};
