import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import type { CampaignSpec } from '../domain/campaign.js';
import { decideCampaign, type UnitRuntimeState, type UnitTerminalState } from './campaign.js';
import { ExperimentSpec, type ExperimentRun } from '../domain/index.js';
import { executeExperiment } from '../experiment/executor.js';

/**
 * RU-8 GO4 — the campaign driver loop: wires the pure decision core
 * (src/app/campaign.ts) to the real execution surfaces. Ownership stays clean:
 * the DECISION core owns readiness/stop/alpha; THIS loop owns orchestration —
 * enqueue runnable units (in-place execution via the existing executor), fold
 * terminal states back into UnitRuntimeState, and stop enqueueing the moment a
 * campaign stop rule fires. Every transition is evented on the run's spine.
 */

export interface CampaignOutcome {
  campaignId: string;
  stopped: boolean;
  stopReason: string | null;
  unitStates: UnitRuntimeState[];
  executedRunIds: string[];
}

export interface DriveCampaignOptions {
  allowLocalDatasets?: boolean;
  shouldCancel?: () => boolean;
  /** Test seam: per-unit execution override (deterministic harnesses). */
  executeUnit?: (spec: ExperimentSpec) => Promise<{ state: UnitTerminalState; alphaSpent?: number; experimentRunId: string; falsified?: boolean }>;
  /** Test seam: spec resolution override (default: store lookup by frozen id). */
  resolveSpec?: (specId: string) => ExperimentSpec | null;
}

/**
 * SCIENCE lane (2026-08-24): terminal state now honors the decision core's
 * documented primary_falsified contract. Previously this mapped ONLY run.status,
 * so a completed run whose preregistered analysis mechanically produced a
 * 'falsifies' verdict reached state 'completed' and the primary_falsified stop
 * rule could never fire (while an infra crash fired it with the wrong meaning).
 * A statistical falsification maps to 'failed' (failed experiments ARE findings)
 * and is disclosed distinctly via the falsified event flag.
 */
export const stateFromReports = (run: ExperimentRun, verdicts: readonly string[]): { state: UnitTerminalState; falsified: boolean } => {
  if (run.status === 'canceled') return { state: 'canceled', falsified: false };
  const falsified = verdicts.includes('falsifies');
  if (run.status === 'failed') return { state: 'failed', falsified: false };
  return falsified ? { state: 'failed', falsified: true } : { state: 'completed', falsified: false };
};

export const driveCampaign = async (
  store: Store,
  artifacts: ArtifactStore,
  spec: CampaignSpec,
  opts: DriveCampaignOptions,
): Promise<CampaignOutcome> => {
  const states: UnitRuntimeState[] = [];
  const executedRunIds: string[] = [];
  const executeUnit = opts.executeUnit ?? (async (unitSpec: ExperimentSpec) => {
    const executed = await executeExperiment(store, artifacts, unitSpec, {
      allowLocalDatasets: opts.allowLocalDatasets,
      shouldCancel: opts.shouldCancel,
    });
    const mapped = stateFromReports(executed.run, executed.statReports.map((r) => r.verdict as string));
    return { state: mapped.state, falsified: mapped.falsified, alphaSpent: undefined, experimentRunId: executed.run.id };
  });

  for (let round = 0; round < spec.units.length; round += 1) {
    if (opts.shouldCancel?.() === true) break;
    const decision = decideCampaign(spec, states);
    if (decision.stopped) {
      store.appendEvent(spec.runId, { type: 'note', detail: { kind: 'campaign_stopped', campaignId: spec.id, stopReason: decision.stopReason } });
      return { campaignId: spec.id, stopped: true, stopReason: decision.stopReason, unitStates: states, executedRunIds };
    }
    if (decision.runnable.length === 0) {
      // deadlock (failed dependency with pending dependents) — honest stop, disclosed
      if (states.length < spec.units.length) {
        store.appendEvent(spec.runId, { type: 'note', detail: { kind: 'campaign_stalled', campaignId: spec.id, pending: spec.units.filter((u) => !states.some((s) => s.label === u.label)).map((u) => u.label) } });
      }
      break;
    }
    for (const label of decision.runnable) {
      if (opts.shouldCancel?.() === true) break;
      // mid-round stop check: a stop rule (e.g. primary just falsified) must
      // prevent further enqueues IMMEDIATELY, not at the next round boundary
      const mid = decideCampaign(spec, states);
      if (mid.stopped) {
        store.appendEvent(spec.runId, { type: 'note', detail: { kind: 'campaign_stopped', campaignId: spec.id, stopReason: mid.stopReason } });
        return { campaignId: spec.id, stopped: true, stopReason: mid.stopReason, unitStates: states, executedRunIds };
      }
      const unit = spec.units.find((u) => u.label === label)!;
      const unitSpecRaw = (opts.resolveSpec ?? ((id: string) => store.getObject('experiment_spec', id)))(unit.experimentSpecId);
      if (unitSpecRaw === null) {
        // frozen spec missing = campaign-level failure for the unit (fail-visible, never silent)
        states.push({ label, state: 'failed' });
        store.appendEvent(spec.runId, { type: 'note', detail: { kind: 'campaign_unit_failed', campaignId: spec.id, unit: label, error: `frozen spec ${unit.experimentSpecId} not found` } });
        continue;
      }
      // SCIENCE lane (P1-3 minimal enforcement): under alpha_spending the frozen unit
      // spec MUST run at its declared campaign share — a spec silently running at a
      // larger alpha than the share booked in the ledger breaks the family-wise
      // budget. Fail closed (unit failed, disclosed) instead of silently over-spending.
      if (spec.crossUnitTesting.policy === 'alpha_spending') {
        const share = (spec.crossUnitTesting as { alphaByUnit: Record<string, number> }).alphaByUnit[label];
        const specAlpha = (unitSpecRaw as ExperimentSpec).statistics?.alpha;
        if (share !== undefined && specAlpha > share + 1e-9) {
          states.push({ label, state: 'failed' });
          store.appendEvent(spec.runId, {
            type: 'note',
            detail: { kind: 'campaign_unit_failed', campaignId: spec.id, unit: label, error: `frozen spec alpha ${specAlpha} exceeds campaign share ${share} — refusing to over-spend the family budget` },
          });
          continue;
        }
      }
      states.push({ label, state: 'running' });
      store.appendEvent(spec.runId, { type: 'note', detail: { kind: 'campaign_unit_started', campaignId: spec.id, unit: label, specId: unit.experimentSpecId } });
      const result = await executeUnit(unitSpecRaw as ExperimentSpec);
      executedRunIds.push(result.experimentRunId);
      const alphaSpent = result.alphaSpent
        ?? (spec.crossUnitTesting.policy === 'alpha_spending'
          ? (spec.crossUnitTesting as { alphaByUnit: Record<string, number> }).alphaByUnit[label]
          : undefined);
      const terminal = states.find((s) => s.label === label);
      if (terminal !== undefined) {
        terminal.state = result.state;
        terminal.alphaSpent = alphaSpent;
      }
      store.appendEvent(spec.runId, {
        type: 'note',
        detail: {
          kind: `campaign_unit_${result.state}`,
          campaignId: spec.id,
          unit: label,
          experimentRunId: result.experimentRunId,
          // statistical falsification vs operational failure stay distinguishable
          ...(result.falsified === true ? { falsified: true, note: 'preregistered analysis produced a falsifies verdict — failed experiments are findings' } : {}),
          ...(alphaSpent !== undefined ? { alphaSpent } : {}),
        },
      });
    }
  }
  const finalDecision = decideCampaign(spec, states);
  if (finalDecision.stopped) {
    store.appendEvent(spec.runId, { type: 'note', detail: { kind: 'campaign_stopped', campaignId: spec.id, stopReason: finalDecision.stopReason } });
  }
  return {
    campaignId: spec.id,
    stopped: finalDecision.stopped,
    stopReason: finalDecision.stopReason,
    unitStates: states,
    executedRunIds,
  };
};
