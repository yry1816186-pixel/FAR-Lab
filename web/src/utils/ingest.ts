/**
 * R1 entry upgrade — paste/drop recognition and source ingestion, all client
 * side. Every recognizer maps to a REAL downstream capability: recognized
 * citations/document text become SEEDS the server stores as provenance-marked
 * user_provided source documents (POST /runs seeds[]), not decorations.
 *
 * Reuse-first (PLAN-reuse-adoption): PDF text extraction = pdfjs-dist
 * (Mozilla's official dist, Apache-2.0 — unpdf's serverless build proved to
 * require pdfjs-dist as a peer in browsers anyway, so we use the source);
 * BibTeX/RIS parsing = citation-js (MIT, CSL-JSON normalization). Zotero =
 * documented local REST (no client lib — the official one is AGPL).
 * Office/web/data formats (2026-08-23): mammoth (docx), SheetJS (xlsx/csv/
 * ods), jszip + DOMParser (pptx/odt/odp/epub) — all dynamically imported.
 */

export interface SeedInput {
  title?: string;
  identifiers?: { kind: 'doi' | 'arxiv' | 'url'; value: string }[];
  text?: string;
  year?: number;
  authors?: string[];
}

/** Per-run seed cap (client-side; the server only caps per-seed text length). */
export const MAX_SEEDS = 50;

export type PasteKind = 'doi' | 'arxiv' | 'url' | 'bibtex' | 'ris' | 'plain';

const DOI_RE = /\b10\.\d{4,9}\/[^\s"<>]+/i;
const ARXIV_RE = /\b(\d{4}\.\d{4,5})(v\d+)?\b/;
const RIS_RE = /^TY {1,2}- /m;

/** Classify pasted/dropped TEXT into an ingestion route (never guesses silently). */
export function detectPasteKind(text: string): PasteKind {
  const t = text.trim();
  if (t.startsWith('@')) return 'bibtex';
  if (RIS_RE.test(t)) return 'ris';
  if (DOI_RE.test(t)) return 'doi';
  if (/^https?:\/\/\S+$/i.test(t)) return 'url';
  if (/^arxiv:\s*\d{4}\.\d{4,5}/i.test(t) || (ARXIV_RE.test(t) && t.length < 40)) return 'arxiv';
  return 'plain';
}

export function extractDoi(text: string): string | null {
  const m = text.match(DOI_RE);
  return m === null ? null : m[0].replace(/[.,;)]+$/, '');
}

export function extractArxivId(text: string): string | null {
  const m = text.match(ARXIV_RE);
  return m === null ? null : m[1] ?? null;
}

const URL_RE = /^https?:\/\/\S+$/i;
const ARXIV_EXACT_RE = /^\d{4}\.\d{4,5}(v\d+)?$/;

export interface ExtractedIdentifier {
  kind: 'doi' | 'arxiv' | 'url';
  value: string;
}

/**
 * Batch identifier extraction: split pasted/dropped text on whitespace and
 * common separators (incl. CJK), recognize every DOI / arXiv id / URL.
 * `rest` carries unrecognized fragments so callers can report honestly.
 */
export function extractIdentifiers(text: string): { found: ExtractedIdentifier[]; rest: string[] } {
  const found: ExtractedIdentifier[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,，;；、\n\r\t]+/)) {
    const frag = raw.trim().replace(/^["'<(\[]+|["'>)\]]+$/g, '');
    if (frag.length === 0) continue;
    // strip a leading label before matching (doi:… / arXiv:…)
    const body = frag.replace(/^(doi:|arxiv:)\s*/i, '');
    const doi = extractDoi(body);
    const arxiv = extractArxivId(body);
    let id: ExtractedIdentifier | null = null;
    if (URL_RE.test(body)) id = { kind: 'url', value: body };
    else if (doi !== null && doi === body) id = { kind: 'doi', value: doi };
    else if (arxiv !== null && (ARXIV_EXACT_RE.test(body) || body.toLowerCase().startsWith('arxiv'))) {
      id = { kind: 'arxiv', value: arxiv };
    }
    if (id === null) { rest.push(frag); continue; }
    const key = `${id.kind}:${id.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(id);
  }
  return { found, rest };
}

/** One parsed citation entry (BibTeX/RIS) — keywords feed the relation graph. */
export interface CitationEntry {
  title: string;
  year?: number;
  authors: string[];
  doi?: string;
  keywords: string[];
}

const splitKeywords = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return [];
  return [...new Set(raw.split(/[,;/|]\s*/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 60))];
};

/**
 * Parse ALL entries from a BibTeX/RIS payload (any reference manager that
 * exports the standard formats works: EndNote, Mendeley, JabRef, Citavi…).
 * Returns null when the payload is not a recognized citation format — the
 * caller falls back honestly instead of inventing metadata.
 */
export async function parseCitationEntries(text: string): Promise<CitationEntry[] | null> {
  const kind = detectPasteKind(text);
  if (kind !== 'bibtex' && kind !== 'ris') return null;
  try {
    const { Cite } = await import('@citation-js/core');
    if (kind === 'bibtex') await import('@citation-js/plugin-bibtex');
    else await import('@citation-js/plugin-ris');
    const cite = await Cite.async(text.trim());
    const entries: CitationEntry[] = [];
    for (const first of cite.data) {
      // CSL-JSON entries are an open shape: keyword/tags live outside the core typing.
      const rec = first as Record<string, unknown>;
      const doi = first.DOI ?? undefined;
      const title = typeof first.title === 'string' ? first.title : undefined;
      const authors = Array.isArray(first.author)
        ? first.author.map((a: { given?: string; family?: string }) => [a.given, a.family].filter((x): x is string => typeof x === 'string').join(' ')).filter((n: string) => n.length > 0)
        : [];
      const year = typeof first.issued?.['date-parts']?.[0]?.[0] === 'number' ? first.issued['date-parts'][0]![0] as number : undefined;
      const keywords = splitKeywords(rec.keyword ?? rec.keywords);
      if (title === undefined && doi === undefined) continue;
      entries.push({
        title: title ?? doi ?? '',
        ...(year !== undefined ? { year } : {}),
        authors,
        ...(doi !== undefined && doi.length > 0 ? { doi } : {}),
        keywords,
      });
    }
    return entries;
  } catch {
    return null; // malformed citation text — caller falls back honestly
  }
}

/**
 * Parse a pasted citation block into a single seed (first entry).
 * Returns null when nothing title-bearing parses.
 */
export async function parseCitation(text: string): Promise<SeedInput | null> {
  const entries = await parseCitationEntries(text);
  const first = entries?.[0];
  if (first === undefined) return null;
  const seed: SeedInput = {
    title: first.title.length > 0 ? first.title : undefined,
    ...(first.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: first.doi }] } : {}),
    ...(first.authors.length > 0 ? { authors: first.authors } : {}),
    ...(first.year !== undefined ? { year: first.year } : {}),
  };
  return seed.title !== undefined || seed.identifiers !== undefined ? seed : null;
}

/** pdfjs-dist worker, lazily configured once (Vite serves the worker asset natively). */
let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsReady ??= (async (): Promise<typeof import('pdfjs-dist')> => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    return pdfjs;
  })();
  return pdfjsReady;
}

/** PDF text extraction (Mozilla pdf.js; the text layer becomes the seed's evidence text). */
export async function extractPdfText(file: File): Promise<string | null> {
  try {
    const pdfjs = await loadPdfjs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const parts: string[] = [];
    const pages = Math.min(pdf.numPages, 40); // idea seed, not a corpus dump
    for (let i = 1; i <= pages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item) parts.push(item.str);
      }
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return text.length > 0 ? text.slice(0, 50_000) : null;
  } catch {
    return null;
  }
}

/** Read a dropped/picked text file (.txt/.md/.bib/.ris) as the seed payload. */
export async function readTextFile(file: File): Promise<string | null> {
  if (file.size > 1_048_576) return null; // 1MB cap — an idea seed, not a corpus dump
  try {
    return await file.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Multi-format file analysis (2026-08-23 user directive): common office/web/
// data formats are projected to plain text and travel the same seeds pipeline
// as PDFs. All heavy parsers are dynamically imported so the main bundle
// stays lean; every failure returns honestly (null / error reason) instead of
// inventing content. Images/scans are deliberately NOT parsed here — OCR is a
// separate capability, and pretending to "analyze" a scan by ignoring it
// would be a lie.
// ---------------------------------------------------------------------------

/** Extracted-text ceiling, aligned with the server's SEED_TEXT_MAX. */
export const EXTRACT_TEXT_MAX = 50_000;
/** Binary-format ceiling (docx/xlsx/pptx/epub/odf); larger files are rejected. */
export const MAX_BINARY_BYTES = 25 * 1024 * 1024;
/** Ceiling for formats read as plain text (.html/.json). */
export const MAX_TEXTUAL_BYTES = 10 * 1024 * 1024;
/** Rows per sheet included in the spreadsheet projection (rest is dropped, honestly truncated). */
export const SHEET_ROW_LIMIT = 500;

export type FileKind =
  | 'pdf' | 'docx' | 'sheet' | 'slides' | 'odf' | 'html' | 'json' | 'epub'
  | 'text' | 'ref';

const EXT_KINDS: Record<string, FileKind> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'sheet', '.xls': 'sheet', '.csv': 'sheet', '.tsv': 'sheet', '.ods': 'sheet',
  '.pptx': 'slides',
  '.odt': 'odf', '.odp': 'odf',
  '.html': 'html', '.htm': 'html',
  '.json': 'json',
  '.epub': 'epub',
  '.txt': 'text', '.md': 'text', '.markdown': 'text',
  '.bib': 'ref', '.ris': 'ref',
};

/** Route a filename to its ingestion kind; null = genuinely unsupported. */
export function detectFileKind(fileName: string): FileKind | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT_KINDS[fileName.slice(dot).toLowerCase()] ?? null;
}

export interface Extraction {
  text: string;
  /** True when the source held more text than the projection ceiling allows. */
  truncated: boolean;
  /** 05-01 port: server-sdm = authoritative server ingest seedText (SDM stored by ref);
   * client-parse = text-only client extraction (no server route / server unreachable) -
   * renderers label it, never pretend structural parity. */
  origin?: 'server-sdm' | 'client-parse';
}

const clampText = (raw: string): Extraction => {
  // Collapse horizontal whitespace runs but PRESERVE newlines — paragraph and
  // sheet-row structure is evidence, not formatting.
  const text = raw.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > EXTRACT_TEXT_MAX
    ? { text: text.slice(0, EXTRACT_TEXT_MAX), truncated: true }
    : { text, truncated: false };
};

/** Guard: DOMParser is browser/happy-dom only; absent environments fail honestly. */
function parseXmlDom(xml: string): Document | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length > 0 ? null : doc;
}

/**
 * Collect text of elements whose localName is in `localNames` (optionally
 * constrained to one namespace), in DOCUMENT order — slide/paragraph order is
 * part of the content, not decoration.
 */
function xmlTextInOrder(doc: Document, localNames: ReadonlySet<string>, ns: string | null): string[] {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue; // elements only
      const el = child as Element;
      const nsOk = ns === null || el.namespaceURI === ns;
      if (nsOk && localNames.has(el.localName)) {
        parts.push(el.textContent ?? '');
      } else {
        walk(el);
      }
    }
  };
  walk(doc.documentElement);
  return parts;
}

/** .docx → mammoth raw text (body prose; headers/footers are not evidence text). */
async function extractDocx(file: File): Promise<string | null> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    // The browser build reads {arrayBuffer}; the Node build (used by tests)
    // reads {buffer}. Passing both keeps one isomorphic code path.
    const input: { arrayBuffer: ArrayBuffer; buffer?: Buffer } = { arrayBuffer };
    if (typeof Buffer !== 'undefined') input.buffer = Buffer.from(arrayBuffer);
    const result = await mammoth.extractRawText(input);
    return result.value;
  } catch {
    return null;
  }
}

/** .xlsx/.xls/.csv/.tsv/.ods → per-sheet tab-separated rows via SheetJS. */
async function extractSheet(file: File): Promise<string | null> {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    const blocks: string[] = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (ws === undefined || ws['!ref'] === undefined) continue;
      // Row cap: narrow the sheet's own range (Sheet2CSVOpts has no range
      // field) — the workbook is ours, local, and discarded right after.
      // FS ' | ' keeps column boundaries readable after whitespace clamping.
      const range = XLSX.utils.decode_range(ws['!ref'] as string);
      range.e.r = Math.min(range.e.r, range.s.r + SHEET_ROW_LIMIT - 1);
      ws['!ref'] = XLSX.utils.encode_range(range);
      blocks.push(`[${name}]\n${XLSX.utils.sheet_to_csv(ws, { FS: ' | ', blankrows: false })}`);
    }
    return blocks.join('\n\n');
  } catch {
    return null;
  }
}

const PPTX_TEXT_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PPTX_LOCAL = new Set(['t']);

// Archive-bomb caps (FA-SEC-12), mirroring the server zip reader
// (src/ingest/zip.ts: 512 entries / 64MB per entry / 256MB total): a hostile
// archive must fail the client parse visibly, not OOM the browser tab. The
// per-entry/total sizes are the DECLARED central-directory values — jszip
// exposes them on the internal _data object; when absent (future jszip
// internals change) the entry-count cap and the downstream text caps still
// bound the damage. Residual, disclosed: docx goes through mammoth's own
// reader (only the file-size cap applies there) and pdfjs streams are bounded
// by the binary file-size cap — the zip budget below covers the jszip surface.
const ZIP_MAX_ENTRIES = 512;
const ZIP_MAX_ENTRY_UNCOMPRESSED = 64 * 1024 * 1024;
const ZIP_MAX_TOTAL_UNCOMPRESSED = 256 * 1024 * 1024;

interface ZipEntryLike {
  dir: boolean;
  _data?: { uncompressedSize?: unknown };
}
interface ZipLike {
  files: Record<string, ZipEntryLike>;
}

/** Throws when the archive's declared shape busts the bomb budget. */
export function assertZipEntryBudget(zip: unknown): void {
  if (zip === null || typeof zip !== 'object') return; // nothing inspectable — downstream caps apply
  const files = (zip as ZipLike).files;
  if (files === null || typeof files !== 'object') return; // nothing inspectable — downstream caps apply
  const entries = Object.values(files).filter((e) => !e.dir);
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw new Error(`archive declares ${entries.length} entries (cap ${ZIP_MAX_ENTRIES})`);
  }
  let total = 0;
  for (const entry of entries) {
    const size = entry._data?.uncompressedSize;
    if (typeof size !== 'number' || !Number.isFinite(size)) continue; // unknown declaration — count only
    if (size > ZIP_MAX_ENTRY_UNCOMPRESSED) {
      throw new Error(`archive entry declares ${(size / 1048576).toFixed(0)}MB uncompressed (cap 64MB)`);
    }
    total += size;
  }
  if (total > ZIP_MAX_TOTAL_UNCOMPRESSED) {
    throw new Error(`archive declares ${(total / 1048576).toFixed(0)}MB total uncompressed (cap 256MB)`);
  }
}

/** .pptx → per-slide text runs (`<a:t>` in ppt/slides/slideN.xml). */
async function extractPptx(file: File): Promise<string | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    assertZipEntryBudget(zip);
    const slideRe = /^ppt\/slides\/slide(\d+)\.xml$/;
    const slides = Object.keys(zip.files)
      .map((p) => slideRe.exec(p))
      .filter((m): m is RegExpExecArray => m !== null)
      .sort((a, b) => Number(a[1]) - Number(b[1]));
    const parts: string[] = [];
    for (const match of slides) {
      const xml = await zip.files[`ppt/slides/slide${match[1]}.xml`]!.async('string');
      const doc = parseXmlDom(xml);
      if (doc === null) continue;
      parts.push(xmlTextInOrder(doc, PPTX_LOCAL, PPTX_TEXT_NS).join(' '));
    }
    return parts.join('\n\n');
  } catch {
    return null;
  }
}

const ODF_TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const ODF_LOCAL = new Set(['p', 'h']);

/** .odt/.odp → paragraph/heading text from content.xml. */
async function extractOdf(file: File): Promise<string | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    assertZipEntryBudget(zip);
    const entry = zip.files['content.xml'];
    if (entry === undefined) return null;
    const doc = parseXmlDom(await entry.async('string'));
    if (doc === null) return null;
    return xmlTextInOrder(doc, ODF_LOCAL, ODF_TEXT_NS).join('\n');
  } catch {
    return null;
  }
}

function htmlToText(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of Array.from(doc.querySelectorAll('script, style, noscript, template'))) el.remove();
  return doc.body?.textContent ?? null;
}

/** .html/.htm → body text (scripts/styles stripped). */
async function extractHtml(file: File): Promise<string | null> {
  try {
    return htmlToText(await file.text());
  } catch {
    return null;
  }
}

/** .json → parsed + re-serialized (fails on malformed JSON, not silently). */
async function extractJson(file: File): Promise<string | null> {
  try {
    return JSON.stringify(JSON.parse(await file.text()), null, 1);
  } catch {
    return null;
  }
}

/** .epub → concatenated chapter text (all xhtml/html parts, in spine-neutral zip order). */
async function extractEpub(file: File): Promise<string | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    assertZipEntryBudget(zip);
    const parts = Object.keys(zip.files)
      .filter((p) => /\.(xhtml|html|htm)$/i.test(p) && !zip.files[p]!.dir)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const texts: string[] = [];
    for (const path of parts) {
      const text = htmlToText(await zip.files[path]!.async('string'));
      if (text !== null && text.trim().length > 0) texts.push(text);
      if (texts.join('\n\n').length > EXTRACT_TEXT_MAX) break; // stop early on big books
    }
    return texts.join('\n\n');
  } catch {
    return null;
  }
}

/**
 * One entry point for every non-citation file kind: size gates → format
 * parser → whitespace-normalized, capped projection. Null = parse failed or
 * nothing extractable; callers must surface that as a failure card.
 */
/** Extensions the server `text` route understands (MULTIMODAL contract; .txt rides
 * along for seed parity). Dataset files (csv/tsv/xlsx) stay client-parsed here: the
 * server returns a dataset PROFILE (no seedText), a different display surface. */
const SERVER_TEXT_EXTS = new Set(['.md', '.markdown', '.tex', '.txt', '.xml', '.ipynb', '.py', '.ts', '.tsx', '.js', '.jsx']);

/**
 * 05→01 port: server-authoritative understanding for the kinds the API covers.
 * PDF → collectPdfText payload (geometry preserved); text-family → raw text.
 * Returns the SDM seedText projection, or null when this kind has no server route.
 * A failed/rejected POST is NEVER swallowed silently — the caller falls back to the
 * client parser AND stamps origin 'client-parse' so the UI labels the downgrade.
 */
async function serverIngestText(file: File, fileName: string, kind: FileKind): Promise<Extraction | null> {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  let body: Record<string, unknown> | null = null;
  if (kind === 'pdf') {
    const { collectPdfText } = await import('./pdfCollect.js');
    const payload = await collectPdfText(file);
    if (payload === null) return null;
    body = { kind: 'pdf_text', fileName, payload };
  } else if (kind === 'text' && SERVER_TEXT_EXTS.has(ext)) {
    if (file.size > 1_048_576) return null;
    body = { kind: 'text', fileName, text: await file.text() };
  } else {
    return null; // no server route for this format — client parse (labeled)
  }
  const { api } = await import('../api/client.js');
  let res: { seedText?: string; seedTextTruncated?: boolean } | null | undefined;
  try {
    res = (await api.post('/api/v1/ingest', body)) as { seedText?: string; seedTextTruncated?: boolean } | undefined;
  } catch {
    // Unreachable server (offline/node test env): fall back to the client parser.
    // The downgrade is NOT hidden — the client result is stamped origin
    // 'client-parse' and renderers label it ("text-only parse, no SDM").
    return null;
  }
  if (res === null || res === undefined || typeof res.seedText !== 'string' || res.seedText.length === 0) return null;
  return { text: res.seedText, truncated: res.seedTextTruncated === true, origin: 'server-sdm' };
}

export async function extractFileText(file: File, kind: FileKind): Promise<Extraction | null> {
  const binaryKinds: ReadonlySet<FileKind> = new Set(['pdf', 'docx', 'sheet', 'slides', 'odf', 'epub']);
  if (binaryKinds.has(kind) && file.size > MAX_BINARY_BYTES) return null;
  if (kind === 'html' || kind === 'json') {
    if (file.size > MAX_TEXTUAL_BYTES) return null;
  }
  const viaServer = await serverIngestText(file, file.name, kind);
  if (viaServer !== null) return viaServer;
  let raw: string | null;
  switch (kind) {
    case 'pdf': {
      const pdfText = await extractPdfText(file);
      raw = pdfText;
      // extractPdfText already slices at 50k; hitting the boundary means truncation.
      return pdfText === null ? null : { text: pdfText, truncated: pdfText.length >= EXTRACT_TEXT_MAX, origin: 'client-parse' };
    }
    case 'docx': raw = await extractDocx(file); break;
    case 'sheet': raw = await extractSheet(file); break;
    case 'slides': raw = await extractPptx(file); break;
    case 'odf': raw = await extractOdf(file); break;
    case 'html': raw = await extractHtml(file); break;
    case 'json': raw = await extractJson(file); break;
    case 'epub': raw = await extractEpub(file); break;
    default: return null; // text/ref have their own dedicated paths
  }
  if (raw === null || raw.trim().length === 0) return null;
  return { ...clampText(raw), origin: 'client-parse' };
}
