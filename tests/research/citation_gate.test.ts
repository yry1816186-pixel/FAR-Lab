/**
 * tests/research/citation_gate.test.ts — the deterministic citation gate.
 *
 * Pins directive §9.5 hard rules:
 *   - unbound citations are excluded from effective evidence and NAMED;
 *   - primary selection requires 100% binding when any candidate qualifies;
 *   - no fully-bound candidate → gateVerdict INCONCLUSIVE (honest degradation).
 * The report is pure: same bindings → byte-identical report.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildEvidenceRelations, computeCitationGateReport } from '../../src/research/citation_gate.ts';
import type { CitationBinding } from '../../src/research/types.ts';
import type { RetrievedDocument } from '../../src/retrieval/types.ts';

function binding(overrides: Partial<CitationBinding> = {}): CitationBinding {
  return {
    supportingIds: ['d1'],
    counterIds: ['d2'],
    boundSupporting: [],
    boundCounter: [],
    unbound: [],
    allBound: true,
    snapshotId: 'snap',
    relations: [],
    ...overrides,
  };
}

/** A resolved document stub for bindings. */
function boundDoc(id: string): RetrievedDocument {
  return {
    documentId: id,
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier: `W-${id}`,
    doi: null,
    canonicalUrl: `https://example.org/${id}`,
    title: `doc ${id}`,
    authors: ['A. Author'],
    publicationDate: '2024-01-01',
    retrievedAt: 't',
    retrievalQuery: 'q',
    retrievalMethod: 'm',
    rawHash: `raw-${id}`,
    normalizedHash: `norm-${id}`,
    parserVersion: 'p',
    abstract: null,
    licenseMetadata: null,
  };
}

describe('buildEvidenceRelations', () => {
  it('derives supports/contradicts relations with honest nulls', () => {
    const b = binding();
    const relations = buildEvidenceRelations('h1', b);
    assert.deepEqual(
      relations.map((r) => [r.documentId, r.relation, r.validationStatus, r.extractedBy]),
      [
        ['d1', 'supports', 'unbound', 'model'],
        ['d2', 'contradicts', 'unbound', 'model'],
      ],
    );
    for (const r of relations) {
      assert.equal(r.locator, null);
      assert.equal(r.quality, null);
      assert.equal(r.validatedBy, null);
      assert.match(r.failureReason ?? '', /excluded from effective evidence/);
    }
  });

  it('marks relations bound when the document resolves', () => {
    const b = binding({
      boundSupporting: [
        {
          documentId: 'd1',
          sourceType: 'openalex',
          sourceName: 'OpenAlex',
          persistentIdentifier: 'W1',
          doi: null,
          canonicalUrl: 'https://example.org/d1',
          title: 't',
          authors: [],
          publicationDate: null,
          retrievedAt: 't',
          retrievalQuery: 'q',
          retrievalMethod: 'm',
          rawHash: 'r',
          normalizedHash: 'n',
          parserVersion: 'p',
          abstract: null,
          licenseMetadata: null,
        },
      ],
    });
    const relations = buildEvidenceRelations('h1', b);
    const support = relations.find((r) => r.documentId === 'd1');
    assert.equal(support?.validationStatus, 'bound');
    assert.equal(support?.validatedBy, 'deterministic-bind');
    assert.equal(support?.failureReason, null);
  });
});

describe('computeCitationGateReport', () => {
  it('PASS when every citation is bound', () => {
    const report = computeCitationGateReport({
      bindings: {
        h1: binding({
          allBound: true,
          unbound: [],
          counterIds: [],
          boundSupporting: [boundDoc('d1')],
        }),
      },
      primaryHypothesisId: 'h1',
    });
    assert.equal(report.gateVerdict, 'PASS');
    assert.equal(report.boundRate, 1);
    assert.equal(report.unboundEvidenceCount, 0);
    assert.equal(report.primaryAllBound, true);
  });

  it('DEGRADED when some unbound exist but the primary is fully bound', () => {
    const report = computeCitationGateReport({
      bindings: {
        h1: binding({ allBound: true, unbound: [], counterIds: [], boundSupporting: [boundDoc('d1')] }),
        h2: binding({
          allBound: false,
          unbound: ['ghost'],
          supportingIds: ['ghost'],
          counterIds: [],
          boundSupporting: [],
        }),
      },
      primaryHypothesisId: 'h1',
    });
    assert.equal(report.gateVerdict, 'DEGRADED');
    assert.equal(report.unboundEvidenceCount, 1);
    assert.equal(report.primaryAllBound, true);
    assert.equal(report.boundRate, 0.5);
  });

  it('INCONCLUSIVE when no candidate is fully bound', () => {
    const report = computeCitationGateReport({
      bindings: {
        h1: binding({ allBound: false, unbound: ['ghost-a'], supportingIds: ['ghost-a'], counterIds: [] }),
        h2: binding({ allBound: false, unbound: ['ghost-b'], supportingIds: ['ghost-b'], counterIds: [] }),
      },
      primaryHypothesisId: 'h1',
    });
    assert.equal(report.gateVerdict, 'INCONCLUSIVE');
    assert.equal(report.primaryAllBound, false);
  });

  it('is deterministic (same input → byte-identical report)', () => {
    const input = {
      bindings: { h1: binding({ allBound: false, unbound: ['ghost'] }) },
      primaryHypothesisId: 'h1',
    };
    assert.deepEqual(computeCitationGateReport(input), computeCitationGateReport(input));
  });
});
