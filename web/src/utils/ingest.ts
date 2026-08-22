/**
 * R1 entry upgrade — paste/drop recognition and source ingestion, all client
 * side. Every recognizer maps to a REAL downstream capability: recognized
 * citations/PDF text become SEEDS the server stores as provenance-marked
 * user_provided source documents (POST /runs seeds[]), not decorations.
 *
 * Reuse-first (PLAN-reuse-adoption): PDF text extraction = pdfjs-dist
 * (Mozilla's official dist, Apache-2.0 — unpdf's serverless build proved to
 * require pdfjs-dist as a peer in browsers anyway, so we use the source);
 * BibTeX/RIS parsing = citation-js (MIT, CSL-JSON normalization). Zotero =
 * documented local REST (no client lib — the official one is AGPL).
 */

export interface SeedInput {
  title?: string;
  identifiers?: { kind: 'doi' | 'arxiv' | 'url'; value: string }[];
  text?: string;
  year?: number;
  authors?: string[];
}

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

/**
 * Parse a .bib/.ris payload (or a pasted citation block) into a seed.
 * Returns null when nothing title-bearing parses — the caller then falls back
 * to plain-text seeding instead of inventing metadata.
 */
export async function parseCitation(text: string): Promise<SeedInput | null> {
  const kind = detectPasteKind(text);
  if (kind !== 'bibtex' && kind !== 'ris') return null;
  try {
    const { Cite } = await import('@citation-js/core');
    if (kind === 'bibtex') await import('@citation-js/plugin-bibtex');
    else await import('@citation-js/plugin-ris');
    const cite = await Cite.async(text.trim());
    const first = cite.data[0];
    if (first === undefined) return null;
    const doi = first.DOI ?? undefined;
    const seed: SeedInput = {
      title: typeof first.title === 'string' ? first.title : undefined,
      ...(doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: doi }] } : {}),
      ...(first.author !== undefined && Array.isArray(first.author) && first.author.length > 0
        ? { authors: first.author.map((a: { given?: string; family?: string }) => [a.given, a.family].filter((x): x is string => typeof x === 'string').join(' ')).filter((n: string) => n.length > 0) }
        : {}),
      ...(typeof first.issued?.['date-parts']?.[0]?.[0] === 'number'
        ? { year: first.issued['date-parts'][0]![0] as number }
        : {}),
    };
    return seed.title !== undefined || seed.identifiers !== undefined ? seed : null;
  } catch {
    return null; // malformed citation text — caller falls back honestly
  }
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

export interface ZoteroItem {
  key: string;
  title: string;
  itemType: string;
  year?: number;
  creators?: string[];
  doi?: string;
}

/**
 * Zotero local API (http://localhost:23119/api/). No client library: the
 * official zotero-api-node is AGPL and targets the remote web API; the local
 * REST surface is documented and needs ~30 lines. Returns null when Zotero
 * is not running (the honest degradation path — never a fake empty library).
 */
export async function fetchZoteroItems(signal: AbortSignal): Promise<ZoteroItem[] | null> {
  const userID = await (async (): Promise<number | null> => {
    try {
      const res = await fetch('http://localhost:23119/api/users/0', { signal });
      if (!res.ok) return null;
      return 0;
    } catch {
      return null;
    }
  })();
  if (userID === null) return null;
  try {
    const res = await fetch(`http://localhost:23119/api/users/${userID}/items/top?format=json&limit=25&sort=dateModified&direction=desc`, { signal });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    const items: ZoteroItem[] = [];
    for (const raw of data) {
      if (typeof raw !== 'object' || raw === null) continue;
      const d = raw as { key?: string; data?: { title?: string; itemType?: string; DOI?: string; date?: string; creators?: { firstName?: string; lastName?: string; name?: string }[] } };
      if (d.data?.itemType === 'note' || d.data?.itemType === 'attachment') continue;
      if (typeof d.key !== 'string' || typeof d.data?.title !== 'string') continue;
      const yearMatch: RegExpMatchArray | null = d.data.date?.match(/(1[89]\d{2}|20\d{2})/) ?? null;
      items.push({
        key: d.key,
        title: d.data.title,
        itemType: d.data.itemType ?? 'journalArticle',
        ...(yearMatch !== null ? { year: Number(yearMatch[0]) } : {}),
        ...(d.data.creators !== undefined
          ? { creators: d.data.creators.map((c) => c.name ?? [c.firstName, c.lastName].filter(Boolean).join(' ')).filter((s) => s.length > 0) }
          : {}),
        ...(typeof d.data.DOI === 'string' && d.data.DOI.length > 0 ? { doi: d.data.DOI } : {}),
      });
    }
    return items;
  } catch {
    return null;
  }
}
