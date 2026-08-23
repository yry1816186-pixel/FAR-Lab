import { describe, it, expect } from 'vitest';
import { analyzeExplorationCode } from '../src/agent/exploratory-codeact.js';
import type { ExplorationVerdict } from '../src/agent/exploratory-codeact.js';

/**
 * Exploratory CodeAct layer (AVO fusion G4): the agent may WRITE Python for
 * exploratory analysis (NOOA CodeAct principle), but the D-086-5 confirmatory
 * boundary is absolute — analysis code runs in the sidecar sandbox and its
 * outputs can only become CANDIDATE claims/specs via deterministic gates.
 *
 * analyzeExplorationCode is the TS-side static gate BEFORE any execution:
 * - blocks confirmatory-boundary escapes (dataset writes into experiment
 *   registries, spec mutations, verdict fabrication)
 * - blocks process/network/credential surfaces (the sidecar sandbox is the
 *   real boundary; this is defense-in-depth + fast feedback)
 * - requires an explicit purpose + bounded runtime
 */

const clean = (code: string, purpose = 'explore correlation structure in retrieved corpus'): ExplorationVerdict =>
  analyzeExplorationCode({ code, purpose, maxRuntimeMs: 30_000 });

describe('exploratory CodeAct static gate', () => {
  it('accepts ordinary analysis code with a stated purpose', () => {
    const v = clean(`
import statistics
xs = [1.0, 2.0, 3.0]
print(statistics.mean(xs))
`);
    expect(v.allowed).toBe(true);
    expect(v.violations).toHaveLength(0);
  });

  it('rejects missing purpose (no unaccounted exploration)', () => {
    const v = analyzeExplorationCode({ code: 'print(1)', purpose: '', maxRuntimeMs: 1000 });
    expect(v.allowed).toBe(false);
    expect(v.violations.some((x) => x.code === 'E-PURPOSE')).toBe(true);
  });

  it('blocks writes toward the confirmatory layer (spec/verdict fabrication)', () => {
    for (const code of [
      `experiment_spec["verdict"] = "supports"`,
      `far_registry.save_spec(spec)`,
      `open("experiment-spec.json", "w").write("{}")`,
    ]) {
      const v = clean(code);
      expect(v.allowed).toBe(false);
      expect(v.violations.some((x) => x.code === 'E-CONFIRMATORY')).toBe(true);
    }
  });

  it('blocks network, subprocess and credential surfaces', () => {
    for (const code of [
      `import socket`,
      `import urllib.request`,
      `import subprocess; subprocess.run(["ls"])`,
      `os.system("rm -rf /")`,
      `requests.get("https://example.com")`,
    ]) {
      const v = clean(code);
      expect(v.allowed).toBe(false);
      expect(v.violations.some((x) => ['E-NETWORK', 'E-SUBPROCESS'].includes(x.code))).toBe(true);
    }
  });

  it('requires a bounded runtime', () => {
    const v = analyzeExplorationCode({ code: 'print(1)', purpose: 'p', maxRuntimeMs: 0 });
    expect(v.allowed).toBe(false);
    expect(v.violations.some((x) => x.code === 'E-RUNTIME')).toBe(true);
  });

  it('reports line numbers for violations (agent-readable feedback)', () => {
    const v = clean(`\nimport socket\nprint("x")`);
    const net = v.violations.find((x) => x.code === 'E-NETWORK');
    expect(net?.line).toBe(2);
  });

  it('blocks the empirically-confirmed dunder-traversal sandbox escape (E-ESCAPE)', () => {
    // Exact payload shape from the 2026-08-24 adversarial audit: no import
    // statement, no marker word from other classes — pure attribute traversal
    // that recovered the real open/__import__ inside the restricted namespace.
    const escapePayloads = [
      `objs = ().__class__.__bases__[0].__subclasses__()\nprint(len(objs))`,
      `g = print.__init__.__globals__\nprint(list(g.keys())[:5])`,
      `bi = getattr(print, '__init__').__globals__['__builtins__']\nprint(hasattr(bi, 'open'))`,
      `cls = type('x', (), {})\nprint(cls.__mro__)`,
    ];
    for (const code of escapePayloads) {
      const v = clean(code);
      expect(v.allowed).toBe(false);
      expect(v.violations.some((x) => x.code === 'E-ESCAPE')).toBe(true);
    }
    // The string-form ban also catches getattr(..., '__globals__') laundering.
    const laundered = clean(`f = getattr(len, '__globals__')`);
    expect(laundered.allowed).toBe(false);
    expect(laundered.violations.some((x) => x.code === 'E-ESCAPE')).toBe(true);
    // Ordinary analysis code that merely uses dunder-named METHODS implicitly
    // (len(), iteration) stays allowed — the ban is on WRITTEN dunder attrs only.
    expect(clean(`import statistics\nxs=[1,2,3]\nprint(statistics.pstdev(xs))`).allowed).toBe(true);
  });
});
