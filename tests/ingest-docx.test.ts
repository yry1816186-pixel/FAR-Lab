import { describe, expect, it } from 'vitest';
import { parseDocx } from '../src/ingest/parsers/docx';
import { writeZip } from '../src/ingest/zip';
import { SdmDocument } from '../src/ingest/sdm';

/** DOCX structure recovery on REAL zip containers built byte-level in-test
 *  (store + deflate entries, exactly the format Word writes). */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W} ${R}><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Methods</w:t></w:r></w:p>
<w:p><w:r><w:t>We measured uptake as shown in Table 1 and Figure 1.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:t>Table 1: summary statistics</w:t></w:r></w:p>
<w:tbl>
 <w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Group A/B</w:t></w:r></w:p></w:tc></w:tr>
 <w:tr><w:tc><w:p><w:r><w:t>n</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>mean</w:t></w:r></w:p></w:tc></w:tr>
 <w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>merged</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1.5</w:t></w:r></w:p></w:tc></w:tr>
 <w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p><w:r><w:t>2.5</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:drawing><a:blip ${A} r:embed="rId7"/></w:drawing></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:t>Figure 1: uptake curve. (a) control. (b) treated.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:t>Zh-TABLE caption: \u8868 2 \u6570\u636e</w:t></w:r></w:p>
</w:body></w:document>`;

const STYLES_XML = `<?xml version="1.0"?>
<w:styles ${W}>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/></w:style>
</w:styles>`;

const CORE_XML = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
<dc:title>Dose-Response Study</dc:title><dc:creator>Alice Zhang</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">2024-03-01T09:00:00Z</dcterms:created>
</cp:coreProperties>`;

const FOOTNOTES_XML = `<?xml version="1.0"?>
<w:footnotes ${W}>
<w:footnote w:id="-1"><w:p/></w:footnote>
<w:footnote w:id="0"><w:p/></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:t>See supplementary methods.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

const RELS_XML = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fig1.png"/>
</Relationships>`;

const docxBytes = (): Buffer => writeZip([
  { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', deflate: true },
  { name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
  { name: 'word/document.xml', data: DOCUMENT_XML, deflate: true },
  { name: 'word/styles.xml', data: STYLES_XML },
  { name: 'word/footnotes.xml', data: FOOTNOTES_XML, deflate: true },
  { name: 'word/_rels/document.xml.rels', data: RELS_XML },
  { name: 'word/media/fig1.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { name: 'docProps/core.xml', data: CORE_XML, deflate: true },
]);

describe('parseDocx on a real OOXML container', () => {
  const r = parseDocx(docxBytes(), 'study.docx');
  if (!r.ok) throw new Error(`fixture must parse: ${r.reason}`);
  const sdm: SdmDocument = r.sdm;

  it('recovers core.xml metadata (title/author/year), never guessed from body', () => {
    expect(sdm.meta.title).toBe('Dose-Response Study');
    expect(sdm.meta.authors).toEqual(['Alice Zhang']);
    expect(sdm.meta.year).toBe(2024);
  });

  it('maps Heading1 style (styles.xml name "heading 1") to a level-1 heading block', () => {
    const h = sdm.blocks.find((b) => b.kind === 'heading');
    expect(h?.text).toBe('Methods');
    expect(h?.headingLevel).toBe(1);
    expect(h?.provenance?.elementPath).toMatch(/document>body>p/);
  });

  it('reconstructs the table grid with gridSpan + vMerge placeholders and tblHeader row', () => {
    expect(sdm.tables).toHaveLength(1);
    const t = sdm.tables[0]!;
    expect(t.label).toBe('Table 1');
    expect(t.caption).toBe('Table 1: summary statistics');
    expect(t.headerRows).toBe(1);
    expect(t.grid).toEqual([
      ['Group A/B', ''],
      ['n', 'mean'],
      ['merged', '1.5'],
      ['', '2.5'],
    ]);
    expect(t.mergedCells).toEqual([
      { row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { row: 2, col: 0, rowSpan: 2, colSpan: 1 },
    ]);
  });

  it('links the drawing paragraph to the Caption below it with the resolved media target', () => {
    expect(sdm.figures).toHaveLength(1);
    const f = sdm.figures[0]!;
    expect(f.label).toBe('Figure 1');
    expect(f.caption).toBe('Figure 1: uptake curve. (a) control. (b) treated.');
    expect(f.graphicRef).toBe('word/media/fig1.png');
    expect(f.panels.map((p) => p.label)).toEqual(['a', 'b']);
    expect(f.perception.status).toBe('not_extracted');
  });

  it('keeps the CJK printed prefix intact in a stray caption (\u8868 2 stays \u8868 2)', () => {
    const zh = sdm.blocks.find((b) => b.text.includes('\u8868 2'));
    expect(zh?.kind).toBe('caption');
    expect(zh?.text).toContain('\u8868 2 \u6570\u636e');
  });

  it('resolves printed cross-references to the extracted records', () => {
    const xrefs = sdm.xrefs.filter((x) => x.status === 'resolved');
    expect(xrefs.some((x) => x.targetId === 'tab_1' && x.targetKind === 'table')).toBe(true);
    expect(xrefs.some((x) => x.targetId === 'fig_1' && x.targetKind === 'figure')).toBe(true);
  });

  it('recovers footnotes.xml content as footnote blocks (separators skipped)', () => {
    const fn = sdm.blocks.filter((b) => b.kind === 'footnote');
    expect(fn).toHaveLength(1);
    expect(fn[0]!.text).toBe('See supplementary methods.');
    expect(fn[0]!.provenance?.elementPath).toBe('footnotes>footnote[1]');
  });

  it('is deterministic: identical bytes → byte-identical SDM JSON', () => {
    const again = parseDocx(docxBytes(), 'study.docx');
    expect(again.ok).toBe(true);
    if (again.ok) expect(JSON.stringify(again.sdm)).toBe(JSON.stringify(sdm));
  });

  it('passes its own zod contract', () => {
    expect(SdmDocument.safeParse(JSON.parse(JSON.stringify(sdm))).success).toBe(true);
  });
});

describe('parseDocx failure honesty', () => {
  it('refuses non-zip bytes with the precise container reason', () => {
    const r = parseDocx(new Uint8Array([1, 2, 3]), 'x.docx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/zip/);
  });

  it('refuses a zip without word/document.xml as not-a-docx', () => {
    const zip = writeZip([{ name: 'hello.txt', data: 'hi' }]);
    const r = parseDocx(zip, 'x.docx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/word\/document\.xml/);
  });
});
