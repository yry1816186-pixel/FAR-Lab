import { describe, expect, it } from 'vitest';
import { uvAvailable, UV_SKIP_REASON } from './helpers/uv-gate.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { executeExperiment } from '../src/experiment/executor.js';
import {
  ResearchQuestion, HypothesisCandidate, newId,
  checkExperimentSpec, REGRESSOR_BUILDERS, CLASSIFIER_BUILDERS,
  type ExperimentSpec,
} from '../src/domain/index.js';

/**
 * R2-10 regression-workload closure: regressor builders, per-row SQUARED error
 * (mean == MSE exactly), task-coherence validation gates, and the full
 * confirmatory chain (split -> train -> stats -> mechanical verdict -> feedback)
 * on real sidecar runs. Mirrors the classification fixture discipline of
 * experiment.test.ts: real path only, deterministic fixtures, no mocks.
 */

const makeStore = (): { store: Store; artifacts: ReturnType<typeof openArtifactStore>; dir: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'farlab-reg-'));
  const db = openDb(join(dir, 't.db'));
  return {
    store: new Store(db),
    artifacts: openArtifactStore(join(dir, 'artifacts')),
    dir,
    cleanup: () => {
      try { db.close(); } catch { /* already closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag; OS temp cleanup covers it */ }
    },
  };
};

const makeRun = (store: Store): string => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'does feature x predict the continuous target better than the mean baseline?',
    background: '', goalType: 'explanatory', scope: { domain: 'tabular-ml', phenomena: ['regression'] },
    constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  store.createRun(q);
  return store.listRuns(1)[0]!.id;
};

const makeHypothesis = (store: Store, runId: string) => {
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0,
    statement: 'linear model beats the mean baseline on mean squared error',
    derivation: { strategy: 'evidence_conditioned', rationale: 'fixture' },
    createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp);
  return hyp;
};

/**
 * Deterministic synthetic regression CSV: y = 2x + 1 + small fixed wiggle
 * (i % 7 - 3) * 0.05 — linear but not exactly fittable, so MSE > 0 honestly.
 * 120 rows -> nTest=36 >= MIN_CONFIRMATORY_NTEST for a bound comparison.
 */
const regressionCsv = (n = 120): string => {
  const rows: string[] = ['x,noise_col,y'];
  for (let i = 0; i < n; i += 1) {
    const x = i * 0.25;
    const y = 2 * x + 1 + ((i % 7) - 3) * 0.05;
    rows.push(`${x.toFixed(4)},${(i % 5) * 0.1},${y.toFixed(6)}`);
  }
  return rows.join('\n') + '\n';
};

const makeRegressionSpec = (runId: string, csvPath: string, hypothesisId: string): ExperimentSpec => ({
  id: newId('xsp') as ExperimentSpec['id'],
  runId: runId as ExperimentSpec['runId'],
  planId: newId('pln') as ExperimentSpec['planId'],
  planStepId: newId('task') as ExperimentSpec['planStepId'],
  version: 1,
  question: 'linear feature beats mean baseline',
  datasets: [{
    source: { resolver: 'local', path: csvPath },
    targetColumn: 'y',
    split: { method: 'random', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 },
  }],
  models: [
    { name: 'mean-baseline', builderId: 'dummy_mean', hyperparams: {}, seed: 0 },
    { name: 'linear', builderId: 'linear_regression', hyperparams: {}, seed: 7 },
  ],
  metrics: ['mean_squared_error', 'r2'],
  comparisons: [
    {
      id: 'cmp-primary', metricKey: 'mean_squared_error', kind: 'paired_diff',
      modelAIdx: 1, modelBIdx: 0, direction: 'below', threshold: -10,
      thresholdProvenance: 'model-stipulated',
      hypothesisId: hypothesisId as ExperimentSpec['comparisons'][number]['hypothesisId'],
      primary: true, mde: 20,
    },
  ],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 500, analysisSeed: 11, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 120_000 },
  approvals: [{
    hypothesisId: hypothesisId as ExperimentSpec['approvals'][number]['hypothesisId'],
    comparisonIds: ['cmp-primary'],
    decisionRuleSnapshot: 'linear MSE is at least 10 below the mean-baseline MSE (paired diff < -10)',
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }],
  createdAt: new Date().toISOString(),
});

// ---- unit: task-coherence validation gates (pure TS) ----

describe('R2-10 regression validation gates', () => {
  const base = () => makeRegressionSpec('run_x', 'C:/nonexistent.csv', 'hyp_x');

  it('rejects mixed classifier and regressor builders in one spec', () => {
    const spec = base();
    spec.models = [
      { name: 'a', builderId: 'logistic_regression', hyperparams: {}, seed: 1 },
      { name: 'b', builderId: 'linear_regression', hyperparams: {}, seed: 2 },
    ];
    spec.metrics = ['accuracy'];
    spec.comparisons = [{ ...spec.comparisons[0]!, metricKey: 'accuracy', hypothesisId: undefined }];
    const r = checkExperimentSpec(spec, { allowLocalDatasets: true });
    expect(r.missing.join(' ')).toContain('mixes classifier and regressor builders');
  });

  it('rejects classification metrics on a regressor-only spec', () => {
    const spec = base();
    spec.metrics = ['mean_squared_error', 'accuracy'];
    const r = checkExperimentSpec(spec, { allowLocalDatasets: true });
    expect(r.missing.join(' ')).toContain('regressor-only spec declares classification metrics: accuracy');
  });

  it('rejects comparison metricKeys without an exact per-row decomposition (both tasks)', () => {
    const regressionSpec = base();
    regressionSpec.comparisons = [{ ...regressionSpec.comparisons[0]!, metricKey: 'r2' }];
    const rReg = checkExperimentSpec(regressionSpec, { allowLocalDatasets: true });
    expect(rReg.missing.join(' ')).toContain("metricKey 'r2' has no exact per-row decomposition on regression tasks");

    const classificationSpec = base();
    classificationSpec.models = [{ name: 'a', builderId: 'logistic_regression', hyperparams: {}, seed: 1 }];
    classificationSpec.metrics = ['accuracy', 'f1_macro'];
    classificationSpec.comparisons = [{ ...classificationSpec.comparisons[0]!, metricKey: 'f1_macro', hypothesisId: undefined, mde: undefined }];
    const rCls = checkExperimentSpec(classificationSpec, { allowLocalDatasets: true });
    expect(rCls.missing.join(' ')).toContain("metricKey 'f1_macro' has no exact per-row decomposition on classification tasks");
  });

  it('keeps the pre-existing classifier-metric gate intact and exports the family sets', () => {
    const spec = base();
    spec.models = [{ name: 'a', builderId: 'logistic_regression', hyperparams: {}, seed: 1 }];
    spec.metrics = ['accuracy', 'r2'];
    spec.comparisons = [{ ...spec.comparisons[0]!, metricKey: 'accuracy', hypothesisId: undefined }];
    const r = checkExperimentSpec(spec, { allowLocalDatasets: true });
    expect(r.missing.join(' ')).toContain('classifier-only spec declares regression metrics');
    expect(REGRESSOR_BUILDERS).toHaveLength(4);
    expect(CLASSIFIER_BUILDERS).toHaveLength(4);
  });
});

// ---- E2E: real sidecar regression runs ----

describe('R2-10 regression executor end-to-end (real uv sidecar)', () => {
  it.runIf(uvAvailable())('full chain: split -> train -> MSE stats -> mechanical verdict -> feedback', async () => {
    const w = makeStore();
    try {
      const runId = makeRun(w.store);
      const hypId = makeHypothesis(w.store, runId).id;
      const csvPath = join(w.dir, 'reg.csv');
      writeFileSync(csvPath, regressionCsv(), 'utf8');
      const spec = makeRegressionSpec(runId, csvPath, hypId);
      // Deterministic producer-wiring regression: old Date.now()-based code ignores
      // this seam and cannot produce the two exact persisted durations below.
      const ticks = [100, 104, 200, 207];
      const monotonicClock = (): number => {
        const tick = ticks.shift();
        if (tick === undefined) throw new Error('experiment requested an unexpected timing tick');
        return tick;
      };

      const out = await executeExperiment(w.store, w.artifacts, spec, { allowLocalDatasets: true, monotonicClock });

      expect(out.run.status).toBe('completed');
      expect(out.resultSet.cells.map((cell) => cell.timingMs)).toEqual([4, 7]);
      expect(ticks).toEqual([]);
      expect(out.run.environment?.hardware?.system).toBeTruthy();
      expect(out.run.environment?.hardware?.cpuCount).toBeTruthy();
      // per-row squared errors: mean(perRow) must equal the reported MSE exactly
      const linear = out.resultSet.cells.find((c) => c.modelName === 'linear')!;
      const baseline = out.resultSet.cells.find((c) => c.modelName === 'mean-baseline')!;
      const perRowLinear = JSON.parse((await w.artifacts.get(linear.perRowRef))!) as number[];
      expect(linear.metrics['mean_squared_error']).toBeCloseTo(
        perRowLinear.reduce((a, b) => a + b, 0) / perRowLinear.length, 12,
      );
      expect(linear.metrics['r2']).toBeGreaterThan(0.99);
      expect(baseline.metrics['mean_squared_error']).toBeGreaterThan(linear.metrics['mean_squared_error']);
      // 06→10 §1 wiring: split-conformal band on every cell (alpha + nCalibration persist
      // with the interval — an interval without its n is unfalsifiable).
      const perRowBaseline = JSON.parse((await w.artifacts.get(baseline.perRowRef))!) as number[];
      for (const [cell, rows] of [[linear, perRowLinear], [baseline, perRowBaseline]] as const) {
        expect(cell.conformal, cell.modelName).toBeDefined();
        expect(cell.conformal!.alpha).toBe(0.05);
        expect(cell.conformal!.nCalibration).toBe(rows.length);
        expect(cell.conformal!.low).toBeLessThanOrEqual(rows.reduce((a, b) => a + b, 0) / rows.length);
        expect(cell.conformal!.high).toBeGreaterThanOrEqual(rows.reduce((a, b) => a + b, 0) / rows.length);
        expect(cell.conformal!.guarantee).toContain('coverage');
        expect(cell.conformal!.guarantee).toContain('0.95');
        expect(cell.conformal!.guarantee).toContain('exchangeability');
      }
      // paired MSE diff (linear - baseline) far below -10 -> supports
      const report = out.statReports.find((r) => r.comparisonId === 'cmp-primary')!;
      expect(report.verdict).toBe('supports');
      expect(report.pointEstimate).toBeLessThan(-10);
      expect(out.feedback.length).toBe(1);
      expect(out.feedback[0]!.target?.id).toBe(hypId);
    } finally {
      w.cleanup();
    }
  }, 180_000);

  it.runIf(uvAvailable())('determinism: a fresh store with identical (spec, seed, env) reproduces identical cells', async () => {
    const results: number[][] = [];
    for (let round = 0; round < 2; round += 1) {
      const w = makeStore();
      try {
        const runId = makeRun(w.store);
        const hypId = makeHypothesis(w.store, runId).id;
        const csvPath = join(w.dir, 'reg.csv');
        writeFileSync(csvPath, regressionCsv(), 'utf8');
        const out = await executeExperiment(w.store, w.artifacts, makeRegressionSpec(runId, csvPath, hypId), { allowLocalDatasets: true });
        const linear = out.resultSet.cells.find((c) => c.modelName === 'linear')!;
        results.push(JSON.parse((await w.artifacts.get(linear.perRowRef))!) as number[]);
      } finally {
        w.cleanup();
      }
    }
    expect(results[0]).toEqual(results[1]);
  }, 240_000);

  it.runIf(uvAvailable())('failure path: regressor on a non-numeric target fails visibly with the verbatim error', async () => {
    const w = makeStore();
    try {
      const runId = makeRun(w.store);
      const hypId = makeHypothesis(w.store, runId).id;
      const csvPath = join(w.dir, 'bad.csv');
      writeFileSync(csvPath, 'x,y\n1.0,low\n2.0,high\n3.0,low\n4.0,high\n5.0,low\n6.0,high\n7.0,low\n8.0,high\n9.0,low\n10.0,high\n', 'utf8');
      const spec = makeRegressionSpec(runId, csvPath, hypId);
      spec.comparisons = [{ ...spec.comparisons[0]!, hypothesisId: undefined, mde: undefined }];
      spec.approvals = [];
      spec.exploratoryNote = 'non-numeric target failure-path probe';
      spec.models = spec.models.map((m) => ({ ...m, builderId: 'linear_regression' as const }));

      await expect(
        executeExperiment(w.store, w.artifacts, spec, { allowLocalDatasets: true }),
      ).rejects.toThrow(/non-numeric/);
      const runs = w.store.listObjects('experiment_run', runId) as Array<{ status: string; error?: string }>;
      expect(runs[0]!.status).toBe('failed');
      expect(runs[0]!.error).toContain('non-numeric');
    } finally {
      w.cleanup();
    }
  }, 180_000);
});

it('uv gate is honest: suites skip with a reason when uv is absent', () => {
  // Documents the gate contract; the assertion itself is environment-neutral.
  // Falsifiable and environment-neutral: the skip reason is the user-facing contract
  // of every it.runIf(uvAvailable()) gate — its copy (diagnosis + remedy) is pinned here.
  expect(UV_SKIP_REASON).toContain('uv toolchain not available');
  expect(UV_SKIP_REASON).toContain('uv sync'); // the remedy ships with the diagnosis
});

describe('ablation expansion (14-10 wiring)', () => {
  it.runIf(uvAvailable())('ablationAppend-cells: factor cells appended after base, tags carried, base indices untouched', async () => {
    const w = makeStore();
    try {
      const runId = makeRun(w.store);
      const hypId = makeHypothesis(w.store, runId).id;
      const csvPath = join(w.dir, 'abl.csv');
      writeFileSync(csvPath, regressionCsv(), 'utf8');
      const spec = makeRegressionSpec(runId, csvPath, hypId);
      // ablation on a hyperparam-bearing builder: RF with one factor, two levels; the
      // base-equivalent level is filtered (the declaring base cell already runs).
      spec.models = spec.models.map((m) => m.name === 'linear'
        ? { ...m, builderId: 'random_forest_regressor' as never, hyperparams: { n_estimators: 50 }, ablationFactors: [{ name: 'n-est', levels: [
            { label: 'n50', hyperparams: { n_estimators: 50 } },
            { label: 'n200', hyperparams: { n_estimators: 200 } },
          ] }] }
        : m);

      const out = await executeExperiment(w.store, w.artifacts, spec, { allowLocalDatasets: true });

      expect(out.run.status).toBe('completed');
      const names = out.resultSet.cells.map((c) => c.modelName);
      // base cells keep indices 0..1 (comparisons reference them); expanded cells append
      expect(names.slice(0, 2).sort()).toEqual(['linear', 'mean-baseline']);
      expect(names.filter((n) => n.startsWith('linear|'))).toEqual(['linear|n-est=n200']);
      expect(out.resultSet.cells).toHaveLength(3);
      expect(out.resultSet.cells.find((c) => c.modelName === 'linear|n-est=n200')!.tags).toEqual(['n-est=n200']);
      // base cell (comparison target, index 0) still runs and carries the conformal band
      expect(out.resultSet.cells[0]!.conformal).toBeDefined();
    } finally {
      w.cleanup();
    }
  }, 180_000);
});
