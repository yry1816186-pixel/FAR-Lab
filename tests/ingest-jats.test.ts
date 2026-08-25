import { describe, expect, it } from 'vitest';
import { parseJats } from '../src/ingest/parsers/jats';

/**
 * Fixtures are representative JATS (modeled on the JATS DTD as served by
 * EuropePMC fullTextXML) — synthesized offline per the no-live-API directive;
 * element shapes mirror the publisher output the production route consumes.
 */
const PAPER = `<?xml version="1.0" encoding="UTF-8"?>
<article article-type="research-article">
  <front>
    <article-meta>
      <article-id pub-id-type="doi">10.1000/fake.2020</article-id>
      <title-group><article-title>Effect of <italic>sleep</italic> on memory consolidation</article-title></title-group>
      <contrib-group>
        <contrib><name><surname>Doe</surname><given-names>Jane</given-names></name></contrib>
        <contrib><name><surname>Wang</surname><given-names>Wei</given-names></name></contrib>
      </contrib-group>
      <pub-date><year>2020</year></pub-date>
      <abstract><p>Sleep improves retention (p &lt; .05).</p></abstract>
      <kwd-group><kwd>sleep</kwd><kwd>memory</kwd></kwd-group>
    </article-meta>
  </front>
  <body>
    <sec id="s1"><title>Introduction</title>
      <p>Memory consolidation depends on sleep <xref ref-type="bibr" rid="B7">[7]</xref>.
         As shown in <xref ref-type="fig" rid="F1">Figure 1</xref>, retention rises.
         See also <xref ref-type="table" rid="T1">Table 1</xref>.</p>
      <fig id="F1">
        <label>Figure 1</label>
        <caption><p>Retention curves. (a) sleep group. (b) deprived group.</p></caption>
        <graphic xlink:href="f1.jpg"/>
      </fig>
      <table-wrap id="T1">
        <label>Table 1</label>
        <caption><p>Cohort descriptives.</p></caption>
        <table>
          <thead><tr><th>Group</th><th>n</th></tr></thead>
          <tbody>
            <tr><td>Sleep</td><td>120</td></tr>
            <tr><td colspan="2">Deprived (n unknown)</td></tr>
          </tbody>
        </table>
        <table-wrap-foot><fn><p>Note: n = participants.</p></fn></table-wrap-foot>
      </table-wrap>
      <sec id="s1-1"><title>Subsection</title>
        <p>The model in <xref ref-type="disp-formula" rid="E1">Eq. (1)</xref> formalizes this.</p>
        <disp-formula id="E1">
          <tex-math>\\beta_{t+1} = \\alpha \\beta_t + \\epsilon</tex-math>
          <label>(1)</label>
        </disp-formula>
      </sec>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="B7"><element-citation publication-type="journal">
        <person-group><name><surname>Smith</surname><given-names>A</given-names></name></person-group>
        <article-title>Sleep and consolidation</article-title>
        <source>J Sleep</source>
        <year>2019</year>
        <pub-id pub-id-type="doi">10.1000/ref.2019</pub-id>
      </element-citation></ref>
      <ref id="B8"><element-citation publication-type="journal">
        <article-title>Never cited title</article-title><year>2018</year>
      </element-citation></ref>
    </ref-list>
  </back>
</article>`;

describe('parseJats — structure recovery', () => {
  const doc = parseJats(PAPER, { name: 'epmc:PMC123', url: 'https://europepmc.org/x' });

  it('recovers frontmatter metadata', () => {
    expect(doc.meta.title).toBe('Effect of sleep on memory consolidation');
    expect(doc.meta.authors).toEqual(['Jane Doe', 'Wei Wang']);
    expect(doc.meta.year).toBe(2020);
    expect(doc.meta.doi).toBe('10.1000/fake.2020');
    expect(doc.schemaVersion).toBe('sdm-1');
    expect(doc.extractor.route).toBe('jats_xml');
  });

  it('emits front blocks: title, authors, abstract, keywords', () => {
    const kinds = doc.blocks.map((b) => b.kind);
    expect(kinds).toContain('front_title');
    expect(kinds).toContain('front_authors');
    const abs = doc.blocks.find((b) => b.kind === 'abstract');
    expect(abs?.text).toContain('p < .05');
    const kw = doc.blocks.find((b) => b.kind === 'keywords');
    expect(kw?.text).toBe('sleep; memory');
  });

  it('recovers the section hierarchy with parent linkage', () => {
    const intro = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Introduction');
    const sub = doc.blocks.find((b) => b.kind === 'heading' && b.text === 'Subsection');
    expect(intro?.headingLevel).toBe(1);
    expect(sub?.headingLevel).toBe(2);
    expect(sub?.parentHeadingId).toBe(intro?.id);
    const para = doc.blocks.find((b) => b.kind === 'paragraph' && b.text.includes('formalizes'));
    expect(para?.parentHeadingId).toBe(sub?.id);
  });

  it('recovers figures with caption, panels, graphic href, xref resolution', () => {
    expect(doc.figures.length).toBe(1);
    const fig = doc.figures[0]!;
    expect(fig.label).toBe('Figure 1');
    expect(fig.caption).toMatch(/retention/i);
    expect(fig.graphicRef).toBe('f1.jpg');
    expect(fig.panels.map((p) => p.label)).toEqual(['a', 'b']);
    expect(fig.panels[0]?.captionSegment).toContain('sleep group');
    const xref = doc.xrefs.find((x) => x.targetKind === 'figure');
    expect(xref?.targetId).toBe(fig.id);
    expect(xref?.status).toBe('resolved');
    expect(xref?.rawText).toBe('Figure 1');
  });

  it('recovers tables with header rows, merged cells, footnotes', () => {
    expect(doc.tables.length).toBe(1);
    const tab = doc.tables[0]!;
    expect(tab.label).toBe('Table 1');
    expect(tab.headerRows).toBe(1);
    expect(tab.grid[0]).toEqual(['Group', 'n']);
    expect(tab.grid[2]).toEqual(['Deprived (n unknown)']); // colspan collapsed row, cell preserved
    expect(tab.mergedCells).toEqual([{ row: 2, col: 0, rowSpan: 1, colSpan: 2 }]);
    expect(tab.footnotes).toEqual(['Note: n = participants.']);
    const tx = doc.xrefs.find((x) => x.targetKind === 'table');
    expect(tx?.targetId).toBe(tab.id);
  });

  it('recovers equations with latex, label, context, symbols', () => {
    expect(doc.equations.length).toBe(1);
    const eq = doc.equations[0]!;
    expect(eq.label).toBe('(1)');
    expect(eq.latex).toContain('\\beta');
    expect(eq.symbols.map((s) => s.latex)).toContain('\\beta');
    expect(eq.symbols.every((s) => s.resolved === false)).toBe(true);
    const para = doc.blocks.find((b) => b.id === eq.contextBlockId);
    expect(para?.text).toContain('formalizes');
    const ex = doc.xrefs.find((x) => x.targetKind === 'equation');
    expect(ex?.targetId).toBe(eq.id);
  });

  it('recovers the reference list with DOI linkage and citedFrom', () => {
    expect(doc.citations.length).toBe(2);
    const b7 = doc.citations[0]!;
    expect(b7.title).toBe('Sleep and consolidation');
    expect(b7.authors).toEqual(['A Smith']);
    expect(b7.year).toBe(2019);
    expect(b7.doi).toBe('10.1000/ref.2019');
    expect(b7.marker).toBe('[7]');
    expect(b7.citedFromBlocks.length).toBe(1);
    const b8 = doc.citations[1]!;
    expect(b8.citedFromBlocks).toEqual([]); // negative evidence: never cited in text
  });

  it('preserves elementPath provenance on records', () => {
    const para = doc.blocks.find((b) => b.kind === 'paragraph');
    expect(para?.provenance?.elementPath).toContain('sec');
  });

  it('reports ok parseStatus', () => {
    expect(doc.diagnostics.parseStatus).toBe('ok');
    expect(doc.diagnostics.warnings).toEqual([]);
  });
});

describe('parseJats — honesty on bad input', () => {
  it('fails visibly on malformed XML', () => {
    const doc = parseJats('<article><sec></article>', { name: 'x' });
    expect(doc.diagnostics.parseStatus).toBe('failed');
    expect(doc.diagnostics.warnings[0]).toMatch(/xml parse error/);
  });

  it('fails when root is not <article>', () => {
    const doc = parseJats('<html><body>x</body></html>', { name: 'x' });
    expect(doc.diagnostics.parseStatus).toBe('failed');
    expect(doc.blocks).toEqual([]);
  });

  it('degrades to partial when only frontmatter exists', () => {
    const doc = parseJats('<article><front><article-meta><article-title>T</article-title></article-meta></front></article>', { name: 'x' });
    expect(doc.diagnostics.parseStatus).toBe('partial');
    expect(doc.meta.title).toBe('T');
  });

  it('guesses zh language from CJK body text', () => {
    const doc = parseJats('<article><body><sec><title>结果</title><p>睡眠显著改善记忆保持 效应量如图 1 所示</p></sec></body></article>', { name: 'x' });
    expect(doc.meta.language).toBe('zh');
  });
});
