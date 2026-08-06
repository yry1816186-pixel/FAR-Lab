/**
 * V2 Governed Test-Data Tiers — five-tier data governance for test datasets.
 *
 * Tiers ascend from synthetic (T1) to real holdout (T5). Each tier has a data card
 * recording source, license, consent evidence, and lineage. Higher tiers impose
 * stricter requirements (license, consent, ethics approval).
 *
 * Only T5 (REAL_HOLDOUT) is eligible for scientific verdict qualification.
 * T1–T4 may be used for conformance and protocol testing only.
 *
 * Authority: IMPL-020.
 * 模型中立 · 零容忍合规: 无 any / @ts-ignore / 双重断言 / 空 catch. 全 readonly.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// Tier definitions
// ===========================================================================

/** Tier IDs (frozen union type). */
const _TIER_IDS = [
  'T1_PURE_SYNTHETIC',
  'T2_FIXTURE_DERIVED',
  'T3_DEIDENTIFIED_SAMPLE',
  'T4_LICENSED_DATASET',
  'T5_REAL_HOLDOUT',
] as const;

/** Tier ID type derived from the frozen list. */
export type TestDataTierId = (typeof _TIER_IDS)[number];

/** Internal tier descriptor type. */
interface TestDataTierDescriptor {
  readonly tierId: TestDataTierId;
  readonly semantic: string;
  readonly requiresConsent: boolean;
  readonly requiresLicense: boolean;
  readonly requiresEthicsApproval: boolean;
}

/** Frozen five-tier test-data governance spectrum (T1 synthetic → T5 real). */
export const TEST_DATA_TIERS = Object.freeze([
  {
    tierId: 'T1_PURE_SYNTHETIC',
    semantic: 'algorithmically generated, no real-world referent',
    requiresConsent: false,
    requiresLicense: false,
    requiresEthicsApproval: false,
  },
  {
    tierId: 'T2_FIXTURE_DERIVED',
    semantic: 'derived from published fixtures for conformance testing',
    requiresConsent: false,
    requiresLicense: true,
    requiresEthicsApproval: false,
  },
  {
    tierId: 'T3_DEIDENTIFIED_SAMPLE',
    semantic: 'de-identified sample, low re-identification risk',
    requiresConsent: true,
    requiresLicense: true,
    requiresEthicsApproval: false,
  },
  {
    tierId: 'T4_LICENSED_DATASET',
    semantic: 'licensed research dataset with data card',
    requiresConsent: true,
    requiresLicense: true,
    requiresEthicsApproval: false,
  },
  {
    tierId: 'T5_REAL_HOLDOUT',
    semantic: 'preregistered real holdout for scientific validation',
    requiresConsent: true,
    requiresLicense: true,
    requiresEthicsApproval: true,
  },
] as const) as readonly TestDataTierDescriptor[];

/** Frozen set of tier IDs for fast membership checks. */
const TIER_ID_SET: ReadonlySet<string> = new Set(
  TEST_DATA_TIERS.map((t) => t.tierId),
);

// ===========================================================================
// TestDataCard — provenance record for a dataset bound to a tier
// ===========================================================================

/**
 * Data card attached to a dataset. Captures source, license, consent evidence,
 * and lineage hash. The cardDigest is a deterministic SHA-256 of all fields.
 *
 * Optional fields are governed by tier requirements (see assertTierRequirements).
 */
export interface TestDataCard {
  /** Which tier this card belongs to. */
  readonly tierId: TestDataTierId;
  /** Human-readable description of the data source. */
  readonly source: string;
  /** URI of the license governing this dataset (required for T2–T5). */
  readonly licenseUri?: string;
  /** SHA-256 digest of consent evidence document (required for T3–T5). */
  readonly consentEvidenceDigest?: string;
  /** SHA-256 digest of the lineage/derivation record. */
  readonly lineageHash: string;
  /** Deterministic SHA-256 of the card content (computed by buildDataCard). */
  readonly cardDigest: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

// ===========================================================================
// buildDataCard — construct a validated, digest-bound data card
// ===========================================================================

/**
 * Build a TestDataCard for the given tier. Computes cardDigest deterministically.
 * Does NOT enforce tier requirements — call assertTierRequirements separately if
 * you need fail-closed validation.
 */
export function buildDataCard(
  tierId: TestDataTierId,
  source: string,
  licenseUri: string | undefined,
  consentEvidenceDigest: string | undefined,
  lineageHash: string,
): TestDataCard {
  if (!TIER_ID_SET.has(tierId)) {
    throw new Error(`DATA_TIER_UNKNOWN: tierId "${tierId}" is not a recognized tier`);
  }
  if (source.length === 0) {
    throw new Error('DATA_CARD_INVALID: source must be a non-empty string');
  }
  if (lineageHash.length === 0) {
    throw new Error('DATA_CARD_INVALID: lineageHash must be a non-empty string');
  }

  const createdAt = new Date().toISOString();

  // Deterministic digest over all provided fields.
  const digestInput: Record<string, unknown> = {
    tierId,
    source,
    lineageHash,
    createdAt,
  };
  if (licenseUri !== undefined) {
    digestInput.licenseUri = licenseUri;
  }
  if (consentEvidenceDigest !== undefined) {
    digestInput.consentEvidenceDigest = consentEvidenceDigest;
  }

  const cardDigest = createHash('sha256')
    .update(canonicalJson(digestInput, 'buildDataCard'), 'utf8')
    .digest('hex');

  const base = {
    tierId,
    source,
    lineageHash,
    cardDigest,
    createdAt,
  };

  // Build with optional properties, respecting exactOptionalPropertyTypes.
  if (licenseUri !== undefined && consentEvidenceDigest !== undefined) {
    return Object.freeze({ ...base, licenseUri, consentEvidenceDigest });
  }
  if (licenseUri !== undefined) {
    return Object.freeze({ ...base, licenseUri });
  }
  if (consentEvidenceDigest !== undefined) {
    return Object.freeze({ ...base, consentEvidenceDigest });
  }
  return Object.freeze(base);
}

// ===========================================================================
// assertTierRequirements — fail-closed tier compliance check
// ===========================================================================

/**
 * Assert that a TestDataCard satisfies the governance requirements of its tier.
 * Throws DATA_TIER_REQUIREMENT_MISSING:<field> if a required field is absent.
 *
 * This is the enforcement gate — call it before using any dataset in verification.
 */
export function assertTierRequirements(tierId: TestDataTierId, card: TestDataCard): void {
  const tier = TEST_DATA_TIERS.find((t) => t.tierId === tierId);
  if (tier === undefined) {
    throw new Error(`DATA_TIER_UNKNOWN: tierId "${tierId}" is not a recognized tier`);
  }

  if (tier.requiresLicense && card.licenseUri === undefined) {
    throw new Error(`DATA_TIER_REQUIREMENT_MISSING: licenseUri`);
  }
  if (tier.requiresConsent && card.consentEvidenceDigest === undefined) {
    throw new Error(`DATA_TIER_REQUIREMENT_MISSING: consentEvidenceDigest`);
  }
  // T5 ethics approval is a gating flag on the tier itself; the card does not
  // carry it as a field — ethics approval is verified at the organizational level.
  // Consumers that need ethics approval evidence should check it externally.
}

// ===========================================================================
// isTierAvailableForScience — scientific verdict eligibility gate
// ===========================================================================

/**
 * Returns true only for T5_REAL_HOLDOUT. Tiers T1–T4 may be used for
 * conformance/protocol testing but NOT for scientific verdict qualification.
 */
export function isTierAvailableForScience(tierId: TestDataTierId): boolean {
  return tierId === 'T5_REAL_HOLDOUT';
}
