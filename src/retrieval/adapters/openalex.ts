/**
 * retrieval/adapters/openalex — OpenAlex (open scholarly graph) retrieval adapter.
 *
 * OpenAlex is a free, open catalog of the global research system (~250M works),
 * descended from Microsoft Academic Graph. No API key required; a `mailto`
 * grants access to the faster "polite pool". JSON API. This is FAR-Lab's
 * primary general-literature retrieval source.
 *
 * Docs: https://docs.openalex.org/
 * Endpoint: https://api.openalex.org/works?search=<q>&per-page=<n>
 *
 * Provenance: every field below is read from the actual JSON response; documentId
 * is computed (not invented). Raw response is sha256-hashed (rawHash); the
 * normalized projection is hashed (normalizedHash) — both tamper-detectable.
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

const OPENALEX_BASE = 'https://api.openalex.org/works';
const OPENALEX_METHOD = 'openalex-rest';

/** Polite-mailto source: env OPENALEX_MAILTO (optional; enables the polite pool). */
function politeMailtoParam(): string {
  const mailto = process.env.OPENALEX_MAILTO;
  return mailto && mailto.includes('@') ? `&mailto=${encodeURIComponent(mailto)}` : '';
}

/** Minimal shape of an OpenAlex works-list result we consume. */
interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string;
  publication_date?: string | null;
  authorships?: ReadonlyArray<{ author?: { display_name?: string } }>;
  abstract_inverted_index?: Record<string, readonly number[]> | null;
  license?: string | null;
  open_access?: { oa_status?: string | null };
}

/** Reconstruct abstract text from OpenAlex's inverted-index encoding. */
function reconstructAbstract(inverted: Record<string, readonly number[]> | null | undefined): string | null {
  if (!inverted) return null;
  const positioned: { word: string; pos: number }[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      positioned.push({ word, pos });
    }
  }
  positioned.sort((a, b) => a.pos - b.pos);
  const text = positioned.map((p) => p.word).join(' ');
  return text.length > 0 ? normalizeWhitespace(text) : null;
}

/** Extract the OpenAlex W-id (e.g. "W123456789") from a work URL. */
function extractOpenAlexId(workUrl: string | undefined): string {
  if (!workUrl) return '';
  const m = /\/(W\d+)\b/.exec(workUrl);
  return m && m[1] ? m[1] : workUrl;
}

/** Normalize a DOI URL ("https://doi.org/10.X/Y" → "10.x/y" lowercase). */
function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const trimmed = doi.replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:/i, '').trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

/** Map one OpenAlex work JSON object to a RetrievedDocument. */
function mapOpenAlexWork(work: OpenAlexWork, rawBody: string, queryText: string, retrievedAt: string): RetrievedDocument | null {
  const persistentIdentifier = extractOpenAlexId(work.id);
  if (!persistentIdentifier || !work.id) return null;
  const doi = normalizeDoi(work.doi);
  const title = normalizeWhitespace(work.title ?? '');
  if (title.length === 0) return null; // a document without a title is not citable
  const authors = (work.authorships ?? [])
    .map((a) => normalizeWhitespace(a.author?.display_name ?? ''))
    .filter((name) => name.length > 0);
  const publicationDate = work.publication_date ?? null;
  const abstract = reconstructAbstract(work.abstract_inverted_index);
  const canonicalUrl = work.id; // the openalex.org work URL resolves the document
  const license = work.license ?? work.open_access?.oa_status ?? null;

  const normalizedHash = normalizedDocumentHash({
    sourceType: 'openalex',
    persistentIdentifier,
    doi,
    title,
    authors,
    publicationDate,
    abstract,
    canonicalUrl,
    licenseMetadata: license,
  });

  return {
    documentId: computeDocumentId('openalex', persistentIdentifier),
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier,
    doi,
    canonicalUrl,
    title,
    authors,
    publicationDate,
    retrievedAt,
    retrievalQuery: queryText,
    retrievalMethod: OPENALEX_METHOD,
    rawHash: rawSha256Hex(rawBody), // hash of the ENTIRE response (shared across docs in one call)
    normalizedHash,
    parserVersion: RETRIEVAL_PARSER_VERSION,
    abstract,
    licenseMetadata: license,
  };
}

/** Parse an OpenAlex works-list JSON body into documents (pure, side-effect-free). */
export function parseOpenAlexResults(
  body: string,
  queryText: string,
  retrievedAt: string,
  maxResults: number,
): readonly RetrievedDocument[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('openalex: response was not valid JSON');
  }
  const results = (parsed as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const docs: RetrievedDocument[] = [];
  for (const work of results as ReadonlyArray<OpenAlexWork>) {
    if (docs.length >= maxResults) break;
    const doc = mapOpenAlexWork(work, body, queryText, retrievedAt);
    if (doc) docs.push(doc);
  }
  return docs;
}

/**
 * Normalize a retrieval query text for OpenAlex's `search` parameter.
 *
 * OpenAlex rejects requests whose search term contains `?` (HTTP 400, verified
 * against the live API) — a natural-language research question almost always
 * ends with one. Strip `?` (it carries no retrieval semantics for a free-text
 * search) and collapse whitespace. The ORIGINAL question text remains the
 * document's retrievalQuery provenance; this transform only shapes the API call.
 */
export function sanitizeOpenAlexSearchTerm(text: string): string {
  return text.replace(/\?/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Build the OpenAlex request URL for a query. */
export function buildOpenAlexUrl(query: RetrievalQuery): string {
  const params = new URLSearchParams({
    search: sanitizeOpenAlexSearchTerm(query.text),
    'per-page': String(Math.min(Math.max(query.maxResults, 1), 25)),
  });
  return `${OPENALEX_BASE}?${params.toString()}${politeMailtoParam()}`;
}

/** OpenAlex retrieval adapter (real network fetch via the allowlisted http helper). */
export const openalexAdapter: RetrievalAdapter = {
  source: 'openalex',
  sourceName: 'OpenAlex',
  async retrieve(query: RetrievalQuery): Promise<readonly RetrievedDocument[]> {
    const url = buildOpenAlexUrl(query);
    const fetched = await fetchTextFromAllowlistedHost(url, { method: 'GET' });
    const docs = parseOpenAlexResults(
      fetched.body,
      query.text,
      fetched.retrievedAt ?? new Date().toISOString(),
      query.maxResults,
    );
    return fetched.cacheHit === true ? docs.map((d) => ({ ...d, retrievedFrom: 'cache' as const })) : docs;
  },
};
