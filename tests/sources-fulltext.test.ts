/**
 * Fulltext phase A unit tests (src/sources/fulltext.ts).
 *
 * Endpoints verified keyless by probe 2026-08-22 (spikes/fulltext-probe.mjs):
 * arXiv LaTeXML HTML (200 + ltx markers) and Europe PMC fullTextXML (200 + JATS).
 * All fetch calls below are injected fixtures — no network in this suite.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openArtifactStore } from '../src/persistence/artifacts';
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
import { SdmDocument } from '../src/ingest/sdm';
import { ingestSdm, loadSdmByRef } from '../src/ingest/service';
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
  `<figure class="ltx_table"><figcaption class="ltx_caption">Measured counts.</figcaption>` +
  `<table class="ltx_tabular"><thead><tr><th>Source</th><th>Count</th></tr></thead>` +
  `<tbody><tr><td>arXiv</td><td>1</td></tr><tr><td>PMC</td><td>2</td></tr></tbody></table></figure>` +
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

  it('W6/F5: strips inherited numeric citation markers, keeps bracketed prose', () => {
    const html = ltxHtml(
      'Prior work showed replication failures [12] and null results [3,7] across cohorts [2\u20134]. ' +
        'See also [Figure 3] and the panel [in review].',
    );
    const text = extractLaTeXmlText(html)!;
    expect(text).toContain('Prior work showed replication failures and null results across cohorts.');
    expect(text).not.toMatch(/\[\s*\d/);
    expect(text).toContain('[Figure 3]');
    expect(text).toContain('[in review]');
  });

  it('RU-R GO3: keeps equation LaTeX from math alttext, drops MathML glyph soup', () => {
    const html =
      `<!DOCTYPE html><html><body class="ltx_body"><section class="ltx_section">` +
      `<p class="ltx_p">The estimator is ` +
      `<math xmlns="http://www.w3.org/1998/Math/MathML" alttext="\\hat{\\beta} = (X'X)^{-1}X'y" display="inline">` +
      `<mo>β</mo><mo>=</mo><mo stretchy="false">(</mo><mi>X</mi></math> by construction.</p>` +
      `</section></body></html>`;
    const text = extractLaTeXmlText(html)!;
    expect(text).toContain("\\hat{\\beta} = (X'X)^{-1}X'y");
    expect(text).toContain('by construction');
    // the MathML operator soup no longer leaks standalone fragments
    expect(text).not.toMatch(/β=\(/);
  });

  it('RU-R GO3: math WITHOUT alttext degrades to removal, never fabricates', () => {
    const html =
      `<!DOCTYPE html><html><body class="ltx_body"><section class="ltx_section">` +
      `<p class="ltx_p">Value <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math> holds.</p>` +
      `</section></body></html>`;
    const text = extractLaTeXmlText(html)!;
    expect(text).toContain('Value');
    expect(text).toContain('holds');
  });
});

describe('stripCitationMarkers', () => {
  it('removes single, comma-list, and range (hyphen/en-dash) numeric brackets', async () => {
    const { stripCitationMarkers } = await import('../src/sources/fulltext.js');
    expect(stripCitationMarkers('alpha [12] beta')).toBe('alpha beta');
    expect(stripCitationMarkers('alpha [3,7] beta')).toBe('alpha beta');
    expect(stripCitationMarkers('alpha [2-4] beta')).toBe('alpha beta');
    expect(stripCitationMarkers('alpha [2\u20134] beta')).toBe('alpha beta');
    expect(stripCitationMarkers('alpha [ 12 ] beta')).toBe('alpha beta');
    expect(stripCitationMarkers('alpha[12]beta')).toBe('alpha beta');
    expect(stripCitationMarkers('[1][2] tail')).toBe('tail');
  });

  it('keeps non-numeric brackets, absorbs spaces ONLY at real removals (W6 audit P2-1)', async () => {
    const { stripCitationMarkers } = await import('../src/sources/fulltext.js');
    expect(stripCitationMarkers('see [Figure 3] and [Appendix B]')).toBe('see [Figure 3] and [Appendix B]');
    expect(stripCitationMarkers('no brackets here')).toBe('no brackets here');
    expect(stripCitationMarkers('claim [12].')).toBe('claim.');
    expect(stripCitationMarkers('claim [12],')).toBe('claim,');
    // prose parentheses are NEVER glued to the preceding word
    expect(stripCitationMarkers('results (n = 30) shown')).toBe('results (n = 30) shown');
    expect(stripCitationMarkers('we compare (baseline) results')).toBe('we compare (baseline) results');
    expect(stripCitationMarkers('values [3] (post-hoc) held')).toBe('values (post-hoc) held');
    // trade-off: year brackets are numeric and also stripped — documented, rare in prose
    expect(stripCitationMarkers('cohort [2018] analysis')).toBe('cohort analysis');
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

  it('W6/F5: JATS xref citation markers are stripped from body text', () => {
    const withXref =
      `<?xml version="1.0"?><article><body><sec><title>Results</title>` +
      `<p>We measured the primary outcome <xref ref-type="bibr" rid="B12">[12]</xref> across all sites.</p></sec></body></article>`;
    const out = extractJatsBodyText(withXref)!;
    expect(out.text).toContain('primary outcome across all sites');
    expect(out.text).not.toMatch(/\[\s*\d/);
  });

  it('returns null for non-JATS payloads', () => {
    expect(extractJatsBodyText('<html><body>not jats</body></html>')).toBeNull();
    expect(extractJatsBodyText('<article><no-body-here/></article>')).toBeNull();
  });

  it('RU-R GO3: table-wrap captions survive table stripping with a block break', () => {
    const withTable =
      `<?xml version="1.0"?><article><body><sec><title>Results</title>` +
      `<p>Outcomes are summarized below.</p>` +
      `<table-wrap id="T1"><caption>Table 1. Mean change in insulin sensitivity by arm.</caption>` +
      `<table><tr><td>0.8</td><td>0.2</td></tr></table></table-wrap>` +
      `</sec></body></article>`;
    const out = extractJatsBodyText(withTable)!;
    expect(out.text).toContain('Table 1. Mean change in insulin sensitivity by arm.');
    expect(out.text).toContain('Outcomes are summarized below.');
    expect(out.text).not.toMatch(/0\.8/); // numeric table body still dropped
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

  it('RU-R GO3: keeps figure descriptions (figDesc), drops the graphic payload', () => {
    const tei =
      '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><div><head>Results</head>' +
      '<p>Cohort effects are plotted in Figure 1.</p>' +
      '<figure><head>Figure 1</head><graphic url="fig1.png"/>' +
      '<figDesc>Scatter plot of insulin sensitivity against fasting hours; the fitted slope is negative (95% CI -0.42 to -0.11).</figDesc>' +
      '</figure></div></body></text></TEI>';
    const text = extractTeiBodyText(tei)!;
    expect(text).toContain('insulin sensitivity against fasting hours');
    expect(text).toContain('-0.42 to -0.11');
    expect(text).not.toContain('fig1.png');
  });

  it('RU-R GO3: figures without figDesc degrade to whitespace, no fabrication', () => {
    const tei =
      '<TEI><text><body><div><p>Prose only.</p><figure><graphic url="x.png"/></figure></div></body></text></TEI>';
    const text = extractTeiBodyText(tei)!;
    expect(text).toContain('Prose only');
    expect(text).not.toContain('x.png');
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

  it('fetches GROBID TEI with the key on the Authorization header, never the URL (endgame audit B)', async () => {
    let seenUrl = '';
    let seenAuth = '';
    const fetchImpl: FetchLike = async (url, init) => {
      seenUrl = String(url);
      seenAuth = init?.headers?.['Authorization'] ?? '';
      return { ok: true, status: 200, text: async () => grobidTei(LONG_PROSE) };
    };
    const res = await fetchOpenAlexTeiFullText(route, { fetchImpl, apiKey: 'test-key' });
    expect(res.status).toBe('fetched');
    if (res.status === 'fetched') {
      expect(res.fetch.variant).toBe('openalex_tei_v1');
      expect(res.fetch.text).toContain('Deep sequencing');
      expect(res.fetch.license).toBeUndefined();
    }
    expect(seenUrl).not.toContain('api_key');
    expect(seenUrl).not.toContain('test-key');
    expect(seenAuth).toBe('Bearer test-key');
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

// ---------------------------------------------------------------------------
// MULTIMODAL SDM wiring (2026-08-24): every fetched fulltext also carries the
// SDM-1 structured understanding of the SAME payload. The legacy text
// projection stays byte-identical (corpus artifacts/receipts unaffected);
// tables/figures/equations/citations the regex text route must drop are
// recovered by the deterministic parsers. No network — injected fixtures.
// ---------------------------------------------------------------------------

const validSdm = (sdm: unknown): boolean => SdmDocument.safeParse(JSON.parse(JSON.stringify(sdm))).success;

describe('fulltext fetch SDM wiring', () => {
  it('arxiv_html: legacy text unchanged, SDM recovers the table grid the text route drops', async () => {
    const route: FullTextRoute = { kind: 'arxiv_html', id: '2401.04088', sourceUrl: 'https://arxiv.org/html/2401.04088' };
    const res = await fetchArxivHtmlFullText(route, { fetchImpl: statusFetch(200, ltxHtml(LONG_PROSE)) });
    expect(res.status).toBe('fetched');
    if (res.status !== 'fetched') return;
    const { text, sdm } = res.fetch;
    expect(validSdm(sdm)).toBe(true);
    expect(sdm.extractor.route).toBe('latexml_html');
    expect(sdm.origin).toMatchObject({ kind: 'network', url: route.sourceUrl });
    expect(sdm.diagnostics.parseStatus).not.toBe('failed');
    expect(text).not.toContain('1'); // legacy projection: table numbers were always dropped here
    expect(sdm.tables.length).toBeGreaterThanOrEqual(1);
    expect(sdm.tables[0]!.grid.flat()).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('europepmc_jats: SDM carries network origin and the extracted license', async () => {
    const route: FullTextRoute = { kind: 'europepmc_jats', id: 'PMC11032673', sourceUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11032673/fullTextXML' };
    const body =
      `<?xml version="1.0"?><article><front><permissions>` +
      `<license license-type="open-access"><license-p>This article is distributed under CC BY 4.0 terms</license-p></license>` +
      `</permissions><article-meta><article-title>Fixture Study</article-title></article-meta></front>` +
      `<body><sec><title>Results</title><p>${LONG_PROSE}</p></sec></body></article>`;
    const res = await fetchEuropePmcFullText(route, { fetchImpl: statusFetch(200, body) });
    expect(res.status).toBe('fetched');
    if (res.status !== 'fetched') return;
    expect(validSdm(res.fetch.sdm)).toBe(true);
    expect(res.fetch.sdm.extractor.route).toBe('jats_xml');
    expect(res.fetch.sdm.origin).toMatchObject({ kind: 'network', url: route.sourceUrl });
    expect(res.fetch.sdm.origin.license ?? '').toMatch(/CC BY 4\.0/);
    expect(res.fetch.sdm.meta.title).toBe('Fixture Study');
  });

  it('openalex_tei: SDM route grobid_tei with network origin', async () => {
    const route: FullTextRoute = { kind: 'openalex_tei', id: 'W3035965352', sourceUrl: 'https://content.openalex.org/works/W3035965352.grobid-xml' };
    const res = await fetchOpenAlexTeiFullText(route, { fetchImpl: statusFetch(200, grobidTei(LONG_PROSE)), apiKey: 'test-key' });
    expect(res.status).toBe('fetched');
    if (res.status !== 'fetched') return;
    expect(validSdm(res.fetch.sdm)).toBe(true);
    expect(res.fetch.sdm.extractor.route).toBe('grobid_tei');
    expect(res.fetch.sdm.origin).toMatchObject({ kind: 'network', url: route.sourceUrl });
  });

  it('fetched SDM persists content-addressed and round-trips via loadSdmByRef (evidence-stage persistence contract)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ft-sdm-'));
    try {
      const store = openArtifactStore(join(dir, 'artifacts'));
      const route: FullTextRoute = { kind: 'arxiv_html', id: '2401.04088', sourceUrl: 'https://arxiv.org/html/2401.04088' };
      const res = await fetchArxivHtmlFullText(route, { fetchImpl: statusFetch(200, ltxHtml(LONG_PROSE)) });
      if (res.status !== 'fetched') throw new Error('fixture fetch must succeed');
      // The evidence stage's exact persistence shape (05→04 handoff patch):
      // text artifact for the corpus + SDM artifact for the structured view.
      const textRef = (await store.put(res.fetch.text)).ref;
      const sdmRef = (await ingestSdm(store, res.fetch.sdm)).artifactRef;
      expect(sdmRef).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(sdmRef).not.toBe(textRef);
      const back = await loadSdmByRef(store, sdmRef!);
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.doc).toEqual(res.fetch.sdm);
      const missing = await loadSdmByRef(store, textRef);
      expect(missing.ok).toBe(false); // a text artifact is honestly not an SDM
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
