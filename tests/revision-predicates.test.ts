import { describe, it, expect } from 'vitest';
import {
  decisionRulePreservation,
  falsifiabilityRetention,
  scopeDelta,
  revisionPredicates,
  type HypothesisSnapshot,
} from '../src/domain/revision-predicates.js';

// RU-14 A8.4 — deterministic revision-quality predicates over before/after
// hypothesis snapshots (packet ruling: BUILD pure functions; LLM advisory
// layer comes later, live-gated). No LLM here by construction.

const baseHyp = (over: Partial<HypothesisSnapshot> = {}): HypothesisSnapshot => ({
  id: 'hyp_test000000000000000000001',
  version: 0,
  status: 'active',
  statement: 'Sleep spindles mediate declarative memory consolidation.',
  mechanism: 'Thalamocortical spindle activity gates hippocampal replay.',
  predictions: ['Spindle density correlates with recall improvement'],
  testability: 'testable_now',
  falsification: {
    observable: 'overnight recall delta',
    measurement: 'paired-associate task',
    expectedRelation: 'positive',
    decisionRule: 'support if r >= 0.30',
    supportCondition: 'r >= 0.30',
    weakeningCondition: '0.10 <= r < 0.30',
    falsificationCondition: 'r < 0.10',
    confounders: [],
    alternativeExplanations: [],
    dataRequirements: [],
    method: 'correlational',
    failureInterpretation: 'no measurable link under this design',
  },
  ...over,
});

describe('decisionRulePreservation', () => {
  it('preserved when every rule survives verbatim', () => {
    const r = decisionRulePreservation(baseHyp(), baseHyp({ version: 1 }));
    expect(r.preserved).toBe(true);
    expect(r.changedRules).toHaveLength(0);
    expect(r.droppedRules).toHaveLength(0);
  });
  it('flags a changed rule text as not-preserved with the diff named', () => {
    const after = baseHyp({ version: 1 });
    after.falsification!.decisionRule = 'support if r >= 0.50';
    const r = decisionRulePreservation(baseHyp(), after);
    expect(r.preserved).toBe(false);
    expect(r.changedRules).toContain('decisionRule');
  });
  it('flags a dropped falsification spec outright', () => {
    const after = baseHyp({ version: 1 });
    delete after.falsification;
    const r = decisionRulePreservation(baseHyp(), after);
    expect(r.preserved).toBe(false);
    expect(r.droppedRules).toContain('falsification');
  });
});

describe('falsifiabilityRetention', () => {
  it('retained when still testable and spec intact', () => {
    const r = falsifiabilityRetention(baseHyp(), baseHyp({ version: 1 }));
    expect(r.retained).toBe(true);
  });
  it('not retained when testability degrades to unfalsifiable', () => {
    const after = baseHyp({ version: 1, testability: 'unfalsifiable' });
    expect(falsifiabilityRetention(baseHyp(), after).retained).toBe(false);
  });
  it('not retained when a prediction disappears without replacement', () => {
    const after = baseHyp({ version: 1, predictions: [] });
    const r = falsifiabilityRetention(baseHyp(), after);
    expect(r.retained).toBe(false);
    expect(r.detail).toContain('prediction');
  });
});

describe('scopeDelta', () => {
  it('zero delta on identical snapshots', () => {
    const d = scopeDelta(baseHyp(), baseHyp({ version: 1 }));
    expect(d.changedStatements).toBe(0);
    expect(d.totalConsidered).toBeGreaterThan(0);
    expect(d.ratio).toBe(0);
  });
  it('counts only real field changes; ratio in [0,1]', () => {
    const after = baseHyp({ version: 1, mechanism: 'A different mechanistic story entirely.' });
    const d = scopeDelta(baseHyp(), after);
    expect(d.changedStatements).toBe(1);
    expect(d.ratio).toBeGreaterThan(0);
    expect(d.ratio).toBeLessThanOrEqual(1);
  });
});

describe('revisionPredicates composite', () => {
  it('produces an honest verdict vector for a benign refinement', () => {
    const v = revisionPredicates(baseHyp(), baseHyp({ version: 1, uncertainties: ['new caveat'] }));
    expect(v.decisionRulesPreserved).toBe(true);
    expect(v.falsifiabilityRetained).toBe(true);
    expect(v.scope.ratio).toBeLessThan(0.5);
  });
  it('flags a rule-tightening rewrite that also drops testability', () => {
    const after = baseHyp({ version: 1, testability: 'unfalsifiable' });
    after.falsification!.decisionRule = 'support if r >= 0.90';
    const v = revisionPredicates(baseHyp(), after);
    expect(v.decisionRulesPreserved).toBe(false);
    expect(v.falsifiabilityRetained).toBe(false);
  });
});
