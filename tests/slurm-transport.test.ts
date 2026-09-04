import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SlurmTransport } from '../src/experiment/slurm-transport.js';
import { openDeviceRegistry, type DeviceRegistry } from '../src/experiment/devices.js';
import { gatewayForDevice } from '../src/experiment/device-gateway.js';
import type { ExecResult } from '../src/experiment/gateway.js';

/**
 * FA-REM-04 mock-scheduler e2e: a scripted sbatch/squeue/scancel cluster drives the
 * REAL submit→poll→terminal state machine (only the cluster is mocked — the
 * transport, cancel bridge, and device-kind wiring under test are the real code).
 */

interface SchedulerCall { cmd: string }

const scriptCluster = (behavior: {
  states: string[]; // squeue states in order; last one is terminal
  output?: string;
  failSubmit?: boolean;
}) => {
  const calls: SchedulerCall[] = [];
  let squeueIdx = 0;
  const run = async (cmd: string): Promise<ExecResult> => {
    calls.push({ cmd });
    if (cmd.startsWith('sbatch')) {
      if (behavior.failSubmit) return { code: 1, stdout: '', stderr: 'sbatch: invalid partition' };
      return { code: 0, stdout: '424242', stderr: '' };
    }
    if (cmd.startsWith('squeue')) {
      const state = behavior.states[Math.min(squeueIdx, behavior.states.length - 1)] ?? 'RUNNING';
      squeueIdx += 1;
      return { code: 0, stdout: state, stderr: '' };
    }
    if (cmd.startsWith('scancel')) return { code: 0, stdout: '', stderr: '' };
    if (cmd.startsWith('cat ')) return { code: 0, stdout: behavior.output ?? 'job stdout here', stderr: '' };
    return { code: 1, stdout: '', stderr: `unexpected cluster command: ${cmd.slice(0, 60)}` };
  };
  return { run, calls };
};

describe('SlurmTransport (batch exec behind the gateway seam)', () => {
  it('submits via sbatch, polls squeue to COMPLETED, and returns job stdout like an exec', async () => {
    const cluster = scriptCluster({ states: ['PENDING', 'RUNNING', 'COMPLETED'], output: 'train_eval ok' });
    const t = SlurmTransport.withRunner(cluster.run, { pollIntervalMs: 1 });
    const res = await t.exec('python train_eval.py --input x', 60_000);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('train_eval ok');
    expect(res.stderr).toBe('');
    const submit = cluster.calls.find((c) => c.cmd.startsWith('sbatch'))!.cmd;
    expect(submit).toContain('--parsable');
    expect(submit).toContain('python train_eval.py --input x');
    expect(cluster.calls.filter((c) => c.cmd.startsWith('squeue -h -j 424242')).length).toBe(3);
  });

  it('partition/account/timeLimit ride the sbatch line when declared', async () => {
    const cluster = scriptCluster({ states: ['COMPLETED'] });
    const t = SlurmTransport.withRunner(cluster.run, { partition: 'gpu-long', account: 'proj77', timeLimit: '02:00:00', pollIntervalMs: 1 });
    await t.exec('python x', 60_000);
    const submit = cluster.calls.find((c) => c.cmd.startsWith('sbatch'))!.cmd;
    expect(submit).toContain('-p gpu-long');
    expect(submit).toContain('-A proj77');
    expect(submit).toContain('-t 02:00:00');
  });

  it('a FAILED job surfaces as a non-zero exit with the state in stderr (data, not a throw)', async () => {
    const cluster = scriptCluster({ states: ['RUNNING', 'FAILED'], output: 'traceback...' });
    const t = SlurmTransport.withRunner(cluster.run, { pollIntervalMs: 1 });
    const res = await t.exec('python x', 60_000);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('FAILED');
    expect(res.stdout).toBe('traceback...');
  });

  it('TIMEOUT maps to exit 124; CANCELLED maps to 137', async () => {
    const c1 = scriptCluster({ states: ['TIMEOUT'] });
    const r1 = await SlurmTransport.withRunner(c1.run, { pollIntervalMs: 1 }).exec('x', 60_000);
    expect(r1.code).toBe(124);
    const c2 = scriptCluster({ states: ['CANCELLED'] });
    const r2 = await SlurmTransport.withRunner(c2.run, { pollIntervalMs: 1 }).exec('x', 60_000);
    expect(r2.code).toBe(137);
  });

  it('cooperative cancel flag scancels the running job and returns a canceled exit (never hangs)', async () => {
    const cluster = scriptCluster({ states: ['RUNNING'] }); // never completes on its own
    let cancelAfter = false;
    const shouldCancel = () => cancelAfter;
    const t = SlurmTransport.withRunner(cluster.run, { pollIntervalMs: 1 }, shouldCancel);
    const p = t.exec('python x', 60_000);
    setTimeout(() => { cancelAfter = true; }, 5);
    const res = await p;
    expect(res.code).toBe(137);
    expect(cluster.calls.some((c) => c.cmd === 'scancel 424242')).toBe(true);
  });

  it('a submit failure fails visible with the scheduler stderr', async () => {
    const cluster = scriptCluster({ states: [], failSubmit: true });
    const res = await SlurmTransport.withRunner(cluster.run).exec('python x', 60_000);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('sbatch failed');
    expect(res.stderr).toContain('invalid partition');
  });

  it('probe refuses a host without sbatch/squeue/scancel (fail-visible device check)', async () => {
    const run = async (cmd: string): Promise<ExecResult> =>
      cmd.includes('command -v sbatch') ? { code: 1, stdout: '', stderr: 'command not found' } : { code: 0, stdout: '', stderr: '' };
    const t = SlurmTransport.withRunner(run);
    const probe = (await t.probe()) as { reachable: boolean; slurmBinaries: boolean };
    expect(probe.slurmBinaries).toBe(false);
    expect(probe.reachable).toBe(false);
  });
});

describe('device registry kind=slurm (declaration + gateway wiring)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-slurm-dev-'));
  const write = (devices: unknown) => fs.writeFileSync(path.join(dir, 'devices.json'), JSON.stringify(devices), 'utf8');

  it('parses a slurm device, exposes batch options, and gatewayForDevice wraps it in the batch transport', () => {
    write({
      devices: [
        { id: 'local', kind: 'local' },
        { id: 'cluster-a', kind: 'slurm', host: 'h1', port: 22, user: 'u', identityFile: 'k', knownHostsFile: 'kh', partition: 'main', timeLimit: '04:00:00' },
      ],
    });
    const reg: DeviceRegistry = openDeviceRegistry(path.join(dir, 'devices.json'));
    expect(reg.ids()).toEqual(['local', 'cluster-a']);
    expect(reg.slurmOptionsFor('cluster-a')).toEqual({ partition: 'main', timeLimit: '04:00:00' });
    expect(reg.slurmOptionsFor('local')).toBeNull();
    const gw = gatewayForDevice(reg, 'cluster-a');
    expect(gw).toBeInstanceOf(SlurmTransport);
    expect(() => gatewayForDevice(reg, 'local')).toThrow(/not an ssh\/slurm device/); // local has no gateway path
  });

  it('an ssh device still gets the plain gateway through the same wiring', () => {
    write({
      devices: [
        { id: 'local', kind: 'local' },
        { id: 'box', kind: 'ssh', host: 'h2', port: 22, user: 'u', identityFile: 'k', knownHostsFile: 'kh' },
      ],
    });
    const reg = openDeviceRegistry(path.join(dir, 'devices.json'));
    expect(reg.slurmOptionsFor('box')).toBeNull();
    expect(gatewayForDevice(reg, 'box').constructor.name).toBe('SSHGateway');
  });
});
