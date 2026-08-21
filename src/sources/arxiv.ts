import type { SourceIdentifier } from '../domain/source.js';
import type { RawRetrievalResult, RawSourceRecord, SourceAdapter } from '../shared/ports.js';
import { SourceAdapterError } from './error.js';
import { type SourceAdapterOptions, clampLimit, httpGet } from './http.js';
import { collapseXmlText } from './text.js';

/** arXiv Atom API endpoint. Must be https — the http host 301s (W0 spike §3.1). */
const DEFAULT_ENDPOINT = 'https://export.arxiv.org/api/query';
/** arXiv asks clients for >=3s between requests; module-level clock enforces it per process. */
const DEFAULT_MIN_INTERVAL_MS = 3_100;
const USER_AGENT = 'FAR-Lab/0.1 (compatible; farlab source adapter)';

export interface ArxivAdapterOptions extends SourceAdapterOptions {
  endpoint?: string;
  /** Politeness floor between requests from this process. 0 disables (unit tests). */
  minIntervalMs?: number;
}

export interface ArxivEntry {
  arxiv_id: string;
  version: string | null;
  atom_id: string;
  title: string | null;
  abstract: string | null;
  published: string | null;
  updated: string | null;
  doi: string | null;
  primary_category: string | null;
  categories: string[];
  authors: string[];
  pdf_url: string | null;
  landing_url: string | null;
  comment: string | null;
}

export interface ArxivFeed {
  totalResults: number;
  entries: ArxivEntry[];
}

/**
 * Regex-based Atom parsing (zero third-party XML deps), ported from the W0 spike probe.
 * Lenient per entry, strict at feed level (caller checks for a <feed> root first).
 */
export const parseArxivAtom = (xml: string): ArxivFeed => {
  const totalResults = Number(
    xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/)?.[1] ?? 0,
  );
  const entries: ArxivEntry[] = [];
  const blocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const block of blocks) {
    const tag = (name: string): string | null => {
      const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
      return m?.[1] !== undefined ? collapseXmlText(m[1]) : null;
    };
    const links = [...block.matchAll(/<link\b([^>]*)\/?>/g)].map((m) => {
      const attrs: Record<string, string> = {};
      for (const a of m[1]?.matchAll(/([\w:-]+)="([^"]*)"/g) ?? []) attrs[a[1] as string] = a[2] as string;
      return attrs;
    });
    const rawId = tag('id') ?? '';
    const idMatch = rawId.match(/abs\/([^v<]+?)(v\d+)?$/);
    const pdfLink = links.find((l) => l['title'] === 'pdf' || l['type'] === 'application/pdf');
    const absLink = links.find((l) => l['rel'] === 'alternate');
    const comment = block.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/);
    entries.push({
      arxiv_id: idMatch ? (idMatch[1] as string) : rawId,
      version: idMatch?.[2] ?? null,
      atom_id: rawId,
      title: tag('title'),
      abstract: tag('summary'),
      published: tag('published'),
      updated: tag('updated'),
      doi: tag('arxiv:doi'),
      primary_category: block.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ?? null,
      categories: [...block.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1] as string),
      authors: [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map(
        (m) => collapseXmlText(m[1] as string),
      ),
      pdf_url: pdfLink?.['href'] ?? null,
      landing_url: absLink?.['href'] ?? null,
      comment: comment?.[1] !== undefined ? collapseXmlText(comment[1]) : null,
    });
  }
  return { totalResults: Number.isFinite(totalResults) ? totalResults : 0, entries };
};

const yearFrom = (isoDate: string | null): number | undefined => {
  const y = Number(isoDate?.slice(0, 4));
  return Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : undefined;
};

const mapEntry = (e: ArxivEntry): RawSourceRecord | undefined => {
  if (!e.arxiv_id) return undefined; // no persistent key to anchor the record
  const identifiers: SourceIdentifier[] = [{ kind: 'arxiv', value: e.arxiv_id }];
  if (e.doi) identifiers.push({ kind: 'doi', value: e.doi });
  const abstractText = e.abstract ?? undefined;
  return {
    identifiers,
    title: e.title ?? '',
    publicationYear: yearFrom(e.published),
    authors: e.authors,
    venue: 'arXiv',
    abstractText,
    // arXiv abstracts are near-universal; preprints are open access with direct PDFs
    // (spike §3: abstract 3/3, PDF 200 application/pdf) — verified, not assumed.
    contentDepth: abstractText !== undefined ? 'abstract' : 'metadata_only',
    accessState: 'open',
    oaUrl: e.landing_url ?? undefined,
    fullTextUrl: e.pdf_url ?? undefined,
    normalized: e, // parsed entry (includes version — v1/v2 are distinct snapshots), pre-exclusion
  };
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Per-process politeness clock shared by every arXiv adapter instance. */
let lastRequestAt = 0;

export const createArxivAdapter = (opts: ArxivAdapterOptions = {}): SourceAdapter => {
  const family = 'arxiv' as const;
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

  const throttle = async (): Promise<void> => {
    if (minIntervalMs <= 0) return;
    const waitMs = lastRequestAt === 0 ? 0 : lastRequestAt + minIntervalMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    lastRequestAt = Date.now();
  };

  const fetchAtom = async (url: string, query: string) => {
    await throttle();
    const res = await httpGet(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { 'User-Agent': USER_AGENT },
      context: { family, query },
    });
    if (res.status !== 200) {
      throw new SourceAdapterError({
        family, query, kind: 'http_status', httpStatus: res.status,
        message: `arXiv API failed`, url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    // Feed-level strictness: an HTML error page must fail visibly, not parse to 0 entries.
    if (!/<feed[\s>]/.test(res.bodyText.slice(0, 4_096))) {
      throw new SourceAdapterError({
        family, query, kind: 'parse', httpStatus: res.status,
        message: 'response is not an Atom feed', url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    return res;
  };

  const search = async (
    query: string,
    so?: { limit?: number },
  ): Promise<RawRetrievalResult> => {
    const q = query.trim();
    if (!q) {
      throw new SourceAdapterError({
        family, query, kind: 'invalid_query', httpStatus: 0, message: 'empty query',
      });
    }
    const maxResults = clampLimit(so?.limit, 10, 100);
    // Tokenized AND query by default — spike §3.1: exact phrase `all:"..."` matched 0.
    const searchQuery = q.split(/\s+/).map((t) => `all:${t}`).join(' AND ');
    const url = `${endpoint}?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
    const res = await fetchAtom(url, q);
    const feed = parseArxivAtom(res.bodyText);
    const records: RawSourceRecord[] = [];
    for (const entry of feed.entries) {
      const record = mapEntry(entry);
      if (record !== undefined) records.push(record);
    }
    return { family, query: q, httpStatus: res.status, records, latencyMs: res.latencyMs };
  };

  const resolve = async (
    identifier: SourceIdentifier,
  ): Promise<{ found: boolean; record?: RawSourceRecord; httpStatus: number }> => {
    const value = identifier.value.trim();
    let id: string | undefined;
    if (identifier.kind === 'arxiv') {
      id = value;
    } else if (identifier.kind === 'url') {
      id = value.match(/^https?:\/\/arxiv\.org\/abs\/([^/?#\s]+)/i)?.[1];
    }
    if (!id) {
      throw new SourceAdapterError({
        family, query: `${identifier.kind}:${identifier.value}`, kind: 'unsupported_identifier',
        httpStatus: 0,
        message: `arXiv resolves arxiv(/abs-url) identifiers, got kind '${identifier.kind}'`,
      });
    }
    const url = `${endpoint}?id_list=${encodeURIComponent(id)}&max_results=1`;
    const res = await fetchAtom(url, `arxiv:${id}`);
    const entry = parseArxivAtom(res.bodyText).entries[0];
    // arXiv signals malformed id_list with a 200 + <title>Error</title> entry.
    const record = entry !== undefined && entry.title !== 'Error' ? mapEntry(entry) : undefined;
    if (record === undefined) return { found: false, httpStatus: res.status };
    return { found: true, record, httpStatus: res.status };
  };

  return { family, search, resolve };
};
