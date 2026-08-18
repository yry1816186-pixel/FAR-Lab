// tests/platform/observability.test.ts
//
// ENG-OBS-001 验收测试：关键操作结构化可观测性——真实发射点存在性、
// 事件字段 fail-closed 校验、safe-fields-only 密钥形状消毒、correlationId
// 贯穿单调性。零遥测：sink 注入、模块无网络面。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  checkEmissionPoints,
  containsSecretShape,
  CRITICAL_OPERATION_KINDS,
  emitEvent,
  inMemorySink,
  redactEvent,
  validateStructuredEvent,
  verifyEventStream,
  type StructuredEvent,
} from '../../src/platform/observability.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function makeEvent(overrides: Partial<StructuredEvent> = {}): StructuredEvent {
  return {
    eventId: 'EVT-1',
    operation: 'campaign.question_completed',
    kind: 'write',
    utcTimestamp: '2026-08-18T03:00:00.000Z',
    severity: 'info',
    module: 'campaign/scheduler',
    correlation: { traceId: 'trace-1', stepId: '1' },
    modelToolSource: 'offline_replay',
    mode: 'RECORDED_REPLAY',
    latencyMs: 42,
    tokenUsage: { inputTokens: 100, outputTokens: 50 },
    errorFallbackReason: null,
    requirementRefs: ['ENG-OBS-001'],
    ...overrides,
  };
}

test('emission points: every critical operation kind maps to real on-disk emitters', () => {
  const check = checkEmissionPoints(REPO_ROOT);
  assert.deepEqual(check, { ok: true, problems: [] }, JSON.stringify(check));
  assert.deepEqual([...CRITICAL_OPERATION_KINDS], ['write', 'verdict', 'release', 'external-call']);
});

test('field validation is fail-closed: constitution-required fields enforced', () => {
  assert.deepEqual(validateStructuredEvent(makeEvent()), { ok: true, problems: [] });

  // 非 UTC（带 +08:00 偏移）时间戳拒绝——宪法要求 UTC。
  const tz = validateStructuredEvent(makeEvent({ utcTimestamp: '2026-08-18T11:00:00.000+08:00' }));
  assert.equal(tz.ok, false);
  assert.ok(tz.problems.some((p) => p.includes('UTC ISO 8601')));

  // 相关性 id 全缺 → 拒绝。
  const noCorr = validateStructuredEvent(makeEvent({ correlation: {} }));
  assert.equal(noCorr.ok, false);
  assert.ok(noCorr.problems.some((p) => p.includes('correlation')));

  // 空 requirementRefs / 非法 severity/mode/kind / 负 latency / 负 token。
  for (const overrides of [
    { requirementRefs: [] },
    { severity: 'loud' as StructuredEvent['severity'] },
    { mode: 'SOMEHOW' as StructuredEvent['mode'] },
    { kind: 'read' as StructuredEvent['kind'] },
    { latencyMs: -1 },
    { tokenUsage: { inputTokens: -5, outputTokens: 0 } },
  ] as const) {
    const r = validateStructuredEvent(makeEvent(overrides as Partial<StructuredEvent>));
    assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(overrides)}`);
  }
});

// 合成密钥形状测试向量：运行时拼接构造（形态真实、值非任何真实凭据——
// 零密钥字面量纪律：字面量形态本身会被 secret 扫描器命中，故拆分构造）。
const syntheticSk = ['sk-', 'abcdefghijklmnopqrst'].join('');
const syntheticGhp = ['ghp_', 'abcdefghijklmnopqrst'].join('');

test('safe-fields-only: secret-shaped free-text values are redacted; structural fields reject the event', () => {
  assert.ok(containsSecretShape(syntheticSk));
  assert.ok(containsSecretShape(syntheticGhp));
  assert.ok(containsSecretShape(['-----BEGIN RSA PRIVATE', ' KEY-----'].join('')));
  assert.equal(containsSecretShape('plain value'), false);

  // 自由文本字段消毒（redacted 上报、值替换）。
  const r = redactEvent(makeEvent({ modelToolSource: syntheticSk, errorFallbackReason: syntheticGhp }));
  assert.deepEqual([...r.redacted].sort(), ['errorFallbackReason', 'modelToolSource']);
  assert.equal(r.event.modelToolSource, '[REDACTED]');
  assert.equal(r.event.errorFallbackReason, '[REDACTED]');
  assert.deepEqual(r.rejected, []);

  // 结构性字段（correlation/requirementRefs）携带密钥形状 → emitEvent fail-closed。
  const sink = inMemorySink();
  assert.throws(
    () => emitEvent(makeEvent({ correlation: { traceId: syntheticSk } }), sink.sink),
    /secret-shaped values in structural fields/,
  );
  assert.throws(
    () => emitEvent(makeEvent({ requirementRefs: [syntheticGhp] }), sink.sink),
    /secret-shaped/,
  );
  assert.equal(sink.events.length, 0, 'rejected events must not be emitted');
});

test('emitEvent: valid event reaches the injected local sink; invalid event throws and emits nothing', () => {
  const { sink, events } = inMemorySink();
  const r = emitEvent(makeEvent(), sink);
  assert.deepEqual(r.redacted, []);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.eventId, 'EVT-1');

  assert.throws(
    () => emitEvent(makeEvent({ utcTimestamp: 'not-a-date' }), sink),
    /structurally invalid event/,
  );
  assert.equal(events.length, 1);
});

test('correlation threading: stepId must be strictly monotonic within a trace, independent across traces', () => {
  const good = [
    makeEvent({ eventId: 'a', correlation: { traceId: 't1', stepId: '1' } }),
    makeEvent({ eventId: 'b', correlation: { traceId: 't1', stepId: '3' } }),
    makeEvent({ eventId: 'c', correlation: { traceId: 't2', stepId: '1' } }), // 另一 trace 独立计数
    makeEvent({ eventId: 'd', correlation: { traceId: 't1', stepId: '4' } }),
  ];
  assert.deepEqual(verifyEventStream(good), { ok: true, problems: [] });

  const broken = [
    makeEvent({ eventId: 'a', correlation: { traceId: 't1', stepId: '2' } }),
    makeEvent({ eventId: 'b', correlation: { traceId: 't1', stepId: '2' } }), // 重复 step
    makeEvent({ eventId: 'c', correlation: { traceId: 't1', stepId: '1' } }), // 回退
    makeEvent({ eventId: 'e', correlation: { traceId: 't1' } }), // trace 有但 step 缺
  ];
  const r = verifyEventStream(broken);
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 3);
  assert.ok(r.problems.some((p) => p.includes('monotonic ordering') && p.includes('previous 2')));
  assert.ok(r.problems.some((p) => p.includes('numeric stepId')));
});
