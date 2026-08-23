import type { Store } from '../persistence/store.js';
import { CUSTOM_PROVIDER_PREFIX } from '../providers/custom.js';
import { readBuiltinOverrides } from '../providers/builtin-overrides.js';

/**
 * BP-4 usage/cost ledger. Receipts are the only authority (same rule as the token
 * budget): every aggregate below is derived from persisted model_call receipts, so a
 * resumed/audited run re-derives identical numbers.
 *
 * Cost honesty rule: FAR-Lab ships NO invented price tables. Cost is computed ONLY
 * from prices the researcher declared in the product layer — a custom config's
 * ModelProviderConfig.pricing, or a built-in route's UI-declared pricing
 * (builtin-overrides.ts); everything else reports tokens + pricingBasis 'unknown' —
 * an unknown price is displayed as unknown, never estimated to zero or guessed.
 */

export type PricingBasis = 'user-configured' | 'unknown';

export interface UsageAggregate {
  /** Receipt provider name (e.g. 'zai', 'custom:mcfg_x'). */
  provider: string;
  modelId: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  pricingBasis: PricingBasis;
}

interface DeclaredPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

const roundCost = (usd: number): number => Math.round(usd * 1e6) / 1e6;

/**
 * Price lookup by receipt provider name, read once per aggregation:
 * 'custom:<id>' -> that config's declared pricing; a built-in route name
 * ('zai'/'dashscope') -> its UI-declared pricing. Anything else -> undefined.
 */
const priceResolver = (store: Store): ((providerName: string) => DeclaredPrice | undefined) => {
  const mcfg = new Map<string, DeclaredPrice>();
  for (const cfg of store.listObjects('model_config', '__none__')) {
    if (cfg.pricing !== undefined) mcfg.set(cfg.id, cfg.pricing);
  }
  const builtin = readBuiltinOverrides(store);
  return (providerName) =>
    providerName.startsWith(CUSTOM_PROVIDER_PREFIX)
      ? mcfg.get(providerName.slice(CUSTOM_PROVIDER_PREFIX.length))
      : builtin[providerName as keyof typeof builtin]?.pricing;
};

const costOf = (price: DeclaredPrice, promptTokens: number, completionTokens: number): number =>
  roundCost((promptTokens / 1e6) * price.inputUsdPerMTok + (completionTokens / 1e6) * price.outputUsdPerMTok);

/** Aggregate model-call receipts for one run, grouped by (provider, modelId). */
export const aggregateRunUsage = (store: Store, runId: string): UsageAggregate[] => {
  const priceOf = priceResolver(store);
  const byKey = new Map<string, UsageAggregate>();
  for (const r of store.listObjects('receipt', runId)) {
    const mc = r.modelCall;
    if (mc === undefined) continue;
    const key = `${mc.provider}\u0000${mc.modelId}`;
    let agg = byKey.get(key);
    if (agg === undefined) {
      agg = {
        provider: mc.provider,
        modelId: mc.modelId,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: null,
        pricingBasis: priceOf(mc.provider) !== undefined ? 'user-configured' : 'unknown',
      };
      byKey.set(key, agg);
    }
    agg.calls += 1;
    agg.promptTokens += mc.usage.promptTokens ?? 0;
    agg.completionTokens += mc.usage.completionTokens ?? 0;
    agg.totalTokens += mc.usage.totalTokens ?? (mc.usage.promptTokens ?? 0) + (mc.usage.completionTokens ?? 0);
  }
  for (const agg of byKey.values()) {
    const p = priceOf(agg.provider);
    if (p !== undefined) agg.costUsd = costOf(p, agg.promptTokens, agg.completionTokens);
  }
  return [...byKey.values()].sort((a, b) => b.totalTokens - a.totalTokens);
};

/** Workspace-wide usage across ALL runs (the settings dashboard surface). */
export const aggregateWorkspaceUsage = (store: Store): UsageAggregate[] => {
  const priceOf = priceResolver(store);
  const byKey = new Map<string, UsageAggregate>();
  for (const runSummary of store.listRuns(100_000)) {
    for (const agg of aggregateRunUsage(store, runSummary.id)) {
      const key = `${agg.provider}\u0000${agg.modelId}`;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, { ...agg });
      } else {
        existing.calls += agg.calls;
        existing.promptTokens += agg.promptTokens;
        existing.completionTokens += agg.completionTokens;
        existing.totalTokens += agg.totalTokens;
        existing.costUsd = agg.costUsd !== null ? (existing.costUsd ?? 0) + agg.costUsd : existing.costUsd;
      }
    }
  }
  // re-price merged rows (cost merging above assumed same key -> same pricing basis)
  for (const agg of byKey.values()) {
    const p = priceOf(agg.provider);
    agg.costUsd = p !== undefined ? costOf(p, agg.promptTokens, agg.completionTokens) : null;
    agg.pricingBasis = p !== undefined ? 'user-configured' : 'unknown';
  }
  return [...byKey.values()].sort((a, b) => b.totalTokens - a.totalTokens);
};
