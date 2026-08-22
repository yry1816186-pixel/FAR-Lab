import { describe, it, expect } from 'vitest';
import {
  checkStructuredPreregistration, planContentHash, freezePlan, auditPlanCompliance,
  recordPlanDeviation, alphaSpendLedger,
} from '../src/pipeline/stages/plan-formal.js';
import { ResearchPlan, newId } from '../src/domain/index.js';

/**
 * Wave-S P0 injection-fault tests: a violating plan MUST be caught by the deterministic
 * gate (g2 predicate V&V, g3 prediction conflict matrix) — green here means the checks
 * discriminate, not that they exist.
 */

const hyp = (): string => newId('hyp');
const task = (): string => newId('task');

const basePlan = (over: Partial<ResearchPlan> = {}): ResearchPlan => ResearchPlan.parse({
  id: newId('pln'),
  runId: newId('run'),
  objective: 'discriminate H1 vs H2 on retrieval quality',
  hypothesisIds: [hyp()],
  variables: ['retrieval quality'],
  controls: [],
  inclusionCriteria: [],
  exclusionCriteria: [],
  dataRequirements: [],
  toolRequirements: [],
  steps: [
    { id: task(), title: 's1', kind: 'literature', inputs: [], outputs: [], method: 'm', failureConditions: ['f'], dependsOn: [] },
    { id: task(), title: 's2', kind: 'experiment', inputs: [], outputs: [], method: 'm', failureConditions: ['f'], dependsOn: [] },
    { id: task(), title: 's3', kind: 'data_analysis', inputs: [], outputs: [], method: 'm', failureConditions: ['f'], dependsOn: [] },
  ],
  metrics: ['precision@5', 'recall@10'],
  statistics: [],
  decisionRules: {
    successCriterion: 'precision@5 >= 0.6',
    weakeningCriterion: 'precision@5 in [0.4, 0.6)',
    falsificationCriterion: 'precision@5 < 0.4',
    stopCriterion: 'after primary comparison',
  },
  confounders: [],
  alternativeExplanations: [],
  risks: [],
  ethics: [],
  prerequisites: [],
  reproducibilityRequirements: [],
  evidenceClaimIds: [],
  createdAt: new Date().toISOString(),
  ...over,
});

describe('g2/g3 checkStructuredPreregistration', () => {
  const h1 = hyp();
  const h2 = hyp();
  const known = [h1, h2];

  it('free-text-only plan: structured=false, one advisory warning, zero errors', () => {
    const r = checkStructuredPreregistration(basePlan({ hypothesisIds: [h1] }), known);
    expect(r.structured).toBe(false);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('结构化预注册');
  });

  it('catches a testSpec referencing an undefined metric (injection fault)', () => {
    const r = checkStructuredPreregistration(basePlan({
      hypothesisIds: [h1],
      metricSpecs: [{ name: 'p@5', definition: 'd', role: 'primary', direction: 'higher_better' }],
      testSpecs: [{ id: 't1', metric: 'wrong-metric', statistic: 'permutation', hypothesisIds: [h1], prediction: 'supports', interpretation: 'np_test', threshold: 0.6, thresholdOp: '>=' }],
      predictions: [{ hypothesisId: h1, observable: 'precision@5', condition: 'rerank on', expectedRelation: 'increases' }],
      expectedInfoGain: { decisionAtStake: 'pick reranker', ambiguitySource: 'mixed results', discriminatingMetric: 'p@5', expectedSeparation: '>=0.1' },
    }), known);
    expect(r.structured).toBe(true);
    expect(r.errors.some((e) => e.includes('wrong-metric'))).toBe(true);
  });

  it('catches direction-threshold contradiction: higher_better + supports + "<=" (injection fault)', () => {
    const r = checkStructuredPreregistration(basePlan({
      hypothesisIds: [h1],
      metricSpecs: [{ name: 'p@5', definition: 'd', role: 'primary', direction: 'higher_better' }],
      testSpecs: [{ id: 't1', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1], prediction: 'supports', interpretation: 'np_test', threshold: 0.6, thresholdOp: '<=' }],
      predictions: [{ hypothesisId: h1, observable: 'p@5', condition: 'on', expectedRelation: 'increases' }],
      expectedInfoGain: { decisionAtStake: 'x', ambiguitySource: 'y', discriminatingMetric: 'p@5', expectedSeparation: 'z' },
    }), known);
    expect(r.errors.some((e) => e.includes('方向矛盾'))).toBe(true);
  });

  it('catches overlapping conflicting thresholds on the same metric (warning)', () => {
    const r = checkStructuredPreregistration(basePlan({
      hypothesisIds: [h1],
      metricSpecs: [{ name: 'p@5', definition: 'd', role: 'primary', direction: 'higher_better' }],
      testSpecs: [
        { id: 't1', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1], prediction: 'supports', interpretation: 'np_test', threshold: 0.6, thresholdOp: '>=' },
        { id: 't2', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1], prediction: 'excludes', interpretation: 'np_test', threshold: 0.7, thresholdOp: '<=' },
      ],
      predictions: [{ hypothesisId: h1, observable: 'p@5', condition: 'on', expectedRelation: 'increases' }],
      expectedInfoGain: { decisionAtStake: 'x', ambiguitySource: 'y', discriminatingMetric: 'p@5', expectedSeparation: 'z' },
    }), known);
    expect(r.warnings.some((w) => w.includes('可能同时触发'))).toBe(true);
  });

  it('g3: two hypotheses with no conflicting prediction → non-competition warning; missing VOI → error', () => {
    const r = checkStructuredPreregistration(basePlan({
      hypothesisIds: [h1, h2],
      metricSpecs: [{ name: 'p@5', definition: 'd', role: 'primary', direction: 'higher_better' }],
      testSpecs: [{ id: 't1', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1, h2], prediction: 'supports', interpretation: 'np_test', threshold: 0.6, thresholdOp: '>=' }],
      predictions: [
        { hypothesisId: h1, observable: 'p@5', condition: 'on', expectedRelation: 'increases' },
        { hypothesisId: h2, observable: 'p@5', condition: 'on', expectedRelation: 'increases' },
      ],
    }), known);
    expect(r.warnings.some((w) => w.includes('判别性预测'))).toBe(true);
    expect(r.errors.some((e) => e.includes('expectedInfoGain 缺失'))).toBe(true);
  });

  it('g3: genuinely competing predictions produce no non-competition warning', () => {
    const r = checkStructuredPreregistration(basePlan({
      hypothesisIds: [h1, h2],
      metricSpecs: [{ name: 'p@5', definition: 'd', role: 'primary', direction: 'higher_better' }],
      testSpecs: [{ id: 't1', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1, h2], prediction: 'supports', interpretation: 'np_test', threshold: 0.6, thresholdOp: '>=' }],
      predictions: [
        { hypothesisId: h1, observable: 'p@5', condition: 'on', expectedRelation: 'increases' },
        { hypothesisId: h2, observable: 'p@5', condition: 'on', expectedRelation: 'decreases' },
      ],
      expectedInfoGain: { decisionAtStake: 'x', ambiguitySource: 'y', discriminatingMetric: 'p@5', expectedSeparation: 'z' },
    }), known);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('判别性预测'))).toBe(false);
  });

  it('a discriminated hypothesis without a prediction entry warns non-crucial', () => {
    const r = checkStructuredPreregistration(basePlan({
      hypothesisIds: [h1, h2],
      metricSpecs: [{ name: 'p@5', definition: 'd', role: 'primary', direction: 'higher_better' }],
      testSpecs: [{ id: 't1', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1], prediction: 'supports', interpretation: 'np_test', threshold: 0.6, thresholdOp: '>=' }],
      predictions: [{ hypothesisId: h1, observable: 'p@5', condition: 'on', expectedRelation: 'increases' }],
      expectedInfoGain: { decisionAtStake: 'x', ambiguitySource: 'y', discriminatingMetric: 'p@5', expectedSeparation: 'z' },
    }), known);
    expect(r.warnings.some((w) => w.includes(h2) && w.includes('non-crucial'))).toBe(true);
  });
});

describe('g13 freeze triplet', () => {
  it('hash is stable for equal content and changes when content changes', () => {
    const a = basePlan();
    const b = ResearchPlan.parse({ ...a });
    expect(planContentHash(a)).toBe(planContentHash(b));
    const c = ResearchPlan.parse({ ...a, objective: 'changed' });
    expect(planContentHash(a)).not.toBe(planContentHash(c));
  });

  it('server/audit fields do not affect the hash', () => {
    const a = basePlan();
    const frozen = freezePlan(a, '2026-08-23T00:00:00.000Z');
    const mutated = ResearchPlan.parse({ ...a, planHash: frozen.planHash, frozenAt: frozen.frozenAt });
    expect(planContentHash(mutated)).toBe(frozen.planHash);
  });

  it('audit: registered+unchanged compliant; drift flagged; deviation append is immutable', () => {
    const plan = basePlan();
    const frozen = freezePlan(plan, '2026-08-23T00:00:00.000Z');
    const registered = ResearchPlan.parse({ ...plan, planHash: frozen.planHash, frozenAt: frozen.frozenAt });
    expect(auditPlanCompliance(registered).compliant).toBe(true);
    const drifted = ResearchPlan.parse({ ...registered, objective: 'revised after registration' });
    const audit = auditPlanCompliance(drifted);
    expect(audit.compliant).toBe(false);
    expect(audit.note).toContain('偏离');
    const withDeviation = recordPlanDeviation(registered, {
      at: '2026-08-23T00:00:00.000Z', what: 'sample cut', why: 'corrupt file', consequence: 'n reduced',
    });
    expect(withDeviation.deviations).toHaveLength(1);
    expect(registered.deviations).toHaveLength(0);
    expect(withDeviation.deviations[0]?.id).toMatch(/^dev_/);
  });

  it('unregistered plan audits as RR-stage-1 incomplete', () => {
    const audit = auditPlanCompliance(basePlan());
    expect(audit.registered).toBe(false);
    expect(audit.note).toContain('未注册冻结');
  });
});

describe('g6 alpha spend ledger', () => {
  it('accumulates per-hypothesis α across plan versions', () => {
    const h1 = hyp();
    const v1 = basePlan({ hypothesisIds: [h1], testSpecs: [
      { id: 't1', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1], prediction: 'supports', interpretation: 'np_test', alpha: 0.025, threshold: 0.6, thresholdOp: '>=' },
    ] });
    const v2 = basePlan({ hypothesisIds: [h1], testSpecs: [
      { id: 't2', metric: 'p@5', statistic: 'permutation', hypothesisIds: [h1], prediction: 'supports', interpretation: 'np_test', alpha: 0.025, threshold: 0.65, thresholdOp: '>=' },
    ] });
    const ledger = alphaSpendLedger([v1, v2]);
    const row = ledger.find((r) => r.hypothesisId === h1);
    expect(row).toBeDefined();
    expect(row?.versions).toBe(2);
    expect(row?.totalAlpha).toBeCloseTo(0.05, 10);
  });
});
