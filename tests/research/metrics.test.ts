// tests/research/metrics.test.ts
// Program-computed evaluation metrics (§14.3): every value derives from the
// frozen ResearchRun — no hand-edited numbers, no model self-grades.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRunMetrics } from '../../src/research/evaluation/metrics.ts';
import type { ResearchRun, ScorecardDimension, ScorecardDimensionName, ScoreGrade } from '../../src/research/types.ts';
import type { StrategyId } from '../../src/discovery/types.ts';

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
    schemaVersion: 3,
    citationGate: {
      boundRate: 1,
      totalCited: 0,
      boundCount: 0,
      unboundEvidenceCount: 0,
      resolvedViaRetrieval: [],
      perHypothesis: {},
      primaryRequiresAllBound: true,
      primaryAllBound: false,
      gateVerdict: 'PASS',
    },
    falsifiabilityGate: { perHypothesis: {}, allPassed: true },
    discovery: null,
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
          relations: [],
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
          relations: [],
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

  // ── Discriminating metrics (day-r10): the ablation pilot proved gate metrics
  //    saturate; these are the rows that can actually adjudicate a primitive. ──

  test('scorecardMeanGrade.<dim>: grade-point mean per dimension, NOT_APPLICABLE excluded, sorted names', () => {
    const dim = (name: ScorecardDimensionName, grade: ScoreGrade): ScorecardDimension => ({ name, grade, rationale: 'r', source: 'deterministic' });
    const run = baseRun({
      scorecards: {
        h1: { hypothesisId: 'h1', paretoOptimal: true, keyEvidenceToChangeConclusion: '', dimensions: [dim('Testability', 'A'), dim('NoveltyRelativeToCorpus', 'B')] },
        h2: { hypothesisId: 'h2', paretoOptimal: false, keyEvidenceToChangeConclusion: '', dimensions: [dim('Testability', 'F'), dim('NoveltyRelativeToCorpus', 'NOT_APPLICABLE')] },
      },
    });
    const report = computeRunMetrics(run, 'PASS', 't');
    const testability = report.metrics.find((m) => m.name === 'scorecardMeanGrade.Testability');
    assert.equal(testability?.value, 2); // (4 + 0) / 2
    const novelty = report.metrics.find((m) => m.name === 'scorecardMeanGrade.NoveltyRelativeToCorpus');
    assert.equal(novelty?.value, 3); // NA excluded: 3 / 1
    // Sorted emission order (deterministic).
    const dimNames = report.metrics.filter((m) => m.name.startsWith('scorecardMeanGrade.')).map((m) => m.name);
    assert.deepEqual(dimNames, [...dimNames].sort());
  });

  test('noveltyVsResearchMemoryGrade: surfaced standalone; null when no memory flags (absence is honest)', () => {
    const dim = (name: ScorecardDimensionName, grade: ScoreGrade): ScorecardDimension => ({ name, grade, rationale: 'r', source: 'deterministic' });
    const withMemory = computeRunMetrics(baseRun({
      scorecards: { h1: { hypothesisId: 'h1', paretoOptimal: true, keyEvidenceToChangeConclusion: '', dimensions: [dim('NoveltyVsResearchMemory', 'F')] } },
    }), 'PASS', 't');
    assert.equal(withMemory.metrics.find((m) => m.name === 'noveltyVsResearchMemoryGrade')?.value, 0);
    const without = computeRunMetrics(baseRun(), 'PASS', 't');
    assert.equal(without.metrics.find((m) => m.name === 'noveltyVsResearchMemoryGrade')?.value, null);
  });

  test('falsificationMetricDiversity: 1.0 when every hypothesis tests a different quantity; case-insensitive', () => {
    const h = (id: string, metric: string) => ({
      id,
      statement: 's',
      mechanism: 'm',
      falsificationMethod: { prediction: 'p', metric, comparator: 'gt' as const, value: 1 },
      supportingCitations: [],
      counterEvidenceCitations: [],
      relationToExistingTheory: '',
      alternativeExplanations: [],
      observablePredictions: [],
      distinguishingObservations: [],
      noveltyRelativeToCorpus: '',
      assumptions: [],
      risks: [],
    });
    const diverse = computeRunMetrics(baseRun({
      hypotheses: [h('a', 'pearson_r'), h('b', 'effect_size_cohens_d'), h('c', 'Pearson_R')],
    }), 'PASS', 't');
    // 'pearson_r' and 'Pearson_R' collapse (case-insensitive) → 2 distinct / 3.
    assert.equal(diverse.metrics.find((m) => m.name === 'falsificationMetricDiversity')?.value, 2 / 3);
  });

  test('strategyOriginDiversity: null on legacy arm (structurally absent), fractional on fan-out', () => {
    const h = (id: string, origin?: StrategyId) => ({
      id, statement: 's', mechanism: 'm',
      falsificationMethod: { prediction: 'p', metric: 'm1', comparator: 'gt' as const, value: 1 },
      supportingCitations: [], counterEvidenceCitations: [],
      relationToExistingTheory: '', alternativeExplanations: [],
      observablePredictions: [], distinguishingObservations: [],
      noveltyRelativeToCorpus: '', assumptions: [], risks: [],
      ...(origin !== undefined ? { strategyOrigin: origin } : {}),
    });
    const legacy = computeRunMetrics(baseRun({ hypotheses: [h('a'), h('b')] }), 'PASS', 't');
    assert.equal(legacy.metrics.find((m) => m.name === 'strategyOriginDiversity')?.value, null);
    const fanout = computeRunMetrics(baseRun({
      hypotheses: [h('a', 'induction'), h('b', 'induction'), h('c', 'analogy')],
    }), 'PASS', 't');
    assert.equal(fanout.metrics.find((m) => m.name === 'strategyOriginDiversity')?.value, 2 / 3);
  });

  test('paretoFrontSize counts non-dominated scorecards', () => {
    const dim = (grade: ScoreGrade): ScorecardDimension => ({ name: 'Testability', grade, rationale: 'r', source: 'deterministic' });
    const run = baseRun({
      scorecards: {
        h1: { hypothesisId: 'h1', paretoOptimal: true, keyEvidenceToChangeConclusion: '', dimensions: [dim('A')] },
        h2: { hypothesisId: 'h2', paretoOptimal: false, keyEvidenceToChangeConclusion: '', dimensions: [dim('B')] },
        h3: { hypothesisId: 'h3', paretoOptimal: true, keyEvidenceToChangeConclusion: '', dimensions: [dim('A')] },
      },
    });
    assert.equal(computeRunMetrics(run, 'PASS', 't').metrics.find((m) => m.name === 'paretoFrontSize')?.value, 2);
  });
});

describe('computeRunMetrics — generation-quality telemetry (day-r13, §4.2 R11)', () => {
  test('retry/truncation rates computed from model receipts; non-model receipts ignored', () => {
    const run = baseRun({
      stageReceipts: [
        {
          runId: 'r1', stageId: 'st', stageVersion: 1, attempt: 1, sequence: 1,
          component: 'model', mode: 'LIVE',
          provider: 'dashscope', endpointRegion: 'cn-hangzhou',
          modelId: 'qwen-max', requestId: 'req-1', modelSnapshot: 'unknown',
          tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, measured: true },
          latencyMs: 1200, retries: 0, finishReason: 'stop',
          cost: { amount: 0.003, currency: 'USD', status: 'billed' },
          inputHash: 'i', outputHash: 'o',
          corpusSnapshotId: null, corpusRootHash: null,
          dataSource: null, retrievedAt: null, parserVersion: null,
          promptTemplateHash: null,
          errors: [], provenanceStatus: 'complete', missingFields: [],
          createdAt: 't',
        },
        {
          runId: 'r1', stageId: 'st', stageVersion: 1, attempt: 1, sequence: 2,
          component: 'model', mode: 'LIVE',
          provider: 'dashscope', endpointRegion: 'cn-hangzhou',
          modelId: 'qwen-max', requestId: 'req-2', modelSnapshot: 'unknown',
          tokenUsage: { inputTokens: 200, outputTokens: 400, totalTokens: 600, measured: true },
          latencyMs: 2400, retries: 2, finishReason: 'stop',
          cost: { amount: 0.006, currency: 'USD', status: 'billed' },
          inputHash: 'i2', outputHash: 'o2',
          corpusSnapshotId: null, corpusRootHash: null,
          dataSource: null, retrievedAt: null, parserVersion: null,
          promptTemplateHash: null,
          errors: [], provenanceStatus: 'complete', missingFields: [],
          createdAt: 't',
        },
        {
          runId: 'r1', stageId: 'st', stageVersion: 1, attempt: 1, sequence: 3,
          component: 'model', mode: 'LIVE',
          provider: 'dashscope', endpointRegion: 'cn-hangzhou',
          modelId: 'qwen-max', requestId: 'req-3', modelSnapshot: 'unknown',
          tokenUsage: { inputTokens: 150, outputTokens: 250, totalTokens: 400, measured: true },
          latencyMs: 1800, retries: 1, finishReason: 'length',
          cost: { amount: 0.004, currency: 'USD', status: 'billed' },
          inputHash: 'i3', outputHash: 'o3',
          corpusSnapshotId: null, corpusRootHash: null,
          dataSource: null, retrievedAt: null, parserVersion: null,
          promptTemplateHash: null,
          errors: [], provenanceStatus: 'complete', missingFields: [],
          createdAt: 't',
        },
        {
          runId: 'r1', stageId: 'det', stageVersion: 1, attempt: 1, sequence: 4,
          component: 'deterministic', mode: 'RECORDED_REPLAY',
          provider: null, endpointRegion: null,
          modelId: null, requestId: null, modelSnapshot: 'unknown',
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, measured: true },
          latencyMs: 0, retries: 9, finishReason: 'stop',
          cost: { amount: 0, currency: 'USD', status: 'unavailable' },
          inputHash: 'i', outputHash: 'o',
          corpusSnapshotId: null, corpusRootHash: null,
          dataSource: null, retrievedAt: null, parserVersion: null,
          promptTemplateHash: null,
          errors: [], provenanceStatus: 'complete', missingFields: [],
          createdAt: 't',
        },
      ],
    });
    const report = computeRunMetrics(run, 'NOT_RUN', 't');
    const rate = report.metrics.find((m) => m.name === 'generationRetryRate')!;
    const trunc = report.metrics.find((m) => m.name === 'generationTruncationRate')!;
    const count = report.metrics.find((m) => m.name === 'generationRetryCount')!;
    assert.equal(rate.value, 2 / 3, 'two of three model calls needed retries');
    assert.equal(trunc.value, 1 / 3, 'one of three truncated at the token cap');
    assert.equal(count.value, 3, 'absolute rework volume 2+1');
  });

  test('zero model receipts -> telemetry rows absent (never divide by zero)', () => {
    const report = computeRunMetrics(baseRun(), 'NOT_RUN', 't');
    assert.equal(report.metrics.find((m) => m.name === 'generationRetryRate'), undefined);
    assert.equal(report.metrics.find((m) => m.name === 'generationTruncationRate'), undefined);
  });
});
