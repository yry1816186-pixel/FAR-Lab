import { z } from 'zod';
import { guessLanguage } from './parseutil.js';

/**
 * Dataset profiling (MULTIMODAL lane): CSV/TSV → typed column profiles.
 * Deterministic, zero-dependency, honest: an uploaded dataset becomes a REAL
 * research-workspace object (schema, types, missingness, unit hints, numeric
 * distribution, categorical levels, significance notation flags, sample rows),
 * not "file uploaded". The parser is RFC4180-disciplined (quoted fields,
 * escaped quotes, embedded newlines, CRLF) and reports its own degradation.
 */

export const ColumnType = z.enum(['integer', 'float', 'boolean', 'date_iso', 'string', 'mixed', 'empty']);
export type ColumnType = z.infer<typeof ColumnType>;

export const ColumnProfile = z.object({
  name: z.string(),
  index: z.number().int().nonnegative(),
  inferredType: ColumnType,
  rowCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  missingFraction: z.number().min(0).max(1),
  uniqueCount: z.number().int().nonnegative(),
  /** Unit hint from the header, e.g. "reaction_time (ms)" → 'ms'. Deterministic. */
  unitHint: z.string().optional(),
  /** Column values carry significance markers (0.42***, 0.5†) — preserved, never stripped. */
  significanceNotation: z.boolean(),
  numeric: z.object({
    min: z.number(), max: z.number(), mean: z.number(),
    median: z.number(), stddev: z.number(),
  }).optional(),
  categorical: z.object({
    levels: z.array(z.object({ value: z.string(), count: z.number().int().positive() })).max(10),
  }).optional(),
  examples: z.array(z.string()).max(3),
});
export type ColumnProfile = z.infer<typeof ColumnProfile>;

export const DatasetProfileDoc = z.object({
  schemaVersion: z.literal('dsdp-1'),
  origin: z.object({ kind: z.literal('upload'), name: z.string().min(1) }),
  format: z.enum(['csv', 'tsv']),
  delimiter: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  columns: z.array(ColumnProfile),
  /** First rows preserved for human preview (explicit, capped, never the whole file). */
  sampleRows: z.array(z.array(z.string())).max(5),
  quality: z.object({
    raggedRows: z.number().int().nonnegative(),
    emptyFile: z.boolean(),
    duplicateRowCount: z.number().int().nonnegative(),
  }),
  diagnostics: z.object({
    parseStatus: z.enum(['ok', 'partial', 'failed']),
    warnings: z.array(z.string()).default([]),
    truncated: z.boolean().default(false),
  }),
});
export type DatasetProfileDoc = z.infer<typeof DatasetProfileDoc>;

const MISSING_TOKENS = new Set(['', 'NA', 'N/A', 'n/a', 'null', 'NULL', 'NaN', 'nan', '-', 'None', '.', '缺失']);

/** RFC4180 parser: quoted fields, doubled quotes, embedded delimiters/newlines, CRLF. */
export const parseDelimited = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"' && field.length === 0) { inQuotes = true; i += 1; continue; }
    if (c === delimiter) { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { if (text[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
};

const sniffDelimiter = (name: string, text: string): { delimiter: string; format: 'csv' | 'tsv' } | null => {
  if (/\.tsv$/i.test(name)) return { delimiter: '\t', format: 'tsv' };
  if (/\.csv$/i.test(name)) return { delimiter: ',', format: 'csv' };
  const head = text.slice(0, 4000);
  const tabs = (head.match(/\t/g) ?? []).length;
  const commas = (head.match(/,/g) ?? []).length;
  if (tabs > commas && tabs > 0) return { delimiter: '\t', format: 'tsv' };
  if (commas > 0) return { delimiter: ',', format: 'csv' };
  return null;
};

const INT_RE = /^-?\d{1,15}$/;
const FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const BOOL_RE = /^(true|false|TRUE|FALSE|True|False)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(:\d{2})?)?Z?$/;
const SIG_RE = /[∗*†‡]{1,4}$/;
const NUMERIC_WITH_SIG = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[∗*†‡]{1,4}$/;

const inferColumnType = (values: string[]): { type: ColumnType; numeric: { min: number; max: number; mean: number; median: number; stddev: number } | undefined; levels: Map<string, number> | undefined } => {
  let ints = 0, floats = 0, bools = 0, dates = 0;
  const nums: number[] = [];
  const levels = new Map<string, number>();
  let nonMissing = 0;
  for (const raw of values) {
    const v = raw.trim();
    if (MISSING_TOKENS.has(v)) continue;
    nonMissing += 1;
    if (INT_RE.test(v)) { ints += 1; nums.push(Number(v)); }
    else if (FLOAT_RE.test(v)) { floats += 1; nums.push(Number(v)); }
    else if (NUMERIC_WITH_SIG.test(v)) { floats += 1; nums.push(Number((NUMERIC_WITH_SIG.exec(v) as RegExpExecArray)[1])); }
    else if (BOOL_RE.test(v)) bools += 1;
    else if (DATE_RE.test(v)) dates += 1;
    levels.set(v, (levels.get(v) ?? 0) + 1);
  }
  if (nonMissing === 0) return { type: 'empty', numeric: undefined, levels: undefined };
  if (ints + floats === nonMissing) {
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const sorted = nums.slice().sort((a, b) => a - b);
    const median = sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] as number : ((sorted[sorted.length / 2 - 1] as number) + (sorted[sorted.length / 2] as number)) / 2;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    return {
      type: ints === nonMissing ? 'integer' : 'float',
      numeric: { min: sorted[0] as number, max: sorted[sorted.length - 1] as number, mean, median, stddev: Math.sqrt(variance) },
      levels: undefined,
    };
  }
  if (bools === nonMissing) return { type: 'boolean', numeric: undefined, levels: undefined };
  if (dates === nonMissing) return { type: 'date_iso', numeric: undefined, levels: undefined };
  if (ints + floats + bools + dates >= nonMissing * 0.8) return { type: 'mixed', numeric: undefined, levels: undefined };
  return { type: 'string', numeric: undefined, levels };
};

const unitFromHeader = (header: string): string | undefined => {
  const paren = /\(([^()]{1,15})\)\s*$/.exec(header);
  if (paren !== null) return paren[1];
  const bracket = /\[([^[\]]{1,15})\]\s*$/.exec(header);
  if (bracket !== null) return bracket[1];
  return undefined;
};

const ROW_LIMIT = 200_000;

export const profileDataset = (text: string, name: string): DatasetProfileDoc => {
  const warnings: string[] = [];
  const sniff = sniffDelimiter(name, text);
  if (sniff === null) {
    return {
      schemaVersion: 'dsdp-1', origin: { kind: 'upload', name },
      format: 'csv', delimiter: ',', rowCount: 0, columnCount: 0, columns: [], sampleRows: [],
      quality: { raggedRows: 0, emptyFile: text.trim().length === 0, duplicateRowCount: 0 },
      diagnostics: { parseStatus: 'failed', warnings: ['no delimiter detected (neither , nor \\t)'], truncated: false },
    };
  }
  let rows = parseDelimited(text, sniff.delimiter);
  // Drop fully-empty trailing rows (common CRLF tail).
  rows = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (rows.length === 0) {
    return {
      schemaVersion: 'dsdp-1', origin: { kind: 'upload', name },
      format: sniff.format, delimiter: sniff.delimiter, rowCount: 0, columnCount: 0, columns: [], sampleRows: [],
      quality: { raggedRows: 0, emptyFile: true, duplicateRowCount: 0 },
      diagnostics: { parseStatus: 'failed', warnings: ['file has no data rows'], truncated: false },
    };
  }
  let truncated = false;
  if (rows.length > ROW_LIMIT) { rows = rows.slice(0, ROW_LIMIT); truncated = true; warnings.push(`row limit ${ROW_LIMIT} reached — profile covers the first ${ROW_LIMIT} rows`); }

  const header = rows[0] as string[];
  const body = rows.slice(1);
  const columnCount = header.length;
  const ragged = body.filter((r) => r.length !== columnCount).length;
  if (ragged > 0) warnings.push(`${ragged} rows have a different field count than the header (${columnCount}) — ragged cells profiled as present-only`);

  const seenRows = new Set<string>();
  let dupes = 0;
  for (const r of body) {
    const key = r.join('\u0001');
    if (seenRows.has(key)) dupes += 1;
    else seenRows.add(key);
  }

  const columns: ColumnProfile[] = [];
  for (let c = 0; c < columnCount; c += 1) {
    const values = body.map((r) => r[c] ?? '');
    const present = values.filter((v) => !MISSING_TOKENS.has(v.trim()));
    const { type, numeric, levels } = inferColumnType(values);
    const sigNotation = values.some((v) => SIG_RE.test(v.trim()) && NUMERIC_WITH_SIG.test(v.trim()));
    const headerName = (header[c] ?? `col_${c + 1}`).trim() || `col_${c + 1}`;
    columns.push({
      name: headerName,
      index: c,
      inferredType: type,
      rowCount: body.length,
      missingCount: body.length - present.length,
      missingFraction: body.length > 0 ? (body.length - present.length) / body.length : 0,
      uniqueCount: new Set(present.map((v) => v.trim())).size,
      ...(unitFromHeader(headerName) !== undefined ? { unitHint: unitFromHeader(headerName) } : {}),
      significanceNotation: sigNotation,
      ...(numeric !== undefined ? { numeric: { min: round6(numeric.min), max: round6(numeric.max), mean: round6(numeric.mean), median: round6(numeric.median), stddev: round6(numeric.stddev) } } : {}),
      ...(levels !== undefined && type === 'string'
        ? { categorical: { levels: [...levels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count })) } }
        : {}),
      examples: present.slice(0, 3),
    });
  }

  return {
    schemaVersion: 'dsdp-1',
    origin: { kind: 'upload', name },
    format: sniff.format,
    delimiter: sniff.delimiter,
    rowCount: body.length,
    columnCount,
    columns,
    sampleRows: body.slice(0, 5),
    quality: { raggedRows: ragged, emptyFile: false, duplicateRowCount: dupes },
    diagnostics: {
      parseStatus: columns.length > 0 ? 'ok' : 'failed',
      warnings,
      truncated,
    },
  };
};

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Language guess on dataset headers (zh column names are real). */
export const datasetLanguage = (doc: DatasetProfileDoc): string | undefined =>
  guessLanguage(doc.columns.map((c) => c.name).join(' '));
