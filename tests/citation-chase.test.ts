import { describe, expect, it } from 'vitest';
import {
  CHASE_SEEDS_MAX,
  CHASE_TOP_SEEDS,
  isChaseAbortError,
  planCitationChase,
  workRefOf,
  type ChaseSeedInput,
} from '../src/pipeline/citation-chase.js';
import { saturationMetrics, SATURATION_MIN_SEARCHES } from '../src/pipeline/retrieval-metrics.js';
import { diversitySnapshot, diversitySummaryLine } from '../src/pipeline/retrieval-metrics.js';
import {
  ARXIV_PUBLICATION_TYPE,
  fromCrossrefType,
  fromEuropepmcPubTypes,
  fromOpenalexType,
} from '../src/sources/pubtype.js';
import { createOpenAlexAdapter } from '../src/sources/openalex.js';
import type { FetchLike, FetchResponseLike } from '../src/sources/http.js';
import { isSourceAdapterError } from '../src/sources/error.js';

/**
 * TEST FIXTURES ONLY — no network: the OpenAlex adapter runs on an injected
 * queue-driven fetch; every payload below is synthetic, shaped like the API
 * contract (spike-observed field names).
 */

const TEST_MAILTO = 'unit-test@example.com';

const jsonResponse = (status: number, body: unknown): FetchResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

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

const seedInput = (
  key: string,
  ids: Array<{ kind: string; value: string }>,
  purposes: readonly string[] = ['discovery'],
): ChaseSeedInput => ({
  key,
  purposes: new Set(purposes),
  record: { identifiers: ids.map((i) => ({ kind: i.kind, value: i.value })) },
});

/* ----------------------------- workRefOf ------------------------------ */

describe('workRefOf', () => {
  it('prefers a bare OpenAlex W-id over DOI', () => {
    expect(workRefOf(seedInput('a', [{ kind: 'openalex', value: 'W101' }, { kind: 'doi', value: '10.1/x' }]))).toBe('W101');
  });

  it('strips the OpenAlex URL prefix', () => {
    expect(workRefOf(seedInput('a', [{ kind: 'openalex', value: 'https://openalex.org/W202' }]))).toBe('W202');
  });

  it('falls back to a doi: compound when no W-id exists', () => {
    expect(workRefOf(seedInput('a', [{ kind: 'arxiv', value: '2401.00001' }, { kind: 'doi', value: '10.1234/abc' }]))).toBe(
      'doi:10.1234/abc',
    );
  });

  it('returns null for unresolvable entries (no openalex id, no doi)', () => {
    expect(workRefOf(seedInput('a', [{ kind: 'arxiv', value: '2401.00001' }]))).toBeNull();
  });

  it('rejects malformed W-ids (path-safety)', () => {
    expect(workRefOf(seedInput('a', [{ kind: 'openalex', value: 'W12/../../etc' }]))).toBeNull();
    expect(workRefOf(seedInput('a', [{ kind: 'openalex', value: 'W1 x' }]))).toBeNull();
  });
});

/* ---------------------------- planCitationChase ---------------------------- */

describe('planCitationChase', () => {
  it('selects top fused seeds plus the first counter-origin seed, capped at CHASE_SEEDS_MAX', () => {
    const fused = [
      seedInput('top1', [{ kind: 'openalex', value: 'W1' }]),
      seedInput('top2', [{ kind: 'openalex', value: 'W2' }]),
      seedInput('counter1', [{ kind: 'openalex', value: 'W3' }], ['counter_evidence']),
      seedInput('top3', [{ kind: 'openalex', value: 'W4' }]), // beyond CHASE_TOP_SEEDS
    ];
    const seeds = planCitationChase(fused);
    expect(seeds.map((s) => s.key)).toEqual(['top1', 'top2', 'counter1']);
    expect(seeds.filter((s) => s.tag === 'top')).toHaveLength(CHASE_TOP_SEEDS);
    expect(seeds).toHaveLength(CHASE_SEEDS_MAX);
  });

  it('never duplicates a seed that is both top-ranked and counter-origin', () => {
    const fused = [
      seedInput('both', [{ kind: 'openalex', value: 'W1' }], ['counter_evidence', 'discovery']),
      seedInput('top2', [{ kind: 'openalex', value: 'W2' }]),
    ];
    const seeds = planCitationChase(fused);
    expect(seeds.map((s) => s.key)).toEqual(['both', 'top2']);
    expect(seeds.filter((s) => s.key === 'both')).toHaveLength(1);
  });

  it('skips unresolvable entries (arXiv-only records without DOI) without burning a seed slot', () => {
    const fused = [
      seedInput('arxivonly', [{ kind: 'arxiv', value: '2401.00001' }]),
      seedInput('good', [{ kind: 'doi', value: '10.1/y' }]),
    ];
    const seeds = planCitationChase(fused);
    expect(seeds.map((s) => s.key)).toEqual(['good']);
  });

  it('returns no counter seed when none is chaseable — total stays at CHASE_TOP_SEEDS', () => {
    const fused = [
      seedInput('top1', [{ kind: 'openalex', value: 'W1' }]),
      seedInput('top2', [{ kind: 'openalex', value: 'W2' }]),
      seedInput('counter-no-ref', [{ kind: 'arxiv', value: '2401.9' }], ['counter_evidence']),
    ];
    expect(planCitationChase(fused).map((s) => s.key)).toEqual(['top1', 'top2']);
  });
});

/* ---------------------------- abort classification ---------------------------- */

describe('isChaseAbortError', () => {
  it('aborts on budget/rate-limit errors (no point hammering an exhausted pool)', () => {
    expect(isChaseAbortError(new Error('Insufficient budget — resets at midnight UTC'))).toBe(true);
    expect(isChaseAbortError(new Error('http 429 too many requests'))).toBe(true);
  });

  it('does not abort on ordinary parse/network errors (per-seed skip instead)', () => {
    expect(isChaseAbortError(new Error('response is not valid JSON'))).toBe(false);
    expect(isChaseAbortError(new Error('http 500'))).toBe(false);
  });
});

/* ------------------------------ saturation ------------------------------ */

describe('saturationMetrics', () => {
  it('returns a zero observation (not saturated) for no record-bearing searches', () => {
    expect(saturationMetrics([])).toEqual({ searches: 0, meanNovelty: 0, tailNovelty: 0, saturated: false });
  });

  it('does not flag saturation with too few searches even at zero novelty', () => {
    const obs = saturationMetrics([0, 0, 0]);
    expect(obs.searches).toBe(3);
    expect(obs.saturated).toBe(false); // below SATURATION_MIN_SEARCHES
    expect(SATURATION_MIN_SEARCHES).toBeGreaterThanOrEqual(4);
  });

  it('flags saturation when the tail is all-known documents', () => {
    const obs = saturationMetrics([1, 1, 0.9, 0, 0, 0]);
    expect(obs.searches).toBe(6);
    expect(obs.meanNovelty).toBeCloseTo(0.4833, 3);
    expect(obs.tailNovelty).toBe(0);
    expect(obs.saturated).toBe(true);
  });

  it('stays unsaturated while the tail keeps finding new documents', () => {
    const obs = saturationMetrics([1, 1, 1, 0.8]);
    expect(obs.tailNovelty).toBe(0.9);
    expect(obs.saturated).toBe(false);
  });
});

/* ------------------------------ diversity ------------------------------ */

describe('diversitySnapshot', () => {
  const entries = [
    { family: 'openalex' as const, publicationYear: 2024, publicationType: 'primary_research' as const },
    { family: 'openalex' as const, publicationYear: 1998, publicationType: 'review' as const },
    { family: 'arxiv' as const, publicationType: 'preprint' as const },
    { family: 'crossref' as const, publicationYear: 2010 },
  ];

  it('counts families, year spread, and publication types honestly', () => {
    const d = diversitySnapshot(entries);
    expect(d.familyCounts).toEqual({ openalex: 2, arxiv: 1, crossref: 1 });
    expect(d.familyConcentration).toBe(0.5);
    expect(d.yearMin).toBe(1998);
    expect(d.yearMax).toBe(2024);
    expect(d.publicationTypeCounts).toEqual({ primary_research: 1, review: 1, preprint: 1 });
  });

  it('concentration is 1.0 for a single-family corpus (the bias signal)', () => {
    expect(diversitySnapshot([{ family: 'openalex' as const }, { family: 'openalex' as const }]).familyConcentration).toBe(1);
  });

  it('empty corpus is honest zeros, not division by zero', () => {
    const d = diversitySnapshot([]);
    expect(d.familyConcentration).toBe(0);
    expect(d.yearMin).toBeUndefined();
  });

  it('summary line lists families, years and types compactly', () => {
    const line = diversitySummaryLine(diversitySnapshot(entries));
    expect(line).toContain('openalex=2');
    expect(line).toContain('years 1998-2024');
    expect(line).toContain('preprint=1');
  });
});

/* --------------------------- publication type mapping --------------------------- */

describe('publication type mapping', () => {
  it('OpenAlex: review-article is a review; article is primary research; erratum is a correction', () => {
    expect(fromOpenalexType('review-article')).toBe('review');
    expect(fromOpenalexType('article')).toBe('primary_research');
    expect(fromOpenalexType('erratum')).toBe('correction');
    expect(fromOpenalexType('paratext')).toBe('other');
    expect(fromOpenalexType('brand-new-type')).toBeUndefined(); // honest gap, not guessed
  });

  it('Crossref: journal-article primary, posted-content preprint', () => {
    expect(fromCrossrefType('journal-article')).toBe('primary_research');
    expect(fromCrossrefType('posted-content')).toBe('preprint');
    expect(fromCrossrefType('book-chapter')).toBe('book_chapter');
    expect(fromCrossrefType('unknown-future-type')).toBeUndefined();
  });

  it('EuropePMC pubType list: first decisive entry wins', () => {
    expect(fromEuropepmcPubTypes(['Journal Article'])).toBe('primary_research');
    expect(fromEuropepmcPubTypes(['Review', 'Journal Article'])).toBe('review');
    expect(fromEuropepmcPubTypes(['Preprint'])).toBe('preprint');
    expect(fromEuropepmcPubTypes([])).toBeUndefined();
  });

  it('arXiv records are preprints by construction', () => {
    expect(ARXIV_PUBLICATION_TYPE).toBe('preprint');
  });
});

/* ------------------------ OpenAlex citations capability ------------------------ */

const work = (id: string, title: string, type = 'article'): Record<string, unknown> => ({
  id: `https://openalex.org/${id}`,
  doi: `https://doi.org/10.1/${id.toLowerCase()}`,
  ids: {},
  display_name: title,
  publication_year: 2024,
  authorships: [],
  type,
});

describe('openalex citations capability', () => {
  it('referencedWorkIds: select=referenced_works, ids stripped to bare W-ids', async () => {
    const { fetch, urls } = fakeFetch([
      jsonResponse(200, { referenced_works: ['https://openalex.org/W9', 'https://openalex.org/W8', 'not-a-wid', 42] }),
    ]);
    const adapter = createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    expect(adapter.citations).toBeDefined();
    const ids = await adapter.citations!.referencedWorkIds('W101');
    expect(ids).toEqual(['W9', 'W8']);
    expect(urls[0]).toContain('/works/W101?');
    expect(urls[0]).toContain('select=referenced_works');
  });

  it('referencedWorkIds accepts doi: compounds; legal DOI chars pass, query/hostile chars are escaped', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, { referenced_works: [] })]);
    const adapter = createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    await adapter.citations!.referencedWorkIds('doi:10.1234/abc-def');
    // encodePathSegment discipline (same as resolve()): ':' and '/' are legal in DOI
    // paths and stay literal; the trailing ? must come from OUR query string only.
    expect(urls[0]).toBe('https://openalex.test/works/doi:10.1234/abc-def?select=referenced_works&mailto=unit-test%40example.com');

    const hostile = fakeFetch([jsonResponse(200, { referenced_works: [] })]);
    const hostileAdapter = createOpenAlexAdapter({ fetchImpl: hostile.fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    await hostileAdapter.citations!.referencedWorkIds('doi:10.1/a?b#c');
    // '?' and '#' are escaped — they cannot terminate the path or open a fragment.
    expect(hostile.urls[0]).not.toContain('a?b');
    expect(hostile.urls[0]).not.toContain('#');
  });

  it('referencedWorkIds rejects hostile refs (path traversal cannot reach the URL)', async () => {
    const adapter = createOpenAlexAdapter({ fetchImpl: async () => jsonResponse(200, {}), baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    await expect(adapter.citations!.referencedWorkIds('../../etc/passwd')).rejects.toThrow(
      /accept bare W-ids or 'doi:<doi>' refs/,
    );
  });

  it('citingWorks: filter=cites + explicit cited_by_count:desc sort; records mapped with publicationType', async () => {
    const { fetch, urls } = fakeFetch([
      jsonResponse(200, { results: [work('W7', 'Follow-up replication study'), work('W6', 'Critique of the method', 'review')] }),
    ]);
    const adapter = createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    const records = await adapter.citations!.citingWorks('W101', 5);
    expect(records.map((r) => r.title)).toEqual(['Follow-up replication study', 'Critique of the method']);
    expect(records[0]?.publicationType).toBe('primary_research');
    expect(records[1]?.publicationType).toBe('review');
    const filter = urls[0]?.match(/filter=([^&]*)/)?.[1] ?? '';
    expect(decodeURIComponent(filter)).toBe('cites:W101');
    expect(urls[0]).toContain(encodeURIComponent('cited_by_count:desc'));
  });

  it('worksByIds: one batched openalex_id filter request; empty input short-circuits', async () => {
    const { fetch, urls } = fakeFetch([jsonResponse(200, { results: [work('W1', 'A'), work('W2', 'B')] })]);
    const adapter = createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    expect(await adapter.citations!.worksByIds([])).toEqual([]); // no request burned
    const records = await adapter.citations!.worksByIds(['W1', 'W2', 'W3-malformed']);
    expect(records).toHaveLength(2);
    const filter = decodeURIComponent(urls[0]?.match(/filter=([^&]*)/)?.[1] ?? '');
    expect(filter).toBe('openalex_id:W1|W2');
  });

  it('worksByIds refuses oversized batches loudly', async () => {
    const adapter = createOpenAlexAdapter({ fetchImpl: async () => jsonResponse(200, {}), baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    const ids = Array.from({ length: 51 }, (_, i) => `W${i + 1}`);
    await expect(adapter.citations!.worksByIds(ids)).rejects.toThrow(/at most 50 ids/);
  });

  it('non-200 responses surface as structured adapter errors (no silent empties)', async () => {
    const { fetch } = fakeFetch([jsonResponse(500, { error: 'boom' })]);
    const adapter = createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO });
    const err = await adapter.citations!.referencedWorkIds('W1').catch((e: unknown) => e);
    expect(isSourceAdapterError(err)).toBe(true);
  });

  it('budget-exhausted 429 is NOT retried and fails as an abortable error', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return jsonResponse(429, { error: 'Insufficient budget — resets at midnight UTC' });
    };
    const adapter = createOpenAlexAdapter({ fetchImpl: fetch, baseUrl: 'https://openalex.test', mailto: TEST_MAILTO, rateLimitBackoffMs: 0 });
    await expect(adapter.citations!.citingWorks('W1', 3)).rejects.toThrow(/OpenAlex citation query failed/);
    expect(calls).toBe(1); // budget 429 must not burn a retry backoff
  });
});
