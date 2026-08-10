/**
 * V2 Canonical Algorithm Registry + ContractBindingSet.
 *
 * Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §3-§6,
 *            19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3.1, §4.
 * Freeze: SPEC-003/004/005/006 merged. Closes IRG-001..007 machine-authority gaps.
 *
 * This module is the sole machine authority for:
 *   - canonicalizationAlgorithmId (IRG-003: JCS with explicit preprocessing boundary)
 *   - numericalEquivalenceProfile N0-N4 (IRG-001)
 *   - randomnessManifest PRNG families (IRG-002)
 *   - disclosureProfile commitment classes (IRG-004)
 *   - externalReferencePolicy availability states (IRG-005)
 *   - signature/time/trust suites (IRG-006/007)
 *
 * IRG-003 decision (JCS vs NFC conflict resolution):
 *   RFC 8785 (JCS) does NOT normalize strings and restricts JSON number semantics.
 *   The existing code normalizes claim text to NFC at the FIELD level (normalizeWhitespace
 *   in proof_hash.ts) BEFORE canonicalization. This is correct: NFC is a preprocessing
 *   step on string-valued fields, not part of canonicalization. The canonicalization
 *   algorithm itself is JCS (no string normalization inside it). This separates the two
 *   concerns and resolves the conflict: canonicalizationAlgorithmId = 'none-in-canonicalization'.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';
import type { DeploymentProfile } from './contract_enums.ts';

// ===========================================================================
// SPEC-003 / IRG-003: Canonicalization algorithm registry
// ===========================================================================

/** Canonicalization algorithm descriptor. */
export interface CanonicalizationAlgorithm {
  readonly algorithmId: CanonicalizationAlgorithmId;
  readonly stringNormalization: 'none-in-canonicalization' | 'nfc-pre-canonicalization';
  readonly numberSerialization: string;
  readonly keyOrdering: string;
  readonly reference: string;
}

/** Frozen canonicalization algorithm IDs. */
export const CANONICALIZATION_ALGORITHM_IDS = [
  'far.canon.jcs-primary.v1',
] as const;
/** Type alias: canonicalization algorithm ID. */
export type CanonicalizationAlgorithmId = (typeof CANONICALIZATION_ALGORITHM_IDS)[number];

/** Frozen canonicalization algorithm registry. */
export const CANONICALIZATION_ALGORITHMS: readonly CanonicalizationAlgorithm[] = Object.freeze([
  {
    algorithmId: 'far.canon.jcs-primary.v1',
    // IRG-003: JCS (RFC 8785) does not normalize strings. NFC is applied at the
    // field-preprocessing layer (normalizeWhitespace in proof_hash.ts), not here.
    stringNormalization: 'none-in-canonicalization',
    numberSerialization: 'RFC-8785-section-6.2',
    keyOrdering: 'lexicographic-utf16',
    reference: 'RFC 8785 (JSON Canonicalization Scheme)',
  },
]);

// ===========================================================================
// SPEC-004 / IRG-001: Numerical equivalence profile N0-N4
// ===========================================================================

/** Numerical equivalence level descriptor (doc17 §3, IRG-001). */
export interface NumericalEquivalenceLevel {
  readonly level: NumericalEquivalenceLevelId;
  readonly semantic: string;
  readonly divergenceRule: string;
  /** Numeric threshold (0 for N0, ULP count for N2, etc.); null = decision-boundary (N4). */
  readonly threshold: number | null;
  readonly producesScienceVerdict: boolean;
}

/** N0-N4 level IDs. */
export const NUMERICAL_EQUIVALENCE_LEVEL_IDS = ['N0', 'N1', 'N2', 'N3', 'N4'] as const;
/** Type alias: numerical equivalence level ID. */
export type NumericalEquivalenceLevelId = (typeof NUMERICAL_EQUIVALENCE_LEVEL_IDS)[number];

/** Frozen N0-N4 levels (doc17 §3). */
export const NUMERICAL_EQUIVALENCE_LEVELS: readonly NumericalEquivalenceLevel[] = Object.freeze([
  {
    level: 'N0',
    semantic: 'exact-bit-identity',
    divergenceRule: 'outputs must be bit-identical; any difference = divergence',
    threshold: 0,
    producesScienceVerdict: false,
  },
  {
    level: 'N1',
    semantic: 'execution-fingerprint-match',
    divergenceRule: 'execution fingerprint (PRNG call order + intermediate hashes) must match',
    threshold: 0,
    producesScienceVerdict: false,
  },
  {
    level: 'N2',
    semantic: 'bounded-ulp-divergence',
    divergenceRule: 'floating-point ULP difference within declared bound (BLAS/thread/hardware)',
    threshold: 4, // 4 ULP default bound; profile-configurable
    producesScienceVerdict: false,
  },
  {
    level: 'N3',
    semantic: 'bounded-threshold-divergence',
    divergenceRule: 'numeric difference within declared absolute/relative threshold but same decision',
    threshold: 1e-9,
    producesScienceVerdict: false,
  },
  {
    level: 'N4',
    semantic: 'different-decision-bounded',
    divergenceRule: 'bounded numeric result crosses science decision boundary → DIFFERENT_DECISION',
    threshold: null,
    producesScienceVerdict: true,
  },
]);

// ===========================================================================
// SPEC-004 / IRG-002: Randomness manifest
// ===========================================================================

/** PRNG family descriptor (doc17 §3, IRG-002). */
export interface RandomnessPrngFamily {
  readonly prngFamilyId: string;
  readonly family: string;
  readonly stateSize: number;
  readonly streamDerivationRule: string;
  readonly callOrderBinding: string;
  readonly parallelSchedulePolicy: string;
}

/** Frozen PRNG families. */
export const RANDOMNESS_PRNG_FAMILIES: readonly RandomnessPrngFamily[] = Object.freeze([
  {
    prngFamilyId: 'far.prng.mulberry32.v1',
    family: 'mulberry32',
    stateSize: 32,
    // IRG-002: receipt design must bind PRNG family/state/substreams/call order/parallel schedule.
    streamDerivationRule: 'substream = mulberry32(seed XOR streamIndex); streamIndex declared per consumer',
    callOrderBinding: 'all PRNG calls recorded in execution fingerprint hash chain in call order',
    parallelSchedulePolicy: 'single-threaded in v0; parallel execution declares substream partition explicitly',
  },
]);

// ===========================================================================
// SPEC-005 / IRG-004: Disclosure commitment classes
// ===========================================================================

/** Disclosure commitment class descriptor (doc17 §4, IRG-004). */
export interface DisclosureCommitmentClass {
  readonly classId: string;
  readonly semantic: string;
  readonly dictionaryTestResistant: boolean;
  readonly linkabilityPolicy: string;
  readonly sourceRootDisclosed: boolean;
}

/** Frozen disclosure commitment classes. */
export const DISCLOSURE_COMMITMENT_CLASSES: readonly DisclosureCommitmentClass[] = Object.freeze([
  {
    classId: 'far.disclosure.full.v1',
    semantic: 'all members disclosed; source root = disclosure root',
    dictionaryTestResistant: false, // not applicable — nothing hidden
    linkabilityPolicy: 'no hidden values; standard hash chain',
    sourceRootDisclosed: true,
  },
  {
    classId: 'far.disclosure.derived-subset.v1',
    semantic: 'derived disclosure with separate root; inclusion proofs for disclosed members',
    dictionaryTestResistant: true,
    linkabilityPolicy: 'salted commitments prevent cross-receipt linkage by default',
    sourceRootDisclosed: false,
  },
  {
    classId: 'far.disclosure.sensitive-omitted.v1',
    semantic: 'sensitive members omitted with commitment proof; low-entropy protection required',
    // IRG-004: low-entropy hidden values must resist dictionary attacks.
    dictionaryTestResistant: true,
    linkabilityPolicy: 'nonce-per-member; no public correlation tokens',
    sourceRootDisclosed: false,
  },
]);

// ===========================================================================
// SPEC-005 / IRG-005: External reference availability states
// ===========================================================================

/** External reference availability states (doc17 §5, IRG-005). */
export const EXTERNAL_REFERENCE_AVAILABILITY_STATES = [
  'RESOLVED',
  'REDIRECTED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONTENT_DRIFT',
  'AUTH_REQUIRED',
  'LICENSE_BLOCKED',
] as const;
/** Type alias: external reference availability state. */
export type ExternalReferenceAvailabilityState = (typeof EXTERNAL_REFERENCE_AVAILABILITY_STATES)[number];

// ===========================================================================
// SPEC-006 / IRG-006/007: Signature suites + trust-time contexts
// ===========================================================================

/** Signature algorithm suite renewal policy (doc17 §6, IRG-007). */
export interface SignatureSuiteRenewalPolicy {
  readonly stopSignDate: string;       // after this, no new signatures with this suite
  readonly stopVerifyDate: string;     // after this, verification requires renewal evidence
  readonly downgradeBehavior: string;  // what happens if old suite is presented after stop-verify
  readonly successorSuiteId: string | null;
}

/** Signature algorithm suite descriptor (doc17 §6, IRG-006/007). */
export interface SignatureAlgorithmSuite {
  readonly suiteId: string;
  readonly signatureAlgorithm: string;
  readonly hashAlgorithm: string;
  readonly keyAgreement: string;
  readonly renewalPolicy: SignatureSuiteRenewalPolicy;
}

/** Frozen signature algorithm suites. */
export const SIGNATURE_ALGORITHM_SUITES: readonly SignatureAlgorithmSuite[] = Object.freeze([
  {
    suiteId: 'far.sig.ed25519-sha256.v1',
    signatureAlgorithm: 'Ed25519',
    hashAlgorithm: 'SHA-256',
    keyAgreement: 'none (v0 keyless-local; signatures optional)',
    renewalPolicy: {
      stopSignDate: '2030-01-01T00:00:00Z',
      stopVerifyDate: '2035-01-01T00:00:00Z',
      downgradeBehavior: 'after stop-verify, historical signatures remain valid with renewal-evidence requirement; no silent downgrade',
      // CZ1-01（阶段 7 P1）：PQC 继任 suite 注册——NIST IR 8547 迁移线 2030/2035。
      // 仅注册声明（平滑轮换路径），不替换现有签名；停止新签后经 renewal 框架轮换。
      successorSuiteId: 'far.sig.ml-dsa-44-sha512.v1',
    },
  },
  {
    suiteId: 'far.sig.ml-dsa-44-sha512.v1',
    signatureAlgorithm: 'ML-DSA-44 (FIPS 204)',
    hashAlgorithm: 'SHA-512',
    keyAgreement: 'none (v0 keyless-local; signatures optional)',
    renewalPolicy: {
      stopSignDate: '2035-01-01T00:00:00Z',
      stopVerifyDate: '2040-01-01T00:00:00Z',
      downgradeBehavior: 'after stop-verify, historical signatures remain valid with renewal-evidence requirement; no silent downgrade',
      successorSuiteId: null, // declared when next rotation occurs (e.g., SLH-DSA or later NIST profile)
    },
  },
]);

/** Trust-time context descriptor (doc17 §6, IRG-006). */
export interface TrustTimeContext {
  readonly contextKind: 'historical' | 'current' | 'renewal';
  readonly evaluationRule: string;
  readonly revocationFreshnessRequirement: string;
}

/** Frozen trust-time contexts. */
export const TRUST_TIME_CONTEXTS: readonly TrustTimeContext[] = Object.freeze([
  {
    contextKind: 'historical',
    evaluationRule: 'evaluate against trust material valid at signed time; revocation at signed time checks historical CRL/OCSP',
    revocationFreshnessRequirement: 'historical revocation evidence snapshot required',
  },
  {
    contextKind: 'current',
    evaluationRule: 'evaluate against current trust material and live revocation status',
    revocationFreshnessRequirement: 'fresh OCSP/CRL within declared freshness window',
  },
  {
    contextKind: 'renewal',
    evaluationRule: 'evaluate renewal chain continuity from signed-time suite to current suite',
    revocationFreshnessRequirement: 'continuous chain; no gap in trust-root coverage',
  },
]);

// ===========================================================================
// §3.1 ContractBindingSet — versioned canonical object
// ===========================================================================

/** Input for building a ContractBindingSet. */
export interface ContractBindingSetInput {
  readonly deploymentProfile: DeploymentProfile;
  readonly verificationPolicyId: string;
  readonly scientificProfile: string;
  readonly disclosureProfile: string;
  readonly canonicalizationAlgorithmId: CanonicalizationAlgorithmId;
  readonly numericalEquivalenceProfileId: string;
  readonly externalReferencePolicyId: string;
  readonly executionContainmentPolicyId: string;
  readonly preservationPolicyId: string;
  readonly trustPolicyId: string;
}

/** Frozen, digest-bound ContractBindingSet (doc19 §3.1). Never ambient configuration. */
export interface ContractBindingSet extends ContractBindingSetInput {
  readonly version: 1;
  readonly digest: string;
  readonly bindings: ContractBindingSetInput;
  readonly createdAt: string;
}

/**
 * Build a ContractBindingSet from explicit input. Every field must be a non-empty
 * concrete value — absence/default/latest is invalid (doc19 §3.1). Fail-closed.
 */
export function buildContractBindingSet(input: ContractBindingSetInput): ContractBindingSet {
  // Validate: every required binding must be a non-empty concrete value.
  const required: Array<[string, string]> = [
    ['verificationPolicyId', input.verificationPolicyId],
    ['scientificProfile', input.scientificProfile],
    ['disclosureProfile', input.disclosureProfile],
    ['canonicalizationAlgorithmId', input.canonicalizationAlgorithmId],
    ['numericalEquivalenceProfileId', input.numericalEquivalenceProfileId],
    ['externalReferencePolicyId', input.externalReferencePolicyId],
    ['executionContainmentPolicyId', input.executionContainmentPolicyId],
    ['preservationPolicyId', input.preservationPolicyId],
    ['trustPolicyId', input.trustPolicyId],
  ];
  for (const [name, value] of required) {
    if (value.length === 0) {
      throw new Error(
        `CONTRACT_BINDING_INVALID: ${name} must be a non-empty concrete value (not absence/default/latest)`,
      );
    }
  }
  // Validate canonicalizationAlgorithmId is in the frozen registry.
  if (!(CANONICALIZATION_ALGORITHM_IDS as readonly string[]).includes(input.canonicalizationAlgorithmId)) {
    throw new Error(
      `CONTRACT_BINDING_INVALID: canonicalizationAlgorithmId "${input.canonicalizationAlgorithmId}" not in frozen registry`,
    );
  }

  const createdAt = new Date().toISOString();
  // Digest = sha256(canonical_json of the input bindings). Deterministic, version-bound.
  const digest = createHash('sha256')
    .update(canonicalJson(input, 'buildContractBindingSet'), 'utf8')
    .digest('hex');

  return Object.freeze({
    ...input,
    version: 1 as const,
    digest,
    bindings: input,
    createdAt,
  });
}
