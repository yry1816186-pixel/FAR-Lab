import type { SourceIdentifier } from '../domain/source.js';
import type { RawRetrievalResult, RawSourceRecord, SourceAdapter } from '../shared/ports.js';
import { SourceAdapterError } from './error.js';
import { type SourceAdapterOptions, clampLimit, encodePathSegment, httpGet } from './http.js';
import { asArray, asObject, strField } from './json.js';
import { fromCrossrefType } from './pubtype.js';
import { stripMarkup } from './text.js';

const DEFAULT_BASE_URL = 'https://api.crossref.org';

export interface CrossrefAdapterOptions extends SourceAdapterOptions {
  baseUrl?: string;
  /** Polite-pool identifier (api.crossref.org#polite-pool); env CROSSREF_MAILTO overrides. */
  mailto?: string;
}

/**
 * Map one Crossref `message` object (single work, or an item of message.items)
 * to a RawSourceRecord. Returns undefined when the item is unusable.
 */
const mapMessage = (message: unknown): RawSourceRecord | undefined => {
  const m = asObject(message);
  if (!m) return undefined;

  const doi = strField(m, 'DOI')?.replace(/^https?:\/\/doi\.org\//i, '');
  if (!doi) return undefined; // Crossref records are DOI-anchored by definition
  const identifiers: SourceIdentifier[] = [{ kind: 'doi', value: doi }];

  const title = asArray(m['title'])
    .map((t) => (typeof t === 'string' ? t : ''))
    .filter((t) => t.trim() !== '')[0] ?? '';

  const authors = asArray(m['author'])
    .map((a) => {
      const o = asObject(a);
      const name = strField(o, 'name'); // institutional authors carry only `name`
      if (name !== undefined) return name;
      return [strField(o, 'given'), strField(o, 'family')].filter((p): p is string => p !== undefined).join(' ');
    })
    .filter((name) => name.trim() !== '');

  const issuedParts = asArray(asObject(m['issued'])?.['date-parts'])[0];
  const publicationYear =
    Array.isArray(issuedParts) && typeof issuedParts[0] === 'number' ? issuedParts[0] : undefined;

  const containerTitle = asArray(m['container-title'])
    .map((t) => (typeof t === 'string' ? t : ''))
    .filter((t) => t.trim() !== '')[0];

  const licenseUrls = asArray(m['license'])
    .map((l) => strField(asObject(l), 'URL'))
    .filter((u): u is string => u !== undefined);
  // Prefer an explicit open license when present; otherwise record the first license URL.
  const license = licenseUrls.find((u) => /creativecommons\.org/i.test(u)) ?? licenseUrls[0];

  const abstractRaw = strField(m, 'abstract');
  const abstractText = abstractRaw !== undefined ? stripMarkup(abstractRaw) : undefined;

  const publicationType = fromCrossrefType(strField(m, 'type'));

  return {
    identifiers,
    title,
    publicationYear,
    authors,
    venue: containerTitle,
    abstractText: abstractText !== '' ? abstractText : undefined,
    contentDepth: abstractText ? 'abstract' : 'metadata_only',
    // Crossref alone does not reliably indicate fulltext accessibility (spike §2.6:
    // message.link lands on publisher HTML gates) — do not claim what was not verified.
    accessState: 'unknown',
    license,
    oaUrl: undefined,
    fullTextUrl: undefined,
    ...(publicationType !== undefined ? { publicationType } : {}),
    normalized: m, // full message object as returned, BEFORE volatile exclusion
  };
};

export const createCrossrefAdapter = (opts: CrossrefAdapterOptions = {}): SourceAdapter => {
  const family = 'crossref' as const;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const mailto = opts.mailto ?? process.env['CROSSREF_MAILTO'] ?? 'far-lab@example.com';
  const userAgent = `FAR-Lab/0.1 (mailto:${mailto})`;

  const mailtoQuery = `mailto=${encodeURIComponent(mailto)}`;

  const parseJsonMessage = (bodyText: string, url: string, query: string): unknown => {
    let json: unknown;
    try {
      json = JSON.parse(bodyText);
    } catch {
      throw new SourceAdapterError({
        family, query, kind: 'parse', httpStatus: 200,
        message: 'response is not valid JSON', url, bodyPreview: bodyText.slice(0, 300),
      });
    }
    const message = asObject(json)?.['message'];
    if (message === undefined) {
      throw new SourceAdapterError({
        family, query, kind: 'parse', httpStatus: 200,
        message: 'response has no message object', url, bodyPreview: bodyText.slice(0, 300),
      });
    }
    return message;
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
    const rows = clampLimit(so?.limit, 20, 100);
    // No `select` — snapshots keep full fidelity; volatile fields (score, ...) are
    // excluded at hash time, not at request time.
    const url = `${baseUrl}/works?query=${encodeURIComponent(q)}&rows=${rows}&${mailtoQuery}`;
    const res = await httpGet(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { 'User-Agent': userAgent },
      context: { family, query: q },
    });
    if (res.status !== 200) {
      throw new SourceAdapterError({
        family, query: q, kind: 'http_status', httpStatus: res.status,
        message: `Crossref search failed`, url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    const message = parseJsonMessage(res.bodyText, url, q);
    const items = asArray(asObject(message)?.['items']);
    const records: RawSourceRecord[] = [];
    for (const item of items) {
      const record = mapMessage(item);
      if (record !== undefined) records.push(record);
    }
    return { family, query: q, httpStatus: res.status, records, latencyMs: res.latencyMs };
  };

  const resolve = async (
    identifier: SourceIdentifier,
  ): Promise<{ found: boolean; record?: RawSourceRecord; httpStatus: number }> => {
    const value = identifier.value.trim();
    let doi: string | undefined;
    if (identifier.kind === 'doi') {
      doi = value.replace(/^https?:\/\/doi\.org\//i, '');
    } else if (identifier.kind === 'url') {
      doi = value.match(/^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i)?.[1];
    }
    if (!doi) {
      throw new SourceAdapterError({
        family, query: `${identifier.kind}:${identifier.value}`, kind: 'unsupported_identifier',
        httpStatus: 0,
        message: `Crossref resolves doi(/doi-org-url) identifiers, got kind '${identifier.kind}'`,
      });
    }
    const url = `${baseUrl}/works/${encodePathSegment(doi)}?${mailtoQuery}`;
    const res = await httpGet(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      headers: { 'User-Agent': userAgent },
      context: { family, query: `doi:${doi}` },
    });
    if (res.status === 404) return { found: false, httpStatus: 404 };
    if (res.status !== 200) {
      throw new SourceAdapterError({
        family, query: `doi:${doi}`, kind: 'http_status', httpStatus: res.status,
        message: `Crossref DOI resolve failed`, url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    const message = parseJsonMessage(res.bodyText, url, `doi:${doi}`);
    const record = mapMessage(message);
    if (record === undefined) {
      throw new SourceAdapterError({
        family, query: `doi:${doi}`, kind: 'parse', httpStatus: res.status,
        message: `200 response for ${doi} has no usable message payload`,
        url, bodyPreview: res.bodyText.slice(0, 300),
      });
    }
    return { found: true, record, httpStatus: res.status };
  };

  return { family, search, resolve };
};
