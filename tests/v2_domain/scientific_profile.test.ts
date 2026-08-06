// tests/v2_domain/scientific_profile.test.ts
//
// IMPL-021/033 — two-group scientific profile + locked holdout (fixture track).
//
// Authority: doc19 §4 (scientificVerdict dimension), SPEC-012 (preregistered protocol).
// Fixture track only: T1 synthetic + T2 fixture-derived tiers.
// Real holdout (T5) requires independent science owner — deferred.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCIENTIFIC_PROFILES,
  buildScientificProfileResult,
  assertFixtureTrackOnly,
  FIXTURE_GROUP_DEFS,
} from '../../src/v2_domain/scientific_profile.ts';

// ---------------------------------------------------------------------------
// Profile definitions
// ---------------------------------------------------------------------------

test('SCIENTIFIC_PROFILES: includes two-group fixture profile', () => {
  const ids = SCIENTIFIC_PROFILES.map((p) => p.profileId);
  assert.equal(ids.includes('far.sci.two-group-fixture-v0.v1'), true);
});

test('FIXTURE_GROUP_DEFS: defines exactly 2 groups (treatment + control)', () => {
  assert.equal(FIXTURE_GROUP_DEFS.length, 2);
  const roles = FIXTURE_GROUP_DEFS.map((g) => g.role);
  assert.ok(roles.includes('treatment'));
  assert.ok(roles.includes('control'));
});

test('FIXTURE_GROUP_DEFS: each group has sampleSize, seedBinding, and metricKey', () => {
  for (const g of FIXTURE_GROUP_DEFS) {
    assert.ok(g.sampleSize > 0, `${g.groupId} sampleSize must be > 0`);
    assert.ok(g.seedBinding.length === 64, `${g.groupId} seedBinding must be 64 hex`);
    assert.ok(g.metricKey.length > 0, `${g.groupId} metricKey required`);
  }
});

// ---------------------------------------------------------------------------
// buildScientificProfileResult
// ---------------------------------------------------------------------------

test('buildScientificProfileResult: produces fixture-track result with effect size + p-value', () => {
  const result = buildScientificProfileResult({
    profileId: 'far.sci.two-group-fixture-v0.v1',
    treatmentMean: 0.82,
    controlMean: 0.71,
    treatmentStd: 0.05,
    controlStd: 0.06,
    sampleSize: 120,
    metricKey: 'macro_f1',
    dataTier: 'T1_PURE_SYNTHETIC',
    preregistrationDigest: 'a'.repeat(64),
  });
  assert.ok(result.effectSize > 0, 'effect size should be positive');
  assert.ok(result.pValue !== null, 'p-value should be computed');
  assert.equal(result.isFixtureTrack, true);
  assert.equal(result.qualifiesForScienceVerdict, false); // fixture → does NOT qualify
  assert.ok(result.cohensD !== undefined);
});

test('buildScientificProfileResult: fixture data → qualifiesForScienceVerdict=false', () => {
  const result = buildScientificProfileResult({
    profileId: 'far.sci.two-group-fixture-v0.v1',
    treatmentMean: 0.9,
    controlMean: 0.5,
    treatmentStd: 0.1,
    controlStd: 0.1,
    sampleSize: 50,
    metricKey: 'accuracy',
    dataTier: 'T2_FIXTURE_DERIVED',
    preregistrationDigest: 'b'.repeat(64),
  });
  assert.equal(result.qualifiesForScienceVerdict, false);
  assert.ok(result.limitationNotice.toLowerCase().includes('fixture'));
});

test('buildScientificProfileResult: T5 real holdout → qualifiesForScienceVerdict=true', () => {
  const result = buildScientificProfileResult({
    profileId: 'far.sci.two-group-fixture-v0.v1',
    treatmentMean: 0.85,
    controlMean: 0.70,
    treatmentStd: 0.04,
    controlStd: 0.05,
    sampleSize: 200,
    metricKey: 'macro_f1',
    dataTier: 'T5_REAL_HOLDOUT',
    preregistrationDigest: 'c'.repeat(64),
  });
  assert.equal(result.qualifiesForScienceVerdict, true);
});

// ---------------------------------------------------------------------------
// assertFixtureTrackOnly
// ---------------------------------------------------------------------------

test('assertFixtureTrackOnly: T1 and T2 pass (fixture track)', () => {
  assert.doesNotThrow(() => assertFixtureTrackOnly('T1_PURE_SYNTHETIC'));
  assert.doesNotThrow(() => assertFixtureTrackOnly('T2_FIXTURE_DERIVED'));
});

test('assertFixtureTrackOnly: T3-T5 throw (not fixture track, requires governance)', () => {
  assert.throws(() => assertFixtureTrackOnly('T3_DEIDENTIFIED_SAMPLE'), /NOT_FIXTURE_TRACK/);
  assert.throws(() => assertFixtureTrackOnly('T5_REAL_HOLDOUT'), /NOT_FIXTURE_TRACK/);
});

// ---------------------------------------------------------------------------
// Cohen's d computation
// ---------------------------------------------------------------------------

test('buildScientificProfileResult: Cohen d matches expected formula', () => {
  const result = buildScientificProfileResult({
    profileId: 'far.sci.two-group-fixture-v0.v1',
    treatmentMean: 1.0,
    controlMean: 0.0,
    treatmentStd: 0.5,
    controlStd: 0.5,
    sampleSize: 100,
    metricKey: 'test',
    dataTier: 'T1_PURE_SYNTHETIC',
    preregistrationDigest: 'd'.repeat(64),
  });
  // Cohen's d = (mean_t - mean_c) / pooled_std
  // pooled_std for equal n and equal std = std
  // d = (1.0 - 0.0) / 0.5 = 2.0
  assert.ok(result.cohensD !== undefined);
  assert.ok(Math.abs((result.cohensD ?? 0) - 2.0) < 0.01, `expected d≈2.0, got ${result.cohensD}`);
});
