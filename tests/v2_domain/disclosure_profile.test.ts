// tests/v2_domain/disclosure_profile.test.ts
//
// IMPL-026 — Selective disclosure root derivation + inclusion proof + low-entropy protection.
//
// Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §4 (IRG-004).
//
// TDD RED phase: module does not exist yet → import fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildDisclosureRoot,
  verifyInclusion,
  assertLowEntropyProtection,
} from '../../src/v2_domain/disclosure_profile.ts';
import type { InclusionProof } from '../../src/v2_domain/disclosure_profile.ts';
import { DISCLOSURE_COMMITMENT_CLASSES } from '../../src/v2_domain/algorithm_registry.ts';

// ---------------------------------------------------------------------------
// buildDisclosureRoot
// ---------------------------------------------------------------------------

test('buildDisclosureRoot: returns rootHash, classId, commitments, omittedCount', () => {
  const salt = Buffer.from('A'.repeat(32), 'utf8');
  const members = [
    Buffer.from('member-one-AAAAAAAAAAAAAAAAAAAA', 'utf8'), // ≥32 bytes
    Buffer.from('member-two-BBBBBBBBBBBBBBBBBBBB', 'utf8'),
    Buffer.from('member-three-CCCCCCCCCCCCCCCCCC', 'utf8'),
  ];
  const root = buildDisclosureRoot(members, [0, 2], 'far.disclosure.derived-subset.v1', salt);

  assert.equal(typeof root.rootHash, 'string');
  assert.match(root.rootHash, /^[0-9a-f]{64}$/);
  assert.equal(root.classId, 'far.disclosure.derived-subset.v1');
  assert.ok(Array.isArray(root.commitments));
  assert.equal(root.commitments.length, 3); // all members committed
  assert.equal(root.omittedCount, 1); // only index 1 not disclosed
});

test('buildDisclosureRoot: commitments are sorted by index', () => {
  const salt = Buffer.from('B'.repeat(32), 'utf8');
  const members = [
    Buffer.from('zzz', 'utf8').length < 32 ? Buffer.from('zzz-long-pad-AAAAAAAAAAAAAAAAAA', 'utf8') : Buffer.from('zzz', 'utf8'),
    Buffer.from('aaa-long-pad-AAAAAAAAAAAAAAAAAA', 'utf8'),
  ];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.derived-subset.v1', salt);

  // commitments sorted by index
  assert.equal(root.commitments[0]!.index, 0);
  assert.equal(root.commitments[1]!.index, 1);
});

test('buildDisclosureRoot: each commitment is sha256(salt || member)', () => {
  const salt = Buffer.from('C'.repeat(32), 'utf8');
  const member = Buffer.from('disclosed-member-value-AAAAAAA', 'utf8');
  const members = [member];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.derived-subset.v1', salt);

  const expectedCommitment = createHash('sha256')
    .update(Buffer.concat([salt, member]))
    .digest('hex');

  assert.equal(root.commitments[0]!.hash, expectedCommitment);
  assert.equal(root.commitments[0]!.disclosed, true);
});

test('buildDisclosureRoot: non-disclosed members have disclosed=false', () => {
  const salt = Buffer.from('D'.repeat(32), 'utf8');
  const members = [
    Buffer.from('disclosed-member-value-AAAAAAA', 'utf8'),
    Buffer.from('hidden-member-value-BBBBBBBB', 'utf8'),
  ];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.sensitive-omitted.v1', salt);

  assert.equal(root.commitments[0]!.disclosed, true);
  assert.equal(root.commitments[1]!.disclosed, false);
});

test('buildDisclosureRoot: omittedCount matches non-disclosed indices', () => {
  const salt = Buffer.from('E'.repeat(32), 'utf8');
  const members = Array.from({ length: 5 }, (_, i) =>
    Buffer.from(`member-${i}-padding-to-thirty-two`, 'utf8'),
  );
  const root = buildDisclosureRoot(members, [0, 3, 4], 'far.disclosure.full.v1', salt);
  assert.equal(root.omittedCount, 2); // indices 1, 2 omitted
});

test('buildDisclosureRoot: all disclosed → omittedCount=0', () => {
  const salt = Buffer.from('F'.repeat(32), 'utf8');
  const members = [
    Buffer.from('member-zero-padding-to-thirty-two', 'utf8'),
    Buffer.from('member-one-padding-to-thirty-twoe', 'utf8'),
  ];
  const root = buildDisclosureRoot(members, [0, 1], 'far.disclosure.full.v1', salt);
  assert.equal(root.omittedCount, 0);
});

test('buildDisclosureRoot: rootHash is Merkle root of sorted commitment hashes', () => {
  const salt = Buffer.from('G'.repeat(32), 'utf8');
  const m0 = Buffer.from('member-zero-padding-to-thirty-two', 'utf8');
  const m1 = Buffer.from('member-one-padding-to-thirty-twoe', 'utf8');
  const members = [m0, m1];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.derived-subset.v1', salt);

  // Recompute Merkle root from sorted commitment hashes
  const leaf = (m: Buffer) => createHash('sha256').update(Buffer.concat([salt, m])).digest('hex');
  const l0 = leaf(m0);
  const l1 = leaf(m1);
  const [a, b] = l0 < l1 ? [l0, l1] : [l1, l0];
  const expectedRoot = createHash('sha256').update(a + b, 'utf8').digest('hex');
  assert.equal(root.rootHash, expectedRoot);
});

// ---------------------------------------------------------------------------
// assertLowEntropyProtection
// ---------------------------------------------------------------------------

test('assertLowEntropyProtection: member < 32 bytes throws LOW_ENTROPY_DISCLOSURE_RISK', () => {
  const salt = Buffer.from('H'.repeat(32), 'utf8');
  const members = [
    Buffer.from('short', 'utf8'), // only 5 bytes
  ];
  assert.throws(
    () => assertLowEntropyProtection(members, salt),
    { message: 'LOW_ENTROPY_DISCLOSURE_RISK' },
  );
});

test('assertLowEntropyProtection: salt < 16 bytes throws LOW_ENTROPY_DISCLOSURE_RISK', () => {
  const members = [
    Buffer.from('member-value-padding-to-thirty-two', 'utf8'), // ≥32
  ];
  const salt = Buffer.from('tiny', 'utf8'); // 4 bytes
  assert.throws(
    () => assertLowEntropyProtection(members, salt),
    { message: 'LOW_ENTROPY_DISCLOSURE_RISK' },
  );
});

test('assertLowEntropyProtection: both valid does not throw', () => {
  const members = [
    Buffer.from('member-value-padding-to-thirty-two', 'utf8'),
  ];
  const salt = Buffer.from('I'.repeat(32), 'utf8');
  assert.doesNotThrow(() => assertLowEntropyProtection(members, salt));
});

test('assertLowEntropyProtection: 32-byte member boundary (exactly 32 → pass)', () => {
  const members = [
    Buffer.from('a'.repeat(32), 'utf8'), // exactly 32
  ];
  const salt = Buffer.from('J'.repeat(16), 'utf8'); // exactly 16
  assert.doesNotThrow(() => assertLowEntropyProtection(members, salt));
});

test('assertLowEntropyProtection: 31-byte member → throw', () => {
  const members = [Buffer.from('b'.repeat(31), 'utf8')];
  const salt = Buffer.from('K'.repeat(32), 'utf8');
  assert.throws(
    () => assertLowEntropyProtection(members, salt),
    { message: 'LOW_ENTROPY_DISCLOSURE_RISK' },
  );
});

test('assertLowEntropyProtection: 15-byte salt → throw', () => {
  const members = [Buffer.from('c'.repeat(32), 'utf8')];
  const salt = Buffer.from('d'.repeat(15), 'utf8');
  assert.throws(
    () => assertLowEntropyProtection(members, salt),
    { message: 'LOW_ENTROPY_DISCLOSURE_RISK' },
  );
});

// ---------------------------------------------------------------------------
// verifyInclusion — Merkle inclusion proof
// ---------------------------------------------------------------------------

test('verifyInclusion: valid proof for single member returns true', () => {
  const salt = Buffer.from('L'.repeat(32), 'utf8');
  const m0 = Buffer.from('disclosed-member-value-AAAAAAA', 'utf8');
  const members = [m0];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.derived-subset.v1', salt);

  // For single leaf, sibling hashes is empty
  const proof: InclusionProof = {
    index: 0,
    salt: Buffer.from(salt),
    siblingHashes: [],
  };

  assert.equal(verifyInclusion(m0, proof, root), true);
});

test('verifyInclusion: valid proof for two members returns true', () => {
  const salt = Buffer.from('M'.repeat(32), 'utf8');
  const m0 = Buffer.from('disclosed-member-value-AAAAAAA', 'utf8');
  const m1 = Buffer.from('hidden-member-value-BBBBBBBB', 'utf8');
  const members = [m0, m1];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.derived-subset.v1', salt);

  // Compute commitment for m1 (sibling of m0)
  const leaf1 = createHash('sha256').update(Buffer.concat([salt, m1])).digest('hex');

  // For index 0 with 2 leaves, sibling is leaf1
  const proof: InclusionProof = {
    index: 0,
    salt: Buffer.from(salt),
    siblingHashes: [leaf1],
  };

  assert.equal(verifyInclusion(m0, proof, root), true);
});

test('verifyInclusion: wrong member returns false', () => {
  const salt = Buffer.from('N'.repeat(32), 'utf8');
  const m0 = Buffer.from('disclosed-member-value-AAAAAAA', 'utf8');
  const m1 = Buffer.from('hidden-member-value-BBBBBBBB', 'utf8');
  const members = [m0, m1];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.derived-subset.v1', salt);

  const leaf1 = createHash('sha256').update(Buffer.concat([salt, m1])).digest('hex');
  const proof: InclusionProof = {
    index: 0,
    salt: Buffer.from(salt),
    siblingHashes: [leaf1],
  };

  // Wrong member
  const wrongMember = Buffer.from('wrong-member-value-CCCCCCCCCCC', 'utf8');
  assert.equal(verifyInclusion(wrongMember, proof, root), false);
});

test('verifyInclusion: wrong salt returns false', () => {
  const salt = Buffer.from('O'.repeat(32), 'utf8');
  const m0 = Buffer.from('disclosed-member-value-AAAAAAA', 'utf8');
  const members = [m0];
  const root = buildDisclosureRoot(members, [0], 'far.disclosure.derived-subset.v1', salt);

  const proof: InclusionProof = {
    index: 0,
    salt: Buffer.from('X'.repeat(32), 'utf8'), // wrong salt
    siblingHashes: [],
  };

  assert.equal(verifyInclusion(m0, proof, root), false);
});

test('verifyInclusion: four-member tree proof for leaf 1', () => {
  const salt = Buffer.from('P'.repeat(32), 'utf8');
  const m0 = Buffer.from('member-zero-padding-to-thirty-two', 'utf8');
  const m1 = Buffer.from('member-one-padding-to-thirty-twoe', 'utf8');
  const m2 = Buffer.from('member-two-padding-to-thirty-twoee', 'utf8');
  const m3 = Buffer.from('member-three-padding-thirty-three', 'utf8');
  const members = [m0, m1, m2, m3];
  const root = buildDisclosureRoot(members, [1], 'far.disclosure.derived-subset.v1', salt);

  const leaf = (m: Buffer) => createHash('sha256').update(Buffer.concat([salt, m])).digest('hex');
  const l0 = leaf(m0);
  const l2 = leaf(m2);
  const l3 = leaf(m3);

  // Binary Merkle: level 0 leaves, level 1 parents, level 2 root
  // parent01 = sha256(min(l0,l1) || max(l0,l1))
  // parent23 = sha256(min(l2,l3) || max(l2,l3))
  // root     = sha256(min(parent01,parent23) || max(parent01,parent23))

  const parent = (left: string, right: string) => {
    const [a, b] = left < right ? [left, right] : [right, left];
    return createHash('sha256').update(a + b, 'utf8').digest('hex');
  };

  // p01 needed only for computing p23's sibling; we just need p23
  const p23 = parent(l2, l3);

  // Proof for index 1: sibling at level 0 = l0, sibling at level 1 = p23
  const proof: InclusionProof = {
    index: 1,
    salt: Buffer.from(salt),
    siblingHashes: [l0, p23],
  };

  assert.equal(verifyInclusion(m1, proof, root), true);
});

// ---------------------------------------------------------------------------
// Integration: DISCLOSURE_COMMITMENT_CLASSES linkage
// ---------------------------------------------------------------------------

test('buildDisclosureRoot: classId matches a frozen DISCLOSURE_COMMITMENT_CLASS', () => {
  const classIds = DISCLOSURE_COMMITMENT_CLASSES.map((c) => c.classId);
  assert.ok(classIds.includes('far.disclosure.full.v1'));
  assert.ok(classIds.includes('far.disclosure.derived-subset.v1'));
  assert.ok(classIds.includes('far.disclosure.sensitive-omitted.v1'));
});

test('buildDisclosureRoot: derived-subset class is dictionary-test resistant', () => {
  const cls = DISCLOSURE_COMMITMENT_CLASSES.find((c) => c.classId === 'far.disclosure.derived-subset.v1');
  assert.ok(cls, 'class must exist');
  assert.equal(cls!.dictionaryTestResistant, true);
});
