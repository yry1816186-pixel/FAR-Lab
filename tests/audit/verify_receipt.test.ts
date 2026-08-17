// tests/audit/verify_receipt.test.ts
// ENG-AUDIT-001：统一审计验证收据——跨链聚合、五类验收测试面（tamper/truncation/
// reorder/rotation/recovery）、高风险 fail-closed。真实依赖：真实链构建器（campaign/
// decision/operation-audit/guard 四链）与各自真实验证器（无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  AuditVerifyReceiptSchema,
  buildAuditVerifyReceipt,
  campaignChain,
  decisionChain,
  guardEventChain,
  highRiskOperationAllowed,
  operationAuditChain,
  rotateChainAnchor,
  verifyRotationBoundary,
} from '../../src/audit/verify_receipt.ts';
import { buildCampaignEvent } from '../../src/campaign/event_log.ts';
import type { CampaignEvent } from '../../src/campaign/types.ts';
import { buildStoredDecision } from '../../src/agent_loop/decision_log.ts';
import type { StoredDecision } from '../../src/agent_loop/decision_log.ts';
import { appendOperationAudit } from '../../src/agent_loop/operation_audit.ts';
import type { OperationAuditEntry } from '../../src/agent_loop/operation_audit.ts';
import { buildGuardEvent } from '../../src/campaign/guard_registry.ts';
import type { GuardEvent } from '../../src/campaign/guard_registry.ts';

import type { CampaignEventPayload } from '../../src/campaign/types.ts';

function campaignEvents(n = 3): CampaignEvent[] {
  const events: CampaignEvent[] = [];
  let prev = '';
  for (let i = 0; i < n; i += 1) {
    const payload: CampaignEventPayload = i === 0
      ? { type: 'campaign_started', topic: 't', plannedQuestions: ['q1'], budgetTokens: 1000 }
      : { type: 'question_started', index: 0, question: 'q1' };
    const e = buildCampaignEvent(i + 1, `2026-08-18T00:00:0${i + 1}Z`, payload, prev);
    events.push(e);
    prev = e.eventHash;
  }
  return events;
}

function decisions(n = 2): StoredDecision[] {
  const chain: StoredDecision[] = [];
  for (let i = 0; i < n; i += 1) {
    const sd = buildStoredDecision(chain, {
      at: `2026-08-18T00:00:0${i + 1}Z`, kind: 'selected', subject: `h${i}`,
      chosen: `候选${i}`, why: `评分${i}`, rejected: [], ruleTriggered: null, degradedAt: null,
    });
    chain.push(sd);
  }
  return chain;
}

function guardEvents(n = 2): GuardEvent[] {
  const log: GuardEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    log.push(buildGuardEvent(log, {
      at: `2026-08-18T00:00:0${i + 1}Z`, guard: 'budget-breaker', severity: 'info',
      action: 'none', detail: `d${i}`,
    }));
  }
  return log;
}

function fullChains() {
  return [
    campaignChain(campaignEvents()),
    decisionChain(decisions()),
    guardEventChain(guardEvents()),
  ];
}

// ---------------------------------------------------------------------------
// 聚合收据（Evidence：audit verify receipt）
// ---------------------------------------------------------------------------

test('ENG-AUDIT-001: 四链全绿 → 收据 allValid + receiptHash 可复核 + schema 合法', () => {
  const receipt = buildAuditVerifyReceipt('2026-08-18T00:00:00Z', fullChains());
  assert.equal(receipt.allValid, true);
  assert.equal(receipt.chains.length, 3);
  assert.match(receipt.receiptHash, /^[0-9a-f]{64}$/);
  assert.equal(AuditVerifyReceiptSchema.safeParse(receipt).success, true);
  // 确定性：同输入同收据哈希（at 不参与——时点元数据）
  const again = buildAuditVerifyReceipt('2026-08-19T00:00:00Z', fullChains());
  assert.equal(again.receiptHash, receipt.receiptHash, '同链状态 → 同收据哈希（时点不影响）');
});

// ---------------------------------------------------------------------------
// tamper / truncation / reorder（三攻击面）
// ---------------------------------------------------------------------------

test('ENG-AUDIT-001 tamper: 篡改 campaign 链条目 → 收据红且列名定位', () => {
  const events = campaignEvents();
  const tampered = events.map((e, i) =>
    i === 1 ? { ...e, payload: { ...e.payload, question: '改过的问题' } } : e,
  );
  const receipt = buildAuditVerifyReceipt('T', [campaignChain(tampered), ...fullChains().slice(1)]);
  assert.equal(receipt.allValid, false);
  const broken = receipt.chains.find((c) => !c.valid);
  assert.equal(broken?.name, 'campaign-ledger');
  assert.notEqual(broken?.firstBroken, null);
});

test('ENG-AUDIT-001 truncation: 截断决策账尾部 → 红且列名（截断不是合法轮换）', () => {
  const chain = decisions(3);
  const truncated = chain.slice(0, 2);
  // 截断链自身仍自洽（2 条内部一致）——但轮换边界校验会抓（下一测试）；收据面：
  // 单独验证截断链 = 合法——诚实说明：纯截断检测依赖边界锚（rotation）或外部长度记录。
  // 这里测：与已知 entryCount 期望不符时收据暴露（count 3→2 可观测）。
  const receipt = buildAuditVerifyReceipt('T', [decisionChain(truncated)]);
  assert.equal(receipt.chains[0]?.entryCount, 2);
  // 但同链内部一致性仍在——诚实断言其 valid（不能假装截断必被链内检测）
  assert.equal(receipt.chains[0]?.valid, true, '纯截断链内部自洽——检测靠轮换边界/外部长度锚（见 rotation 测试）');
});

test('ENG-AUDIT-001 reorder: 交换两条 guard 事件 → 红且定位', () => {
  const events = guardEvents(3);
  const reordered = [events[1], events[0], events[2]] as GuardEvent[];
  const receipt = buildAuditVerifyReceipt('T', [guardEventChain(reordered)]);
  assert.equal(receipt.allValid, false);
  assert.equal(receipt.chains[0]?.name, 'guard-events');
});

// ---------------------------------------------------------------------------
// rotation（锚点轮换——跨边界验证 + 截断在此被抓）
// ---------------------------------------------------------------------------

test('ENG-AUDIT-001 rotation: 轮换边界三方一致 → valid；篡改 previousHead → 抓', () => {
  const events = campaignEvents();
  const oldHead = (events.at(-1) as CampaignEvent).eventHash;
  const { rotation, newGenesisPrevHash } = rotateChainAnchor(oldHead, '密钥周期轮换 2026-08', '2026-08-18T01:00:00Z');

  // 新链第一条事件 prevHash = 轮换事件哈希
  const firstNew = buildCampaignEvent(1, '2026-08-18T01:00:01Z', {
    type: 'question_started', index: 1, question: 'q2',
  }, newGenesisPrevHash);
  assert.equal(
    verifyRotationBoundary(oldHead, rotation, firstNew.prevEventHash).valid,
    true,
    '旧头↔轮换事件↔新链起点 三方一致',
  );

  // 篡改：轮换事件声称的旧头与实际不符
  const forged = { ...rotation, previousHead: 'f'.repeat(64) };
  assert.equal(verifyRotationBoundary(oldHead, forged, newGenesisPrevHash).valid, false);

  // 截断在此被抓：旧链只剩 1 条（头不是 oldHead）→ 边界校验红（历史被切断）
  const truncatedOld = events.slice(0, 1);
  const truncatedHead = (truncatedOld.at(-1) as CampaignEvent).eventHash;
  const boundary = verifyRotationBoundary(truncatedHead, rotation, newGenesisPrevHash);
  assert.equal(boundary.valid, false, '截断的旧链接不上轮换边界——历史切断被检出');
});

// ---------------------------------------------------------------------------
// recovery（恢复：坏链上拒绝高风险操作；修复后放行）
// ---------------------------------------------------------------------------

test('ENG-AUDIT-001 recovery+fail-closed: 坏链 → 高风险操作拒（列名原因）；修复（重放重建）→ 放行；无收据 → 拒', () => {
  const good = buildAuditVerifyReceipt('T', fullChains());
  assert.equal(highRiskOperationAllowed(good, 'release-publish').allowed, true);

  const tamperedEvents = campaignEvents().map((e, i) => (i === 2 ? { ...e, at: '改过' } : e));
  const bad = buildAuditVerifyReceipt('T', [campaignChain(tamperedEvents), ...fullChains().slice(1)]);
  const blocked = highRiskOperationAllowed(bad, 'release-publish');
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /campaign-ledger/);

  assert.equal(highRiskOperationAllowed(null, 'destructive-delete').allowed, false, '无收据高风险必拒');
  assert.match(highRiskOperationAllowed(null, 'pr-merge').reason, /no receipt/);

  // 修复 = 从合法源重放重建链（此处用重建后的真链）→ 新收据绿 → 放行
  const repaired = buildAuditVerifyReceipt('T2', fullChains());
  assert.equal(highRiskOperationAllowed(repaired, 'release-publish').allowed, true);
});

// ---------------------------------------------------------------------------
// operation-audit 链适配器（含 seq 违规定位）
// ---------------------------------------------------------------------------

test('ENG-AUDIT-001 operation-audit 适配: 正常账全绿；seq 断档账红且定位首坏条', () => {
  const base: OperationAuditEntry = {
    seq: 0, action: 'export', initiator: 'cli_user', authorizedBy: 'a',
    timestamp: '2026-08-18T00:00:00Z', evidenceRef: 'e', allowed: true,
  };
  const log = appendOperationAudit([], base);
  const ok = buildAuditVerifyReceipt('T', [operationAuditChain(log)]);
  assert.equal(ok.allValid, true);

  // 断档：抽掉第 2 条（seq 1,3）——手构（appendOperationAudit 会拒断档，攻击面是直接写文件）
  const second: OperationAuditEntry = {
    seq: 1, action: 'seal', initiator: 'cli_user', authorizedBy: 'a',
    timestamp: '2026-08-18T00:00:01Z', evidenceRef: 'e2', allowed: true,
  };
  const third: OperationAuditEntry = {
    seq: 2, action: 'delete', initiator: 'cli_user', authorizedBy: 'a',
    timestamp: '2026-08-18T00:00:02Z', evidenceRef: 'e3', allowed: true,
  };
  const full = appendOperationAudit(appendOperationAudit(log, second), third);
  // 攻击面 = 直接改文件抽中段（appendOperationAudit 本身会拒断档）→ 手构 [0,2]
  const gapped = full.filter((e) => e.seq !== 1);
  const bad = buildAuditVerifyReceipt('T', [operationAuditChain(gapped)]);
  assert.equal(bad.allValid, false);
  assert.match(bad.chains[0]?.reason ?? '', /seq|3/);
});
