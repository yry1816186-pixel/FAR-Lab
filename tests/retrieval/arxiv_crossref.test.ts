/**
 * tests/retrieval/arxiv_crossref.test.ts — arXiv + Crossref adapter tests.
 *
 * The dev sandbox (2026-08-12) could reach OpenAlex but NOT export.arxiv.org
 * (timeouts) or api.crossref.org (network errors). So these tests use SYNTHETIC
 * TEST-ONLY fixtures that faithfully mirror the real Atom/JSON formats
 * (directive §38/§48). The PARSERS are the unit under test. Real-behavior
 * verification = the env-gated LIVE smokes (FAR_RETRIEVAL_LIVE=1), runnable on
 * a network-capable machine (CI / user dev box).
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseArxivResults,
  buildArxivUrl,
  arxivAdapter,
  parseCrossrefResults,
  buildCrossrefUrl,
  crossrefAdapter,
  resolveCrossrefDoi,
  computeDocumentId,
} from '../../src/retrieval/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARXIV_FIXTURE = readFileSync(join(__dirname, '..', 'fixtures', 'retrieval', 'arxiv_synthetic_sample.xml'), 'utf8');
const CROSSREF_FIXTURE = readFileSync(join(__dirname, '..', 'fixtures', 'retrieval', 'crossref_synthetic_sample.json'), 'utf8');
const LIVE = process.env.FAR_RETRIEVAL_LIVE === '1';

// ---------------------------------------------------------------------------
// arXiv
// ---------------------------------------------------------------------------

describe('arXiv adapter — hermetic parse against synthetic Atom fixture', () => {
  const docs = parseArxivResults(ARXIV_FIXTURE, 'test query', '2026-08-12T00:00:00.000Z', 5);

  it('parses valid entries and SKIPS the malformed one (fail-closed)', () => {
    // 3 entries in fixture; entry 3 has no valid arxiv id → skipped → 2 docs.
    assert.equal(docs.length, 2);
  });

  it('extracts arxiv id (version suffix stripped) + builds canonical URL', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two arXiv docs');
    assert.equal(a.persistentIdentifier, '2501.12345', 'v2 suffix stripped');
    assert.equal(a.canonicalUrl, 'http://arxiv.org/abs/2501.12345');
    assert.equal(b.persistentIdentifier, '2407.98765');
  });

  it('unescapes XML entities in title & summary (&amp; &lt; &gt; &quot;)', () => {
    const d = docs[0];
    if (!d || !d.abstract) assert.fail('first doc + abstract missing');
    assert.ok(d.title.includes('H0 & implications'), `amp unescaped: ${d.title}`);
    assert.ok(d.title.includes('<Lambda>'), `lt/gt unescaped: ${d.title}`);
    assert.ok(d.abstract.includes('"tension"'), `quot unescaped: ${d.abstract}`);
  });

  it('extracts multiple authors in order', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two arXiv docs');
    assert.deepEqual(a.authors, ['Alice Einstein', 'Bob Newton']);
    assert.deepEqual(b.authors, ['Carol Curie']);
  });

  it('extracts optional arxiv:doi (present on entry 1, absent on entry 2)', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two arXiv docs');
    assert.equal(a.doi, '10.3847/2041-8213/abcd1234');
    assert.equal(b.doi, null);
  });

  it('derives publication date from <published> ISO timestamp', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two arXiv docs');
    assert.equal(a.publicationDate, '2025-01-15');
    assert.equal(b.publicationDate, '2024-07-10');
  });

  it('every document has full program-generated provenance', () => {
    for (const d of docs) {
      assert.match(d.documentId, /^[0-9a-f]{32}$/);
      assert.equal(d.sourceType, 'arxiv');
      assert.equal(d.sourceName, 'arXiv');
      assert.equal(d.retrievalMethod, 'arxiv-api-atom');
      assert.match(d.rawHash, /^[0-9a-f]{64}$/);
      assert.match(d.normalizedHash, /^[0-9a-f]{64}$/);
    }
  });

  it('documentId is deterministic', () => {
    const d = docs[0];
    if (!d) assert.fail('doc missing');
    assert.equal(computeDocumentId('arxiv', d.persistentIdentifier, d.normalizedHash), d.documentId);
  });

  it('respects maxResults', () => {
    const capped = parseArxivResults(ARXIV_FIXTURE, 'q', '2026-08-12', 1);
    assert.equal(capped.length, 1);
  });

  it('buildArxivUrl encodes the all-field search', () => {
    const url = buildArxivUrl({ text: 'dark energy', maxResults: 5, source: 'arxiv' });
    assert.ok(url.startsWith('http://export.arxiv.org/api/query?'));
    assert.ok(url.includes('search_query=all%3Adark+energy'));
    assert.ok(url.includes('max_results=5'));
  });

  it('returns [] for a body with no entries (honest empty, not crash)', () => {
    const empty = parseArxivResults('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', 'q', '2026-08-12', 5);
    assert.equal(empty.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Crossref
// ---------------------------------------------------------------------------

describe('Crossref adapter — hermetic parse against synthetic JSON fixture', () => {
  const docs = parseCrossrefResults(CROSSREF_FIXTURE, 'test query', '2026-08-12T00:00:00.000Z', 5);

  it('parses items with DOIs and SKIPS the no-DOI item (fail-closed)', () => {
    assert.equal(docs.length, 2, 'item 3 (no DOI) skipped');
  });

  it('normalizes DOI to lowercase bare form', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two Crossref docs');
    assert.equal(a.doi, '10.1126/science.aac4716');
    assert.equal(b.doi, '10.1038/s41586-021-03819-2');
    assert.equal(a.persistentIdentifier, a.doi, 'Crossref persistent id IS the DOI');
  });

  it('strips JATS XML tags from abstracts', () => {
    const d = docs[0];
    if (!d) assert.fail('doc missing');
    assert.ok(d.abstract, 'abstract present');
    assert.ok(!d.abstract!.includes('<'), `no tags remain: ${d.abstract}`);
    assert.ok(d.abstract!.includes('100'), 'content preserved');
  });

  it('reconstructs dates from date-parts (full + year-only)', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two Crossref docs');
    assert.equal(a.publicationDate, '2015-08-28');
    assert.equal(b.publicationDate, '2021', 'year-only date-parts');
  });

  it('joins given+family author names', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two Crossref docs');
    assert.deepEqual(a.authors, ['Open Science Collaboration']);
    assert.deepEqual(b.authors, ['John Jumper', 'Richard Evans']);
  });

  it('captures license when present, null when absent', () => {
    const [a, b] = docs;
    if (!a || !b) assert.fail('expected two Crossref docs');
    assert.equal(a.licenseMetadata, 'https://creativecommons.org/licenses/by/4.0/');
    assert.equal(b.licenseMetadata, null);
  });

  it('every document has full program-generated provenance', () => {
    for (const d of docs) {
      assert.match(d.documentId, /^[0-9a-f]{32}$/);
      assert.equal(d.sourceType, 'crossref');
      assert.equal(d.sourceName, 'Crossref');
      assert.equal(d.retrievalMethod, 'crossref-rest');
      assert.match(d.rawHash, /^[0-9a-f]{64}$/);
    }
  });

  it('buildCrossrefUrl encodes query + rows', () => {
    const url = buildCrossrefUrl({ text: 'dark matter', maxResults: 30, source: 'crossref' });
    assert.ok(url.startsWith('https://api.crossref.org/works?'));
    assert.ok(url.includes('query=dark+matter'));
    assert.ok(url.includes('rows=25'), 'rows clamped to max 25');
  });

  it('returns [] for a body with no items array (honest empty)', () => {
    const empty = parseCrossrefResults(JSON.stringify({ message: { items: [] } }), 'q', '2026-08-12', 5);
    assert.equal(empty.length, 0);
  });

  it('throws on non-JSON body (fail-closed)', () => {
    assert.throws(() => parseCrossrefResults('not json', 'q', '2026-08-12', 5), /not valid JSON/);
  });
});

// ---------------------------------------------------------------------------
// LIVE smokes — env-gated (FAR_RETRIEVAL_LIVE=1). CI / this sandbox skips them.
// Run on a network-capable machine: FAR_RETRIEVAL_LIVE=1 pnpm test --test tests/retrieval/
// ---------------------------------------------------------------------------

describe.skip(LIVE ? 'arXiv/Crossref — LIVE smoke (FAR_RETRIEVAL_LIVE=1)' : 'arXiv/Crossref — LIVE smoke (skipped; set FAR_RETRIEVAL_LIVE=1)', { skip: !LIVE }, () => {
  test('live arXiv fetch returns real documents', async () => {
    const docs = await arxivAdapter.retrieve({ text: 'exoplanet transit', maxResults: 2, source: 'arxiv' });
    assert.ok(docs.length > 0);
    for (const d of docs) assert.match(d.documentId, /^[0-9a-f]{32}$/);
  });

  test('live Crossref fetch returns real documents', async () => {
    const docs = await crossrefAdapter.retrieve({ text: 'dark matter', maxResults: 2, source: 'crossref' });
    assert.ok(docs.length > 0);
    for (const d of docs) assert.match(d.documentId, /^[0-9a-f]{32}$/);
  });

  test('resolveCrossrefDoi resolves a known DOI (10.1126/science.aac4716)', async () => {
    const doc = await resolveCrossrefDoi('10.1126/science.aac4716');
    assert.ok(doc, 'OSC paper DOI must resolve');
    assert.equal(doc!.doi, '10.1126/science.aac4716');
  });

  test('resolveCrossrefDoi returns null for a fabricated DOI (fail-closed)', async () => {
    const doc = await resolveCrossrefDoi('10.9999/this-doi-does-not-exist-xyz');
    assert.equal(doc, null, 'fabricated DOI must NOT resolve');
  });
});
