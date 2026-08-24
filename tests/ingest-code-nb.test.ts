import { describe, expect, it } from 'vitest';
import { detectCodeLanguage, scanPython, scanJsTs, buildSdmFromCode } from '../src/ingest/code';
import { buildSdmFromNotebook } from '../src/ingest/notebook';

const PY = `"""Module docstring."""
import numpy as np
from scipy.stats import t

def pooled_effect(ns, gs):
    """Inverse-variance pooled effect."""
    w = 1.0 / np.var(gs)
    return float(np.sum(w * gs) / np.sum(w))

class MetaAnalyzer:
    def __init__(self, name):
        self.name = name

    def fit(self, data):
        return pooled_effect(None, data)

async def fetch_remote(url):
    return None
`;

describe('python code scan', () => {
  const { symbols, imports } = scanPython(PY);

  it('imports collected with from-import detail', () => {
    expect(imports).toContain('numpy:np');
    expect(imports).toContain('scipy.stats:t');
  });

  it('functions with params, line ranges, docstrings', () => {
    const fn = symbols.find((s) => s.name === 'pooled_effect')!;
    expect(fn.kind).toBe('function');
    expect(fn.params).toBe('ns, gs');
    expect(fn.docstring).toContain('Inverse-variance');
    expect(fn.lineStart).toBe(5); // 1-based: def is the 5th line
  });

  it('classes and methods with indentation-based kinds', () => {
    expect(symbols.find((s) => s.name === 'MetaAnalyzer')!.kind).toBe('class');
    expect(symbols.find((s) => s.name === 'fit')!.kind).toBe('method');
  });

  it('async defs recognized', () => {
    expect(symbols.some((s) => s.name === 'fetch_remote')).toBe(true);
  });
});

describe('js/ts code scan', () => {
  const TS = `import { z } from 'zod';
export interface Foo { a: number }
export class Bar {
  run(x: number): void {}
  private helper(s: string): string { return s; }
}
export function build(n: number) { return n; }
const arrow = (a, b) => a + b;
`;
  const { symbols, imports } = scanJsTs(TS, 'typescript');

  it('import path captured', () => {
    expect(imports).toContain('zod');
  });
  it('class/method/function/arrow symbols', () => {
    const names = symbols.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Bar', 'run', 'helper', 'build', 'arrow']));
    expect(symbols.find((s) => s.name === 'run')!.kind).toBe('method');
    expect(symbols.find((s) => s.name === 'arrow')!.kind).toBe('function');
  });
  it('language detection', () => {
    expect(detectCodeLanguage('a.py')).toBe('python');
    expect(detectCodeLanguage('a.ts')).toBe('typescript');
    expect(detectCodeLanguage('a.mjs')).toBe('javascript');
    expect(detectCodeLanguage('a.rs')).toBeNull();
  });
  it('SDM carries honest heuristic label', () => {
    const doc = buildSdmFromCode(PY, 'meta.py');
    expect(doc.extractor.name).toBe('code-scan-v1');
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/not an AST parse/);
    expect(doc.blocks.some((b) => b.text.includes('pooled_effect(ns, gs)'))).toBe(true);
  });
});

describe('notebook indexing', () => {
  const NB = JSON.stringify({
    cells: [
      { cell_type: 'markdown', source: ['# Analysis\n', 'plan'], metadata: {} },
      { cell_type: 'code', execution_count: 1, source: ['x = 1\n', 'y = x * 2'], outputs: [
        { output_type: 'execute_result', data: { 'text/plain': '2' } },
        { output_type: 'display_data', data: { 'image/png': 'iVBOR...' } },
      ], metadata: {} },
      { cell_type: 'code', execution_count: 2, source: ['1 / 0'], outputs: [
        { output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero' },
      ], metadata: {} },
      { cell_type: 'code', execution_count: null, source: ['never = true'], outputs: [], metadata: {} },
      { cell_type: 'raw', source: ['raw note'], metadata: {} },
    ],
    metadata: { kernelspec: { name: 'python3' } },
    nbformat: 4, nbformat_minor: 5,
  });

  it('kernel in header, markdown headings, code blocks with execution provenance', () => {
    const doc = buildSdmFromNotebook(NB, 'analysis.ipynb');
    expect(doc.blocks[0]!.text).toContain('kernel: python3');
    expect(doc.blocks.some((b) => b.kind === 'heading' && b.text === 'Analysis')).toBe(true);
    const code = doc.blocks.filter((b) => b.kind === 'code');
    expect(code.length).toBe(3);
    expect(code[0]!.provenance?.elementPath).toContain('@exec1');
    expect(code[2]!.provenance?.elementPath).toContain('@never-run');
  });

  it('stored error outputs preserved as footnotes (negative evidence)', () => {
    const doc = buildSdmFromNotebook(NB, 'analysis.ipynb');
    const err = doc.blocks.find((b) => b.kind === 'footnote');
    expect(err?.text).toContain('ZeroDivisionError');
    expect(err?.text).toContain('division by zero');
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/error outputs/);
  });

  it('image outputs counted, not inlined', () => {
    const doc = buildSdmFromNotebook(NB, 'analysis.ipynb');
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/1 image outputs present/);
  });

  it('invalid notebook fails honestly', () => {
    expect(buildSdmFromNotebook('not json', 'x.ipynb').diagnostics.parseStatus).toBe('failed');
    expect(buildSdmFromNotebook('{"a":1}', 'x.ipynb').diagnostics.parseStatus).toBe('failed');
  });
});
