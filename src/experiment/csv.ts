/**
 * RFC4180 CSV parsing for the dataset layer (E2). Zero dependencies by design
 * (zod-only runtime invariant). Handles quoted fields, embedded commas/quotes and
 * CRLF; fails closed on malformed rows (uneven field counts) rather than guessing.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

const FIELD_MAX = 10_000;

/** Tokenize ONE CSV line (shared by the CSV parser and the ARFF data-section reader). */
export const tokenizeCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '' && !fieldStarted) { inQuotes = true; fieldStarted = true; i += 1; continue; }
    if (ch === ',') { fields.push(field); field = ''; fieldStarted = false; i += 1; continue; }
    field += ch; fieldStarted = true; i += 1;
  }
  fields.push(field);
  if (fields.length > FIELD_MAX) throw new Error(`csv row exceeds ${FIELD_MAX} fields`);
  return fields;
};

/** Minimal CSV serialization: quotes only where required (comma/quote/newline present). */
export const csvStringifyRow = (fields: string[]): string =>
  fields.map((f) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(',');

export const parseCsv = (text: string, opts: { maxRows?: number } = {}): ParsedCsv => {
  const maxRows = opts.maxRows ?? 500_000;
  const rows: string[][] = [];
  let sawAny = false;
  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    if (rawLine === '') continue;
    const fields = tokenizeCsvLine(rawLine);
    sawAny = true;
    rows.push(fields);
    if (rows.length > maxRows) throw new Error(`csv exceeds maxRows=${maxRows}`);
  }
  if (!sawAny) throw new Error('csv has no rows');
  const header = rows[0];
  if (header === undefined) throw new Error('csv has no rows');
  if (header.some((h) => h === '')) throw new Error('csv header contains empty column names');
  const body = rows.slice(1);
  if (body.length === 0) throw new Error('csv has a header but no data rows');
  for (let r = 0; r < body.length; r += 1) {
    const rowVals = body[r];
    if (rowVals === undefined) throw new Error(`csv row ${r + 2} missing`);
    if (rowVals.length !== header.length) {
      throw new Error(`csv row ${r + 2} has ${rowVals.length} fields, header has ${header.length}`);
    }
  }
  return { header, rows: body };
};

/**
 * Streaming row analysis (FA-DAT-01): one readline pass over a CSV FILE collecting
 * exactly what dataset acquisition and split allocation need — header, row count,
 * and the values of the split-relevant columns (target, optional group). Memory is
 * bounded by the named columns and maxRows, never by file size. Fail-closed
 * semantics mirror parseCsv line-for-line (same error classes in read order), so
 * a file that streams must parse identically and vice versa.
 */
export interface CsvFileStats {
  header: string[];
  nRows: number;
  targetValues: string[];
  groupValues: string[] | null;
}

export const analyzeCsvFile = async (
  filePath: string,
  opts: { targetColumn: string; groupColumn?: string; maxRows?: number },
): Promise<CsvFileStats> => {
  const maxRows = opts.maxRows ?? 500_000;
  const lines = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity, // treats \r\n as one break, matching parseCsv's /\r\n|\n|\r/
  });

  let header: string[] | null = null;
  let targetIdx = -1;
  let groupIdx = -1;
  let nRows = 0;
  // Column-value interning: a fresh tokenizer string per field would materialize one
  // string object per row (≈1GB of strings for a 22M-row CSV); split logic only needs
  // VALUE EQUALITY, so repeated labels collapse to shared instances (FA-DAT-01).
  const intern = new Map<string, string>();
  const canon = (s: string): string => {
    const seen = intern.get(s);
    if (seen !== undefined) return seen;
    intern.set(s, s);
    return s;
  };
  const targetValues: string[] = [];
  const groupValues: string[] = [];
  try {
    for await (const line of lines) {
      const rawLine = String(line);
      if (rawLine === '') continue;
      const fields = tokenizeCsvLine(rawLine);
      if (header === null) {
        header = fields;
        if (header.some((h) => h === '')) throw new Error('csv header contains empty column names');
        targetIdx = header.indexOf(opts.targetColumn);
        if (targetIdx < 0) {
          throw new Error(`target column '${opts.targetColumn}' not in dataset header [${header.join(', ')}]`);
        }
        groupIdx = opts.groupColumn !== undefined ? header.indexOf(opts.groupColumn) : -1;
        if (opts.groupColumn !== undefined && groupIdx < 0) {
          throw new Error(`group column '${opts.groupColumn}' not in dataset header [${header.join(', ')}]`);
        }
        continue;
      }
      if (fields.length !== header.length) {
        throw new Error(`csv row ${nRows + 2} has ${fields.length} fields, header has ${header.length}`);
      }
      nRows += 1;
      targetValues.push(canon(String(fields[targetIdx] ?? '')));
      groupValues.push(canon(String(fields[groupIdx] ?? '')));
      if (nRows > maxRows) throw new Error(`csv exceeds maxRows=${maxRows}`);
    }
  } finally {
    lines.close();
  }
  if (header === null) throw new Error('csv has no rows');
  if (nRows === 0) throw new Error('csv has a header but no data rows');
  return {
    header,
    nRows,
    targetValues,
    groupValues: opts.groupColumn !== undefined ? groupValues : null,
  };
};
