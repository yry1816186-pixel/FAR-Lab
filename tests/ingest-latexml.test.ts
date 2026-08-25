import { describe, expect, it } from 'vitest';
import { parseLatexml } from '../src/ingest/parsers/latexml';

/** LaTeXML XHTML fixture (arxiv.org/html shape), synthesized offline. */
const HTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Constrained Evidence Reasoning — 2401.00001</title>
  <meta name="author" content="A. Researcher"/>
  <meta name="author" content="B. Author"/>
</head>
<body>
<div class="ltx_page_main"><div class="ltx_page_content"><div class="ltx_document">
  <div class="ltx_abstract"><h6 class="ltx_title ltx_title_abstract">Abstract</h6>
    <p class="ltx_p">We constrain evidence with falsifiability.</p></div>
  <h2 class="ltx_title ltx_title_section"><span class="ltx_tag ltx_tag_section">1 </span>Introduction</h2>
  <p class="ltx_p">Prior work <a href="#bib.b7">[7]</a> relaxed constraints. Our approach is shown in
     <a href="#S1.F1">Figure 1</a>; data in <a href="#S1.T1">Table 1</a>; formalized by
     <a href="#S1.E1">Eq. (1)</a>.</p>
  <figure id="S1.F1" class="ltx_figure">
    <img src="fig1.png" width="400"/>
    <figcaption class="ltx_caption"><span class="ltx_tag ltx_tag_figure">Figure 1: </span>Evidence flow. (a) collection. (b) pruning.</figcaption>
  </figure>
  <figure id="S1.T1" class="ltx_table">
    <table class="ltx_tabular">
      <thead><tr><th>Source</th><th>Claims</th></tr></thead>
      <tbody>
        <tr><td>arXiv</td><td>120</td></tr>
        <tr><td>PMC</td><td>35</td></tr>
      </tbody>
    </table>
    <figcaption class="ltx_caption"><span class="ltx_tag ltx_tag_table">Table 1: </span>Corpus composition.</figcaption>
  </figure>
  <div id="S1.E1" class="ltx_equationgroup">
    <math xmlns="http://www.w3.org/1998/Math/MathML" alttext="C = \\alpha S + \\epsilon" display="block">
      <mi>C</mi><mo>=</mo><mi>&#945;</mi><mi>S</mi><mo>+</mo><mi>&#949;</mi>
    </math>
    <span class="ltx_td ltx_eqn_cell ltx_eqn_eqno ltx_align_middle">(1)</span>
  </div>
  <h3 class="ltx_title ltx_title_subsection"><span class="ltx_tag ltx_tag_subsection">1.1 </span>Scope</h3>
  <p class="ltx_p">Scope excludes simulation.</p>
  <bibliography class="ltx_bibliography">
    <ul class="ltx_biblist">
      <li id="bib.b7">R. Prior. Relaxed reasoning, 2019.</li>
      <li id="bib.b8">U. Ncited. Uncited work, 2018.</li>
    </ul>
  </bibliography>
</div></div></div>
</body>
</html>`;

describe('parseLatexml — structure recovery', () => {
  const doc = parseLatexml(HTML, { name: 'arxiv:2401.00001', url: 'https://arxiv.org/html/2401.00001' });

  it('recovers title (arXiv suffix stripped) and meta authors', () => {
    expect(doc.meta.title).toBe('Constrained Evidence Reasoning');
    expect(doc.meta.authors).toEqual(['A. Researcher', 'B. Author']);
    expect(doc.extractor.route).toBe('latexml_html');
  });

  it('recovers abstract and section hierarchy', () => {
    expect(doc.blocks.find((b) => b.kind === 'abstract')?.text).toContain('falsifiability');
    const intro = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Introduction');
    const scope = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Scope');
    expect(intro?.headingLevel).toBe(2);
    expect(scope?.headingLevel).toBe(3);
    expect(scope?.parentHeadingId).toBe(intro?.id);
  });

  it('recovers figures: label from ltx_tag, caption body, panels, img src', () => {
    expect(doc.figures.length).toBe(1);
    const fig = doc.figures[0]!;
    expect(fig.label).toBe('Figure 1');
    expect(fig.caption).toMatch(/^Evidence flow/);
    expect(fig.panels.map((p) => p.label)).toEqual(['a', 'b']);
    expect(fig.graphicRef).toBe('fig1.png');
  });

  it('recovers ltx_table with thead header rows', () => {
    expect(doc.tables.length).toBe(1);
    const tab = doc.tables[0]!;
    expect(tab.label).toBe('Table 1');
    expect(tab.headerRows).toBe(1);
    expect(tab.grid).toEqual([['Source', 'Claims'], ['arXiv', '120'], ['PMC', '35']]);
    expect(tab.caption).toMatch(/Corpus composition/);
  });

  it('recovers display equations with alttext LaTeX + eqno label + symbols', () => {
    expect(doc.equations.length).toBe(1);
    const eq = doc.equations[0]!;
    expect(eq.latex).toBe('C = \\alpha S + \\epsilon');
    expect(eq.label).toBe('(1)');
    expect(eq.symbols.map((s) => s.latex)).toContain('\\alpha');
  });

  it('resolves anchor xrefs to figure/table/equation/citation targets', () => {
    expect(doc.xrefs.find((x) => x.targetKind === 'figure')?.targetId).toBe(doc.figures[0]!.id);
    expect(doc.xrefs.find((x) => x.targetKind === 'table')?.targetId).toBe(doc.tables[0]!.id);
    expect(doc.xrefs.find((x) => x.targetKind === 'equation')?.targetId).toBe(doc.equations[0]!.id);
    const citRef = doc.xrefs.find((x) => x.targetKind === 'citation');
    expect(citRef?.targetId).toBe(doc.citations[0]!.id);
    expect(citRef?.rawText).toBe('[7]');
  });

  it('recovers the bibliography with year + citedFrom', () => {
    expect(doc.citations.length).toBe(2);
    const b7 = doc.citations[0]!;
    expect(b7.title).toContain('Relaxed reasoning');
    expect(b7.year).toBe(2019);
    expect(b7.citedFromBlocks.length).toBe(1);
    expect(doc.citations[1]!.citedFromBlocks).toEqual([]);
  });

  it('reports ok status', () => {
    expect(doc.diagnostics.parseStatus).toBe('ok');
  });
});

describe('parseLatexml — honesty on bad input', () => {
  it('fails visibly on non-well-formed HTML', () => {
    const doc = parseLatexml('<html><body><p>unclosed', { name: 'x' });
    expect(doc.diagnostics.parseStatus).toBe('failed');
    expect(doc.diagnostics.warnings[0]).toMatch(/xhtml parse error/);
  });
});
