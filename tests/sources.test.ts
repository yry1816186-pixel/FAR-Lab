import { describe, expect, it } from 'vitest';
import { createArxivAdapter, parseArxivAtom } from '../src/sources/arxiv.js';
import { createCrossrefAdapter } from '../src/sources/crossref.js';
import { createEuropePmcAdapter } from '../src/sources/europepmc.js';
import { isSourceAdapterError } from '../src/sources/error.js';
import type { FetchLike, FetchResponseLike } from '../src/sources/http.js';
import { createOpenAlexAdapter, rebuildInvertedAbstract } from '../src/sources/openalex.js';
import { excludeVolatile, snapshotHash } from '../src/sources/snapshot.js';
import { SOURCE_FAMILIES, sourceAdapterFor } from '../src/sources/index.js';
import type { RawSourceRecord } from '../src/shared/ports.js';

/**
 * All fixtures below are TEST FIXTURES: synthetic, minimal payloads shaped like the
 * real API responses observed in the W0 spike (evidence/W0/source-spike-report.md).
 * They are NOT real API data. Every fetch is injected — zero network access here.
 */

const TEST_MAILTO = 'unit-test@example.com';

const jsonResponse = (status: number, body: unknown): FetchResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

const textResponse = (status: number, body: string): FetchResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

/** Queue-driven fetch mock; records every requested URL for request-shape assertions. */
const fakeFetch = (responses: FetchResponseLike[]): { fetch: FetchLike; urls: string[] } => {
  const urls: string[] = [];
  let i = 0;
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    const res = responses[i];
    i += 1;
    if (res === undefined) throw new Error(`TEST FIXTURE fetch: unexpected request #${i} to ${url}`);
    return res;
  };
  return { fetch, urls };
};

const defined = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`TEST expected defined value: ${what}`);
  return v;
};

const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/* ------------------------- TEST FIXTURE: OpenAlex ------------------------- */

const oaWorkFixture = {
  id: 'https://openalex.org/W1234567890',
  doi: 'https://doi.org/10.1000/fake.2026.001',
  // pmcid present -> fulltext phase A deepening becomes possible for this work
  ids: { openalex: 'https://openalex.org/W1234567890', doi: 'https://doi.org/10.1000/fake.2026.001', pmid: '38729648', pmcid: 'PMC11032673' },
  display_name: 'Fixture Study of Base Editing',
  publication_year: 2026,
  type: 'article',
  cited_by_count: 691,
  counts_by_year: [{ year: 2026, cited_by_count: 3 }],
  referenced_works_count: 42,
  updated_date: '2026-08-21',
  created_date: '2026-01-15',
  open_access: { is_oa: true, oa_status: 'gold', oa_date: '2026-02-02' },
  best_oa_location: {
    landing_page_url: 'https://example.org/fixture-article',
    pdf_url: 'https://example.org/fixture-article.pdf',
    license: 'cc-by',
    version: 'publishedVersion',
  },
  topics: [{ id: 'T101', display_name: 'Base editing', score: 0.9 }],
  authorships: [
    { cited_by_count: 99, author: { id: 'A501', display_name: 'Alice Fixture', orcid: null } },
    { cited_by_count: 7, author: { id: 'A502', display_name: 'Bob Fixture', orcid: null } },
  ],
  primary_location: {
    source: { id: 'S900', display_name: 'Fixture Journal' },
    pdf_url: null,
  },
  // intentionally out-of-dictionary-order keys: rebuild must sort by position
  abstract_inverted_index: { works: [2], base: [0], fixture: [3], editing: [1] },
};

const oaSearchFixture = { meta: { count: 78571, db_response_time_ms: 12 }, results: [oaWorkFixture] };

/* ------------------------- TEST FIXTURE: Crossref ------------------------- */

const crMessageFixture = {
  DOI: '10.1000/fake.2026.001',
  title: ['Fixture Crossref Title'],
  type: 'journal-article',
  publisher: 'Fixture Press',
  'container-title': ['Fixture Journal'],
  issued: { 'date-parts': [[2026, 1, 15]] },
  'is-referenced-by-count': 614,
  'references-count': 42,
  deposited: { 'date-parts': [[2026, 2, 1]], 'date-time': '2026-02-01T00:00:00Z' },
  indexed: { 'date-parts': [[2026, 2, 2]], 'date-time': '2026-02-02T00:00:00Z' },
  score: 0.987,
  author: [{ given: 'Alice', family: 'Fixture', sequence: 'first' }],
  reference: [
    { key: 'ref-1', DOI: '10.9999/fake-ref-1', deposited: { 'date-time': '2026-01-01T00:00:00Z' } },
    { key: 'ref-2', article_title: 'Cited fixture work' },
  ],
  license: [
    { URL: 'https://example.org/license-till', content_version: 'vor' },
    { URL: 'https://creativecommons.org/licenses/by/4.0', content_version: 'vor' },
  ],
  URL: 'https://doi.org/10.1000/fake.2026.001',
  abstract: '<jats:p>Fixture &amp; abstract with <jats:italic>markup</jats:italic>.</jats:p>',
};

const crResolveFixture = { status: 'ok', message: crMessageFixture };
const crSearchFixture = { status: 'ok', message: { 'total-results': 928668, items: [crMessageFixture] } };

/* ------------------------- TEST FIXTURE: arXiv Atom ------------------------- */

const arxivAtomFixture = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title type="html">ArXiv Query</title>
  <updated>2026-08-21T00:00:00-04:00</updated>
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2601.12345v2</id>
    <updated>2026-07-01T12:00:00Z</updated>
    <published>2026-01-15T09:00:00Z</published>
    <title>Fixture arXiv Entry &amp; Entities</title>
    <summary>  Fixture abstract
      with wrapped   whitespace.  </summary>
    <author><name>Alice Fixture</name></author>
    <author><name>Bob Fixture</name></author>
    <arxiv:doi>10.1000/fake.2026.002</arxiv:doi>
    <link href="http://arxiv.org/abs/2601.12345v2" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2601.12345v2" type="application/pdf"/>
    <arxiv:primary_category term="q-bio.GN"/>
    <category term="q-bio.GN"/>
    <arxiv:comment>24 pages, fixture figures</arxiv:comment>
  </entry>
</feed>`;

/* ------------------------- volatile-field exclusion ------------------------- */

describe('excludeVolatile', () => {
  it('removes exactly the contract volatile fields from an OpenAlex work', () => {
    const out = excludeVolatile('openalex', oaWorkFixture) as Record<string, unknown>;
    for (const gone of [
      'cited_by_count', 'counts_by_year', 'referenced_works_count', 'updated_date',
      'open_access', 'best_oa_location', 'topics',
    ]) {
      expect(out[gone], `${gone} must be excluded`).toBeUndefined();
    }
    const authorships = out['authorships'] as Array<Record<string, unknown>>;
    expect(authorships).toHaveLength(2); // array preserved element-for-element
    expect(authorships[0]?.['cited_by_count']).toBeUndefined(); // authorships[*].cited_by_count gone
    expect((authorships[0]?.['author'] as Record<string, unknown>)['display_name']).toBe('Alice Fixture');
    // stable fields kept
    expect(out['id']).toBe('https://openalex.org/W1234567890');
    expect(out['doi']).toBe('https://doi.org/10.1000/fake.2026.001');
    expect(out['display_name']).toBe('Fixture Study of Base Editing');
    expect(out['created_date']).toBe('2026-01-15'); // not on the contract list -> kept
    expect(out['abstract_inverted_index']).toBeDefined();
  });

  it('removes exactly the contract volatile fields from a Crossref message', () => {
    const out = excludeVolatile('crossref', crMessageFixture) as Record<string, unknown>;
    for (const gone of ['is-referenced-by-count', 'references-count', 'deposited', 'indexed', 'score']) {
      expect(out[gone], `${gone} must be excluded`).toBeUndefined();
    }
    const refs = out['reference'] as Array<Record<string, unknown>>;
    expect(refs).toHaveLength(2);
    expect(refs[0]?.['deposited']).toBeUndefined(); // reference[*].deposited gone
    expect(refs[0]?.['DOI']).toBe('10.9999/fake-ref-1'); // sibling reference fields kept
    expect(refs[1]?.['article_title']).toBe('Cited fixture work');
    expect(out['DOI']).toBe('10.1000/fake.2026.001');
    expect(out['abstract']).toBeDefined();
  });

  it('removes `updated` from an arXiv entry and keeps published/version', () => {
    const entry = defined(parseArxivAtom(arxivAtomFixture).entries[0], 'arxiv entry');
    const out = excludeVolatile('arxiv', entry) as Record<string, unknown>;
    expect(out['updated']).toBeUndefined();
    expect(out['published']).toBe('2026-01-15T09:00:00Z');
    expect(out['version']).toBe('v2'); // version distinguishes snapshots, not excluded
  });

  it('is pure — the input payload is not mutated', () => {
    const input = { cited_by_count: 1, title: 'x' };
    excludeVolatile('openalex', input);
    expect(input).toEqual({ cited_by_count: 1, title: 'x' });
  });

  it('passes non-object payloads through unchanged', () => {
    expect(excludeVolatile('arxiv', 'plain text')).toBe('plain text');
    expect(excludeVolatile('crossref', 42)).toBe(42);
  });
});

/* ------------------------- snapshot hashing ------------------------- */

describe('snapshotHash', () => {
  const record: RawSourceRecord = {
    identifiers: [{ kind: 'doi', value: '10.1000/fake.2026.001' }],
    title: 'Fixture Study of Base Editing',
    publicationYear: 2026,
    authors: ['Alice Fixture'],
    contentDepth: 'abstract',
    accessState: 'open',
    normalized: oaWorkFixture,
  };

  it('produces 64-char lowercase hex sha256', () => {
    expect(snapshotHash('openalex', record)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same payload (hash stability)', () => {
    expect(snapshotHash('openalex', record)).toBe(snapshotHash('openalex', record));
  });

  it('is invariant to object key insertion order (canonical JSON basis)', () => {
    // same fields as oaWorkFixture, deliberately reversed insertion order
    const reordered = {
      ids: oaWorkFixture.ids,
      abstract_inverted_index: oaWorkFixture.abstract_inverted_index,
      primary_location: oaWorkFixture.primary_location,
      authorships: oaWorkFixture.authorships,
      topics: oaWorkFixture.topics,
      best_oa_location: oaWorkFixture.best_oa_location,
      open_access: oaWorkFixture.open_access,
      created_date: oaWorkFixture.created_date,
      updated_date: oaWorkFixture.updated_date,
      referenced_works_count: oaWorkFixture.referenced_works_count,
      counts_by_year: oaWorkFixture.counts_by_year,
      cited_by_count: oaWorkFixture.cited_by_count,
      type: oaWorkFixture.type,
      publication_year: oaWorkFixture.publication_year,
      display_name: oaWorkFixture.display_name,
      doi: oaWorkFixture.doi,
      id: oaWorkFixture.id,
    };
    const reorderedRecord = { ...record, normalized: reordered };
    expect(snapshotHash('openalex', reorderedRecord)).toBe(snapshotHash('openalex', record));
  });

  it('stays equal when ONLY volatile fields drift (exclusion is effective end-to-end)', () => {
    const drifted = deepClone(oaWorkFixture);
    drifted.cited_by_count = 99999;
    drifted.updated_date = '2030-01-01';
    drifted.open_access = { is_oa: false, oa_status: 'closed' };
    drifted.best_oa_location = null;
    const firstAuthorship = defined(drifted.authorships[0], 'drifted authorship');
    firstAuthorship.cited_by_count = 123456;
    expect(snapshotHash('openalex', { ...record, normalized: drifted })).toBe(snapshotHash('openalex', record));
  });

  it('changes when a stable field changes', () => {
    const edited = deepClone(oaWorkFixture);
    edited.display_name = 'Retracted Title';
    expect(snapshotHash('openalex', { ...record, normalized: edited }))
      .not.toBe(snapshotHash('openalex', record));
  });
});

/* ------------------------- OpenAlex adapter ------------------------- */

describe('openalex adapter', () => {
  const makeAdapter = (fetch: FetchLike) =>
    createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });

  it('search: maps fields, rebuilds inverted abstract, sends mailto (mocked fetch)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, oaSearchFixture)]);
    const adapter = makeAdapter(fetch);
    const result = await adapter.search('base editing fixture', { limit: 5 });

    expect(result.family).toBe('openalex');
    expect(result.httpStatus).toBe(200);
    expect(result.query).toBe('base editing fixture');
    expect(result.records).toHaveLength(1);
    expect(defined(urls[0], 'request url')).toBe(
      'https://openalex.test/works?search=base%20editing%20fixture&per-page=5&mailto=unit-test%40example.com',
    );

    const rec = defined(result.records[0], 'record');
    expect(rec.identifiers).toEqual([
      { kind: 'openalex', value: 'W1234567890' },
      { kind: 'doi', value: '10.1000/fake.2026.001' },
      { kind: 'pubmed', value: 'PMC11032673' }, // pmcid preferred over bare pmid (fulltext routing)
    ]);
    expect(rec.title).toBe('Fixture Study of Base Editing');
    expect(rec.publicationYear).toBe(2026);
    expect(rec.authors).toEqual(['Alice Fixture', 'Bob Fixture']);
    expect(rec.venue).toBe('Fixture Journal');
    expect(rec.abstractText).toBe('base editing works fixture'); // sorted by position, not key order
    expect(rec.contentDepth).toBe('abstract');
    expect(rec.accessState).toBe('open');
    expect(rec.license).toBe('cc-by');
    expect(rec.oaUrl).toBe('https://example.org/fixture-article.pdf');
    expect(rec.fullTextUrl).toBe('https://example.org/fixture-article.pdf');
    // normalized is the FULL work payload BEFORE volatile exclusion (port contract)
    expect((rec.normalized as Record<string, unknown>)['cited_by_count']).toBe(691);
  });

  it('rebuildInvertedAbstract: positions, not dictionary order', () => {
    expect(rebuildInvertedAbstract({ world: [2], hello: [0], '!': [3], brave: [1] })).toBe('hello brave world !');
    expect(rebuildInvertedAbstract(null)).toBeUndefined();
    expect(rebuildInvertedAbstract({ no: 'positions' })).toBeUndefined();
  });

  it('resolve by DOI: found + record (mocked 200)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, oaWorkFixture)]);
    const adapter = makeAdapter(fetch);
    const r = await adapter.resolve({ kind: 'doi', value: '10.1000/fake.2026.001' });
    expect(r.found).toBe(true);
    expect(r.httpStatus).toBe(200);
    expect(defined(r.record, 'record').identifiers[0]).toEqual({ kind: 'openalex', value: 'W1234567890' });
    expect(urls[0]).toContain('/works/doi:10.1000/fake.2026.001?');
    expect(urls[0]).toContain('mailto=');
  });

  it('resolve by unknown W-id: found=false with httpStatus 404 (no throw)', async () => {
    const { fetch } = fakeFetch([jsonResponse(404, { error: 'work not found' })]);
    const adapter = makeAdapter(fetch);
    const r = await adapter.resolve({ kind: 'openalex', value: 'W0000000000' });
    expect(r).toEqual({ found: false, httpStatus: 404 });
  });

  it('search 500: throws structured error carrying family/query/httpStatus', async () => {
    const { fetch } = fakeFetch([jsonResponse(500, { error: 'internal' })]);
    const adapter = makeAdapter(fetch);
    await expect(adapter.search('boom')).rejects.toSatisfy((e: unknown) => {
      if (!isSourceAdapterError(e)) return false;
      expect(e.family).toBe('openalex');
      expect(e.query).toBe('boom');
      expect(e.httpStatus).toBe(500);
      expect(e.kind).toBe('http_status');
      return true;
    });
  });

  it('network rejection: structured error with httpStatus=0, kind=network', async () => {
    const failing: FetchLike = async () => { throw new TypeError('fetch failed'); };
    const adapter = makeAdapter(failing);
    await expect(adapter.search('offline')).rejects.toSatisfy((e: unknown) => {
      if (!isSourceAdapterError(e)) return false;
      expect(e.kind).toBe('network');
      expect(e.httpStatus).toBe(0);
      expect(e.family).toBe('openalex');
      expect(e.query).toBe('offline');
      return true;
    });
  });

  it('optional API key rides the query string when provided (OpenAlex policy-drift adaptation)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, oaSearchFixture)]);
    const adapter = createOpenAlexAdapter({
      fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO, apiKey: 'test-key-123',
    });
    await adapter.search('keyed query');
    expect(urls[0]).toContain('mailto=unit-test%40example.com');
    expect(urls[0]).toContain('api_key=test-key-123');
  });

  it('without a key the request stays keyless (polite pool)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, oaSearchFixture)]);
    const adapter = createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    await adapter.search('keyless query');
    expect(urls[0]).not.toContain('api_key=');
  });

  it('search 429 then 200: single bounded retry recovers (keyless pool burst case)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(429, { error: 'rate limited' }), jsonResponse(200, oaSearchFixture)]);
    const adapter = createOpenAlexAdapter({
      fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO, rateLimitBackoffMs: 0,
    });
    const result = await adapter.search('retry probe');
    expect(result.httpStatus).toBe(200);
    expect(result.records).toHaveLength(1);
    expect(urls).toHaveLength(2); // exactly one retry, no more
    expect(urls[1]).toBe(urls[0]); // identical request replayed after backoff
  });

  it('search 429 twice: structured 429 error after the single retry (no retry storm)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(429, { m: 'limited' }), jsonResponse(429, { m: 'limited' })]);
    const adapter = createOpenAlexAdapter({
      fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO, rateLimitBackoffMs: 0,
    });
    await expect(adapter.search('still limited')).rejects.toSatisfy((e: unknown) => {
      if (!isSourceAdapterError(e)) return false;
      expect(e.httpStatus).toBe(429);
      expect(e.kind).toBe('http_status');
      return true;
    });
    expect(urls).toHaveLength(2); // hard-bounded: two attempts total
  });

  it('budget-exhaustion 429 (Insufficient budget / Resets at) is NOT retried — a backoff cannot recover a daily cap', async () => {
    const budgetBody = JSON.stringify({ error: 'Rate limit exceeded', message: 'Insufficient budget. This request costs $0.001 but you only have $0.0008 remaining. Resets at midnight UTC.' });
    const { fetch, urls } = fakeFetch([jsonResponse(429, JSON.parse(budgetBody))]);
    const adapter = createOpenAlexAdapter({
      fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO, rateLimitBackoffMs: 0,
    });
    await expect(adapter.search('budget gone')).rejects.toSatisfy((e: unknown) => {
      if (!isSourceAdapterError(e)) return false;
      expect(e.httpStatus).toBe(429);
      expect(e.bodyPreview ?? '').toContain('Insufficient budget');
      return true;
    });
    expect(urls).toHaveLength(1); // exactly ONE attempt — no pointless retry
  });

  it('resolve 429 then 200: retry recovers the work record', async () => {
    const { fetch } = fakeFetch([jsonResponse(429, {}), jsonResponse(200, oaWorkFixture)]);
    const adapter = createOpenAlexAdapter({
      fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO, rateLimitBackoffMs: 0,
    });
    const r = await adapter.resolve({ kind: 'doi', value: '10.1000/fake.2026.001' });
    expect(r.found).toBe(true);
    expect(r.httpStatus).toBe(200);
  });
});

/* ------------------------- Crossref adapter ------------------------- */

describe('crossref adapter', () => {
  const makeAdapter = (fetch: FetchLike) =>
    createCrossrefAdapter({ fetchImpl: fetch, baseUrl: 'https://crossref.test', mailto: TEST_MAILTO });

  it('search: maps fields, strips JATS markup, decodes entities (mocked fetch)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, crSearchFixture)]);
    const adapter = makeAdapter(fetch);
    const result = await adapter.search('fixture query', { limit: 3 });

    expect(result.httpStatus).toBe(200);
    expect(result.records).toHaveLength(1);
    expect(defined(urls[0], 'request url')).toBe(
      'https://crossref.test/works?query=fixture%20query&rows=3&mailto=unit-test%40example.com',
    );
    const rec = defined(result.records[0], 'record');
    expect(rec.identifiers).toEqual([{ kind: 'doi', value: '10.1000/fake.2026.001' }]);
    expect(rec.title).toBe('Fixture Crossref Title');
    expect(rec.publicationYear).toBe(2026);
    expect(rec.authors).toEqual(['Alice Fixture']);
    expect(rec.venue).toBe('Fixture Journal');
    expect(rec.abstractText).toBe('Fixture & abstract with markup.');
    expect(rec.contentDepth).toBe('abstract');
    expect(rec.accessState).toBe('unknown'); // honest default: fulltext accessibility unverified
    expect(rec.license).toBe('https://creativecommons.org/licenses/by/4.0'); // prefers open license
    expect(rec.fullTextUrl).toBeUndefined(); // message.link is a publisher gate, not fulltext
    // pre-exclusion normalized retains volatile fields for the snapshot record
    expect((rec.normalized as Record<string, unknown>)['is-referenced-by-count']).toBe(614);
  });

  it('DOI resolve success branch (mocked 200)', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, crResolveFixture)]);
    const adapter = makeAdapter(fetch);
    const r = await adapter.resolve({ kind: 'doi', value: '10.1000/fake.2026.001' });
    expect(r.found).toBe(true);
    expect(r.httpStatus).toBe(200);
    expect(defined(r.record, 'record').title).toBe('Fixture Crossref Title');
    expect(urls[0]).toContain('/works/10.1000/fake.2026.001?');
    expect(urls[0]).toContain('mailto=');
  });

  it('DOI resolve 404 branch: found=false, record undefined (mocked 404)', async () => {
    const { fetch } = fakeFetch([jsonResponse(404, { status: 'error', message: 'Resource not found' })]);
    const adapter = makeAdapter(fetch);
    const r = await adapter.resolve({ kind: 'doi', value: '10.9999/does-not-exist' });
    expect(r.found).toBe(false);
    expect(r.record).toBeUndefined();
    expect(r.httpStatus).toBe(404);
  });

  it('DOI resolve non-404 failure: structured error with doi as query', async () => {
    const { fetch } = fakeFetch([jsonResponse(503, { status: 'error' })]);
    const adapter = makeAdapter(fetch);
    await expect(adapter.resolve({ kind: 'doi', value: '10.1000/fake.2026.001' }))
      .rejects.toSatisfy((e: unknown) => {
        if (!isSourceAdapterError(e)) return false;
        expect(e.kind).toBe('http_status');
        expect(e.httpStatus).toBe(503);
        expect(e.family).toBe('crossref');
        expect(e.query).toBe('doi:10.1000/fake.2026.001');
        return true;
      });
  });

  it('unsupported identifier kind: visible error, no request', async () => {
    const { fetch, urls } = fakeFetch([]);
    const adapter = makeAdapter(fetch);
    await expect(adapter.resolve({ kind: 'arxiv', value: '2601.12345' })).rejects.toSatisfy(
      (e: unknown) => isSourceAdapterError(e) && e.kind === 'unsupported_identifier',
    );
    expect(urls).toHaveLength(0);
  });
});

/* ------------------------- arXiv adapter ------------------------- */

describe('arxiv adapter', () => {
  const makeAdapter = (fetch: FetchLike) =>
    createArxivAdapter({ fetchImpl: fetch, endpoint: 'https://arxiv.test/api/query', minIntervalMs: 0 });

  it('search: parses Atom XML end-to-end (mocked fetch, entities + whitespace)', async () => {
    const { fetch, urls } = fakeFetch([textResponse(200, arxivAtomFixture)]);
    const adapter = makeAdapter(fetch);
    const result = await adapter.search('crispr fixture', { limit: 3 });

    expect(result.family).toBe('arxiv');
    expect(result.httpStatus).toBe(200);
    expect(result.records).toHaveLength(1);
    const url = defined(urls[0], 'request url');
    expect(url).toContain('https://arxiv.test/api/query?search_query=');
    expect(url).toContain(encodeURIComponent('all:crispr AND all:fixture')); // tokenized AND default
    expect(url).toContain('max_results=3');

    const rec = defined(result.records[0], 'record');
    expect(rec.identifiers).toEqual([
      { kind: 'arxiv', value: '2601.12345' },
      { kind: 'doi', value: '10.1000/fake.2026.002' },
    ]);
    expect(rec.title).toBe('Fixture arXiv Entry & Entities'); // &amp; decoded
    expect(rec.abstractText).toBe('Fixture abstract with wrapped whitespace.'); // collapsed
    expect(rec.publicationYear).toBe(2026);
    expect(rec.authors).toEqual(['Alice Fixture', 'Bob Fixture']);
    expect(rec.venue).toBe('arXiv');
    expect(rec.contentDepth).toBe('abstract');
    expect(rec.accessState).toBe('open');
    expect(rec.fullTextUrl).toBe('http://arxiv.org/pdf/2601.12345v2');
    expect(rec.oaUrl).toBe('http://arxiv.org/abs/2601.12345v2');
    const normalized = rec.normalized as Record<string, unknown>;
    expect(normalized['version']).toBe('v2'); // version enters the snapshot basis
    expect(normalized['updated']).toBe('2026-07-01T12:00:00Z'); // still present pre-exclusion
    // and the hash path drops it:
    expect((excludeVolatile('arxiv', normalized) as Record<string, unknown>)['updated']).toBeUndefined();
  });

  it('parseArxivAtom unit: totalResults, categories, comment, primary category', () => {
    const feed = parseArxivAtom(arxivAtomFixture);
    expect(feed.totalResults).toBe(1);
    const e = defined(feed.entries[0], 'arxiv entry');
    expect(e.arxiv_id).toBe('2601.12345');
    expect(e.version).toBe('v2');
    expect(e.primary_category).toBe('q-bio.GN');
    expect(e.categories).toEqual(['q-bio.GN']);
    expect(e.comment).toBe('24 pages, fixture figures');
    expect(e.doi).toBe('10.1000/fake.2026.002');
  });

  it('resolve by arXiv id: found + record via id_list (mocked)', async () => {
    const { fetch, urls } = fakeFetch([textResponse(200, arxivAtomFixture)]);
    const adapter = makeAdapter(fetch);
    const r = await adapter.resolve({ kind: 'arxiv', value: '2601.12345' });
    expect(r.found).toBe(true);
    expect(r.httpStatus).toBe(200);
    expect(defined(r.record, 'record').identifiers[0]).toEqual({ kind: 'arxiv', value: '2601.12345' });
    expect(urls[0]).toContain('id_list=2601.12345');
  });

  it('resolve unknown id: 200 with zero entries -> found=false (mocked)', async () => {
    const emptyFeed = arxivAtomFixture
      .replace(/<entry>[\s\S]*<\/entry>/, '')
      .replace('<opensearch:totalResults>1</opensearch:totalResults>', '<opensearch:totalResults>0</opensearch:totalResults>');
    const { fetch } = fakeFetch([textResponse(200, emptyFeed)]);
    const adapter = makeAdapter(fetch);
    const r = await adapter.resolve({ kind: 'arxiv', value: '9999.99999' });
    expect(r.found).toBe(false);
    expect(r.httpStatus).toBe(200);
    expect(r.record).toBeUndefined();
  });

  it('non-Atom body on 200: parse error, never fake records', async () => {
    const { fetch } = fakeFetch([textResponse(200, '<html><body>gateway error</body></html>')]);
    const adapter = makeAdapter(fetch);
    await expect(adapter.search('anything')).rejects.toSatisfy(
      (e: unknown) => isSourceAdapterError(e) && e.kind === 'parse' && e.family === 'arxiv',
    );
  });

  it('empty query: invalid_query error before any request', async () => {
    const { fetch, urls } = fakeFetch([]);
    const adapter = makeAdapter(fetch);
    await expect(adapter.search('   ')).rejects.toSatisfy(
      (e: unknown) => isSourceAdapterError(e) && e.kind === 'invalid_query',
    );
    expect(urls).toHaveLength(0);
  });
});

/* ------------------------- registry ------------------------- */

describe('europepmc adapter', () => {
  const makeAdapter = (fetch: FetchLike) =>
    createEuropePmcAdapter({ fetchImpl: fetch, baseUrl: 'https://epmc.test' });

  // TEST FIXTURE shaped per the official docs (core "including abstract, full text
  // links, and MeSH terms"; field-search names confirmed via /rest/fields).
  const epmcArticleFixture = {
    id: '38729648',
    source: 'MED',
    pmid: '38729648',
    pmcid: 'PMC11032673',
    doi: '10.1000/fake.2026.101',
    title: 'Fixture Vitamin D Supplementation and Respiratory Infection Trial.',
    authorString: 'Alice Fixture, Bob Fixture',
    journalTitle: 'Fixture Medical Journal',
    pubYear: '2026',
    abstractText: '<p>Fixture abstract with markup.</p>',
    license: 'cc-by',
    isOpenAccess: 'Y',
    citedByCount: 42,
    firstPublicationDate: '2026-01-15',
    relevanceScore: 8.4,
    fullTextUrlList: [{ documentStyle: 'html', url: 'https://fixture.example/full' }],
  };
  const epmcSearchFixture = { hitCount: 1, resultList: { result: [epmcArticleFixture] } };

  it('search: maps core fields, strips title period + abstract markup, parses string pubYear', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, epmcSearchFixture)]);
    const result = await makeAdapter(fetch).search('vitamin d respiratory infection', { limit: 5 });

    expect(result.family).toBe('europepmc');
    expect(result.httpStatus).toBe(200);
    expect(urls[0]).toBe(
      'https://epmc.test/search?query=vitamin%20d%20respiratory%20infection&format=json&resultType=core&pageSize=5',
    );
    expect(result.records).toHaveLength(1);
    const rec = defined(result.records[0], 'epmc record');
    expect(rec.title).toBe('Fixture Vitamin D Supplementation and Respiratory Infection Trial');
    expect(rec.abstractText).toBe('Fixture abstract with markup.');
    expect(rec.publicationYear).toBe(2026); // string "2026" -> number
    expect(rec.authors).toEqual(['Alice Fixture', 'Bob Fixture']);
    expect(rec.venue).toBe('Fixture Medical Journal');
    expect(rec.contentDepth).toBe('abstract');
    expect(rec.accessState).toBe('open');
    expect(rec.identifiers).toEqual([
      { kind: 'doi', value: '10.1000/fake.2026.101' },
      { kind: 'pubmed', value: 'PMC11032673' }, // pmcid preferred over pmid
    ]);
  });

  it('search: metadata-only article (no abstractText) degrades honestly to metadata_only', async () => {
    const noAbstract = deepClone(epmcArticleFixture);
    delete noAbstract.abstractText;
    const { fetch } = fakeFetch([jsonResponse(200, { resultList: { result: [noAbstract] } })]);
    const result = await makeAdapter(fetch).search('q');
    expect(result.records[0]?.contentDepth).toBe('metadata_only');
    expect(result.records[0]?.abstractText).toBeUndefined();
  });

  it('search: article without doi/pmcid/pmid is dropped, never fabricated', async () => {
    const noIds = deepClone(epmcArticleFixture);
    delete noIds.doi;
    delete noIds.pmcid;
    delete noIds.pmid;
    const { fetch } = fakeFetch([jsonResponse(200, { resultList: { result: [noIds] } })]);
    const result = await makeAdapter(fetch).search('q');
    expect(result.records).toHaveLength(0);
  });

  it('search 500: structured error carrying family/query/httpStatus', async () => {
    const { fetch } = fakeFetch([jsonResponse(500, { error: 'fixture' })]);
    const err: unknown = await makeAdapter(fetch).search('q').catch((e: unknown) => e);
    if (!isSourceAdapterError(err)) throw new Error('expected a thrown SourceAdapterError');
    expect(err.message).toContain('Europe PMC search failed');
    expect(err.httpStatus).toBe(500);
  });

  it('search: non-resultList JSON on 200 is a parse error, never fake records', async () => {
    const { fetch } = fakeFetch([jsonResponse(200, { unexpected: true })]);
    await expect(makeAdapter(fetch).search('q')).rejects.toThrow('no resultList.result array');
  });

  it('resolve by DOI / PMCID / PMID uses the documented field syntax', async () => {
    const mk = () => fakeFetch([jsonResponse(200, epmcSearchFixture)]);
    const byDoi = mk();
    const found1 = await makeAdapter(byDoi.fetch).resolve({ kind: 'doi', value: '10.1000/fake.2026.101' });
    expect(found1.found).toBe(true);
    expect(decodeURIComponent(defined(byDoi.urls[0], 'doi resolve url'))).toContain('DOI:"10.1000/fake.2026.101"');

    const byPmcid = mk();
    const found2 = await makeAdapter(byPmcid.fetch).resolve({ kind: 'pubmed', value: 'PMC11032673' });
    expect(found2.found).toBe(true);
    expect(decodeURIComponent(defined(byPmcid.urls[0], 'pmcid resolve url'))).toContain('PMCID:PMC11032673');

    const byPmid = mk();
    const found3 = await makeAdapter(byPmid.fetch).resolve({ kind: 'pubmed', value: '38729648' });
    expect(found3.found).toBe(true);
    expect(decodeURIComponent(defined(byPmid.urls[0], 'pmid resolve url'))).toContain('EXT_ID:38729648');
  });

  it('resolve 200 with empty result: found=false, no throw', async () => {
    const { fetch } = fakeFetch([jsonResponse(200, { resultList: { result: [] } })]);
    const out = await makeAdapter(fetch).resolve({ kind: 'doi', value: '10.9999/none' });
    expect(out.found).toBe(false);
    expect(out.record).toBeUndefined();
  });

  it('unsupported identifier kind: visible error before any request', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, epmcSearchFixture)]);
    await expect(
      makeAdapter(fetch).resolve({ kind: 'arxiv', value: '2601.00001' }),
    ).rejects.toThrow(/Europe PMC resolves doi\/pubmed/);
    expect(urls).toHaveLength(0);
  });

  it('empty query: invalid_query error before any request', async () => {
    const { fetch, urls } = fakeFetch([]);
    await expect(makeAdapter(fetch).search('  ')).rejects.toThrow('empty query');
    expect(urls).toHaveLength(0);
  });

  it('snapshotHash: volatile-field drift (citedByCount/date/relevance/fullTextUrls) keeps the hash; title change breaks it', () => {
    const record: RawSourceRecord = {
      identifiers: [{ kind: 'doi', value: '10.1000/fake.2026.101' }],
      title: 'Fixture',
      authors: [],
      contentDepth: 'abstract',
      accessState: 'open',
      normalized: epmcArticleFixture,
    };
    const drifted = deepClone(epmcArticleFixture);
    drifted.citedByCount = 99999;
    drifted.firstPublicationDate = '2030-08-23';
    drifted.relevanceScore = 0.1;
    drifted.fullTextUrlList = [{ documentStyle: 'pdf', url: 'https://drift.example/x.pdf' }];
    expect(snapshotHash('europepmc', { ...record, normalized: drifted })).toBe(snapshotHash('europepmc', record));
    const retitled = deepClone(epmcArticleFixture);
    retitled.title = 'Retracted Fixture Title.';
    expect(snapshotHash('europepmc', { ...record, normalized: retitled })).not.toBe(snapshotHash('europepmc', record));
  });
});

describe('source adapter registry', () => {
  it('sourceAdapterFor returns the adapter of the requested family for all families', () => {
    expect(SOURCE_FAMILIES).toEqual(['openalex', 'arxiv', 'crossref', 'europepmc']);
    for (const family of SOURCE_FAMILIES) {
      const adapter = sourceAdapterFor(family);
      expect(adapter.family).toBe(family);
      expect(typeof adapter.search).toBe('function');
      expect(typeof adapter.resolve).toBe('function');
    }
  });

  it('injects fetch options through the registry (no global fetch touched)', async () => {
    const { fetch } = fakeFetch([jsonResponse(200, oaSearchFixture)]);
    const adapter = sourceAdapterFor('openalex', { fetchImpl: fetch });
    const result = await adapter.search('registry check');
    expect(result.httpStatus).toBe(200);
    expect(result.records).toHaveLength(1);
  });
});
