/**
 * latex_renderer.test.ts — LaTeX 报告渲染器（night-r4 T1）。
 * 结构断言 + 转义对抗 + 确定性；真编译验证在 CI（tectonic 步）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeLatex, renderLatex } from '../../src/report/latex_renderer.ts';
import type { ReportData } from '../../src/report/types.ts';

const FIXTURE: ReportData = {
  runId: 'run-latex-1',
  generatedAt: '2026-08-16T00:00:00.000Z',
  sections: [
    {
      title: 'Summary',
      body: 'The kernel sealed one claim.',
      evidenceRefs: ['EV-1', 'EV-2'],
    },
    {
      title: 'Evidence chain',
      body: 'row1 | row2\nrow3 | row4',
      evidenceRefs: [],
    },
  ],
  reproHash: 'ab'.repeat(32),
  verdictSummary: { CONFIRMED: 1, UNTESTED: 3 },
  sourceAnchorCount: 4,
};

test('document skeleton: preamble, maketitle, begin/end document pair', () => {
  const tex = renderLatex(FIXTURE);
  assert.match(tex, /\\documentclass\[11pt\]\{article\}/);
  assert.match(tex, /\\usepackage\{booktabs\}/);
  assert.match(tex, /\\begin\{document\}/);
  assert.match(tex, /\\end\{document\}/);
  assert.equal(tex.indexOf('\\begin{document}') < tex.indexOf('\\end{document}'), true);
  assert.match(tex, /run run-latex-1/);
});

test('escapeLatex: all special chars neutralized; backslash marker braces survive', () => {
  assert.equal(escapeLatex('a_b'), 'a\\_b');
  assert.equal(escapeLatex('100% & $5 #3'), '100\\% \\& \\$5 \\#3');
  assert.equal(escapeLatex('x^{2}'), 'x\\textasciicircum{}\\{2\\}');
  assert.equal(escapeLatex('~tilde'), '\\textasciitilde{}tilde');
  assert.equal(escapeLatex('back\\slash'), 'back\\textbackslash{}slash');
  assert.equal(escapeLatex('a\\{b'), 'a\\textbackslash{}\\{b'); // backslash THEN brace, both correct
});

test('adversarial section content cannot inject latex commands', () => {
  const hostile: ReportData = {
    ...FIXTURE,
    sections: [
      { title: '\\section{injected}', body: '\\input{/etc/passwd}', evidenceRefs: [] },
    ],
  };
  const tex = renderLatex(hostile);
  assert.doesNotMatch(tex, /\\input\{\/etc/);
  assert.ok(tex.includes('\\textbackslash{}input'));
});

test('verbatim injection guard: embedded end-marker is neutralized (doubled)', () => {
  const hostile: ReportData = {
    ...FIXTURE,
    sections: [
      { title: 'block', body: 'line1\n\\end{verbatim*}\\section{evil}\nline2', evidenceRefs: [] },
    ],
  };
  const tex = renderLatex(hostile);
  // the hostile marker is doubled (\\\\end at line start); exactly ONE real closer per block
  const closers = tex.match(/^\\end\{verbatim\*\}$/gm) ?? [];
  const doubled = tex.match(/^\\\\end\{verbatim\*\}/gm) ?? [];
  assert.equal(closers.length, 1, 'exactly one real verbatim closer');
  assert.equal(doubled.length, 1, 'the hostile marker was doubled, not passed through');
});

test('verdict table: sorted rows with booktabs rules', () => {
  const tex = renderLatex(FIXTURE);
  assert.match(tex, /\\begin\{tabular\}\{lr\}/);
  assert.match(tex, /\\toprule/);
  assert.match(tex, /CONFIRMED & 1 \\\\/);
  assert.match(tex, /UNTESTED & 3 \\\\/);
  assert.match(tex, /\\bottomrule/);
});

test('evidence refs render as a paragraph; empty refs omit the paragraph', () => {
  const tex = renderLatex(FIXTURE);
  assert.match(tex, /\\paragraph\{Evidence refs\} EV-1, EV-2/);
  const noRefs = renderLatex({ ...FIXTURE, sections: [{ title: 't', body: 'b', evidenceRefs: [] }] });
  assert.doesNotMatch(noRefs, /\\paragraph\{Evidence refs\}/);
});

test('determinism: byte-identical double render', () => {
  assert.equal(renderLatex(FIXTURE), renderLatex(FIXTURE));
});
