/**
 * events_coverage.test.ts —— AgentEventBus 分支补充测试（L2 coverage-batch2）。
 *
 * 目标：src/agent_loop/events.ts branch ≥75%（Z16 门禁）。
 * 补齐既有 events.test.ts 未覆盖的分支：
 *   - on() 重复订阅同一 handler（handlers.includes === true 分支）
 *   - off() 移除已存在 handler（indexOf >= 0 → splice）与移除不存在 handler
 *   - emit() 派发时订阅者回调中再 on/off（快照派发·本轮不受影响）
 *   - MAX_HISTORY 边界：恰为 MAX_HISTORY（不 shift）vs 超出（shift 一次）
 *   - 未覆盖的事件变体构造：iteration_completed / run_completed / run_error /
 *     stage_held / stage_resumed（判别联合分支）+ isEventType 逐 type 收窄
 *   - once() wrapped 回调触发后自动退订（subscriberCount 归零）
 *
 * 铁律：测试期望基于源码实际行为；无空断言。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AgentEventBus,
  isEventType,
  type AgentLoopEvent,
} from '../../src/agent_loop/events.ts';


// ---------- on() 重复订阅分支 ----------

test('events: on() 重复订阅同一 handler → 不重复注册（includes 分支）', () => {
  const bus = new AgentEventBus();
  const received: AgentLoopEvent[] = [];
  const h = (evt: AgentLoopEvent): void => {
    received.push(evt);
  };

  const unsub1 = bus.on(h);
  const unsub2 = bus.on(h); // 同一 handler 重复 on → 走 includes 分支·不重复 push

  assert.equal(bus.subscriberCount, 1, '重复订阅同一 handler 不得增加订阅者');
  assert.equal(typeof unsub1, 'function');
  assert.equal(typeof unsub2, 'function');

  const evt: AgentLoopEvent = {
    type: 'run_started',
    runId: 'r-dup',
    ts: 't0',
    researchInputHash: 'abc',
    maxIterations: 1,
    verdictDriven: false,
  };
  bus.emit(evt);
  assert.equal(received.length, 1, '重复 on 后 emit 只派发一次');

  unsub1();
  bus.emit(evt);
  assert.equal(received.length, 1, '重复 on 返回的退订函数同样生效');
});


// ---------- off() 移除已存在/不存在 handler ----------

test('events: off() 移除已存在 handler（splice 分支）+ 移除不存在 handler 幂等', () => {
  const bus = new AgentEventBus();
  const a: AgentLoopEvent[] = [];
  const b: AgentLoopEvent[] = [];
  const ha = (evt: AgentLoopEvent): void => {
    a.push(evt);
  };
  const hb = (evt: AgentLoopEvent): void => {
    b.push(evt);
  };
  bus.on(ha);
  bus.on(hb);
  assert.equal(bus.subscriberCount, 2);

  const evt: AgentLoopEvent = {
    type: 'stage_held',
    runId: 'r-off',
    iteration: 1,
    stageId: 'stage3_hypothesis',
    ts: 't0',
  };
  bus.off(ha); // indexOf >= 0 → splice
  bus.emit(evt);
  assert.equal(a.length, 0, '已移除的 handler 不再收到事件');
  assert.equal(b.length, 1, '未移除的 handler 仍收到事件');
  assert.equal(bus.subscriberCount, 1);

  bus.off(hb);
  bus.off(hb); // 移除不存在 handler → idx < 0 分支·幂等不抛
  bus.off(ha); // 再移除已移除的 → 幂等
  assert.equal(bus.subscriberCount, 0);
});


// ---------- once() wrapped 触发后自动退订 ----------

test('events: once() wrapped 回调触发后自动退订（subscriberCount 归零）', () => {
  const bus = new AgentEventBus();
  const seen: AgentLoopEvent[] = [];
  bus.once((evt) => {
    seen.push(evt);
  });
  assert.equal(bus.subscriberCount, 1, '触发前 once 包装函数已注册');

  const evt: AgentLoopEvent = {
    type: 'stage_resumed',
    runId: 'r-once',
    iteration: 2,
    stageId: 'stage4_evidence',
    ts: 't0',
  };
  bus.emit(evt);
  bus.emit(evt);
  assert.equal(seen.length, 1, 'once 只触发一次');
  assert.equal(bus.subscriberCount, 0, '触发后 wrapped 自动 off 自身');
});


// ---------- emit() 快照派发（回调中再 on/off） ----------

test('events: emit() 快照派发——回调中新增订阅者本轮不收到该事件', () => {
  const bus = new AgentEventBus();
  const first: AgentLoopEvent[] = [];
  const late: AgentLoopEvent[] = [];
  let registered = false;
  bus.on((evt) => {
    first.push(evt);
    // 回调中再订阅（仅一次）→ 快照语义：本轮派发不包含新订阅者
    if (!registered) {
      registered = true;
      bus.on((e) => {
        late.push(e);
      });
    }
  });

  const evt: AgentLoopEvent = {
    type: 'iteration_completed',
    runId: 'r-snap',
    iteration: 1,
    tokensConsumed: 100,
    continueIteration: true,
    verdict: 'INCONCLUSIVE',
    decisiveRuleId: null,
    ts: 't0',
  };
  bus.emit(evt);
  assert.equal(first.length, 1, '原订阅者收到');
  assert.equal(late.length, 0, '回调中新增的订阅者本轮不收到');

  bus.emit(evt);
  assert.equal(first.length, 2, '原订阅者持续收到');
  assert.equal(late.length, 1, '下一轮派发时新订阅者收到');
  assert.equal(bus.subscriberCount, 2);
});


// ---------- MAX_HISTORY 边界（不 shift vs shift） ----------

test('events: MAX_HISTORY 边界——恰满不裁剪（shift 分支不触发）', () => {
  const bus = new AgentEventBus();
  for (let i = 0; i < AgentEventBus.MAX_HISTORY; i++) {
    bus.emit({
      type: 'run_started',
      runId: `r-${i}`,
      ts: `t-${i}`,
      researchInputHash: 'x',
      maxIterations: 1,
      verdictDriven: false,
    } satisfies AgentLoopEvent);
  }
  assert.equal(bus.historyLength, AgentEventBus.MAX_HISTORY);
  assert.equal(bus.snapshot()[0]?.runId, 'r-0', '恰满时首条仍在（未 shift）');

  // 再 emit 一条 → 超出 → shift 恰好一次
  bus.emit({
    type: 'run_started',
    runId: 'r-last',
    ts: 't-last',
    researchInputHash: 'x',
    maxIterations: 1,
    verdictDriven: false,
  } satisfies AgentLoopEvent);
  assert.equal(bus.historyLength, AgentEventBus.MAX_HISTORY);
  assert.equal(bus.snapshot()[0]?.runId, 'r-1', '超出后首条被裁剪');
  assert.equal(bus.snapshot().at(-1)?.runId, 'r-last', '最新一条保留');
});


// ---------- 判别联合其余事件变体构造 + isEventType 逐 type 收窄 ----------

test('events: 其余事件变体 emitTyped 全字段往返 + isEventType 逐 type 收窄', () => {
  const bus = new AgentEventBus();

  const events: readonly AgentLoopEvent[] = [
    {
      type: 'iteration_completed',
      runId: 'r1',
      iteration: 1,
      tokensConsumed: 42,
      continueIteration: false,
      verdict: 'CONFIRMED',
      decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS',
      ts: 't0',
    },
    {
      type: 'run_completed',
      runId: 'r1',
      reason: 'verdict_confirmed',
      iterations: 1,
      artifactCount: 6,
      verdict: 'CONFIRMED',
      decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS',
      ts: 't1',
    },
    {
      type: 'run_error',
      runId: 'r-err',
      code: 'MAX_TOKENS_EXCEEDED',
      message: 'budget exhausted',
      iterations: 2,
      artifactCount: 3,
      ts: 't2',
    },
    {
      type: 'stage_held',
      runId: 'r1',
      iteration: 1,
      stageId: 'stage2_integration',
      ts: 't3',
    },
    {
      type: 'stage_resumed',
      runId: 'r1',
      iteration: 1,
      stageId: 'stage2_integration',
      ts: 't4',
    },
    {
      type: 'stage_started',
      runId: 'r1',
      iteration: 1,
      stageId: 'stage1_understanding',
      ts: 't5',
    },
  ];

  for (const evt of events) {
    bus.emitTyped(evt);
  }
  assert.equal(bus.historyLength, events.length);

  // snapshot 往返：字段逐项一致（可 JSON 序列化·SSE 安全）
  const snap = bus.snapshot();
  assert.deepEqual(snap, events, '事件对象不可变·快照与源逐字段一致');

  // isEventType 逐 type 收窄（true/false 两个方向）
  const allTypes = [
    'run_started',
    'stage_started',
    'stage_completed',
    'iteration_completed',
    'run_completed',
    'run_error',
    'stage_held',
    'stage_resumed',
  ] as const;
  for (const t of allTypes) {
    for (const evt of events) {
      const expected = evt.type === t;
      assert.equal(isEventType(evt, t), expected, `isEventType(${evt.type}, ${t}) 应为 ${expected}`);
    }
  }
});

test('events: snapshotFor 按 runId 过滤——混合 runId 各自命中', () => {
  const bus = new AgentEventBus();
  const mk = (runId: string, ts: string): AgentLoopEvent => ({
    type: 'run_started',
    runId,
    ts,
    researchInputHash: 'x',
    maxIterations: 1,
    verdictDriven: false,
  });
  bus.emit(mk('r-a', 't0'));
  bus.emit(mk('r-b', 't1'));
  bus.emit(mk('r-a', 't2'));
  bus.emit(mk('r-c', 't3'));

  assert.equal(bus.snapshotFor('r-a').length, 2);
  assert.equal(bus.snapshotFor('r-b').length, 1);
  assert.equal(bus.snapshotFor('r-c').length, 1);
  assert.equal(bus.snapshotFor('r-zzz').length, 0);
});
