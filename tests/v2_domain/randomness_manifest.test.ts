// tests/v2_domain/randomness_manifest.test.ts
//
// IMPL-027: Runtime verification of randomnessManifest — PRNG call fingerprint
// binding and stream derivation verification.
// Strict TDD — RED phase first.
//
// Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §3,
//            IRG-002 (randomness manifest).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRandomnessManifest,
  verifyRandomnessManifest,
  type StreamAssignment,
  type RandomnessManifest,
  type RandomnessVerificationResult,
} from '../../src/v2_domain/randomness_manifest.ts';
import { RANDOMNESS_PRNG_FAMILIES } from '../../src/v2_domain/algorithm_registry.ts';

// ---------------------------------------------------------------------------
// buildRandomnessManifest
// ---------------------------------------------------------------------------

test('buildRandomnessManifest: returns correct shape', () => {
  const manifest = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', [
    { consumer: 'entropy-pool', streamIndex: 0 },
    { consumer: 'sampling', streamIndex: 1 },
  ]);

  assert.equal(manifest.seed, 42);
  assert.equal(manifest.prngFamilyId, 'far.prng.mulberry32.v1');
  assert.equal(manifest.streamAssignments.length, 2);
  assert.equal(typeof manifest.callOrderFingerprint, 'string');
  assert.equal(manifest.callOrderFingerprint.length, 64); // sha256 hex
});

test('buildRandomnessManifest: deterministic — same inputs produce same fingerprint', () => {
  const assignments: StreamAssignment[] = [
    { consumer: 'entropy-pool', streamIndex: 0 },
    { consumer: 'sampling', streamIndex: 1 },
  ];

  const m1 = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', assignments);
  const m2 = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', assignments);
  assert.equal(m1.callOrderFingerprint, m2.callOrderFingerprint);
});

test('buildRandomnessManifest: sorts by streamIndex for canonical fingerprint', () => {
  // Order of input should not matter — must sort by streamIndex
  const a1: StreamAssignment[] = [
    { consumer: 'sampling', streamIndex: 1 },
    { consumer: 'entropy-pool', streamIndex: 0 },
  ];
  const a2: StreamAssignment[] = [
    { consumer: 'entropy-pool', streamIndex: 0 },
    { consumer: 'sampling', streamIndex: 1 },
  ];

  const m1 = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', a1);
  const m2 = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', a2);
  assert.equal(m1.callOrderFingerprint, m2.callOrderFingerprint);
});

test('buildRandomnessManifest: different seed → different fingerprint', () => {
  const assignments: StreamAssignment[] = [
    { consumer: 'entropy-pool', streamIndex: 0 },
  ];

  const m1 = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', assignments);
  const m2 = buildRandomnessManifest(99, 'far.prng.mulberry32.v1', assignments);
  assert.notEqual(m1.callOrderFingerprint, m2.callOrderFingerprint);
});

test('buildRandomnessManifest: different prngFamilyId → different fingerprint', () => {
  const assignments: StreamAssignment[] = [
    { consumer: 'entropy-pool', streamIndex: 0 },
  ];

  const m1 = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', assignments);
  const m2 = buildRandomnessManifest(42, 'far.prng.mulberry32.v2', assignments);
  assert.notEqual(m1.callOrderFingerprint, m2.callOrderFingerprint);
});

test('buildRandomnessManifest: empty streamAssignments → valid manifest with empty fingerprint', () => {
  const manifest = buildRandomnessManifest(0, 'far.prng.mulberry32.v1', []);
  assert.equal(manifest.streamAssignments.length, 0);
  assert.equal(typeof manifest.callOrderFingerprint, 'string');
  assert.equal(manifest.callOrderFingerprint.length, 64);
});

// ---------------------------------------------------------------------------
// verifyRandomnessManifest
// ---------------------------------------------------------------------------

test('verifyRandomnessManifest: correct call order → valid', () => {
  const manifest = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', [
    { consumer: 'entropy-pool', streamIndex: 0 },
    { consumer: 'sampling', streamIndex: 1 },
  ]);
  // Expected call order: sorted by streamIndex → ['entropy-pool', 'sampling']
  const result = verifyRandomnessManifest(manifest, ['entropy-pool', 'sampling']);
  assert.equal(result, 'valid');
});

test('verifyRandomnessManifest: wrong call order → call_order_mismatch', () => {
  const manifest = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', [
    { consumer: 'entropy-pool', streamIndex: 0 },
    { consumer: 'sampling', streamIndex: 1 },
  ]);
  const result = verifyRandomnessManifest(manifest, ['sampling', 'entropy-pool']);
  assert.equal(result, 'call_order_mismatch');
});

test('verifyRandomnessManifest: extra consumer in observed → stream_partition_mismatch', () => {
  const manifest = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', [
    { consumer: 'entropy-pool', streamIndex: 0 },
  ]);
  const result = verifyRandomnessManifest(manifest, ['entropy-pool', 'unknown-consumer']);
  assert.equal(result, 'stream_partition_mismatch');
});

test('verifyRandomnessManifest: missing consumer in observed → stream_partition_mismatch', () => {
  const manifest = buildRandomnessManifest(42, 'far.prng.mulberry32.v1', [
    { consumer: 'entropy-pool', streamIndex: 0 },
    { consumer: 'sampling', streamIndex: 1 },
  ]);
  const result = verifyRandomnessManifest(manifest, ['entropy-pool']);
  assert.equal(result, 'stream_partition_mismatch');
});

test('verifyRandomnessManifest: unsupported prng → unsupported_prng', () => {
  const manifest = buildRandomnessManifest(42, 'unknown.prng', [
    { consumer: 'entropy-pool', streamIndex: 0 },
  ]);
  const result = verifyRandomnessManifest(manifest, ['entropy-pool']);
  assert.equal(result, 'unsupported_prng');
});

test('verifyRandomnessManifest: empty manifest, empty observed → valid', () => {
  const manifest = buildRandomnessManifest(0, 'far.prng.mulberry32.v1', []);
  const result = verifyRandomnessManifest(manifest, []);
  assert.equal(result, 'valid');
});

// ---------------------------------------------------------------------------
// Type shape: RandomnessManifest + RandomnessVerificationResult
// ---------------------------------------------------------------------------

test('RandomnessManifest type shape', () => {
  const m: RandomnessManifest = buildRandomnessManifest(1, 'far.prng.mulberry32.v1', [
    { consumer: 'a', streamIndex: 0 },
  ]);
  assert.equal(typeof m.seed, 'number');
  assert.equal(typeof m.prngFamilyId, 'string');
  assert.ok(Array.isArray(m.streamAssignments));
  assert.equal(typeof m.callOrderFingerprint, 'string');
});

test('RandomnessVerificationResult is a string literal union', () => {
  const r: RandomnessVerificationResult = 'valid';
  assert.equal(r, 'valid');
  // Type-level check — the following would fail at compile time if wrong:
  const validResults: RandomnessVerificationResult[] = [
    'valid',
    'stream_partition_mismatch',
    'call_order_mismatch',
    'unsupported_prng',
  ];
  assert.equal(validResults.length, 4);
});

// ---------------------------------------------------------------------------
// Integration: prng family from frozen registry
// ---------------------------------------------------------------------------

test('buildRandomnessManifest with prngFamilyId from frozen registry', () => {
  const family = RANDOMNESS_PRNG_FAMILIES[0];
  assert.ok(family);
  const manifest = buildRandomnessManifest(123, family.prngFamilyId, [
    { consumer: 'test', streamIndex: 0 },
  ]);
  assert.equal(manifest.prngFamilyId, 'far.prng.mulberry32.v1');
  // Should verify as valid with correct prng
  const result = verifyRandomnessManifest(manifest, ['test']);
  assert.equal(result, 'valid');
});
