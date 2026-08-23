// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectFileKind, extractFileText, EXTRACT_TEXT_MAX, MAX_BINARY_BYTES,
  type FileKind,
} from '../web/src/utils/ingest';

const fixtures = join(__dirname, 'fixtures');

/** happy-dom File satisfies the Web File subset our extractors rely on. */
async function fixtureFile(name: string): Promise<File> {
  const buf = await readFile(join(fixtures, name));
  return new File([buf], name, { type: 'application/octet-stream' });
}

const extract = async (name: string, kind: FileKind) => extractFileText(await fixtureFile(name), kind);

describe('detectFileKind', () => {
  it('routes every supported extension (case-insensitive)', () => {
    for (const [name, kind] of [
      ['a.pdf', 'pdf'], ['a.DOCX', 'docx'], ['a.xlsx', 'sheet'], ['a.xls', 'sheet'],
      ['a.csv', 'sheet'], ['a.tsv', 'sheet'], ['a.ods', 'sheet'], ['a.pptx', 'slides'],
      ['a.odt', 'odf'], ['a.odp', 'odf'], ['a.html', 'html'], ['a.htm', 'html'],
      ['a.json', 'json'], ['a.epub', 'epub'], ['a.txt', 'text'], ['a.md', 'text'],
      ['a.bib', 'ref'], ['a.ris', 'ref'],
    ] as const) {
      expect(detectFileKind(name), name).toBe(kind);
    }
  });

  it('rejects unknown and extensionless names honestly', () => {
    expect(detectFileKind('photo.png')).toBeNull();
    expect(detectFileKind('scan.jpg')).toBeNull();
    expect(detectFileKind('archive.zip')).toBeNull();
    expect(detectFileKind('noext')).toBeNull();
    expect(detectFileKind('file.docx.exe')).toBeNull(); // last extension wins → rejected
  });
});

describe('extractFileText — per-format projection', () => {
  it('docx: extracts paragraph prose via mammoth', async () => {
    const out = await extract('sample.docx', 'docx');
    expect(out).not.toBeNull();
    expect(out!.text).toContain('Hypothesis A wins under measurement noise.');
    expect(out!.text).toContain('Counter-evidence: the sample size is small.');
    expect(out!.truncated).toBe(false);
  });

  it('xlsx: per-sheet header + pipe-separated rows via SheetJS', async () => {
    const out = await extract('sample.xlsx', 'sheet');
    expect(out).not.toBeNull();
    expect(out!.text).toContain('[Data]');
    expect(out!.text).toContain('cohort | effect | n');
    expect(out!.text).toContain('A | 0.42 | 120');
  });

  it('csv: parsed through the same sheet path', async () => {
    const out = await extract('sample.csv', 'sheet');
    expect(out).not.toBeNull();
    expect(out!.text).toContain('A | 0.42 | 120');
  });

  it('pptx: slide text in numeric order (slide10 after slide2)', async () => {
    const out = await extract('sample.pptx', 'slides');
    expect(out).not.toBeNull();
    expect(out!.text).toContain('Study design overview');
    expect(out!.text.indexOf('Threats to validity')).toBeLessThan(out!.text.indexOf('Numeric sort check'));
  });

  it('odt: paragraphs and nested spans from content.xml', async () => {
    const out = await extract('sample.odt', 'odf');
    expect(out).not.toBeNull();
    expect(out!.text).toContain('Effect size pooling across three cohorts.');
    expect(out!.text).toContain('nested span');
  });

  it('html: body text only, script/style stripped', async () => {
    const out = await extract('sample.html', 'html');
    expect(out).not.toBeNull();
    expect(out!.text).toContain('Survey of methods');
    expect(out!.text).toContain('Baseline models underperform.');
    expect(out!.text).not.toContain('ignored');
  });

  it('json: parsed and re-serialized (malformed fails, not silently)', async () => {
    const ok = await extract('sample.json', 'json');
    expect(ok).not.toBeNull();
    expect(ok!.text).toContain('"treatment"');
    const bad = new File(['{not json'], 'bad.json');
    expect(await extractFileText(bad, 'json')).toBeNull();
  });

  it('epub: chapters concatenated', async () => {
    const out = await extract('sample.epub', 'epub');
    expect(out).not.toBeNull();
    expect(out!.text).toContain('First chapter on priors.');
    expect(out!.text).toContain('Second chapter on posteriors.');
  });

  it('corrupt binary fails honestly (null, not garbage)', async () => {
    const out = await extract('corrupt.docx', 'docx');
    expect(out).toBeNull();
  });
});

describe('extractFileText — caps and honesty', () => {
  it('clamps at EXTRACT_TEXT_MAX and reports truncation', async () => {
    const big = new File([`{"k":"${'x'.repeat(120_000)}"}`], 'big.json');
    const out = await extractFileText(big, 'json');
    expect(out).not.toBeNull();
    expect(out!.text.length).toBe(EXTRACT_TEXT_MAX);
    expect(out!.truncated).toBe(true);
  });

  it('rejects binaries over MAX_BINARY_BYTES before parsing', async () => {
    const huge = new File([new Uint8Array(MAX_BINARY_BYTES + 1)], 'huge.docx');
    expect(await extractFileText(huge, 'docx')).toBeNull();
  });
});
