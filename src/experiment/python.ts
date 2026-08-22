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
}

export interface SidecarFactory {
  (): {
    call<T>(op: string, payload: unknown, timeoutMs: number): Promise<SidecarCallResult<T>>;
    logs(): string[];
    envInfo(): SidecarEnvInfo | null;
    lockfileHash(): string | null;
    close(): void;
  };
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

export const createSidecar = (opts: SidecarOptions = {}) => {
  const command = opts.command ?? ['uv', 'run', '--frozen', '--project', RUNTIME_DIR, 'python', '-m', 'farlab_experiment_runtime'];
  const child: ChildProcessWithoutNullStreams = spawn(command[0] ?? 'uv', command.slice(1), {
    cwd: opts.cwd ?? RUNTIME_DIR,
    env: {
      ...process.env,
      // Thread pinning: float reduction order must not vary run-to-run (D-086-3).
      OMP_NUM_THREADS: '1',
      OPENBLAS_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1',
      NUMEXPR_NUM_THREADS: '1',
      PYTHONHASHSEED: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let nextId = 1;
  let buffer = '';
  const pending = new Map<number, { resolve: (r: SidecarCallResult<unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  const logLines: string[] = [];
  let env: SidecarEnvInfo | null = null;

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

  const exited = new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? -1));
  });

  const call = async <T>(op: string, payload: unknown, timeoutMs: number): Promise<SidecarCallResult<T>> => {
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
      exited.then((code) => {
        if (pending.has(id)) {
          pending.delete(id);
          clearTimeout(timer);
          reject(new Error(`sidecar exited (code ${code}) before answering ${op}`));
        }
      });
      child.stdin.write(`${JSON.stringify({ id, op, payload })}\n`);
    });
    return result as SidecarCallResult<T>;
  };

  return {
    call,
    logs: () => logLines,
    envInfo: () => env,
    lockfileHash,
    async warmup(timeoutMs: number): Promise<SidecarEnvInfo> {
      const r = await call<SidecarEnvInfo>('env_info', {}, timeoutMs);
      if (!r.ok || r.result === undefined) throw new Error(`sidecar env_info failed: ${r.error?.message ?? 'no result'}`);
      env = r.result;
      return r.result;
    },
    close: () => {
      for (const w of pending.values()) {
        clearTimeout(w.timer);
        w.reject(new Error('sidecar closed'));
      }
      pending.clear();
      child.stdin.end();
      child.kill();
    },
  };
};

export type Sidecar = ReturnType<typeof createSidecar>;
