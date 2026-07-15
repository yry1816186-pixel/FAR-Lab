import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import { INTENT_LABELS } from '../../src/dialogue/dialogue_types.ts';

test('hashCanonicalJson of INTENT_LABELS is deterministic (same input → same hash)', () => {
  const input1 = { intentLabels: [...INTENT_LABELS] };
  const input2 = { intentLabels: [...INTENT_LABELS] };
  const hash1 = hashCanonicalJson(input1);
  const hash2 = hashCanonicalJson(input2);
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test('hashCanonicalJson of INTENT_LABELS is order-independent in object keys (cross-lang stable)', () => {
  const input1 = { intentLabels: [...INTENT_LABELS], version: 1 };
  const input2 = { version: 1, intentLabels: [...INTENT_LABELS] };
  const hash1 = hashCanonicalJson(input1);
  const hash2 = hashCanonicalJson(input2);
  assert.equal(hash1, hash2);
});

test('hashCanonicalJson changes when INTENT_LABELS content changes (avalanche)', () => {
  const original = { intentLabels: [...INTENT_LABELS] };
  const modified = { intentLabels: [...INTENT_LABELS.slice(0, 7), 'modified_label'] };
  const hashOriginal = hashCanonicalJson(original);
  const hashModified = hashCanonicalJson(modified);
  assert.notEqual(hashOriginal, hashModified);
});

test('INTENT_LABELS canonical hash is 64 hex chars (sha256)', () => {
  const hash = hashCanonicalJson({ intentLabels: [...INTENT_LABELS] });
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('cross-lang hash: INTENT_LABELS array order is preserved in canonical JSON', () => {
  const canonical = JSON.stringify({ intentLabels: [...INTENT_LABELS] });
  const parsed = JSON.parse(canonical) as { intentLabels: string[] };
  assert.deepEqual(parsed.intentLabels, [...INTENT_LABELS]);
});
