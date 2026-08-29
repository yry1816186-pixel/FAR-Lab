#!/usr/bin/env node
/**
 * Scenario B driver (AOSSA convergence, 2026-08-30): the operator-side,
 * reproducible data-science chain on a REAL gridded NetCDF dataset.
 *
 *   raw NetCDF (NCEP/NCAR reanalysis air temperature)
 *     -> acquire (sha256 content-ref + xarray profile + record-time QC)   [dataset-netcdf]
 *     -> derived tabular features (closed-enum aggregation, materialized CSV)
 *     -> PREREGISTERED ExperimentSpec (seeded split, baseline + models +
 *        ablation matrix as bounded tuning, frozen paired-bootstrap stats)
 *     -> real sidecar train/eval (test untouched until the frozen evaluation)
 *     -> mechanical StatReport verdicts (never LLM-judged)
 *
 * Honesty notes (disclosed, not hidden):
 *  - row-level random split answers a SPATIAL-SEASONAL mapping question
 *    (value ~ month, lat, lon), NOT a forecasting question; temporal leakage
 *    is irrelevant to that task and the spec's exploratory note says so;
 *  - thresholds are model-stipulated; this is an exploratory screen — a
 *    hypothesis-bound confirmatory verdict needs operator approval (D-085);
 *  - the ablation matrix is report-only bounded tuning inside ONE frozen spec.
 *
 * Usage: FARLAB_DATA_DIR defaults to work/scenario-b.
 */
import { openDb } from '../dist/persistence/db.js';
import { Store } from '../dist/persistence/store.js';
import { openArtifactStore } from '../dist/persistence/artifacts.js';
import { ResearchQuestion, newId, ExperimentSpec } from '../dist/domain/index.js';
import { acquireNetcdfDataset, extractNetcdfFeatures } from '../dist/experiment/dataset-netcdf.js';
import { executeExperiment } from '../dist/experiment/executor.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.FARLAB_DATA_DIR ?? 'work/scenario-b';
const ncPath = path.resolve(dataDir, 'air_temperature.nc');
if (!fs.existsSync(ncPath)) {
  console.error(`scenario-b: real NetCDF file missing at ${ncPath} (download NCEP air_temperature.nc first — see .control/EXECUTION_STATE)`);
  process.exit(3);
}
fs.mkdirSync(dataDir, { recursive: true });
const db = openDb(path.join(dataDir, 'far.db'));
const store = new Store(db);
const artifacts = openArtifactStore(path.join(dataDir, 'artifacts'));

// 1. Question + run — SCENARIO_B_RUN_ID bridges this data leg into an existing
// literature run (one study, two legs); absent = fresh operator run.
const reuseRunId = process.env.SCENARIO_B_RUN_ID;
let runId;
const questionText = 'Is near-surface air temperature over the NCEP reanalysis grid learnable as a spatial-seasonal mapping (value ~ month, latitude, longitude), and does a random forest beat the mean baseline beyond paired-bootstrap uncertainty?';
if (reuseRunId !== undefined) {
  const existing = store.getRun(reuseRunId);
  if (existing === null) throw new Error(`SCENARIO_B_RUN_ID ${reuseRunId} not found in ${dataDir}`);
  runId = existing.id;
  console.log(`run (reused): ${runId}`);
} else {
  const question = ResearchQuestion.parse({
    id: newId('q'),
    text: 'Is near-surface air temperature over the NCEP reanalysis grid learnable as a spatial-seasonal mapping (value ~ month, latitude, longitude), and does a random forest beat the mean baseline beyond paired-bootstrap uncertainty?',
    background: 'NCEP/NCAR reanalysis daily air temperature, 2013 (xarray tutorial dataset air_temperature.nc).',
    goalType: 'methodological',
    scope: { domain: 'climate science', phenomena: ['near-surface air temperature'] },
    constraints: { assumptions: [] },
    createdAt: new Date().toISOString(),
  });
  store.putObject('question', question);
  const run = store.createRun(question);
  runId = run.id;
  console.log(`run: ${run.id}`);
}

// 2. Raw acquisition + QC + derived features
const raw = await acquireNetcdfDataset(store, artifacts, runId, ncPath, 'air', { license: 'public domain (NCEP/NCAR reanalysis via xarray-data)' });
const { record: derived } = await extractNetcdfFeatures(store, artifacts, raw, 'monthly_mean_per_gridpoint', {
  maxRows: 60000,
  materializeDir: path.join(dataDir, 'derived'),
});
console.log(`derived dataset_record: ${derived.id} -> ${derived.source.path} (${derived.nRows} rows)`);

// 3. Preregistered spec (frozen BEFORE any training)
const sha = createHash('sha256').update(fs.readFileSync(derived.source.path)).digest('hex');
const spec = ExperimentSpec.parse({
  id: newId('xsp'),
  runId,
  planId: newId('pln'),
  planStepId: newId('task'),
  question: (store.getObject('question', store.getRun(runId).questionId)?.text ?? questionText).slice(0, 500),
  datasets: [{
    source: { resolver: 'local', path: derived.source.path, sha256Expected: sha },
    targetColumn: 'value',
    split: { method: 'random', ratios: { train: 0.7, val: 0.15, test: 0.15 }, seed: 20260830 },
  }],
  models: [
    { name: 'mean_baseline', builderId: 'dummy_mean', hyperparams: {}, seed: 1, tags: ['scenario-b', 'baseline'] },
    { name: 'linear_map', builderId: 'linear_regression', hyperparams: {}, seed: 2, tags: ['scenario-b'] },
    { name: 'rf_spatial_seasonal', builderId: 'random_forest_regressor', hyperparams: { n_estimators: 100, max_depth: 12 }, seed: 3, tags: ['scenario-b'],
      ablationFactors: [{ name: 'n_estimators', levels: [
        { label: 'n50', hyperparams: { n_estimators: 50 } },
        { label: 'n100_full', hyperparams: {} },
        { label: 'n200', hyperparams: { n_estimators: 200 } },
      ] }] },
  ],
  metrics: ['mean_squared_error', 'r2'],
  comparisons: [{
    id: 'cmp_rf_vs_baseline',
    metricKey: 'mean_squared_error',
    kind: 'paired_diff',
    modelAIdx: 2,
    modelBIdx: 0,
    direction: 'below', // lower MSE is better
    threshold: 0,
    thresholdProvenance: 'model-stipulated',
    primary: true,
  }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 2000, analysisSeed: 20260830, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 900_000 },
  exploratoryNote: 'Scenario-B operator screen: spatial-seasonal mapping task (row-level random split is disclosed as task-appropriate, NOT forecasting); ablation matrix is report-only bounded tuning inside this frozen spec; hypothesis-bound confirmatory runs need approval.',
  approvals: [],
  validation: { passed: false, missing: ['pending deterministic validation at execution'] },
  createdAt: new Date().toISOString(),
});

// 4. Real execution (validation gate -> acquisition -> split -> train/eval -> stats)
const executed = await executeExperiment(store, artifacts, spec, { allowLocalDatasets: true });
console.log(`experiment_run: ${executed.run.id} status=${executed.run.status} env=${executed.run.environment?.pythonVersion} lock=${executed.run.environment?.lockfileHash ? 'pinned' : '?'}`);
for (const rep of executed.statReports) {
  console.log(`stat_report ${rep.comparisonId}: ${rep.metricKey}=${rep.pointEstimate?.toPrecision(6)} ci=[${rep.ci.low.toPrecision(4)}, ${rep.ci.high.toPrecision(4)}] verdict=${rep.verdict ?? '(exploratory)'} iter=${rep.analysisIteration}`);
  for (const line of rep.verdictDerivation ?? []) console.log('   ', line.slice(0, 200));
}
db.close();
console.log('scenario-b: chain complete.');


