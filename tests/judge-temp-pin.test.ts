import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lane-06 decode-discipline lock (2026-08-25). The SCIENCE lane fixed rank/revise
 * running at provider-default temperature; the same defect class survived in
 * hypothesis generation, clustering, novelty labelling and falsification-spec
 * authoring. Provider defaults are invisible, unversioned and differ across the
 * model gateway — an unpinned judgment/generation call is an unreproducible one.
 *
 * This test scans the stage sources and fails when any file's callStructured
 * call-site count drifts above its explicit `temperature:` count. A new call
 * without a pinned temperature turns the inequality red; a deliberate change
 * updates both sides. (Comment-only mentions of temperature count toward the
 * right-hand side — a cheat vector we accept because the reviewed diff is the
 * real gate; this lock catches accidental omissions, not adversaries.)
 */

const STAGE_DIR = join(import.meta.dirname, '..', 'src', 'pipeline', 'stages');

describe('decode-temperature pinning (all pipeline stage LLM calls)', () => {
  it('every stage file pins temperature on every callStructured call site', () => {
    const failures: string[] = [];
    for (const file of readdirSync(STAGE_DIR).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(STAGE_DIR, file), 'utf8');
      const calls = (source.match(/callStructured</g) ?? []).length;
      const temps = (source.match(/temperature:/g) ?? []).length;
      if (calls > temps) {
        failures.push(`${file}: ${calls} callStructured call(s) but only ${temps} explicit temperature`);
      }
    }
    expect(failures, `unpinned decode calls:\n${failures.join('\n')}`).toEqual([]);
  });

  it('the known judgment temperatures stay pinned (regression guards on values)', () => {
    const rank = readFileSync(join(STAGE_DIR, 'rank.ts'), 'utf8');
    expect(rank).toContain('temperature: 0'); // scoring: most load-bearing numeric input
    expect(rank).toContain('temperature: 0.1'); // pair judging: bounded diversity
    const revise = readFileSync(join(STAGE_DIR, 'revise.ts'), 'utf8');
    expect((revise.match(/temperature: 0,/g) ?? []).length).toBeGreaterThanOrEqual(3); // causal analysis + 2 revision calls
    const evidence = readFileSync(join(STAGE_DIR, 'evidence.ts'), 'utf8');
    expect((evidence.match(/temperature: 0,/g) ?? []).length).toBeGreaterThanOrEqual(3); // extraction/gap-seek/cross-relations
  });
});
