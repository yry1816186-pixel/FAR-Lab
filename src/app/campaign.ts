import type { CampaignSpec, CampaignUnit } from '../domain/campaign.js';

/**
 * RU-8 GO3 — CampaignSpec RUNTIME (pure decision core).
 *
 * Ownership split (one authority per concern):
 * - THIS module: campaign-level DECISIONS — which units are runnable, whether
 *   the campaign stops, how much alpha each unit may spend. Pure functions of
 *   (CampaignSpec, unit states, alpha ledger) — deterministic, offline-testable.
 * - The scheduler owns EXECUTION (claim/heartbeat/fences); the executor owns
 *   per-unit runs; they feed this module state, this module feeds them orders.
 *
 * The campaign is the alpha-spending authority (GO2 schema): every unit
 * terminal under alpha_spending must draw from its declared share; a unit
 * WITHOUT a share never runs (silent multiplicity is structurally impossible).
 */

export type UnitTerminalState = 'completed' | 'failed' | 'canceled';

export interface UnitRuntimeState {
  label: string;
  state: 'pending' | 'running' | UnitTerminalState;
  /** Alpha actually spent by this unit's verdict (0 when not terminal / not applicable). */
  alphaSpent?: number;
}

export interface CampaignDecision {
  /** Units whose dependencies are all terminal-successful and that may be enqueued NOW. */
  runnable: string[];
  /** Campaign-level stop verdict — when true, NO further units are enqueued. */
  stopped: boolean;
  stopReason: string | null;
  /** Remaining alpha budget per unit label (alpha_spending only; others = null per label). */
  alphaBudget: Record<string, number | null>;
}

const depsSatisfied = (unit: CampaignUnit, states: ReadonlyMap<string, UnitRuntimeState>): boolean =>
  unit.dependsOn.every((d) => states.get(d)?.state === 'completed');

/**
 * Ready-unit derivation over the dependsOn DAG: a unit is runnable iff it is
 * pending AND every dependency reached 'completed' (a failed/canceled dependency
 * does NOT unblock — the researcher re-plans; honest, never silently skipped).
 */
export const runnableUnits = (spec: CampaignSpec, states: readonly UnitRuntimeState[]): string[] => {
  // a unit with NO recorded state is pending (not yet touched)
  const stateOf = (label: string): UnitRuntimeState['state'] => states.find((s) => s.label === label)?.state ?? 'pending';
  return spec.units
    .filter((u) => stateOf(u.label) === 'pending')
    .filter((u) => depsSatisfied(u, new Map(states.map((s) => [s.label, s] as const))))
    .map((u) => u.label);
};

/**
 * Campaign-level stop rules (first match wins, checked in spec order):
 * - all_units_terminal: every unit reached a terminal state.
 * - primary_falsified: the single_primary unit completed with a
 *   falsifying verdict (caller marks its state 'failed' — FAILED experiments
 *   are findings, and a falsified primary removes the campaign's claim).
 * - budget_exhausted / units_exhausted: caller-supplied booleans.
 */
export const evaluateStop = (
  spec: CampaignSpec,
  states: readonly UnitRuntimeState[],
  external: { budgetExhausted?: boolean; unitsExhausted?: boolean } = {},
): { stopped: boolean; stopReason: string | null } => {
  const byLabel = new Map(states.map((s) => [s.label, s] as const));
  const allTerminal = spec.units.every((u) => {
    const s = byLabel.get(u.label)?.state;
    return s === 'completed' || s === 'failed' || s === 'canceled';
  });
  for (const rule of spec.stopRules) {
    switch (rule.kind) {
      case 'all_units_terminal':
        if (allTerminal) return { stopped: true, stopReason: 'all_units_terminal' };
        break;
      case 'primary_falsified':
        if (spec.crossUnitTesting.policy === 'single_primary') {
          const prim = (spec.crossUnitTesting as { primaryUnit: string }).primaryUnit;
          if (byLabel.get(prim)?.state === 'failed') return { stopped: true, stopReason: `primary_falsified: ${prim}` };
        }
        break;
      case 'budget_exhausted':
        if (external.budgetExhausted === true) return { stopped: true, stopReason: 'budget_exhausted' };
        break;
      case 'units_exhausted':
        if (external.unitsExhausted === true) return { stopped: true, stopReason: 'units_exhausted' };
        break;
    }
  }
  return { stopped: false, stopReason: null };
};

/**
 * Cross-unit alpha ledger: remaining budget per unit label.
 * - alpha_spending: declaredShare − spent (floor 0); units have NO budget
 *   (null) under the other policies — spend accounting is not applicable.
 */
export const alphaLedger = (
  spec: CampaignSpec,
  states: readonly UnitRuntimeState[],
): Record<string, number | null> => {
  if (spec.crossUnitTesting.policy !== 'alpha_spending') {
    return Object.fromEntries(spec.units.map((u) => [u.label, null]));
  }
  const spent = new Map(states.map((s) => [s.label, s.alphaSpent ?? 0] as const));
  const shares = (spec.crossUnitTesting as { alphaByUnit: Record<string, number> }).alphaByUnit;
  return Object.fromEntries(spec.units.map((u) => [u.label, Math.max(0, (shares[u.label] ?? 0) - (spent.get(u.label) ?? 0))]));
};

/** One decision pass: stop rules first (never enqueue past a stop), then runnable units. */
export const decideCampaign = (
  spec: CampaignSpec,
  states: readonly UnitRuntimeState[],
  external: { budgetExhausted?: boolean; unitsExhausted?: boolean } = {},
): CampaignDecision => {
  const stop = evaluateStop(spec, states, external);
  if (stop.stopped) return { runnable: [], stopped: true, stopReason: stop.stopReason, alphaBudget: alphaLedger(spec, states) };
  // alpha_spending guard: a unit with zero remaining budget is NOT runnable
  const budget = alphaLedger(spec, states);
  const runnable = runnableUnits(spec, states).filter((label) => budget[label] === null || budget[label]! > 0);
  return { runnable, stopped: false, stopReason: null, alphaBudget: budget };
};
