/**
 * V2 Selective Disclosure Profile — derived disclosure root, inclusion proofs, low-entropy protection.
 *
 * Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §4 (IRG-004).
 *
 * Implements:
 *   - buildDisclosureRoot: salted per-member commitments → Merkle root
 *   - verifyInclusion: Merkle inclusion proof verification
 *   - assertLowEntropyProtection: dictionary attack resistance guard
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single member commitment in the disclosure tree. */
export interface DisclosureCommitment {
  /** Index of the source member in the original array. */
  readonly index: number;
  /** sha256(salt || member) — the salted commitment hash. */
  readonly hash: string;
  /** Whether this member was disclosed (vs. committed-only). */
  readonly disclosed: boolean;
}

/** The disclosure root: a derived root over all members (disclosed + omitted). */
export interface DisclosureRoot {
  /** Merkle root of the sorted commitment hashes. */
  readonly rootHash: string;
  /** The commitment class ID (from DISCLOSURE_COMMITMENT_CLASSES). */
  readonly classId: string;
  /** Sorted commitments for all source members. */
  readonly commitments: readonly DisclosureCommitment[];
  /** Number of members whose values were NOT disclosed (committed only). */
  readonly omittedCount: number;
}

/** Inclusion proof for a disclosed member within the Merkle tree. */
export interface InclusionProof {
  /** Index of the disclosed member in the source array. */
  readonly index: number;
  /** The salt used to compute leaf = sha256(salt || member). */
  readonly salt: Buffer;
  /** Sibling hashes from leaf to root (one per Merkle level). */
  readonly siblingHashes: readonly string[];
}

// ---------------------------------------------------------------------------
// buildDisclosureRoot
// ---------------------------------------------------------------------------

/**
 * Build a disclosure root from source members with selective disclosure.
 *
 * Each member gets a salted commitment: sha256(salt || member).
 * The root is sha256(canonical_json(sorted-by-index commitments)).
 *
 * @param sourceMembers - Original member buffers (all members, including hidden ones).
 * @param disclosedIndices - Indices of members whose values are disclosed.
 * @param classId - Commitment class ID (must exist in DISCLOSURE_COMMITMENT_CLASSES).
 * @param salt - Random salt for dictionary attack resistance (≥16 bytes enforced by caller).
 * @returns Frozen DisclosureRoot.
 */
export function buildDisclosureRoot(
  sourceMembers: readonly Buffer[],
  disclosedIndices: readonly number[],
  classId: string,
  salt: Buffer,
): DisclosureRoot {
  const disclosedSet = new Set(disclosedIndices);

  const commitments: DisclosureCommitment[] = sourceMembers.map((member, index) => {
    const commitmentHash = createHash('sha256')
      .update(Buffer.concat([salt, member]))
      .digest('hex');

    return {
      index,
      hash: commitmentHash,
      disclosed: disclosedSet.has(index),
    };
  });

  // Sort commitments by index (deterministic ordering)
  commitments.sort((a, b) => a.index - b.index);

  // Compute Merkle root from sorted commitment hashes
  const hashes = commitments.map((c) => c.hash);
  const rootHash = computeMerkleRoot(hashes);

  const omittedCount = sourceMembers.length - disclosedSet.size;

  return Object.freeze({
    rootHash,
    classId,
    commitments,
    omittedCount,
  });
}

// ---------------------------------------------------------------------------
// verifyInclusion
// ---------------------------------------------------------------------------

/**
 * Verify a Merkle inclusion proof for a disclosed member.
 *
 * The leaf is computed as sha256(salt || member).
 * At each level, the sibling is combined: sha256(min(hash, sibling) || max(hash, sibling)).
 * The final hash must equal root.rootHash.
 *
 * @param disclosedMember - The member buffer being verified.
 * @param proof - Inclusion proof (index, salt, sibling hashes).
 * @param root - The disclosure root to verify against.
 * @returns true if the proof is valid, false otherwise.
 */
export function verifyInclusion(
  disclosedMember: Buffer,
  proof: InclusionProof,
  root: DisclosureRoot,
): boolean {
  // Compute the leaf hash
  const leaf = createHash('sha256')
    .update(Buffer.concat([proof.salt, disclosedMember]))
    .digest('hex');

  // Look up the commitment at this index to confirm it matches
  const commitment = root.commitments.find((c) => c.index === proof.index);
  if (commitment === undefined || commitment.hash !== leaf) {
    return false;
  }

  // Walk up the Merkle tree using sibling hashes
  let current = leaf;
  for (const sibling of proof.siblingHashes) {
    // Deterministic ordering: lexicographic sort of the two hashes
    const [left, right] = current < sibling ? [current, sibling] : [sibling, current];
    current = createHash('sha256').update(left + right, 'utf8').digest('hex');
  }

  return current === root.rootHash;
}

// ---------------------------------------------------------------------------
// assertLowEntropyProtection
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic Merkle root from a list of leaf hashes.
 * Pairs are sorted lexicographically before hashing: sha256(min(a,b) || max(a,b)).
 * If the number of leaves is odd, the last leaf is promoted to the next level.
 * Single leaf = the leaf itself as root.
 */
function computeMerkleRoot(hashes: readonly string[]): string {
  if (hashes.length === 0) {
    throw new Error('computeMerkleRoot: requires at least one hash');
  }
  if (hashes.length === 1) {
    return hashes[0]!;
  }

  let level = [...hashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      if (right === undefined) {
        // Odd count: promote last leaf
        next.push(left);
      } else {
        const [a, b] = left < right ? [left, right] : [right, left];
        next.push(createHash('sha256').update(a + b, 'utf8').digest('hex'));
      }
    }
    level = next;
  }
  return level[0]!;
}

/**
 * Assert that members and salt meet minimum entropy requirements.
 *
 * Low-entropy values are vulnerable to dictionary attacks (IRG-004).
 *
 * @param members - Source member buffers to check.
 * @param salt - Salt buffer to check.
 * @throws 'LOW_ENTROPY_DISCLOSURE_RISK' if any member < 32 bytes or salt < 16 bytes.
 */
export function assertLowEntropyProtection(
  members: readonly Buffer[],
  salt: Buffer,
): void {
  for (const member of members) {
    if (member.length < 32) {
      throw new Error('LOW_ENTROPY_DISCLOSURE_RISK');
    }
  }
  if (salt.length < 16) {
    throw new Error('LOW_ENTROPY_DISCLOSURE_RISK');
  }
}
