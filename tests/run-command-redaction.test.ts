import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { runInLoginShell, shellChildEnv } from '../src/shared/login-shell.js';

/**
 * SEC-001 (BC-001) three-layer defense for the conversation run_command plane:
 *   layer 1 — approved command output is scrubbed before it becomes transcript;
 *   layer 2 — one-shot shell children do not inherit credential-shaped env;
 *   layer 3 — the persistence chokepoint masks secret-shaped payloads.
 * Real processes for the shell plane (same discipline as terminal-run-command).
 */

const ENV_NAME = 'FARLAB_SEC1_ZAI_API_KEY';
const ENV_VALUE = 'zai-fake-secret-0123456789abcdef';

let tmp: string;
let app: App;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-sec1-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env[ENV_NAME];
  delete process.env.FARLAB_SHELL_KEEP_ENV;
});

describe('shellChildEnv (layer 2, unit)', () => {
  it('drops credential-shaped names, keeps the rest byte-identical', () => {
    const child = shellChildEnv({
      PATH: '/usr/bin', HOME: '/home/r', LANG: 'C',
      ZAI_API_KEY: 'z'.repeat(24), DEEPSEEK_API_KEY: 'd'.repeat(24),
      MY_ACCESS_TOKEN: 't'.repeat(24), BUILD_PASSWORD: 'p'.repeat(24),
      ANTHROPIC_BASE_URL: 'https://example.test', WORKSPACE_SECRET: 's'.repeat(24),
    });
    expect(child).toEqual({ PATH: '/usr/bin', HOME: '/home/r', LANG: 'C' });
  });

  it('FARLAB_SHELL_KEEP_ENV opts specific filtered names back in (exact names only)', () => {
    const child = shellChildEnv({
      ZAI_API_KEY: 'z'.repeat(24), DEEPSEEK_API_KEY: 'd'.repeat(24), PATH: '/bin',
      FARLAB_SHELL_KEEP_ENV: 'ZAI_API_KEY',
    });
    expect(child.ZAI_API_KEY).toBe('z'.repeat(24));
    expect('DEEPSEEK_API_KEY' in child).toBe(false);
    expect(child.PATH).toBe('/bin');
  });

  it('terminal-critical variables survive the filter', () => {
    const child = shellChildEnv({ PATH: '/bin', SYSTEMROOT: 'C:\\Windows', COMSPEC: 'cmd.exe', PATHEXT: '.EXE' });
    expect(child).toEqual({ PATH: '/bin', SYSTEMROOT: 'C:\\Windows', COMSPEC: 'cmd.exe', PATHEXT: '.EXE' });
  });
});

describe('one-shot shell children (layer 2, real processes)', () => {
  it('credential-shaped env vars do not exist in the child environment', async () => {
    process.env[ENV_NAME] = ENV_VALUE;
    const r = await runInLoginShell({
      command: `node -e "console.log(String(process.env.${ENV_NAME}))"`,
      cwd: tmp,
      timeoutMs: 30_000,
      maxOutputChars: 4000,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('undefined');
  }, 45_000);

  it('the filtered names are absent from the child env key list', async () => {
    process.env[ENV_NAME] = ENV_VALUE;
    const r = await runInLoginShell({
      command: `node -e "console.log(Object.keys(process.env).filter(k=>k.includes('FARLAB_SEC1')).join(','))"`,
      cwd: tmp,
      timeoutMs: 30_000,
      maxOutputChars: 4000,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  }, 45_000);

  it('FARLAB_SHELL_KEEP_ENV restores an opted-in variable with its value', async () => {
    process.env[ENV_NAME] = ENV_VALUE;
    process.env.FARLAB_SHELL_KEEP_ENV = ENV_NAME;
    const r = await runInLoginShell({
      command: `node -e "console.log(process.env.${ENV_NAME})"`,
      cwd: tmp,
      timeoutMs: 30_000,
      maxOutputChars: 4000,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(ENV_VALUE);
  }, 45_000);
});
