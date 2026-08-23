import type { Store } from '../persistence/store.js';
import type { ModelProvider, StructuredCallRequest, StructuredCallResult } from '../shared/ports.js';
import { aggregateWorkspaceUsage } from './usage-ledger.js';

/**
 * Workspace spend limit (gap R5): a researcher-declared USD ceiling over ALL
 * priced model calls. Semantics chosen for product honesty:
 *  - The ceiling counts ONLY receipts on routes with declared pricing
 *    (BP-4 no-invented-prices rule); unpriced calls are reported as a count,
 *    never estimated to zero — the limit covers exactly what the researcher
 *    can see in cost terms.
 *  - Enforcement is fail-closed at the provider boundary: once spentUsd has
 *    reached the ceiling, every further structuredCall returns a
 *    quota_exceeded result (retryable: false). No in-flight approval flow —
 *    pipeline stages run unattended; a gate that waits for a human would hang
 *    the run. Raising the ceiling (or clearing it) unblocks immediately.
 *  - The gate re-reads the limit and the ledger on EVERY call: settings edits
 *    apply to the next stage of a live run, mirroring mcfg/builtin semantics.
 */

export const SPEND_LIMIT_META_KEY = 'workspace_spend_limit_usd';

export interface SpendStatus {
  /** Researcher-declared ceiling in USD; null = unlimited (default). */
  limitUsd: number | null;
  /** Sum of priced receipt costs across the workspace (USD). */
  spentUsd: number;
  /** Calls on routes without declared pricing (excluded from spentUsd, honestly). */
  unpricedCalls: number;
}

export const readSpendLimit = (store: Store): number | null => {
  const raw = store.getMeta(SPEND_LIMIT_META_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const writeSpendLimit = (store: Store, maxUsd: number | null): void => {
  if (maxUsd === null) {
    store.deleteMeta(SPEND_LIMIT_META_KEY);
    return;
  }
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
    throw new Error(`spend limit must be a positive USD number or null (got ${String(maxUsd)})`);
  }
  store.setMeta(SPEND_LIMIT_META_KEY, String(maxUsd));
};

export const workspaceSpendStatus = (store: Store): SpendStatus => {
  let spentUsd = 0;
  let unpricedCalls = 0;
  for (const agg of aggregateWorkspaceUsage(store)) {
    if (agg.costUsd !== null) spentUsd += agg.costUsd;
    else unpricedCalls += agg.calls;
  }
  return {
    limitUsd: readSpendLimit(store),
    spentUsd: Math.round(spentUsd * 1e6) / 1e6,
    unpricedCalls,
  };
};

const exceededMessage = (status: SpendStatus): string =>
  `workspace spend limit reached: $${status.spentUsd.toFixed(2)} spent of $${(status.limitUsd ?? 0).toFixed(2)} declared — failing closed (quota_exceeded); raise or clear the limit in settings to continue`;

/**
 * Wrap a provider with the spend gate. The wrapper is transparent while the
 * workspace is under its ceiling (or unlimited) and returns a fail-closed
 * quota_exceeded result once it is reached. Receipt identity stays the inner
 * provider's — the gate never fabricates a model call.
 */
export const withSpendGate = (store: Store, inner: ModelProvider): ModelProvider => ({
  name: inner.name,
  get liveReady() { return inner.liveReady; },
  structuredCall<T>(
    req: StructuredCallRequest,
    parse: (raw: unknown) => T | Error,
  ): Promise<StructuredCallResult<T>> {
    const status = workspaceSpendStatus(store);
    if (status.limitUsd !== null && status.spentUsd >= status.limitUsd) {
      return Promise.resolve({
        ok: false,
        error: {
          kind: 'quota_exceeded',
          message: exceededMessage(status),
          retryable: false,
        },
        receipt: {
          provider: inner.name,
          modelId: 'spend-gate',
          latencyMs: 0,
          usage: {},
          requestHash: '',
          outputHash: '',
          executionMode: 'live',
        },
      });
    }
    return inner.structuredCall<T>(req, parse);
  },
});
