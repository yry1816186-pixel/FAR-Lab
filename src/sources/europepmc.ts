import type { AccessState, SourceIdentifier } from '../domain/source.js';
import type { RawRetrievalResult, RawSourceRecord, SourceAdapter } from '../shared/ports.js';
import { SourceAdapterError } from './error.js';
import { type SourceAdapterOptions, clampLimit, httpGet } from './http.js';
import { asArray, asObject, strField } from './json.js';
import { fromEuropepmcPubTypes } from './pubtype.js';
import { stripMarkup } from './text.js';

const DEFAULT_BASE_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

export interface EuropePmcAdapterOptions extends SourceAdapterOptions {
  baseUrl?: string;
}

/**
 * Map one Europe PMC search-article object (resultType=core; fields documented at
 * europepmc.org/RestfulWebService — core "including abstract, full text links, and
 * MeSH terms") to a RawSourceRecord. Every projection is optional-tolerant: absent
 * fields degrade the projection, never fabricate content. Returns undefined when
 * the record carries no persistent identifier (doi/pmcid/pmid) or no title.
 */
const mapArticle = (article: unknown): RawSourceRecord | undefined => {
  const a = asObject(article);
  if (!a) return undefined;

  // Europe PMC field search syntax (confirmed via the /rest/fields endpoint):
  // DOI / EXT_ID (pmid) / PMCID. Persistent identifier order mirrors openalex.ts:
  // doi first (verification routes it to crossref), then pmcid, then pmid.
  const identifiers: SourceIdentifier[] = [];
  const doi = strField(a, 'doi')?.replace(/^https?:\/\/doi\.org\//i, '');
  if (doi) identifiers.push({ kind: 'doi', value: doi });
  const pmcid = strField(a, 'pmcid');
  if (pmcid !== undefined) identifiers.push({ kind: 'pubmed', value: pmcid });
  else {
    const pmid = strField(a, 'pmid');
    if (pmid !== undefined) identifiers.push({ kind: 'pubmed', value: pmid });
  }
  const title = strField(a, 'title')?.replace(/\.$/, '');
  if (identifiers.length === 0 || title === undefined || title.length === 0) return undefined;

  // authorString is a single "Surname FM, Surname FM" rendering — split into
  // per-author strings (projection only; never enters the content hash).
  const authors = (strField(a, 'authorString') ?? '')
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const abstractRaw = strField(a, 'abstractText');
  const abstractText = abstractRaw !== undefined ? stripMarkup(abstractRaw) : undefined;

  const isOpenAccess = strField(a, 'isOpenAccess');
  const accessState: AccessState =
    isOpenAccess === 'Y' ? 'open' : isOpenAccess === 'N' ? 'paywalled' : 'unknown';

  // pubYear arrives as a STRING ("2023") in Europe PMC articles — narrow explicitly
  // (numField only accepts real numbers; a silent undefined would drop the year).
  const pubYearRaw = strField(a, 'pubYear');
  const pubYear = pubYearRaw !== undefined && /^\d{4}$/.test(pubYearRaw) ? Number(pubYearRaw) : undefined;

  const publicationType = fromEuropepmcPubTypes(asArray(a['pubType']).filter((t): t is string => typeof t === 'string'));

  return {
    identifiers,
    title,
    publicationYear: pubYear,
    authors,
    venue: strField(a, 'journalTitle'),
    abstractText: abstractText !== '' ? abstractText : undefined,
    contentDepth: abstractText ? 'abstract' : 'metadata_only',
    accessState,
    license: strField(a, 'license'),
    // fullTextUrlList drifts publisher-side and is excluded from the hash; fulltext
    // deepening routes by identifiers (fulltext.ts europepmc_jats), not by this URL.
    oaUrl: undefined,
    fullTextUrl: undefined,
    ...(publicationType !== undefined ? { publicationType } : {}),
    normalized: a, // full article object as returned, BEFORE volatile exclusion
  };
};

/** Parse the search-envelope; throws a structured parse error on non-resultList JSON. */
const parseResultList = (bodyText: string, url: string, query: string): unknown[] => {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new SourceAdapterError({
      family: 'europepmc', query, kind: 'parse', httpStatus: 200,
      message: 'response is not valid JSON', url, bodyPreview: bodyText.slice(0, 300),
    });
  }
  const resultList = asObject(json)?.['resultList'];
  const result = asObject(resultList)?.['result'];
  if (result === undefined) {
    throw new SourceAdapterError({
      family: 'europepmc', query, kind: 'parse', httpStatus: 200,
      message: 'response has no resultList.result array', url, bodyPreview: bodyText.slice(0, 300),
    });
  }
  return asArray(result);
};

export const createEuropePmcAdapter = (opts: EuropePmcAdapterOptions = {}): SourceAdapter => {
  const family = 'europepmc' as const;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;

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
    const rows = clampLimit(so?.limit, 20, 100);
    const url =
      `${baseUrl}/search?query=${encodeURIComponent(q)}&format=json&resultType=core&pageSize=${rows}`;
    const res = await httpGet(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { Accept: 'application/json' },
      context: { family, query: q },
    });
    if (res.status !== 200) {
      throw new SourceAdapterError({
        family, query: q, kind: 'http_status', httpStatus: res.status,
        message: `Europe PMC search failed`, url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    const articles = parseResultList(res.bodyText, url, q);
    const records: RawSourceRecord[] = [];
    for (const article of articles.slice(0, rows)) {
      const record = mapArticle(article);
      if (record !== undefined) records.push(record);
    }
    return { family, query: q, httpStatus: res.status, records, latencyMs: res.latencyMs };
  };

  const resolve = async (
    identifier: SourceIdentifier,
  ): Promise<{ found: boolean; record?: RawSourceRecord; httpStatus: number }> => {
    const value = identifier.value.trim();
    // Field syntax per the /rest/fields endpoint: DOI:"...", PMCID:..., EXT_ID:... (+ SRC:MED).
    let fieldQuery: string;
    if (identifier.kind === 'doi') {
      fieldQuery = `DOI:"${value.replace(/^https?:\/\/doi\.org\//i, '')}"`;
    } else if (identifier.kind === 'pubmed' && /^PMC/i.test(value)) {
      fieldQuery = `PMCID:${value}`;
    } else if (identifier.kind === 'pubmed') {
      fieldQuery = `EXT_ID:${value} AND SRC:MED`;
    } else {
      throw new SourceAdapterError({
        family, query: `${identifier.kind}:${identifier.value}`, kind: 'unsupported_identifier',
        httpStatus: 0,
        message: `Europe PMC resolves doi/pubmed identifiers, got kind '${identifier.kind}'`,
      });
    }
    const url =
      `${baseUrl}/search?query=${encodeURIComponent(fieldQuery)}&format=json&resultType=core&pageSize=1`;
    const res = await httpGet(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { Accept: 'application/json' },
      context: { family, query: fieldQuery },
    });
    if (res.status !== 200) {
      throw new SourceAdapterError({
        family, query: fieldQuery, kind: 'http_status', httpStatus: res.status,
        message: `Europe PMC resolve failed`, url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    const articles = parseResultList(res.bodyText, url, fieldQuery);
    const record = mapArticle(articles[0]);
    if (record === undefined) return { found: false, httpStatus: res.status };
    return { found: true, record, httpStatus: res.status };
  };

  return { family, search, resolve };
};
