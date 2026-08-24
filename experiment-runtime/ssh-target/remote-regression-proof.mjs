/**
 * R2-10 live remote-execution proof driver: creates a real run + hypothesis + a
 * REGRESSION experiment spec in the proof data dir, enqueues it FOR the sandbox
 * device (exercises the mirrored remote template), and prints the job id. The
 * actual execution happens via `far experiment worker --device ssh-sandbox-<port>`.
 * Real path only — no mocks; exit 1 with the verbatim error on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../dist/persistence/db.js';
import { Store } from '../../dist/persistence/store.js';
import { openScheduler, enqueueExperiment } from '../../dist/experiment/scheduler.js';
import { ResearchQuestion, HypothesisCandidate, newId } from '../../dist/domain/index.js';

const dataDir = process.argv[2];
const device = process.argv[3] ?? 'ssh-sandbox-2242';
if (dataDir === undefined) { process.stderr.write('usage: remote-regression-proof.mjs <dataDir> [device]\n'); process.exit(2); }

const dir = path.resolve(dataDir);
fs.mkdirSync(dir, { recursive: true });

// Deterministic synthetic regression CSV (synthetic-benchmark disclosure: this is a
// generated benchmark fixture, not production data): y = 2x + 1 + fixed wiggle.
const rows = ['x,noise_col,y'];
for (let i = 0; i < 120; i += 1) {
  const x = i * 0.25;
  rows.push(`${x.toFixed(4)},${(i % 5) * 0.1},${(2 * x + 1 + ((i % 7) - 3) * 0.05).toFixed(6)}`);
}
const csvPath = path.join(dir, 'reg-proof.csv');
fs.writeFileSync(csvPath, `${rows.join('\n')}\n`);

const db = openDb(path.join(dir, 'far.db'));
const store = new Store(db);
const scheduler = openScheduler(path.join(dir, 'far-scheduler.db'));

const q = ResearchQuestion.parse({
  id: newId('q'), text: 'does the linear feature beat the mean baseline on held-out MSE (remote sandbox)?',
  background: '', goalType: 'explanatory', scope: { domain: 'tabular-ml', phenomena: ['regression'] },
  constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
});
store.createRun(q);
const runId = store.listRuns(1)[0].id;
const hyp = HypothesisCandidate.parse({
  id: newId('hyp'), runId, version: 0,
  statement: 'linear model held-out MSE is at least 10 below the mean-baseline MSE',
  derivation: { strategy: 'evidence_conditioned', rationale: 'r2-10 live remote proof' },
  createdAt: new Date().toISOString(),
});
store.putObject('hypothesis', hyp);

const spec = {
  id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'),
  version: 1,
  question: 'linear beats mean baseline (remote sandbox regression proof)',
  datasets: [{ source: { resolver: 'local', path: csvPath }, targetColumn: 'y', split: { method: 'random', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 } }],
  models: [
    { name: 'mean-baseline', builderId: 'dummy_mean', hyperparams: {}, seed: 0 },
    { name: 'linear', builderId: 'linear_regression', hyperparams: {}, seed: 7 },
  ],
  metrics: ['mean_squared_error', 'r2'],
  comparisons: [{
    id: 'cmp-primary', metricKey: 'mean_squared_error', kind: 'paired_diff',
    modelAIdx: 1, modelBIdx: 0, direction: 'below', threshold: -10,
    thresholdProvenance: 'model-stipulated', hypothesisId: hyp.id,
    primary: true, mde: 20,
  }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 500, analysisSeed: 11, ciLevel: 0.95 },
  compute: { device: 'local', maxParallel: 1, timeoutMs: 180_000 },
  approvals: [{
    hypothesisId: hyp.id, comparisonIds: ['cmp-primary'],
    decisionRuleSnapshot: 'paired MSE diff (linear - baseline) below -10',
    approvedBy: 'r2-10-proof-operator', approvedAt: new Date().toISOString(),
  }],
  createdAt: new Date().toISOString(),
};

const { experimentRunId, jobId } = enqueueExperiment(store, scheduler, spec, { allowLocalDatasets: true, device });
scheduler.close();
db.close();
process.stdout.write(JSON.stringify({ runId, hypothesisId: hyp.id, experimentRunId, jobId, device, csvPath }) + '\n');
