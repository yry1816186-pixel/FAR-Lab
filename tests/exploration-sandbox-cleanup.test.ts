import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
const spawn = vi.fn();

vi.mock('node:child_process', () => ({ execFileSync, spawn }));

const imageEnv = [
  'PATH=/opt/farlab/.venv/bin:/usr/local/bin:/usr/bin:/bin',
  'LANG=C.UTF-8',
  'GPG_KEY=7169605F62C751356D054A26A821E680E5FA6305',
  'PYTHON_VERSION=3.12.12',
  'PYTHON_SHA256=fb85a13414b028c49ba18bbd523c2d055a30b56b18b92ce454ea2c51edc656c4',
  'PYTHONPATH=', 'PYTHONDONTWRITEBYTECODE=1', 'PYTHONUNBUFFERED=1', 'PYTHONHASHSEED=0',
  'HOME=/tmp', 'TMPDIR=/tmp', 'OMP_NUM_THREADS=1', 'OPENBLAS_NUM_THREADS=1',
  'MKL_NUM_THREADS=1', 'NUMEXPR_NUM_THREADS=1',
  'FARLAB_SANDBOX_POLICY_PATH=/opt/farlab/sandbox-policy.json',
];

const runtimeConfig = {
  User: '65532:65532',
  Entrypoint: ['/opt/farlab/.venv/bin/python', '-I', '-m', 'farlab_experiment_runtime.sandbox_main'],
  Env: imageEnv,
  WorkingDir: '/tmp',
  Cmd: null,
  Volumes: null,
  ExposedPorts: null,
};

const containerInspect = {
  Config: runtimeConfig,
  HostConfig: {
    NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, AutoRemove: true,
    PidsLimit: 64, Memory: 512 * 1024 * 1024, MemorySwap: 512 * 1024 * 1024,
    NanoCpus: 500_000_000, Init: true, IpcMode: 'private', CgroupnsMode: 'private',
    PidMode: '', CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges:true'],
    Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=32m' }, Binds: null, VolumesFrom: null,
    Devices: [], DeviceRequests: null,
    Ulimits: [
      { Name: 'nofile', Soft: 64, Hard: 64 },
      { Name: 'fsize', Soft: 1024 * 1024, Hard: 1024 * 1024 },
    ],
  },
  Mounts: [],
};

describe('exploration sandbox cleanup failure handling', () => {
  beforeEach(() => {
    execFileSync.mockReset();
    spawn.mockReset();
  });

  it('terminates the attach client even when forced container removal fails', async () => {
    const client = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      killed: false,
      kill: vi.fn(function kill(this: { killed: boolean }) {
        this.killed = true;
        return true;
      }),
    });
    spawn.mockReturnValue(client);
    execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === 'info') return 'linux\n';
      if (args[0] === 'create') return '';
      if (args[0] === 'rm') throw new Error('injected Docker daemon removal failure');
      if (args[0] === 'inspect' && args[1] === 'farlab-experiment-runtime:sec01') {
        return JSON.stringify([{
          Id: `sha256:${'a'.repeat(64)}`,
          Os: 'linux',
          Config: runtimeConfig,
        }]);
      }
      if (args[0] === 'inspect') return JSON.stringify([containerInspect]);
      throw new Error(`unexpected Docker command: ${args.join(' ')}`);
    });

    const { createExplorationSandbox } = await import('../src/experiment/exploration-sandbox.js');
    const sandbox = createExplorationSandbox();

    expect(() => sandbox.close()).toThrow(/failed to remove exploration sandbox container/);
    expect(client.kill).toHaveBeenCalledOnce();
    expect(client.killed).toBe(true);
  });

  it('keeps the client closed while retrying a transient removal/absence-proof failure', async () => {
    const client = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      killed: false,
      kill: vi.fn(function kill(this: { killed: boolean }) {
        this.killed = true;
        return true;
      }),
    });
    spawn.mockReturnValue(client);
    let removeAttempts = 0;
    let containerName = '';
    let absenceProven = false;
    execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === 'info') return 'linux\n';
      if (args[0] === 'create') {
        const nameIndex = args.indexOf('--name');
        containerName = args[nameIndex + 1] ?? '';
        return '';
      }
      if (args[0] === 'inspect' && args[1] === 'farlab-experiment-runtime:sec01') {
        return JSON.stringify([{
          Id: `sha256:${'a'.repeat(64)}`,
          Os: 'linux',
          Config: runtimeConfig,
        }]);
      }
      if (args[0] === 'inspect' && args[1] === containerName) {
        if (removeAttempts === 0) return JSON.stringify([containerInspect]);
        if (removeAttempts === 1) throw new Error('injected transient inspect failure');
        absenceProven = true;
        throw new Error(`No such object: ${containerName}`);
      }
      if (args[0] === 'rm' && args[2] === containerName) {
        removeAttempts += 1;
        if (removeAttempts === 1) throw new Error('injected transient Docker removal failure');
        return '';
      }
      throw new Error(`unexpected Docker command: ${args.join(' ')}`);
    });

    const { createExplorationSandbox } = await import('../src/experiment/exploration-sandbox.js');
    const sandbox = createExplorationSandbox();

    expect(() => sandbox.close()).toThrow(/failed to remove exploration sandbox container/);
    await expect(sandbox.call('sandbox_info', {}, 1_000)).rejects.toThrow('exploration sandbox closed');
    expect(() => sandbox.close()).not.toThrow();
    expect(removeAttempts).toBe(2);
    expect(absenceProven).toBe(true);
    expect(client.kill).toHaveBeenCalledOnce();
    expect(client.killed).toBe(true);
  });

  it('removes the named container when attach-client spawn throws synchronously', async () => {
    let containerName = '';
    let removed = false;
    spawn.mockImplementation(() => {
      throw new Error('injected synchronous spawn failure');
    });
    execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === 'info') return 'linux\n';
      if (args[0] === 'create') {
        containerName = args[4] ?? '';
        return '';
      }
      if (args[0] === 'rm') {
        removed = true;
        return '';
      }
      if (args[0] === 'inspect' && args[1] === 'farlab-experiment-runtime:sec01') {
        return JSON.stringify([{
          Id: `sha256:${'a'.repeat(64)}`,
          Os: 'linux',
          Config: runtimeConfig,
        }]);
      }
      if (args[0] === 'inspect' && removed) throw new Error(`No such object: ${args[1]}`);
      if (args[0] === 'inspect') return JSON.stringify([containerInspect]);
      throw new Error(`unexpected Docker command: ${args.join(' ')}`);
    });

    const { createExplorationSandbox } = await import('../src/experiment/exploration-sandbox.js');

    expect(() => createExplorationSandbox()).toThrow(/spawn failed/);
    expect(containerName).toMatch(/^farlab-exploration-[0-9a-f]{32}$/);
    expect(execFileSync).toHaveBeenCalledWith(
      'docker',
      ['rm', '--force', containerName],
      expect.objectContaining({ env: expect.any(Object) }),
    );
    expect(removed).toBe(true);
  });
});
