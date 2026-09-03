import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Ω harness smoke (ΩF-002 lesson: a path bug shipped because nothing exercised the
 * entry point): `status` must run offline-green and the dist import path the
 * snapshot machinery relies on must actually resolve from this tree.
 */
describe('omega three-way harness smoke', () => {
  it('status runs offline and exits 0', () => {
    const out = execFileSync('node', [resolve('eval/omega/threeway.mjs'), 'status'], { encoding: 'utf8' });
    expect(out).toContain('anchors:');
    expect(out).toContain('naked leg');
  });

  it('the dist path snapshotRun imports resolves (the ΩF-002 bug class)', async () => {
    if (!existsSync(resolve('dist/cli/main.js'))) return; // dist not built in this environment — the harness itself fails closed on it
    const mod = await import('../dist/pipeline/stages/shared.js');
    expect(typeof mod.isRepresentative).toBe('function');
  });
});
