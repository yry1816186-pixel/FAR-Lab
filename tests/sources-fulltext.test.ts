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
  fetchArxivHtmlFullText,
  fetchEuropePmcFullText,
  fetchFullTextForRoute,
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

  it('returns null for unroutable identifiers', () => {
    expect(fullTextRoute(docOf([{ kind: 'doi', value: '10.1/x' }]))).toBeNull();
    expect(fullTextRoute(docOf([{ kind: 'openalex', value: 'W1' }]))).toBeNull();
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
