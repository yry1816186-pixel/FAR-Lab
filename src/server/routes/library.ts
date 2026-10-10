import http from 'node:http';
import { sendJson, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Library family (BC-002): workspace-wide literature aggregation for the library page. */

/** Library dedup key: the strongest persistent identifier a stored source
 *  carries, normalized (doi lowercased, resolver prefixes stripped). Falls
 *  back to the content hash — two records with no shared identifier and the
 *  same canonical payload are the same document; a truly unidentified record
 *  dedups only against itself. */
const IDENTIFIER_RANK = ['doi', 'arxiv', 'pubmed', 'openalex', 'url'] as const;
function libraryDedupKey(doc: { identifiers: { kind: string; value: string }[]; contentHash: string }): string {
  for (const kind of IDENTIFIER_RANK) {
    const hit = doc.identifiers.find((i) => i.kind === kind);
    if (hit === undefined) continue;
    if (kind === 'doi') {
      const norm = hit.value.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '');
      if (norm.length > 0) return `doi:${norm}`;
    }
    if (kind === 'url') {
      try {
        const u = new URL(hit.value);
        return `url:${u.host}${u.pathname.replace(/\/+$/, '')}`;
      } catch { /* fall through to the next identifier */ }
    }
    return `${kind}:${hit.value.trim().toLowerCase()}`;
  }
  return `hash:${doc.contentHash}`;
}

export function registerLibraryRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  /** GET /v1/library/sources — workspace-wide literature aggregation for the
   *  library page. Deduplicates by the strongest persistent identifier each
   *  document carries (doi > arxiv > pubmed > openalex > url), so the same
   *  paper retrieved by two studies appears once with both runIds. Pure read
   *  over stored objects — no fabrication, absent fields stay absent. */
  const librarySources = (res: http.ServerResponse): void => {
    const docs = app.store.listObjectsAcrossRuns('source_document');
    const byKey = new Map<string, { doc: (typeof docs)[number]; runIds: Set<string> }>();
    for (const doc of docs) {
      const key = libraryDedupKey(doc);
      const existing = byKey.get(key);
      if (existing !== undefined) existing.runIds.add(doc.runId);
      else byKey.set(key, { doc, runIds: new Set([doc.runId]) });
    }
    // Most-referenced first, then newest retrieval — the library's reading order.
    const entries = [...byKey.values()].sort((a, b) =>
      b.runIds.size - a.runIds.size || Date.parse(b.doc.retrievedAt) - Date.parse(a.doc.retrievedAt));
    const sources = entries.map(({ doc, runIds }) => ({
      id: doc.id,
      title: doc.title,
      publicationYear: doc.publicationYear ?? null,
      authors: doc.authors.slice(0, 6),
      authorCount: doc.authors.length,
      venue: doc.venue ?? null,
      family: doc.family,
      contentDepth: doc.contentDepth,
      accessState: doc.accessState,
      publicationType: doc.publicationType ?? null,
      identifiers: doc.identifiers,
      retrievedAt: doc.retrievedAt,
      ...(doc.retractionStatus !== undefined ? { retractionStatus: doc.retractionStatus } : {}),
      runIds: [...runIds],
    }));
    sendJson(res, 200, { sources, stored: docs.length, distinct: sources.length });
  };

  return async (req, res, _url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'library') return false;
    if (segments.length === 4 && segments[3] === 'sources' && method === 'GET') {
      librarySources(res);
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
