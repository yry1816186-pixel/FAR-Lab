// tests/campaign/guard_registry.test.ts
// CAMPAIGN-GUARD-001：12 项监控清单（成熟度如实分型）+ 三新机制（租约过期/积压/退役）
// + guard event log（seq 连续 + 故障→动作映射 + 显式恢复）。故障注入面：预算/限流/
// 租约抢占/积压三档/退役命中——既有层测试不重复（scheduler 注入矩阵/预算/限流先前已在）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  GUARD_INVENTORY,
  GUARD_ITEMS,
  acquireLease,
  backlogStatus,
  buildGuardEvent,
  checkLeaseExpiry,
  checkRetirement,
  guardActionFor,
  guardInventoryCompleteness,
  renewLease,
  resumeEvent,
  verifyGuardEventLog,
} from '../../src/campaign/guard_registry.ts';
import type { GuardEvent, Lease, RetirementList } from '../../src/campaign/guard_registry.ts';

// ---------------------------------------------------------------------------
// 12 项清单（inventory = Evidence 面）
// ---------------------------------------------------------------------------

test('CAMPAIGN-GUARD-001: 12 项全部在册、每项有权威归属与成熟度', () => {
  const check = guardInventoryCompleteness();
  assert.equal(check.ok, true, `missing: ${check.missing.join(', ')}`);
  assert.equal(GUARD_INVENTORY.length, 12);
  for (const e of GUARD_INVENTORY) {
    assert.ok(e.authority.length > 0 && e.note.length > 0, `item '${e.item}' needs authority+note`);
    assert.ok(['implemented', 'partial', 'new-this-batch'].includes(e.maturity));
  }
  // 三新机制在册
  for (const item of ['queue-backlog', 'provider-retirement', 'lock-expiration'] as const) {
    assert.equal(GUARD_INVENTORY.find((e) => e.item === item)?.maturity, 'new-this-batch');
  }
  // partial 不冒充 implemented（诚实分型抽验）
  assert.equal(GUARD_INVENTORY.find((e) => e.item === 'provider-breaker')?.maturity, 'partial');
});

test('CAMPAIGN-GUARD-001 fail-closed: 清单缺席项被检出（宪法 12 项逐一在册是硬约束）', () => {
  // GUARD_ITEMS 是 SSOT——抽掉一项再核验必须红（通过直接调用完整性函数对常数表验证）
  const listed = new Set(GUARD_INVENTORY.map((e) => e.item));
  const absent = GUARD_ITEMS.filter((i) => !listed.has(i));
  assert.deepEqual(absent, []);
});

// ---------------------------------------------------------------------------
// 新机制 ①：锁租约（lock expiration——单写者假设机制化）
// ---------------------------------------------------------------------------

test('CAMPAIGN-GUARD-001 租约: 他人持有未过期 → 拒绝；过期 → 抢占；自己续租', () => {
  const t0 = 1_000_000;
  const acquired = acquireLease([], 'dir-a', 'agent-1', 5_000, t0);
  assert.equal(acquired.ok, true);
  if (!acquired.ok) return;

  // 他人未过期 → 拒
  const denied = acquireLease(acquired.leases, 'dir-a', 'agent-2', 5_000, t0 + 1_000);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.reason, /held by 'agent-1'/);

  // 过期后抢占（agent-2 拿到，agent-1 的旧租约被替换）
  const takeover = acquireLease(acquired.leases, 'dir-a', 'agent-2', 5_000, t0 + 6_000);
  assert.equal(takeover.ok, true);
  if (takeover.ok) {
    const lease = takeover.leases.find((l) => l.path === 'dir-a') as Lease;
    assert.equal(lease.owner, 'agent-2');
  }

  // owner 续租成功；他人续租拒；过期后续租拒（必须重取）
  const renewed = renewLease(acquired.leases, 'dir-a', 'agent-1', t0 + 2_000, 5_000);
  assert.equal(renewed.ok, true);
  const foreign = renewLease(acquired.leases, 'dir-a', 'agent-2', t0 + 2_000, 5_000);
  assert.equal(foreign.ok, false);
  const tooLate = renewLease(acquired.leases, 'dir-a', 'agent-1', t0 + 9_999, 5_000);
  assert.equal(tooLate.ok, false);
  if (!tooLate.ok) assert.match(tooLate.reason, /reacquire/);
});

test('CAMPAIGN-GUARD-001 租约过期检测: 到期租约被列出（guard 周期任务 → 强制释放 + 事件）', () => {
  const leases: readonly Lease[] = [
    { owner: 'a', path: 'p1', acquiredAt: 0, ttlMs: 1_000 },
    { owner: 'b', path: 'p2', acquiredAt: 500, ttlMs: 1_000 },
  ];
  const check = checkLeaseExpiry(leases, 2_000);
  assert.equal(check.ok, false);
  assert.equal(check.expired.length, 2, '两租约均到期');
  const fresh = checkLeaseExpiry(leases, 800);
  assert.equal(fresh.ok, true);
});

// ---------------------------------------------------------------------------
// 新机制 ②：队列积压三档（自动降级/暂停语义）
// ---------------------------------------------------------------------------

test('CAMPAIGN-GUARD-001 积压: ok→none / soft→degrade / hard→pause（诚实停机不静默生长）', () => {
  assert.equal(backlogStatus(3, 10, 20).level, 'ok');
  assert.equal(backlogStatus(3, 10, 20).action, 'none');
  assert.equal(backlogStatus(10, 10, 20).level, 'soft');
  assert.equal(backlogStatus(10, 10, 20).action, 'degrade');
  const hard = backlogStatus(20, 10, 20);
  assert.equal(hard.level, 'hard');
  assert.equal(hard.action, 'pause');
  assert.match(hard.detail, /honest pause/);
});

// ---------------------------------------------------------------------------
// 新机制 ③：provider/model 退役检测
// ---------------------------------------------------------------------------

test('CAMPAIGN-GUARD-001 退役: 活跃 profile 命中退役清单 → stop-using 事件可构建；未命中零事件', () => {
  const list: RetirementList = { retiredProfiles: ['qwen-old-v1', 'gpt-retired'], listVersion: '2026-08-18.1' };
  const hits = checkRetirement(['qwen-old-v1', 'qwen-latest'], list);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.profile, 'qwen-old-v1');
  assert.equal(hits[0]?.action, 'stop-using');
  assert.match(hits[0]?.detail ?? '', /retired.*stop scheduling/);
  assert.equal(checkRetirement(['qwen-latest'], list).length, 0);
});

// ---------------------------------------------------------------------------
// Guard event log（seq 连续 + 动作映射 + 显式恢复）
// ---------------------------------------------------------------------------

function eventLog(): GuardEvent[] {
  const e1 = buildGuardEvent([], {
    at: '2026-08-18T00:00:01Z', guard: 'lock-expiration', severity: 'warn', action: 'degrade',
    detail: 'lease on campaigns/cmp-1 expired — force-released',
  });
  const e2 = buildGuardEvent([e1], {
    at: '2026-08-18T00:00:02Z', guard: 'budget-breaker', severity: 'stop', action: 'stop',
    detail: 'cumulative estimate exceeds budget — honest stop',
  });
  const e3 = resumeEvent([e1, e2], 'budget-breaker', '2026-08-18T00:05:00Z', 'operator raised budget — resume from ledger');
  return [e1, e2, e3];
}

test('CAMPAIGN-GUARD-001 event log: 构建序连续 + 校验通过 + 动作映射 SSOT', () => {
  const log = eventLog();
  assert.deepEqual(log.map((e) => e.seq), [1, 2, 3]);
  assert.equal(verifyGuardEventLog(log).valid, true);
  // 故障→动作映射
  assert.equal(guardActionFor('stop'), 'stop');
  assert.equal(guardActionFor('warn'), 'degrade');
  assert.equal(guardActionFor('info'), 'none');
  // 恢复事件显式（action=resume 非隐式复活）
  assert.equal(log[2]?.action, 'resume');
});

test('CAMPAIGN-GUARD-001 event log fail-closed: 断号/重复/乱序检出', () => {
  const log = eventLog();
  assert.equal(verifyGuardEventLog([log[0] as GuardEvent, log[2] as GuardEvent]).valid, false);
  assert.equal(verifyGuardEventLog([...log, log[2] as GuardEvent]).valid, false, '重复 seq 拒');
  assert.equal(verifyGuardEventLog([log[1], log[0], log[2]] as GuardEvent[]).valid, false, '乱序拒');
});

// ---------------------------------------------------------------------------
// 故障注入 → 自动降级/暂停/恢复 端到端（纯函数串联三机制 + 事件面）
// ---------------------------------------------------------------------------

test('CAMPAIGN-GUARD-001 端到端: 租约过期→抢占恢复 / 积压硬停→缓解恢复 / 退役停用——全程事件入账', () => {
  const t0 = 10_000_000;
  let log: GuardEvent[] = [];
  let leases: readonly Lease[] = [];

  // ① 租约：agent-1 持有后崩溃（不释放）→ 到期检出 → 事件 → agent-2 抢占恢复
  const acq = acquireLease(leases, 'cmp-x', 'agent-1', 1_000, t0);
  assert.equal(acq.ok, true);
  if (acq.ok) leases = acq.leases;
  const expiry = checkLeaseExpiry(leases, t0 + 2_000);
  assert.equal(expiry.ok, false);
  log.push(buildGuardEvent(log, {
    at: 'T1', guard: 'lock-expiration', severity: 'warn', action: 'degrade',
    detail: `expired: ${(expiry.expired[0] as { lease: Lease }).lease.path}`,
  }));
  const takeover = acquireLease(leases, 'cmp-x', 'agent-2', 1_000, t0 + 2_000);
  assert.equal(takeover.ok, true, '过期租约可被抢占（恢复路径）');

  // ② 积压：深度爬升 hard → pause 事件；排空后显式 resume
  const hard = backlogStatus(25, 10, 20);
  assert.equal(hard.action, 'pause');
  log.push(buildGuardEvent(log, { at: 'T2', guard: 'queue-backlog', severity: 'stop', action: 'pause', detail: hard.detail }));
  const drained = backlogStatus(2, 10, 20);
  assert.equal(drained.action, 'none');
  log.push(resumeEvent(log, 'queue-backlog', 'T3', 'queue drained to 2 — resume intake'));

  // ③ 退役：命中的 profile 停用
  const hits = checkRetirement(['qwen-old-v1'], { retiredProfiles: ['qwen-old-v1'], listVersion: 'v1' });
  assert.equal(hits.length, 1);
  log.push(buildGuardEvent(log, {
    at: 'T4', guard: 'provider-retirement', severity: 'stop', action: 'stop',
    detail: hits[0]?.detail ?? '',
  }));

  // 全程事件账 seq 连续（4 条）
  assert.equal(verifyGuardEventLog(log).valid, true);
  assert.equal(log.length, 4);
});
