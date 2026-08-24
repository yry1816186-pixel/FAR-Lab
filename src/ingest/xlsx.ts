import { parseXml, findAll, childrenNamed, textOf, type XmlElement } from './xml.js';
import { profileRows, type DatasetProfileDoc } from './dataset.js';
import { readZip } from './zip.js';

/**
 * XLSX supplement understanding (MULTIMODAL lane, 2026-08-24): supplementary
 * tables are overwhelmingly .xlsx in real scientific workflows. Zero new
 * runtime dependencies (repo zod-only invariant): the shared ZIP reader
 * (`zip.ts`, node:zlib inflateRaw) + the lane's own XML micro-parser on the
 * SheetML parts. Output is the SAME dsdp-1 profile as CSV/TSV uploads, so a
 * dataset enters the workspace identically regardless of container format.
 *
 * Honesty rules (inherited from the lane contract):
 * - every failure is a typed state with a precise reason, never a throw for
 *   expected outcomes, never a silently-empty profile;
 * - formula-error cells (#DIV/0! …) are preserved as literals and counted in
 *   warnings — they are research truth, not noise to scrub;
 * - unsupported constructs (zip64, exotic compression) fail loudly by name.
 */

export type XlsxProfileResult =
  | { ok: true; profile: DatasetProfileDoc }
  | { ok: false; reason: string };

/** Matches dataset ROW_LIMIT: collecting a few spare rows past the cap lets
 * profileRows set its own truncation flag instead of the reader guessing. */
const MAX_ROWS_COLLECTED = 200_005;

/** "BC7" → 54 (0-based column index); null for refs without a column part. */
const colOfRef = (ref: string): number | null => {
  const m = /^([A-Z]{1,3})/.exec(ref);
  if (m === null) return null;
  let col = 0;
  for (const ch of m[1]!) col = col * 26 + (ch.codePointAt(0)! - 64);
  return col - 1;
};

const xmlRootOf = (entries: Map<string, Buffer>, key: string): { ok: true; root: XmlElement } | { ok: false; reason: string } => {
  const raw = entries.get(key);
  if (raw === undefined) return { ok: false, reason: `xlsx part ${key} missing from the archive` };
  const parsed = parseXml(raw.toString('utf8'));
  if (parsed.status === 'error') return { ok: false, reason: `xlsx part ${key} is not well-formed XML: ${parsed.message}` };
  return { ok: true, root: parsed.root };
};

/** Shared strings: <si><t>x</t></si> or rich runs <si><r><t>a</t></r>…</si>. */
const readSharedStrings = (entries: Map<string, Buffer>): { list: string[]; problem?: string } => {
  if (!entries.has('xl/sharedStrings.xml')) return { list: [] };
  const parsed = parseXml((entries.get('xl/sharedStrings.xml') as Buffer).toString('utf8'));
  if (parsed.status === 'error') return { list: [], problem: `sharedStrings.xml is not well-formed XML: ${parsed.message}` };
  const list: string[] = [];
  for (const si of findAll(parsed.root, 'si')) {
    const direct = childrenNamed(si, 't')[0];
    if (direct !== undefined) { list.push(textOf(direct)); continue; }
    list.push(findAll(si, 't').map(textOf).join(''));
  }
  return { list };
};

interface SheetPick {
  partKey: string;
  displayName: string;
  otherSheets: string[];
  warnings: string[];
}

/** First sheet in workbook order via workbook.xml + its rels; deterministic
 *  fallback (first xl/worksheets/sheetN.xml by number) when the map is absent. */
const pickSheet = (entries: Map<string, Buffer>): SheetPick | { reason: string } => {
  const names = [...entries.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => (Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1])));
  if (names.length === 0) return { reason: 'no xl/worksheets/sheet*.xml part in the archive — not a spreadsheet' };
  const wb = xmlRootOf(entries, 'xl/workbook.xml');
  const rels = xmlRootOf(entries, 'xl/_rels/workbook.xml.rels');
  if (!wb.ok || !rels.ok) {
    return {
      partKey: names[0]!,
      displayName: names[0]!,
      otherSheets: names.slice(1),
      warnings: ['workbook.xml or its rels unreadable — profiled the first sheet part by numeric order'],
    };
  }
  const targetById = new Map<string, string>();
  for (const rel of findAll(rels.root, 'Relationship')) {
    const id = rel.attrs['Id'];
    const type = rel.attrs['Type'] ?? '';
    if (id !== undefined && type.endsWith('/worksheet')) {
      const target = (rel.attrs['Target'] ?? '').replace(/^\//, '');
      targetById.set(id, target.startsWith('xl/') ? target : `xl/${target}`);
    }
  }
  const sheetNames: Array<{ name: string; key: string }> = [];
  for (const s of findAll(wb.root, 'sheet')) {
    const name = s.attrs['name'] ?? 'sheet';
    const rid = s.attrs['r:id'] ?? s.attrs['id'];
    const key = rid !== undefined ? targetById.get(rid) : undefined;
    if (key !== undefined && entries.has(key)) sheetNames.push({ name, key });
  }
  if (sheetNames.length === 0) {
    return {
      partKey: names[0]!,
      displayName: names[0]!,
      otherSheets: names.slice(1),
      warnings: ['workbook sheet map did not resolve any worksheet part — profiled the first sheet part by numeric order'],
    };
  }
  const first = sheetNames[0]!;
  return {
    partKey: first.key,
    displayName: first.name,
    otherSheets: sheetNames.slice(1).map((s) => s.name),
    warnings: [],
  };
};

// ---------------------------------------------------------------------------
// cell grid
// ---------------------------------------------------------------------------

const readSheetRows = (sheetRoot: XmlElement, shared: string[]): { rows: string[][]; errorCells: number; danglingShared: number } => {
  const rows: string[][] = [];
  let errorCells = 0;
  let danglingShared = 0;
  const sheetData = findAll(sheetRoot, 'sheetData')[0];
  if (sheetData === undefined) return { rows, errorCells, danglingShared };
  for (const rowEl of childrenNamed(sheetData, 'row')) {
    const rowRef = Number(rowEl.attrs['r'] ?? rows.length + 1);
    // Fill row-number gaps with empty rows (writers omit empty rows entirely).
    while (rows.length < rowRef - 1 && rows.length < MAX_ROWS_COLLECTED) rows.push([]);
    if (rows.length >= MAX_ROWS_COLLECTED) break;
    const cells: string[] = [];
    let pos = 0;
    for (const c of childrenNamed(rowEl, 'c')) {
      const ref = c.attrs['r'] ?? '';
      const colIdx = colOfRef(ref);
      if (colIdx !== null) { while (pos < colIdx) { cells.push(''); pos += 1; } }
      const t = c.attrs['t'];
      const vEl = childrenNamed(c, 'v')[0];
      if (t === 'inlineStr') {
        const is = childrenNamed(c, 'is')[0];
        cells.push(is !== undefined ? findAll(is, 't').map(textOf).join('') : '');
      } else if (t === 's') {
        const idx = vEl !== undefined ? Number(textOf(vEl)) : Number.NaN;
        if (Number.isInteger(idx) && idx >= 0 && idx < shared.length) cells.push(shared[idx] ?? '');
        else { cells.push(''); danglingShared += 1; }
      } else if (t === 'b') {
        cells.push(vEl !== undefined && textOf(vEl) === '1' ? 'TRUE' : 'FALSE');
      } else if (t === 'e') {
        cells.push(vEl !== undefined ? textOf(vEl) : '#ERROR');
        errorCells += 1;
      } else {
        // default numeric ('n') and formula-string ('str'): the literal <v> text.
        cells.push(vEl !== undefined ? textOf(vEl) : '');
      }
      pos += 1;
    }
    rows.push(cells);
  }
  return { rows, errorCells, danglingShared };
};

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export const profileXlsx = (bytes: Uint8Array, fileName: string): XlsxProfileResult => {
  const buf = Buffer.from(bytes);
  const zip = readZip(buf);
  if (!zip.ok) return { ok: false, reason: zip.reason };
  const entries = zip.entries;

  const sheet = pickSheet(entries);
  if ('reason' in sheet) return { ok: false, reason: sheet.reason };
  const warnings = [...sheet.warnings];
  if (sheet.otherSheets.length > 0) {
    warnings.push(`workbook has ${sheet.otherSheets.length + 1} sheets — profiled the first ("${sheet.displayName}"); others not profiled: ${sheet.otherSheets.join(', ')}`);
  }

  const shared = readSharedStrings(entries);
  if (shared.problem !== undefined) warnings.push(shared.problem);

  const sheetXml = xmlRootOf(entries, sheet.partKey);
  if (!sheetXml.ok) return { ok: false, reason: sheetXml.reason };
  const { rows, errorCells, danglingShared } = readSheetRows(sheetXml.root, shared.list);
  if (errorCells > 0) warnings.push(`${errorCells} formula-error cells preserved as literals (e.g. #DIV/0!) — counted as present values, research truth not scrubbed`);
  if (danglingShared > 0) warnings.push(`${danglingShared} cells referenced shared strings that could not be resolved — stored as empty (missing)`);
  if (rows.length >= MAX_ROWS_COLLECTED) warnings.push('sheet row collection stopped at the profiler cap — truncation flagged by the shared dataset core');

  const profile = profileRows(rows, fileName, 'xlsx');
  if (profile.diagnostics.parseStatus === 'failed') return { ok: true, profile };
  return {
    ok: true,
    profile: {
      ...profile,
      diagnostics: { ...profile.diagnostics, warnings: [...profile.diagnostics.warnings, ...warnings] },
    },
  };
};
