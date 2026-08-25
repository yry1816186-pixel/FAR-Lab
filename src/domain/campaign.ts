import { z } from 'zod';


/**
 * RU-8 GO2 — CampaignSpec: preregistered MULTI-EXperiment campaign schema.
 *
 * A campaign is one preregistered protocol driving N experiment units under a
 * SINGLE cross-unit multiple-testing policy — the campaign, not the unit, is
 * the alpha-spending authority (a per-unit policy over >1 units would be
 * silent multiplicity, the exact failure class MultipleTestingPolicy exists
 * to prevent). Units reference ExperimentSpec ids; execution scheduling is
 * the scheduler's concern — this schema owns only the preregistration truth.
 */

export const CampaignId = z.string().regex(/^cmp_[a-z0-9]+$/, 'must be cmp_<random>');
export type CampaignId = z.infer<typeof CampaignId>;

/**
 * Vocabulary alignment: the cross-unit policy literals ARE the plan layer's
 * MultipleTestingPolicy options (single_primary | alpha_spending |
 * e_value_accumulation — src/domain/plan.ts:49) kept as a local literal union
 * so the discriminatedUnion stays self-contained; alignment is test-locked.
 */
export const CROSS_UNIT_POLICY_OPTIONS = ['single_primary', 'alpha_spending', 'e_value_accumulation'] as const;

/** One experiment unit inside the campaign: hypothesis-bound, plan-frozen. */
export const CampaignUnit = z.object({
  /** Human label for the unit (e.g. "primary comparison", "ablation: depth"). */
  label: z.string().min(3).max(120),
  hypothesisId: z.string().regex(/^hyp_[a-z0-9]+$/, 'must be hyp_<random>'),
  /** The frozen ExperimentSpec id this unit executes; drift is detectable by specHash. */
  experimentSpecId: z.string().regex(/^xsp_[a-z0-9]+$/, 'must be xsp_<random>'),
  /** Units can be sequenced: a unit runs only after its dependsOn units reached terminal states. */
  dependsOn: z.array(z.string().min(3).max(120)).default([]),
});
export type CampaignUnit = z.infer<typeof CampaignUnit>;

export const CrossUnitTestingPolicy = z.discriminatedUnion('policy', [
  z.object({
    policy: z.literal('single_primary'),
    /** The ONE unit whose comparison carries the campaign's inferential claim. */
    primaryUnit: z.string().min(3).max(120),
  }),
  z.object({
    policy: z.literal('alpha_spending'),
    /** Alpha shares per unit label; must cover every unit, each in (0, 0.5], summing to <= alpha. */
    alphaByUnit: z.record(z.string(), z.number().positive().max(0.5)),
    familyAlpha: z.number().positive().max(0.5),
  }),
  z.object({
    policy: z.literal('e_value_accumulation'),
    /** Pre-declared E-value threshold for the campaign-level combined claim. */
    eValueThreshold: z.number().positive(),
  }),
]);
export type CrossUnitTestingPolicy = z.infer<typeof CrossUnitTestingPolicy>;

export const CampaignSpec = z.object({
  id: CampaignId,
  runId: z.string().regex(/^run_[a-z0-9]+$/, 'must be run_<random>'),
  questionId: z.string().regex(/^q_[a-z0-9]+$/, 'must be q_<random>').optional(),
  units: z.array(CampaignUnit).min(2).max(24),
  /** Cross-unit multiple-testing authority — REQUIRED (never per-unit). */
  crossUnitTesting: CrossUnitTestingPolicy,
  /** Alpha-spending ledger already consumed by earlier campaigns on this question (preregistration honesty). */
  priorAlphaSpent: z.number().nonnegative().max(0.5).default(0),
  stopRules: z.array(z.object({
    kind: z.enum(['all_units_terminal', 'primary_falsified', 'budget_exhausted', 'units_exhausted']),
    detail: z.string().min(3).max(300).optional(),
  })).min(1),
  createdAt: z.string().datetime(),
  frozenAt: z.string().datetime().optional(),
  planHash: z.string().length(64).optional(),
})
  .refine(
    (c) => {
      const labels = new Set(c.units.map((u) => u.label));
      if (labels.size !== c.units.length) return false;
      // dependsOn references must resolve to OTHER units and be acyclic
      const byLabel = new Map(c.units.map((u) => [u.label, u]));
      for (const u of c.units) {
        for (const d of u.dependsOn) {
          if (d === u.label) return false;
          if (!byLabel.has(d)) return false;
        }
      }
      // cycle check (deterministic DFS)
      const state = new Map<string, 1 | 2>();
      const visit = (label: string): boolean => {
        const s = state.get(label);
        if (s === 2) return true;
        if (s === 1) return false;
        state.set(label, 1);
        for (const d of byLabel.get(label)!.dependsOn) if (!visit(d)) return false;
        state.set(label, 2);
        return true;
      };
      for (const u of c.units) if (!visit(u.label)) return false;
      return true;
    },
    { message: 'unit labels must be unique; dependsOn must resolve to other units without cycles' },
  )
  .refine(
    (c) => {
      if (c.crossUnitTesting.policy !== 'single_primary') return true;
      const prim = (c.crossUnitTesting as { primaryUnit?: string }).primaryUnit;
      return prim !== undefined && c.units.some((u) => u.label === prim);
    },
    { message: 'single_primary: primaryUnit must reference a declared unit label' },
  )
  .refine(
    (c) => {
      if (c.crossUnitTesting.policy !== 'alpha_spending') return true;
      const cut = c.crossUnitTesting as { alphaByUnit?: Record<string, number>; familyAlpha?: number };
      const { alphaByUnit = {}, familyAlpha = 0 } = cut;
      const labels = new Set(c.units.map((u) => u.label));
      for (const k of Object.keys(alphaByUnit)) if (!labels.has(k)) return false;
      for (const u of c.units) if (!(u.label in alphaByUnit)) return false;
      const sum = Object.values(alphaByUnit).reduce((a, b) => a + b, 0);
      return sum + c.priorAlphaSpent <= familyAlpha + 1e-9;
    },
    { message: 'alpha_spending: every unit covered, no foreign keys, sum(alpha)+priorAlphaSpent <= familyAlpha' },
  )
  // SCIENCE lane (2026-08-24): e_value_accumulation is REJECTED here exactly as the
  // experiment-spec layer already rejects it (experiment.ts multipleTestingPolicy
  // check) — no e-value/e-process estimator exists anywhere in the codebase, so a
  // CampaignSpec declaring it would promise an always-valid inference the system
  // cannot compute. Fail closed until a real e-process lands.
  .refine(
    (c) => c.crossUnitTesting.policy !== 'e_value_accumulation',
    { message: 'e_value_accumulation: no e-value estimator exists yet — declare single_primary or alpha_spending (fail-closed)' },
  );
export type CampaignSpec = z.infer<typeof CampaignSpec>;
