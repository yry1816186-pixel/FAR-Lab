import { describe, it, expect } from 'vitest';

/**
 * P0 sandbox-escape regression (adversarial review 06, empirically confirmed
 * against the LIVE sidecar before the fix):
 *
 *   np.f2py.os.system("echo PWNED-CODEACT")
 *
 * executed a real command — numpy auto-imports submodules that re-export
 * os/sys, so attribute traversal from the pre-bound `np` reached arbitrary
 * modules with NO import statement and NO dunder (the dunder ban did not and
 * could not cover this). These tests pin BOTH layers of the fix:
 *   - TS static gate rejects deep module-attribute chains + loader attrs;
 *   - Python AST gate independently mirrors the same policy (verified live in
 *     research/avo-nooa/06; here we assert gate verdicts so the TS layer can
 *     never silently regress).
 */

const analyze = async (code: string) => {
  const { analyzeExplorationCode } = await import('../src/agent/exploratory-codeact.js');
  return analyzeExplorationCode({ code, purpose: 'regression probe', maxRuntimeMs: 1000 });
};

describe('P0: non-dunder module-chain escape is gated', () => {
  it('rejects np.f2py.os.system(...) — the confirmed live escape', async () => {
    const v = await analyze('np.f2py.os.system("echo PWNED-CODEACT")');
    expect(v.allowed).toBe(false);
    const codes = v.violations.map((x) => x.code);
    expect(codes).toContain('E-ESCAPE');
  });

  it('rejects loader/import-system attributes (__loader__, get_code, exec_module)', async () => {
    for (const snippet of [
      'loader = np.testing.__loader__',
      'np.testing.get_code("m")',
      'json.exec_module(x)',
    ]) {
      const v = await analyze(snippet);
      expect(v.allowed, snippet).toBe(false);
      expect(v.violations.map((x) => x.code), snippet).toContain('E-ESCAPE');
    }
  });

  it('still allows legitimate single-level numpy analysis', async () => {
    const v = await analyze([
      'xs = np.array([1.0, 2.0, 3.0])',
      'print(xs.mean(), xs.std())',
      'import statistics',
      'print(statistics.mean([1, 2, 3]))',
    ].join('\n'));
    expect(v.allowed).toBe(true);
  });
});
