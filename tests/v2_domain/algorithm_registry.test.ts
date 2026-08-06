// tests/v2_domain/algorithm_registry.test.ts
//
// SPEC-003/004/005/006 merged: canonical algorithm registry + ContractBindingSet.
//
// This is the machine authority that IRG-001..007 require. It freezes:
//   - canonicalizationAlgorithmId (IRG-003: JCS boundary decision)
//   - numericalEquivalenceProfile N0-N4 (IRG-001)
//   - randomnessManifest contract (IRG-002)
//   - disclosureProfile roots (IRG-004)
//   - externalReferencePolicy (IRG-005)
//   - trust/time/suite registry (IRG-006/007)
//
// Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §3-§6,
//            19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §3.1, §4.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICALIZATION_ALGORITHMS,
  NUMERICAL_EQUIVALENCE_LEVELS,
  RANDOMNESS_PRNG_FAMILIES,
  DISCLOSURE_COMMITMENT_CLASSES,
  EXTERNAL_REFERENCE_AVAILABILITY_STATES,
  SIGNATURE_ALGORITHM_SUITES,
  TRUST_TIME_CONTEXTS,
  buildContractBindingSet,
} from '../../src/v2_domain/algorithm_registry.ts';
import type { CanonicalizationAlgorithmId } from '../../src/v2_domain/algorithm_registry.ts';

// ---------------------------------------------------------------------------
// SPEC-003 / IRG-003: canonicalization algorithm registry
// ---------------------------------------------------------------------------

test('CANONICALIZATION_ALGORITHMS: JCS_PRIMARY frozen with NFC preprocessing boundary', () => {
  const ids = [...CANONICALIZATION_ALGORITHMS].map((a) => a.algorithmId);
  assert.equal(ids.includes('far.canon.jcs-primary.v1'), true);
  const jcs = CANONICALIZATION_ALGORITHMS.find((a) => a.algorithmId === 'far.canon.jcs-primary.v1');
  assert.ok(jcs, 'JCS primary algorithm must exist');
  // IRG-003 decision: one explicit preprocessing boundary.
  // NFC normalization happens at the claim-text field level BEFORE canonicalization,
  // not inside JCS (RFC 8785 does not normalize strings). This separates the two concerns.
  assert.equal(jcs.stringNormalization, 'none-in-canonicalization');
  assert.equal(jcs.numberSerialization, 'RFC-8785-section-6.2');
  assert.equal(jcs.keyOrdering, 'lexicographic-utf16');
});

test('CanonicalizationAlgorithmId: type covers frozen algorithm IDs', () => {
  const id: CanonicalizationAlgorithmId = 'far.canon.jcs-primary.v1';
  assert.equal(id, 'far.canon.jcs-primary.v1');
});

// ---------------------------------------------------------------------------
// SPEC-004 / IRG-001: numerical equivalence profile N0-N4
// ---------------------------------------------------------------------------

test('NUMERICAL_EQUIVALENCE_LEVELS: exactly N0-N4 with distinct semantics', () => {
  const levels = [...NUMERICAL_EQUIVALENCE_LEVELS];
  assert.equal(levels.length, 5);
  const [n0, n1, n2, n3, n4] = levels;
  assert.ok(n0 && n0.level === 'N0');
  assert.ok(n0 && n0.semantic === 'exact-bit-identity');
  assert.ok(n1 && n1.level === 'N1');
  assert.ok(n1 && n1.semantic === 'execution-fingerprint-match');
  assert.ok(n2 && n2.level === 'N2');
  assert.ok(n2 && n2.semantic === 'bounded-ulp-divergence');
  assert.ok(n3 && n3.level === 'N3');
  assert.ok(n3 && n3.semantic === 'bounded-threshold-divergence');
  assert.ok(n4 && n4.level === 'N4');
  assert.ok(n4 && n4.semantic === 'different-decision-bounded');
});

test('NumericalEquivalenceLevel: each level has divergenceRule and threshold', () => {
  for (const level of NUMERICAL_EQUIVALENCE_LEVELS) {
    assert.ok(level.divergenceRule, `${level.level} must have divergenceRule`);
    assert.ok(typeof level.threshold === 'number' || level.threshold === null,
      `${level.level} threshold must be number or null`);
  }
  // N0 = exact: threshold 0
  assert.equal([...NUMERICAL_EQUIVALENCE_LEVELS][0]?.threshold, 0);
  // N4 = different decision: threshold null (no numeric bound; decision boundary)
  assert.equal([...NUMERICAL_EQUIVALENCE_LEVELS][4]?.threshold, null);
});

// ---------------------------------------------------------------------------
// SPEC-004 / IRG-002: randomness manifest
// ---------------------------------------------------------------------------

test('RANDOMNESS_PRNG_FAMILIES: includes mulberry32 with stream-derivation rules', () => {
  const ids = [...RANDOMNESS_PRNG_FAMILIES].map((r) => r.prngFamilyId);
  assert.equal(ids.includes('far.prng.mulberry32.v1'), true);
  const m32 = RANDOMNESS_PRNG_FAMILIES.find((r) => r.prngFamilyId === 'far.prng.mulberry32.v1');
  assert.ok(m32);
  // IRG-002: receipt design must bind PRNG family/state/substreams/call order/parallel schedule.
  assert.ok(m32.streamDerivationRule.length > 0);
  assert.ok(m32.parallelSchedulePolicy.length > 0);
});

// ---------------------------------------------------------------------------
// SPEC-005 / IRG-004: disclosure commitment classes
// ---------------------------------------------------------------------------

test('DISCLOSURE_COMMITMENT_CLASSES: separated source and disclosure roots', () => {
  const classes = [...DISCLOSURE_COMMITMENT_CLASSES];
  // IRG-004: derived disclosure receipts, commitment classes, linkability rules.
  assert.ok(classes.length >= 3);
  const ids = classes.map((c) => c.classId);
  assert.equal(ids.includes('far.disclosure.full.v1'), true);
  assert.equal(ids.includes('far.disclosure.derived-subset.v1'), true);
  assert.equal(ids.includes('far.disclosure.sensitive-omitted.v1'), true);
  // Sensitive-omitted must have a dictionary-test resistance declaration.
  const sensitive = classes.find((c) => c.classId === 'far.disclosure.sensitive-omitted.v1');
  assert.ok(sensitive);
  assert.equal(sensitive.dictionaryTestResistant, true);
});

// ---------------------------------------------------------------------------
// SPEC-005 / IRG-005: external reference availability states
// ---------------------------------------------------------------------------

test('EXTERNAL_REFERENCE_AVAILABILITY_STATES: covers 200/302/403/404/drift scenarios', () => {
  const states = [...EXTERNAL_REFERENCE_AVAILABILITY_STATES];
  const mustInclude = ['RESOLVED', 'REDIRECTED', 'FORBIDDEN', 'NOT_FOUND', 'CONTENT_DRIFT', 'AUTH_REQUIRED'];
  for (const s of mustInclude) {
    assert.equal(states.includes(s as never), true, `availability state ${s} must exist`);
  }
});

// ---------------------------------------------------------------------------
// SPEC-006 / IRG-006/007: signature suites + trust-time contexts
// ---------------------------------------------------------------------------

test('SIGNATURE_ALGORITHM_SUITES: initial suite frozen with renewal stop-sign semantics', () => {
  const suites = [...SIGNATURE_ALGORITHM_SUITES];
  assert.ok(suites.length >= 1);
  const initial = suites[0];
  assert.ok(initial, 'initial suite must exist');
  assert.ok(initial.suiteId.startsWith('far.sig.'));
  // IRG-007: algorithm rotation cross-generation state machine.
  assert.ok(initial.renewalPolicy.stopSignDate.length > 0);
  assert.ok(initial.renewalPolicy.stopVerifyDate.length > 0);
  assert.ok(initial.renewalPolicy.downgradeBehavior.length > 0);
});

test('TRUST_TIME_CONTEXTS: historical/current/renewal outcomes separated', () => {
  const ctxs = [...TRUST_TIME_CONTEXTS];
  assert.ok(ctxs.length >= 3);
  const kinds = ctxs.map((c) => c.contextKind);
  assert.equal(kinds.includes('historical'), true);
  assert.equal(kinds.includes('current'), true);
  assert.equal(kinds.includes('renewal'), true);
});

// ---------------------------------------------------------------------------
// §3.1 ContractBindingSet — versioned canonical object (never ambient config)
// ---------------------------------------------------------------------------

test('buildContractBindingSet: produces digest-bound canonical object with all required bindings', () => {
  const cbs = buildContractBindingSet({
    deploymentProfile: 'O_OFFLINE_VERIFIER',
    verificationPolicyId: 'far.policy.standard-v0.v1',
    scientificProfile: 'far.sci.two-group-fixture-v0.v1',
    disclosureProfile: 'far.disclosure.full.v1',
    canonicalizationAlgorithmId: 'far.canon.jcs-primary.v1' as const,
    numericalEquivalenceProfileId: 'far.numeric.N0-exact.v1',
    externalReferencePolicyId: 'far.extref.standard-v0.v1',
    executionContainmentPolicyId: 'far.contain.local-isolated.v1',
    preservationPolicyId: 'far.preserve.local-archive.v1',
    trustPolicyId: 'far.trust.keyless-v0.v1',
  });

  assert.ok(cbs.digest.length === 64, 'ContractBindingSet must have 64-hex digest');
  assert.equal(cbs.version, 1);
  assert.equal(cbs.deploymentProfile, 'O_OFFLINE_VERIFIER');
  // Every required binding must be present; absence/default/latest is invalid (doc19 §3.1).
  assert.ok(cbs.bindings.canonicalizationAlgorithmId);
  assert.ok(cbs.bindings.numericalEquivalenceProfileId);
});

test('buildContractBindingSet: rejects absent/default/latest values (fail-closed)', () => {
  assert.throws(
    () => buildContractBindingSet({
      deploymentProfile: 'O_OFFLINE_VERIFIER',
      verificationPolicyId: '',  // empty = invalid
      scientificProfile: 'far.sci.two-group-fixture-v0.v1',
      disclosureProfile: 'far.disclosure.full.v1',
      canonicalizationAlgorithmId: 'far.canon.jcs-primary.v1' as const,
      numericalEquivalenceProfileId: 'far.numeric.N0-exact.v1',
      externalReferencePolicyId: 'far.extref.standard-v0.v1',
      executionContainmentPolicyId: 'far.contain.local-isolated.v1',
      preservationPolicyId: 'far.preserve.local-archive.v1',
      trustPolicyId: 'far.trust.keyless-v0.v1',
    }),
    /CONTRACT_BINDING_INVALID/,
  );
});

test('ContractBindingSet: digest is deterministic (same input → same digest)', () => {
  const input = {
    deploymentProfile: 'L_LOCAL_AUTHOR' as const,
    verificationPolicyId: 'far.policy.standard-v0.v1',
    scientificProfile: 'far.sci.two-group-fixture-v0.v1',
    disclosureProfile: 'far.disclosure.full.v1',
    canonicalizationAlgorithmId: 'far.canon.jcs-primary.v1' as const,
    numericalEquivalenceProfileId: 'far.numeric.N0-exact.v1',
    externalReferencePolicyId: 'far.extref.standard-v0.v1',
    executionContainmentPolicyId: 'far.contain.local-isolated.v1',
    preservationPolicyId: 'far.preserve.local-archive.v1',
    trustPolicyId: 'far.trust.keyless-v0.v1',
  };
  const a = buildContractBindingSet(input);
  const b = buildContractBindingSet(input);
  assert.equal(a.digest, b.digest, 'same input must produce same digest');
});
