import type { Store } from '../persistence/store.js';
import { CUSTOM_PROVIDER_PREFIX } from '../providers/custom.js';

/**
 * BP-4 usage/cost ledger. Receipts are the only authority (same rule as the token
 * budget): every aggregate below is derived from persisted model_call receipts, so a
 * resumed/audited run re-derives identical numbers.
 *
 * Cost honesty rule: FAR-Lab ships NO invented price tables. Cost is computed ONLY
 * when the researcher declared that config's real list pricing (ModelProviderConfig.
 * pricing); everything else reports tokens + pricingBasis 'unknown' — an unknown
 * price is displayed as unknown, never estimated to zero or guessed.
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

const roundCost = (usd: number): number => Math.round(usd * 1e6) / 1e6;

/** Aggregate model-call receipts for one run, grouped by (provider, modelId). */
export const aggregateRunUsage = (store: Store, runId: string): UsageAggregate[] => {
  const pricing = pricingByConfigId(store);
  const byKey = new Map<string, UsageAggregate>();
  for (const r of store.listObjects('receipt', runId)) {
    const mc = r.modelCall;
    if (mc === undefined) continue;
    const key = `${mc.provider}\u0000${mc.modelId}`;
    let agg = byKey.get(key);
    if (agg === undefined) {
      const cfgPricing = mc.provider.startsWith(CUSTOM_PROVIDER_PREFIX)
        ? pricing.get(mc.provider.slice(CUSTOM_PROVIDER_PREFIX.length))
        : undefined;
      agg = {
        provider: mc.provider,
        modelId: mc.modelId,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: null,
        pricingBasis: cfgPricing !== undefined ? 'user-configured' : 'unknown',
      };
      byKey.set(key, agg);
    }
    agg.calls += 1;
    agg.promptTokens += mc.usage.promptTokens ?? 0;
    agg.completionTokens += mc.usage.completionTokens ?? 0;
    agg.totalTokens += mc.usage.totalTokens ?? (mc.usage.promptTokens ?? 0) + (mc.usage.completionTokens ?? 0);
  }
  for (const agg of byKey.values()) {
    const p = agg.provider.startsWith(CUSTOM_PROVIDER_PREFIX)
      ? pricing.get(agg.provider.slice(CUSTOM_PROVIDER_PREFIX.length))
      : undefined;
    if (p !== undefined) {
      agg.costUsd = roundCost(
        (agg.promptTokens / 1e6) * p.inputUsdPerMTok + (agg.completionTokens / 1e6) * p.outputUsdPerMTok,
      );
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalTokens - a.totalTokens);
};

/** Workspace-wide usage across ALL runs (the settings dashboard surface). */
export const aggregateWorkspaceUsage = (store: Store): UsageAggregate[] => {
  const pricing = pricingByConfigId(store);
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
    const p = agg.provider.startsWith(CUSTOM_PROVIDER_PREFIX)
      ? pricing.get(agg.provider.slice(CUSTOM_PROVIDER_PREFIX.length))
      : undefined;
    agg.costUsd = p !== undefined
      ? roundCost((agg.promptTokens / 1e6) * p.inputUsdPerMTok + (agg.completionTokens / 1e6) * p.outputUsdPerMTok)
      : null;
    agg.pricingBasis = p !== undefined ? 'user-configured' : 'unknown';
  }
  return [...byKey.values()].sort((a, b) => b.totalTokens - a.totalTokens);
};

const pricingByConfigId = (store: Store): Map<string, { inputUsdPerMTok: number; outputUsdPerMTok: number }> => {
  const map = new Map<string, { inputUsdPerMTok: number; outputUsdPerMTok: number }>();
  for (const cfg of store.listObjects('model_config', '__none__')) {
    if (cfg.pricing !== undefined) map.set(cfg.id, cfg.pricing);
  }
  return map;
};
