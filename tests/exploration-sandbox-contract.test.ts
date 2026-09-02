import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  SANDBOX_POLICY,
  SANDBOX_ENTRYPOINT,
  dockerArgs,
  requireImmutableImageId,
  verifyContainerConfig,
  verifyContainerImage,
  verifyHostConfig,
  verifyImageConfig,
  verifySandboxInfo,
} from '../scripts/verify-exploration-sandbox.mjs';

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
const imageId = `sha256:${'a'.repeat(64)}`;
const image = { Id: imageId, Os: 'linux', Config: runtimeConfig };
const host = {
  Image: imageId,
  HostConfig: {
    NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, AutoRemove: true,
    PidsLimit: 64, Memory: 512 * 1024 * 1024, MemorySwap: 512 * 1024 * 1024, NanoCpus: 500_000_000,
    Init: true, IpcMode: 'private', CgroupnsMode: 'private',
    PidMode: '', VolumesFrom: null, Devices: [], DeviceRequests: null,
    CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges:true'],
    Tmpfs: { '/tmp': SANDBOX_POLICY.tmpfs.slice('/tmp:'.length) }, Binds: [],
    Ulimits: [
      { Name: 'nofile', Soft: 64, Hard: 64 },
      { Name: 'fsize', Soft: 1024 * 1024, Hard: 1024 * 1024 },
    ],
  },
  Config: runtimeConfig,
  Mounts: [],
};
const policyHash = createHash('sha256')
  .update(readFileSync(new URL('../experiment-runtime/sandbox-policy.json', import.meta.url)))
  .digest('hex');
const info = {
  backend: 'docker-linux', uid: 65532, gid: 65532,
  noNewPrivs: true, seccompEnabled: true, seccompMode: 2,
  capEff: '0000000000000000', rootfsReadOnly: true, tmpWritable: true,
  networkDisabled: true, interfaces: ['lo'], policyHash, policyVersion: 1,
  cgroup: { memoryMaxBytes: 512 * 1024 * 1024, pidsMax: 64, cpuMax: '50000 100000' },
};

describe('FA-SEC-01 OCI sandbox verification contract', () => {
  it('accepts the required image, Docker HostConfig, and in-container attestation', () => {
    expect(verifyImageConfig(image)).toBe(imageId);
    expect(() => verifyHostConfig(host)).not.toThrow();
    expect(() => verifyContainerConfig(host)).not.toThrow();
    expect(() => verifyContainerImage(host, imageId)).not.toThrow();
    expect(() => verifySandboxInfo(info)).not.toThrow();
  });

  it('requires a full immutable image ID and passes only that ID to docker create', () => {
    expect(requireImmutableImageId(imageId)).toBe(imageId);
    expect(() => requireImmutableImageId('farlab-experiment-runtime:sec01')).toThrow(/immutable/);
    expect(() => verifyImageConfig({ ...image, Id: 'sha256:short' })).toThrow(/immutable/);
    expect(() => verifyContainerImage({ ...host, Image: 'farlab-experiment-runtime:sec01' }, imageId)).toThrow(/container Image/);
    expect(() => verifyContainerImage({ ...host, Image: imageId }, 'farlab-experiment-runtime:sec01')).toThrow(/immutable/);

    const args = dockerArgs('farlab-sec01-contract', imageId);
    expect(args.at(-1)).toBe(imageId);
    expect(() => dockerArgs('farlab-sec01-contract', 'farlab-experiment-runtime:sec01')).toThrow(/immutable/);
  });

  it('fails closed when a required containment fact is missing or weakened', () => {
    expect(() => verifyImageConfig({ ...image, Config: { User: 'root' } })).toThrow(/Config.User/);
    expect(() => verifyHostConfig({ HostConfig: { ...host.HostConfig, NetworkMode: 'default' } })).toThrow(/NetworkMode/);
    const { Privileged: _omittedPrivileged, ...withoutPrivileged } = host.HostConfig;
    expect(() => verifyHostConfig({ ...host, HostConfig: withoutPrivileged })).toThrow(/Privileged/);
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, AutoRemove: false } })).toThrow(/AutoRemove/);
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, Binds: ['/host:/host'] } })).toThrow(/bind mounts/);
    expect(() => verifySandboxInfo({ ...info, uid: 0 })).toThrow(/uid/);
    expect(() => verifySandboxInfo({ ...info, uid: 65533 })).toThrow(/uid/);
    expect(() => verifySandboxInfo({ ...info, gid: 65533 })).toThrow(/gid/);
    expect(() => verifySandboxInfo({ ...info, backend: 'host-process' })).toThrow(/backend/);
    expect(() => verifySandboxInfo({ ...info, seccompEnabled: false })).toThrow(/seccompEnabled/);
    expect(() => verifySandboxInfo({ ...info, seccompMode: 1 })).toThrow(/seccompMode/);
    expect(() => verifySandboxInfo({ ...info, capEff: '0000000000000001' })).toThrow(/capEff/);
    expect(() => verifySandboxInfo({ ...info, interfaces: ['lo', 'eth0'] })).toThrow(/interfaces/);
    expect(() => verifySandboxInfo({ ...info, policyVersion: 2 })).toThrow(/policyVersion/);
    expect(() => verifySandboxInfo({ ...info, cgroup: { ...info.cgroup, memoryMaxBytes: 1024 * 1024 * 1024 } })).toThrow(/memoryMaxBytes/);
    expect(() => verifySandboxInfo({ ...info, cgroup: { ...info.cgroup, pidsMax: 65 } })).toThrow(/pidsMax/);
    expect(() => verifySandboxInfo({ ...info, cgroup: { ...info.cgroup, cpuMax: '50000 1000000' } })).toThrow(/cpuMax/);
    expect(() => verifySandboxInfo({ ...info, policyHash: 'not-a-hash' })).toThrow(/policyHash/);
  });

  it('rejects image and runtime configuration changes that widen execution or ambient authority', () => {
    expect(() => verifyImageConfig({ ...image, Config: { ...runtimeConfig, Entrypoint: ['/bin/sh'] } })).toThrow(/Entrypoint/);
    expect(() => verifyImageConfig({ ...image, Config: { ...runtimeConfig, Volumes: { '/data': {} } } })).toThrow(/Volumes/);
    expect(() => verifyImageConfig({ ...image, Config: { ...runtimeConfig, ExposedPorts: { '8080/tcp': {} } } })).toThrow(/ExposedPorts/);
    const { Volumes: _omittedVolumes, ...withoutVolumes } = runtimeConfig;
    expect(() => verifyImageConfig({ ...image, Config: withoutVolumes })).not.toThrow();
    expect(() => verifyImageConfig({ ...image, Config: { ...runtimeConfig, Env: [...imageEnv, 'ZAI_API_KEY=secret'] } })).toThrow(/forbidden.*ZAI_API_KEY/);
    expect(() => verifyImageConfig({ ...image, Config: { ...runtimeConfig, Env: imageEnv.filter((entry) => !entry.startsWith('HOME=')) } })).toThrow(/HOME=/);
    expect(() => verifyImageConfig({ ...image, Config: { ...runtimeConfig, Env: imageEnv.map((entry) => entry === 'PYTHONHASHSEED=0' ? 'PYTHONHASHSEED=1' : entry) } })).toThrow(/PYTHONHASHSEED=0/);
    expect(() => verifyImageConfig({ ...image, Config: { ...runtimeConfig, Cmd: ['-c', 'evil'] } })).toThrow(/Cmd/);
    expect(() => verifyContainerConfig({ ...host, Config: { ...runtimeConfig, User: '0:0' } })).toThrow(/container Config.User/);
    expect(() => verifyContainerConfig({ ...host, Config: { ...runtimeConfig, Env: [...imageEnv, 'HTTP_PROXY=http://proxy'] } })).toThrow(/HTTP_PROXY/);
  });

  it('rejects non-private PID namespaces, device authority, volumes-from, and any mount', () => {
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, PidMode: 'host' } })).toThrow(/PidMode/);
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, CapAdd: ['SYS_ADMIN'] } })).toThrow(/CapAdd/);
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, Devices: [{ PathOnHost: '/dev/null' }] } })).toThrow(/devices/);
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, DeviceRequests: [{}] } })).toThrow(/device requests/);
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, VolumesFrom: ['trusted-container'] } })).toThrow(/volumes-from/);
    expect(() => verifyHostConfig({ ...host, Mounts: [{ Type: 'tmpfs', Destination: '/tmp' }] })).toThrow(/additional mounts/);
    expect(() => verifyHostConfig({ ...host, HostConfig: { ...host.HostConfig, Binds: [] } })).not.toThrow();
  });
});
