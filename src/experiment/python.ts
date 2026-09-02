import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Python sidecar client (E3). One process serves many requests over stdio JSON lines.
 * Thread/env pinning for same-machine determinism (D-086-3) is set here, before spawn.
 */
export interface SidecarCallResult<T> {
  ok: boolean;
  result?: T;
  error?: { kind: string; message: string; traceback?: string };
}

export interface SidecarEnvInfo {
  pythonVersion: string;
  versions: Record<string, string>;
  /** R2-10: system/machine/cpu-count context recorded into the run environment. */
  hardware?: Record<string, string>;
}

export interface SandboxAttestation {
  backend: 'docker-linux';
  imageRef: string;
  imageId: string;
  policyHash: string;
  policyVersion: number;
  uid: number;
  gid: number;
  noNewPrivs: true;
  seccompEnabled: true;
  seccompMode: number;
  capEff: '0000000000000000';
  rootfsReadOnly: true;
  tmpWritable: true;
  networkDisabled: true;
  interfaces: string[];
  cgroup: {
    memoryMaxBytes: number;
    pidsMax: number;
    cpuMax: string;
  };
}

export interface Sidecar {
  call<T>(op: string, payload: unknown, timeoutMs: number): Promise<SidecarCallResult<T>>;
  logs(): string[];
  envInfo(): SidecarEnvInfo | null;
  lockfileHash(): string | null;
  sandboxAttestation?: () => SandboxAttestation | null;
  close(): void;
  warmup(timeoutMs: number): Promise<SidecarEnvInfo>;
}

export interface SidecarFactory {
  (): Sidecar;
}

const RUNTIME_DIR = path.resolve(import.meta.dirname, '..', '..', 'experiment-runtime');

/** sha256 of the family lockfile — environment identity for result fingerprints (D-086-8). */
export const lockfileHash = (): string | null => {
  try {
    return createHash('sha256').update(fs.readFileSync(path.join(RUNTIME_DIR, 'uv.lock'))).digest('hex') ?? null;
  } catch {
    return null;
  }
};

export interface SidecarOptions {
  /** Command prefix to start the sidecar. Default: uv run --frozen (pinned family env). */
  command?: string[];
  cwd?: string;
}

/**
 * Security (endgame audit, sandbox env minimization): the sidecar executes
 * agent-drafted exploration code, so a sandbox escape must not inherit the
 * researcher's provider keys. Only what the pinned family env needs to RUN
 * (process/uv/interpreter plumbing + the FARLAB_ fence config the netcdf op
 * layer itself reads) is forwarded; everything else — API keys included — is
 * dropped at spawn. Exported for a direct regression test on the allowlist.
 */
const SIDECAR_ENV_ALLOW_EXACT = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC', 'WINDIR',
  'TEMP', 'TMP', 'HOME', 'USER', 'USERNAME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432',
  'PUBLIC', 'ALLUSERSPROFILE', 'LANG', 'LC_ALL', 'TERM', 'SHELL',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
]);
const SIDECAR_ENV_ALLOW_PREFIX = ['UV_', 'PYTHON', 'FARLAB_', 'XDG_', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY'];

export const buildSidecarEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    const upper = k.toUpperCase();
    if (SIDECAR_ENV_ALLOW_EXACT.has(upper) || SIDECAR_ENV_ALLOW_PREFIX.some((p) => upper.startsWith(p))) {
      env[k] = v;
    }
  }
  // Thread pinning: float reduction order must not vary run-to-run (D-086-3).
  env.OMP_NUM_THREADS = '1';
  env.OPENBLAS_NUM_THREADS = '1';
  env.MKL_NUM_THREADS = '1';
  env.NUMEXPR_NUM_THREADS = '1';
  env.PYTHONHASHSEED = '0';
  return env;
};

export const createSidecar = (opts: SidecarOptions = {}) => {
  const command = opts.command ?? ['uv', 'run', '--frozen', '--project', RUNTIME_DIR, 'python', '-m', 'farlab_experiment_runtime'];
  const child: ChildProcessWithoutNullStreams = spawn(command[0] ?? 'uv', command.slice(1), {
    cwd: opts.cwd ?? RUNTIME_DIR,
    env: buildSidecarEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let nextId = 1;
  let buffer = '';
  const pending = new Map<number, { resolve: (r: SidecarCallResult<unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  const logLines: string[] = [];
  let env: SidecarEnvInfo | null = null;
  let terminalError: Error | null = null;
  let closed = false;

  const failAll = (error: Error): void => {
    if (terminalError === null) {
      terminalError = error;
      logLines.push(error.message);
    }
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(terminalError);
    }
    pending.clear();
  };

  // Spawn failure emits `error` but not reliably `exit`. Treat every terminal
  // process/pipe signal as the same one-shot lifecycle settlement so pending and
  // future calls fail immediately instead of waiting for their operation timeout.
  child.once('error', (error) => failAll(new Error(`sidecar spawn failed: ${error.message}`, { cause: error })));
  child.once('exit', (code, signal) => failAll(new Error(
    `sidecar exited (code ${code ?? -1}${signal === null ? '' : `, signal ${signal}`})`,
  )));
  child.stdin.once('error', (error) => failAll(new Error(`sidecar stdin failed: ${error.message}`, { cause: error })));

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line !== '') {
        try {
          const frame = JSON.parse(line) as { id?: number; ok?: boolean; result?: unknown; error?: SidecarCallResult<unknown>['error']; log?: string };
          if (typeof frame.log === 'string') {
            logLines.push(frame.log);
          } else if (typeof frame.id === 'number') {
            const waiter = pending.get(frame.id);
            if (waiter !== undefined) {
              pending.delete(frame.id);
              clearTimeout(waiter.timer);
              waiter.resolve({ ok: frame.ok === true, result: frame.result, error: frame.error });
            }
          }
        } catch {
          logLines.push(`unparsable-sidecar-frame: ${line.slice(0, 400)}`);
        }
      }
      nl = buffer.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c: string) => { logLines.push(c.trimEnd()); });

  const call = async <T>(op: string, payload: unknown, timeoutMs: number): Promise<SidecarCallResult<T>> => {
    if (terminalError !== null) throw terminalError;
    if (closed) throw new Error('sidecar closed');
    const id = nextId;
    nextId += 1;
    const waiter = pending.get(id);
    if (waiter) throw new Error('sidecar id collision');
    const result = await new Promise<SidecarCallResult<unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`sidecar call ${op} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        child.stdin.write(`${JSON.stringify({ id, op, payload })}\n`, (error) => {
          if (error !== null && error !== undefined) failAll(new Error(`sidecar stdin write failed: ${error.message}`, { cause: error }));
        });
      } catch (error) {
        failAll(new Error(`sidecar stdin write failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }));
      }
    });
    return result as SidecarCallResult<T>;
  };

  return {
    call,
    logs: () => logLines,
    envInfo: () => env,
    lockfileHash,
    sandboxAttestation: () => null,
    async warmup(timeoutMs: number): Promise<SidecarEnvInfo> {
      const r = await call<SidecarEnvInfo>('env_info', {}, timeoutMs);
      if (!r.ok || r.result === undefined) throw new Error(`sidecar env_info failed: ${r.error?.message ?? 'no result'}`);
      env = r.result;
      return r.result;
    },
    close: () => {
      if (closed) return;
      closed = true;
      failAll(new Error('sidecar closed'));
      child.stdin.end();
      child.kill();
    },
  };
};
