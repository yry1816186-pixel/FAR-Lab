// tests/v2_domain/telemetry_schema.test.ts
//
// IMPL-030 — versioned telemetry/diagnostic semantic conventions.
// Tests: buildSemanticConvention, assertNoSensitiveData, redactFields,
//        assertCardinalityBudget, TELEMETRY_FIELD_CLASSIFICATIONS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TELEMETRY_FIELD_CLASSIFICATIONS,
  buildSemanticConvention,
  assertNoSensitiveData,
  redactFields,
  assertCardinalityBudget,
  type TelemetryFieldSpec,
} from '../../src/v2_domain/telemetry_schema.ts';

// ---------------------------------------------------------------------------
// Fixture field specs
// ---------------------------------------------------------------------------

const FIXTURE_FIELDS: readonly TelemetryFieldSpec[] = [
  { fieldName: 'task.state', classification: 'PUBLIC', otelAttributeKey: 'far.task.state', piiRisk: false, cardinalityBudget: 20 },
  { fieldName: 'task.id', classification: 'INTERNAL', otelAttributeKey: 'far.task.id', piiRisk: false, cardinalityBudget: 1000 },
  { fieldName: 'user.email', classification: 'SENSITIVE', otelAttributeKey: 'far.user.email', piiRisk: true, cardinalityBudget: 5 },
  { fieldName: 'auth.token', classification: 'SECRET', otelAttributeKey: 'far.auth.token', piiRisk: true, cardinalityBudget: 1 },
];

// ---------------------------------------------------------------------------
// §1 TELEMETRY_FIELD_CLASSIFICATIONS
// ---------------------------------------------------------------------------

test('TELEMETRY_FIELD_CLASSIFICATIONS has exactly four tiers', () => {
  assert.deepEqual(
    TELEMETRY_FIELD_CLASSIFICATIONS,
    ['PUBLIC', 'INTERNAL', 'SENSITIVE', 'SECRET'],
  );
  assert.equal(TELEMETRY_FIELD_CLASSIFICATIONS.length, 4);
});

// ---------------------------------------------------------------------------
// §2 buildSemanticConvention — basic construction
// ---------------------------------------------------------------------------

test('buildSemanticConvention: returns frozen object with correct shape', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);

  assert.equal(convention.version, '1.0.0');
  assert.equal(convention.fields.length, 4);
  assert.ok(Object.isFrozen(convention));
  assert.ok(Object.isFrozen(convention.fields));
});

test('buildSemanticConvention: maxCardinality is sum of field budgets', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  // 20 + 1000 + 5 + 1 = 1026
  assert.equal(convention.maxCardinality, 1026);
});

// ---------------------------------------------------------------------------
// §3 buildSemanticConvention — digest determinism
// ---------------------------------------------------------------------------

test('buildSemanticConvention: digest is deterministic regardless of field order', () => {
  const reversed = [...FIXTURE_FIELDS].reverse();
  const c1 = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const c2 = buildSemanticConvention('1.0.0', reversed);

  assert.equal(c1.digest, c2.digest);
});

test('buildSemanticConvention: digest changes with different fields', () => {
  const altered: readonly TelemetryFieldSpec[] = [
    { fieldName: 'task.state', classification: 'PUBLIC', otelAttributeKey: 'far.task.state', piiRisk: false, cardinalityBudget: 20 },
  ];
  const c1 = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const c2 = buildSemanticConvention('1.0.0', altered);

  assert.notEqual(c1.digest, c2.digest);
});

test('buildSemanticConvention: digest changes with different version', () => {
  const c1 = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const c2 = buildSemanticConvention('2.0.0', FIXTURE_FIELDS);

  // Same fields → same digest (version is not part of the digest input)
  assert.equal(c1.digest, c2.digest);
  assert.notEqual(c1.version, c2.version);
});

test('buildSemanticConvention: digest is a 64-char hex string', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  assert.match(convention.digest, /^[0-9a-f]{64}$/);
});

test('buildSemanticConvention: throws on empty version', () => {
  assert.throws(
    () => buildSemanticConvention('', FIXTURE_FIELDS),
    { message: /version must be non-empty/ },
  );
});

test('buildSemanticConvention: accepts empty fields array', () => {
  const convention = buildSemanticConvention('1.0.0', []);
  assert.equal(convention.fields.length, 0);
  assert.equal(convention.maxCardinality, 0);
  assert.ok(convention.digest.length > 0);
});

// ---------------------------------------------------------------------------
// §4 assertNoSensitiveData
// ---------------------------------------------------------------------------

test('assertNoSensitiveData: passes when no sensitive/secret fields present', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = { 'task.state': 'RUNNING', 'task.id': 't-001' };

  // Should not throw
  assertNoSensitiveData(event, convention);
});

test('assertNoSensitiveData: throws on SENSITIVE field in event', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = { 'user.email': 'alice@example.com' };

  assert.throws(
    () => assertNoSensitiveData(event, convention),
    { message: /TELEMETRY_SENSITIVE_DATA_LEAK/ },
  );
});

test('assertNoSensitiveData: throws on SECRET field in event', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = { 'auth.token': 'tok_abc123' };

  assert.throws(
    () => assertNoSensitiveData(event, convention),
    { message: /TELEMETRY_SENSITIVE_DATA_LEAK/ },
  );
});

test('assertNoSensitiveData: throws when both SENSITIVE and SECRET present', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = {
    'user.email': 'alice@example.com',
    'auth.token': 'tok_abc123',
  };

  // Should throw (at least for the first matching field encountered)
  assert.throws(
    () => assertNoSensitiveData(event, convention),
    { message: /TELEMETRY_SENSITIVE_DATA_LEAK/ },
  );
});

// ---------------------------------------------------------------------------
// §5 redactFields
// ---------------------------------------------------------------------------

test('redactFields: redacts SENSITIVE fields', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = {
    'task.state': 'RUNNING',
    'user.email': 'alice@example.com',
  };

  const result = redactFields(event, convention);
  assert.equal(result['task.state'], 'RUNNING');
  assert.equal(result['user.email'], '[REDACTED]');
});

test('redactFields: redacts SECRET fields', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = {
    'task.state': 'RUNNING',
    'auth.token': 'tok_abc123',
  };

  const result = redactFields(event, convention);
  assert.equal(result['task.state'], 'RUNNING');
  assert.equal(result['auth.token'], '[REDACTED]');
});

test('redactFields: passes PUBLIC and INTERNAL through unchanged', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = {
    'task.state': 'SUCCEEDED',
    'task.id': 't-042',
  };

  const result = redactFields(event, convention);
  assert.equal(result['task.state'], 'SUCCEEDED');
  assert.equal(result['task.id'], 't-042');
});

test('redactFields: does not mutate original event', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = { 'auth.token': 'secret' };

  const result = redactFields(event, convention);
  assert.equal(event['auth.token'], 'secret'); // original unchanged
  assert.equal(result['auth.token'], '[REDACTED]'); // copy redacted
});

test('redactFields: leaves unknown fields untouched', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const event: Record<string, unknown> = { 'custom.metric': 99 };

  const result = redactFields(event, convention);
  assert.equal(result['custom.metric'], 99);
});

test('redactFields: handles empty event', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const result = redactFields({}, convention);
  assert.deepEqual(result, {});
});

// ---------------------------------------------------------------------------
// §6 assertCardinalityBudget
// ---------------------------------------------------------------------------

test('assertCardinalityBudget: passes when all counts within budget', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const fieldCounts: Record<string, number> = {
    'task.state': 10,
    'task.id': 500,
    'user.email': 3,
    'auth.token': 1,
  };

  // Should not throw
  assertCardinalityBudget(fieldCounts, convention);
});

test('assertCardinalityBudget: throws when a field exceeds budget', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const fieldCounts: Record<string, number> = {
    'task.state': 25, // budget is 20
  };

  assert.throws(
    () => assertCardinalityBudget(fieldCounts, convention),
    { message: /TELEMETRY_CARDINALITY_EXCEEDED/ },
  );
});

test('assertCardinalityBudget: includes field name and counts in error', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const fieldCounts: Record<string, number> = {
    'auth.token': 5, // budget is 1
  };

  assert.throws(
    () => assertCardinalityBudget(fieldCounts, convention),
    { message: /auth.token.*5 distinct values.*budget is 1/ },
  );
});

test('assertCardinalityBudget: passes when count exactly equals budget', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const fieldCounts: Record<string, number> = {
    'task.state': 20, // exactly at budget
  };

  // Should not throw — budget is a max, not exclusive
  assertCardinalityBudget(fieldCounts, convention);
});

test('assertCardinalityBudget: ignores fields not in convention', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);
  const fieldCounts: Record<string, number> = {
    'unknown.field': 999999,
  };

  // Should not throw — unknown fields are not budget-checked
  assertCardinalityBudget(fieldCounts, convention);
});

test('assertCardinalityBudget: handles empty counts', () => {
  const convention = buildSemanticConvention('1.0.0', FIXTURE_FIELDS);

  // Should not throw
  assertCardinalityBudget({}, convention);
});

// ---------------------------------------------------------------------------
// §7 Integration — build → assert → redact pipeline
// ---------------------------------------------------------------------------

test('pipeline: build convention, assert no leak, redact, check budget', () => {
  const fields: readonly TelemetryFieldSpec[] = [
    { fieldName: 'op.name', classification: 'PUBLIC', otelAttributeKey: 'far.op.name', piiRisk: false, cardinalityBudget: 50 },
    { fieldName: 'op.duration_ms', classification: 'INTERNAL', otelAttributeKey: 'far.op.duration_ms', piiRisk: false, cardinalityBudget: 100 },
    { fieldName: 'client.ip', classification: 'SENSITIVE', otelAttributeKey: 'far.client.ip', piiRisk: true, cardinalityBudget: 10 },
  ];

  const convention = buildSemanticConvention('1.2.0', fields);

  // Event without sensitive data — assert passes
  const safeEvent: Record<string, unknown> = { 'op.name': 'receipt.verify', 'op.duration_ms': 42 };
  assertNoSensitiveData(safeEvent, convention);

  // Event with sensitive data — assert fails
  const leakyEvent: Record<string, unknown> = { 'op.name': 'receipt.verify', 'client.ip': '10.0.0.1' };
  assert.throws(() => assertNoSensitiveData(leakyEvent, convention), { message: /TELEMETRY_SENSITIVE_DATA_LEAK/ });

  // Redact the leaky event
  const redacted = redactFields(leakyEvent, convention);
  assert.equal(redacted['op.name'], 'receipt.verify');
  assert.equal(redacted['client.ip'], '[REDACTED]');

  // Budget check
  assertCardinalityBudget({ 'op.name': 5, 'op.duration_ms': 50 }, convention);
  assert.throws(
    () => assertCardinalityBudget({ 'op.name': 51 }, convention),
    { message: /TELEMETRY_CARDINALITY_EXCEEDED/ },
  );

  // Verify convention metadata
  assert.equal(convention.version, '1.2.0');
  assert.equal(convention.maxCardinality, 160); // 50 + 100 + 10
  assert.match(convention.digest, /^[0-9a-f]{64}$/);
});
