import { describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { displayWidth, padColumns, table, marker, stageLine, subLine } from '../src/cli/term.js';

describe('cli term: CJK-safe column math', () => {
  it('displayWidth counts CJK wide chars as 2 columns', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('研究')).toBe(4);
    expect(displayWidth('a研究b')).toBe(6); // 1 + 2 + 2 + 1
    expect(displayWidth('●')).toBe(1);
    expect(displayWidth('')).toBe(0);
  });

  it('padColumns pads by display width so mixed rows align', () => {
    const a = padColumns('run', 8);
    const b = padColumns('研究', 8);
    expect(displayWidth(a)).toBe(8);
    expect(displayWidth(b)).toBe(8);
    expect(a.length).toBeGreaterThan(b.length); // CJK needs fewer fill chars
  });

  it('padColumns never truncates', () => {
    expect(padColumns('abcdef', 3)).toBe('abcdef');
  });
});

describe('cli term: report channel', () => {
  it('table renders rows of equal display width (aligned columns)', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      table(['run', '状态'], [['r1', '完成'], ['run-02', 'running']]);
      const lines = spy.mock.calls.map((c) => String(c[0]).replace(/\n$/, ''));
      expect(lines).toHaveLength(3);
      // both data rows occupy the same terminal width → columns stay aligned
      expect(displayWidth(lines[1]!)).toBe(displayWidth(lines[2]!));
      expect(lines[2]).toContain('run-02');
    } finally {
      spy.mockRestore();
    }
  });

  it('stage/sub lines write to stderr (progress channel), not stdout', () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      stageLine('scope', 'question received');
      subLine('subtask done');
      expect(errSpy).toHaveBeenCalled();
      expect(outSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      outSpy.mockRestore();
    }
  });

  it('marker is exactly one display column (ASCII fallback on non-darwin)', () => {
    expect(displayWidth(marker())).toBe(1);
  });
});

describe('cli vendored picocolors: color discipline', () => {
  it('colors follow the vendored contract under controlled env (15→03: ambient worker env drift made the in-process assertion a hosted-CI red)', async () => {
    // The detector is a pure function of (env, argv, stdout-isTTY) evaluated at module
    // load. Assert it in spawned children with piped stdout and exact env — never
    // against the ambient vitest-worker env (runner images roll; identical code went
    // green→red→green across days on ambient assertions).
    const vendorUrl = pathToFileURL(path.resolve(__dirname, '../src/cli/vendor/picocolors.ts')).href;
    const probe = (envPatch: Record<string, string | undefined>): Promise<{ supported: boolean; plain: boolean }> =>
      new Promise((resolve, reject) => {
        const baseEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) {
          if (v !== undefined && k !== 'NO_COLOR' && k !== 'FORCE_COLOR' && k !== 'CI') baseEnv[k] = v;
        }
        for (const [k, v] of Object.entries(envPatch)) {
          if (v === undefined) delete baseEnv[k]; else baseEnv[k] = v;
        }
        const script = "import(process.argv[1]).then(m => process.stdout.write(JSON.stringify({ supported: m.pc.isColorSupported, plain: m.pc.red('x') === 'x' })))";
        const child = spawn(process.execPath, ['-e', script, vendorUrl], { env: baseEnv, stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) resolve(JSON.parse(out));
          else reject(new Error(`probe exited ${code}`));
        });
      });
    // piped (non-TTY) stdout, no forcing vars → disabled, styling is identity
    const clean = await probe({});
    expect(clean).toEqual({ supported: false, plain: true });
    // CI=true is an explicit force → enabled
    const ci = await probe({ CI: 'true' });
    expect(ci.supported).toBe(true);
    // NO_COLOR outranks CI (vendored precedence) → disabled again
    const noColor = await probe({ CI: 'true', NO_COLOR: '1' });
    expect(noColor).toEqual({ supported: false, plain: true });
  });

  it('FORCE_COLOR re-enables and emits ANSI sequences', async () => {
    const prev = process.env.FORCE_COLOR;
    const prevNoColor = process.env.NO_COLOR;
    delete process.env.NO_COLOR; // FORCE_COLOR cannot win over NO_COLOR (standard precedence)
    process.env.FORCE_COLOR = '1';
    try {
      vi.resetModules(); // fresh module graph re-evaluates env at load time
      const fresh = await import('../src/cli/vendor/picocolors.js');
      expect(fresh.pc.isColorSupported).toBe(true);
      expect(fresh.pc.red('x')).toContain('\u001b[31m');
    } finally {
      if (prev === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = prev;
      if (prevNoColor !== undefined) process.env.NO_COLOR = prevNoColor;
      vi.resetModules();
    }
  });
});
