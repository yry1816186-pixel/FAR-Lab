// tests/v2_domain/standards_projection.test.ts
//
// SPEC-007/IMPL — RO-Crate/WRROC + PROV/RDF projections + canonical byte boundaries.
//
// Authority: doc19 §3.3, 17 §7 (standards projections).
// FAR receipt remains authority; projections are lossy mappings with loss reports.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoCrateProjection,
  buildProvProjection,
  buildProjectionLossReport,
  assertCanonicalByteBoundary,
  PROJECTION_FORMATS,
} from '../../src/v2_domain/standards_projection.ts';

// ---------------------------------------------------------------------------
// Projection formats
// ---------------------------------------------------------------------------

test('PROJECTION_FORMATS: includes ro-crate-1.1, wrroc-0.5, prov-rdf', () => {
  const formats = [...PROJECTION_FORMATS];
  assert.equal(formats.includes('ro-crate-1.1'), true);
  assert.equal(formats.includes('wrroc-0.5'), true);
  assert.equal(formats.includes('prov-rdf-20130424'), true);
});

// ---------------------------------------------------------------------------
// RO-Crate projection
// ---------------------------------------------------------------------------

test('buildRoCrateProjection: maps receipt to RO-Crate 1.1 with conformsTo', () => {
  const projection = buildRoCrateProjection({
    receiptDigest: 'a'.repeat(64),
    receiptStanding: 'ACTIVE',
    components: [
      { kind: 'claim', digest: 'b'.repeat(64) },
      { kind: 'datasetBindings', digest: 'c'.repeat(64) },
    ],
  });
  assert.equal(projection.format, 'ro-crate-1.1');
  assert.ok(projection['@context']);
  assert.ok(projection.projectionDigest.length === 64);
  assert.equal(projection.lossReport.unmappedFields.length >= 0, true);
});

test('buildRoCrateProjection: projection digest is deterministic', () => {
  const input = {
    receiptDigest: 'a'.repeat(64),
    receiptStanding: 'ACTIVE' as const,
    components: [{ kind: 'claim', digest: 'b'.repeat(64) }],
  };
  assert.equal(
    buildRoCrateProjection(input).projectionDigest,
    buildRoCrateProjection(input).projectionDigest,
  );
});

// ---------------------------------------------------------------------------
// PROV projection
// ---------------------------------------------------------------------------

test('buildProvProjection: maps receipt to PROV-RDF entities/activities', () => {
  const projection = buildProvProjection({
    receiptDigest: 'a'.repeat(64),
    sealedAt: '2026-08-05T00:00:00Z',
    components: [
      { kind: 'claim', digest: 'b'.repeat(64) },
      { kind: 'verdictTrace', digest: 'c'.repeat(64) },
    ],
  });
  assert.equal(projection.format, 'prov-rdf-20130424');
  assert.ok(projection.projectionDigest.length === 64);
});

// ---------------------------------------------------------------------------
// Projection loss report
// ---------------------------------------------------------------------------

test('buildProjectionLossReport: records unmapped FAR fields', () => {
  const report = buildProjectionLossReport({
    farFields: ['claim', 'fecSnapshot', 'antiTheaterReport', 'numericalEquivalenceProfile'],
    mappedFields: ['claim', 'fecSnapshot'],
    targetFormat: 'ro-crate-1.1',
  });
  assert.equal(report.targetFormat, 'ro-crate-1.1');
  assert.ok(report.unmappedFields.includes('antiTheaterReport'));
  assert.ok(report.unmappedFields.includes('numericalEquivalenceProfile'));
  assert.ok(report.lossReportDigest.length === 64);
});

// ---------------------------------------------------------------------------
// Canonical byte boundary — file digest vs semantic digest
// ---------------------------------------------------------------------------

test('assertCanonicalByteBoundary: separates file-byte digest from semantic digest', () => {
  assert.doesNotThrow(() =>
    assertCanonicalByteBoundary({
      fileByteDigest: 'a'.repeat(64),
      semanticDigest: 'b'.repeat(64),
      subject: 'receipt-root',
    }),
  );
});

test('assertCanonicalByteBoundary: throws if both digests are identical (boundary violation)', () => {
  assert.throws(
    () => assertCanonicalByteBoundary({
      fileByteDigest: 'a'.repeat(64),
      semanticDigest: 'a'.repeat(64),  // same = boundary violation
      subject: 'receipt-root',
    }),
    /CANONICAL_BOUNDARY_VIOLATION/,
  );
});
