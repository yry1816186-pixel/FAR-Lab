import { describe, it, expect } from 'vitest';
import { CampaignSpec } from '../src/domain/campaign.js';
import { decideCampaign, runnableUnits, evaluateStop, alphaLedger, type UnitRuntimeState } from '../src/app/campaign.js';

// RU-8 GO3 — campaign runtime decision core. Pure functions, offline/deterministic.

const specOf = (cross: unknown, stopRules: unknown[], units?: unknown[]): CampaignSpec =>
  CampaignSpec.parse({
    id: 'cmp_rttest00000000000000000a',
    runId: 'run_rttest000000000000000000a',
    units: units ?? [
      { label: 'root', hypothesisId: 'hyp_r000000000000000000000', experimentSpecId: 'xsp_r000000000000000000000', dependsOn: [] },
      { label: 'left', hypothesisId: 'hyp_l000000000000000000000', experimentSpecId: 'xsp_l000000000000000000000', dependsOn: ['root'] },
      { label: 'right', hypothesisId: 'hyp_i000000000000000000000', experimentSpecId: 'xsp_i000000000000000000000', dependsOn: ['root'] },
      { label: 'sink', hypothesisId: 'hyp_s000000000000000000000', experimentSpecId: 'xsp_s000000000000000000000', dependsOn: ['left', 'right'] },
    ],
    crossUnitTesting: cross,
    stopRules,
    createdAt: '2026-08-24T00:00:00.000Z',
  });

const st = (label: string, state: UnitRuntimeState['state'], alphaSpent?: number): UnitRuntimeState => ({ label, state, alphaSpent });

describe('runnableUnits (DAG readiness)', () => {
  const spec = specOf({ policy: 'single_primary', primaryUnit: 'sink' }, [{ kind: 'all_units_terminal' }]);
  it('initially only dependency-free units run; success unblocks dependents level by level', () => {
    expect(runnableUnits(spec, [])).toEqual(['root']);
    expect(runnableUnits(spec, [st('root', 'running')])).toEqual([]);
    expect(runnableUnits(spec, [st('root', 'completed')])).toEqual(['left', 'right']);
    expect(runnableUnits(spec, [st('root', 'completed'), st('left', 'completed'), st('right', 'completed')])).toEqual(['sink']);
  });
  it('a failed dependency does NOT unblock dependents (researcher re-plans; never silent skip)', () => {
    expect(runnableUnits(spec, [st('root', 'failed')])).toEqual([]);
    expect(runnableUnits(spec, [st('root', 'canceled')])).toEqual([]);
  });
});

describe('evaluateStop (campaign-level rules, first match wins)', () => {
  it('all_units_terminal fires only when every unit is terminal', () => {
    const spec = specOf({ policy: 'single_primary', primaryUnit: 'sink' }, [{ kind: 'all_units_terminal' }]);
    expect(evaluateStop(spec, [st('root', 'completed'), st('left', 'completed'), st('right', 'failed'), st('sink', 'canceled')]).stopped).toBe(true);
    expect(evaluateStop(spec, [st('root', 'completed'), st('left', 'pending'), st('right', 'failed'), st('sink', 'canceled')]).stopped).toBe(false);
  });
  it('primary_falsified fires on the primary unit failing (a falsified primary removes the claim)', () => {
    const spec = specOf({ policy: 'single_primary', primaryUnit: 'sink' }, [{ kind: 'primary_falsified' }]);
    const r = evaluateStop(spec, [st('root', 'completed'), st('sink', 'failed')]);
    expect(r.stopped).toBe(true);
    expect(r.stopReason).toContain('primary_falsified');
    expect(evaluateStop(spec, [st('root', 'completed'), st('sink', 'completed')]).stopped).toBe(false);
  });
  it('external budget/units exhaustion pass through', () => {
    const spec = specOf({ policy: 'e_value_accumulation', eValueThreshold: 4 }, [{ kind: 'budget_exhausted' }, { kind: 'units_exhausted' }]);
    expect(evaluateStop(spec, [], { budgetExhausted: true }).stopReason).toBe('budget_exhausted');
    expect(evaluateStop(spec, [], { unitsExhausted: true }).stopReason).toBe('units_exhausted');
    expect(evaluateStop(spec, [], {}).stopped).toBe(false);
  });
});

describe('alphaLedger + decideCampaign guard', () => {
  const spec = specOf(
    { policy: 'alpha_spending', familyAlpha: 0.05, alphaByUnit: { root: 0.02, left: 0.01, right: 0.01, sink: 0.01 } },
    [{ kind: 'all_units_terminal' }],
  );
  it('ledger: declared − spent, floored at 0; non-alpha policies carry null budgets', () => {
    const led = alphaLedger(spec, [st('root', 'completed', 0.015)]);
    expect(led.root).toBeCloseTo(0.005, 9);
    expect(led.left).toBeCloseTo(0.01, 9);
    const nullSpec = specOf({ policy: 'e_value_accumulation', eValueThreshold: 4 }, [{ kind: 'all_units_terminal' }]);
    expect(Object.values(alphaLedger(nullSpec, [])).every((v) => v === null)).toBe(true);
  });
  it('a unit whose alpha budget is exhausted is NOT runnable (silent multiplicity impossible)', () => {
    const d = decideCampaign(spec, [st('root', 'running', 0.02)]); // root spent its full share
    expect(d.runnable).toEqual([]); // root is running; children blocked by DAG anyway
    // exhaust left's budget via a terminal record, then right completes root:
    const d2 = decideCampaign(spec, [st('root', 'completed'), st('left', 'pending')]);
    expect(d2.runnable).toEqual(['left', 'right']);
    const d3 = decideCampaign(spec, [st('root', 'completed', 0.02), st('left', 'pending')]);
    // root exhausted its own share — that does not block children; children have their own shares
    expect(d3.runnable).toEqual(['left', 'right']);
    const ledExhausted = alphaLedger(spec, [st('root', 'completed'), st('left', 'pending')]);
    // simulate left already fully spent pre-run (state carries prior spend)
    const d4 = decideCampaign(spec, [st('root', 'completed'), st('left', 'pending', 0.01)]);
    expect(d4.runnable).not.toContain('left');
    void ledExhausted;
  });
  it('when stopped, NO units are enqueued regardless of readiness', () => {
    const spec2 = specOf({ policy: 'single_primary', primaryUnit: 'root' }, [{ kind: 'primary_falsified' }], [
      { label: 'root', hypothesisId: 'hyp_r000000000000000000000', experimentSpecId: 'xsp_r000000000000000000000', dependsOn: [] },
      { label: 'other', hypothesisId: 'hyp_o000000000000000000000', experimentSpecId: 'xsp_o000000000000000000000', dependsOn: [] },
    ]);
    const d = decideCampaign(spec2, [st('root', 'failed'), st('other', 'pending')]);
    expect(d.stopped).toBe(true);
    expect(d.runnable).toEqual([]);
  });
});
