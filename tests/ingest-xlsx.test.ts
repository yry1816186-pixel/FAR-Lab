import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join } from 'node:path';
import { profileXlsx } from '../src/ingest/xlsx';
import { DatasetProfileDoc } from '../src/ingest/dataset';
import { ingestBytesToProfile } from '../src/ingest/service';

/**
 * XLSX supplement understanding: the real fixture (tests/fixtures/sample.xlsx,
 * SheetJS-written, stored entries, t="str" inline strings) proves the
 * container path end-to-end; a deterministic in-test zip writer builds the
 * edge cases real writers emit (deflate, sharedStrings, bool/error/inlineStr
 * cells, multi-sheet, gaps) and the corruption cases that must fail honestly.
 * All bytes are local — no network, per the 2026-08-23 directive.
 */

const SAMPLE = readFileSync(join('tests', 'fixtures', 'sample.xlsx'));

// ---------------------------------------------------------------------------
// deterministic zip writer (store + deflate, optional crafted method/zip64)
// ---------------------------------------------------------------------------

interface ZipPart {
  name: string;
  data: Buffer;
  method?: number;
  /** Write 0xFFFFFFFF size/offset markers to exercise the zip64 refusal. */
  zip64Marker?: boolean;
}

const zipWrite = (parts: ZipPart[]): Buffer => {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const nameBuf = Buffer.from(part.name, 'utf8');
    const method = part.method ?? 8;
    const stored = method === 0 ? part.data : deflateRawSync(part.data);
    const crc = crc32(part.data);
    const csizeField = part.zip64Marker === true ? 0xFFFF_FFFF : stored.length;
    const usizeField = part.zip64Marker === true ? 0xFFFF_FFFF : part.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x0403_4b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(csizeField, 18);
    local.writeUInt32LE(usizeField, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, stored);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x0201_4b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(csizeField, 20);
    cd.writeUInt32LE(usizeField, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(part.zip64Marker === true ? 0xFFFF_FFFF : offset, 42);
    central.push(cd, nameBuf);

    offset += 30 + nameBuf.length + stored.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x0605_4b50, 0);
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
};

const WORKBOOK = (sheets: Array<{ name: string; rid: string }>): string =>
  `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets>${sheets.map((s) => `<sheet name="${s.name}" sheetId="1" r:id="${s.rid}"/>`).join('')}</sheets></workbook>`;

const RELS = (rids: Array<{ rid: string; target: string }>): string =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  rids.map((r) => `<Relationship Id="${r.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${r.target}"/>`).join('') +
  `</Relationships>`;

const workbookZip = (sheetsXml: Array<{ part: string; xml: string }>, names: string[], shared?: string): Buffer =>
  zipWrite([
    { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK(names.map((n, i) => ({ name: n, rid: `rId${i + 1}` })))) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(RELS(sheetsXml.map((s, i) => ({ rid: `rId${i + 1}`, target: s.part.replace('xl/', '') })))) },
    ...(shared !== undefined ? [{ name: 'xl/sharedStrings.xml', data: Buffer.from(shared) }] : []),
    ...sheetsXml.map((s) => ({ name: s.part, data: Buffer.from(s.xml) })),
  ]);

describe('profileXlsx — real fixture (sample.xlsx, SheetJS writer, stored entries)', () => {
  it('profiles the Data sheet with exact values and types', () => {
    const r = profileXlsx(SAMPLE, 'sample.xlsx');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.profile;
    expect(DatasetProfileDoc.safeParse(p).success).toBe(true);
    expect(p.format).toBe('xlsx');
    expect(p.delimiter).toBeUndefined();
    expect(p.origin).toEqual({ kind: 'upload', name: 'sample.xlsx' });
    expect(p.rowCount).toBe(2);
    expect(p.columns.map((c) => `${c.name}:${c.inferredType}`)).toEqual(['cohort:string', 'effect:float', 'n:integer']);
    expect(p.columns[1]!.numeric).toMatchObject({ min: 0.37, max: 0.42 });
    expect(p.diagnostics.parseStatus).toBe('ok');
    // single sheet: no other-sheet warning, no error cells
    expect(p.diagnostics.warnings).toEqual([]);
    expect(p.sampleRows).toEqual([['A', '0.42', '120'], ['B', '0.37', '88']]);
  });

  it('is deterministic: identical bytes → identical profile', () => {
    const a = profileXlsx(SAMPLE, 's.xlsx');
    const b = profileXlsx(SAMPLE, 's.xlsx');
    expect(a).toEqual(b);
  });
});

describe('profileXlsx — constructed sheets (deflate entries, writer edge cells)', () => {
  const sharedXml =
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<si><t>study</t></si>` +
    `<si><r><t>rich </t></r><r><t>runs</t></r></si>` +
    `<si><t>中文表头</t></si></sst>`;

  it('resolves shared strings (incl. rich runs), inlineStr, bool, error cells, column gaps', () => {
    const sheet =
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetData>` +
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="str"><v>raw (ms)</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2"><v>42</v></c><c r="D2"><v>0.5</v></c></row>` +
      `<row r="3"><c r="A3" t="inlineStr"><is><t>inl</t></is></c><c r="B3" t="b"><v>1</v></c><c r="C3" t="e"><v>#DIV/0!</v></c></row>` +
      `</sheetData></worksheet>`;
    const buf = workbookZip([{ part: 'xl/worksheets/sheet1.xml', xml: sheet }], ['S1'], sharedXml);
    const r = profileXlsx(buf, 'edge.xlsx');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.profile;
    // header: shared(0)=study, shared(1)=rich runs, shared(2)=中文表头, raw (ms)
    expect(p.columns.map((c) => c.name)).toEqual(['study', 'rich runs', '中文表头', 'raw (ms)']);
    expect(p.columns[3]!.unitHint).toBe('ms');
    expect(p.sampleRows[0]).toEqual(['study', '', '42', '0.5']); // B2 mid-row gap cell → explicit ''
    expect(p.sampleRows[1]).toEqual(['inl', 'TRUE', '#DIV/0!']); // D3 trailing cell ABSENT → ragged row
    expect(p.rowCount).toBe(2);
    expect(p.quality.raggedRows).toBe(1); // row 3 shorter than the 4-col header; row 2 was padded to width
    expect(p.columns[3]!.missingCount).toBe(1); // absent D3 profiles as missing
    expect(p.diagnostics.warnings.join('\n')).toMatch(/1 formula-error cells preserved/);
    expect(p.diagnostics.warnings.join('\n')).toMatch(/ragged/);
    // error literal counts as a present value: 1-of-2 numeric → 'string' with
    // categorical levels (the shared core's ≥80% rule for 'mixed' not met)
    expect(p.columns[2]!.inferredType).toBe('string');
    expect(p.columns[2]!.categorical?.levels.map((l) => l.value)).toContain('#DIV/0!');
  });

  it('dangling shared-string references become honest missing cells with a warning', () => {
    const sheet =
      `<?xml version="1.0"?><worksheet><sheetData>` +
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>0</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><v>9</v></c><c r="B2"><v>1</v></c></row>` +
      `</sheetData></worksheet>`;
    const buf = workbookZip([{ part: 'xl/worksheets/sheet1.xml', xml: sheet }], ['S'], sharedXml);
    const r = profileXlsx(buf, 'dangling.xlsx');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.sampleRows[0]).toEqual(['', '1']);
    expect(r.profile.diagnostics.warnings.join('\n')).toMatch(/1 cells referenced shared strings that could not be resolved/);
  });

  it('multi-sheet workbooks profile the FIRST sheet and name the rest', () => {
    const sheetN = (n: number) =>
      `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="str"><v>h</v></c></row>` +
      `<row r="2"><c r="A2"><v>${n}</v></c></row></sheetData></worksheet>`;
    const buf = workbookZip([
      { part: 'xl/worksheets/sheet1.xml', xml: sheetN(1) },
      { part: 'xl/worksheets/sheet2.xml', xml: sheetN(2) },
      { part: 'xl/worksheets/sheet3.xml', xml: sheetN(3) },
    ], ['Primary', 'Secondary', 'Tertiary']);
    const r = profileXlsx(buf, 'multi.xlsx');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.sampleRows[0]).toEqual(['1']);
    expect(r.profile.diagnostics.warnings.join('\n')).toMatch(/3 sheets — profiled the first \("Primary"\).*Secondary, Tertiary/);
  });

  it('row-number gaps keep row order; fully-empty gap rows drop (CSV-consistent semantics)', () => {
    const sheet =
      `<?xml version="1.0"?><worksheet><sheetData>` +
      `<row r="1"><c r="A1" t="str"><v>h</v></c></row>` +
      `<row r="4"><c r="A4"><v>7</v></c></row>` +
      `</sheetData></worksheet>`;
    const buf = workbookZip([{ part: 'xl/worksheets/sheet1.xml', xml: sheet }], ['S']);
    const r = profileXlsx(buf, 'gaps.xlsx');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // rows 2-3 have no <row> element at all (absent, not blank) — filtered like
    // blank CSV lines; row 4 is the only body row, order preserved after r=1.
    expect(r.profile.rowCount).toBe(1);
    expect(r.profile.sampleRows).toEqual([['7']]);
  });
});

describe('profileXlsx — corruption honesty (typed failures, never fake profiles)', () => {
  it('not a zip / truncated zip / truncated real file', () => {
    const notZip = profileXlsx(Buffer.from('this is definitely not a zip file at all'), 'a.xlsx');
    expect(notZip.ok).toBe(false);
    if (notZip.ok) return;
    expect(notZip.reason).toMatch(/end-of-central-directory/);

    const truncated = profileXlsx(SAMPLE.subarray(0, 100), 'b.xlsx');
    expect(truncated.ok).toBe(false);
  });

  it('unsupported compression method and zip64 markers are refused by name', () => {
    const sheet = '<?xml version="1.0"?><worksheet><sheetData/></worksheet>';
    const method99 = zipWrite([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet), method: 99 }]);
    const r99 = profileXlsx(method99, 'c.xlsx');
    expect(r99.ok).toBe(false);
    if (r99.ok) return;
    expect(r99.reason).toMatch(/unsupported compression method 99/);

    const zip64 = zipWrite([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet), zip64Marker: true }]);
    const r64 = profileXlsx(zip64, 'd.xlsx');
    expect(r64.ok).toBe(false);
    if (r64.ok) return;
    expect(r64.reason).toMatch(/zip64/);
  });

  it('archive without worksheet parts / malformed sheet XML are precise failures', () => {
    const noSheets = zipWrite([{ name: '[Content_Types].xml', data: Buffer.from('<Types/>') }]);
    const rn = profileXlsx(noSheets, 'e.xlsx');
    expect(rn.ok).toBe(false);
    if (rn.ok) return;
    expect(rn.reason).toMatch(/no xl\/worksheets/);

    const broken = workbookZip([{ part: 'xl/worksheets/sheet1.xml', xml: '<worksheet><oops' }], ['S']);
    const rb = profileXlsx(broken, 'f.xlsx');
    expect(rb.ok).toBe(false);
    if (rb.ok) return;
    expect(rb.reason).toMatch(/not well-formed XML/);
  });
});

describe('ingestBytesToProfile router', () => {
  it('routes xlsx/xlsm and refuses other binary kinds with a reason', () => {
    expect(ingestBytesToProfile('supp.xlsx', SAMPLE).type).toBe('dataset');
    expect(ingestBytesToProfile('supp.XLSM', SAMPLE).type).toBe('dataset');
    const refused = ingestBytesToProfile('img.png', Buffer.from([1, 2, 3]));
    expect(refused.type).toBe('refused');
    if (refused.type === 'refused') expect(refused.reason).toMatch(/unsupported binary kind/);
  });
});
