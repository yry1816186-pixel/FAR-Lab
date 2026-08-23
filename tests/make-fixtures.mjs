#!/usr/bin/env node
/**
 * Deterministically regenerate the file-ingest fixtures under tests/fixtures/
 * (committed binaries are tiny; this script documents their provenance and
 * lets anyone reproduce them byte-for-byte conceptually — SheetJS writes a
 * stable zip layout for this fixed input).
 *
 * Usage: node tests/make-fixtures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tests', 'fixtures');
// Parser deps live in the web workspace (mirroring what the browser bundles).
const requireFromWeb = createRequire(join(root, 'web', 'noop.js'));
const JSZip = requireFromWeb('jszip');
const XLSX = requireFromWeb('xlsx');

const XML = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}\n`;

const DOCX_CONTENT_TYPES = XML(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + `<Default Extension="xml" ContentType="application/xml"/>`
  + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  + `</Types>`);
const DOCX_RELS = XML(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
  + `</Relationships>`);
const DOCX_DOCUMENT = XML(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
  + `<w:p><w:r><w:t>Hypothesis A wins under measurement noise.</w:t></w:r></w:p>`
  + `<w:p><w:r><w:t>Counter-evidence: the sample size is small.</w:t></w:r></w:p>`
  + `</w:body></w:document>`);

const PPTX_SLIDE = (text) => XML(`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" `
  + `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>`
  + `<a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);

const ODT_CONTENT = XML(`<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" `
  + `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>`
  + `<text:h>Registered report</text:h>`
  + `<text:p>Effect size pooling across three cohorts.</text:p>`
  + `<text:p>Second paragraph with <text:span>nested span</text:span> text.</text:p>`
  + `</office:text></office:body></office:document-content>`);

const XHTML = (title, body) => XML(`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${body}</body></html>`);
const EPUB_CONTAINER = XML(`<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

async function main() {
  await mkdir(outDir, { recursive: true });
  const write = (name, data) => writeFile(join(outDir, name), data);

  const docx = new JSZip();
  docx.file('[Content_Types].xml', DOCX_CONTENT_TYPES);
  docx.file('_rels/.rels', DOCX_RELS);
  docx.file('word/document.xml', DOCX_DOCUMENT);
  await write('sample.docx', await docx.generateAsync({ type: 'nodebuffer' }));

  const pptx = new JSZip();
  pptx.file('[Content_Types].xml', DOCX_CONTENT_TYPES);
  pptx.file('ppt/slides/slide1.xml', PPTX_SLIDE('Study design overview'));
  pptx.file('ppt/slides/slide2.xml', PPTX_SLIDE('Threats to validity'));
  pptx.file('ppt/slides/slide10.xml', PPTX_SLIDE('Numeric sort check'));
  await write('sample.pptx', await pptx.generateAsync({ type: 'nodebuffer' }));

  const odt = new JSZip();
  odt.file('mimetype', 'application/vnd.oasis.opendocument.text');
  odt.file('content.xml', ODT_CONTENT);
  await write('sample.odt', await odt.generateAsync({ type: 'nodebuffer' }));

  const epub = new JSZip();
  epub.file('mimetype', 'application/epub+zip');
  epub.file('META-INF/container.xml', EPUB_CONTAINER);
  epub.file('OEBPS/chap1.xhtml', XHTML('One', '<p>First chapter on priors.</p>'));
  epub.file('OEBPS/chap2.xhtml', XHTML('Two', '<p>Second chapter on posteriors.</p>'));
  await write('sample.epub', await epub.generateAsync({ type: 'nodebuffer' }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['cohort', 'effect', 'n'],
    ['A', 0.42, 120],
    ['B', 0.37, 88],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  await write('sample.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  await write('sample.csv', 'cohort,effect,n\nA,0.42,120\nB,0.37,88\n');
  await write('sample.html', '<!doctype html><html><head><title>t</title><script>var ignored = 1;</script><style>.x{}</style></head><body><h1>Survey of methods</h1><p>Baseline models underperform.</p></body></html>');
  await write('sample.json', JSON.stringify({ trials: [{ arm: 'control', n: 30 }, { arm: 'treatment', n: 32 }] }));
  await write('sample.txt', 'plain seed text with a DOI 10.1234/abc.def inside\n');
  await write('corrupt.docx', Buffer.from('this is definitely not a zip archive'));
  console.log(`fixtures written to ${outDir}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
