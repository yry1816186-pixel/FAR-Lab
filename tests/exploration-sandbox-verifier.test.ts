import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFileSync }));

describe('FA-SEC-01 verifier image pinning', () => {
  it('resolves a tag once and creates every container from its immutable image ID', async () => {
    const {
      run,
      SANDBOX_POLICY,
      SANDBOX_ENTRYPOINT,
    } = await import('../scripts/verify-exploration-sandbox.mjs');

    const imageRef = 'farlab-experiment-runtime:sec01';
    const imageId = `sha256:${'b'.repeat(64)}`;
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
      User: '65532:65532', Entrypoint: [...SANDBOX_ENTRYPOINT], Env: imageEnv,
      WorkingDir: '/tmp', Cmd: null, Volumes: null, ExposedPorts: null,
    };
    const image = { Id: imageId, Os: 'linux', Config: runtimeConfig };
    const hostConfig = {
      NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, AutoRemove: true,
      PidsLimit: 64, Memory: 512 * 1024 * 1024, MemorySwap: 512 * 1024 * 1024,
      NanoCpus: 500_000_000, Init: true, IpcMode: 'private', CgroupnsMode: 'private',
      PidMode: '', VolumesFrom: null, Devices: [], DeviceRequests: null,
      CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges:true'],
      Tmpfs: { '/tmp': SANDBOX_POLICY.tmpfs.slice('/tmp:'.length) }, Binds: [],
      Ulimits: [
        { Name: 'nofile', Soft: 64, Hard: 64 },
        { Name: 'fsize', Soft: 1024 * 1024, Hard: 1024 * 1024 },
      ],
    };
    const policyHash = createHash('sha256')
      .update(readFileSync(new URL('../experiment-runtime/sandbox-policy.json', import.meta.url)))
      .digest('hex');
    const sandboxInfo = {
      backend: 'docker-linux', uid: 65532, gid: 65532,
      noNewPrivs: true, seccompEnabled: true, seccompMode: 2,
      capEff: '0000000000000000', rootfsReadOnly: true, tmpWritable: true,
      networkDisabled: true, interfaces: ['lo'], policyHash, policyVersion: 1,
      cgroup: { memoryMaxBytes: 512 * 1024 * 1024, pidsMax: 64, cpuMax: '50000 100000' },
    };
    const containers = new Set<string>();
    const createCalls: string[][] = [];
    let startCalls = 0;
    execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === 'info') return 'linux\n';
      if (args[0] === 'image' && args[1] === 'inspect') {
        expect(args[2]).toBe(imageRef);
        return JSON.stringify([image]);
      }
      if (args[0] === 'create') {
        createCalls.push(args);
        const nameIndex = args.indexOf('--name');
        const name = args[nameIndex + 1];
        if (name === undefined) throw new Error('mock create omitted container name');
        // A mutable tag would be rejected here: the mock models a retargeted
        // tag after image inspection, while the captured digest remains valid.
        if (args.at(-1) !== imageId) throw new Error(`create received mutable image ref ${args.at(-1)}`);
        containers.add(name);
        return '';
      }
      if (args[0] === 'inspect') {
        const name = args[1];
        if (!containers.has(name)) {
          const error = Object.assign(new Error(`No such container: ${name}`), { stderr: `Error: No such container: ${name}` });
          throw error;
        }
        return JSON.stringify([{
          Image: imageId,
          Config: runtimeConfig,
          HostConfig: hostConfig,
          Mounts: [],
        }]);
      }
      if (args[0] === 'start') {
        startCalls += 1;
        return startCalls === 1
          ? `${JSON.stringify({ id: 1, ok: true, result: sandboxInfo })}\n`
          : `${JSON.stringify({ id: 2, ok: true, result: { exploration: { ok: true, stdout: '2.0\n' } } })}\n`;
      }
      if (args[0] === 'rm') {
        containers.delete(args[2]);
        return '';
      }
      throw new Error(`unexpected docker command: ${args.join(' ')}`);
    });

    expect(() => run(imageRef)).not.toThrow();
    expect(createCalls).toHaveLength(2);
    expect(createCalls.every((args) => args.at(-1) === imageId)).toBe(true);
    expect(createCalls.flat()).not.toContain(imageRef);
    expect(startCalls).toBe(2);
  });
});
