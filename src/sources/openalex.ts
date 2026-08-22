import type { AccessState, SourceIdentifier } from '../domain/source.js';
import type { RawRetrievalResult, RawSourceRecord, SourceAdapter } from '../shared/ports.js';
import { SourceAdapterError } from './error.js';
import { type HttpGetResult, type SourceAdapterOptions, clampLimit, encodePathSegment, httpGet } from './http.js';
import { asArray, asObject, boolField, numField, strField } from './json.js';

const DEFAULT_BASE_URL = 'https://api.openalex.org';
const DEFAULT_MAILTO = 'far-lab@example.com';
/** Backoff before the single 429 retry (OpenAlex keyless shared pool; Retry-After is not exposed by the fetch contract). */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 3_000;

export interface OpenAlexAdapterOptions extends SourceAdapterOptions {
  baseUrl?: string;
  /** Polite-pool identifier (api.openalex.org#polite-pool); env OPENALEX_MAILTO overrides the default. */
  mailto?: string;
  /**
   * Optional API key (env OPENALEX_API_KEY). Keyless polite pool still works (verified
   * 2026-08-22) but OpenAlex announced mandatory-key + usage-pricing policy drift; a key
   * moves requests to the keyed tier and survives the drift when one appears.
   */
  apiKey?: string;
  /** Backoff before the single 429 retry; tests shrink it to keep suites fast. */
  rateLimitBackoffMs?: number;
}

/** Rebuild abstract text from OpenAlex abstract_inverted_index (word -> [positions]). */
export const rebuildInvertedAbstract = (inv: unknown): string | undefined => {
  if (inv === null || typeof inv !== 'object' || Array.isArray(inv)) return undefined;
  const positions: Array<[number, string]> = [];
  for (const [word, idxs] of Object.entries(inv as Record<string, unknown>)) {
    if (!Array.isArray(idxs)) continue;
    for (const i of idxs) {
      if (typeof i === 'number') positions.push([i, word]);
    }
  }
  if (positions.length === 0) return undefined;
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(([, word]) => word).join(' ');
};

const stripPrefix = (s: string, prefixRegex: RegExp): string => s.replace(prefixRegex, '');

/** Map one /works item to a RawSourceRecord. Returns undefined when the item is unusable. */
const mapWork = (work: unknown): RawSourceRecord | undefined => {
  const w = asObject(work);
  if (!w) return undefined;

  const identifiers: SourceIdentifier[] = [];
  const openalexId = strField(w, 'id')?.replace(/^https?:\/\/openalex\.org\//i, '');
  if (openalexId) identifiers.push({ kind: 'openalex', value: openalexId });
  const doi = strField(w, 'doi')?.replace(/^https?:\/\/doi\.org\//i, '');
  if (doi) identifiers.push({ kind: 'doi', value: doi });
  // ids.pmcid / ids.pmid enable Europe PMC fulltext deepening (fulltext phase A).
  const ids = asObject(w['ids']);
  const pmcid = strField(ids, 'pmcid');
  if (pmcid !== undefined) identifiers.push({ kind: 'pubmed', value: pmcid });
  else {
    const pmid = strField(ids, 'pmid');
    if (pmid !== undefined) identifiers.push({ kind: 'pubmed', value: pmid });
  }
  if (identifiers.length === 0) return undefined; // nothing persistent to anchor the record to

  // open_access/best_oa_location feed the ACCESS projection but are excluded from the
  // snapshot hash (volatile) — projection fields, not hash basis.
  const openAccess = asObject(w['open_access']);
  const isOa = boolField(openAccess, 'is_oa');
  const accessState: AccessState =
    isOa === undefined ? 'unknown' : isOa ? 'open' : 'paywalled';

  const bestOa = asObject(w['best_oa_location']);
  const bestOaPdf = strField(bestOa, 'pdf_url');
  const bestOaLanding = strField(bestOa, 'landing_page_url');
  const primaryLocation = asObject(w['primary_location']);
  const primaryPdf = strField(primaryLocation, 'pdf_url');
  const primarySource = strField(asObject(primaryLocation?.['source']), 'display_name');

  const authors = asArray(w['authorships'])
    .map((a) => {
      const authorship = asObject(a);
      if (!authorship) return undefined;
      const name =
        strField(asObject(authorship['author']), 'display_name') ??
        strField(authorship, 'raw_author_name');
      return name;
    })
    .filter((name): name is string => name !== undefined);

  const abstractText = rebuildInvertedAbstract(w['abstract_inverted_index']);

  return {
    identifiers,
    title: strField(w, 'display_name') ?? '',
    publicationYear: numField(w, 'publication_year'),
    authors,
    venue: primarySource,
    abstractText,
    contentDepth: abstractText !== undefined ? 'abstract' : 'metadata_only',
    accessState,
    license: strField(bestOa, 'license'),
    oaUrl: bestOaPdf ?? bestOaLanding,
    // Direct PDF only — spike §1.5: OpenAlex landing pages are reachable HTML, not files.
    fullTextUrl: bestOaPdf ?? primaryPdf,
    normalized: w, // full work object as returned, BEFORE volatile exclusion
  };
};

export const createOpenAlexAdapter = (opts: OpenAlexAdapterOptions = {}): SourceAdapter => {
  const family = 'openalex' as const;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const mailto = opts.mailto ?? process.env['OPENALEX_MAILTO'] ?? DEFAULT_MAILTO;
  const userAgent = `FAR-Lab/0.1 (mailto:${mailto})`;

  const requestUrl = (pathAndQuery: string): string => `${baseUrl}${pathAndQuery}`;
  const apiKey = opts.apiKey ?? process.env['OPENALEX_API_KEY'] ?? '';
  const mailtoQuery = `mailto=${encodeURIComponent(mailto)}${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`;

  // One bounded retry on 429 (2026-08-22 eval burst evidence: the keyless shared
  // pool rate-limited every query after a heavy run, silently zeroing the novelty
  // neighbor layer; a single polite backoff recovers the transient window).
  // BUDGET-EXHAUSTION 429s are NOT retried: live-observed 2026-08-22, keyless pool
  // now carries a hard daily budget ("Insufficient budget … Resets at midnight UTC") —
  // a backoff cannot recover it inside the day, so the retry would only burn time.
  const getWith429Retry = (
    url: string,
    context: { family: string; query: string },
  ): Promise<HttpGetResult> => {
    const headers = { 'User-Agent': userAgent };
    const call = (): Promise<HttpGetResult> =>
      httpGet(url, { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs, headers, context });
    return call().then((first) => {
      if (first.status !== 429) return first;
      const budgetExhausted = /insufficient budget|resets at/i.test(first.bodyText);
      if (budgetExhausted) return first;
      return new Promise<void>((resolveSleep) => setTimeout(resolveSleep, opts.rateLimitBackoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS)).then(call);
    });
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
    const perPage = clampLimit(so?.limit, 25, 200);
    const url = requestUrl(
      `/works?search=${encodeURIComponent(q)}&per-page=${perPage}&${mailtoQuery}`,
    );
    const res = await getWith429Retry(url, { family, query: q });
    if (res.status !== 200) {
      throw new SourceAdapterError({
        family, query: q, kind: 'http_status', httpStatus: res.status,
        message: `OpenAlex search failed`, url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    let json: unknown;
    try {
      json = JSON.parse(res.bodyText);
    } catch {
      throw new SourceAdapterError({
        family, query: q, kind: 'parse', httpStatus: res.status,
        message: 'response is not valid JSON', url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    const records: RawSourceRecord[] = [];
    for (const item of asArray(asObject(json)?.['results'])) {
      const record = mapWork(item);
      if (record !== undefined) records.push(record);
    }
    return { family, query: q, httpStatus: res.status, records, latencyMs: res.latencyMs };
  };

  const resolve = async (
    identifier: SourceIdentifier,
  ): Promise<{ found: boolean; record?: RawSourceRecord; httpStatus: number }> => {
    const value = identifier.value.trim();
    let pathId: string | undefined;
    if (identifier.kind === 'doi') {
      const bare = stripPrefix(value, /^https?:\/\/doi\.org\//i);
      if (bare) pathId = `doi:${bare}`;
    } else if (identifier.kind === 'openalex') {
      const bare = stripPrefix(value, /^https?:\/\/openalex\.org\//i);
      if (bare) pathId = bare;
    } else if (identifier.kind === 'url') {
      pathId = value.match(/^https?:\/\/openalex\.org\/(W\d+)\/?$/i)?.[1];
    }
    if (!pathId) {
      throw new SourceAdapterError({
        family, query: `${identifier.kind}:${identifier.value}`, kind: 'unsupported_identifier',
        httpStatus: 0,
        message: `OpenAlex resolves doi/openalex(/works-url) identifiers, got kind '${identifier.kind}'`,
      });
    }
    // Path-segment-safe encoding: keeps '/' (legal inside DOIs), escapes `?`/`#` etc.
    const url = requestUrl(`/works/${encodePathSegment(pathId)}?${mailtoQuery}`);
    const res = await getWith429Retry(url, { family, query: `${identifier.kind}:${identifier.value}` });
    if (res.status === 404) return { found: false, httpStatus: 404 };
    if (res.status !== 200) {
      throw new SourceAdapterError({
        family, query: `${identifier.kind}:${identifier.value}`, kind: 'http_status',
        httpStatus: res.status, message: `OpenAlex resolve failed for ${pathId}`,
        url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    let json: unknown;
    try {
      json = JSON.parse(res.bodyText);
    } catch {
      throw new SourceAdapterError({
        family, query: `${identifier.kind}:${identifier.value}`, kind: 'parse',
        httpStatus: res.status, message: 'response is not valid JSON',
        url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    const record = mapWork(json);
    if (record === undefined) {
      throw new SourceAdapterError({
        family, query: `${identifier.kind}:${identifier.value}`, kind: 'parse',
        httpStatus: res.status, message: `200 response for ${pathId} has no usable work payload`,
        url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    return { found: true, record, httpStatus: res.status };
  };

  return { family, search, resolve };
};
