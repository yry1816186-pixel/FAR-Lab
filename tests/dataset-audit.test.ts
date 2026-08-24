import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// RU-8 GO1 — pre-execution dataset audit via the REAL sidecar (uv-managed,
// cleanlab locked in pyproject). Deterministic seeds; offline (no network).

const runSidecar = (payload: Record<string, unknown>): { ok: boolean; result?: Record<string, unknown>; error?: unknown } => {
  const req = JSON.stringify({ id: 1, op: 'dataset_audit', payload });
  const proc = spawnSync('uv', ['run', '--project', 'experiment-runtime', 'python', '-m', 'farlab_experiment_runtime'], {
    input: req, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
  });
  const line = (proc.stdout ?? '').split('\n').find((l) => l.includes('"id"'));
  if (line === undefined) throw new Error(`sidecar produced no result line: ${(proc.stderr ?? '').slice(-400)}`);
  return JSON.parse(line) as { ok: boolean; result?: Record<string, unknown>; error?: unknown };
};

const mkCsv = (rows: number[][]): string => {
  const fd = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-audit-')), 'ds.csv');
  const lines = ['x,label', ...rows.map((r) => `${r[0]},${r[1]}`)];
  fs.writeFileSync(fd, lines.join('\n'), 'utf8');
  return fd;
};

const seededRows = (n: number, seed: number): number[][] => {
  // xorshift-style deterministic pseudo-random in [0,10)
  let s = seed;
  const out: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const x = Math.round(((s / 4294967296) * 10) * 1000) / 1000;
    out.push([x, x < 5 ? 0 : 1]);
  }
  return out;
};

describe('RU-8 GO1 dataset audit (real sidecar, cleanlab)', () => {
  it('clean dataset -> verdict ok, zero findings', () => {
    const rows = seededRows(60, 7);
    const csv = mkCsv(rows);
    const r = runSidecar({ csvPath: csv, targetColumn: 'label', trainIdx: Array.from({ length: 42 }, (_, i) => i), testIdx: Array.from({ length: 18 }, (_, i) => 42 + i), seed: 7 });
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.result!.verdict).toBe('ok');
    expect(r.result!.trainTestLeakRows).toBe(0);
    expect((r.result!.exactDuplicates as Record<string, number>).train).toBe(0);
  });

  it('leakage and duplicates are detected exactly and degrade the verdict', () => {
    const rows = seededRows(60, 7);
    rows.push([...rows[20]!], [...rows[20]!], [...rows[30]!]); // 3 train dups (incl one pair)
    rows.push([...rows[21]!]); // leak row (also in test range via idx below)
    const csv = mkCsv(rows);
    const n = rows.length;
    const trainIdx = [...Array.from({ length: 42 }, (_, i) => i), n - 4, n - 3, n - 2];
    const testIdx = [...Array.from({ length: 18 }, (_, i) => 42 + i), n - 1]; // n-1 duplicates train's 21
    const r = runSidecar({ csvPath: csv, targetColumn: 'label', trainIdx, testIdx, seed: 7 });
    expect(r.ok).toBe(true);
    expect(r.result!.trainTestLeakRows).toBeGreaterThanOrEqual(1);
    expect((r.result!.exactDuplicates as Record<string, number>).train).toBeGreaterThanOrEqual(2);
    expect(r.result!.verdict).toBe('degraded');
  });

  it('planted label errors are surfaced (advisory, count > 0)', () => {
    const rows = seededRows(80, 11);
    for (let i = 0; i < 10; i += 1) rows[i]![1] = rows[i]![1] === 0 ? 1 : 0; // flip 10 train labels
    const csv = mkCsv(rows);
    const r = runSidecar({ csvPath: csv, targetColumn: 'label', trainIdx: Array.from({ length: 56 }, (_, i) => i), testIdx: Array.from({ length: 24 }, (_, i) => 56 + i), seed: 11 });
    expect(r.ok).toBe(true);
    expect(r.result!.labelIssueCount as number).toBeGreaterThan(0);
  });
});
