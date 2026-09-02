#!/usr/bin/env node
/**
 * FA-SEC-01 real OCI containment gate.
 *
 * This intentionally does not skip when Docker or the image is unavailable:
 * absence of the isolation backend is a failed security gate, not evidence of
 * a host-side fallback. It proves both the Docker HostConfig and facts observed
 * by the process running inside the container.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULT_IMAGE = 'farlab-experiment-runtime:sec01';
export const SANDBOX_POLICY = Object.freeze({
  version: 1,
  backend: 'docker-linux',
  user: '65532:65532',
  memoryMaxBytes: 512 * 1024 * 1024,
  pidsMax: 64,
  nanoCpus: 500_000_000,
  nofile: 64,
  fsizeBytes: 1024 * 1024,
  cpuMax: '50000 100000',
  tmpfs: '/tmp:rw,noexec,nosuid,nodev,size=32m',
});
export const SANDBOX_ENTRYPOINT = Object.freeze([
  '/opt/farlab/.venv/bin/python', '-I', '-m', 'farlab_experiment_runtime.sandbox_main',
]);
export const DOCKER_COMMAND_TIMEOUT_MS = 30_000;
export const SANDBOX_START_TIMEOUT_MS = 60_000;

// The base image is digest-pinned. These are its non-sensitive runtime facts
// plus the variables declared in experiment-runtime/Dockerfile. Do not permit
// arbitrary image ENV: it would make credential/proxy injection invisible.
const IMAGE_ENV_NAMES = new Set([
  'PATH', 'LANG', 'GPG_KEY', 'PYTHON_VERSION', 'PYTHON_SHA256',
  'PYTHONPATH', 'PYTHONDONTWRITEBYTECODE', 'PYTHONUNBUFFERED', 'PYTHONHASHSEED',
  'HOME', 'TMPDIR', 'OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS',
  'NUMEXPR_NUM_THREADS', 'FARLAB_SANDBOX_POLICY_PATH',
]);
const REQUIRED_IMAGE_ENV = Object.freeze({
  PATH: '/opt/farlab/.venv/bin:/usr/local/bin:/usr/bin:/bin',
  LANG: 'C.UTF-8',
  GPG_KEY: '7169605F62C751356D054A26A821E680E5FA6305',
  PYTHON_VERSION: '3.12.12',
  PYTHON_SHA256: 'fb85a13414b028c49ba18bbd523c2d055a30b56b18b92ce454ea2c51edc656c4',
  PYTHONPATH: '',
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONUNBUFFERED: '1',
  PYTHONHASHSEED: '0',
  HOME: '/tmp',
  TMPDIR: '/tmp',
  OMP_NUM_THREADS: '1',
  OPENBLAS_NUM_THREADS: '1',
  MKL_NUM_THREADS: '1',
  NUMEXPR_NUM_THREADS: '1',
  FARLAB_SANDBOX_POLICY_PATH: '/opt/farlab/sandbox-policy.json',
});

const policyPath = fileURLToPath(new URL('../experiment-runtime/sandbox-policy.json', import.meta.url));
const expectedPolicyHash = () => createHash('sha256').update(readFileSync(policyPath)).digest('hex');

const command = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: DOCKER_COMMAND_TIMEOUT_MS,
  killSignal: 'SIGKILL',
  ...options,
}).trim();

const fail = (message) => { throw new Error(`FA-SEC-01 sandbox verification failed: ${message}`); };

const IMMUTABLE_IMAGE_ID = /^sha256:[0-9a-f]{64}$/;

export const requireImmutableImageId = (value, label = 'image Id') => {
  if (typeof value !== 'string' || !IMMUTABLE_IMAGE_ID.test(value)) {
    fail(`${label} must be a full immutable sha256 image ID`);
  }
  return value;
};

const asRecord = (value, name) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${name} is not an object`);
  return value;
};

const required = (record, key, label = key) => {
  if (!(key in record)) fail(`sandbox_info misses ${label}`);
  return record[key];
};

const requireExactArray = (value, expected, name) => {
  if (!Array.isArray(value) || value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    fail(`${name} does not match the sandbox entrypoint contract`);
  }
};

const requireEmptyObject = (value, name) => {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) {
    fail(`${name} must be empty`);
  }
};

const isNullOrEmptyArray = (value) => value === null || (Array.isArray(value) && value.length === 0);

const verifyEnvironment = (env, name) => {
  if (!Array.isArray(env)) fail(`${name}.Env must be an array`);
  const values = new Map();
  for (const entry of env) {
    if (typeof entry !== 'string') fail(`${name}.Env has a non-string entry`);
    const separator = entry.indexOf('=');
    if (separator <= 0) fail(`${name}.Env has malformed entry`);
    const key = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (!IMAGE_ENV_NAMES.has(key)) fail(`${name}.Env contains forbidden or sensitive variable ${key}`);
    if (values.has(key)) fail(`${name}.Env contains duplicate variable ${key}`);
    values.set(key, value);
  }
  for (const [key, value] of Object.entries(REQUIRED_IMAGE_ENV)) {
    if (values.get(key) !== value) fail(`${name}.Env must set ${key}=${value}`);
  }
};

const verifyRuntimeConfig = (config, name) => {
  const runtime = asRecord(config, name);
  if (runtime.User !== SANDBOX_POLICY.user) fail(`${name}.User must be ${SANDBOX_POLICY.user}`);
  requireExactArray(runtime.Entrypoint, SANDBOX_ENTRYPOINT, `${name}.Entrypoint`);
  verifyEnvironment(runtime.Env, name);
  if (runtime.WorkingDir !== '/tmp') fail(`${name}.WorkingDir must be /tmp`);
  // Docker's JSON formatter omits a null Cmd property on some engine versions.
  if (runtime.Cmd !== undefined && runtime.Cmd !== null && !(Array.isArray(runtime.Cmd) && runtime.Cmd.length === 0)) {
    fail(`${name}.Cmd must be empty`);
  }
  // Docker Desktop can omit a null Volumes field; omitted is equivalent to no
  // declared image volume, while any non-empty map remains a hard failure.
  requireEmptyObject(runtime.Volumes, `${name}.Volumes`);
  requireEmptyObject(runtime.ExposedPorts, `${name}.ExposedPorts`);
};

export const verifyImageConfig = (image) => {
  const config = asRecord(image, 'image inspect');
  const configSection = asRecord(required(config, 'Config'), 'image Config');
  verifyRuntimeConfig(configSection, 'image Config');
  if (config.Os !== 'linux') fail(`image OS must be linux, got ${String(config.Os)}`);
  return requireImmutableImageId(config.Id);
};

export const verifyContainerConfig = (container) => {
  const config = asRecord(container, 'container inspect');
  verifyRuntimeConfig(asRecord(required(config, 'Config'), 'container Config'), 'container Config');
};

export const verifyContainerImage = (container, expectedImageId) => {
  const expected = requireImmutableImageId(expectedImageId, 'expected image Id');
  const config = asRecord(container, 'container inspect');
  const actual = required(config, 'Image', 'container Image');
  if (actual !== expected) {
    fail(`container Image must be ${expected}, got ${String(actual)}`);
  }
};

export const verifyHostConfig = (container) => {
  const config = asRecord(container, 'container inspect');
  const host = asRecord(required(config, 'HostConfig'), 'HostConfig');
  if (host.NetworkMode !== 'none') fail(`NetworkMode must be none, got ${String(host.NetworkMode)}`);
  if (host.ReadonlyRootfs !== true) fail('ReadonlyRootfs must be true');
  if (host.Privileged !== false) fail('Privileged must be false');
  if (host.AutoRemove !== true) fail('AutoRemove must be true');
  if (host.PidsLimit !== SANDBOX_POLICY.pidsMax) fail(`PidsLimit must be ${SANDBOX_POLICY.pidsMax}`);
  if (host.Memory !== SANDBOX_POLICY.memoryMaxBytes) fail(`Memory must be ${SANDBOX_POLICY.memoryMaxBytes}`);
  if (host.MemorySwap !== SANDBOX_POLICY.memoryMaxBytes) fail(`MemorySwap must be ${SANDBOX_POLICY.memoryMaxBytes}`);
  if (host.NanoCpus !== SANDBOX_POLICY.nanoCpus) fail(`NanoCpus must be ${SANDBOX_POLICY.nanoCpus}`);
  if (host.Init !== true) fail('Init must be true');
  if (host.IpcMode !== 'private') fail(`IpcMode must be private, got ${String(host.IpcMode)}`);
  if (host.CgroupnsMode !== 'private') fail(`CgroupnsMode must be private, got ${String(host.CgroupnsMode)}`);
  // Docker represents its safe default private PID namespace as an empty mode.
  if (host.PidMode !== '') fail(`PidMode must use Docker's default private namespace, got ${String(host.PidMode)}`);
  if (!Array.isArray(host.CapDrop) || !host.CapDrop.map(String).includes('ALL')) fail('CapDrop must include ALL');
  if (!isNullOrEmptyArray(host.CapAdd)) fail('CapAdd must be empty');
  if (!Array.isArray(host.SecurityOpt) || !host.SecurityOpt.includes('no-new-privileges:true')) {
    fail('SecurityOpt must include no-new-privileges:true');
  }
  // Docker inspect serializes --tmpfs as an object: { "/tmp": "options" }.
  const tmpfs = asRecord(host.Tmpfs, 'HostConfig.Tmpfs');
  if (tmpfs['/tmp'] !== SANDBOX_POLICY.tmpfs.slice('/tmp:'.length)) {
    fail(`Tmpfs /tmp must be ${SANDBOX_POLICY.tmpfs}`);
  }
  if (host.Binds !== null && !(Array.isArray(host.Binds) && host.Binds.length === 0)) fail('host bind mounts are forbidden');
  if (host.VolumesFrom !== null && !(Array.isArray(host.VolumesFrom) && host.VolumesFrom.length === 0)) fail('volumes-from is forbidden');
  if (!Array.isArray(host.Devices) || host.Devices.length !== 0) fail('devices are forbidden');
  if (host.DeviceRequests !== null && !(Array.isArray(host.DeviceRequests) && host.DeviceRequests.length === 0)) fail('device requests are forbidden');
  const ulimits = Array.isArray(host.Ulimits) ? host.Ulimits : [];
  const hasUlimit = (name, value) => ulimits.some((u) => u.Name === name && u.Soft === value && u.Hard === value);
  if (!hasUlimit('nofile', SANDBOX_POLICY.nofile)) fail('nofile ulimit is missing or weak');
  if (!hasUlimit('fsize', SANDBOX_POLICY.fsizeBytes)) fail('fsize ulimit is missing or weak');
  if (!Array.isArray(config.Mounts) || config.Mounts.length !== 0) fail('additional mounts are forbidden');
};

export const verifySandboxInfo = (info) => {
  const sandbox = asRecord(info, 'sandbox_info result');
  if (required(sandbox, 'backend') !== SANDBOX_POLICY.backend) fail(`backend must be ${SANDBOX_POLICY.backend}`);
  if (required(sandbox, 'uid') !== 65532) fail('uid must be exactly 65532');
  if (required(sandbox, 'gid') !== 65532) fail('gid must be exactly 65532');
  for (const key of ['noNewPrivs', 'seccompEnabled', 'rootfsReadOnly', 'tmpWritable', 'networkDisabled']) {
    if (required(sandbox, key) !== true) fail(`${key} must be true`);
  }
  if (required(sandbox, 'seccompMode') !== 2) fail('seccompMode must be filter mode 2');
  if (required(sandbox, 'capEff') !== '0000000000000000') fail('capEff must be 0000000000000000');
  requireExactArray(required(sandbox, 'interfaces'), ['lo'], 'interfaces');
  const policyHash = required(sandbox, 'policyHash');
  if (policyHash !== expectedPolicyHash()) fail('policyHash must exactly match the repository sandbox policy');
  if (required(sandbox, 'policyVersion') !== SANDBOX_POLICY.version) {
    fail(`policyVersion must be ${SANDBOX_POLICY.version}`);
  }
  const cgroup = asRecord(required(sandbox, 'cgroup'), 'sandbox_info cgroup');
  const memory = required(cgroup, 'memoryMaxBytes', 'cgroup.memoryMaxBytes');
  const pids = required(cgroup, 'pidsMax', 'cgroup.pidsMax');
  const cpu = required(cgroup, 'cpuMax', 'cgroup.cpuMax');
  if (!Number.isInteger(memory) || memory <= 0 || memory > SANDBOX_POLICY.memoryMaxBytes) {
    fail(`cgroup.memoryMaxBytes must be <= ${SANDBOX_POLICY.memoryMaxBytes}, got ${String(memory)}`);
  }
  if (!Number.isInteger(pids) || pids <= 0 || pids > SANDBOX_POLICY.pidsMax) {
    fail(`cgroup.pidsMax must be <= ${SANDBOX_POLICY.pidsMax}, got ${String(pids)}`);
  }
  if (cpu !== SANDBOX_POLICY.cpuMax) fail(`cgroup.cpuMax must be ${SANDBOX_POLICY.cpuMax}, got ${String(cpu)}`);
};

const dockerAvailable = () => {
  const osType = command(['info', '--format', '{{.OSType}}']);
  if (osType !== 'linux') fail(`Docker must run Linux containers, got ${osType || 'no OSType'}`);
};

const inspectOne = (target) => {
  const inspected = JSON.parse(command(['inspect', target]));
  if (!Array.isArray(inspected) || inspected.length !== 1) fail(`docker inspect returned no single result for ${target}`);
  return inspected[0];
};

const inspectImageOne = (target) => {
  const inspected = JSON.parse(command(['image', 'inspect', target]));
  if (!Array.isArray(inspected) || inspected.length !== 1) fail(`docker image inspect returned no single result for ${target}`);
  return inspected[0];
};

const assertContainerAbsent = (name) => {
  try {
    command(['inspect', name]);
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : String(error),
      error instanceof Error && 'stderr' in error ? error.stderr : '',
    ].filter(Boolean).join('\n');
    if (/no such (?:object|container)/i.test(detail)) return;
    fail(`cleanup could not prove ${name} is absent: ${detail}`);
  }
  fail(`cleanup left container ${name}`);
};

const removeAndAssertAbsent = (name) => {
  try {
    command(['rm', '--force', name]);
  } catch {
    // `--rm` can win the race at EOF. The inspect below is authoritative.
  }
  assertContainerAbsent(name);
};

export const dockerArgs = (name, imageId) => [
  'create', '--rm', '--name', name, '--interactive',
  '--network', 'none', '--read-only', '--user', SANDBOX_POLICY.user,
  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
  '--pids-limit', String(SANDBOX_POLICY.pidsMax), '--memory', String(SANDBOX_POLICY.memoryMaxBytes),
  '--memory-swap', String(SANDBOX_POLICY.memoryMaxBytes),
  '--cpus', '0.5', '--ulimit', `nofile=${SANDBOX_POLICY.nofile}:${SANDBOX_POLICY.nofile}`,
  '--ulimit', `fsize=${SANDBOX_POLICY.fsizeBytes}:${SANDBOX_POLICY.fsizeBytes}`,
  '--tmpfs', SANDBOX_POLICY.tmpfs, '--ipc', 'private', '--cgroupns', 'private', '--init', requireImmutableImageId(imageId, 'docker create image'),
];

export const run = (image = process.env.FARLAB_EXPLORATION_SANDBOX_IMAGE ?? DEFAULT_IMAGE) => {
  dockerAvailable();
  const imageRef = image;
  // Resolve the mutable operator-facing ref exactly once, then use the
  // content-addressed image ID for every container. A tag can move between
  // inspect and create; a full image ID cannot.
  const imageId = verifyImageConfig(inspectImageOne(imageRef));
  const name = `farlab-sec01-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  try {
    command(dockerArgs(name, imageId));
    const firstContainer = inspectOne(name);
    verifyHostConfig(firstContainer);
    verifyContainerConfig(firstContainer);
    verifyContainerImage(firstContainer, imageId);
    const request = JSON.stringify({ id: 1, op: 'sandbox_info', payload: {} }) + '\n';
    const output = command(['start', '--attach', '--interactive', name], {
      input: request,
      timeout: SANDBOX_START_TIMEOUT_MS,
    });
    const lines = output.split(/\r?\n/).filter(Boolean);
    if (lines.length !== 1) fail(`sandbox_info must produce one JSONL response, got ${lines.length}`);
    const frame = asRecord(JSON.parse(lines[0]), 'sandbox_info response frame');
    if (frame.id !== 1 || frame.ok !== true) fail(`sandbox_info protocol returned ${JSON.stringify(frame.error ?? frame)}`);
    const info = required(frame, 'result');
    verifySandboxInfo(info);
    const analysis = JSON.stringify({ id: 2, op: 'run_exploration', payload: { code: 'print(float(np.mean([1.0, 2.0, 3.0])))' } }) + '\n';
    // The first container exits at EOF. Exercise a second real hardened process
    // so the gate proves the scientific runtime can execute, not only attest.
    const second = `farlab-sec01-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    try {
      command(dockerArgs(second, imageId));
      const secondContainer = inspectOne(second);
      verifyHostConfig(secondContainer);
      verifyContainerConfig(secondContainer);
      verifyContainerImage(secondContainer, imageId);
      const analysisOutput = command(['start', '--attach', '--interactive', second], {
        input: analysis,
        timeout: SANDBOX_START_TIMEOUT_MS,
      });
      const analysisFrame = asRecord(JSON.parse(analysisOutput), 'run_exploration response frame');
      if (analysisFrame.id !== 2 || analysisFrame.ok !== true) fail(`run_exploration protocol returned ${JSON.stringify(analysisFrame)}`);
      const analysisResult = asRecord(required(analysisFrame, 'result'), 'run_exploration result');
      const exploration = asRecord(required(analysisResult, 'exploration'), 'exploration result');
      if (exploration.ok !== true || exploration.stdout !== '2.0\n') fail('legitimate numpy exploration did not execute correctly');
    } finally {
      removeAndAssertAbsent(second);
    }
  } finally {
    // Always prove absence: a failed or timed-out create may still have made
    // the randomly named container even though Docker returned no success.
    removeAndAssertAbsent(name);
  }
  process.stdout.write(`FA-SEC-01 OCI sandbox verification passed for ${imageRef} (imageId=${imageId})\n`);
};

if (process.argv[1] !== undefined && new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href === import.meta.url) {
  run();
}
