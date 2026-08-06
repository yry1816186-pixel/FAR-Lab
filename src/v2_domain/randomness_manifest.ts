// src/v2_domain/randomness_manifest.ts
//
// IMPL-027: Runtime verification of randomnessManifest — PRNG call fingerprint
// binding and stream derivation verification.
//
// Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §3,
//            IRG-002 (randomness manifest).

import { createHash } from 'node:crypto';
import stableStringify from 'fast-json-stable-stringify';
import { RANDOMNESS_PRNG_FAMILIES } from './algorithm_registry.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Assignment of a consumer to a PRNG substream. */
export interface StreamAssignment {
  readonly consumer: string;
  readonly streamIndex: number;
}

/** Frozen randomness manifest binding PRNG state to consumers. */
export interface RandomnessManifest {
  readonly seed: number;
  readonly prngFamilyId: string;
  readonly streamAssignments: readonly StreamAssignment[];
  /** SHA-256 fingerprint of the deterministic call order. */
  readonly callOrderFingerprint: string;
}

/** Result of verifying a randomness manifest against observed call order. */
export type RandomnessVerificationResult =
  | 'valid'
  | 'stream_partition_mismatch'
  | 'call_order_mismatch'
  | 'unsupported_prng';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set of supported PRNG family IDs from the frozen registry. */
const SUPPORTED_PRNG_IDS: ReadonlySet<string> = new Set(
  RANDOMNESS_PRNG_FAMILIES.map((f) => f.prngFamilyId),
);

/**
 * Deterministic string comparator (UTF-16 code-unit order).
 * Matches the convention in src/evidence_log/hasher.ts compareStringsDeterministic.
 */
function compareStringsDeterministic(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// buildRandomnessManifest
// ---------------------------------------------------------------------------

/**
 * Build a deterministic randomness manifest.
 *
 * - Sorts streamAssignments by streamIndex for canonical ordering.
 * - Computes callOrderFingerprint = sha256(canonical_json of sorted assignments + seed + prngFamilyId).
 *
 * @param seed - PRNG seed value.
 * @param prngFamilyId - PRNG family identifier.
 * @param streamAssignments - Array of consumer-to-stream assignments.
 * @returns Frozen RandomnessManifest.
 */
export function buildRandomnessManifest(
  seed: number,
  prngFamilyId: string,
  streamAssignments: StreamAssignment[],
): RandomnessManifest {
  // Sort by streamIndex for deterministic canonical representation.
  const sorted = [...streamAssignments].sort(
    (a, b) => a.streamIndex - b.streamIndex || compareStringsDeterministic(a.consumer, b.consumer),
  );

  // Canonical JSON input for fingerprint: includes seed, prngFamilyId, and sorted assignments.
  const canonicalInput = { seed, prngFamilyId, streamAssignments: sorted };
  const canonical = stableStringify(canonicalInput);
  if (canonical === undefined) {
    throw new Error('buildRandomnessManifest: stable stringify returned undefined');
  }

  const callOrderFingerprint = createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');

  return Object.freeze({
    seed,
    prngFamilyId,
    streamAssignments: sorted,
    callOrderFingerprint,
  });
}

// ---------------------------------------------------------------------------
// verifyRandomnessManifest
// ---------------------------------------------------------------------------

/**
 * Verify a randomness manifest against an observed call order.
 *
 * Checks:
 * 1. prngFamilyId is in the supported registry.
 * 2. observedCallOrder contains exactly the same consumers as the manifest.
 * 3. observedCallOrder matches the expected order derived from streamAssignments (sorted by streamIndex).
 *
 * @param manifest - The manifest to verify.
 * @param observedCallOrder - Array of consumer names in observed call order.
 * @returns Verification result: 'valid' | 'stream_partition_mismatch' | 'call_order_mismatch' | 'unsupported_prng'.
 */
export function verifyRandomnessManifest(
  manifest: RandomnessManifest,
  observedCallOrder: readonly string[],
): RandomnessVerificationResult {
  // 1. Check PRNG family support.
  if (!SUPPORTED_PRNG_IDS.has(manifest.prngFamilyId)) {
    return 'unsupported_prng';
  }

  // 2. Check stream partition: same set of consumers.
  const manifestConsumers = new Set(manifest.streamAssignments.map((s) => s.consumer));
  const observedConsumers = new Set(observedCallOrder);

  if (manifestConsumers.size !== observedConsumers.size) {
    return 'stream_partition_mismatch';
  }
  for (const c of manifestConsumers) {
    if (!observedConsumers.has(c)) {
      return 'stream_partition_mismatch';
    }
  }

  // 3. Check call order: expected order is streamAssignments sorted by streamIndex.
  const expectedOrder = manifest.streamAssignments.map((s) => s.consumer);
  if (observedCallOrder.length !== expectedOrder.length) {
    return 'call_order_mismatch';
  }
  for (let i = 0; i < expectedOrder.length; i++) {
    if (observedCallOrder[i] !== expectedOrder[i]) {
      return 'call_order_mismatch';
    }
  }

  return 'valid';
}
