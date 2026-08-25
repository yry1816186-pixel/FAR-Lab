import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/ingest/parsers/markdown';
import { parseLatex } from '../src/ingest/parsers/latex';

describe('parseMarkdown — structure recovery', () => {
  const md = [
    '# Sleep and Memory',
    '',
    'Intro mentions Figure 1 and Table 1 below.',
    '',
    '## Methods',
    '',
    'We model retention as follows.',
    '',
    '$$', 'R_t = \\alpha R_{t-1} + \\epsilon', '$$',
    '',
    '| Group | n (participants) |', '|---|---|', '| Sleep | 120 |', '| Deprived | 60 |',
    '',
    'Results as in Figure 1: curves differ.',
    '',
    '![Retention curves. (a) sleep. (b) deprived.](fig1.png)',
    '',
    '*Panel (a) shows the sleep group.*',
    '',
    '```python', 'def fit(x):', '    return x * 2', '```',
    '',
    '- item one', '- item two',
    '',
    '> A quoted caveat.',
  ].join('\n');
  const doc = parseMarkdown(md, { name: 'notes.md' });

  it('title from first h1, heading hierarchy', () => {
    expect(doc.meta.title).toBe('Sleep and Memory');
    const h1 = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Sleep and Memory');
    const h2 = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Methods');
    expect(h1?.headingLevel).toBe(1);
    expect(h2?.headingLevel).toBe(2);
    expect(h2?.parentHeadingId).toBe(h1?.id);
  });

  it('tables: GFM pipe grid with header row', () => {
    expect(doc.tables.length).toBe(1);
    const tab = doc.tables[0]!;
    expect(tab.grid).toEqual([['Group', 'n (participants)'], ['Sleep', '120'], ['Deprived', '60']]);
    expect(tab.headerRows).toBe(1);
  });

  it('display math becomes an equation with symbols', () => {
    expect(doc.equations.length).toBe(1);
    expect(doc.equations[0]!.latex).toContain('\\alpha');
    expect(doc.equations[0]!.symbols.map((s) => s.latex)).toContain('\\epsilon');
  });

  it('images become figure records with caption from following line', () => {
    expect(doc.figures.length).toBe(1);
    const fig = doc.figures[0]!;
    expect(fig.graphicRef).toBe('fig1.png');
    expect(fig.caption).toMatch(/Panel \(a\) shows the sleep group/);
    // Caption chosen = the italic line (markdown convention); it only
    // describes panel (a) — panels derive from the chosen caption, honestly.
    expect(fig.panels.map((p) => p.label)).toEqual(['a']);
  });

  it('code blocks keep language + body; lists and quotes survive', () => {
    const code = doc.blocks.find((b) => b.kind === 'code');
    expect(code?.text).toContain('def fit(x):');
    expect(doc.blocks.filter((b) => b.kind === 'list_item').map((b) => b.text)).toEqual(['item one', 'item two']);
    expect(doc.blocks.find((b) => b.kind === 'quote')?.text).toBe('A quoted caveat.');
  });

  it('printed xrefs resolve to the extracted figure/table', () => {
    const fx = doc.xrefs.find((x) => x.targetKind === 'figure');
    expect(fx?.status).toBe('resolved');
    expect(fx?.targetId).toBe(doc.figures[0]!.id);
    expect(doc.xrefs.find((x) => x.targetKind === 'table')?.targetId).toBe(doc.tables[0]!.id);
  });

  it('char provenance present on paragraphs', () => {
    const para = doc.blocks.find((b) => b.kind === 'paragraph');
    expect(para?.provenance?.charStart).toBeGreaterThanOrEqual(0);
  });

  it('empty input fails honestly', () => {
    expect(parseMarkdown('', { name: 'x' }).diagnostics.parseStatus).toBe('failed');
  });
});

describe('parseLatex — source structure recovery', () => {
  const tex = [
    '\\documentclass{article}',
    '\\title{Sparse Recovery \\textit{Revisited}}',
    '\\author{A. One \\and B. Two}',
    '\\begin{document}',
    '\\maketitle',
    '\\begin{abstract}We recover sparse signals under noise.\\end{abstract}',
    '\\section{Introduction}',
    'Sparsity helps recovery \\cite{donoho2006, candes2008}. See Figure 1.',
    '\\begin{figure}[t]',
    '  \\includegraphics[width=0.5\\textwidth]{curves.png}',
    '  \\caption{Recovery curves. (a) noisy. (b) denoised.}',
    '  \\label{fig:curves}',
    '\\end{figure}',
    '\\section{Method}',
    'The estimator is',
    '\\begin{equation}',
    '  \\hat{x} = \\arg\\min_x \\|Ax - y\\|_2^2 + \\lambda\\|x\\|_1',
    '  \\label{eq:l1}',
    '\\end{equation}',
    'as applied in Table 1.',
    '\\begin{table}[h]',
    '  \\caption{Benchmark results.}',
    '  \\begin{tabular}{lcc}',
    '    \\toprule',
    '    Dataset & PSNR & SSIM \\\\',
    '    \\midrule',
    '    A & 31.2 & 0.95 \\\\',
    '    B & 28.7 & 0.91 \\\\',
    '    \\bottomrule',
    '  \\end{tabular}',
    '\\end{table}',
    '\\begin{thebibliography}{9}',
    '\\bibitem{donoho2006} D. Donoho. Compressed sensing. 2006.',
    '\\bibitem{candes2008} E. Cand\\`es. RIP. 2008.',
    '\\end{thebibliography}',
    '\\end{document}',
  ].join('\n');
  const doc = parseLatex(tex, { name: 'paper.tex' });

  it('title and authors (\\and split, macro-stripped)', () => {
    expect(doc.meta.title).toBe('Sparse Recovery Revisited');
    expect(doc.meta.authors).toEqual(['A. One', 'B. Two']);
  });

  it('abstract recovered from the environment', () => {
    expect(doc.blocks.find((b) => b.kind === 'abstract')?.text).toContain('sparse signals');
  });

  it('sections recovered with levels', () => {
    expect(doc.blocks.filter((b) => b.kind === 'heading').map((b) => b.text)).toEqual(['Introduction', 'Method']);
  });

  it('figure: includegraphics ref, caption, panels', () => {
    expect(doc.figures.length).toBe(1);
    const fig = doc.figures[0]!;
    expect(fig.graphicRef).toBe('curves.png');
    expect(fig.caption).toMatch(/Recovery curves/);
    expect(fig.panels.map((p) => p.label)).toEqual(['a', 'b']);
  });

  it('equation: verbatim LaTeX with label (1), symbols scanned', () => {
    expect(doc.equations.length).toBe(1);
    const eq = doc.equations[0]!;
    expect(eq.label).toBe('(1)');
    expect(eq.latex).toContain('\\arg\\min');
    expect(eq.symbols.map((s) => s.latex)).toContain('\\lambda');
    expect(eq.provenance?.charStart).toBeGreaterThan(0);
  });

  it('table: booktabs header detection and row/cell split', () => {
    expect(doc.tables.length).toBe(1);
    const tab = doc.tables[0]!;
    expect(tab.caption).toMatch(/Benchmark results/);
    expect(tab.headerRows).toBe(1);
    expect(tab.grid[0]).toEqual(['Dataset', 'PSNR', 'SSIM']);
    expect(tab.grid).toEqual([['Dataset', 'PSNR', 'SSIM'], ['A', '31.2', '0.95'], ['B', '28.7', '0.91']]);
  });

  it('\\cite → bibitem linkage resolves (forward and multi-key)', () => {
    const cits = doc.citations;
    expect(cits.map((c) => c.title ?? '')).toContain('D. Donoho. Compressed sensing. 2006.');
    const resolved = doc.xrefs.filter((x) => x.targetKind === 'citation' && x.status === 'resolved');
    expect(resolved.length).toBe(2);
    expect(cits.every((c) => c.citedFromBlocks.length === 1)).toBe(true);
  });

  it('printed Figure/Table xrefs resolve via pattern scan', () => {
    expect(doc.xrefs.find((x) => x.targetKind === 'figure')?.targetId).toBe(doc.figures[0]!.id);
    expect(doc.xrefs.find((x) => x.targetKind === 'table')?.targetId).toBe(doc.tables[0]!.id);
  });

  it('labels carry honest heuristic note', () => {
    expect(doc.diagnostics.warnings.join(' ')).toMatch(/heuristic/);
  });
});
