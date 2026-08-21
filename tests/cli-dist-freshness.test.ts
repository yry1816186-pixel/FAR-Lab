import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staleDistFiles } from '../src/cli/dist-freshness.js';

/** D-031 guard: research start/resume refuse stale compiled behavior — fixture-backed. */
describe('staleDistFiles (D-031 dist-freshness guard)', () => {
  const makeRoot = () => mkdtempSync(join(tmpdir(), 'far-dist-fresh-'));

  it('reports nothing when dist counterpart exists and is at least as new as src', () => {
    const root = makeRoot();
    try {
      mkdirSync(join(root, 'src', 'deep'), { recursive: true });
      mkdirSync(join(root, 'dist', 'deep'), { recursive: true });
      writeFileSync(join(root, 'src', 'deep', 'a.ts'), 'export const a = 1;');
      writeFileSync(join(root, 'dist', 'deep', 'a.js'), 'export const a = 1;');
      expect(staleDistFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports src files newer than their dist counterpart and missing counterparts', () => {
    const root = makeRoot();
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'src', 'older.ts'), 'x');
      writeFileSync(join(root, 'dist', 'older.js'), 'x');
      writeFileSync(join(root, 'src', 'newer.ts'), 'x');
      writeFileSync(join(root, 'dist', 'newer.js'), 'x');
      utimesSync(join(root, 'dist', 'newer.js'), new Date('2020-01-01'), new Date('2020-01-01'));
      writeFileSync(join(root, 'src', 'missing.ts'), 'x');
      const stale = staleDistFiles(root);
      expect(stale).toContain('newer.js');
      expect(stale.some((s) => s.includes('missing') && s.includes('missing in dist'))).toBe(true);
      expect(stale.some((s) => s.startsWith('older'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores .d.ts and non-ts files', () => {
    const root = makeRoot();
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'src', 'types.d.ts'), 'declare const x: number;');
      writeFileSync(join(root, 'src', 'notes.md'), 'not compiled');
      expect(staleDistFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
