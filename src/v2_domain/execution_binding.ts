/**
 * Execution binding: source/data/code/env/policy/plan/deviation identity binding.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3.1,
 *   WP-05 (executed policy/FEC binding).
 * Freeze: IMPL-008.
 *
 * Empty/placeholder hashes and missing plan/deviation data MUST fail closed.
 * A scientific output label is never produced when plan execution, source identity,
 * or applicability cannot be demonstrated.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// Execution binding
// ===========================================================================

/** Input for building an execution binding. */
export interface ExecutionBindingInput {
  readonly sourceHash: string;
  readonly dataHash: string;
  readonly codeHash: string;
  readonly environmentHash: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly planHash: string;
}

/** Execution binding (doc19 §3.1, WP-05). Binds all identity hashes. */
export interface ExecutionBinding extends ExecutionBindingInput {
  readonly bindingDigest: string;
}

/** Build an execution binding from identity hashes. */
export function buildExecutionBinding(input: ExecutionBindingInput): ExecutionBinding {
  const bindingDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildExecutionBinding'), 'utf8')
    .digest('hex');
  return Object.freeze({ ...input, bindingDigest });
}

/**
 * Assert that no binding hash is a placeholder (empty or all-zero).
 * Placeholder evidence = theater; must fail closed.
 * @throws PLACEHOLDER_BINDING_DETECTED if any hash is empty or all-zero.
 */
export function assertNoPlaceholderBindings(binding: ExecutionBinding): void {
  const hashes: Array<[string, string]> = [
    ['sourceHash', binding.sourceHash],
    ['dataHash', binding.dataHash],
    ['codeHash', binding.codeHash],
    ['environmentHash', binding.environmentHash],
    ['planHash', binding.planHash],
  ];
  const allZero = '0'.repeat(64);
  for (const [name, hash] of hashes) {
    if (hash.length === 0 || hash === allZero) {
      throw new Error(
        `PLACEHOLDER_BINDING_DETECTED: ${name} is empty or all-zero; real evidence required`,
      );
    }
  }
}

/** Result of execution binding verification. */
export interface ExecutionBindingVerification {
  readonly isValid: boolean;
  readonly recomputedDigest: string;
  readonly reasonCode: 'BINDING_VALID' | 'DIGEST_MISMATCH';
}

/** Verify an execution binding by recomputing its digest. */
export function verifyExecutionBinding(binding: ExecutionBinding): ExecutionBindingVerification {
  const { bindingDigest, ...rest } = binding;
  const recomputed = createHash('sha256')
    .update(canonicalJson(rest, 'verifyExecutionBinding'), 'utf8')
    .digest('hex');
  return {
    isValid: recomputed === bindingDigest,
    recomputedDigest: recomputed,
    reasonCode: recomputed === bindingDigest ? 'BINDING_VALID' : 'DIGEST_MISMATCH',
  };
}

// ===========================================================================
// Deviation ledger
// ===========================================================================

/** Severity of a deviation. */
export type DeviationSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

/** A single deviation entry. */
export interface DeviationEntry {
  readonly deviationId: string;
  readonly description: string;
  readonly affectedReceiptIds: readonly string[];
  readonly severity: DeviationSeverity;
}

/** Deviation ledger with affected-result index (doc19 WP-05, IMPL-014). */
export interface DeviationLedger {
  readonly entries: readonly DeviationEntry[];
  readonly ledgerDigest: string;
  readonly affectedReceiptIndex: ReadonlyMap<string, readonly string[]>;
}

/** Build a deviation ledger with a queryable affected-result index. */
export function buildDeviationLedger(entries: readonly DeviationEntry[]): DeviationLedger {
  // Build affected-receipt → deviation-IDs index.
  const index = new Map<string, string[]>();
  for (const entry of entries) {
    for (const receiptId of entry.affectedReceiptIds) {
      const existing = index.get(receiptId) ?? [];
      existing.push(entry.deviationId);
      index.set(receiptId, existing);
    }
  }
  // Freeze the index values.
  const frozenIndex = new Map<string, readonly string[]>();
  for (const [k, v] of index) {
    frozenIndex.set(k, Object.freeze([...v]));
  }

  const ledgerDigest = createHash('sha256')
    .update(canonicalJson(entries, 'buildDeviationLedger'), 'utf8')
    .digest('hex');

  return Object.freeze({
    entries,
    ledgerDigest,
    affectedReceiptIndex: frozenIndex,
  });
}
