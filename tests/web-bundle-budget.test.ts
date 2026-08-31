import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectBundle } from '../web/scripts/check-bundle-budget.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; manifest: Record<string, Record<string, unknown>> } {
  const root = mkdtempSync(path.join(tmpdir(), 'far-web-bundle-'));
  roots.push(root);
  const put = (rel: string, body = rel): void => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };
  put('index.html', '<main></main>');
  put('assets/main.js');
  put('assets/main.css');
  put('assets/math.js');
  put('assets/math.css');
  put('assets/pdf-collect.js');
  put('assets/pdf.js');
  put('assets/pdf.worker.min-a.mjs');
  put('assets/xlsx.js');
  put('assets/radar.js');
  put('assets/asr-worker-a.js');
  put('assets/transformers.web-a.js');

  const manifest: Record<string, Record<string, unknown>> = {
    'index.html': { file: 'assets/main.js', isEntry: true, css: ['assets/main.css'] },
    'src/utils/InlineMathFragment.tsx': {
      file: 'assets/math.js', isDynamicEntry: true, css: ['assets/math.css'], imports: ['index.html'],
    },
    'src/utils/pdfCollect.ts': {
      file: 'assets/pdf-collect.js', isDynamicEntry: true,
      dynamicImports: ['node_modules/pdfjs-dist/build/pdf.mjs'],
    },
    'node_modules/pdfjs-dist/build/pdf.mjs': { file: 'assets/pdf.js', isDynamicEntry: true },
    'node_modules/xlsx/xlsx.mjs': { file: 'assets/xlsx.js', isDynamicEntry: true },
    'src/components/detail/viz/RadarCompare.tsx': { file: 'assets/radar.js', isDynamicEntry: true },
  };
  put('.vite/manifest.json', JSON.stringify(manifest));
  return { root, manifest };
}

describe('web production bundle budget', () => {
  it('accepts one cold entry with every heavy capability kept optional', () => {
    const { root } = fixture();
    const report = inspectBundle(root, { shellBudgetBytes: 10_000 });
    expect(report).toMatchObject({
      status: 'PASS',
      initial: { files: ['assets/main.css', 'assets/main.js', 'index.html'] },
      errors: [],
    });
  });

  it('rejects a static KaTeX boundary and a second legacy pdfjs runtime', () => {
    const { root, manifest } = fixture();
    manifest['src/utils/InlineMathFragment.tsx']!.isDynamicEntry = false;
    manifest['node_modules/pdfjs-dist/legacy/build/pdf.mjs'] = {
      file: 'assets/pdf-legacy.js', isDynamicEntry: true,
    };
    mkdirSync(path.join(root, 'assets'), { recursive: true });
    writeFileSync(path.join(root, 'assets/pdf-legacy.js'), 'legacy');
    writeFileSync(path.join(root, '.vite/manifest.json'), JSON.stringify(manifest));
    const report = inspectBundle(root, { shellBudgetBytes: 10_000 });
    expect(report.errors).toEqual([
      'optional source is not dynamic: src/utils/InlineMathFragment.tsx',
      'legacy pdfjs browser runtime emitted: node_modules/pdfjs-dist/legacy/build/pdf.mjs',
    ]);
  });

  it('rejects debug maps, misplaced wasm, and the exact shell-budget boundary', () => {
    const { root } = fixture();
    writeFileSync(path.join(root, 'assets/code.js.map'), 'map');
    writeFileSync(path.join(root, 'assets/runtime.wasm'), 'wasm');
    const measured = inspectBundle(root, { shellBudgetBytes: 10_000 });
    const report = inspectBundle(root, { shellBudgetBytes: measured.budget.shellBytes });
    expect(report.errors).toEqual([
      'source maps shipped: assets/code.js.map',
      'ORT/wasm outside optional models/: assets/runtime.wasm',
      `application shell ${measured.budget.shellBytes} bytes exceeds <${measured.budget.shellBytes} budget`,
    ]);
  });
});
