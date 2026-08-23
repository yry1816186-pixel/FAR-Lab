import { z } from 'zod';
import {
  LIVE_PROVIDER_NAMES,
  defaultLiveProvider,
  listProviders,
} from './index.js';
import { createZaiProvider } from './zai.js';
import { createDashScopeProvider } from './dashscope.js';
import type { ModelProvider } from '../shared/ports.js';

/**
 * Product configuration layer for BUILT-IN env routes (zai/dashscope): UI-declared
 * modelId override + list pricing + default-route switch, persisted in store meta.
 * The env chain itself (FARLAB_MODEL_PROVIDER & per-provider env) stays untouched —
 * this layer sits ON TOP of it for the interactive product, exactly like mcfg does;
 * CLI/automation paths that construct providers directly keep pure env semantics.
 *
 * Pricing semantics mirror mcfg (BP-4 cost honesty): FAR-Lab ships no invented
 * price tables — cost appears only after the researcher declares real prices here.
 */

export const BuiltinRoutePrice = z.object({
  inputUsdPerMTok: z.number().min(0).max(10_000),
  outputUsdPerMTok: z.number().min(0).max(10_000),
});
export type BuiltinRoutePrice = z.infer<typeof BuiltinRoutePrice>;

export const BuiltinRouteOverride = z.object({
  /** '' is never stored — an absent modelId means "use the env/default model". */
  modelId: z.string().trim().min(1).max(200).optional(),
  pricing: BuiltinRoutePrice.optional(),
});
export type BuiltinRouteOverride = z.infer<typeof BuiltinRouteOverride>;

export const BuiltinRouteOverrides = z.object({
  zai: BuiltinRouteOverride.optional(),
  dashscope: BuiltinRouteOverride.optional(),
});
export type BuiltinRouteOverrides = z.infer<typeof BuiltinRouteOverrides>;

export const BUILTIN_OVERRIDES_META_KEY = 'builtin_route_overrides';
export const BUILTIN_DEFAULT_PROVIDER_META_KEY = 'builtin_default_provider';

/** Minimal store surface this module needs (Store satisfies both; tests may fake). */
export interface MetaReader {
  getMeta(key: string): string | null;
}
export interface MetaWriter {
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}

const EMPTY: BuiltinRouteOverrides = {};

export const readBuiltinOverrides = (store: MetaReader): BuiltinRouteOverrides => {
  const raw = store.getMeta(BUILTIN_OVERRIDES_META_KEY);
  if (raw === null) return EMPTY;
  try {
    return BuiltinRouteOverrides.parse(JSON.parse(raw));
  } catch {
    // Corrupt meta must never break the call plane: fall back to no overrides.
    return EMPTY;
  }
};

export const writeBuiltinOverrides = (store: MetaWriter, next: BuiltinRouteOverrides): void => {
  const clean = BuiltinRouteOverrides.parse(next);
  const hasAny = Object.values(clean).some((o) => o !== undefined && Object.keys(o).length > 0);
  if (!hasAny) {
    store.deleteMeta(BUILTIN_OVERRIDES_META_KEY);
    return;
  }
  store.setMeta(BUILTIN_OVERRIDES_META_KEY, JSON.stringify(clean));
};

/** Declared pricing for a built-in route (receipt provider name, e.g. 'zai'); undefined = unknown pricing. */
export const builtinPricingFor = (store: MetaReader, routeName: string): BuiltinRoutePrice | undefined =>
  readBuiltinOverrides(store)[routeName as keyof BuiltinRouteOverrides]?.pricing;

/** modelId override for a built-in route; undefined = use env/default. */
export const builtinModelIdFor = (store: MetaReader, routeName: string): string | undefined =>
  readBuiltinOverrides(store)[routeName as keyof BuiltinRouteOverrides]?.modelId;

const isLiveName = (name: string): name is (typeof LIVE_PROVIDER_NAMES)[number] =>
  (LIVE_PROVIDER_NAMES as readonly string[]).includes(name);

/** Construct a live provider with the UI modelId override applied (env model still the fallback). */
const constructLive = (name: (typeof LIVE_PROVIDER_NAMES)[number], store: MetaReader): ModelProvider => {
  const modelId = builtinModelIdFor(store, name);
  return name === 'zai'
    ? createZaiProvider(modelId === undefined ? {} : { model: modelId })
    : createDashScopeProvider(modelId === undefined ? {} : { model: modelId });
};

export interface BuiltinDefaultResolution {
  /** Effective default route name: UI meta switch > env chain > 'zai'. */
  name: (typeof LIVE_PROVIDER_NAMES)[number];
  /** Where the effective default came from — the settings panel shows this. */
  source: 'ui' | 'env';
}

/**
 * Resolve the effective built-in default route name WITHOUT constructing providers
 * (display path). Env misconfiguration is reported by the env chain at call time —
 * display never throws, it shows the underlying env default when meta is unset.
 */
export const builtinDefaultName = (store: MetaReader): BuiltinDefaultResolution => {
  const meta = store.getMeta(BUILTIN_DEFAULT_PROVIDER_META_KEY);
  if (meta !== null && isLiveName(meta)) return { name: meta, source: 'ui' };
  try {
    return { name: defaultLiveProvider().name as (typeof LIVE_PROVIDER_NAMES)[number], source: 'env' };
  } catch {
    return { name: 'zai', source: 'env' }; // env names a banned/unknown route: health owns that failure
  }
};

/** Set the UI default-route switch; null clears it back to the env chain. */
export const setBuiltinDefaultName = (store: MetaWriter, name: string | null): void => {
  if (name === null) {
    store.deleteMeta(BUILTIN_DEFAULT_PROVIDER_META_KEY);
    return;
  }
  if (!isLiveName(name)) throw new Error(`not a live built-in route: ${name}`);
  store.setMeta(BUILTIN_DEFAULT_PROVIDER_META_KEY, name);
};

/**
 * The product-plane default provider: UI default switch > env chain, then the UI
 * modelId override for whichever route wins. Throws only when the env chain itself
 * is misconfigured AND no UI switch exists (same failure as defaultLiveProvider).
 */
export const resolveBuiltinProvider = (store: MetaReader): ModelProvider => {
  const { name } = builtinDefaultName(store);
  return constructLive(name, store);
};

/** Pure-env modelId for a live route (display: what the override sits on top of). */
export const envModelIdFor = (routeName: string): string =>
  listProviders().find((p) => p.name === routeName)?.modelId ?? '(unknown)';
