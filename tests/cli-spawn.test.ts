/**
 * Real-path CLI proof (R2-03): spawns the COMPILED binary (dist/cli/main.js)
 * as a child process and asserts the scriptability contract end-to-end —
 * semantic exit codes, stdout/stderr separation, ONE parseable JSON document
 * under --json, and zero ANSI escapes when piped (non-TTY), under NO_COLOR,
 * and under TERM=dumb. These properties were previously asserted only at the
 * unit level; this file exercises the exact bytes a pipe consumer sees.
 *
 * Depends on `npm run build` (the lane gate and CI both build first); the
 * suite skips visibly — never silently — when dist is absent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, '..');
const BIN = path.join(ROOT, 'dist', 'cli', 'main.js');
const distBuilt = (): boolean => fs.existsSync(BIN);

// Hermetic child env: isolated data dir, no .env hydration, stable locale-free
// behavior. Colors must never depend on the parent vitest process's TTY.
const baseEnv = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  FAR_DOTENV: 'off',
  FARLAB_DATA_DIR: dataDir,
  FORCE_COLOR: '0',
  ...over,
});

let dataDir = '';
beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-cli-spawn-'));
});
afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const run = (args: string[], env: Record<string, string> = {}) =>
  exec(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    env: baseEnv(env),
    // generous for cold sqlite init on Windows
    timeout: 60_000,
  });

// eslint-disable-next-line no-control-regex -- detecting ANSI REQUIRES matching the ESC control char by definition
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/;

describe.skipIf(!distBuilt())('far (compiled binary): scriptability contract', () => {
  it('exit 0 + one parseable JSON document on stdout for `runs --json`', async () => {
    const { stdout, stderr } = await run(['runs', '--json']);
    // stderr is the diagnostics channel (node's SQLite ExperimentalWarning is
    // honest diagnostics); the contract is stdout = exactly ONE JSON document
    // and stderr never carrying ANSI when piped.
    expect(ANSI.test(stderr)).toBe(false);
    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0]!)).not.toThrow();
    expect(JSON.parse(lines[0]!)).toEqual([]); // fresh data dir: no runs, and the array is honest
  });

  it('exit 2 + diagnostics on stderr + EMPTY stdout for an unknown command', async () => {
    // execFile reports the child's exit code as err.code (no shell involved)
    const err = await run(['definitely-not-a-command']).catch((e: unknown) => e);
    const e = err as { code?: number; stdout?: string; stderr?: string };
    expect(e.code).toBe(2);
    expect(e.stdout ?? '').toBe('');
    expect(e.stderr ?? '').toMatch(/unknown command|far --help/);
  });

  it('exit 2 for a typoed --stop-after stage name — never a silent full-pipeline run', async () => {
    // Adversarial round-2: the old `as never` cast meant an unmatched stage name
    // silently resumed the WHOLE pipeline; validation must fail fast with the
    // valid stage list. Format-valid run id (no db lookup happens before the check).
    const err = await run(['research', 'resume', 'run_aaaaaaaaaaaaaaaaaaaaaaaaaa', '--stop-after', 'ranking']).catch((e: unknown) => e);
    const e = err as { code?: number; stdout?: string; stderr?: string };
    expect(e.code).toBe(2);
    expect(e.stderr ?? '').toMatch(/unknown --stop-after stage 'ranking'/);
    expect(e.stderr ?? '').toMatch(/scope/); // the valid-stage list is in the message
  });

  it('exit 2 (usage) for a malformed run id: diagnostics on stderr, stdout clean', async () => {
    const err = await run(['research', 'status', 'not-a-run-id']).catch((e: unknown) => e);
    const e = err as { code?: number; stdout?: string; stderr?: string };
    expect(e.code).toBe(2);
    expect(e.stdout ?? '').toBe('');
    expect(e.stderr ?? '').toMatch(/invalid run id format/);
  });

  it('usage error mentions the usable next action (find one with: far runs)', async () => {
    const err = await run(['research', 'status']).catch((e: unknown) => e);
    expect(String((err as { stderr?: string }).stderr ?? '')).toMatch(/find one with: far runs/);
  });

  it('--help prints the full command surface on stdout, exit 0', async () => {
    const { stdout, stderr } = await run(['--help']);
    expect(ANSI.test(stderr)).toBe(false);
    for (const cmd of ['research', 'runs', 'experiment', 'agent', 'probe', 'serve', 'probe-custom', 'memory', 'backup', 'gc', 'data', 'verify', 'new', 'completion']) {
      expect(stdout).toContain(`far ${cmd}`);
    }
    expect(stdout).toMatch(/Exit codes: 0 ok, 1 runtime failure, 2 usage error, 3 stale dist/);
  });

  it('`far serve --port 0` boots the real API server (health 200) — the headless entry', async () => {
    const child = spawn(process.execPath, [BIN, 'serve', '--port', '0'], {
      cwd: ROOT,
      env: baseEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', () => { /* diagnostics channel */ });
    try {
      // wait for the honest listening line: "far serve listening on http://127.0.0.1:<port>"
      const deadline = Date.now() + 30_000;
      let port = -1;
      while (Date.now() < deadline) {
        const m = out.match(/far serve listening on http:\/\/127\.0\.0\.1:(\d+)/);
        if (m !== null) { port = Number(m[1]); break; }
        await new Promise((r) => setTimeout(r, 150));
      }
      expect(port).toBeGreaterThan(0);
      const health = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { ok?: boolean; db?: unknown };
      expect(body.ok !== false || body.db !== undefined).toBe(true);
    } finally {
      child.kill();
      // On POSIX the graceful path exits 0 after SIGTERM; on Windows kill() is a
      // hard terminate, so only the POSIX exit code is asserted.
      if (process.platform !== 'win32') {
        const code = await new Promise<number | null>((resolve) => {
          child.once('exit', (c) => resolve(c));
          setTimeout(() => resolve(null), 10_000);
        });
        expect(code).toBe(0);
      }
    }
  }, 60_000);

  it('piped (non-TTY) text output carries ZERO ANSI escape sequences', async () => {
    const { stdout } = await run(['data', 'info']);
    expect(ANSI.test(stdout)).toBe(false);
  });

  it('NO_COLOR=1 and TERM=dumb also produce ANSI-free output', async () => {
    const a = await run(['data', 'info'], { NO_COLOR: '1' });
    const b = await run(['data', 'info'], { TERM: 'dumb' });
    expect(ANSI.test(a.stdout)).toBe(false);
    expect(ANSI.test(b.stdout)).toBe(false);
  });

  it('`data info --json` is a single deterministic parseable document', async () => {
    const { stdout } = await run(['data', 'info', '--json']);
    const doc = JSON.parse(stdout.trim());
    expect(doc).toMatchObject({ runsByStatus: {}, totalRuns: 0 });
    expect(typeof doc.dbBytes).toBe('number');
  });

  it('`completion bash` output completes every top-level command (real spawn)', async () => {
    const { stdout } = await run(['completion', 'bash']);
    for (const cmd of ['research', 'probe-custom', 'memory', 'backup', 'gc', 'completion']) {
      expect(stdout).toContain(`'${cmd}'`);
    }
  });

  it('stderr-only diagnostics: `research inspect` without a selector fails loud, stdout clean', async () => {
    // a run that cannot exist (valid format, absent id) — honest not-found path
    const err = await run(['research', 'inspect', 'run_aaaaaaaaaaaaaaaaaaaaaaaaaa', '--evidence']).catch((e: unknown) => e);
    const e = err as { stdout?: string; stderr?: string };
    expect(e.stdout ?? '').toBe('');
    expect(e.stderr ?? '').toMatch(/run not found/);
  });
});
