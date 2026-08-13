// tests/research/metrics.test.ts
// Program-computed evaluation metrics (§14.3): every value derives from the
// frozen ResearchRun — no hand-edited numbers, no model self-grades.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRunMetrics } from '../../src/research/evaluation/metrics.ts';
import type { ResearchRun } from '../../src/research/types.ts';

function baseRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    runId: 'r1',
    question: 'q?',
    gateReport: {
      question: 'q?',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: 'astronomy', domainHints: [], questionLength: 3 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: 't',
      schemaVersion: 1,
    },
    corpus: { snapshotId: 's', rootHash: 'h', documentCount: 0, documents: [], sourceQueries: ['q?', 'q? counter'], createdAt: 't' },
    hypotheses: [],
    bindings: {},
    critiques: {},
    scorecards: {},
    plan: {
      objectives: ['o1'],
      primaryHypothesisId: 'h1',
      alternativeHypothesisIds: [],
      preregisteredPredictions: [],
      dataRequirements: [],
      inclusionExclusionCriteria: [],
      variables: [],
      design: 'd',
      analysisDag: [],
      tools: [],
      statisticalMethods: [],
      sampleSizeRationale: 's',
      multiplicityHandling: 'm',
      missingOutlierStrategy: 'x',
      stoppingConditions: [],
      checkpoints: [],
      budget: 'b',
      risks: [],
      reproducibility: [],
      nextRoundDecisionRules: [],
      humanApprovalRequired: ['publication'],
    },
    revisions: [],
    observations: [],
    stageReceipts: [],
    environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v24', platform: 't', lockfileHash: null, packageVersion: null },
    modes: { modelExecutionMode: 'RECORDED_REPLAY', retrievalExecutionMode: 'RECORDED_REPLAY', experimentExecutionMode: 'NOT_EXECUTED' },
    runMode: 'RECORDED_REPLAY',
    startedAt: 't',
    schemaVersion: 2,
    ...overrides,
  } satisfies ResearchRun;
}

describe('computeRunMetrics', () => {
  test('citationBindingRate = 1.0 and unboundEvidenceCount = 0 for fully bound runs', () => {
    const run = baseRun({
      hypotheses: [
        {
          id: 'h1',
          statement: 's1',
          mechanism: 'm1',
          falsificationMethod: { prediction: 'p', metric: 'pearson_r', comparator: 'gt', value: 0.5 },
          supportingCitations: ['docA'],
          counterEvidenceCitations: ['docB'],
          relationToExistingTheory: '',
          alternativeExplanations: [],
          observablePredictions: [],
          distinguishingObservations: [],
          noveltyRelativeToCorpus: '',
          assumptions: [],
          risks: [],
        },
      ],
      bindings: {
        h1: {
          supportingIds: ['docA'],
          counterIds: ['docB'],
          boundSupporting: [{ documentId: 'docA' } as never],
          boundCounter: [{ documentId: 'docB' } as never],
          unbound: [],
          allBound: true,
          snapshotId: 's',
        },
      },
    });
    const report = computeRunMetrics(run, 'PASS', 't');
    const binding = report.metrics.find((m) => m.name === 'citationBindingRate');
    assert.equal(binding?.value, 1);
    const unbound = report.metrics.find((m) => m.name === 'unboundEvidenceCount');
    assert.equal(unbound?.value, 0);
    assert.equal(report.deterministicRecompute, 'PASS');
  });

  test('unbound citations are counted (fail-open signal, never hidden)', () => {
    const run = baseRun({
      hypotheses: [
        {
          id: 'h1',
          statement: 's1',
          mechanism: 'm1',
          falsificationMethod: { prediction: 'p', metric: 'm', comparator: 'gt', value: 1 },
          supportingCitations: ['docA', 'ghost-id'],
          counterEvidenceCitations: [],
          relationToExistingTheory: '',
          alternativeExplanations: [],
          observablePredictions: [],
          distinguishingObservations: [],
          noveltyRelativeToCorpus: '',
          assumptions: [],
          risks: [],
        },
      ],
      bindings: {
        h1: {
          supportingIds: ['docA', 'ghost-id'],
          counterIds: [],
          boundSupporting: [{ documentId: 'docA' } as never],
          boundCounter: [],
          unbound: ['ghost-id'],
          allBound: false,
          snapshotId: 's',
        },
      },
    });
    const report = computeRunMetrics(run, 'FAIL', 't');
    const unbound = report.metrics.find((m) => m.name === 'unboundEvidenceCount');
    assert.equal(unbound?.value, 1);
    assert.equal(report.deterministicRecompute, 'FAIL');
  });

  test('counter-evidence query count derives from corpus sourceQueries', () => {
    const run = baseRun({
      corpus: {
        snapshotId: 's',
        rootHash: 'h',
        documentCount: 0,
        documents: [],
        sourceQueries: ['q?', 'q? failure to replicate', 'q? null result', 'sub-q1'],
        createdAt: 't',
      },
    });
    const report = computeRunMetrics(run, 'NOT_RUN', 't');
    const counter = report.metrics.find((m) => m.name === 'counterEvidenceQueryCount');
    assert.equal(counter?.value, 3);
  });

  test('planCompleteness counts non-empty fields only', () => {
    const empty = computeRunMetrics(baseRun(), 'PASS', 't');
    const fullPlan = baseRun({
      plan: {
        objectives: ['o1'],
        primaryHypothesisId: 'h1',
        alternativeHypothesisIds: [],
        preregisteredPredictions: ['p1'],
        dataRequirements: ['d1'],
        inclusionExclusionCriteria: ['i1'],
        variables: ['v1'],
        design: 'design',
        analysisDag: ['step1'],
        tools: ['python'],
        statisticalMethods: ['pearson'],
        sampleSizeRationale: 'n>=30',
        multiplicityHandling: 'bonferroni',
        missingOutlierStrategy: 'listwise',
        stoppingConditions: ['stop1'],
        checkpoints: ['c1'],
        budget: 'b',
        risks: ['r1'],
        reproducibility: ['seed'],
        nextRoundDecisionRules: ['rule1'],
        humanApprovalRequired: ['publication'],
      },
    });
    const full = computeRunMetrics(fullPlan, 'PASS', 't');
    const emptyC = empty.metrics.find((m) => m.name === 'planCompleteness');
    const fullC = full.metrics.find((m) => m.name === 'planCompleteness');
    assert.ok((fullC?.value as number) > (emptyC?.value as number));
    assert.equal(fullC?.value, 1);
  });

  test('human-rubric metrics are listed, never auto-scored', () => {
    const report = computeRunMetrics(baseRun(), 'PASS', 't');
    assert.ok(report.humanRubricMetrics.length >= 5);
    for (const m of report.metrics) {
      assert.ok(!m.name.toLowerCase().includes('plausibility'), 'model-quality text is not auto-scored');
    }
  });
});
