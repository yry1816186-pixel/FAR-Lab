import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { executeRemoteExperiment } from '../src/experiment/remote-executor.js';
import { localCellFingerprint, remoteCellFingerprint } from '../src/experiment/cell-dedup.js';
import type { ExecResult, ProbeReport } from '../src/experiment/gateway.js';
import { ResearchQuestion, HypothesisCandidate, newId, ExperimentSpec } from '../src/domain/index.js';
import { uvAvailable } from './helpers/uv-gate.js';

/**
 * FA-REM-02 verify: remote cell-level fingerprint dedup (resume, not retrain) and
 * failure-path cleanup of /tmp/farlab/<id> on the device. A scripted gateway stands
 * in for the SSH boundary (the executor's gateway seam is probe/exec/putFile only);
 * statistics still run on the REAL local sidecar so the confirmatory chain stays
 * the production path (same gate as the local scheduler crash-window test).
 */

interface CapturedPayload {
  trainIdx: number[];
  testIdx: number[];
}

/** Scripted gateway: counts remote trainings, replays deterministic per-row results
 *  that DIFFER per fresh training (so a retrain is observable in the cells). */
class FakeGateway {
  readonly commands: string[] = [];
  trainings = 0;
  failTrain: { code: number; stderr: string } | null = null;
  private lastPayload: CapturedPayload | null = null;

  async probe(): Promise<ProbeReport> {
    return {
      reachable: true, pythonVersion: '3.12.1', numpyVersion: '1.26.4', numpy: true,
      cpuCount: 8, gpu: null, pipFreezeSha256: 'a'.repeat(64),
    };
  }

  async putFile(localPath: string, remotePath: string): Promise<void> {
    if (remotePath.endsWith('/payload.json')) {
      const p = JSON.parse(readFileSync(localPath, 'utf8')) as CapturedPayload;
      this.lastPayload = p;
    }
  }

  async exec(command: string): Promise<ExecResult> {
    this.commands.push(command);
    if (!command.includes('train_eval.py')) return { code: 0, stdout: '', stderr: '' };
    this.trainings += 1;
    if (this.failTrain !== null) return { code: this.failTrain.code, stdout: '', stderr: this.failTrain.stderr };
    const p = this.lastPayload;
    if (p === null) return { code: 1, stdout: '', stderr: 'fake gateway: no payload captured' };
    // Fresh training k produces a deterministic outcome pattern whose DENSITY varies
    // with k (a phase shift alone would keep accuracy constant at 0.5).
    const k = this.trainings;
    const perRow = p.testIdx.map((_, i) => (i % (2 + k) === 0 ? 1 : 0));
    return {
      code: 0,
      stdout: JSON.stringify({
        metrics: { accuracy: perRow.reduce((a, b) => a + b, 0) / perRow.length },
        perRowCorrect: perRow, nTrain: p.trainIdx.length, nTest: p.testIdx.length, classes: ['neg', 'pos'],
      }),
      stderr: '',
    };
  }
}

const fixtureCsv = (): string => {
  const rows = ['x0,x1,label'];
  for (let i = 0; i < 72; i += 1) {
    const wrongSide = i % 5 === 0;
    rows.push(`${wrongSide ? 0.1 + (i % 5) * 0.1 : 2 + (i % 9) * 0.1},${(i % 5) * 0.3},pos`);
    rows.push(`${wrongSide ? 2 + (i % 6) * 0.1 : 0.1 + (i % 7) * 0.1},${(i % 4) * 0.3},neg`);
  }
  return rows.join('\n') + '\n';
};

interface World {
  dir: string;
  store: Store;
  artifacts: ReturnType<typeof openArtifactStore>;
  spec: ExperimentSpec;
  cleanup: () => void;
}

const makeWorld = async (): Promise<World> => {
  const dir = mkdtempSync(join(tmpdir(), 'farlab-dedup-'));
  const db = openDb(join(dir, 'far.db'));
  const store = new Store(db);
  const artifacts = openArtifactStore(join(dir, 'artifacts'));
  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'dedup?', background: '', goalType: 'explanatory',
    scope: { domain: 'tabular-ml', phenomena: ['classification'] },
    constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
  });
  store.createRun(q);
  const runId = store.listRuns(1)[0]!.id;
  const hyp = HypothesisCandidate.parse({
    id: newId('hyp'), runId, version: 0, statement: 'separable',
    derivation: { strategy: 'evidence_conditioned', rationale: 'dedup fixture' },
    createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp);
  const csvPath = join(dir, 'f.csv');
  writeFileSync(csvPath, fixtureCsv(), 'utf8');
  const spec = ExperimentSpec.parse({
    id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'), version: 1, question: 'dedup',
    datasets: [{ source: { resolver: 'local', path: csvPath }, targetColumn: 'label', split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 } }],
    models: [
      { name: 'baseline', builderId: 'dummy_most_frequent', hyperparams: {}, seed: 0 },
      { name: 'logistic', builderId: 'logistic_regression', hyperparams: {}, seed: 7 },
    ],
    metrics: ['accuracy'],
    comparisons: [{ id: 'cmp', metricKey: 'accuracy', kind: 'paired_diff', modelAIdx: 1, modelBIdx: 0, direction: 'above', threshold: 0, thresholdProvenance: 'model-stipulated', hypothesisId: hyp.id, primary: true, mde: 0.3 }],
    statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 500, analysisSeed: 11, ciLevel: 0.95 },
    approvals: [{ hypothesisId: hyp.id, comparisonIds: ['cmp'], decisionRuleSnapshot: 'diff > 0', approvedBy: 'dedup-test', approvedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  });
  return {
    dir, store, artifacts, spec,
    cleanup: () => {
      try { db.close(); } catch { /* closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag */ }
    },
  };
};

describe('FA-REM-02: fingerprint serialization shapes are frozen (legacy compat)', () => {
  it('local builder reproduces the pre-module inline digest verbatim', () => {
    const legacy = createHash('sha256').update(JSON.stringify({
      specHash: 'h' + '0'.repeat(63), contentRef: `sha256:${'0'.repeat(64)}`, envLock: 'lock-abc',
      modelIdx: 2, seed: 7, builder: 'logistic_regression', hyperparams: { C: 1.0, fit_intercept: true },
    })).digest('hex');
    expect(localCellFingerprint({
      specHash: 'h' + '0'.repeat(63), contentRef: `sha256:${'0'.repeat(64)}`, envLock: 'lock-abc',
      modelIdx: 2, seed: 7, builder: 'logistic_regression', hyperparams: { C: 1.0, fit_intercept: true },
    })).toBe(legacy);
  });

  it('remote builder reproduces the pre-module inline digest verbatim', () => {
    const legacy = createHash('sha256').update(JSON.stringify({
      specHash: 'h' + '0'.repeat(63), contentRef: `sha256:${'1'.repeat(64)}`, device: 'linux-1',
      remotePython: '3.12.1', remotePipFreeze: 'f'.repeat(64),
      modelIdx: 0, seed: 0, builder: 'dummy_most_frequent', hyperparams: {},
    })).digest('hex');
    expect(remoteCellFingerprint({
      specHash: 'h' + '0'.repeat(63), contentRef: `sha256:${'1'.repeat(64)}`, device: 'linux-1',
      remotePython: '3.12.1', remotePipFreeze: 'f'.repeat(64),
      modelIdx: 0, seed: 0, builder: 'dummy_most_frequent', hyperparams: {},
    })).toBe(legacy);
  });

  it('device/python/pip are fingerprint inputs: any change means an honest retrain', () => {
    const base = { specHash: 'h', contentRef: 'sha256:0', remotePython: '3.12.1', remotePipFreeze: 'f', modelIdx: 0, seed: 0, builder: 'b', hyperparams: {} };
    const fp = remoteCellFingerprint({ ...base, device: 'linux-1' });
    expect(remoteCellFingerprint({ ...base, device: 'linux-2' })).not.toBe(fp);
    expect(remoteCellFingerprint({ ...base, device: 'linux-1', remotePython: '3.13.0' })).not.toBe(fp);
    expect(remoteCellFingerprint({ ...base, device: 'linux-1', remotePipFreeze: 'e' })).not.toBe(fp);
  });
});

describe('FA-REM-02: failure path cleans the device staging dir', { timeout: 60_000 }, () => {
  it('a failed run still rm -rf /tmp/farlab/<id> on the device', async () => {
    const world = await makeWorld();
    const gateway = new FakeGateway();
    gateway.failTrain = { code: 1, stderr: 'simulated device crash' };
    try {
      await expect(executeRemoteExperiment(world.store, world.artifacts, world.spec, {
        gateway, deviceId: 'linux-1', allowLocalDatasets: true,
      })).rejects.toThrow(/exited 1/);
      const run = world.store.listObjects('experiment_run', world.spec.runId)[0]!;
      expect(run.status).toBe('failed');
      const cleanup = `rm -rf /tmp/farlab/${run.id}`;
      expect(gateway.commands).toContain(cleanup);
      // Cleanup happens AFTER the failing training, not before it.
      expect(gateway.commands.indexOf(cleanup)).toBeGreaterThan(
        gateway.commands.findIndex((c) => c.includes('train_eval.py')),
      );
      // Happy-path invariant kept: no cleanup-failure note was needed.
      expect(gateway.commands.filter((c) => c === cleanup)).toHaveLength(1);
    } finally {
      world.cleanup();
    }
  });
});

describe('FA-REM-02: remote retry resumes from cell cache, not retraining', { timeout: 300_000 }, () => {
  it.runIf(uvAvailable())('same-device retry replays cached cells; different device retrains', async () => {
    const world = await makeWorld();
    const gateway = new FakeGateway();
    try {
      // Sequential first execution: both models train on the device.
      const first = await executeRemoteExperiment(world.store, world.artifacts, world.spec, {
        gateway, deviceId: 'linux-1', allowLocalDatasets: true,
      });
      expect(gateway.trainings).toBe(2);
      expect(first.run.status).toBe('completed');

      // trainingLogRef is attached by a post-completion store write, so read the
      // persisted run back instead of using the in-memory return value. The retry
      // reuses the SAME run id and overwrites the log ref — capture run 1's first.
      const firstLogRef = world.store.getObject('experiment_run', first.run.id)!.trainingLogRef!;
      const firstLog = await world.artifacts.get(firstLogRef);
      expect(firstLog).not.toContain('cache-hit');

      // Retry on the SAME device (worker crash between far.db and scheduler.complete):
      // every cell is a cache hit — zero remote trainings, identical cells,
      // deterministic stats replayed from the cached per-row artifacts.
      const storedSpec = world.store.getObject('experiment_spec', world.spec.id)!;
      const retry = await executeRemoteExperiment(world.store, world.artifacts, storedSpec, {
        gateway, deviceId: 'linux-1', allowLocalDatasets: true, existingRunId: first.run.id,
      });
      expect(gateway.trainings).toBe(2);
      expect(retry.run.attempts).toBe(2);
      expect(retry.resultSet.cells).toEqual(first.resultSet.cells);
      expect(retry.resultSet.id).not.toBe(first.resultSet.id); // fresh result_set row, cached cells
      const retryLog = await world.artifacts.get(world.store.getObject('experiment_run', retry.run.id)!.trainingLogRef!);
      expect(retryLog).toContain('cache-hit');
      expect(retry.statReports[0]!.pointEstimate).toBe(first.statReports[0]!.pointEstimate);

      // Different device: fingerprint is device-scoped — honest retrain, new cells.
      const other = await executeRemoteExperiment(world.store, world.artifacts, storedSpec, {
        gateway, deviceId: 'linux-2', allowLocalDatasets: true,
      });
      expect(gateway.trainings).toBe(4);
      const firstFps = new Set(first.resultSet.cells.map((c) => c.fingerprint));
      for (const cell of other.resultSet.cells) expect(firstFps.has(cell.fingerprint)).toBe(false);
      expect(other.resultSet.cells.map((c) => c.metrics.accuracy)).not.toEqual(
        first.resultSet.cells.map((c) => c.metrics.accuracy),
      );
    } finally {
      world.cleanup();
    }
  });
});
