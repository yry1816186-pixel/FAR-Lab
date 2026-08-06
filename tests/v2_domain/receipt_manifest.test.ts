// tests/v2_domain/receipt_manifest.test.ts
//
// IMPL-006/007 — Receipt V2 mandatory manifest + all-member digests.
//
// Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3.3,
//   17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §2.
// Closes: IRG-007 (mandatory manifest), IRG-004 (all-member digests).
//
// The manifest is the fail-closed authority: a receipt without a manifest, or with
// a manifest missing a required member, must FAIL verification — never silently downgrade.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_MANIFEST_MEMBER_KINDS,
  buildReceiptManifest,
  verifyReceiptManifest,
  type ReceiptManifestMember,
} from '../../src/v2_domain/receipt_manifest.ts';

// ---------------------------------------------------------------------------
// Required member kinds
// ---------------------------------------------------------------------------

test('REQUIRED_MANIFEST_MEMBER_KINDS: includes all 6 assurance-critical kinds', () => {
  const kinds = [...REQUIRED_MANIFEST_MEMBER_KINDS];
  // Every required member from doc19 §3.3 + doc17 §2
  const mustInclude = [
    'claim',
    'fecSnapshot',
    'protocolFreeze',
    'datasetBindings',
    'workflowBindings',
    'verdictTrace',
    'antiTheaterReport',
  ];
  for (const k of mustInclude) {
    assert.equal(kinds.includes(k as never), true, `required member kind ${k} must exist`);
  }
});

// ---------------------------------------------------------------------------
// buildReceiptManifest
// ---------------------------------------------------------------------------

test('buildReceiptManifest: produces manifest with digest per member + root digest', () => {
  const members: ReceiptManifestMember[] = [
    { kind: 'claim', digest: 'a'.repeat(64), sizeBytes: 100 },
    { kind: 'fecSnapshot', digest: 'b'.repeat(64), sizeBytes: 200 },
    { kind: 'protocolFreeze', digest: 'c'.repeat(64), sizeBytes: 50 },
    { kind: 'datasetBindings', digest: 'd'.repeat(64), sizeBytes: 300 },
    { kind: 'workflowBindings', digest: 'e'.repeat(64), sizeBytes: 150 },
    { kind: 'verdictTrace', digest: 'f'.repeat(64), sizeBytes: 400 },
    { kind: 'antiTheaterReport', digest: '0'.repeat(64), sizeBytes: 80 },
  ];
  const manifest = buildReceiptManifest(members);

  assert.equal(manifest.members.length, 7);
  assert.equal(manifest.rootDigest.length, 64, 'root digest must be 64 hex');
  assert.equal(manifest.requiredMemberCount, REQUIRED_MANIFEST_MEMBER_KINDS.length);
});

test('buildReceiptManifest: root digest is deterministic (same members → same root)', () => {
  const members: ReceiptManifestMember[] = [
    { kind: 'claim', digest: 'a'.repeat(64), sizeBytes: 100 },
    { kind: 'fecSnapshot', digest: 'b'.repeat(64), sizeBytes: 200 },
  ];
  const m1 = buildReceiptManifest(members);
  const m2 = buildReceiptManifest(members);
  assert.equal(m1.rootDigest, m2.rootDigest);
});

test('buildReceiptManifest: member order does not change root digest (sorted by kind)', () => {
  const members1: ReceiptManifestMember[] = [
    { kind: 'claim', digest: 'a'.repeat(64), sizeBytes: 100 },
    { kind: 'fecSnapshot', digest: 'b'.repeat(64), sizeBytes: 200 },
  ];
  const members2: ReceiptManifestMember[] = [
    { kind: 'fecSnapshot', digest: 'b'.repeat(64), sizeBytes: 200 },
    { kind: 'claim', digest: 'a'.repeat(64), sizeBytes: 100 },
  ];
  assert.equal(buildReceiptManifest(members1).rootDigest, buildReceiptManifest(members2).rootDigest);
});

// ---------------------------------------------------------------------------
// verifyReceiptManifest — fail-closed
// ---------------------------------------------------------------------------

test('verifyReceiptManifest: complete manifest passes', () => {
  const members: ReceiptManifestMember[] = REQUIRED_MANIFEST_MEMBER_KINDS.map((kind, i) => ({
    kind,
    // Generate valid 64-hex digest: index-based to avoid non-hex letters.
    digest: (i.toString(16).padStart(2, '0') + 'a').repeat(32).slice(0, 64),
    sizeBytes: 100,
  }));
  const manifest = buildReceiptManifest(members);
  const result = verifyReceiptManifest(manifest);
  assert.equal(result.isValid, true);
  assert.equal(result.missingMembers.length, 0);
});

test('verifyReceiptManifest: missing required member FAILS (no silent downgrade)', () => {
  // Omit 'antiTheaterReport' — a required member.
  const incompleteMembers: ReceiptManifestMember[] = REQUIRED_MANIFEST_MEMBER_KINDS
    .filter((k) => k !== 'antiTheaterReport')
    .map((kind) => ({ kind, digest: 'a'.repeat(64), sizeBytes: 100 }));
  const manifest = buildReceiptManifest(incompleteMembers);
  const result = verifyReceiptManifest(manifest);
  assert.equal(result.isValid, false);
  assert.ok(result.missingMembers.includes('antiTheaterReport'),
    'must report antiTheaterReport as missing');
});

test('verifyReceiptManifest: empty manifest FAILS', () => {
  const manifest = buildReceiptManifest([]);
  const result = verifyReceiptManifest(manifest);
  assert.equal(result.isValid, false);
  assert.equal(result.missingMembers.length, REQUIRED_MANIFEST_MEMBER_KINDS.length);
});

test('verifyReceiptManifest: detects digest format violations', () => {
  const badMembers: ReceiptManifestMember[] = [
    { kind: 'claim', digest: 'not-a-valid-hex', sizeBytes: 100 },
  ];
  const manifest = buildReceiptManifest(badMembers);
  const result = verifyReceiptManifest(manifest);
  assert.equal(result.isValid, false);
  assert.ok(result.invalidDigestMembers.length > 0);
});

test('verifyReceiptManifest: duplicate kind FAILS', () => {
  const dupMembers: ReceiptManifestMember[] = [
    { kind: 'claim', digest: 'a'.repeat(64), sizeBytes: 100 },
    { kind: 'claim', digest: 'b'.repeat(64), sizeBytes: 100 },
  ];
  const manifest = buildReceiptManifest(dupMembers);
  const result = verifyReceiptManifest(manifest);
  assert.equal(result.isValid, false);
  assert.ok(result.duplicateKinds.length > 0);
});
