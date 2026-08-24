import type { Store } from '../persistence/store.js';
import type { ResearchRun } from '../domain/index.js';
import { classifyError } from './observability.js';
import { readSpendLimit, workspaceSpendStatus } from './spend-limit.js';

/**
 * Recovery UX contract (reliability workstream 2026-08-24).
 *
 * The UI/TUI must never GUESS what state a run is in — every displayable
 * recovery phase is DERIVED here from authoritative state (run doc, lease row,
 * budget skip markers, spend ledger), each with its exact evidence and the
 * real user action that transitions it. Anything not derivable is
 * 'unknown', never invented (PRODUCT_HCI truth rules).
 */

export type RecoveryPhase =
  | 'idle'              // created/queued, never started
  | 'running'           // live executor holds the lease
  | 'frozen_recoverable'// status=running but lease expired — watchdog/resume reclaims
  | 'paused_budget'     // stages skipped with the budget_exhausted marker
  | 'paused_spend'      // workspace USD ceiling reached (fail-closed gate)
  | 'retryable_partial' // partial with a transient failure — plain resume is enough
  | 'blocked_needs_human' // auth/quota/corruption/permission — a human decision is required
  | 'partial'           // terminal-ish partial: open legs, no blocking failure
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'irrecoverable';    // failed + non-retryable non-human error (data/contract damage)

export interface RecoveryState {
  phase: RecoveryPhase;
  /** Machine-checkable evidence behind the phase (rendered in UI tooltips). */
  evidence: {
    runStatus: ResearchRun['status'];
    leaseLive: boolean;
    leaseHolder: string | null;
    leaseExpiresAt: string | null;
    budgetSkippedStages: string[];
    spendLimitUsd: number | null;
    spentUsd: number;
    lastErrorClassified: { category: string; retryable: boolean; needsHuman: boolean } | null;
  };
  /** The real action available to the user; null = nothing to do (terminal or live). */
  userAction: { kind: 'resume' | 'raise_budget' | 'raise_spend' | 'fix_route' | 'inspect' | 'none'; hint: string } | null;
}

const BUDGET_MARKER = 'budget_exhausted';

/** Derive the displayable recovery phase. Pure function of persisted state. */
export const recoveryStateForRun = (store: Store, run: ResearchRun, now = new Date()): RecoveryState => {
  const lease = store.getRunLease(run.id);
  const leaseLive = lease.holder !== null && (lease.expiresAt ?? '') > now.toISOString();
  const budgetSkippedStages = run.stages
    .filter((s) => s.state === 'skipped' && (s.error ?? '').startsWith(BUDGET_MARKER))
    .map((s) => s.stage);
  const spend = workspaceSpendStatus(store);
  const spendGated = spend.limitUsd !== null && spend.spentUsd >= spend.limitUsd;
  const lastErrorClassified = run.lastError !== undefined && run.lastError !== ''
    ? (() => { const c = classifyError(new Error(run.lastError)); return { category: c.category, retryable: c.retryable, needsHuman: c.needsHuman }; })()
    : null;

  const evidence: RecoveryState['evidence'] = {
    runStatus: run.status,
    leaseLive,
    leaseHolder: lease.holder,
    leaseExpiresAt: lease.expiresAt,
    budgetSkippedStages,
    spendLimitUsd: readSpendLimit(store),
    spentUsd: spend.spentUsd,
    lastErrorClassified,
  };

  // Order matters: most actionable operational states first, terminal states last.
  if (run.status === 'running') {
    if (leaseLive) {
      return { phase: 'running', evidence, userAction: null };
    }
    // FROZEN: no live lease. The watchdog (server) adopts within its poll cycle;
    // a CLI user can reclaim immediately — expired leases are reclaimable by design.
    return {
      phase: 'frozen_recoverable',
      evidence,
      userAction: { kind: 'resume', hint: `far research resume ${run.id} (lease expired ${lease.expiresAt ?? 'unknown'} — safe to reclaim; server watchdog also auto-adopts)` },
    };
  }

  if (run.status === 'created' || run.status === 'queued') {
    return { phase: 'idle', evidence, userAction: { kind: 'resume', hint: `far research resume ${run.id}` } };
  }

  if (run.status === 'paused' || (budgetSkippedStages.length > 0 && run.status !== 'completed')) {
    return {
      phase: 'paused_budget',
      evidence,
      userAction: { kind: 'raise_budget', hint: `raise FARLAB_RUN_TOKEN_BUDGET (spent cap marker on: ${budgetSkippedStages.join(', ') || 'paused'}) then far research resume ${run.id} — skipped stages re-open automatically` },
    };
  }

  if (spendGated && (run.status === 'partial' || run.status === 'failed')) {
    return {
      phase: 'paused_spend',
      evidence,
      userAction: { kind: 'raise_spend', hint: `workspace spend limit $${spend.limitUsd?.toFixed(2)} reached ($${spend.spentUsd.toFixed(2)} spent) — raise or clear the limit in settings, then far research resume ${run.id}` },
    };
  }

  if (run.status === 'partial') {
    if (lastErrorClassified !== null && lastErrorClassified.retryable && !lastErrorClassified.needsHuman) {
      return {
        phase: 'retryable_partial',
        evidence,
        userAction: { kind: 'resume', hint: `transient failure (${lastErrorClassified.category}) — far research resume ${run.id} continues from the failed stage` },
      };
    }
    if (lastErrorClassified !== null && lastErrorClassified.needsHuman) {
      return {
        phase: 'blocked_needs_human',
        evidence,
        userAction: { kind: 'fix_route', hint: `blocked on ${lastErrorClassified.category}: "${run.lastError}" — fix the route/credential, then far research resume ${run.id}` },
      };
    }
    return { phase: 'partial', evidence, userAction: { kind: 'inspect', hint: `open legs remain — inspect the timeline (far research status ${run.id}) and add feedback to continue the loop` } };
  }

  if (run.status === 'completed') return { phase: 'completed', evidence, userAction: null };
  if (run.status === 'cancelled') {
    return { phase: 'cancelled', evidence, userAction: { kind: 'resume', hint: `far research resume ${run.id} restarts from the interrupted stage (cancel flag is consumed)` } };
  }
  if (run.status === 'failed') {
    if (lastErrorClassified !== null && lastErrorClassified.needsHuman) {
      return {
        phase: 'blocked_needs_human',
        evidence,
        userAction: { kind: 'fix_route', hint: `blocked on ${lastErrorClassified.category}: "${run.lastError}" — fix, then far research resume ${run.id}` },
      };
    }
    if (lastErrorClassified !== null && !lastErrorClassified.retryable && !lastErrorClassified.needsHuman) {
      // Non-retryable, non-human: contract/data damage — resume would replay it.
      return { phase: 'irrecoverable', evidence, userAction: { kind: 'inspect', hint: `non-retryable failure (${lastErrorClassified.category}) — inspect far research status ${run.id}; a code/data fix is required before resume` } };
    }
    return {
      phase: 'retryable_partial',
      evidence,
      userAction: { kind: 'resume', hint: `far research resume ${run.id} re-runs the failed stage (attempt counters preserved)` },
    };
  }
  return { phase: 'irrecoverable', evidence, userAction: null };
};
