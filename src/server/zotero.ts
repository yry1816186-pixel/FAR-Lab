/**
 * Zotero local-library bridge (R1/HX): the browser page cannot call Zotero's
 * local API directly — Zotero's connector server sends no CORS headers, so a
 * page served from another origin always fails. The API server therefore
 * fetches http://127.0.0.1:23119 server-side (same machine, no CORS) and
 * returns one normalized library snapshot. Fail-visible: when Zotero is not
 * running the route surfaces 503, never a fake empty library.
 */

export interface ZoteroLibItem {
  key: string;
  title: string;
  itemType: string;
  year?: number;
  creators: string[];
  doi?: string;
  url?: string;
  /** Keyword tags (the raw material for the literature-relation graph). */
  tags: string[];
  collections: string[];
  /** Keys of items this one points at via Zotero's "related" relations. */
  relatedKeys: string[];
}

export interface ZoteroLibrary {
  items: ZoteroLibItem[];
  total: number;
  fetchedAt: string;
}

/** One researcher annotation (highlight/note) attached to a library item.
 *  Annotations are the researcher's own critical reading of a paper — first-class
 *  seed material, not decoration. `text` is the highlighted passage; `comment`
 *  is the researcher's note on it (either may be absent, never both). */
export interface ZoteroAnnotation {
  key: string;
  parentKey: string;
  type: 'highlight' | 'note' | 'image' | 'other';
  text?: string;
  comment?: string;
}

/** Zotero not running / local API not answering — the honest degradation signal. */
export class ZoteroUnavailableError extends Error {
  constructor(readonly cause: string) {
    super(`Zotero 本地服务不可用（${cause}）— 请确认 Zotero 已启动`);
    this.name = 'ZoteroUnavailableError';
  }
}

const ZOTERO_BASE = process.env.FAR_ZOTERO_BASE ?? 'http://127.0.0.1:23119';
const ZOTERO_KEY_RE = /[A-Z0-9]{8}$/;

interface RawZoteroItem {
  key?: unknown;
  meta?: { parsedDate?: unknown; creatorSummary?: unknown } | null;
  data?: {
    itemType?: unknown;
    title?: unknown;
    DOI?: unknown;
    url?: unknown;
    date?: unknown;
    creators?: { firstName?: unknown; lastName?: unknown; name?: unknown }[] | null;
    tags?: { tag?: unknown }[] | null;
    collections?: unknown;
    relations?: Record<string, unknown> | null;
  } | null;
}

const yearOf = (raw: RawZoteroItem): number | undefined => {
  const parsed = typeof raw.meta?.parsedDate === 'string' ? raw.meta.parsedDate : undefined;
  const dateStr = parsed ?? (typeof raw.data?.date === 'string' ? raw.data.date : undefined);
  if (dateStr === undefined) return undefined;
  const m = dateStr.match(/(1[89]\d{2}|20\d{2})/);
  return m === null ? undefined : Number(m[0]);
};

const relationsToKeys = (relations: Record<string, unknown> | null | undefined): string[] => {
  if (relations === null || relations === undefined) return [];
  const out: string[] = [];
  for (const value of Object.values(relations)) {
    const uris = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    for (const uri of uris) {
      if (typeof uri !== 'string') continue;
      const m = uri.match(ZOTERO_KEY_RE);
      if (m !== null) out.push(m[0]);
    }
  }
  return [...new Set(out)];
};

/**
 * Normalize one Zotero API item. Exported for tests; returns null for items
 * the literature surfaces must never show (notes, attachments, empty titles).
 */
export function normalizeZoteroItem(raw: RawZoteroItem): ZoteroLibItem | null {
  if (typeof raw.key !== 'string' || raw.key.length === 0) return null;
  const d = raw.data;
  if (d === null || d === undefined) return null;
  if (d.itemType === 'note' || d.itemType === 'attachment') return null;
  if (typeof d.title !== 'string' || d.title.trim().length === 0) return null;
  const year = yearOf(raw);
  const creators = Array.isArray(d.creators)
    ? d.creators
      .map((c) => (typeof c.name === 'string' && c.name.length > 0
        ? c.name
        : [c.firstName, c.lastName].filter((x): x is string => typeof x === 'string' && x.length > 0).join(' ')))
      .filter((s) => s.length > 0)
    : [];
  const tags = Array.isArray(d.tags)
    ? d.tags.map((t) => (typeof t?.tag === 'string' ? t.tag.trim() : '')).filter((s) => s.length > 0)
    : [];
  return {
    key: raw.key,
    title: d.title.trim(),
    itemType: typeof d.itemType === 'string' ? d.itemType : 'journalArticle',
    ...(year !== undefined ? { year } : {}),
    creators,
    ...(typeof d.DOI === 'string' && d.DOI.length > 0 ? { doi: d.DOI } : {}),
    ...(typeof d.url === 'string' && d.url.length > 0 ? { url: d.url } : {}),
    tags: [...new Set(tags)],
    collections: Array.isArray(d.collections)
      ? d.collections.filter((c): c is string => typeof c === 'string')
      : [],
    relatedKeys: relationsToKeys(d.relations),
  };
}

export interface ZoteroFetchOptions {
  /** Override the Zotero base URL (tests point this at a fixture server). */
  base?: string;
  /** Page size for the pagination loop (Zotero caps at 100). */
  pageSize?: number;
  /** Hard ceiling so a pathological library can never hang the request. */
  maxItems?: number;
  signal?: AbortSignal;
}

/**
 * Pull the whole top-level library through the local REST API (paginated),
 * normalize every item, and resolve relation URIs to library keys.
 */
export async function fetchZoteroLibrary(opts: ZoteroFetchOptions = {}): Promise<ZoteroLibrary> {
  const base = opts.base ?? ZOTERO_BASE;
  const pageSize = Math.min(Math.max(opts.pageSize ?? 100, 1), 100);
  const maxItems = opts.maxItems ?? 5000;
  const items: ZoteroLibItem[] = [];
  let total: number | null = null;

  for (let start = 0; start < maxItems; start += pageSize) {
    const url = `${base}/api/users/0/items/top?format=json&limit=${pageSize}&start=${start}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      throw new ZoteroUnavailableError(e instanceof Error ? e.message : String(e));
    }
    if (!res.ok) {
      throw new ZoteroUnavailableError(`HTTP ${res.status}`);
    }
    if (total === null) {
      const headerTotal = Number(res.headers.get('Total-Results'));
      total = Number.isFinite(headerTotal) && headerTotal >= 0 ? headerTotal : null;
    }
    let page: unknown;
    try {
      page = await res.json();
    } catch {
      throw new ZoteroUnavailableError('non-JSON response');
    }
    if (!Array.isArray(page)) throw new ZoteroUnavailableError('unexpected payload shape');
    for (const raw of page) {
      if (typeof raw !== 'object' || raw === null) continue;
      const item = normalizeZoteroItem(raw as RawZoteroItem);
      if (item !== null) items.push(item);
    }
    if (page.length < pageSize) break; // last page reached
    if (total !== null && items.length >= total) break;
  }

  // Relation targets that survive normalization are resolvable; drop dangling refs.
  const keySet = new Set(items.map((i) => i.key));
  for (const item of items) {
    if (item.relatedKeys.length > 0) item.relatedKeys = item.relatedKeys.filter((k) => keySet.has(k));
  }
  return { items, total: total ?? items.length, fetchedAt: new Date().toISOString() };
}

interface RawZoteroAnnotation {
  key?: unknown;
  data?: {
    annotationType?: unknown;
    annotationText?: unknown;
    annotationComment?: unknown;
    parentItem?: unknown;
  } | null;
}

const ANNOTATION_TYPES = ['highlight', 'note', 'image'] as const;

/** Normalize one annotation item; null for malformed/parentless entries. Exported for tests. */
export function normalizeZoteroAnnotation(raw: RawZoteroAnnotation): ZoteroAnnotation | null {
  if (typeof raw.key !== 'string' || raw.key.length === 0) return null;
  const d = raw.data;
  if (d === null || d === undefined) return null;
  // parentItem arrives as a local API path like 'users/0/items/ABCD1234'.
  const parentRaw = typeof d.parentItem === 'string' ? d.parentItem : undefined;
  const parentMatch = parentRaw !== undefined ? parentRaw.match(/([A-Z0-9]{8})$/) : null;
  const parentKey = parentMatch?.[1];
  if (parentKey === undefined) return null; // no resolvable parent -> useless as seed material
  const type = typeof d.annotationType === 'string' && (ANNOTATION_TYPES as readonly string[]).includes(d.annotationType)
    ? d.annotationType as ZoteroAnnotation['type']
    : 'other';
  const text = typeof d.annotationText === 'string' && d.annotationText.trim().length > 0 ? d.annotationText.trim() : undefined;
  const comment = typeof d.annotationComment === 'string' && d.annotationComment.trim().length > 0 ? d.annotationComment.trim() : undefined;
  if (text === undefined && comment === undefined) return null; // empty annotation
  return {
    key: raw.key,
    parentKey,
    type,
    ...(text !== undefined ? { text } : {}),
    ...(comment !== undefined ? { comment } : {}),
  };
}

export interface ZoteroAnnotationsResult {
  annotations: ZoteroAnnotation[];
  total: number;
  fetchedAt: string;
}

/** Pull every annotation in the library (paginated, same local API + fail-visible rules). */
export async function fetchZoteroAnnotations(opts: ZoteroFetchOptions = {}): Promise<ZoteroAnnotationsResult> {
  const base = opts.base ?? ZOTERO_BASE;
  const pageSize = Math.min(Math.max(opts.pageSize ?? 100, 1), 100);
  const maxItems = Math.max(opts.maxItems ?? 10_000, 1);
  const annotations: ZoteroAnnotation[] = [];
  for (let start = 0; start < maxItems; start += pageSize) {
    const url = `${base}/api/users/0/items?format=json&itemType=annotation&limit=${pageSize}&start=${start}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      throw new ZoteroUnavailableError(e instanceof Error ? e.message : String(e));
    }
    if (!res.ok) throw new ZoteroUnavailableError(`HTTP ${res.status}`);
    let page: unknown;
    try {
      page = await res.json();
    } catch {
      throw new ZoteroUnavailableError('non-JSON response');
    }
    if (!Array.isArray(page)) throw new ZoteroUnavailableError('unexpected payload shape');
    for (const raw of page) {
      if (typeof raw !== 'object' || raw === null) continue;
      const a = normalizeZoteroAnnotation(raw as RawZoteroAnnotation);
      if (a !== null) annotations.push(a);
    }
    if (page.length < pageSize) break;
  }
  return { annotations, total: annotations.length, fetchedAt: new Date().toISOString() };
}
