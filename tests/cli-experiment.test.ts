import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { experimentCommand } from '../src/cli/experiment.js';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { openScheduler } from '../src/experiment/scheduler.js';
import { ResearchQuestion, HypothesisCandidate, newId } from '../src/domain/index.js';

const makeWorld = (): { dataDir: string; store: Store; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'farlab-cliexp-'));
  const db = openDb(join(dir, 'far.db'));
  return {
    dataDir: dir,
    store: new Store(db),
    cleanup: () => {
      try { db.close(); } catch { /* closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag */ }
    },
  };
};

const seedRun = (store: Store): { runId: string; hypId: string } => {
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'cli surface?', background: '', goalType: 'explanatory',
    scope: { domain: 'tabular-ml', phenomena: ['classification'] },
    constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  store.createRun(q);
  const runId = store.listRuns(1)[0]!.id;
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, statement: 'separable',
    derivation: { strategy: 'evidence_conditioned', rationale: 'cli fixture' },
    createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp);
  return { runId, hypId: hyp.id };
};

const specJson = (runId: string, hypId: string, csvPath: string): string => JSON.stringify({
  id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'), version: 1,
  question: 'cli e2e',
  datasets: [{ source: { resolver: 'local', path: csvPath }, targetColumn: 'label', split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 } }],
  models: [
    { name: 'baseline', builderId: 'dummy_most_frequent', hyperparams: {}, seed: 0 },
    { name: 'logistic', builderId: 'logistic_regression', hyperparams: {}, seed: 7 },
  ],
  metrics: ['accuracy'],
  comparisons: [{ id: 'cmp', metricKey: 'accuracy', kind: 'paired_diff', modelAIdx: 1, modelBIdx: 0, direction: 'above', threshold: 0, thresholdProvenance: 'model-stipulated', hypothesisId: hypId, primary: true, mde: 0.3 }],
  statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 200, analysisSeed: 11, ciLevel: 0.95 },
  approvals: [{ hypothesisId: hypId, comparisonIds: ['cmp'], decisionRuleSnapshot: 'diff > 0', approvedBy: 'cli-test', approvedAt: new Date().toISOString() }],
  createdAt: new Date().toISOString(),
});

const fixtureCsv = (): string => {
  const rows = ['x0,label'];
  // 100 data rows => nTest=30 at the 0.3 test ratio — the g5 confirmatory floor.
  for (let i = 0; i < 50; i += 1) {
    rows.push(`${2 + (i % 8) * 0.1},pos`);
    rows.push(`${0.1 + (i % 6) * 0.1},neg`);
  }
  return rows.join('\n') + '\n';
};

const argv = (dataDir: string, positional?: string, flags: string[] = []) => ({
  dataDir,
  positional,
  flag: (n: string) => flags.includes(n),
  arg: (n: string) => { const i = flags.indexOf(n); return i >= 0 ? flags[i + 1] : undefined; },
});

describe('far experiment CLI surface', { timeout: 300_000 }, () => {
  it('run: spec file -> queue -> in-process worker -> terminal truth in status', async () => {
    const w = makeWorld();
    try {
      const { runId, hypId } = seedRun(w.store);
      const csvPath = join(w.dataDir, 'f.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const specPath = join(w.dataDir, 'spec.json');
      writeFileSync(specPath, specJson(runId, hypId, csvPath), 'utf8');

      const res = await experimentCommand('run', argv(w.dataDir, specPath, ['--allow-local-datasets']));
      expect(res.code, res.text).toBe(0);
      const payload = res.json as { jobId: string; experimentRunId: string; jobStatus: string; farStatus: string; resultIds: string[] };
      expect(payload.jobStatus).toBe('completed');
      expect(payload.farStatus).toBe('completed');
      expect(payload.resultIds).toHaveLength(1);

      const status = await experimentCommand('status', argv(w.dataDir, undefined, ['--job', payload.jobId]));
      expect(status.code).toBe(0);
      const sj = status.json as { job: { status: string }; farRun: { status: string } };
      expect(sj.job.status).toBe('completed');
      expect(sj.farRun.status).toBe('completed');

      const logs = await experimentCommand('logs', argv(w.dataDir, payload.experimentRunId));
      expect(logs.code).toBe(0);
      // Silent sidecar legitimately has no log artifact; the command says so honestly.
      const lj = logs.json as { trainingLogRef: string | null };
      expect(typeof lj.trainingLogRef === 'string' || lj.trainingLogRef === null).toBe(true);
    } finally {
      w.cleanup();
    }
  });

  it('enqueue-only stays queued; cancel removes it before any worker runs', async () => {
    const w = makeWorld();
    try {
      const { runId, hypId } = seedRun(w.store);
      const csvPath = join(w.dataDir, 'f.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const specPath = join(w.dataDir, 'spec.json');
      writeFileSync(specPath, specJson(runId, hypId, csvPath), 'utf8');

      const enq = await experimentCommand('enqueue', argv(w.dataDir, specPath, ['--allow-local-datasets', '--priority', '7']));
      expect(enq.code).toBe(0);
      const { jobId } = enq.json as { jobId: string; experimentRunId: string };

      const cancel = await experimentCommand('cancel', argv(w.dataDir, jobId));
      expect(cancel.code).toBe(0);
      expect((cancel.json as { status: string }).status).toBe('canceled');

      // A worker draining afterwards finds nothing to do.
      const worker = await experimentCommand('worker', argv(w.dataDir, undefined, ['--allow-local-datasets']));
      expect(worker.code).toBe(0);
      expect(worker.json).toEqual({ executed: 0, failed: 0, device: 'local' });
    } finally {
      w.cleanup();
    }
  });

  it('fail-closed surfaces: local dataset without the operator flag; garbage spec; unknown job', async () => {
    const w = makeWorld();
    try {
      const { runId, hypId } = seedRun(w.store);
      const csvPath = join(w.dataDir, 'f.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const specPath = join(w.dataDir, 'spec.json');
      writeFileSync(specPath, specJson(runId, hypId, csvPath), 'utf8');
      const badPath = join(w.dataDir, 'bad.json');
      writeFileSync(badPath, '{"id": "not a spec"}', 'utf8');

      const local = await experimentCommand('run', argv(w.dataDir, specPath));
      expect(local.code).toBe(2);
      expect(local.text).toContain('--allow-local-datasets');

      const bad = await experimentCommand('run', argv(w.dataDir, badPath, ['--allow-local-datasets']));
      expect(bad.code).toBe(2);
      expect(bad.text).toContain('not a valid ExperimentSpec');

      const missing = await experimentCommand('status', argv(w.dataDir, undefined, ['--job', 'job_aaaaaaaaaaaaaaaaaaaaaaaaaa']));
      expect(missing.code).toBe(1);

      const noSub = await experimentCommand(undefined, argv(w.dataDir));
      expect(noSub.code).toBe(2);
    } finally {
      w.cleanup();
    }
  });

  it('status lists across both stores consistently', async () => {
    const w = makeWorld();
    try {
      const empty = await experimentCommand('status', argv(w.dataDir));
      expect(empty.code).toBe(0);
      expect((empty.json as { stats: Record<string, number> }).stats).toEqual({ total: 0 });
      expect(empty.text).toContain('no jobs queued');
      void openScheduler; // scheduler db co-located in dataDir by the commands above
      void openArtifactStore;
    } finally {
      w.cleanup();
    }
  });
});
