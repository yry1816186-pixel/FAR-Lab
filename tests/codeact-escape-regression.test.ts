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

  it('still allows legitimate function binding and shallow submodule use', async () => {
    const v = await analyze([
      'norm = np.linalg.norm',
      'print(norm([3.0, 4.0]))',
      'lin = np.linalg',
      'print(lin.norm([3.0, 4.0]))',
      'xs = np.array([1.0, 2.0])',
      'print(np.round(xs, 1))',
    ].join('\n'));
    expect(v.allowed).toBe(true);
  });
});

describe('P0: alias/dynamic-attr escapes are gated (endgame audit 2026-08-30)', () => {
  it('rejects the alias form p = np; p.f2py.os.system(...)', async () => {
    const v = await analyze('p = np\np.f2py.os.system("echo PWNED-ALIAS")');
    expect(v.allowed).toBe(false);
    expect(v.violations.map((x) => x.code)).toContain('E-ESCAPE');
  });

  it('rejects the split-chain form m = np.f2py; m.os.system(...)', async () => {
    const v = await analyze('m = np.f2py\nm.os.system("echo PWNED-SPLIT")');
    expect(v.allowed).toBe(false);
    expect(v.violations.map((x) => x.code)).toContain('E-ESCAPE');
  });

  it('rejects getattr/setattr/delattr outright (dynamic-string surface)', async () => {
    for (const snippet of [
      'x = getattr(np, "f2py")',
      "y = getattr(np, 'f2' + 'py')",
      'setattr(np, "x", 1)',
      'delattr(np, "x")',
    ]) {
      const v = await analyze(snippet);
      expect(v.allowed, snippet).toBe(false);
      expect(v.violations.map((x) => x.code), snippet).toContain('E-ESCAPE');
    }
  });
});

describe('P0: runtime containment holds in the live sidecar (endgame audit 2026-08-30)', () => {
  it('static alias pass + runtime scrub + guarded getattr all hold on the real sandbox', async () => {
    const { createSidecar } = await import('../src/experiment/python.js');
    const sidecar = createSidecar();
    try {
      // 1) alias chain — rejected by the Python AST pass (op fails loudly)
      const r1 = await sidecar.call<{ exploration?: { ok?: boolean } }>('run_exploration', {
        code: 'p = np\np.f2py.os.system("echo PWNED-LIVE")',
      }, 120_000);
      expect(r1.ok).toBe(false);

      // 2) runtime scrub — os is gone from the bound module even when the chain
      //    is short enough to pass every static check (hasattr depth 0)
      const r2 = await sidecar.call<{ exploration?: { ok?: boolean; stdout?: string } }>('run_exploration', {
        code: 'm = np.f2py\nprint("os-present:", hasattr(m, "os"))',
      }, 120_000);
      expect(r2.ok).toBe(true);
      expect(r2.result?.exploration?.ok).toBe(true);
      expect(r2.result?.exploration?.stdout).toContain('os-present: False');

      // 3) dunder string via getattr — the Python STATIC constant check fires
      //    first (op fails loudly); the runtime guard behind it is
      //    defense-in-depth for scrub-missed paths
      const r3 = await sidecar.call('run_exploration', {
        code: 'x = getattr(np, "__class__")',
      }, 120_000);
      expect(r3.ok).toBe(false);
      expect(r3.error?.message ?? '').toContain('forbidden');

      // 4) numpy survives the scrub/restore cycle for legitimate analysis
      const r4 = await sidecar.call<{ exploration?: { ok?: boolean; stdout?: string } }>('run_exploration', {
        code: 'xs = np.array([1.0, 2.0, 3.0])\nprint("mean:", xs.mean())',
      }, 120_000);
      expect(r4.ok).toBe(true);
      expect(r4.result?.exploration?.ok).toBe(true);
      expect(r4.result?.exploration?.stdout).toContain('mean: 2.0');
    } finally {
      sidecar.close();
    }
  }, 180_000);
});
