import type { AccessState, SourceIdentifier } from '../domain/source.js';
import type { RawRetrievalResult, RawSourceRecord, SourceAdapter } from '../shared/ports.js';
import { SourceAdapterError } from './error.js';
import { type SourceAdapterOptions, clampLimit, httpGet } from './http.js';
import { asArray, asObject, boolField, numField, strField } from './json.js';

const DEFAULT_BASE_URL = 'https://api.openalex.org';
const DEFAULT_MAILTO = 'far-lab@example.com';

export interface OpenAlexAdapterOptions extends SourceAdapterOptions {
  baseUrl?: string;
  /** Polite-pool identifier (api.openalex.org#polite-pool); env OPENALEX_MAILTO overrides the default. */
  mailto?: string;
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
  const mailtoQuery = `mailto=${encodeURIComponent(mailto)}`;

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
    const res = await httpGet(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { 'User-Agent': userAgent },
      context: { family, query: q },
    });
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
    // encodeURI keeps '/' ( meaningful in DOIs ) while encoding spaces/parens etc.
    const url = requestUrl(`/works/${encodeURI(pathId)}?${mailtoQuery}`);
    const res = await httpGet(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { 'User-Agent': userAgent },
      context: { family, query: `${identifier.kind}:${identifier.value}` },
    });
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
