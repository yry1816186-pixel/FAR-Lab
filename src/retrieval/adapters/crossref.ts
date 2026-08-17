/**
 * retrieval/adapters/crossref — Crossref retrieval adapter.
 *
 * Crossref is the official DOI registry (~150M works). Free REST API, no key
 * (a mailto grants the "polite pool"). JSON. Primary use here: resolve/verify a
 * DOI to its real metadata, and full-text-ish search by query. This is the
 * adapter that backs the K5 resource_checker's DOI-existence verification.
 *
 * Docs: https://api.crossref.org/swagger-ui/
 * Endpoint: https://api.crossref.org/works?query=<q>&rows=<n>
 *           https://api.crossref.org/works/<doi>  (single-DOI resolve)
 *
 * Provenance: fields read from real JSON; documentId computed (never invented);
 * raw + normalized content hashed (tamper-detectable).
 */
import {
  computeDocumentId,
  normalizedDocumentHash,
  normalizeWhitespace,
  rawSha256Hex,
} from '../hash.ts';
import { fetchTextFromAllowlistedHost, RetrievalHttpError } from '../http.ts';
import { RETRIEVAL_PARSER_VERSION } from '../types.ts';
import type { RetrievedDocument, RetrievalAdapter, RetrievalQuery } from '../types.ts';

const CROSSREF_BASE = 'https://api.crossref.org/works';
const CROSSREF_METHOD = 'crossref-rest';

/** Polite-mailto source: env CROSSREF_MAILTO (optional; enables the polite pool). */
function politeMailtoParam(): string {
  const mailto = process.env.CROSSREF_MAILTO ?? process.env.OPENALEX_MAILTO;
  return mailto && mailto.includes('@') ? `&mailto=${encodeURIComponent(mailto)}` : '';
}

/** Minimal shape of a Crossref work we consume. */
interface CrossrefWork {
  DOI?: string;
  title?: readonly string[];
  author?: ReadonlyArray<{ given?: string; family?: string }>;
  published?: { 'date-parts'?: readonly (readonly number[])[] };
  publishedOnline?: { 'date-parts'?: readonly (readonly number[])[] };
  abstract?: string | null;
  URL?: string;
  license?: ReadonlyArray<{ URL?: string }>;
}

/** Reconstruct a date from Crossref date-parts [[yyyy, mm, dd]] → 'yyyy-mm-dd'. */
function crossrefDate(work: CrossrefWork): string | null {
  const parts = work.published?.['date-parts']?.[0] ?? work.publishedOnline?.['date-parts']?.[0];
  if (!parts || parts.length === 0) return null;
  const [y, m, d] = parts;
  if (typeof y !== 'number') return null;
  const mm = typeof m === 'number' ? String(m).padStart(2, '0') : '';
  const dd = typeof d === 'number' ? String(d).padStart(2, '0') : '';
  return [String(y), mm, dd].filter((s) => s.length > 0).join('-');
}

/** Strip JATS-style XML tags Crossref embeds in abstracts, then normalize. */
function cleanCrossrefAbstract(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/<[^>]+>/g, ' ') // strip JATS tags (<jats:p>, etc.)
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 0 ? stripped : null;
}

/** Normalize a Crossref DOI to lowercase bare form. */
function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const trimmed = String(doi).replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:/i, '').trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

/**
 * Permissive abstract-license allowlist (compliance audit §5.2, 2026-08-17 —
 * .far/docs-local/COMPLIANCE-data-redistribution.md R1): CC0 / CC-BY / CC-BY-SA
 * and the Open Data Commons PDM/BY families. NC/ND/unspecified licenses and
 * absent license signals all FAIL this check — an abstract ships only when the
 * record itself carries a permissive grant ("Some abstracts contained in the
 * metadata may be subject to copyright by publishers or authors", Crossref
 * REST API docs, fetched 2026-08-17).
 */
const PERMISSIVE_ABSTRACT_LICENSE =
  /^https?:\/\/(creativecommons\.org\/(publicdomain\/zero(\/[0-9.]+)?|licenses\/(by-sa|by)(?![-a-z0-9])(\/[0-9.]+)?)\/?|opendatacommons\.org\/licenses\/(pdm|by)\/?)/i;

/** True when ANY license entry on the record grants permissive reuse. */
function abstractAllowedByLicense(work: CrossrefWork): boolean {
  return (work.license ?? []).some(
    (l) => typeof l.URL === 'string' && PERMISSIVE_ABSTRACT_LICENSE.test(l.URL),
  );
}

/** Map one Crossref work to a RetrievedDocument. */
function mapCrossrefWork(work: CrossrefWork, rawBody: string, queryText: string, retrievedAt: string): RetrievedDocument | null {
  const doi = normalizeDoi(work.DOI);
  if (!doi) return null; // a Crossref work without a DOI is not a valid citable record
  const titles = work.title;
  const title = normalizeWhitespace(Array.isArray(titles) && titles.length > 0 ? titles[0] ?? '' : '');
  if (title.length === 0) return null;
  const authors = (work.author ?? [])
    .map((a) => normalizeWhitespace(`${a.given ?? ''} ${a.family ?? ''}`.trim()))
    .filter((name) => name.length > 0);
  const publicationDate = crossrefDate(work);
  let abstract = cleanCrossrefAbstract(work.abstract);
  // Compliance gate (§5.2): the abstract ships only under a permissive
  // record-level license. Withholding is annotated on the document —
  // "not shipped" must stay distinguishable from "source had none".
  let abstractWithheldReason: RetrievedDocument['abstractWithheldReason'] = undefined;
  if (abstract !== null && !abstractAllowedByLicense(work)) {
    abstract = null;
    abstractWithheldReason = 'crossref_record_license_not_permissive';
  }
  const canonicalUrl = work.URL ?? `https://doi.org/${doi}`;
  const license = work.license?.[0]?.URL ?? null;

  const normalizedHash = normalizedDocumentHash({
    sourceType: 'crossref',
    persistentIdentifier: doi, // for Crossref the persistent id IS the DOI
    doi,
    title,
    authors,
    publicationDate,
    abstract,
    canonicalUrl,
    licenseMetadata: license,
  });

  return {
    documentId: computeDocumentId('crossref', doi),
    sourceType: 'crossref',
    sourceName: 'Crossref',
    persistentIdentifier: doi,
    doi,
    canonicalUrl,
    title,
    authors,
    publicationDate,
    retrievedAt,
    retrievalQuery: queryText,
    retrievalMethod: CROSSREF_METHOD,
    rawHash: rawSha256Hex(rawBody),
    normalizedHash,
    parserVersion: RETRIEVAL_PARSER_VERSION,
    abstract,
    licenseMetadata: license,
    ...(abstractWithheldReason !== undefined ? { abstractWithheldReason } : {}),
  };
}

/** Parse a Crossref works-list JSON body into documents (pure). */
export function parseCrossrefResults(
  body: string,
  queryText: string,
  retrievedAt: string,
  maxResults: number,
): readonly RetrievedDocument[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('crossref: response was not valid JSON');
  }
  const items = (parsed as { message?: { items?: unknown } }).message?.items;
  if (!Array.isArray(items)) return [];
  const docs: RetrievedDocument[] = [];
  for (const work of items as ReadonlyArray<CrossrefWork>) {
    if (docs.length >= maxResults) break;
    const doc = mapCrossrefWork(work, body, queryText, retrievedAt);
    if (doc) docs.push(doc);
  }
  return docs;
}

/** Build the Crossref works-list URL for a query. */
export function buildCrossrefUrl(query: RetrievalQuery): string {
  const params = new URLSearchParams({
    query: query.text,
    rows: String(Math.min(Math.max(query.maxResults, 1), 25)),
  });
  return `${CROSSREF_BASE}?${params.toString()}${politeMailtoParam()}`;
}

/**
 * Resolve a single DOI to its real Crossref metadata (used by the K5
 * resource_checker to verify a DOI actually exists). Returns null if Crossref
 * has no record (NOT_FOUND) — fail-closed, the caller treats null as "DOI does
 * not resolve" rather than guessing.
 */
export async function resolveCrossrefDoi(doi: string): Promise<RetrievedDocument | null> {
  const normalized = normalizeDoi(doi);
  if (!normalized) return null;
  const url = `${CROSSREF_BASE}/${encodeURIComponent(normalized)}`;
  let fetched;
  try {
    fetched = await fetchTextFromAllowlistedHost(url, { method: 'GET' });
  } catch (err) {
    // NOT_FOUND (404) is a legitimate "DOI does not exist in Crossref" — null.
    // Any other failure (network/timeout/429/budget) PROPAGATES: swallowing it
    // here would let callers mistake "could not check" for "checked, absent"
    // (2026-08-15 fix: the old catch returned null for network errors too,
    // contradicting the fail-closed doc comment above).
    if (err instanceof RetrievalHttpError && err.status === 404) {
      return null;
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fetched.body);
  } catch {
    return null;
  }
  const work = (parsed as { message?: CrossrefWork }).message;
  if (!work) return null;
  return mapCrossrefWork(work, fetched.body, `doi:${normalized}`, fetched.retrievedAt ?? new Date().toISOString());
}

/** Crossref retrieval adapter (real network fetch via the allowlisted http helper). */
export const crossrefAdapter: RetrievalAdapter = {
  source: 'crossref',
  sourceName: 'Crossref',
  async retrieve(query: RetrievalQuery): Promise<readonly RetrievedDocument[]> {
    const url = buildCrossrefUrl(query);
    const fetched = await fetchTextFromAllowlistedHost(url, { method: 'GET' });
    const docs = parseCrossrefResults(
      fetched.body,
      query.text,
      fetched.retrievedAt ?? new Date().toISOString(),
      query.maxResults,
    );
    return fetched.cacheHit === true ? docs.map((d) => ({ ...d, retrievedFrom: 'cache' as const })) : docs;
  },
};
