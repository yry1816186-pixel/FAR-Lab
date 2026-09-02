import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  SandboxAttestation,
  Sidecar,
  SidecarCallResult,
  SidecarEnvInfo,
} from './python.js';

export const DEFAULT_EXPLORATION_SANDBOX_IMAGE = 'farlab-experiment-runtime:sec01';
const RUNTIME_DIR = path.resolve(import.meta.dirname, '..', '..', 'experiment-runtime');
const POLICY_PATH = path.join(RUNTIME_DIR, 'sandbox-policy.json');
const SANDBOX_ENTRYPOINT = [
  '/opt/farlab/.venv/bin/python', '-I', '-m', 'farlab_experiment_runtime.sandbox_main',
] as const;
const MAX_PROTOCOL_LINE_CHARS = 64 * 1024;
const MAX_LOG_CHARS = 32 * 1024;
const REQUIRED_IMAGE_ENV = new Map<string, string>([
  ['PATH', '/opt/farlab/.venv/bin:/usr/local/bin:/usr/bin:/bin'],
  ['LANG', 'C.UTF-8'],
  ['GPG_KEY', '7169605F62C751356D054A26A821E680E5FA6305'],
  ['PYTHON_VERSION', '3.12.12'],
  ['PYTHON_SHA256', 'fb85a13414b028c49ba18bbd523c2d055a30b56b18b92ce454ea2c51edc656c4'],
  ['PYTHONPATH', ''],
  ['PYTHONDONTWRITEBYTECODE', '1'],
  ['PYTHONUNBUFFERED', '1'],
  ['PYTHONHASHSEED', '0'],
  ['HOME', '/tmp'],
  ['TMPDIR', '/tmp'],
  ['OMP_NUM_THREADS', '1'],
  ['OPENBLAS_NUM_THREADS', '1'],
  ['MKL_NUM_THREADS', '1'],
  ['NUMEXPR_NUM_THREADS', '1'],
  ['FARLAB_SANDBOX_POLICY_PATH', '/opt/farlab/sandbox-policy.json'],
]);

interface SandboxPolicy {
  version: number;
  backend: 'docker-linux';
  user: string;
  networkMode: 'none';
  readOnlyRootfs: true;
  capDrop: ['ALL'];
  noNewPrivileges: true;
  pidsMax: number;
  memoryMaxBytes: number;
  nanoCpus: number;
  nofileMax: number;
  fsizeMaxBytes: number;
  tmpfs: string;
  ipcMode: 'private';
  cgroupnsMode: 'private';
  init: true;
}

interface DockerInspect {
  Id?: unknown;
  Os?: unknown;
  Config?: {
    User?: unknown;
    Entrypoint?: unknown;
    Env?: unknown;
    Volumes?: unknown;
    WorkingDir?: unknown;
    Cmd?: unknown;
    ExposedPorts?: unknown;
  };
  HostConfig?: Record<string, unknown>;
  Mounts?: unknown;
}

const policyBytes = (): Buffer => fs.readFileSync(POLICY_PATH);
const policyHash = (): string => createHash('sha256').update(policyBytes()).digest('hex');

const loadPolicy = (): SandboxPolicy => {
  const value = JSON.parse(policyBytes().toString('utf8')) as Partial<SandboxPolicy>;
  if (
    value.version !== 1
    || value.backend !== 'docker-linux'
    || value.user !== '65532:65532'
    || value.networkMode !== 'none'
    || value.readOnlyRootfs !== true
    || JSON.stringify(value.capDrop) !== JSON.stringify(['ALL'])
    || value.noNewPrivileges !== true
    || value.pidsMax !== 64
    || value.memoryMaxBytes !== 512 * 1024 * 1024
    || value.nanoCpus !== 500_000_000
    || value.nofileMax !== 64
    || value.fsizeMaxBytes !== 1024 * 1024
    || value.tmpfs !== '/tmp:rw,noexec,nosuid,nodev,size=32m'
    || value.ipcMode !== 'private'
    || value.cgroupnsMode !== 'private'
    || value.init !== true
  ) {
    throw new Error('exploration sandbox policy is missing or weaker than FA-SEC-01');
  }
  return value as SandboxPolicy;
};

const docker = (command: string, args: string[], env: NodeJS.ProcessEnv): string => execFileSync(command, args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 15_000,
  windowsHide: true,
  env,
}).trim();

const inspectOne = (command: string, target: string, env: NodeJS.ProcessEnv): DockerInspect => {
  const value = JSON.parse(docker(command, ['inspect', target], env)) as unknown;
  if (!Array.isArray(value) || value.length !== 1) throw new Error(`docker inspect returned no single result for ${target}`);
  return value[0] as DockerInspect;
};

const dockerErrorText = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const streams = error as Error & { stdout?: unknown; stderr?: unknown };
  return [error.message, streams.stdout, streams.stderr].filter((value) => typeof value === 'string').join('\n');
};

const isMissingContainerError = (error: unknown): boolean => /no such (?:object|container)/i.test(dockerErrorText(error));

const removeContainerAndAssertAbsent = (dockerCommand: string, name: string, env: NodeJS.ProcessEnv): void => {
  try {
    execFileSync(dockerCommand, ['rm', '--force', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
      windowsHide: true,
      env,
    });
  } catch (error) {
    if (!isMissingContainerError(error)) {
      // The absence check below is authoritative: Docker can report a racing
      // auto-remove even when the requested terminal state was reached.
    }
  }
  try {
    inspectOne(dockerCommand, name, env);
  } catch (error) {
    if (isMissingContainerError(error)) return;
    throw new Error(`could not prove exploration sandbox container ${name} was removed: ${dockerErrorText(error)}`, { cause: error });
  }
  throw new Error(`exploration sandbox container ${name} survived forced removal`);
};

const requireEmptyObject = (value: unknown, label: string): void => {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) {
    throw new Error(`exploration sandbox ${label} must be empty`);
  }
};

const isNullOrEmptyArray = (value: unknown): boolean => value === null || (Array.isArray(value) && value.length === 0);

const verifyRuntimeConfig = (config: DockerInspect['Config'], label: string): void => {
  if (config?.User !== '65532:65532') {
    throw new Error(`exploration sandbox ${label} must declare user 65532:65532, got ${String(config?.User)}`);
  }
  if (JSON.stringify(config.Entrypoint) !== JSON.stringify(SANDBOX_ENTRYPOINT)) {
    throw new Error(`exploration sandbox ${label} has an unexpected entrypoint`);
  }
  if (config.WorkingDir !== '/tmp') throw new Error(`exploration sandbox ${label} must use /tmp as its working directory`);
  if (config.Cmd !== undefined && config.Cmd !== null && !(Array.isArray(config.Cmd) && config.Cmd.length === 0)) {
    throw new Error(`exploration sandbox ${label} must not append a command to its entrypoint`);
  }
  requireEmptyObject(config.Volumes, `${label} volumes`);
  requireEmptyObject(config.ExposedPorts, `${label} exposed ports`);
  if (!Array.isArray(config.Env)) throw new Error(`exploration sandbox ${label} has no explicit environment`);
  const actual = new Map<string, string>();
  for (const raw of config.Env) {
    if (typeof raw !== 'string' || !raw.includes('=')) throw new Error(`exploration sandbox ${label} has a malformed environment entry`);
    const separator = raw.indexOf('=');
    const key = raw.slice(0, separator);
    if (actual.has(key)) throw new Error(`exploration sandbox ${label} repeats environment key ${key}`);
    actual.set(key, raw.slice(separator + 1));
  }
  if (actual.size !== REQUIRED_IMAGE_ENV.size) throw new Error(`exploration sandbox ${label} environment is not the exact allowlist`);
  for (const [key, value] of REQUIRED_IMAGE_ENV) {
    if (actual.get(key) !== value) throw new Error(`exploration sandbox ${label} environment changed ${key}`);
  }
};

const inspectImage = (dockerCommand: string, imageRef: string, env: NodeJS.ProcessEnv): { imageId: string; pinnedRef: string } => {
  const osType = docker(dockerCommand, ['info', '--format', '{{.OSType}}'], env);
  if (osType !== 'linux') throw new Error(`exploration sandbox requires Linux Docker, got ${osType || 'unknown'}`);
  const image = inspectOne(dockerCommand, imageRef, env);
  if (image.Os !== 'linux') throw new Error(`exploration sandbox image must be Linux, got ${String(image.Os)}`);
  verifyRuntimeConfig(image.Config, 'image config');
  if (typeof image.Id !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(image.Id)) {
    throw new Error('exploration sandbox image has no immutable image ID');
  }
  return { imageId: image.Id, pinnedRef: image.Id };
};

const verifyContainer = (dockerCommand: string, name: string, policy: SandboxPolicy, env: NodeJS.ProcessEnv): void => {
  const container = inspectOne(dockerCommand, name, env);
  verifyRuntimeConfig(container.Config, 'container config');
  const host = container.HostConfig ?? {};
  const expectedTmpfs = policy.tmpfs.slice('/tmp:'.length);
  const security = Array.isArray(host.SecurityOpt) ? host.SecurityOpt.map(String) : [];
  const capDrop = Array.isArray(host.CapDrop) ? host.CapDrop.map(String) : [];
  const tmpfs = (host.Tmpfs ?? {}) as Record<string, unknown>;
  const ulimits = Array.isArray(host.Ulimits) ? host.Ulimits as Array<Record<string, unknown>> : [];
  const hasUlimit = (name_: string, value: number): boolean => ulimits.some((u) => u.Name === name_ && u.Soft === value && u.Hard === value);
  if (
    host.NetworkMode !== policy.networkMode
    || host.ReadonlyRootfs !== true
    || host.Privileged !== false
    || host.AutoRemove !== true
    || host.PidsLimit !== policy.pidsMax
    || host.Memory !== policy.memoryMaxBytes
    || host.MemorySwap !== policy.memoryMaxBytes
    || host.NanoCpus !== policy.nanoCpus
    || host.Init !== true
    || host.IpcMode !== policy.ipcMode
    || host.CgroupnsMode !== policy.cgroupnsMode
    || host.PidMode !== ''
    || !capDrop.includes('ALL')
    || !isNullOrEmptyArray(host.CapAdd)
    || !security.includes('no-new-privileges:true')
    || tmpfs['/tmp'] !== expectedTmpfs
    || !hasUlimit('nofile', policy.nofileMax)
    || !hasUlimit('fsize', policy.fsizeMaxBytes)
    || !isNullOrEmptyArray(host.Binds)
    || !isNullOrEmptyArray(host.VolumesFrom)
    || !Array.isArray(host.Devices)
    || host.Devices.length > 0
    || !isNullOrEmptyArray(host.DeviceRequests)
    || !Array.isArray(container.Mounts)
    || container.Mounts.length > 0
  ) {
    throw new Error('Docker did not apply the complete exploration sandbox policy');
  }
};

const verifyAttestation = (
  raw: unknown,
  expected: { imageRef: string; imageId: string; policyHash: string; policy: SandboxPolicy },
): SandboxAttestation => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('sandbox_info returned no object');
  const value = raw as Record<string, unknown>;
  const cgroup = value.cgroup;
  if (cgroup === null || typeof cgroup !== 'object' || Array.isArray(cgroup)) throw new Error('sandbox_info returned no cgroup facts');
  const cg = cgroup as Record<string, unknown>;
  if (
    value.backend !== 'docker-linux'
    || value.uid !== 65532
    || value.gid !== 65532
    || value.noNewPrivs !== true
    || value.seccompEnabled !== true
    || value.seccompMode !== 2
    || value.capEff !== '0000000000000000'
    || value.rootfsReadOnly !== true
    || value.tmpWritable !== true
    || value.networkDisabled !== true
    || JSON.stringify(value.interfaces) !== JSON.stringify(['lo'])
    || value.policyHash !== expected.policyHash
    || value.policyVersion !== expected.policy.version
    || typeof cg.memoryMaxBytes !== 'number'
    || cg.memoryMaxBytes <= 0
    || cg.memoryMaxBytes > expected.policy.memoryMaxBytes
    || typeof cg.pidsMax !== 'number'
    || cg.pidsMax <= 0
    || cg.pidsMax > expected.policy.pidsMax
    || cg.cpuMax !== '50000 100000'
  ) {
    throw new Error('exploration sandbox attestation failed closed');
  }
  return {
    backend: 'docker-linux',
    imageRef: expected.imageRef,
    imageId: expected.imageId,
    policyHash: expected.policyHash,
    policyVersion: expected.policy.version,
    uid: 65532,
    gid: 65532,
    noNewPrivs: true,
    seccompEnabled: true,
    seccompMode: value.seccompMode as number,
    capEff: '0000000000000000',
    rootfsReadOnly: true,
    tmpWritable: true,
    networkDisabled: true,
    interfaces: ['lo'],
    cgroup: {
      memoryMaxBytes: cg.memoryMaxBytes as number,
      pidsMax: cg.pidsMax as number,
      cpuMax: cg.cpuMax as string,
    },
  };
};

export interface ExplorationSandboxOptions {
  image?: string;
  dockerCommand?: string;
}

export const createExplorationSandbox = (options: ExplorationSandboxOptions = {}): Sidecar => {
  const policy = loadPolicy();
  const expectedPolicyHash = policyHash();
  const imageRef = options.image ?? process.env.FARLAB_EXPLORATION_SANDBOX_IMAGE ?? DEFAULT_EXPLORATION_SANDBOX_IMAGE;
  const dockerCommand = options.dockerCommand ?? 'docker';
  // Capture one Docker client environment for the complete lifecycle.  The
  // inspect/create calls and the attach client must resolve the same daemon,
  // context and TLS material; using a reduced env only for `start` can route
  // it to a different daemon when DOCKER_* variables are configured.
  const dockerEnv = { ...process.env };
  const { imageId, pinnedRef } = inspectImage(dockerCommand, imageRef, dockerEnv);
  const name = `farlab-exploration-${randomUUID().replaceAll('-', '')}`;
  const createArgs = [
    'create', '--rm', '--interactive', '--name', name,
    '--network', policy.networkMode,
    '--read-only',
    '--user', policy.user,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '--pids-limit', String(policy.pidsMax),
    '--memory', String(policy.memoryMaxBytes),
    '--memory-swap', String(policy.memoryMaxBytes),
    '--cpus', String(policy.nanoCpus / 1_000_000_000),
    '--ulimit', `nofile=${policy.nofileMax}:${policy.nofileMax}`,
    '--ulimit', `fsize=${policy.fsizeMaxBytes}:${policy.fsizeMaxBytes}`,
    '--tmpfs', policy.tmpfs,
    '--ipc', policy.ipcMode,
    '--cgroupns', policy.cgroupnsMode,
    '--init',
    pinnedRef,
  ];
  try {
    docker(dockerCommand, createArgs, dockerEnv);
    verifyContainer(dockerCommand, name, policy, dockerEnv);
  } catch (error) {
    // A timed-out/failed `docker create` can still have created the named
    // container. The random name is ours, so absence must be proved even when
    // the command did not return success.
    try {
      removeContainerAndAssertAbsent(dockerCommand, name, dockerEnv);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'exploration sandbox policy verification and cleanup both failed',
        { cause: cleanupError },
      );
    }
    throw new Error(`exploration sandbox Docker policy verification failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(dockerCommand, ['start', '--attach', '--interactive', name], {
      cwd: RUNTIME_DIR,
      env: dockerEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    // `spawn` normally reports launch failures asynchronously, but invalid
    // command/options can throw synchronously after `docker create` succeeded.
    // Prove removal here so that construction cannot strand a named sandbox.
    try {
      removeContainerAndAssertAbsent(dockerCommand, name, dockerEnv);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'exploration sandbox attach construction and cleanup both failed',
        { cause: cleanupError },
      );
    }
    throw new Error(`exploration sandbox spawn failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  let nextId = 1;
  let buffer = '';
  let closed = false;
  let cleanupComplete = false;
  let stdinEnded = false;
  let removalProven = false;
  let childKillProven = false;
  let terminalError: Error | null = null;
  let attestation: SandboxAttestation | null = null;
  let envInfo: SidecarEnvInfo | null = null;
  const logs: string[] = [];
  let logChars = 0;
  const pending = new Map<number, {
    op: string;
    resolve: (result: SidecarCallResult<unknown>) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  const failAll = (error: Error): void => {
    if (terminalError === null) terminalError = error;
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(terminalError);
    }
    pending.clear();
  };
  const appendLog = (value: string): void => {
    if (value === '') return;
    const remaining = MAX_LOG_CHARS - logChars;
    if (remaining <= 0) return;
    const next = value.slice(0, remaining);
    logs.push(next);
    logChars += next.length;
  };
  const forceRemove = (): void => {
    if (removalProven) return;
    try {
      removeContainerAndAssertAbsent(dockerCommand, name, dockerEnv);
      // Keep the proof state authoritative for every cleanup caller, including
      // timeout/exit paths that invoke withCleanup outside close().
      removalProven = true;
    } catch (cause) {
      throw new Error(`failed to remove exploration sandbox container ${name}`, { cause });
    }
  };
  const withCleanup = (primary: Error): Error => {
    try {
      forceRemove();
      return primary;
    } catch (cleanupError) {
      return new AggregateError(
        [primary, cleanupError],
        `${primary.message}; exploration sandbox cleanup also failed`,
        { cause: cleanupError },
      );
    }
  };
  child.once('error', (error) => {
    failAll(withCleanup(new Error(`exploration sandbox spawn failed: ${error.message}`, { cause: error })));
  });
  child.once('exit', (code, signal) => {
    failAll(withCleanup(new Error(`exploration sandbox exited (code ${code ?? -1}${signal === null ? '' : `, signal ${signal}`})`)));
  });
  child.stdin.once('error', (error) => {
    failAll(withCleanup(new Error(`exploration sandbox stdin failed: ${error.message}`, { cause: error })));
  });
  child.stdout.once('error', (error) => {
    failAll(withCleanup(new Error(`exploration sandbox stdout failed: ${error.message}`, { cause: error })));
  });
  child.stderr.once('error', (error) => {
    failAll(withCleanup(new Error(`exploration sandbox stderr failed: ${error.message}`, { cause: error })));
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_PROTOCOL_LINE_CHARS && !buffer.includes('\n')) {
      const error = new Error(`exploration sandbox emitted a protocol line over ${MAX_PROTOCOL_LINE_CHARS} characters`);
      failAll(withCleanup(error));
      return;
    }
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      if (nl > MAX_PROTOCOL_LINE_CHARS) {
        const error = new Error(`exploration sandbox emitted a protocol line over ${MAX_PROTOCOL_LINE_CHARS} characters`);
        failAll(withCleanup(error));
        return;
      }
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line !== '') {
        try {
          const frame = JSON.parse(line) as { id?: number; ok?: boolean; result?: unknown; error?: SidecarCallResult<unknown>['error']; log?: string };
          if (typeof frame.log === 'string') appendLog(frame.log);
          else if (typeof frame.id === 'number') {
            const waiter = pending.get(frame.id);
            if (waiter !== undefined) {
              pending.delete(frame.id);
              clearTimeout(waiter.timer);
              waiter.resolve({ ok: frame.ok === true, result: frame.result, error: frame.error });
            }
          }
        } catch {
          appendLog(`unparsable-sandbox-frame: ${line.slice(0, 400)}`);
        }
      }
      nl = buffer.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => appendLog(chunk.trimEnd()));

  const call = async <T>(op: string, payload: unknown, timeoutMs: number): Promise<SidecarCallResult<T>> => {
    if (terminalError !== null) throw terminalError;
    if (closed) throw new Error('exploration sandbox closed');
    if (op !== 'sandbox_info' && op !== 'run_exploration') throw new Error(`operation ${op} is not exposed by the exploration sandbox`);
    if (op === 'run_exploration' && attestation === null) throw new Error('exploration sandbox has not passed attestation');
    const id = nextId++;
    const result = await new Promise<SidecarCallResult<unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const error = new Error(`exploration sandbox call ${op} timed out after ${timeoutMs}ms`);
        const terminal = withCleanup(error);
        failAll(terminal);
        reject(terminal);
      }, timeoutMs);
      pending.set(id, { op, resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, op, payload })}\n`, (error) => {
        if (error !== null && error !== undefined) {
          failAll(withCleanup(new Error(`exploration sandbox stdin write failed: ${error.message}`, { cause: error })));
        }
      });
    });
    return result as SidecarCallResult<T>;
  };

  return {
    call,
    logs: () => [...logs],
    envInfo: () => envInfo,
    lockfileHash: () => null,
    sandboxAttestation: () => attestation,
    async warmup(timeoutMs: number): Promise<SidecarEnvInfo> {
      const response = await call<unknown>('sandbox_info', {}, timeoutMs);
      if (!response.ok || response.result === undefined) {
        throw new Error(`exploration sandbox attestation request failed: ${response.error?.message ?? 'no result'}`);
      }
      attestation = verifyAttestation(response.result, { imageRef, imageId, policyHash: expectedPolicyHash, policy });
      envInfo = {
        pythonVersion: 'container-attested',
        versions: { sandboxBackend: attestation.backend, sandboxImageId: attestation.imageId },
        hardware: { cgroupCpuMax: attestation.cgroup.cpuMax },
      };
      return envInfo;
    },
    close(): void {
      if (cleanupComplete) return;
      if (!closed) {
        // Reject new calls immediately, even if Docker cleanup is transiently
        // unavailable. A later close() retries the unproven cleanup facts.
        closed = true;
        failAll(new Error('exploration sandbox closed'));
      }
      const failures: unknown[] = [];
      if (!stdinEnded) {
        try {
          child.stdin.end();
          stdinEnded = true;
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        forceRemove();
      } catch (error) {
        failures.push(error);
      } finally {
        if (!childKillProven) {
          try {
            if (!child.killed) child.kill();
            childKillProven = true;
          } catch (error) {
            failures.push(error);
          }
        }
      }
      cleanupComplete = stdinEnded && removalProven && childKillProven;
      if (failures.length > 0) {
        if (failures.length === 1) throw failures[0];
        throw new AggregateError(failures, 'exploration sandbox cleanup failed', { cause: failures[0] });
      }
    },
  };
};

export type ExplorationSandbox = ReturnType<typeof createExplorationSandbox>;
