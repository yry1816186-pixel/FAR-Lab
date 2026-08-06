// tests/v2_domain/cli_grammar.test.ts
//
// IMPL-017 — CLI grammar: command registry, exit codes, JSONL envelope.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLI_EXIT_CODES,
  buildCommandRegistry,
  serializeEnvelopeAsJsonl,
  parseExitCode,
  type CliCommandSpec,
} from '../../src/v2_domain/cli_grammar.ts';
import type { MachineEnvelope } from '../../src/v2_domain/shared_schemas.ts';

// ===========================================================================
// CLI_EXIT_CODES — values are frozen and match POSIX convention
// ===========================================================================

test('CLI_EXIT_CODES: SUCCESS is 0', () => {
  assert.equal(CLI_EXIT_CODES.SUCCESS, 0);
});

test('CLI_EXIT_CODES: USAGE_ERROR is 2', () => {
  assert.equal(CLI_EXIT_CODES.USAGE_ERROR, 2);
});

test('CLI_EXIT_CODES: TASK_FAILED is 1', () => {
  assert.equal(CLI_EXIT_CODES.TASK_FAILED, 1);
});

test('CLI_EXIT_CODES: INTEGRITY_FAILURE is 70', () => {
  assert.equal(CLI_EXIT_CODES.INTEGRITY_FAILURE, 70);
});

test('CLI_EXIT_CODES: UNSUPPORTED_OPERATION is 69', () => {
  assert.equal(CLI_EXIT_CODES.UNSUPPORTED_OPERATION, 69);
});

test('CLI_EXIT_CODES: TASK_RETRYABLE is 75', () => {
  assert.equal(CLI_EXIT_CODES.TASK_RETRYABLE, 75);
});

// ===========================================================================
// buildCommandRegistry — happy path
// ===========================================================================

test('buildCommandRegistry: returns sorted commands, digest, and count', () => {
  const specs: readonly CliCommandSpec[] = [
    { commandId: 'receipt-list', operationId: 'receipt.list', subjectType: 'receipt', summary: 'list receipts' },
    { commandId: 'draft-create', operationId: 'draft.create', subjectType: 'draft', summary: 'create draft' },
    { commandId: 'config-get', operationId: 'system.config.get', subjectType: 'config', summary: 'get config' },
  ];

  const registry = buildCommandRegistry(specs);

  assert.equal(registry.commandCount, 3);
  // Sorted by commandId: config-get, draft-create, receipt-list
  assert.equal(registry.commands[0]?.commandId, 'config-get');
  assert.equal(registry.commands[1]?.commandId, 'draft-create');
  assert.equal(registry.commands[2]?.commandId, 'receipt-list');
  assert.equal(typeof registry.digest, 'string');
  assert.match(registry.digest, /^[0-9a-f]{64}$/);
});

test('buildCommandRegistry: digest is deterministic for same input', () => {
  const specs: readonly CliCommandSpec[] = [
    { commandId: 'list', operationId: 'receipt.list', subjectType: 'receipt', summary: 'list' },
  ];

  const r1 = buildCommandRegistry(specs);
  const r2 = buildCommandRegistry(specs);

  assert.equal(r1.digest, r2.digest);
});

test('buildCommandRegistry: digest is stable regardless of input order', () => {
  const a: readonly CliCommandSpec[] = [
    { commandId: 'alpha', operationId: 'receipt.list', subjectType: 'receipt', summary: 'a' },
    { commandId: 'beta', operationId: 'draft.list', subjectType: 'draft', summary: 'b' },
  ];
  const b: readonly CliCommandSpec[] = [
    { commandId: 'beta', operationId: 'draft.list', subjectType: 'draft', summary: 'b' },
    { commandId: 'alpha', operationId: 'receipt.list', subjectType: 'receipt', summary: 'a' },
  ];

  assert.equal(buildCommandRegistry(a).digest, buildCommandRegistry(b).digest);
});

test('buildCommandRegistry: empty list produces empty registry', () => {
  const registry = buildCommandRegistry([]);
  assert.equal(registry.commandCount, 0);
  assert.equal(registry.commands.length, 0);
  assert.match(registry.digest, /^[0-9a-f]{64}$/);
});

// ===========================================================================
// buildCommandRegistry — validation: unknown operation
// ===========================================================================

test('buildCommandRegistry: throws for unknown operationId', () => {
  const specs: readonly CliCommandSpec[] = [
    { commandId: 'bad', operationId: 'nonexistent.op' as unknown as CliCommandSpec['operationId'], subjectType: 'x', summary: 'bad' },
  ];

  assert.throws(
    () => buildCommandRegistry(specs),
    (err: unknown): boolean => {
      assert(err instanceof Error);
      assert.equal((err as Error & { code: string }).code, 'CLI_UNKNOWN_OPERATION');
      assert.ok(err.message.includes('nonexistent.op'));
      return true;
    },
  );
});

// ===========================================================================
// buildCommandRegistry — immutability
// ===========================================================================

test('buildCommandRegistry: result is frozen (readonly)', () => {
  const specs: readonly CliCommandSpec[] = [
    { commandId: 'frozen', operationId: 'receipt.list', subjectType: 'receipt', summary: 'f' },
  ];
  const registry = buildCommandRegistry(specs);

  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.commands));
});

// ===========================================================================
// serializeEnvelopeAsJsonl — happy path
// ===========================================================================

test('serializeEnvelopeAsJsonl: emits one line per event plus summary', () => {
  const envelope: MachineEnvelope = {
    envelopeVersion: 1,
    operationId: 'receipt.list',
    invocationId: 'inv-001',
    startedAt: '2026-08-06T00:00:00Z',
    finishedAt: '2026-08-06T00:00:01Z',
    exitCode: 0,
    events: [
      { eventSeq: 1, eventKind: 'STARTED', occurredAt: '2026-08-06T00:00:00Z' },
      { eventSeq: 2, eventKind: 'COMPLETED', occurredAt: '2026-08-06T00:00:01Z' },
    ],
    warnings: [],
  };

  const jsonl = serializeEnvelopeAsJsonl(envelope);
  const lines = jsonl.trimEnd().split('\n');

  // 2 event lines + 1 summary line = 3 lines
  assert.equal(lines.length, 3);

  // Each line must be valid JSON
  for (const line of lines) {
    JSON.parse(line); // should not throw
  }

  // First two lines are events
  const event0 = JSON.parse(lines[0]!);
  assert.equal(event0.eventSeq, 1);
  assert.equal(event0.eventKind, 'STARTED');

  const event1 = JSON.parse(lines[1]!);
  assert.equal(event1.eventSeq, 2);

  // Last line is summary
  const summary = JSON.parse(lines[2]!);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.warningCount, 0);
  assert.equal(summary.operationId, 'receipt.list');
  assert.equal(summary.invocationId, 'inv-001');
  // Summary should NOT contain events array
  assert.equal(summary.events, undefined);
});

test('serializeEnvelopeAsJsonl: empty events produces only summary line', () => {
  const envelope: MachineEnvelope = {
    envelopeVersion: 1,
    operationId: 'system.doctor',
    invocationId: 'inv-002',
    startedAt: '2026-08-06T00:00:00Z',
    finishedAt: '2026-08-06T00:00:01Z',
    exitCode: 0,
    events: [],
    warnings: [],
  };

  const jsonl = serializeEnvelopeAsJsonl(envelope);
  const lines = jsonl.trimEnd().split('\n');
  assert.equal(lines.length, 1);

  const summary = JSON.parse(lines[0]!);
  assert.equal(summary.eventCount, 0);
  assert.equal(summary.operationId, 'system.doctor');
});

test('serializeEnvelopeAsJsonl: ends with newline', () => {
  const envelope: MachineEnvelope = {
    envelopeVersion: 1,
    operationId: 'system.doctor',
    invocationId: 'inv-003',
    startedAt: '2026-08-06T00:00:00Z',
    finishedAt: '2026-08-06T00:00:01Z',
    exitCode: 0,
    events: [],
    warnings: [],
  };

  const jsonl = serializeEnvelopeAsJsonl(envelope);
  assert.ok(jsonl.endsWith('\n'));
});

// ===========================================================================
// parseExitCode — mapping
// ===========================================================================

test('parseExitCode: applied=true → SUCCESS', () => {
  assert.equal(parseExitCode({ applied: true }), CLI_EXIT_CODES.SUCCESS);
});

test('parseExitCode: applied=false, no reason → TASK_FAILED', () => {
  assert.equal(parseExitCode({ applied: false }), CLI_EXIT_CODES.TASK_FAILED);
});

test('parseExitCode: failureReason contains "integrity" → INTEGRITY_FAILURE', () => {
  assert.equal(
    parseExitCode({ applied: false, failureReason: 'integrity check failed' }),
    CLI_EXIT_CODES.INTEGRITY_FAILURE,
  );
});

test('parseExitCode: failureReason contains "retry" → TASK_RETRYABLE', () => {
  assert.equal(
    parseExitCode({ applied: false, failureReason: 'may retry later' }),
    CLI_EXIT_CODES.TASK_RETRYABLE,
  );
});

test('parseExitCode: generic failure → TASK_FAILED', () => {
  assert.equal(
    parseExitCode({ applied: false, failureReason: 'something went wrong' }),
    CLI_EXIT_CODES.TASK_FAILED,
  );
});

test('parseExitCode: "integrity" takes priority over "retry" (checked first)', () => {
  assert.equal(
    parseExitCode({ applied: false, failureReason: 'integrity issue during retry' }),
    CLI_EXIT_CODES.INTEGRITY_FAILURE,
  );
});

test('parseExitCode: case-sensitive matching for integrity', () => {
  assert.equal(
    parseExitCode({ applied: false, failureReason: 'INTEGRITY violation' }),
    CLI_EXIT_CODES.INTEGRITY_FAILURE,
  );
});

test('parseExitCode: case-sensitive matching for retry', () => {
  assert.equal(
    parseExitCode({ applied: false, failureReason: 'RETRY possible' }),
    CLI_EXIT_CODES.TASK_RETRYABLE,
  );
});
