import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { parseCsv } from '../src/experiment/csv.js';
import { applySplit } from '../src/experiment/split.js';
import { datasetIdFor, acquireDataset } from '../src/experiment/datasets.js';
import { executeExperiment } from '../src/experiment/executor.js';
import { expandAblationModels } from '../src/experiment/matrix.js';
import { exportStage } from '../src/pipeline/stages/export.js';
import { reviseStage } from '../src/pipeline/stages/revise.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { ProvenanceReceipt, type ResearchRun } from '../src/domain/index.js';
import type { StageContext } from '../src/pipeline/types.js';
import {
  ResearchQuestion, HypothesisCandidate, newId,
  checkExperimentSpec, mechanicalVerdict,
  type ExperimentSpec,
} from '../src/domain/index.js';

// ---- shared fixtures ----

const makeStore = (): { store: Store; dir: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'farlab-eel-'));
  const db = openDb(join(dir, 't.db'));
  return {
    store: new Store(db),
    dir,
    cleanup: () => {
      try { db.close(); } catch { /* already closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag; OS temp cleanup covers it */ }
    },
  };
};

const makeRun = (store: Store): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'does feature X separate the classes better than majority guessing?', background: '',
    goalType: 'explanatory', scope: { domain: 'tabular-ml', phenomena: ['classification'] },
    constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  store.createRun(q);
  return store.listRuns(1)[0]!.id;
};

const makeHypothesis = (runId: string) =>
  HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'feature X separates classes: trained model beats majority baseline on accuracy',
    derivation: { strategy: 'evidence_conditioned', rationale: 'fixture' },
    createdAt: new Date().toISOString(),
  });

/** Deterministic synthetic binary-classification CSV: x1 separates the classes cleanly. */
const fixtureCsv = (nPerClass = 60): string => {
  const rows: string[] = ['x0,x1,x2,label'];
  for (let i = 0; i < nPerClass; i += 1) {
    rows.push(`${(i % 7) * 0.5},${2.0 + (i % 13) * 0.1},${(i % 5) * 0.3},pos`);
    rows.push(`${(i % 6) * 0.5},${0.2 + (i % 11) * 0.1},${(i % 4) * 0.3},neg`);
  }
  return rows.join('\n') + '\n';
};

const makeSpec = (runId: string, csvPath: string, hypothesisId: string): ExperimentSpec => ({
  id: newId('xsp') as ExperimentSpec['id'],
  runId: runId as ExperimentSpec['runId'],
  planId: newId('pln') as ExperimentSpec['planId'],
  planStepId: newId('task') as ExperimentSpec['planStepId'],
  version: 1,
  question: 'feature separation',
  datasets: [{
    source: { resolver: 'local', path: csvPath },
    targetColumn: 'label',
    split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 },
  }],
  models: [
    { name: 'baseline', builderId: 'dummy_most_frequent', hyperparams: {}, seed: 0 },
    { name: 'logistic', builderId: 'logistic_regression', hyperparams: { C: 1.0, max_iter: 500 }, seed: 7 },
  ],
  metrics: ['accuracy'],
  comparisons: [{
    id: 'cmp-primary', metricKey: 'accuracy', kind: 'paired_diff',
    modelAIdx: 1, modelBIdx: 0, direction: 'above', threshold: 0,
    thresholdProvenance: 'model-stipulated', hypothesisId: hypothesisId as ExperimentSpec['comparisons'][number]['hypothesisId'],
    primary: true, mde: 0.3,
  }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 500, analysisSeed: 11, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 120_000 },
  approvals: [{
    hypothesisId: hypothesisId as ExperimentSpec['approvals'][number]['hypothesisId'],
    comparisonIds: ['cmp-primary'],
    decisionRuleSnapshot: 'trained model accuracy above majority baseline (diff > 0)',
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }],
  createdAt: new Date().toISOString(),
});

// ---- unit: csv ----

describe('E2 csv parser', () => {
  it('parses quoted fields, embedded commas/quotes and CRLF line endings', () => {
    const parsed = parseCsv('a,b,c\r\n"x,1","y""q",z\r\n1,2,3\n');
    expect(parsed.header).toEqual(['a', 'b', 'c']);
    expect(parsed.rows).toEqual([['x,1', 'y"q', 'z'], ['1', '2', '3']]);
  });
  it('fails closed on ragged rows and empty headers', () => {
    expect(() => parseCsv('a,b\n1,2,3')).toThrow('fields');
    expect(() => parseCsv('a,,b\n1,2,3')).toThrow('empty column');
    expect(() => parseCsv('a,b\n')).toThrow('no data rows');
  });
});

// ---- unit: split ----

describe('E2 deterministic split', () => {
  const header = ['x', 'c'];
  const rows = Array.from({ length: 200 }, (_, i) => [String(i), i % 2 === 0 ? 'a' : 'b']);
  const split = { method: 'random_stratified' as const, ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 };

  it('same seed reproduces the exact partition; different seed does not', () => {
    const base = { datasetRecordId: newId('ds') as never, datasetContentRef: 'sha256:' + 'a'.repeat(64), targetColumn: 'c', split };
    const o1 = applySplit(header, rows, base);
    const o2 = applySplit(header, rows, base);
    const o3 = applySplit(header, rows, { ...base, split: { ...split, seed: 43 } });
    expect(o1).toEqual(o2);
    expect(o1.specHash).toBe(o2.specHash);
    expect(o1.testIdx).not.toEqual(o3.testIdx);
  });
  it('stratifies: both classes appear in train and test with exact ratio counts', () => {
    const o = applySplit(header, rows, { datasetRecordId: newId('ds') as never, datasetContentRef: 'sha256:' + 'a'.repeat(64), targetColumn: 'c', split });
    expect(o.trainIdx).toHaveLength(140);
    expect(o.testIdx).toHaveLength(60);
    const classes = (idx: number[]) => new Set(idx.map((i) => rows[i]?.[1]));
    for (const set of [classes(o.trainIdx), classes(o.testIdx)]) {
      expect(set.has('a')).toBe(true);
      expect(set.has('b')).toBe(true);
    }
  });
  it('group split keeps every group in exactly one partition', () => {
    const grouped = Array.from({ length: 60 }, (_, i) => [String(i), `g${Math.floor(i / 2)}`]);
    const o = applySplit(['x', 'g'], grouped, {
      datasetRecordId: newId('ds') as never, datasetContentRef: 'sha256:' + 'a'.repeat(64),
      targetColumn: 'g', groupColumn: 'g',
      split: { method: 'random', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 5 },
    });
    const all = [...o.trainIdx, ...o.valIdx, ...o.testIdx].sort((a, b) => a - b);
    expect(all).toHaveLength(60);
    const gOf = (i: number) => grouped[i]?.[1];
    const trainGroups = new Set(o.trainIdx.map(gOf));
    const testGroups = new Set(o.testIdx.map(gOf));
    for (const g of trainGroups) expect(testGroups.has(g)).toBe(false);
  });
});

// ---- unit: validator + verdict + identity ----

describe('E1 spec validation (fail-closed)', () => {
  const csvPath = 'C:/definitely/not/used.csv';
  const hyp = newId('hyp');
  const base = makeSpec('run_' + 'a'.repeat(26), csvPath, hyp);

  it('rejects local datasets without the operator flag (LLM cannot read arbitrary paths)', () => {
    const r = checkExperimentSpec(base, { hypothesisIds: [hyp as never] });
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toContain('allowLocalDatasets');
  });
  it('rejects a hypothesis-bound comparison lacking an approval (D-085 P0-1)', () => {
    const r = checkExperimentSpec({ ...base, approvals: [] }, { hypothesisIds: [hyp as never], allowLocalDatasets: true });
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toContain('lacks a binding approval');
  });
  it('rejects exploratory-only specs without an explicit exploratoryNote', () => {
    const exploratory = { ...base, approvals: [], comparisons: base.comparisons.map((c) => ({ ...c, hypothesisId: undefined, primary: false })) };
    const r = checkExperimentSpec(exploratory, { hypothesisIds: [hyp as never], allowLocalDatasets: true });
    expect(r.passed).toBe(false);
    expect(r.missing.join(' ')).toContain('exploratoryNote');
  });
  it('rejects out-of-range model references and self-comparison', () => {
    const bad = { ...base, comparisons: [{ ...base.comparisons[0]!, id: 'x', modelAIdx: 9 }] };
    const r = checkExperimentSpec(bad as never, { hypothesisIds: [hyp as never], allowLocalDatasets: true });
    expect(r.missing.join(' ')).toContain('modelAIdx out of range');
    const self = { ...base, comparisons: [{ ...base.comparisons[0]!, modelBIdx: 1 }] };
    const r2 = checkExperimentSpec(self, { hypothesisIds: [hyp as never], allowLocalDatasets: true });
    expect(r2.missing.join(' ')).toContain('compares a model with itself');
  });
  it('multiple comparisons require exactly one primary and a policy', () => {
    const two = {
      ...base,
      comparisons: [
        { ...base.comparisons[0]!, primary: false },
        { ...base.comparisons[0]!, id: 'c2', hypothesisId: undefined, primary: false },
      ],
    };
    const r = checkExperimentSpec(two, { hypothesisIds: [hyp as never], allowLocalDatasets: true });
    expect(r.missing.join(' ')).toContain('exactly one primary');
    expect(r.missing.join(' ')).toContain('multipleTestingPolicy');
  });
  it('rejects e_value_accumulation loudly (unimplemented policy is never silently downgraded)', () => {
    const r = checkExperimentSpec(base, { hypothesisIds: [hyp as never], allowLocalDatasets: true });
    const ev = checkExperimentSpec(
      { ...base, statistics: { ...base.statistics, multipleTestingPolicy: 'e_value_accumulation' } },
      { hypothesisIds: [hyp as never], allowLocalDatasets: true },
    );
    expect(r.passed).toBe(true);
    expect(ev.passed).toBe(false);
    expect(ev.missing.join(' ')).toContain('e_value_accumulation');
  });
  it('passes a fully valid spec with approval and flag', () => {
    const r = checkExperimentSpec(base, { hypothesisIds: [hyp as never], allowLocalDatasets: true });
    expect(r.missing).toEqual([]);
  });
});

describe('E4 mechanical verdict', () => {
  const rule = { direction: 'above' as const, threshold: 0.8 };
  it('supports only when the CI is entirely beyond the threshold', () => {
    expect(mechanicalVerdict(rule, { low: 0.81, high: 0.9 })).toBe('supports');
  });
  it('falsifies when the CI is entirely on the opposite side', () => {
    expect(mechanicalVerdict(rule, { low: 0.5, high: 0.79 })).toBe('falsifies');
  });
  it('inconclusive when the CI crosses the threshold — never a coin-flip', () => {
    expect(mechanicalVerdict(rule, { low: 0.75, high: 0.85 })).toBe('inconclusive');
    expect(mechanicalVerdict({ direction: 'below', threshold: 0.1 }, { low: 0.05, high: 0.15 })).toBe('inconclusive');
  });
});

describe('E2 dataset identity', () => {
  it('source-derived id is stable across calls and differs across sources', () => {
    const a = datasetIdFor({ resolver: 'openml', openmlId: 61 });
    expect(a).toBe(datasetIdFor({ resolver: 'openml', openmlId: 61 }));
    expect(a).not.toBe(datasetIdFor({ resolver: 'openml', openmlId: 62 }));
    expect(a).toMatch(/^ds_[0-9a-z]{20,32}$/);
  });
});

// ---- integration: real sidecar, real training (no mocks on the capability) ----

describe('EEL executor end-to-end (real uv sidecar)', { timeout: 240_000 }, () => {
  it('runs a full experiment: dataset -> split -> train -> stats -> verdict -> feedback', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);

      const out = await executeExperiment(store, artifacts, spec, { allowLocalDatasets: true });

      expect(out.run.status).toBe('completed');
      expect(out.resultSet.cells).toHaveLength(2);
      const logistic = out.resultSet.cells.find((c) => c.modelName === 'logistic');
      const baseline = out.resultSet.cells.find((c) => c.modelName === 'baseline');
      expect(logistic && baseline).toBeTruthy();
      // The fixture separates classes cleanly: logistic must decisively beat majority guessing.
      expect(logistic!.metrics.accuracy ?? 0).toBeGreaterThan(baseline!.metrics.accuracy ?? 1);
      expect(out.statReports).toHaveLength(1);
      const rep = out.statReports[0]!;
      expect(['supports', 'inconclusive']).toContain(rep.verdict);
      expect(rep.exploratory).toBe(false);
      expect(rep.hypothesisVersion).toBe(0);
      expect(rep.thresholdProvenance).toBe('model-stipulated');
      expect(rep.verdictDerivation).toContain('threshold source: model-stipulated');
      expect(rep.analysisIteration).toBe(1);
      expect(out.feedback).toHaveLength(1);
      expect(out.feedback[0]!.source).toBe('experiment');
      expect(out.feedback[0]!.target).toEqual({ kind: 'hypothesis', id: hyp.id });
      // Persisted truth agrees with the returned projection.
      const persistedRun = store.getObject('experiment_run', out.run.id);
      expect(persistedRun?.status).toBe('completed');
      const events = store.listEvents(runId).map((e) => e.type);
      expect(events).toContain('experiment_queued');
      expect(events).toContain('experiment_started');
      expect(events).toContain('experiment_completed');
      expect(events).toContain('feedback_received');
    } finally {
      cleanup();
    }
  });

  it('determinism gate: a fresh run with identical (spec, seed, env) reproduces identical results', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const results = [] as { metrics: Record<string, number>; point: number }[];
      for (let round = 0; round < 2; round += 1) {
        const runId = makeRun(store);
        const hyp = makeHypothesis(runId);
        store.putObject('hypothesis', hyp);
        const spec = makeSpec(runId, csvPath, hyp.id);
        const out = await executeExperiment(store, artifacts, spec, { allowLocalDatasets: true });
        const logistic = out.resultSet.cells.find((c) => c.modelName === 'logistic')!;
        results.push({ metrics: logistic.metrics, point: out.statReports[0]!.pointEstimate });
      }
      expect(results[0]!.metrics).toEqual(results[1]!.metrics);
      expect(results[0]!.point).toBe(results[1]!.point); // same analysisSeed bootstrap
    } finally {
      cleanup();
    }
  });

  it('sequential re-analysis on the same dataset is labelled exploratory and produces no feedback', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      await executeExperiment(store, artifacts, makeSpec(runId, csvPath, hyp.id), { allowLocalDatasets: true });
      const second = await executeExperiment(store, artifacts, makeSpec(runId, csvPath, hyp.id), { allowLocalDatasets: true });
      const rep = second.statReports[0]!;
      expect(rep.analysisIteration).toBe(2);
      expect(rep.exploratory).toBe(true);
      expect(rep.verdict).toBeUndefined();
      expect(second.feedback).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('failure path: sidecar rejection marks the run failed with the verbatim error', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);
      const poisoned: ExperimentSpec = {
        ...spec,
        models: [
          spec.models[0]!,
          { ...spec.models[1]!, hyperparams: { not_a_real_param: true } },
        ],
      };
      await expect(executeExperiment(store, artifacts, poisoned, { allowLocalDatasets: true })).rejects.toThrow(/experiment .* failed/);
      const failedRun = store.listObjects('experiment_run', runId).at(-1);
      expect(failedRun?.status).toBe('failed');
      expect(failedRun?.error).toContain('not_a_real_param');
      const events = store.listEvents(runId).map((e) => e.type);
      expect(events).toContain('experiment_failed');
    } finally {
      cleanup();
    }
  });

  it('dataset acquisition dedups: the same local file resolves to one dataset_record', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const use = makeSpec(runId, csvPath, newId('hyp')).datasets[0]!;
      const a1 = await acquireDataset(store, artifacts, runId as never, use);
      const a2 = await acquireDataset(store, artifacts, runId as never, use);
      expect(a1.record.id).toBe(a2.record.id);
      expect(store.listObjects('dataset_record', runId)).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('P2 alpha_spending: multi-comparison run adjusts alpha, labels all confirmatory, feeds feedback', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);
      spec.models.push({ name: 'rf', builderId: 'random_forest_classifier', hyperparams: { n_estimators: 50 }, seed: 3, tags: [] });
      spec.comparisons = [
        { ...spec.comparisons[0]!, primary: true },
        { ...spec.comparisons[0]!, id: 'cmp-rf-vs-baseline', modelAIdx: 2, primary: false },
      ];
      spec.statistics = { ...spec.statistics, multipleTestingPolicy: 'alpha_spending', multipleTestingNote: 'equal split over 2 confirmatory comparisons' };
      spec.approvals[0]!.comparisonIds = ['cmp-primary', 'cmp-rf-vs-baseline'];

      const out = await executeExperiment(store, artifacts, spec, { allowLocalDatasets: true });
      expect(out.run.status).toBe('completed');
      expect(out.resultSet.cells).toHaveLength(3);
      expect(out.statReports).toHaveLength(2);
      for (const rep of out.statReports) {
        expect(rep.secondary).toBe(false);
        expect(rep.adjustedAlpha).toBeCloseTo(0.025, 10); // 0.05 / 2, recorded never silent
        expect(rep.ci.level).toBeCloseTo(0.975, 10);
      }
      // Both comparisons bind the same hypothesis -> one aggregated confirmatory feedback signal.
      expect(out.feedback).toHaveLength(1);
      expect(out.feedback[0]!.structured?.verdicts).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('P2 single_primary: secondary comparisons stay descriptive and never feed feedback', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);
      spec.models.push({ name: 'rf', builderId: 'random_forest_classifier', hyperparams: { n_estimators: 50 }, seed: 3, tags: [] });
      spec.comparisons = [
        { ...spec.comparisons[0]!, primary: true },
        { ...spec.comparisons[0]!, id: 'cmp-rf-vs-baseline', modelAIdx: 2, primary: false },
      ];
      spec.statistics = { ...spec.statistics, multipleTestingPolicy: 'single_primary' };
      spec.approvals[0]!.comparisonIds = ['cmp-primary', 'cmp-rf-vs-baseline'];

      const out = await executeExperiment(store, artifacts, spec, { allowLocalDatasets: true });
      const primary = out.statReports.find((r) => r.comparisonId === 'cmp-primary')!;
      const secondary = out.statReports.find((r) => r.comparisonId === 'cmp-rf-vs-baseline')!;
      expect(primary.secondary).toBe(false);
      expect(primary.adjustedAlpha).toBeUndefined(); // full alpha, no adjustment
      expect(secondary.secondary).toBe(true);
      expect(out.feedback).toHaveLength(1); // primary only
      expect(out.feedback[0]!.structured?.verdicts).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('P2 ablation matrix: full-factorial expansion carries tags into result cells', async () => {
    const cells = expandAblationModels(
      { name: 'rf', builderId: 'random_forest_classifier', hyperparams: { n_estimators: 200 }, seed: 7, tags: [] },
      [
        { name: 'trees', levels: [{ label: 'many', hyperparams: { n_estimators: 200 } }, { label: 'few', hyperparams: { n_estimators: 25 } }] },
        { name: 'depth', levels: [{ label: 'capped', hyperparams: { max_depth: 3 } }, { label: 'free', hyperparams: {} }] },
      ],
    );
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.tags.join(',')).sort()).toEqual(['trees=few,depth=capped', 'trees=few,depth=free', 'trees=many,depth=capped', 'trees=many,depth=free']);

    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);
      spec.models = [spec.models[0]!, ...cells];
      spec.comparisons = [{ ...spec.comparisons[0]!, modelAIdx: 1 }]; // full-trees-many vs baseline (first expanded cell)
      spec.approvals[0]!.comparisonIds = ['cmp-primary'];

      const out = await executeExperiment(store, artifacts, spec, { allowLocalDatasets: true });
      expect(out.resultSet.cells).toHaveLength(5);
      const tagged = out.resultSet.cells.filter((c) => c.modelName.startsWith('rf|'));
      expect(tagged).toHaveLength(4);
      for (const cell of tagged) expect(cell.tags.length).toBe(2);
      // Distinct hyperparams => distinct fingerprints (no accidental dedup collapse).
      expect(new Set(tagged.map((c) => c.fingerprint)).size).toBe(4);
    } finally {
      cleanup();
    }
  });

  it('export integration: executed experiment renders into report §7a and bundle experimentEvidence (ACC-26)', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = makeSpec(runId, csvPath, hyp.id);
      const out = await executeExperiment(store, artifacts, spec, { allowLocalDatasets: true });
      expect(out.run.status).toBe('completed');

      const run = store.getRun(runId) as ResearchRun;
      const ctx: StageContext = {
        run,
        store,
        artifacts,
        provider: createTestStubProvider([]), // export performs no model call; empty script fails loudly if that changes
        sourceFor: () => { throw new Error('no source adapter in test'); },
        recordReceipt: (partial) => {
          store.putObject('receipt', ProvenanceReceipt.parse({ ...partial, id: newId('rcp'), runId, at: partial.at ?? new Date().toISOString() }));
        },
        cancelled: () => false,
        log: () => {},
      };
      const outcome = await exportStage.execute(ctx);
      expect(outcome.kind).toBe('done');

      const bundle = store.listObjects('bundle', runId).at(-1)!;
      expect(bundle.experimentEvidence).toHaveLength(1);
      const evidence = bundle.experimentEvidence![0]!;
      expect(evidence.experimentRunId).toBe(out.run.id);
      expect(evidence.resultIds).toEqual([out.resultSet.id]);
      // per-row artifacts of both cells are hash-bound; the training log binds too WHEN
      // the sidecar actually emitted output (silent success legitimately has none).
      expect(evidence.artifactHashes!.length).toBeGreaterThanOrEqual(out.resultSet.cells.length);
      for (const cell of out.resultSet.cells) {
        expect(evidence.artifactHashes).toContain(cell.perRowRef.replace('sha256:', ''));
      }
      const persistedRun = store.getObject('experiment_run', out.run.id)!;
      if (persistedRun.trainingLogRef !== undefined) {
        expect(persistedRun.trainingLogRef).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(evidence.artifactHashes).toContain(persistedRun.trainingLogRef.replace('sha256:', ''));
      }
      expect(evidence.lockfileHash).toBe(out.run.environment?.lockfileHash);

      const report = await artifacts.get(outcome.artifacts[0]!);
      expect(report).toContain('### 7a. 实验执行结果（真实运行）');
      expect(report).toContain(`- 实验 ${out.run.id}：completed`);
      expect(report).toMatch(/logistic: accuracy=[01]\.\d{4}（train\/test=/);
      expect(report).toContain('阈值来源=model-stipulated');
      expect(report).toContain(`假设 ${hyp.id}@v0`);
      expect(report).toContain('verdict=');
    } finally {
      cleanup();
    }
  });

  it('traceable revision: experiment feedback consumed by revise -> causal Revision + VersionDiff (ACC-26)', async () => {
    const { store, dir, cleanup } = makeStore();
    try {
      const artifacts = openArtifactStore(join(dir, 'artifacts'));
      const runId = makeRun(store);
      const hyp = makeHypothesis(runId);
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'fixture.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const out = await executeExperiment(store, artifacts, makeSpec(runId, csvPath, hyp.id), { allowLocalDatasets: true });
      const signal = out.feedback[0]!;
      expect(signal.source).toBe('experiment');

      // Scripted LLM proposals; the CAUSAL/verdict/persistence mechanics under test are
      // the real revise-stage code paths (fixture LLM content, real pipeline).
      const stub = createTestStubProvider([
        {
          forPurpose: 'causal-revision-analysis',
          rawOutput: JSON.stringify({
            affected: [{ objectType: 'hypothesis', objectId: hyp.id, reason: 'experiment verdict=supports with CI clear of threshold replaces the stipulated boundary assumption' }],
            causalChain: 'experiment cmp-primary verdict=supports (paired CI clear of 0) -> the mechanism assumption is upgraded from stipulated to measured',
            expectedQualityDelta: { status: 'improved', claim: 'measured evidence replaces a stipulated assumption' },
          }),
        },
        {
          forPurpose: `hypothesis-revision:${hyp.id}`,
          rawOutput: JSON.stringify({
            statement: 'feature X separates the classes: measured paired accuracy difference is decisively above the majority baseline',
            mechanism: 'linear separation of x1 with measured support',
            assumptions: [{ statement: 'paired accuracy diff > 0 (experiment cmp-primary, CI clear of threshold)', kind: 'empirical' }],
            predictions: ['logistic keeps beating the majority baseline on fresh stratified splits'],
            addedUncertainties: ['behavior beyond the tested split is unmeasured'],
            revisionRationale: 'experiment verdict=supports; assumption upgraded from stipulated to empirical with recorded CI',
          }),
        },
      ]);
      const run = store.getRun(runId) as ResearchRun;
      const ctx: StageContext = {
        run, store, artifacts, provider: stub,
        sourceFor: () => { throw new Error('no source adapter in test'); },
        recordReceipt: () => {},
        cancelled: () => false,
        log: () => {},
      };
      const outcome = await reviseStage.execute(ctx);
      expect(outcome.kind).toBe('done');

      const revisions = store.listObjects('revision', runId);
      expect(revisions).toHaveLength(1);
      expect(revisions[0]!.triggerFeedbackId).toBe(signal.id); // causal link points at the EXPERIMENT feedback
      expect(revisions[0]!.causalReason.length).toBeGreaterThan(0);
      const diffs = store.listObjects('version_diff', runId);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]!.entries.some((e) => e.objectType === 'hypothesis' && e.objectId === hyp.id)).toBe(true);
      const revised = store.getObject('hypothesis', hyp.id)!;
      expect(revised.version).toBe(1);
      expect(store.listEvents(runId).map((e) => e.type)).toContain('revision_created');
      // Consumed signal closes the loop: revise becomes inapplicable until new evidence arrives.
      expect(await reviseStage.applicable(ctx)).toBe(false);
    } finally {
      cleanup();
    }
  });
});
