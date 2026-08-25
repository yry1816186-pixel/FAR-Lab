import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * R2-13 F-3: the API is unauthenticated by design; a non-loopback HOST must be
 * refused (exit 1, visible reason) unless FARLAB_ALLOW_REMOTE=1 acknowledges
 * the exposure. Drives the REAL built entrypoint (dist/server/main.js) as a
 * child process — the guard runs before createApp, so on refusal the
 * workspace is never even opened. Skips honestly when dist/ is not built.
 */
const mainJs = path.resolve('dist/server/main.js');

interface RunResult { code: number | null; signal: string | null; stderr: string; stdout: string; }

const run = (env: Record<string, string>): Promise<RunResult> =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [mainJs], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    let settled = false;
    const finish = (code: number | null, signal: string | null): void => {
      if (settled) return;
      settled = true;
      resolve({ code, signal, stderr, stdout });
    };
    p.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
      // As soon as the server reports it is listening we have our answer for
      // the control case — end the child instead of idling the test.
      if (stdout.includes('far-lab api listening')) p.kill('SIGKILL');
    });
    p.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    p.on('exit', (code, signal) => finish(code, signal));
    setTimeout(() => p.kill('SIGKILL'), 10_000); // safety net either way
  });

describe('server bind guard (F-3)', () => {
  it.skipIf(!fs.existsSync(mainJs))(
    'refuses HOST=0.0.0.0 without FARLAB_ALLOW_REMOTE, names the remedy, exits 1',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-bindguard-'));
      const r = await run({ HOST: '0.0.0.0', PORT: '0', FARLAB_DATA_DIR: path.join(dir, 'data') });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('refusing to bind 0.0.0.0');
      expect(r.stderr).toContain('FARLAB_ALLOW_REMOTE=1');
    },
  );

  it.skipIf(!fs.existsSync(mainJs))(
    'loopback HOST passes the guard (server reaches listening state)',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-bindguard-ok-'));
      const r = await run({ HOST: '127.0.0.1', PORT: '0', FARLAB_DATA_DIR: path.join(dir, 'data') });
      expect(r.stdout).toContain('far-lab api listening');
      expect(r.stderr).not.toContain('refusing to bind');
    },
  );
});
