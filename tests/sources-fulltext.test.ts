/**
 * Fulltext phase A unit tests (src/sources/fulltext.ts).
 *
 * Endpoints verified keyless by probe 2026-08-22 (spikes/fulltext-probe.mjs):
 * arXiv LaTeXML HTML (200 + ltx markers) and Europe PMC fullTextXML (200 + JATS).
 * All fetch calls below are injected fixtures — no network in this suite.
 */
import { describe, expect, it } from 'vitest';
import {
  extractJatsBodyText,
  extractLaTeXmlText,
  extractTeiBodyText,
  fetchArxivHtmlFullText,
  fetchEuropePmcFullText,
  fetchFullTextForRoute,
  fetchOpenAlexTeiFullText,
  fullTextRoute,
  type FullTextRoute,
} from '../src/sources/fulltext.js';
import type { FetchLike } from '../src/sources/http.js';

// ---------------------------------------------------------------------------
// routing
// ---------------------------------------------------------------------------

const docOf = (identifiers: Array<{ kind: string; value: string }>) =>
  ({ identifiers }) as Parameters<typeof fullTextRoute>[0];

describe('fullTextRoute', () => {
  it('routes arxiv identifiers to the HTML endpoint, stripping version suffixes', () => {
    const r = fullTextRoute(docOf([{ kind: 'arxiv', value: '2401.04088v2' }]));
    expect(r).toEqual({
      kind: 'arxiv_html',
      id: '2401.04088',
      sourceUrl: 'https://arxiv.org/html/2401.04088',
    });
  });

  it('routes PMC ids and bare PMIDs to Europe PMC with correct prefixes', () => {
    const pmc = fullTextRoute(docOf([{ kind: 'pubmed', value: 'PMC11032673' }]));
    expect(pmc).toMatchObject({ kind: 'europepmc_jats', id: 'PMC11032673' });
    const pmid = fullTextRoute(docOf([{ kind: 'pubmed', value: '38729648' }]));
    expect(pmid).toMatchObject({ kind: 'europepmc_jats', id: 'PMID:38729648' });
    expect(pmid?.sourceUrl).toContain('/PMID:38729648/fullTextXML');
  });

  it('prefers arxiv over pubmed when both are present', () => {
    const r = fullTextRoute(docOf([
      { kind: 'pubmed', value: 'PMC1' },
      { kind: 'arxiv', value: '2501.00001' },
    ]));
    expect(r?.kind).toBe('arxiv_html');
  });

  it('routes openalex W-ids to the GROBID TEI content endpoint (phase B, lowest priority)', () => {
    const r = fullTextRoute(docOf([{ kind: 'openalex', value: 'W3035965352' }]));
    expect(r).toEqual({
      kind: 'openalex_tei',
      id: 'W3035965352',
      sourceUrl: 'https://content.openalex.org/works/W3035965352.grobid-xml',
    });
    const bare = fullTextRoute(docOf([{ kind: 'openalex', value: 'https://openalex.org/W123' }]));
    expect(bare?.id).toBe('W123');
    // arXiv and PMC stay higher priority than the keyed OpenAlex route
    const prio = fullTextRoute(docOf([
      { kind: 'openalex', value: 'W9' },
      { kind: 'arxiv', value: '2501.00001' },
    ]));
    expect(prio?.kind).toBe('arxiv_html');
  });

  it('returns null for unroutable identifiers', () => {
    expect(fullTextRoute(docOf([{ kind: 'doi', value: '10.1/x' }]))).toBeNull();
    expect(fullTextRoute(docOf([{ kind: 'openalex', value: 'not-a-wid' }]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extraction
// ---------------------------------------------------------------------------

const ltxHtml = (prose: string) =>
  `<!DOCTYPE html><html><head><style>.x{color:red}</style><script>bad()</script></head>` +
  `<body class="ltx_body"><section class="ltx_section"><h2 class="ltx_title">Results</h2>` +
  `<p class="ltx_p">${prose}</p>` +
  `<table class="ltx_tabular"><tr><td>1</td><td>2</td></tr></table>` +
  `</section>` +
  `<section id="bib.bib1" class="ltx_bibliography"><p class="ltx_p">Smith J. 1999 irrelevant reference list</p></section>` +
  `</body></html>`;

describe('extractLaTeXmlText', () => {
  it('keeps prose paragraphs, drops scripts/styles/tables/bibliography', () => {
    const text = extractLaTeXmlText(ltxHtml('The measured effect size was large and consistent.'))!;
    expect(text).toContain('Results');
    expect(text).toContain('The measured effect size was large and consistent.');
    expect(text).not.toContain('irrelevant reference list');
    expect(text).not.toContain('bad()');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('1'); // table numbers gone
  });

  it('returns null for non-LaTeXML pages', () => {
    expect(extractLaTeXmlText('<html><body><p>plain landing page</p></body></html>')).toBeNull();
  });
});

describe('extractJatsBodyText', () => {
  const jats =
    `<?xml version="1.0"?><article><front><permissions>` +
    `<license license-type="open-access"><license-p>This article is distributed under CC BY 4.0 terms</license-p></license>` +
    `</permissions></front>` +
    `<body><sec><title>Results</title><p>We measured the primary outcome across all sites.</p></sec></body>` +
    `</article>`;

  it('extracts body text and license', () => {
    const out = extractJatsBodyText(jats)!;
    expect(out.text).toContain('We measured the primary outcome across all sites.');
    expect(out.text).not.toContain('CC BY');
    expect(out.license).toMatch(/CC BY 4\.0/);
  });

  it('returns null for non-JATS payloads', () => {
    expect(extractJatsBodyText('<html><body>not jats</body></html>')).toBeNull();
    expect(extractJatsBodyText('<article><no-body-here/></article>')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchers (injected fetchImpl)
// ---------------------------------------------------------------------------

const statusFetch = (status: number, body: string): FetchLike =>
  async () => ({ ok: status === 200, status, text: async () => body });

const LONG_PROSE = `${'Deep sequencing of the treated cohorts revealed a consistent shift in community composition. '.repeat(30)}`;

describe('fetchArxivHtmlFullText', () => {
  const route: FullTextRoute = { kind: 'arxiv_html', id: '2401.04088', sourceUrl: 'https://arxiv.org/html/2401.04088' };

  it('fetches a LaTeXML render into text', async () => {
    const res = await fetchArxivHtmlFullText(route, { fetchImpl: statusFetch(200, ltxHtml(LONG_PROSE)) });
    expect(res.status).toBe('fetched');
    if (res.status === 'fetched') {
      expect(res.fetch.variant).toBe('arxiv_html_v1');
      expect(res.fetch.text).toContain('Deep sequencing');
    }
  });

  it('404 (no HTML rendering) is not_available, not an error', async () => {
    const res = await fetchArxivHtmlFullText(route, { fetchImpl: statusFetch(404, '<html>missing</html>') });
    expect(res).toMatchObject({ status: 'not_available' });
  });

  it('server errors are visible errors', async () => {
    const res = await fetchArxivHtmlFullText(route, { fetchImpl: statusFetch(503, 'unavailable') });
    expect(res).toMatchObject({ status: 'error' });
  });

  it('a non-LaTeXML 200 is not_available', async () => {
    const res = await fetchArxivHtmlFullText(route, { fetchImpl: statusFetch(200, '<html><body>landing</body></html>') });
    expect(res).toMatchObject({ status: 'not_available' });
  });
});

describe('fetchEuropePmcFullText', () => {
  const route: FullTextRoute = { kind: 'europepmc_jats', id: 'PMC11032673', sourceUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11032673/fullTextXML' };
  const jatsLong = `<?xml version="1.0"?><article><body><sec><p>${LONG_PROSE}</p></sec></body></article>`;

  it('fetches JATS text with license when present', async () => {
    const res = await fetchEuropePmcFullText(route, { fetchImpl: statusFetch(200, jatsLong) });
    expect(res.status).toBe('fetched');
    if (res.status === 'fetched') expect(res.fetch.variant).toBe('europepmc_jats_v1');
  });

  it('retries once after a transient network failure', async () => {
    let calls = 0;
    const flaky: FetchLike = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return { ok: true, status: 200, text: async () => jatsLong };
    };
    const res = await fetchEuropePmcFullText(route, { fetchImpl: flaky });
    expect(calls).toBe(2);
    expect(res.status).toBe('fetched');
  });

  it('two network failures become a visible error', async () => {
    const dead: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const res = await fetchEuropePmcFullText(route, { fetchImpl: dead });
    expect(res).toMatchObject({ status: 'error' });
  });

  it('404 is not_available', async () => {
    const res = await fetchEuropePmcFullText(route, { fetchImpl: statusFetch(404, 'nope') });
    expect(res).toMatchObject({ status: 'not_available' });
  });
});

describe('fetchFullTextForRoute', () => {
  it('null route is not_available (common case: no arxiv/PMC identifier)', async () => {
    const res = await fetchFullTextForRoute(null);
    expect(res).toMatchObject({ status: 'not_available' });
  });
});

// ---------------------------------------------------------------------------
// OpenAlex GROBID TEI (phase B, D-028)
// ---------------------------------------------------------------------------

const grobidTei = (prose: string) =>
  '<?xml version="1.0" encoding="UTF-8"?><TEI xmlns="http://www.tei-c.org/ns/1.0">' +
  '<teiHeader><fileDesc><titleStmt><title>Fixture Paper</title></titleStmt></fileDesc></teiHeader>' +
  '<text><body><div><head>Results</head>' +
  `<p>${prose}</p>` +
  '<figure><graphic url="fig1.png"/></figure>' +
  '</div><listBibl><biblStruct>Smith J 1999 irrelevant bibliography</biblStruct></listBibl>' +
  '</body></text></TEI>';

describe('extractTeiBodyText', () => {
  it('extracts body prose, drops header/figure/bibliography', () => {
    const text = extractTeiBodyText(grobidTei(LONG_PROSE));
    expect(text).not.toBeNull();
    expect(text).toContain('Deep sequencing');
    expect(text).not.toContain('Fixture Paper'); // teiHeader dropped
    expect(text).not.toContain('irrelevant bibliography'); // listBibl cut
  });

  it('returns null for non-TEI payloads', () => {
    expect(extractTeiBodyText('<html><body>nope</body></html>')).toBeNull();
    expect(extractTeiBodyText('<TEI><text></text></TEI>')).toBeNull(); // no body
  });
});

describe('fetchOpenAlexTeiFullText', () => {
  const route: FullTextRoute = { kind: 'openalex_tei', id: 'W3035965352', sourceUrl: 'https://content.openalex.org/works/W3035965352.grobid-xml' };

  it('no API key -> honest not_available (no error, no network attempt)', async () => {
    let called = 0;
    const fetchImpl: FetchLike = async () => { called += 1; throw new Error('must not be called'); };
    const res = await fetchOpenAlexTeiFullText(route, { fetchImpl, apiKey: '' });
    expect(res).toMatchObject({ status: 'not_available' });
    expect(res.status === 'not_available' ? res.reason : '').toContain('OPENALEX_API_KEY');
    expect(called).toBe(0);
  });

  it('fetches GROBID TEI into text with the key on the query string', async () => {
    let seenUrl = '';
    const fetchImpl: FetchLike = async (url) => {
      seenUrl = String(url);
      return { ok: true, status: 200, text: async () => grobidTei(LONG_PROSE) };
    };
    const res = await fetchOpenAlexTeiFullText(route, { fetchImpl, apiKey: 'test-key' });
    expect(res.status).toBe('fetched');
    if (res.status === 'fetched') {
      expect(res.fetch.variant).toBe('openalex_tei_v1');
      expect(res.fetch.text).toContain('Deep sequencing');
      expect(res.fetch.license).toBeUndefined();
    }
    expect(seenUrl).toContain('api_key=test-key');
  });

  it('401/403 (key rejected) and 404 (no content) are not_available, not errors', async () => {
    const r401 = await fetchOpenAlexTeiFullText(route, { fetchImpl: statusFetch(401, '{"error":"API key required"}'), apiKey: 'k' });
    expect(r401).toMatchObject({ status: 'not_available' });
    const r404 = await fetchOpenAlexTeiFullText(route, { fetchImpl: statusFetch(404, 'gone'), apiKey: 'k' });
    expect(r404).toMatchObject({ status: 'not_available' });
  });

  it('a non-TEI 200 is not_available; server errors are visible', async () => {
    const notTei = await fetchOpenAlexTeiFullText(route, { fetchImpl: statusFetch(200, '<html>landing</html>'), apiKey: 'k' });
    expect(notTei).toMatchObject({ status: 'not_available' });
    const err = await fetchOpenAlexTeiFullText(route, { fetchImpl: statusFetch(503, 'unavailable'), apiKey: 'k' });
    expect(err).toMatchObject({ status: 'error' });
  });
});
