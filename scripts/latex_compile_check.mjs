#!/usr/bin/env node
/**
 * latex_compile_check.mjs — render a fixture ReportData through the LaTeX
 * renderer and write report-fixture.tex for the CI compile step (pdflatex).
 * R10 §12 T1: "LaTeX 报告在 doc CI 编译通过" — this script provides the
 * artifact; the CI job compiles it with a real TeX engine.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderLatex } from '../src/report/latex_renderer.ts';

const fixture = {
  runId: 'latex-ci-fixture',
  generatedAt: '2026-08-16T00:00:00.000Z',
  sections: [
    {
      title: 'Summary & conclusions',
      body: 'One claim sealed with 100% confidence & a $5 budget under #stress_test.',
      evidenceRefs: ['EV-1', 'EV-2'],
    },
    {
      title: 'Evidence chain',
      body: 'row1 | row2\nrow3 | row4',
      evidenceRefs: [],
    },
  ],
  reproHash: 'ab'.repeat(32),
  verdictSummary: { CONFIRMED: 1, INCONCLUSIVE: 2, UNTESTED: 3 },
  sourceAnchorCount: 6,
};

mkdirSync('.far/latex', { recursive: true });
const tex = renderLatex(fixture);
writeFileSync('.far/latex/report-fixture.tex', tex, 'utf8');
console.log(`latex_compile_check: wrote .far/latex/report-fixture.tex (${tex.length}B)`);
