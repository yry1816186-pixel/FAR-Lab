import { describe, expect, it, vi } from 'vitest';
import { displayWidth, padColumns, table, marker, stageLine, subLine } from '../src/cli/term.js';
import { pc } from '../src/cli/vendor/picocolors.js';

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
  it('colors are disabled in non-TTY test stdout unless forced', () => {
    // vitest pipes stdout (no TTY). Color still turns ON under CI=true: the
    // vendored detector treats CI as an explicit force (vendor/picocolors.ts
    // `|| !!env.CI`) — found by the first real CI run. Discipline unchanged:
    // only explicit forcing (FORCE_COLOR/CI/--color) enables color on a pipe.
    const forced = process.env.FORCE_COLOR !== undefined || process.env.CI !== undefined;
    if (!forced) {
      expect(pc.isColorSupported).toBe(false);
      expect(pc.red('x')).toBe('x');
    } else {
      expect(pc.isColorSupported).toBe(true);
    }
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
