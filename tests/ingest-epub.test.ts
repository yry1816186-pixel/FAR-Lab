import { describe, expect, it } from 'vitest';
import { parseEpub } from '../src/ingest/parsers/epub';
import { writeZip } from '../src/ingest/zip';
import { SdmDocument } from '../src/ingest/sdm';

/** EPUB structure recovery: spine ORDER (not zip order), OPF metadata,
 *  cross-part reference resolution, honest part-skip warnings. */

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Methods Handbook</dc:title>
<dc:creator>Lin Wei</dc:creator>
<dc:date>2023-06-01</dc:date>
<dc:language>en</dc:language>
<dc:identifier id="uid">urn:isbn:1</dc:identifier>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
</manifest>
<spine>
<itemref idref="ch1"/>
<itemref idref="ch2"/>
</spine>
</package>`;

const CH1 = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head>
<body><h1>Chapter One</h1><p>Alpha text mentions Figure 1.</p></body></html>`;

const CH2 = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter Two</title></head>
<body><h1>Chapter Two</h1><p>Beta text.</p>
<figure><img src="fig2.png"/><figcaption>Figure 1: apparatus. (a) front.</figcaption></figure>
</body></html>`;

// Zip ENTRY order deliberately opposes spine order (ch2 bytes before ch1) —
// the legacy web path followed zip order; the parser must not.
const epubBytes = (): Buffer => writeZip([
  { name: 'mimetype', data: 'application/epub+zip' },
  { name: 'OEBPS/ch2.xhtml', data: CH2, deflate: true },
  { name: 'OEBPS/ch1.xhtml', data: CH1, deflate: true },
  { name: 'OEBPS/content.opf', data: OPF, deflate: true },
  { name: 'OEBPS/style.css', data: 'body{}' },
  { name: 'META-INF/container.xml', data: CONTAINER, deflate: true },
]);

describe('parseEpub on a real OCF container', () => {
  const r = parseEpub(epubBytes(), 'book.epub');
  if (!r.ok) throw new Error(`fixture must parse: ${r.reason}`);
  const sdm: SdmDocument = r.sdm;

  it('follows spine order, not zip entry order', () => {
    const headings = sdm.blocks.filter((b) => b.kind === 'heading');
    expect(headings.map((h) => h.text)).toEqual(['Chapter One', 'Chapter Two']);
  });

  it('carries OPF dc metadata verbatim', () => {
    expect(sdm.meta.title).toBe('Methods Handbook');
    expect(sdm.meta.authors).toEqual(['Lin Wei']);
    expect(sdm.meta.year).toBe(2023);
    expect(sdm.meta.language).toBe('en');
  });

  it('resolves a forward cross-part reference (ch1 mention → ch2 figure)', () => {
    const x = sdm.xrefs.find((xr) => xr.targetKind === 'figure');
    expect(x?.status).toBe('resolved');
    expect(x?.targetId).toBe('fig_1');
  });

  it('records spine-prefixed provenance on every block', () => {
    for (const b of sdm.blocks) {
      expect(b.provenance?.elementPath).toMatch(/^spine\[\d+\]>/);
    }
  });

  it('skips css parts without pretending they are content', () => {
    expect(sdm.blocks.every((b) => !b.text.includes('body{}'))).toBe(true);
  });

  it('is deterministic', () => {
    const again = parseEpub(epubBytes(), 'book.epub');
    expect(again.ok).toBe(true);
    if (again.ok) expect(JSON.stringify(again.sdm)).toBe(JSON.stringify(sdm));
  });

  it('passes its own zod contract', () => {
    expect(SdmDocument.safeParse(JSON.parse(JSON.stringify(sdm))).success).toBe(true);
  });
});

describe('parseEpub failure honesty', () => {
  it('refuses a zip that is not an OCF container', () => {
    const r = parseEpub(writeZip([{ name: 'a.txt', data: 'x' }]), 'x.epub');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/META-INF\/container\.xml/);
  });

  it('warns per-part when a spine item is missing, and keeps the rest of the book', () => {
    const bytes = writeZip([
      { name: 'META-INF/container.xml', data: CONTAINER },
      { name: 'OEBPS/content.opf', data: OPF },
      { name: 'OEBPS/ch1.xhtml', data: CH1 },
      // ch2 deliberately absent
    ]);
    const r = parseEpub(bytes, 'broken.epub');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sdm.diagnostics.parseStatus).toBe('partial');
      expect(r.sdm.diagnostics.warnings.join(' ')).toMatch(/spine\[2\].*missing/);
      expect(r.sdm.blocks.some((b) => b.text === 'Chapter One')).toBe(true);
    }
  });
});
