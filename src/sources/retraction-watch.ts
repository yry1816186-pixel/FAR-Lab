/**
 * Offline Retraction Watch retraction table (RU-R frontier candidate 2).
 *
 * The Crossref-hosted Retraction Watch dataset (gitlab.com/crossref/
 * retraction-watch-data, updated each working day) is the curated
 * community-standard record of retractions WITH REASONS — coverage the
 * search-response signals lack: a bare arXiv-id record carries neither
 * Crossref `update-to` nor OpenAlex `is_retracted`, yet its DOI (when it has
 * one) is in this table.
 *
 * Format pinned from the dataset README (primary source, fetched 2026-08-24):
 * 20 comma-separated columns — Record ID, Title, Subject, Institution,
 * Journal, Publisher, Country, Author, URLS, ArticleType, RetractionDate,
 * RetractionDOI, RetractionPubMedID, OriginalPaperDate, OriginalPaperDOI,
 * OriginalPaperPubMedID, RetractionNature, Reason, Paywalled, Notes.
 * Lists inside a field are SEMICOLON-separated. RetractionNature draws from
 * {Retraction, Correction, Expression of concern, Reinstatement}.
 * OriginalPaperDOI may be blank or the literal 'unavailable'.
 *
 * Semantics: search-time HINT + reasons (same tier as is_retracted); the
 * resolve-time Crossref verification stays authoritative. The real dataset
 * fetch is a BLOCKED-live component (2026-08-23 no-live-API rule) — this
 * module is offline/deterministic and fixture-tested; no dataset bytes are
 * vendored into the repository.
 */

export type RetractionNature =
  | 'Retraction'
  | 'Correction'
  | 'Expression of concern'
  | 'Reinstatement'
  | 'unknown';

export interface RetractionWatchEntry {
  /** Lowercased OriginalPaperDOI — the lookup key against record identifiers. */
  readonly doi: string;
  readonly nature: RetractionNature;
  /** Semicolon-split Reason field, trimmed, empties dropped; may be empty. */
  readonly reasons: readonly string[];
  readonly retractionDate?: string;
  readonly recordId?: string;
}

export interface RetractionWatchTable {
  readonly size: number;
  /** Rows skipped because OriginalPaperDOI was blank/'unavailable'. */
  readonly skippedNoDoi: number;
  /** Rows skipped because RetractionNature did not map to a known status (never guessed). */
  readonly unrecognizedNature: number;
  get(doi: string): RetractionWatchEntry | null;
}

const NATURE_TO_STATUS = {
  Retraction: 'retracted',
  Correction: 'corrected',
  'Expression of concern': 'expression_of_concern',
  Reinstatement: 'reinstated',
} as const;

export type RetractionStatus = 'retracted' | 'corrected' | 'expression_of_concern' | 'reinstated';

/** Dataset nature → canonical status; undefined for unmapped values (never guessed). */
export const retractionStatusOfNature = (nature: RetractionNature): RetractionStatus | undefined =>
  NATURE_TO_STATUS[nature as keyof typeof NATURE_TO_STATUS];

/** Severity order for merging multi-record papers (strictest notice wins deterministically). */
const SEVERITY: readonly RetractionStatus[] = ['reinstated', 'corrected', 'expression_of_concern', 'retracted'];

/**
 * Reason classification for GRADE-floor / uncertainty-note wording.
 * Conservative: an unrecognized reason vocabulary stays 'unclassified' —
 * the honest-error vs misconduct split is never guessed. When both classes
 * appear, misconduct dominates (strictest reading of the record).
 */
export type RetractionClass = 'misconduct' | 'honest_error' | 'unclassified';

const MISCONDUCT_RE = /falsif|fabricat|plagiar|paper mill|peer review|image duplication|image manipulation|misconduct|investigation (by|into)|forg/i;
const HONEST_ERROR_RE = /^error in |mistake|contamination of (cell|reagent)/i;

export const classifyRetractionReasons = (reasons: readonly string[]): RetractionClass => {
  if (reasons.some((r) => MISCONDUCT_RE.test(r))) return 'misconduct';
  if (reasons.some((r) => HONEST_ERROR_RE.test(r))) return 'honest_error';
  return 'unclassified';
};

/* ------------------------------ RFC 4180 parser ------------------------------ */

/** Parses one CSV document into rows of fields (quotes, "" escapes, embedded commas/newlines/CRLF). */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (c === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (c === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
};

const REQUIRED_HEADERS = ['OriginalPaperDOI', 'RetractionNature', 'Reason'] as const;

/**
 * Loads the table from the dataset's CSV text. Throws an honest error when the
 * header row does not carry the documented columns (e.g. a format change) —
 * silently mis-parsing a retraction table would be worse than failing.
 * Duplicate papers (retraction + later correction notices) merge: strictest
 * nature wins, reasons union in first-seen order.
 */
export const parseRetractionWatchCsv = (csvText: string): RetractionWatchTable => {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (rows.length === 0) throw new Error('retraction-watch: empty CSV');
  const header = rows[0]!.map((h) => h.trim());
  const col = (name: string): number => header.indexOf(name);
  for (const required of REQUIRED_HEADERS) {
    if (col(required) === -1) {
      throw new Error(
        `retraction-watch: required column '${required}' missing — header is [${header.join(', ')}] ` +
          '(dataset format changed? pin against gitlab.com/crossref/retraction-watch-data README)',
      );
    }
  }
  const doiCol = col('OriginalPaperDOI');
  const natureCol = col('RetractionNature');
  const reasonCol = col('Reason');
  const dateCol = col('RetractionDate');
  const idCol = col('Record ID');

  const merged = new Map<string, { nature: RetractionNature; reasons: string[]; retractionDate?: string; recordId?: string }>();
  let skippedNoDoi = 0;
  let unrecognizedNature = 0;

  for (const r of rows.slice(1)) {
    const doi = (r[doiCol] ?? '').trim().toLowerCase();
    if (doi.length === 0 || doi === 'unavailable') {
      skippedNoDoi += 1;
      continue;
    }
    const natureRaw = (r[natureCol] ?? '').trim();
    const nature: RetractionNature =
      natureRaw === 'Retraction' || natureRaw === 'Correction' ||
      natureRaw === 'Expression of concern' || natureRaw === 'Reinstatement'
        ? natureRaw
        : 'unknown';
    if (nature === 'unknown' || retractionStatusOfNature(nature) === undefined) {
      unrecognizedNature += 1;
      continue;
    }
    const reasons = (r[reasonCol] ?? '')
      .split(';')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    const date = (r[dateCol] ?? '').trim();
    const recordId = (r[idCol] ?? '').trim();
    const existing = merged.get(doi);
    if (existing === undefined) {
      merged.set(doi, { nature, reasons, ...(date.length > 0 ? { retractionDate: date } : {}), ...(recordId.length > 0 ? { recordId } : {}) });
      continue;
    }
    // Merge a second notice for the same paper: strictest nature, union of reasons.
    const mergedStatus = retractionStatusOfNature(existing.nature)!;
    const newStatus = retractionStatusOfNature(nature)!;
    if (SEVERITY.indexOf(newStatus) > SEVERITY.indexOf(mergedStatus)) existing.nature = nature;
    for (const reason of reasons) if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
  }

  const entries = new Map<string, RetractionWatchEntry>(
    [...merged.entries()].map(([doi, e]) => [doi, Object.freeze({ doi, ...e, reasons: Object.freeze([...e.reasons]) })]),
  );
  return {
    size: entries.size,
    skippedNoDoi,
    unrecognizedNature,
    get: (doi: string) => entries.get(doi.trim().toLowerCase()) ?? null,
  };
};
