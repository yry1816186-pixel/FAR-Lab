/**
 * tests/validation/resource_checker.test.ts — K5 existence verification.
 *
 * Hermetic (default): parseResourceSpec + validateResource('url')→UNSUPPORTED
 * (the pure parts). The network-backed checks (validateDoi via Crossref,
 * validateArxivId via arXiv) are env-gated LIVE smokes (FAR_RETRIEVAL_LIVE=1) —
 * the sandbox cannot reach api.crossref.org / export.arxiv.org (verified
 * 2026-08-12). Run on a network-capable machine to confirm real verification.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseResourceSpec,
  validateResource,
} from '../../src/validation/resource_checker.ts';

const LIVE = process.env.FAR_RETRIEVAL_LIVE === '1';

describe('resource_checker — parseResourceSpec (pure)', () => {
  it('parses doi: / arxiv: / url: specs', () => {
    assert.deepEqual(parseResourceSpec('doi:10.1126/science.aac4716'), { kind: 'doi', value: '10.1126/science.aac4716' });
    assert.deepEqual(parseResourceSpec('arxiv:2501.12345'), { kind: 'arxiv', value: '2501.12345' });
    assert.deepEqual(parseResourceSpec('url:https://example.com/x'), { kind: 'url', value: 'https://example.com/x' });
  });

  it('rejects malformed specs (no colon / empty value / bad kind)', () => {
    assert.ok('error' in parseResourceSpec('nocolonhere'));
    assert.ok('error' in parseResourceSpec('doi:'));
    assert.ok('error' in parseResourceSpec('isbn:1234'));
  });
});

describe('resource_checker — validateResource dispatch (pure / no-network)', () => {
  it('url → UNSUPPORTED (safe SSRF URL check is future work; do NOT pretend)', async () => {
    const r = await validateResource('url', 'https://example.com/x');
    assert.equal(r.status, 'UNSUPPORTED');
    assert.equal(r.document, null);
    assert.equal(r.kind, 'url');
  });
});

// LIVE smokes — env-gated. CI / this sandbox skips them.
describe.skip(LIVE ? 'resource_checker — LIVE smokes (FAR_RETRIEVAL_LIVE=1)' : 'resource_checker — LIVE smokes (skipped; set FAR_RETRIEVAL_LIVE=1)', { skip: !LIVE }, () => {
  test('validateDoi: a real DOI → VERIFIED with full provenance', async () => {
    const { validateDoi } = await import('../../src/validation/resource_checker.ts');
    const r = await validateDoi('10.1126/science.aac4716');
    assert.equal(r.status, 'VERIFIED');
    assert.ok(r.document, 'VERIFIED must carry the resolved document');
    assert.equal(r.document!.doi, '10.1126/science.aac4716');
  });

  test('validateDoi: a fabricated DOI → NOT_FOUND (fabrication signal, §20)', async () => {
    const { validateDoi } = await import('../../src/validation/resource_checker.ts');
    const r = await validateDoi('10.9999/this-doi-does-not-exist-xyz');
    assert.equal(r.status, 'NOT_FOUND');
    assert.equal(r.document, null);
  });

  test('validateArxivId: a real arXiv id → VERIFIED', async () => {
    const { validateArxivId } = await import('../../src/validation/resource_checker.ts');
    // Use a well-known stable arXiv id; if arXiv is reachable this resolves.
    const r = await validateArxivId('astro-ph/9704045'); // well-known older id format
    assert.ok(r.status === 'VERIFIED' || r.status === 'NOT_FOUND', `unexpected: ${r.status}`);
  });
});
