import { describe, it, expect } from 'vitest';
import { CampaignSpec, CROSS_UNIT_POLICY_OPTIONS } from '../src/domain/campaign.js';
import { MultipleTestingPolicy } from '../src/domain/plan.js';

// RU-8 GO2 — CampaignSpec preregistration schema. All offline/deterministic.

const base = {
  id: 'cmp_testcampaign000000000000a',
  runId: 'run_testcampaign000000000000a',
  units: [
    { label: 'primary comparison', hypothesisId: 'hyp_a000000000000000000000', experimentSpecId: 'xsp_a000000000000000000000', dependsOn: [] },
    { label: 'ablation: depth', hypothesisId: 'hyp_b000000000000000000000', experimentSpecId: 'xsp_b000000000000000000000', dependsOn: ['primary comparison'] },
  ],
  createdAt: '2026-08-24T00:00:00.000Z',
};

describe('vocabulary alignment', () => {
  it('cross-unit policy options ARE the plan MultipleTestingPolicy options', () => {
    expect([...CROSS_UNIT_POLICY_OPTIONS].sort()).toEqual([...MultipleTestingPolicy.options].sort());
  });
});

describe('CampaignSpec validation', () => {
  it('single_primary: valid when primaryUnit references a declared unit', () => {
    const spec = CampaignSpec.parse({ ...base, crossUnitTesting: { policy: 'single_primary', primaryUnit: 'primary comparison' }, stopRules: [{ kind: 'all_units_terminal' }] });
    expect(spec.units).toHaveLength(2);
  });

  it('single_primary: FAILS when primaryUnit is not a declared unit', () => {
    expect(() => CampaignSpec.parse({ ...base, crossUnitTesting: { policy: 'single_primary', primaryUnit: 'no such unit' }, stopRules: [{ kind: 'all_units_terminal' }] })).toThrow(/primaryUnit/);
  });

  it('alpha_spending: full coverage + sum(with prior) <= familyAlpha passes; overdraw fails', () => {
    const ok = CampaignSpec.parse({
      ...base, priorAlphaSpent: 0.01,
      crossUnitTesting: { policy: 'alpha_spending', familyAlpha: 0.05, alphaByUnit: { 'primary comparison': 0.03, 'ablation: depth': 0.01 } },
      stopRules: [{ kind: 'primary_falsified' }],
    });
    expect(ok.priorAlphaSpent).toBe(0.01);
    // missing unit coverage
    expect(() => CampaignSpec.parse({ ...base, crossUnitTesting: { policy: 'alpha_spending', familyAlpha: 0.05, alphaByUnit: { 'primary comparison': 0.03 } }, stopRules: [{ kind: 'all_units_terminal' }] })).toThrow(/alpha_spending/);
    // foreign key
    expect(() => CampaignSpec.parse({ ...base, crossUnitTesting: { policy: 'alpha_spending', familyAlpha: 0.05, alphaByUnit: { 'primary comparison': 0.03, ghost: 0.01, 'ablation: depth': 0.01 } }, stopRules: [{ kind: 'all_units_terminal' }] })).toThrow(/alpha_spending/);
    // overdraw: 0.04 + prior 0.02 > 0.05
    expect(() => CampaignSpec.parse({ ...base, priorAlphaSpent: 0.02, crossUnitTesting: { policy: 'alpha_spending', familyAlpha: 0.05, alphaByUnit: { 'primary comparison': 0.03, 'ablation: depth': 0.01 } }, stopRules: [{ kind: 'all_units_terminal' }] })).toThrow(/alpha_spending/);
  });

  it('e_value_accumulation: positive threshold required', () => {
    expect(() => CampaignSpec.parse({ ...base, crossUnitTesting: { policy: 'e_value_accumulation', eValueThreshold: 4 }, stopRules: [{ kind: 'units_exhausted' }] })).not.toThrow();
    expect(() => CampaignSpec.parse({ ...base, crossUnitTesting: { policy: 'e_value_accumulation', eValueThreshold: 0 }, stopRules: [{ kind: 'units_exhausted' }] })).toThrow();
  });

  it('unit dependencies: unknown refs and cycles rejected; a diamond DAG passes', () => {
    expect(() => CampaignSpec.parse({ ...base, crossUnitTesting: { policy: 'single_primary', primaryUnit: 'primary comparison' }, stopRules: [{ kind: 'all_units_terminal' }],
      units: [...base.units, { label: 'bad', hypothesisId: 'hyp_c000000000000000000000', experimentSpecId: 'xsp_c000000000000000000000', dependsOn: ['missing'] }] })).toThrow(/dependsOn/);
    const cyc = {
      ...base,
      units: [
        { label: 'u1', hypothesisId: 'hyp_d000000000000000000000', experimentSpecId: 'xsp_d000000000000000000000', dependsOn: ['u2'] },
        { label: 'u2', hypothesisId: 'hyp_e000000000000000000000', experimentSpecId: 'xsp_e000000000000000000000', dependsOn: ['u1'] },
      ],
    };
    expect(() => CampaignSpec.parse({ ...cyc, crossUnitTesting: { policy: 'single_primary', primaryUnit: 'u1' }, stopRules: [{ kind: 'all_units_terminal' }] })).toThrow(/cycles/);
    const dag = CampaignSpec.parse({
      ...base,
      units: [
        { label: 'root', hypothesisId: 'hyp_f000000000000000000000', experimentSpecId: 'xsp_f000000000000000000000', dependsOn: [] },
        { label: 'left', hypothesisId: 'hyp_g000000000000000000000', experimentSpecId: 'xsp_g000000000000000000000', dependsOn: ['root'] },
        { label: 'right', hypothesisId: 'hyp_h000000000000000000000', experimentSpecId: 'xsp_h000000000000000000000', dependsOn: ['root'] },
        { label: 'sink', hypothesisId: 'hyp_i000000000000000000000', experimentSpecId: 'xsp_i000000000000000000000', dependsOn: ['left', 'right'] },
      ],
      crossUnitTesting: { policy: 'single_primary', primaryUnit: 'sink' },
      stopRules: [{ kind: 'all_units_terminal' }],
    });
    expect(dag.units).toHaveLength(4);
  });

  it('minimum 2 units (a campaign is multi-experiment by definition)', () => {
    expect(() => CampaignSpec.parse({ ...base, units: [base.units[0]], crossUnitTesting: { policy: 'single_primary', primaryUnit: 'primary comparison' }, stopRules: [{ kind: 'all_units_terminal' }] })).toThrow();
  });
});
