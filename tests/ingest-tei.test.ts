import { describe, expect, it } from 'vitest';
import { parseTei } from '../src/ingest/parsers/tei';

/** GROBID TEI fixture (OpenAlex content route shape), synthesized offline. */
const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Meta-analysis of effect sizes</title></titleStmt>
      <publicationStmt><date>2010</date></publicationStmt>
      <sourceDesc><biblStruct>
        <analytic>
          <title>Meta-analysis of effect sizes</title>
          <author><persName><forename>Wolfgang</forename><surname>Viechtbauer</surname></persName></author>
          <idno type="doi">10.18637/jss.v036.i03</idno>
        </analytic>
        <monogr><imprint><date type="published" when="2010">2010</date></imprint></monogr>
      </biblStruct></sourceDesc>
    </fileDesc>
    <profileDesc><abstract><p>We present a meta-analysis of 16 studies.</p></abstract></profileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <head>Introduction</head>
        <p>Effect sizes vary <ref target="#b1">Viechtbauer 2005</ref> across studies; see <ref target="#fig_0">Figure 1</ref> and <ref target="#tab_0">Table 1</ref>.</p>
        <figure xml:id="fig_0" coords="2,105.0,220.0,510.0,450.0">
          <graphic url="fg1.jpg"/>
          <figDesc>Figure 1: Forest plot of pooled effects. (a) raw. (b) adjusted.</figDesc>
        </figure>
        <figure type="table" xml:id="tab_0">
          <figDesc>Table 1: Study descriptives.</figDesc>
          <table>
            <row role="label"><cell role="label">Study</cell><cell role="label">g</cell></row>
            <row><cell>Smith 2001</cell><cell>0.42</cell></row>
            <row><cell cols="2">Pooled (random)</cell></row>
          </table>
          <note>g = Hedges' g.</note>
        </figure>
        <div>
          <head>Methods</head>
          <p>The estimator follows</p>
          <formula xml:id="formula_0" label="(1)"><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>&#952;</mi><mo>=</mo><msub><mi>&#952;</mi><mn>1</mn></msub><mo>+</mo><mi>&#949;</mi></math></formula>
        </div>
      </div>
      <div type="references"><listBibl>
        <biblStruct xml:id="b1">
          <analytic><title>Bias and efficiency of meta-analytic estimators</title>
            <author><persName><forename>W</forename><surname>Viechtbauer</surname></persName></author>
          </analytic>
          <monogr><imprint><date when="2005">2005</date></imprint></monogr>
          <idno type="doi">10.1016/j.jspi.2005.04.010</idno>
        </biblStruct>
      </listBibl></div>
    </body>
  </text>
</TEI>`;

describe('parseTei — structure recovery', () => {
  const doc = parseTei(TEI, { name: 'openalex:W123', url: 'https://content.openalex.org/x' });

  it('recovers header metadata from teiHeader/biblStruct', () => {
    expect(doc.meta.title).toBe('Meta-analysis of effect sizes');
    expect(doc.meta.authors).toContain('Wolfgang Viechtbauer');
    expect(doc.meta.year).toBe(2010);
    expect(doc.meta.doi).toBe('10.18637/jss.v036.i03');
    expect(doc.extractor.route).toBe('grobid_tei');
  });

  it('emits abstract + section headings with hierarchy', () => {
    expect(doc.blocks.find((b) => b.kind === 'abstract')?.text).toContain('16 studies');
    const intro = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Introduction');
    const methods = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Methods');
    expect(intro?.headingLevel).toBe(1);
    expect(methods?.parentHeadingId).toBe(intro?.id);
  });

  it('recovers figures with label stripped from caption, panels, region from coords', () => {
    expect(doc.figures.length).toBe(1);
    const fig = doc.figures[0]!;
    expect(fig.label).toBe('Figure 1');
    expect(fig.caption).toMatch(/Forest plot/);
    expect(fig.panels.map((p) => p.label)).toEqual(['a', 'b']);
    expect(fig.graphicRef).toBe('fg1.jpg');
    expect(fig.region).toEqual({ page: 2, bbox: [105, 220, 510, 450] });
    expect(fig.provenance?.page).toBe(2);
  });

  it('recovers table figures: label rows as header, colspans, notes as footnotes', () => {
    expect(doc.tables.length).toBe(1);
    const tab = doc.tables[0]!;
    expect(tab.label).toBe('Table 1');
    expect(tab.caption).toMatch(/Study descriptives/);
    expect(tab.headerRows).toBe(1);
    expect(tab.grid[0]).toEqual(['Study', 'g']);
    expect(tab.grid[1]).toEqual(['Smith 2001', '0.42']);
    expect(tab.mergedCells).toEqual([{ row: 2, col: 0, rowSpan: 1, colSpan: 2 }]);
    expect(tab.footnotes).toEqual(["g = Hedges' g."]);
  });

  it('preserves formula MathML verbatim and label', () => {
    expect(doc.equations.length).toBe(1);
    const eq = doc.equations[0]!;
    expect(eq.label).toBe('(1)');
    expect(eq.mathml).toMatch(/MathML/);
    expect(eq.mathml).toContain('<mi>');
  });

  it('resolves forward <ref target> linkage to figures/tables/citations', () => {
    const figRefs = doc.xrefs.filter((x) => x.targetKind === 'figure');
    expect(figRefs.length).toBe(1);
    expect(figRefs[0]!.targetId).toBe(doc.figures[0]!.id);
    expect(figRefs[0]!.status).toBe('resolved');
    expect(doc.xrefs.find((x) => x.targetKind === 'table')?.targetId).toBe(doc.tables[0]!.id);
    const citRef = doc.xrefs.find((x) => x.targetKind === 'citation');
    expect(citRef?.targetId).toBe(doc.citations[0]!.id);
  });

  it('recovers listBibl citation with doi + citedFrom backfill', () => {
    const cit = doc.citations[0]!;
    expect(cit.title).toBe('Bias and efficiency of meta-analytic estimators');
    expect(cit.doi).toBe('10.1016/j.jspi.2005.04.010');
    expect(cit.year).toBe(2005);
    expect(cit.marker).toBe('Viechtbauer 2005');
    expect(cit.citedFromBlocks.length).toBe(1);
  });

  it('reports ok status', () => {
    expect(doc.diagnostics.parseStatus).toBe('ok');
  });
});

describe('parseTei — honesty on bad input', () => {
  it('fails visibly on non-TEI root', () => {
    const doc = parseTei('<html><body/></html>', { name: 'x' });
    expect(doc.diagnostics.parseStatus).toBe('failed');
    expect(doc.diagnostics.warnings[0]).toMatch(/not GROBID TEI/);
  });

  it('degrades to partial with header-only TEI', () => {
    const doc = parseTei('<TEI><teiHeader><fileDesc><titleStmt><title>T</title></titleStmt></fileDesc></teiHeader></TEI>', { name: 'x' });
    expect(doc.diagnostics.parseStatus).toBe('partial');
    expect(doc.meta.title).toBe('T');
  });

  it('malformed XML fails with the parser message', () => {
    const doc = parseTei('<TEI><text>', { name: 'x' });
    expect(doc.diagnostics.parseStatus).toBe('failed');
    expect(doc.diagnostics.warnings[0]).toMatch(/xml parse error/);
  });
});
