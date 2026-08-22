import { describe, it, expect } from 'vitest';
import {
  extractNumericTokens, whitelistMatches, numericProvenanceAudit,
} from '../src/shared/numeric-provenance.js';
import { checkStructuredPreregistration } from '../src/pipeline/stages/plan-formal.js';
import { ResearchPlan, newId } from '../src/domain/index.js';

/**
 * Wave-S/s5 (g11-lite) — numeric provenance. Extraction filters and whitelist matching
 * are the machinery; the plan-level advisory is the wired consumer.
 */

describe('extractNumericTokens', () => {
  it('keeps decimals and meaningful integers; drops structural noise', () => {
    const text = [
      'precision@5 >= 0.65 within 3 steps after 2020, section 7a, task_1abc,',
      'hash 9f2c41aa, date 2026-08-23, n_estimators=200, alpha=0.05, 66.7% pass',
    ].join(' ');
    const values = extractNumericTokens(text).map((t) => t.value);
    expect(values).toContain(0.65);
    expect(values).toContain(200);
    expect(values).toContain(0.05);
    expect(values).toContain(66.7);
    expect(values).not.toContain(3); // small integer
    expect(values).not.toContain(7); // section number
    expect(values).not.toContain(2020); // year-like
    expect(values).not.toContain(2026); // ISO date prefix
    expect(values).not.toContain(23); // date day / small int
  });

  it('whitelist matching bridges rounding and percent ↔ fraction', () => {
    expect(whitelistMatches(0.653, [0.65283])).toBe(true);
    expect(whitelistMatches(65, [0.65])).toBe(true);
    expect(whitelistMatches(0.65, [65])).toBe(true);
    expect(whitelistMatches(0.75, [0.65])).toBe(false);
  });

  it('audit reports unverified tokens with context', () => {
    const audit = numericProvenanceAudit('accuracy 0.82 vs threshold 0.75', [0.82]);
    expect(audit.checked).toBe(2);
    expect(audit.unverified).toHaveLength(1);
    expect(audit.unverified[0]!.raw).toBe('0.75');
    expect(audit.unverified[0]!.context).toContain('threshold');
  });
});

describe('plan-level advisory (free-text numbers vs structured anchors)', () => {
  const h1 = newId('hyp');
  const base = (rules: Record<string, string>) => ResearchPlan.parse({
    id: newId('pln'),
    runId: newId('run'),
    objective: 'o',
    hypothesisIds: [h1],
    variables: [], controls: [], inclusionCriteria: [], exclusionCriteria: [],
    dataRequirements: [], toolRequirements: [],
    steps: [
      { id: newId('task'), title: 's1', kind: 'literature', inputs: [], outputs: [], method: 'm', failureConditions: ['f'], dependsOn: [] },
      { id: newId('task'), title: 's2', kind: 'experiment', inputs: [], outputs: [], method: 'm', failureConditions: ['f'], dependsOn: [] },
      { id: newId('task'), title: 's3', kind: 'data_analysis', inputs: [], outputs: [], method: 'm', failureConditions: ['f'], dependsOn: [] },
    ],
    metrics: ['accuracy'],
    statistics: [],
    decisionRules: {
      successCriterion: rules.success ?? 'success',
      weakeningCriterion: 'weaken',
      falsificationCriterion: 'falsify',
      stopCriterion: 'stop',
    },
    confounders: [], alternativeExplanations: [], risks: [], ethics: [], prerequisites: [],
    reproducibilityRequirements: [], evidenceClaimIds: [],
    createdAt: new Date().toISOString(),
  });

  const structuredOver = {
    metricSpecs: [{ name: 'accuracy', definition: 'share correct', role: 'primary' as const, direction: 'higher_better' as const }],
    testSpecs: [{ id: 't1', metric: 'accuracy', statistic: 'permutation' as const, hypothesisIds: [h1], prediction: 'supports' as const, interpretation: 'np_test' as const, alpha: 0.05, threshold: 0.75, thresholdOp: '>=' as const }],
    predictions: [{ hypothesisId: h1, observable: 'accuracy', condition: 'on', expectedRelation: 'increases' }],
  };

  it('a free-text threshold matching the structured anchor produces no warning', () => {
    const r = checkStructuredPreregistration(
      { hypothesisIds: [h1], alternativeBranches: [], ...structuredOver, decisionRules: base({ success: 'accuracy >= 0.75' }).decisionRules },
      [h1],
    );
    expect(r.warnings.some((w) => w.includes('无锚点'))).toBe(false);
  });

  it('a free-text number with no structured anchor is disclosed as stipulation', () => {
    const r = checkStructuredPreregistration(
      { hypothesisIds: [h1], alternativeBranches: [], ...structuredOver, decisionRules: base({ success: 'accuracy >= 0.82' }).decisionRules },
      [h1],
    );
    expect(r.warnings.some((w) => w.includes('0.82') && w.includes('model-stipulated'))).toBe(true);
  });
});
