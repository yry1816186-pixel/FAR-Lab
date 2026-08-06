// tests/v2_domain/external_reference.test.ts
//
// IMPL-026 — External reference snapshots + availability state classification + content drift.
//
// Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §5 (IRG-005).
//
// TDD RED phase: module does not exist yet → import fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExternalReferenceSnapshot,
  classifyContentDrift,
} from '../../src/v2_domain/external_reference.ts';
import { EXTERNAL_REFERENCE_AVAILABILITY_STATES } from '../../src/v2_domain/algorithm_registry.ts';

// ---------------------------------------------------------------------------
// buildExternalReferenceSnapshot — availability state classification
// ---------------------------------------------------------------------------

test('snapshot: httpStatus 200 → RESOLVED', () => {
  const snap = buildExternalReferenceSnapshot(
    'https://example.com/paper.pdf',
    200,
    'abc123hash',
    '2026-08-05T12:00:00Z',
    [],
  );
  assert.equal(snap.availabilityState, 'RESOLVED');
});

test('snapshot: httpStatus 302 → REDIRECTED', () => {
  const snap = buildExternalReferenceSnapshot(
    'https://example.com/old-link',
    302,
    'def456hash',
    '2026-08-05T12:00:00Z',
    ['https://example.com/old-link', 'https://example.com/new-link'],
  );
  assert.equal(snap.availabilityState, 'REDIRECTED');
  assert.deepEqual(snap.redirectChain, [
    'https://example.com/old-link',
    'https://example.com/new-link',
  ]);
});

test('snapshot: httpStatus 403 → FORBIDDEN', () => {
  const snap = buildExternalReferenceSnapshot(
    'https://example.com/private',
    403,
    '',
    '2026-08-05T12:00:00Z',
    [],
  );
  assert.equal(snap.availabilityState, 'FORBIDDEN');
});

test('snapshot: httpStatus 404 → NOT_FOUND', () => {
  const snap = buildExternalReferenceSnapshot(
    'https://example.com/missing',
    404,
    '',
    '2026-08-05T12:00:00Z',
    [],
  );
  assert.equal(snap.availabilityState, 'NOT_FOUND');
});

test('snapshot: httpStatus 401 → AUTH_REQUIRED', () => {
  const snap = buildExternalReferenceSnapshot(
    'https://example.com/protected',
    401,
    '',
    '2026-08-05T12:00:00Z',
    [],
  );
  assert.equal(snap.availabilityState, 'AUTH_REQUIRED');
});

test('snapshot: unknown httpStatus 500 → falls back to NOT_FOUND (fail-closed)', () => {
  const snap = buildExternalReferenceSnapshot(
    'https://example.com/error',
    500,
    '',
    '2026-08-05T12:00:00Z',
    [],
  );
  assert.equal(snap.availabilityState, 'NOT_FOUND');
});

// ---------------------------------------------------------------------------
// snapshot structure
// ---------------------------------------------------------------------------

test('snapshot: has url, availabilityState, contentHash, fetchedAt, redirectChain, snapshotDigest', () => {
  const snap = buildExternalReferenceSnapshot(
    'https://example.com/doc',
    200,
    'hash123',
    '2026-08-05T12:00:00Z',
    [],
  );

  assert.equal(snap.url, 'https://example.com/doc');
  assert.equal(snap.availabilityState, 'RESOLVED');
  assert.equal(snap.contentHash, 'hash123');
  assert.equal(snap.fetchedAt, '2026-08-05T12:00:00Z');
  assert.deepEqual(snap.redirectChain, []);
  assert.equal(typeof snap.snapshotDigest, 'string');
  assert.match(snap.snapshotDigest, /^[0-9a-f]{64}$/);
});

test('snapshot: snapshotDigest is sha256 of canonical json (excludes itself)', async () => {
  const { createHash } = await import('node:crypto');
  const { default: stableStringify } = await import('fast-json-stable-stringify');

  const snap = buildExternalReferenceSnapshot(
    'https://example.com/repro',
    200,
    'content-hash-value',
    '2026-08-05T12:00:00Z',
    [],
  );

  // Reconstruct the pre-digest payload (everything except snapshotDigest)
  const payload = {
    url: snap.url,
    availabilityState: snap.availabilityState,
    contentHash: snap.contentHash,
    fetchedAt: snap.fetchedAt,
    redirectChain: snap.redirectChain,
  };
  const canonical = stableStringify(payload);
  assert.ok(canonical !== undefined);
  const expectedDigest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  assert.equal(snap.snapshotDigest, expectedDigest);
});

// ---------------------------------------------------------------------------
// classifyContentDrift
// ---------------------------------------------------------------------------

test('classifyContentDrift: same hash → STABLE', () => {
  assert.equal(classifyContentDrift('abc123', 'abc123'), 'STABLE');
});

test('classifyContentDrift: different hash → CONTENT_DRIFT', () => {
  assert.equal(classifyContentDrift('abc123', 'def456'), 'CONTENT_DRIFT');
});

test('classifyContentDrift: empty strings same → STABLE', () => {
  assert.equal(classifyContentDrift('', ''), 'STABLE');
});

test('classifyContentDrift: one empty → CONTENT_DRIFT', () => {
  assert.equal(classifyContentDrift('abc', ''), 'CONTENT_DRIFT');
});

// ---------------------------------------------------------------------------
// Integration: EXTERNAL_REFERENCE_AVAILABILITY_STATES linkage
// ---------------------------------------------------------------------------

test('availability states include all expected values from registry', () => {
  const states = [...EXTERNAL_REFERENCE_AVAILABILITY_STATES];
  assert.ok(states.includes('RESOLVED'));
  assert.ok(states.includes('REDIRECTED'));
  assert.ok(states.includes('FORBIDDEN'));
  assert.ok(states.includes('NOT_FOUND'));
  assert.ok(states.includes('CONTENT_DRIFT'));
  assert.ok(states.includes('AUTH_REQUIRED'));
  assert.ok(states.includes('LICENSE_BLOCKED'));
  assert.equal(states.length, 7);
});
