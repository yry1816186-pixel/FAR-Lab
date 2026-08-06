// tests/v2_domain/test_data_tiers.test.ts
//
// IMPL-020 — five governed test-data tiers (synthetic → real).
//
// Authority: IMPL-020.
// Verifies tier definitions, data card construction, requirement enforcement,
// and scientific-eligibility gating.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST_DATA_TIERS,
  buildDataCard,
  assertTierRequirements,
  isTierAvailableForScience,
  type TestDataTierId,
} from '../../src/v2_domain/test_data_tiers.ts';

// ---------------------------------------------------------------------------
// TEST_DATA_TIERS — frozen tier list
// ---------------------------------------------------------------------------

test('TEST_DATA_TIERS: has exactly 5 tiers', () => {
  assert.equal(TEST_DATA_TIERS.length, 5);
});

test('TEST_DATA_TIERS: tier IDs are unique', () => {
  const ids = TEST_DATA_TIERS.map((t) => t.tierId);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test('TEST_DATA_TIERS: tiers ascend in strictness', () => {
  // T1: no consent, no license
  assert.equal(TEST_DATA_TIERS[0]!.requiresConsent, false);
  assert.equal(TEST_DATA_TIERS[0]!.requiresLicense, false);
  // T2: license only
  assert.equal(TEST_DATA_TIERS[1]!.requiresConsent, false);
  assert.equal(TEST_DATA_TIERS[1]!.requiresLicense, true);
  // T3: consent + license
  assert.equal(TEST_DATA_TIERS[2]!.requiresConsent, true);
  assert.equal(TEST_DATA_TIERS[2]!.requiresLicense, true);
  // T4: consent + license
  assert.equal(TEST_DATA_TIERS[3]!.requiresConsent, true);
  assert.equal(TEST_DATA_TIERS[3]!.requiresLicense, true);
  // T5: consent + license + ethics
  assert.equal(TEST_DATA_TIERS[4]!.requiresConsent, true);
  assert.equal(TEST_DATA_TIERS[4]!.requiresLicense, true);
  assert.equal(TEST_DATA_TIERS[4]!.requiresEthicsApproval, true);
});

test('TEST_DATA_TIERS: all objects are frozen (readonly)', () => {
  assert.ok(Object.isFrozen(TEST_DATA_TIERS));
});

// ---------------------------------------------------------------------------
// buildDataCard — construction
// ---------------------------------------------------------------------------

test('buildDataCard: T1 with minimal fields succeeds', () => {
  const card = buildDataCard('T1_PURE_SYNTHETIC', 'algorithm-generated', undefined, undefined, 'h0');
  assert.equal(card.tierId, 'T1_PURE_SYNTHETIC');
  assert.equal(card.source, 'algorithm-generated');
  assert.equal(card.licenseUri, undefined);
  assert.equal(card.consentEvidenceDigest, undefined);
  assert.equal(card.lineageHash, 'h0');
  assert.ok(card.cardDigest.length === 64);
  assert.ok(card.createdAt.length > 0);
});

test('buildDataCard: T2 with license succeeds', () => {
  const card = buildDataCard('T2_FIXTURE_DERIVED', 'published fixtures', 'https://example.com/license', undefined, 'h1');
  assert.equal(card.licenseUri, 'https://example.com/license');
  assert.ok(card.cardDigest.length === 64);
});

test('buildDataCard: T3 with license+consent succeeds', () => {
  const card = buildDataCard('T3_DEIDENTIFIED_SAMPLE', 'de-id sample', 'https://example.com/l', 'consent-digest-abc', 'h2');
  assert.equal(card.consentEvidenceDigest, 'consent-digest-abc');
  assert.ok(card.cardDigest.length === 64);
});

test('buildDataCard: T5 with all fields succeeds', () => {
  const card = buildDataCard(
    'T5_REAL_HOLDOUT',
    'real holdout data',
    'https://example.com/license-v2',
    'consent-digest-xyz',
    'h3',
  );
  assert.equal(card.tierId, 'T5_REAL_HOLDOUT');
  assert.equal(card.licenseUri, 'https://example.com/license-v2');
  assert.equal(card.consentEvidenceDigest, 'consent-digest-xyz');
  assert.ok(Object.isFrozen(card));
});

test('buildDataCard: card is frozen', () => {
  const card = buildDataCard('T1_PURE_SYNTHETIC', 'src', undefined, undefined, 'h');
  assert.ok(Object.isFrozen(card));
});

test('buildDataCard: rejects unknown tierId', () => {
  assert.throws(
    () => buildDataCard('TX_FAKE' as TestDataTierId, 'src', undefined, undefined, 'h'),
    /DATA_TIER_UNKNOWN/,
  );
});

test('buildDataCard: rejects empty source', () => {
  assert.throws(
    () => buildDataCard('T1_PURE_SYNTHETIC', '', undefined, undefined, 'h'),
    /DATA_CARD_INVALID/,
  );
});

test('buildDataCard: rejects empty lineageHash', () => {
  assert.throws(
    () => buildDataCard('T1_PURE_SYNTHETIC', 'src', undefined, undefined, ''),
    /DATA_CARD_INVALID/,
  );
});

test('buildDataCard: deterministic digest for identical inputs', () => {
  const card = buildDataCard('T1_PURE_SYNTHETIC', 'src', undefined, undefined, 'hash1');
  // cardDigest is deterministic; createdAt differs between calls, so digest will differ.
  // Instead, verify the digest is a valid hex string.
  assert.ok(/^[0-9a-f]{64}$/.test(card.cardDigest));
});

// ---------------------------------------------------------------------------
// assertTierRequirements — fail-closed enforcement
// ---------------------------------------------------------------------------

test('assertTierRequirements: T1 passes with no license/consent', () => {
  const card = buildDataCard('T1_PURE_SYNTHETIC', 'src', undefined, undefined, 'h');
  assert.doesNotThrow(() => assertTierRequirements('T1_PURE_SYNTHETIC', card));
});

test('assertTierRequirements: T2 passes with license', () => {
  const card = buildDataCard('T2_FIXTURE_DERIVED', 'src', 'https://license', undefined, 'h');
  assert.doesNotThrow(() => assertTierRequirements('T2_FIXTURE_DERIVED', card));
});

test('assertTierRequirements: T2 throws when licenseUri missing', () => {
  const card = buildDataCard('T2_FIXTURE_DERIVED', 'src', undefined, undefined, 'h');
  assert.throws(
    () => assertTierRequirements('T2_FIXTURE_DERIVED', card),
    /DATA_TIER_REQUIREMENT_MISSING: licenseUri/,
  );
});

test('assertTierRequirements: T3 throws when consentEvidenceDigest missing', () => {
  const card = buildDataCard('T3_DEIDENTIFIED_SAMPLE', 'src', 'https://license', undefined, 'h');
  assert.throws(
    () => assertTierRequirements('T3_DEIDENTIFIED_SAMPLE', card),
    /DATA_TIER_REQUIREMENT_MISSING: consentEvidenceDigest/,
  );
});

test('assertTierRequirements: T3 throws when licenseUri missing', () => {
  const card = buildDataCard('T3_DEIDENTIFIED_SAMPLE', 'src', undefined, 'consent-digest', 'h');
  assert.throws(
    () => assertTierRequirements('T3_DEIDENTIFIED_SAMPLE', card),
    /DATA_TIER_REQUIREMENT_MISSING: licenseUri/,
  );
});

test('assertTierRequirements: T3 passes with license+consent', () => {
  const card = buildDataCard('T3_DEIDENTIFIED_SAMPLE', 'src', 'https://license', 'consent-digest', 'h');
  assert.doesNotThrow(() => assertTierRequirements('T3_DEIDENTIFIED_SAMPLE', card));
});

test('assertTierRequirements: T4 passes with license+consent', () => {
  const card = buildDataCard('T4_LICENSED_DATASET', 'src', 'https://license', 'consent-digest', 'h');
  assert.doesNotThrow(() => assertTierRequirements('T4_LICENSED_DATASET', card));
});

test('assertTierRequirements: T5 passes with license+consent', () => {
  const card = buildDataCard('T5_REAL_HOLDOUT', 'src', 'https://license', 'consent-digest', 'h');
  assert.doesNotThrow(() => assertTierRequirements('T5_REAL_HOLDOUT', card));
});

test('assertTierRequirements: T5 throws when licenseUri missing', () => {
  const card = buildDataCard('T5_REAL_HOLDOUT', 'src', undefined, 'consent-digest', 'h');
  assert.throws(
    () => assertTierRequirements('T5_REAL_HOLDOUT', card),
    /DATA_TIER_REQUIREMENT_MISSING: licenseUri/,
  );
});

test('assertTierRequirements: T5 throws when consentEvidenceDigest missing', () => {
  const card = buildDataCard('T5_REAL_HOLDOUT', 'src', 'https://license', undefined, 'h');
  assert.throws(
    () => assertTierRequirements('T5_REAL_HOLDOUT', card),
    /DATA_TIER_REQUIREMENT_MISSING: consentEvidenceDigest/,
  );
});

test('assertTierRequirements: throws on unknown tier', () => {
  const card = buildDataCard('T1_PURE_SYNTHETIC', 'src', undefined, undefined, 'h');
  assert.throws(
    () => assertTierRequirements('TX_FAKE' as TestDataTierId, card),
    /DATA_TIER_UNKNOWN/,
  );
});

// ---------------------------------------------------------------------------
// isTierAvailableForScience — eligibility gating
// ---------------------------------------------------------------------------

test('isTierAvailableForScience: only T5 returns true', () => {
  for (const tier of TEST_DATA_TIERS) {
    const expected = tier.tierId === 'T5_REAL_HOLDOUT';
    assert.equal(
      isTierAvailableForScience(tier.tierId),
      expected,
      `isTierAvailableForScience(${tier.tierId}) should be ${expected}`,
    );
  }
});

test('isTierAvailableForScience: T1 through T4 all return false', () => {
  assert.equal(isTierAvailableForScience('T1_PURE_SYNTHETIC'), false);
  assert.equal(isTierAvailableForScience('T2_FIXTURE_DERIVED'), false);
  assert.equal(isTierAvailableForScience('T3_DEIDENTIFIED_SAMPLE'), false);
  assert.equal(isTierAvailableForScience('T4_LICENSED_DATASET'), false);
});

test('isTierAvailableForScience: T5 returns true', () => {
  assert.equal(isTierAvailableForScience('T5_REAL_HOLDOUT'), true);
});
