// tests/v2_domain/independent_verifier.test.ts
//
// SPEC-009 + IMPL-009 — clean-room verifier independence charter + independent verifier.
//
// Authority: doc19 §2 (Receipt V2 TCK), §9 (parallel team contracts),
//   17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §7 (two verifiers).
//
// The independent verifier shares NO producer parser/canonicalizer/validation/hash wrapper.
// It re-implements canonical JSON + sha256 from scratch to detect common-mode defects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INDEPENDENCE_CLASSES,
  buildIndependenceDeclaration,
  verifyIndependence,
  independentCanonicalJson,
  independentSha256Hex,
  verifyReceiptRoot,
  type IndependenceDeclaration,
} from '../../src/v2_domain/independent_verifier.ts';

// ---------------------------------------------------------------------------
// §9 Independence declaration — shared-dependency disclosure
// ---------------------------------------------------------------------------

test('INDEPENDENCE_CLASSES: enumerates shared-dependency risk classes', () => {
  const classes = [...INDEPENDENCE_CLASSES];
  // IRG-009: enumerate shared parser/canonicalizer/test authorship dependencies.
  const mustInclude = [
    'NO_SHARED_PARSER',
    'NO_SHARED_CANONICALIZER',
    'NO_SHARED_HASH_WRAPPER',
    'NO_SHARED_TEST_AUTHORSHIP',
    'NO_SHARED_TRUST_MATERIAL',
  ];
  for (const c of mustInclude) {
    assert.equal(classes.includes(c as never), true, `independence class ${c} must exist`);
  }
});

test('buildIndependenceDeclaration: produces declaration with all classes checked', () => {
  const decl = buildIndependenceDeclaration({
    verifierName: 'clean-room-verifier-v0',
    verifierTeam: 'independent-team-A',
    sharedDependencies: [],
    testedAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(decl.verifierName, 'clean-room-verifier-v0');
  assert.equal(decl.allClassesVerified, true);
});

test('buildIndependenceDeclaration: flags shared dependencies as violations', () => {
  const decl = buildIndependenceDeclaration({
    verifierName: 'v',
    verifierTeam: 't',
    sharedDependencies: [{ className: 'NO_SHARED_PARSER', detail: 'uses producer json parser' }],
    testedAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(decl.allClassesVerified, false);
  assert.ok(decl.violations.length > 0);
});

test('verifyIndependence: rejects declaration with violations', () => {
  const decl: IndependenceDeclaration = {
    verifierName: 'v',
    verifierTeam: 't',
    declarationVersion: 1,
    classes: [{ className: 'NO_SHARED_PARSER', satisfied: false, detail: 'shared' }],
    allClassesVerified: false,
    violations: ['NO_SHARED_PARSER'],
    testedAt: '2026-08-05T00:00:00Z',
  };
  assert.equal(verifyIndependence(decl).isIndependent, false);
});

test('verifyIndependence: accepts clean declaration', () => {
  const decl = buildIndependenceDeclaration({
    verifierName: 'v',
    verifierTeam: 't',
    sharedDependencies: [],
    testedAt: '2026-08-05T00:00:00Z',
  });
  assert.equal(verifyIndependence(decl).isIndependent, true);
});

// ---------------------------------------------------------------------------
// §7 Independent canonical JSON + sha256 — no producer code reuse
// ---------------------------------------------------------------------------

test('independentCanonicalJson: produces same output as producer for simple object', () => {
  const input = { b: 2, a: 1, c: [3, 2, 1] };
  const expected = '{"a":1,"b":2,"c":[3,2,1]}';
  assert.equal(independentCanonicalJson(input), expected);
});

test('independentCanonicalJson: sorts nested object keys', () => {
  const input = { z: { y: 1, x: 2 } };
  const result = independentCanonicalJson(input);
  assert.equal(result, '{"z":{"x":2,"y":1}}');
});

test('independentSha256Hex: produces 64 lowercase hex', () => {
  const hash = independentSha256Hex('hello');
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  // Known sha256("hello") value
  assert.equal(hash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

// ---------------------------------------------------------------------------
// §2 verifyReceiptRoot — independent root recomputation
// ---------------------------------------------------------------------------

test('verifyReceiptRoot: valid root matches independently recomputed digest', () => {
  const members = [
    { kind: 'claim', digest: 'a'.repeat(64), sizeBytes: 100 },
    { kind: 'fecSnapshot', digest: 'b'.repeat(64), sizeBytes: 200 },
  ];
  // Producer computes root via buildReceiptManifest; independent verifier recomputes.
  // Here we test the independent recomputation path directly.
  const result = verifyReceiptRoot(members, 'far.receipt-manifest.v1');
  assert.equal(result.isValid, true);
});

test('verifyReceiptRoot: detects tampered member digest', () => {
  const members = [
    { kind: 'claim', digest: 'INVALID', sizeBytes: 100 },
  ];
  const result = verifyReceiptRoot(members, 'far.receipt-manifest.v1');
  assert.equal(result.isValid, false);
  assert.ok(result.invalidMembers.length > 0);
});
