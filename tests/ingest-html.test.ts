import { describe, expect, it } from 'vitest';
import { parseHtml } from '../src/ingest/parsers/html';
import { SdmDocument } from '../src/ingest/sdm';

/** HTML structure recovery: tolerance pre-pass (doctype/voids/bare attrs/
 *  script drops), real-table expansion, unclosed-<p> containment, and honest
 *  failure on tag soup the strict parser cannot trust. */

const MESSY_HTML = `<!DOCTYPE html>
<html><HEAD><TITLE>Supplement S1</TITLE></HEAD>
<script>if (1 < 2 && x) { alert("</div>"); }</script>
<body>
<H1>Results</H1>
<p>Uptake rose steadily. See Figure 1 for details.
<p>Second paragraph after an unclosed p tag.
<figure><img src=fig1.png alt="curve"><figcaption>Figure 1: uptake. (a) control.</figcaption></figure>
<table>
<caption>Table 1: stats</caption>
<tr><th>group</th><th>n</th></tr>
<tr><td rowspan=2>merged</td><td>10</td></tr>
<tr><td>20</td></tr>
<tr><td colspan="2">wide</td></tr>
</table>
</body></html>`;

describe('parseHtml on messy real-world markup', () => {
  const sdm = parseHtml(MESSY_HTML, { name: 's1.html' });

  it('drops the doctype, uppercases, unquoted attribute values and bare attributes', () => {
    expect(sdm.meta.title).toBe('Supplement S1');
    expect(sdm.blocks.some((b) => b.kind === 'heading' && b.text === 'Results')).toBe(true);
  });

  it('drops script content with an explicit warning (never parsed as text)', () => {
    expect(sdm.blocks.every((b) => !b.text.includes('alert'))).toBe(true);
    expect(sdm.diagnostics.warnings.join(' ')).toMatch(/script.*dropped/);
  });

  it('treats an unclosed <p> as a container: two paragraphs, not one merged blob', () => {
    const paras = sdm.blocks.filter((b) => b.kind === 'paragraph');
    expect(paras.map((p) => p.text)).toEqual([
      'Uptake rose steadily. See Figure 1 for details.',
      'Second paragraph after an unclosed p tag.',
    ]);
  });

  it('resolves the forward figure reference to the extracted figure record', () => {
    const x = sdm.xrefs.find((xr) => xr.targetKind === 'figure');
    expect(x?.status).toBe('resolved');
    expect(x?.targetId).toBe('fig_1');
  });

  it('recovers the figure with its caption, panel and image target', () => {
    expect(sdm.figures).toHaveLength(1);
    const f = sdm.figures[0]!;
    expect(f.label).toBe('Figure 1');
    expect(f.caption).toBe('Figure 1: uptake. (a) control.');
    expect(f.graphicRef).toBe('fig1.png');
    expect(f.panels.map((p) => p.label)).toEqual(['a']);
  });

  it('expands rowspan + colspan into a rectangular grid with merged-cell records', () => {
    expect(sdm.tables).toHaveLength(1);
    const t = sdm.tables[0]!;
    expect(t.label).toBe('Table 1');
    expect(t.caption).toBe('Table 1: stats');
    expect(t.headerRows).toBe(1);
    expect(t.grid).toEqual([
      ['group', 'n'],
      ['merged', '10'],
      ['', '20'],
      ['wide', ''],
    ]);
    expect(t.mergedCells).toEqual([
      { row: 1, col: 0, rowSpan: 2, colSpan: 1 },
      { row: 3, col: 0, rowSpan: 1, colSpan: 2 },
    ]);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(parseHtml(MESSY_HTML, { name: 's1.html' }))).toBe(JSON.stringify(sdm));
  });

  it('passes its own zod contract', () => {
    expect(SdmDocument.safeParse(JSON.parse(JSON.stringify(sdm))).success).toBe(true);
  });
});

describe('parseHtml honesty edges', () => {
  it('records orphan images without caption guesses', () => {
    const sdm = parseHtml('<html><body><p>text</p><img src="x.png"/></body></html>', { name: 'a.html' });
    expect(sdm.figures).toHaveLength(1);
    expect(sdm.figures[0]!.caption).toBe('');
    expect(sdm.diagnostics.warnings.join(' ')).toMatch(/image without/);
  });

  it('recovers spec-repairable misnesting deterministically and reports the stray closer', () => {
    const sdm = parseHtml('<html><body><div><span>text</div></span></body></html>', { name: 'odd.html' });
    expect(sdm.diagnostics.parseStatus).toBe('ok');
    expect(sdm.blocks.map((b) => b.text)).toEqual(['text']); // span text survives the repair
    expect(sdm.diagnostics.warnings.join(' ')).toMatch(/stray close tag/);
  });

  it('still fails visibly on input no spec rule repairs (raw < in text)', () => {
    const sdm = parseHtml('<html><body><p>5 < 3 is false</p></body></html>', { name: 'bad.html' });
    expect(sdm.diagnostics.parseStatus).toBe('failed');
    expect(sdm.diagnostics.warnings.join(' ')).toMatch(/strict parse/);
    expect(sdm.blocks).toHaveLength(0);
  });

  it('emits partial (not ok) when the body carries no block-level content', () => {
    const sdm = parseHtml('<html><body></body></html>', { name: 'empty.html' });
    expect(sdm.diagnostics.parseStatus).toBe('partial');
    expect(sdm.diagnostics.warnings.join(' ')).toMatch(/no block-level content/);
  });
});
