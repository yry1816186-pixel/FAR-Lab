import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { openScheduler, enqueueExperiment, runSchedulerWorker } from '../src/experiment/scheduler.js';
import { executeRemoteExperiment } from '../src/experiment/remote-executor.js';
import { openDeviceRegistry } from '../src/experiment/devices.js';
import { generateTargetKey } from '../src/experiment/gateway.js';
import { ResearchQuestion, HypothesisCandidate, newId } from '../src/domain/index.js';

/**
 * Full remote chain (D-084 endgame): device-registry config -> per-device queue ->
 * remote worker claims it -> REAL training inside the Docker/WSL2 Linux container
 * (reviewed template only) -> LOCAL deterministic statistics/verdicts/feedback.
 * Skipped honestly when the daemon is down.
 */

const dockerReady = (): boolean => {
  try {
    execFileSync('docker', ['info', '--format', 'x'], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
};

const CONTAINER = 'farlab-remote-exec-test';
const PORT = 2224;
const ready = dockerReady();

afterAll(() => {
  if (!ready) return;
  try { execFileSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' }); } catch { /* gone */ }
});

beforeAll(() => {
  if (!ready) return;
  // Idempotent fixture: a previous crashed/killed run leaves the named container
  // behind, and docker run --name would then conflict. Force-clean up front.
  try { execFileSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' }); } catch { /* gone */ }
});

const fixtureCsv = (): string => {
  const rows = ['x0,x1,label'];
  for (let i = 0; i < 72; i += 1) {
    const wrongSide = i % 5 === 0;
    rows.push(`${wrongSide ? 0.1 + (i % 5) * 0.1 : 2 + (i % 9) * 0.1},${(i % 5) * 0.3},pos`);
    rows.push(`${wrongSide ? 2 + (i % 6) * 0.1 : 0.1 + (i % 7) * 0.1},${(i % 4) * 0.3},neg`);
  }
  return rows.join('\n') + '\n';
};

describe('P3 remote executor: device-bound queue -> remote training -> local verdicts', { timeout: 600_000 }, () => {
  it.runIf(ready)('worker on the ssh device executes the full chain', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'farlab-rexec-'));
    // 1. Target container (same image as gateway verification).
    const identity = join(dir, 'id_ed25519');
    await generateTargetKey(identity);
    execFileSync('docker', ['build', '-t', 'farlab-ssh-target', join(import.meta.dirname, '..', 'experiment-runtime', 'ssh-target')], { stdio: 'ignore' });
    const pub = readFileSync(`${identity}.pub`, 'utf8').trim();
    execFileSync('docker', [
      'run', '-d', '--name', CONTAINER, '-p', `${PORT}:22`, '-e', `AUTHORIZED_KEY=${pub}`,
      'farlab-ssh-target',
      'sh', '-c', `echo "$AUTHORIZED_KEY" > /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys && exec /usr/sbin/sshd -D -e`,
    ]);
    await new Promise<void>((r) => setTimeout(r, 1500));
    const hostKey = execFileSync('docker', ['exec', CONTAINER, 'cat', '/etc/ssh/ssh_host_ed25519_key.pub'], { encoding: 'utf8' }).trim();
    const knownHosts = join(dir, 'known_hosts');
    writeFileSync(knownHosts, `[localhost]:${PORT} ${hostKey}\n`);

    // 2. Device registry config in the data dir (operator-declared, gitignored area).
    const dataDir = join(dir, 'far-run');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'devices.json'), JSON.stringify({
      devices: [
        { id: 'local', kind: 'local' },
        { id: 'linux-1', kind: 'ssh', host: 'localhost', port: PORT, user: 'root', identityFile: identity, knownHostsFile: knownHosts },
      ],
    }, null, 2), 'utf8');
    const registry = openDeviceRegistry(join(dataDir, 'devices.json'));
    expect(registry.ids()).toEqual(['local', 'linux-1']);

    // 3. World + spec enqueued ON THE REMOTE DEVICE.
    const db = openDb(join(dataDir, 'far.db'));
    const store = new Store(db);
    const scheduler = openScheduler(join(dataDir, 'far-scheduler.db'));
    const artifacts = openArtifactStore(join(dataDir, 'artifacts'));
    try {
      const q = ResearchQuestion.parse({
        id: newId('q'), text: 'remote chain?', background: '', goalType: 'explanatory',
        scope: { domain: 'tabular-ml', phenomena: ['classification'] },
        constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
      });
      store.createRun(q);
      const runId = store.listRuns(1)[0]!.id;
      const hyp = HypothesisCandidate.parse({
        id: newId('hyp'), runId, version: 0, statement: 'separable',
        derivation: { strategy: 'evidence_conditioned', rationale: 'remote chain fixture' },
        createdAt: new Date().toISOString(),
      });
      store.putObject('hypothesis', hyp);
      const csvPath = join(dir, 'f.csv');
      writeFileSync(csvPath, fixtureCsv(), 'utf8');
      const spec = {
        id: newId('xsp'), runId, planId: newId('pln'), planStepId: newId('task'), version: 1, question: 'remote',
        datasets: [{ source: { resolver: 'local', path: csvPath }, targetColumn: 'label', split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 } }],
        models: [
          { name: 'baseline', builderId: 'dummy_most_frequent', hyperparams: {}, seed: 0 },
          { name: 'logistic', builderId: 'logistic_regression', hyperparams: {}, seed: 7 },
        ],
        metrics: ['accuracy'],
        comparisons: [{ id: 'cmp', metricKey: 'accuracy', kind: 'paired_diff', modelAIdx: 1, modelBIdx: 0, direction: 'above', threshold: 0, thresholdProvenance: 'model-stipulated', hypothesisId: hyp.id, primary: true, mde: 0.3 }],
        statistics: { test: 'paired_bootstrap_ci', alpha: 0.05, nBoot: 500, analysisSeed: 11, ciLevel: 0.95 },
        approvals: [{ hypothesisId: hyp.id, comparisonIds: ['cmp'], decisionRuleSnapshot: 'diff > 0', approvedBy: 'remote-test', approvedAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
      };
      const { experimentRunId, jobId } = enqueueExperiment(store, scheduler, spec, { allowLocalDatasets: true, device: 'linux-1' });

      // 4. A LOCAL worker must NOT steal the remote job (device-bound dispatch).
      const localPass = await runSchedulerWorker(store, artifacts, scheduler, {
        worker: 'local-w', maxRunning: 2, heartbeatTtlMs: 120_000, allowLocalDatasets: true, maxJobs: 5, device: 'local',
      });
      expect(localPass).toEqual({ executed: 0, failed: 0 });

      // 5. Remote worker drains it: remote training + local verdicts.
      const remotePass = await runSchedulerWorker(store, artifacts, scheduler, {
        worker: 'remote-w', maxRunning: 1, heartbeatTtlMs: 300_000, heartbeatMs: 2_000, allowLocalDatasets: true, maxJobs: 5, device: 'linux-1',
        executeVia: (st, ar, sp, o) => executeRemoteExperiment(st, ar, sp, {
          gateway: registry.gatewayFor('linux-1'), deviceId: 'linux-1',
          allowLocalDatasets: o.allowLocalDatasets, existingRunId: o.existingRunId, shouldCancel: o.shouldCancel,
        }),
      });
      expect(remotePass, JSON.stringify(scheduler.get(jobId))).toEqual({ executed: 1, failed: 0 });

      const job = scheduler.get(jobId)!;
      expect(job.device).toBe('linux-1');
      expect(job.status).toBe('completed');
      const run = store.getObject('experiment_run', experimentRunId)!;
      expect(run.status).toBe('completed');
      expect(run.executor).toBe('remote');
      expect(run.environment?.pythonVersion).toMatch(/^remote:/);
      expect(run.trainingLogRef).toMatch(/^sha256:/);
      // Verdict chain completed locally on remote-produced cells.
      const rep = store.getObject('stat_report', run.statReportIds[0]!)!;
      expect(['supports', 'inconclusive']).toContain(rep.verdict);
      expect(rep.verdictDerivation).toContain('threshold source: model-stipulated');
      const signals = store.listObjects('feedback', runId);
      expect(signals).toHaveLength(1);
      expect(signals[0]!.source).toBe('experiment');
      // Remote artifacts were cleaned up on the device.
      const leftovers = await registry.gatewayFor('linux-1').exec('ls /tmp/farlab 2>/dev/null | wc -l');
      expect(leftovers.stdout.trim()).toBe('0');
    } finally {
      try { db.close(); scheduler.close(); } catch { /* closed */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag */ }
    }
  });

  it.skipIf(ready)('docker daemon not running — remote executor chain honestly skipped', () => {
    expect(true).toBe(true);
  });
});
