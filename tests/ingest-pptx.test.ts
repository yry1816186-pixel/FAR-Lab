import { describe, expect, it } from 'vitest';
import { parsePptx } from '../src/ingest/parsers/pptx';
import { writeZip } from '../src/ingest/zip';
import { SdmDocument } from '../src/ingest/sdm';

/** PPTX structure recovery: sldIdLst order, placeholder titles, layout-order
 *  shape reading, DrawingML tables, speaker notes, honest synthetic headings. */

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const PRESENTATION = `<?xml version="1.0"?>
<p:presentation ${P} ${R}><p:sldIdLst>
<p:sldId id="300" r:id="rId2"/>
<p:sldId id="200" r:id="rId1"/>
</p:sldIdLst></p:presentation>`;

const PRES_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`;

// z-order deliberately opposes visual order: "Bullet B" (y=200) comes FIRST in
// the shape tree; reading order must recover "Bullet A" (y=100) before it.
const SLIDE1 = `<?xml version="1.0"?>
<p:sld ${P} ${A} ${R}><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="50"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Results</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="200"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Bullet B</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="100"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Bullet A</a:t></a:r></a:p></p:txBody></p:sp>
<p:pic><p:nvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId9"/></p:blipFill><p:spPr><a:xfrm><a:off x="400" y="100"/></a:xfrm></p:spPr></p:pic>
<p:graphicFrame><p:nvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="100" y="300"/></p:xfrm><a:tbl>
<a:tr><a:tc gridSpan="2"><a:txBody><a:p><a:r><a:t>Span</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
<a:tr><a:tc><a:txBody><a:p><a:r><a:t>x</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>y</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
</a:tbl></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`;

const SLIDE1_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pic1.png"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`;

const SLIDE2 = `<?xml version="1.0"?>
<p:sld ${P} ${A} ${R}><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="50"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Untitled content only</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

const NOTES1 = `<?xml version="1.0"?>
<p:notes ${P} ${A}><p:cSld><p:spTree>
<p:sp><p:txBody><a:p><a:r><a:t>Explain the anomalous dip.</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:notes>`;

const CORE = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
<dc:title>Study Deck</dc:title><dc:creator>Bob Li</dc:creator>
<dcterms:created>2025-01-02T08:00:00Z</dcterms:created>
</cp:coreProperties>`;

const pptxBytes = (): Buffer => writeZip([
  { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
  { name: 'ppt/presentation.xml', data: PRESENTATION, deflate: true },
  { name: 'ppt/_rels/presentation.xml.rels', data: PRES_RELS },
  // zip order opposes sldIdLst order: slide2 first
  { name: 'ppt/slides/slide2.xml', data: SLIDE2, deflate: true },
  { name: 'ppt/slides/slide1.xml', data: SLIDE1, deflate: true },
  { name: 'ppt/slides/_rels/slide1.xml.rels', data: SLIDE1_RELS },
  { name: 'ppt/notesSlides/notesSlide1.xml', data: NOTES1, deflate: true },
  { name: 'ppt/media/pic1.png', data: Buffer.from([0x89, 0x50]) },
  { name: 'docProps/core.xml', data: CORE, deflate: true },
]);

describe('parsePptx on a real OOXML deck', () => {
  const r = parsePptx(pptxBytes(), 'deck.pptx');
  if (!r.ok) throw new Error(`fixture must parse: ${r.reason}`);
  const sdm: SdmDocument = r.sdm;

  it('follows sldIdLst order (rId2 first), not zip entry order', () => {
    const headings = sdm.blocks.filter((b) => b.kind === 'heading');
    // sldIdLst starts with rId2 = slide2.xml (no title) → synthetic heading at
    // reading position 1; slide1's "Results" title comes second. Zip entry order
    // (slide2 bytes first) and numeric order (slide1 first) would both differ.
    expect(headings.map((h) => h.text)).toEqual(['Slide 1', 'Results']);
  });

  it('never guesses a title: missing placeholder → synthetic heading + warning', () => {
    expect(sdm.diagnostics.warnings.join(' ')).toMatch(/slide 1 has no title placeholder.*never a guessed title/);
  });

  it('reads shape text in layout order (y), not z-order', () => {
    const listItems = sdm.blocks.filter((b) => b.kind === 'list_item');
    // slide2 (first in sldIdLst) contributes its only shape; then slide1's
    // Bullet A (y=100) before Bullet B (y=200) despite reversed z-order.
    expect(listItems.map((b) => b.text)).toEqual(['Untitled content only', 'Bullet A', 'Bullet B']);
  });

  it('recovers the DrawingML table grid with gridSpan placeholder', () => {
    expect(sdm.tables).toHaveLength(1);
    const t = sdm.tables[0]!;
    expect(t.grid).toEqual([['Span', ''], ['x', 'y']]);
    expect(t.headerRows).toBe(1);
    expect(t.mergedCells).toEqual([{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }]);
  });

  it('records images as caption-less figures with resolved media targets (no invented captions)', () => {
    expect(sdm.figures).toHaveLength(1);
    const f = sdm.figures[0]!;
    expect(f.caption).toBe('');
    expect(f.graphicRef).toBe('ppt/media/pic1.png');
    expect(f.perception.status).toBe('not_extracted');
  });

  it('attaches speaker notes from the linked notesSlide part as footnote blocks', () => {
    const fn = sdm.blocks.find((b) => b.kind === 'footnote');
    expect(fn?.text).toBe('Explain the anomalous dip.');
    expect(fn?.provenance?.elementPath).toBe('ppt/notesSlides/notesSlide1.xml');
  });

  it('carries core.xml metadata', () => {
    expect(sdm.meta.title).toBe('Study Deck');
    expect(sdm.meta.authors).toEqual(['Bob Li']);
    expect(sdm.meta.year).toBe(2025);
  });

  it('is deterministic', () => {
    const again = parsePptx(pptxBytes(), 'deck.pptx');
    expect(again.ok).toBe(true);
    if (again.ok) expect(JSON.stringify(again.sdm)).toBe(JSON.stringify(sdm));
  });

  it('passes its own zod contract', () => {
    expect(SdmDocument.safeParse(JSON.parse(JSON.stringify(sdm))).success).toBe(true);
  });
});

describe('parsePptx failure honesty', () => {
  it('refuses non-presentation zips by name', () => {
    const r = parsePptx(writeZip([{ name: 'a', data: 'b' }]), 'x.pptx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ppt\/presentation\.xml/);
  });
});
