import type { Store } from '../persistence/store.js';

/**
 * Run-level token budget governance (breakthrough BP-1).
 *
 * Design invariants:
 * - Receipts are the single source of truth for spend. Spent tokens are RE-DERIVED
 *   from persisted model-call receipts (usage.totalTokens) at budget construction,
 *   so a resumed run never carries a stale in-memory counter as a second authority.
 * - Exhaustion is an operational pause, never a fabricated success: stages that
 *   would exceed the cap are skipped with reason `budget_exhausted`, the run still
 *   reaches export (so the honest partial bundle exists), and a resume with a
 *   raised budget re-opens exactly those skipped stages.
 * - `null` cap = unlimited (default): governance is opt-in via env so existing
 *   deployments and tests change behavior only when a cap is set.
 */

export class RunBudgetExhaustedError extends Error {
  constructor(runId: string, cap: number, spent: number) {
    super(`run token budget exhausted for ${runId}: spent ${spent} of cap ${cap} — remaining stages are skipped with reason budget_exhausted (raise FARLAB_RUN_TOKEN_BUDGET and resume to re-open them)`);
    this.name = 'RunBudgetExhaustedError';
  }
}

export interface RunBudgetView {
  /** Token cap; null = unlimited. */
  readonly cap: number | null;
  readonly spent: number;
  /** null when cap is null (unlimited). */
  remaining(): number | null;
  hasRemaining(): boolean;
  /** Track a completed model call's usage (missing usage leaves spend unchanged). */
  spend(totalTokens: number | undefined): void;
  /** True once >=80% of the cap is spent (soft-warning surface, fires once). */
  nearLimit(): boolean;
}

export const runTokenBudgetCap = (env: NodeJS.ProcessEnv = process.env): number | null => {
  const raw = env.FARLAB_RUN_TOKEN_BUDGET;
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** Sum of model-call receipt usage for one run — the only spend authority. */
export const spentTokensForRun = (store: Store, runId: string): number =>
  store.listObjects('receipt', runId).reduce((sum, r) => sum + (r.modelCall?.usage?.totalTokens ?? 0), 0);

export const makeRunBudget = (store: Store, runId: string, capOverride?: number | null): RunBudgetView => {
  const cap = capOverride !== undefined ? capOverride : runTokenBudgetCap();
  let spent = spentTokensForRun(store, runId);
  return {
    cap,
    get spent() { return spent; },
    remaining: () => (cap === null ? null : Math.max(0, cap - spent)),
    hasRemaining: () => cap === null || spent < cap,
    spend: (totalTokens) => { if (totalTokens !== undefined && totalTokens > 0) spent += totalTokens; },
    nearLimit: () => cap !== null && spent >= cap * 0.8,
  };
};
