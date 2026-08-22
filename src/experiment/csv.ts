/**
 * RFC4180 CSV parsing for the dataset layer (E2). Zero dependencies by design
 * (zod-only runtime invariant). Handles quoted fields, embedded commas/quotes and
 * CRLF; fails closed on malformed rows (uneven field counts) rather than guessing.
 */
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
