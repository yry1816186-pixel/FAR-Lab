/**
 * retrieval/adapters/arxiv — arXiv preprint server retrieval adapter.
 *
 * arXiv is the canonical preprint repository (physics/math/CS/q-bio/q-fin/econ/
 * stat). Free Atom 1.0 API, no key. This is the primary source for preprints
 * (papers that may not yet have a DOI). Rate limit: arXiv asks ≤3 req/s.
 *
 * Docs: https://info.arxiv.org/help/api/index.html
 * Endpoint: http://export.arxiv.org/api/query?search_query=all:<q>&max_results=<n>
 *
 * XML note: arXiv returns Atom XML (no JSON option). The parser below is a
 * focused, fail-closed Atom-entry extractor — it does NOT depend on a general
 * XML library (no extra dependency; §6). It splits the feed into <entry>
 * blocks and extracts the known field set with non-greedy regexes, unescaping
 * the standard XML entities. Malformed entries are skipped (never crash the
 * whole retrieval). This is acceptable because the feed is machine-generated
 * and regular; the recorded-fixture test pins the exact parsing behavior.
 */
import {
  computeDocumentId,
  normalizedDocumentHash,
  normalizeWhitespace,
  rawSha256Hex,
} from '../hash.ts';
import { fetchTextFromAllowlistedHost } from '../http.ts';
import { RETRIEVAL_PARSER_VERSION } from '../types.ts';
import type { RetrievedDocument, RetrievalAdapter, RetrievalQuery } from '../types.ts';

const ARXIV_BASE = 'http://export.arxiv.org/api/query';
const ARXIV_METHOD = 'arxiv-api-atom';

/** Unescape the 5 standard XML entities. */
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // &amp; LAST so we don't double-unescape
}

/** Extract the first non-empty match of a regex on a block, unescaped + trimmed. */
function extractField(block: string, pattern: RegExp): string {
  const m = pattern.exec(block);
  return m && m[1] ? unescapeXml(m[1]).trim() : '';
}

/** Extract ALL matches (e.g. multiple <author><name>). */
function extractAll(block: string, pattern: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  while ((m = re.exec(block)) !== null) {
    if (m[1]) out.push(unescapeXml(m[1]).trim());
  }
  return out;
}

/**
 * Extract the arXiv id from an <id>http://arxiv.org/abs/<id>[vN]</id> URL.
 * Handles both new-style (2501.12345) and old-style (astro-ph/0501001) ids;
 * strips the version suffix (v1, v2).
 */
function extractArxivId(idField: string): string {
  const m = /arxiv\.org\/abs\/([^"<\s]+)/i.exec(idField);
  if (!m || !m[1]) return '';
  return m[1].replace(/v\d+$/i, '');
}

/** Extract the DOI if arXiv reports one (<arxiv:doi>10.xxx/yyy</arxiv:doi>). */
function extractArxivDoi(block: string): string | null {
  const raw = extractField(block, /<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/i);
  if (!raw) return null;
  const normalized = raw.replace(/^doi:/i, '').replace(/^https?:\/\/doi\.org\//i, '').trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** Parse an arXiv Atom XML body into documents (pure, fail-closed per entry). */
export function parseArxivResults(
  body: string,
  queryText: string,
  retrievedAt: string,
  maxResults: number,
): readonly RetrievedDocument[] {
  // Split into <entry> blocks (the feed header before the first <entry> is dropped).
  const entryBlocks = body.split(/<entry>/).slice(1).map((b) => b.split(/<\/entry>/)[0] ?? '');
  const docs: RetrievedDocument[] = [];
  for (const block of entryBlocks) {
    if (docs.length >= maxResults) break;
    const idField = extractField(block, /<id>([^<]+)<\/id>/i);
    const persistentIdentifier = extractArxivId(idField);
    if (!persistentIdentifier) continue; // no valid arxiv id → skip (fail-closed)
    const title = normalizeWhitespace(extractField(block, /<title>([^<]*)<\/title>/i));
    if (title.length === 0) continue;
    const authors = extractAll(block, /<author>\s*<name>([^<]+)<\/name>/i)
      .map((a) => normalizeWhitespace(a))
      .filter((a) => a.length > 0);
    const published = extractField(block, /<published>([^<]+)<\/published>/i);
    // published is an ISO timestamp; keep the date portion yyyy-mm-dd.
    const publicationDate = published ? published.slice(0, 10) : null;
    const summary = normalizeWhitespace(extractField(block, /<summary>([^<]*)<\/summary>/i));
    const abstract = summary.length > 0 ? summary : null;
    const doi = extractArxivDoi(block);
    const canonicalUrl = `http://arxiv.org/abs/${persistentIdentifier}`;

    const normalizedHash = normalizedDocumentHash({
      sourceType: 'arxiv',
      persistentIdentifier,
      doi,
      title,
      authors,
      publicationDate,
      abstract,
      canonicalUrl,
      licenseMetadata: null, // arXiv license is uniform; not per-entry in the feed
    });

    docs.push({
      documentId: computeDocumentId('arxiv', persistentIdentifier),
      sourceType: 'arxiv',
      sourceName: 'arXiv',
      persistentIdentifier,
      doi,
      canonicalUrl,
      title,
      authors,
      publicationDate,
      retrievedAt,
      retrievalQuery: queryText,
      retrievalMethod: ARXIV_METHOD,
      rawHash: rawSha256Hex(body),
      normalizedHash,
      parserVersion: RETRIEVAL_PARSER_VERSION,
      abstract,
      licenseMetadata: null,
    });
  }
  return docs;
}

/** Build the arXiv API URL for a query (all-field search). */
export function buildArxivUrl(query: RetrievalQuery): string {
  const params = new URLSearchParams({
    search_query: `all:${query.text}`,
    start: '0',
    max_results: String(Math.min(Math.max(query.maxResults, 1), 25)),
  });
  return `${ARXIV_BASE}?${params.toString()}`;
}

/** arXiv retrieval adapter (real network fetch via the allowlisted http helper). */
export const arxivAdapter: RetrievalAdapter = {
  source: 'arxiv',
  sourceName: 'arXiv',
  async retrieve(query: RetrievalQuery): Promise<readonly RetrievedDocument[]> {
    const url = buildArxivUrl(query);
    const fetched = await fetchTextFromAllowlistedHost(url, {
      method: 'GET',
      headers: { Accept: 'application/atom+xml' },
    });
    const docs = parseArxivResults(
      fetched.body,
      query.text,
      fetched.retrievedAt ?? new Date().toISOString(),
      query.maxResults,
    );
    return fetched.cacheHit === true ? docs.map((d) => ({ ...d, retrievedFrom: 'cache' as const })) : docs;
  },
};
