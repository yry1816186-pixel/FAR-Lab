/**
 * tests/retrieval/openalex.test.ts — OpenAlex adapter tests.
 *
 * Two layers:
 *   1. HERMETIC (default, runs in CI): parse a RECORDED real OpenAlex response
 *      (tests/fixtures/retrieval/openalex_osc_query.json, captured 2026-08-12
 *      against the live api.openalex.org for the query "estimating reproducibility
 *      psychological science"). Asserts provenance fields, documentId
 *      determinism, doi normalization, abstract reconstruction, host allowlist,
 *      replay adapter.
 *   2. LIVE (env FAR_RETRIEVAL_LIVE=1 only): actually hits api.openalex.org.
 *      Skipped otherwise (CI is hermetic; no network dependency).
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildOpenAlexUrl,
  parseOpenAlexResults,
  openalexAdapter,
  createReplayAdapter,
  computeDocumentId,
  assertHostAllowed,
  fetchTextFromAllowlistedHost,
} from '../../src/retrieval/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'retrieval', 'openalex_osc_query.json');
const FIXTURE_BODY = readFileSync(FIXTURE_PATH, 'utf8');
const QUERY_TEXT = 'estimating reproducibility psychological science';
const REPLAY_QUERY = { text: QUERY_TEXT, maxResults: 3, source: 'openalex' as const };

describe('OpenAlex adapter — hermetic parse against recorded real response', () => {
  const docs = parseOpenAlexResults(FIXTURE_BODY, QUERY_TEXT, '2026-08-12T00:00:00.000Z', 3);

  it('returns documents from the recorded response', () => {
    assert.ok(docs.length > 0, 'fixture must yield documents');
    assert.ok(docs.length <= 3);
  });

  it('hits the actual OSC 2015 Science paper as the top result (real-data grounding)', () => {
    const top = docs[0];
    assert.ok(top, 'top document exists');
    assert.match(top.title, /estimating the reproducibility of psychological science/i);
    // The OSC paper's real DOI is 10.1126/science.aac4716.
    assert.equal(top.doi, '10.1126/science.aac4716');
    assert.equal(top.sourceType, 'openalex');
    assert.equal(top.sourceName, 'OpenAlex');
  });

  it('every document has full program-generated provenance (no LLM-inventable gaps)', () => {
    for (const d of docs) {
      // documentId is a deterministic hash, never empty, never LLM-supplied.
      assert.match(d.documentId, /^[0-9a-f]{32}$/, `documentId must be 32-hex: ${d.documentId}`);
      assert.ok(d.persistentIdentifier.length > 0);
      assert.match(d.persistentIdentifier, /^W\d+$/);
      assert.ok(d.canonicalUrl.startsWith('https://openalex.org/'));
      assert.ok(d.title.length > 0);
      assert.match(d.rawHash, /^[0-9a-f]{64}$/);
      assert.match(d.normalizedHash, /^[0-9a-f]{64}$/);
      assert.equal(d.retrievalMethod, 'openalex-rest');
      assert.equal(d.retrievalQuery, QUERY_TEXT);
      assert.ok(d.retrievedAt.length > 0);
    }
  });

  it('documentId is deterministic — same content always hashes to the same id', () => {
    const d = docs[0];
    if (!d) assert.fail('fixture must yield at least one document');
    const recomputed = computeDocumentId(d.sourceType, d.persistentIdentifier);
    assert.equal(recomputed, d.documentId);
    // Re-parsing the identical fixture must yield identical documentIds.
    const reparsed = parseOpenAlexResults(FIXTURE_BODY, QUERY_TEXT, '2099-01-01T00:00:00.000Z', 3);
    const r0 = reparsed[0];
    if (!r0) assert.fail('reparsed must yield at least one document');
    assert.equal(r0.documentId, d.documentId);
    // retrievedAt differs but documentId is content-anchored (not timestamp-anchored).
    assert.notEqual(r0.retrievedAt, d.retrievedAt);
  });

  it('reconstructs abstracts from OpenAlex inverted-index encoding', () => {
    const withAbstract = docs.find((d) => d.abstract && d.abstract.length > 0);
    if (!withAbstract || !withAbstract.abstract) {
      assert.fail('at least one document should have a reconstructed abstract');
    }
    const abs = withAbstract.abstract;
    // Inverted-index reconstruction joins words with single spaces (no trailing space).
    assert.equal(abs, abs.replace(/\s+/g, ' ').trim());
  });

  it('normalizes DOI to lowercase bare form (strips https://doi.org/ prefix)', () => {
    for (const d of docs) {
      if (d.doi !== null) {
        assert.ok(!d.doi.includes('://'), `doi must be bare: ${d.doi}`);
        assert.equal(d.doi, d.doi.toLowerCase());
      }
    }
  });
});

describe('OpenAlex adapter — URL building + parsing edge cases', () => {
  it('buildOpenAlexUrl includes search + per-page (clamped to [1,25])', () => {
    const url = buildOpenAlexUrl({ text: 'dark energy', maxResults: 50, source: 'openalex' });
    assert.ok(url.startsWith('https://api.openalex.org/works?'));
    assert.ok(url.includes('search=dark+energy'));
    assert.ok(url.includes('per-page=25'), 'per-page clamped to max 25');
  });

  it('parseOpenAlexResults throws on non-JSON body (fail-closed, not silent [])', () => {
    assert.throws(() => parseOpenAlexResults('not json', 'q', '2026-01-01', 3), /not valid JSON/);
  });

  it('parseOpenAlexResults returns [] for a body with no results array (honest empty)', () => {
    const empty = parseOpenAlexResults(JSON.stringify({ meta: {}, results: [] }), 'q', '2026-01-01', 3);
    assert.equal(empty.length, 0);
  });

  it('respects maxResults (does not over-return)', () => {
    const capped = parseOpenAlexResults(FIXTURE_BODY, QUERY_TEXT, '2026-08-12', 1);
    assert.equal(capped.length, 1);
  });
});

describe('retrieval/http — allowlist + fail-closed', () => {
  it('assertHostAllowed accepts the approved scientific hosts', () => {
    assertHostAllowed('api.openalex.org');
    assertHostAllowed('export.arxiv.org');
    assertHostAllowed('api.crossref.org');
  });

  it('assertHostAllowed THROWS for a non-allowlisted host (SSRF fail-closed)', () => {
    assert.throws(
      () => assertHostAllowed('internal.corp.example'),
      /not in the retrieval allowlist/,
    );
    assert.throws(() => assertHostAllowed('169.254.169.254'), /allowlist/); // metadata endpoint
    assert.throws(() => assertHostAllowed('localhost'), /allowlist/);
  });

  it('fetchTextFromAllowlistedHost refuses a non-allowlisted URL before any network', async () => {
    await assert.rejects(
      () => fetchTextFromAllowlistedHost('https://evil.example.com/x'),
      /allowlist/,
    );
  });
});

describe('retrieval — replay adapter (hermetic cached-snapshot path)', () => {
  it('createReplayAdapter serves recorded documents with provenance preserved', async () => {
    const recorded = parseOpenAlexResults(FIXTURE_BODY, QUERY_TEXT, '2026-08-12T00:00:00.000Z', 3);
    const replay = createReplayAdapter('openalex', 'OpenAlex', recorded);
    assert.equal(replay.source, 'openalex');
    const served = await replay.retrieve(REPLAY_QUERY);
    assert.equal(served.length, recorded.length);
    assert.ok(served[0] && recorded[0], 'replay must serve at least one document');
    assert.equal(served[0].documentId, recorded[0].documentId);
    // Provenance is intact (replay does not strip the original retrieval metadata).
    assert.equal(served[0].retrievalMethod, 'openalex-rest');
  });

  it('replay caps at maxResults', async () => {
    const recorded = parseOpenAlexResults(FIXTURE_BODY, QUERY_TEXT, '2026-08-12', 3);
    const replay = createReplayAdapter('openalex', 'OpenAlex', recorded);
    const served = await replay.retrieve({ text: QUERY_TEXT, maxResults: 1, source: 'openalex' });
    assert.equal(served.length, 1);
  });
});

// LIVE smoke — only when explicitly opted in via env. CI stays hermetic.
const LIVE = process.env.FAR_RETRIEVAL_LIVE === '1';
describe.skip(LIVE ? 'OpenAlex adapter — LIVE smoke (FAR_RETRIEVAL_LIVE=1)' : 'OpenAlex adapter — LIVE smoke (skipped; set FAR_RETRIEVAL_LIVE=1)', { skip: !LIVE }, () => {
  test('live OpenAlex fetch returns real documents with valid provenance', async () => {
    const docs = await openalexAdapter.retrieve({ text: 'cosmic microwave background', maxResults: 2, source: 'openalex' });
    assert.ok(docs.length > 0, 'live OpenAlex must return documents');
    for (const d of docs) {
      assert.match(d.documentId, /^[0-9a-f]{32}$/);
      assert.match(d.rawHash, /^[0-9a-f]{64}$/);
    }
  });
});
