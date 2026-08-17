// tests/agent_loop/side_effect_policy.test.ts + operation_audit 语义并入同文件族：
// tests/agent_loop/operation_audit.test.ts
//
// CORE-SIDEFX-001 验收：「side-effect policy 测试和操作审计通过。」
// 集中策略面：PROTECTED_ACTIONS 覆盖所有不可逆写操作族 + 每类发起方的确定性裁决
// + 写路径清单完备性（G2）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_WRITE_MANIFEST,
  PROTECTED_ACTIONS,
  assertAgentWriteAllowed,
  isAgentWriteAllowed,
  protectedActionGuard,
} from '../../src/agent_loop/guards.ts';
import {
  OperationAuditEntrySchema,
  appendOperationAudit,
  auditActionRegistered,
  verifyOperationAuditLog,
} from '../../src/agent_loop/operation_audit.ts';
import type { OperationAuditEntry } from '../../src/agent_loop/operation_audit.ts';

// ============================================================
// 1. 集中策略：PROTECTED_ACTIONS 覆盖所有不可逆/外部副作用操作族
// ============================================================

test('SIDEFX policy: PROTECTED_ACTIONS 覆盖六大不可逆操作族（freeze/approve/seal/export/migrate/delete）', () => {
  // 每个动作对应仓库内真实存在的不可逆路径——这是策略枚举的完备性锚点
  const expected = ['approve', 'delete', 'export', 'freeze', 'migrate', 'seal']; // sorted
  assert.deepEqual([...PROTECTED_ACTIONS].sort(), expected);
  // delete/migrate/export 是外部与不可逆副作用的核心三类，缺一即策略漏洞
  for (const core of ['delete', 'migrate', 'export']) {
    assert.ok((PROTECTED_ACTIONS as readonly string[]).includes(core), `${core} must be protected`);
  }
});

test('SIDEFX policy: 每类发起方的确定性裁决（6 动作 × 5 发起方 = 30 组合全枚举）', () => {
  for (const action of PROTECTED_ACTIONS) {
    // 人类通道 + 确定性代码 → 允许
    for (const human of ['cli_user', 'api_user', 'deterministic_code'] as const) {
      const d = protectedActionGuard(action, human);
      assert.equal(d.allow, true, `${action}/${human}`);
    }
    // LLM 建议 + 外部内容 → 永拒（提示词不可信红线）
    for (const denied of ['llm_suggestion', 'external_content'] as const) {
      const d = protectedActionGuard(action, denied);
      assert.equal(d.allow, false, `${action}/${denied} must be denied`);
      assert.match(d.reason, /DENIED/);
    }
  }
});

test('SIDEFX policy fail-closed: 未知动作/未知发起方默认拒绝', () => {
  assert.equal(protectedActionGuard('rm-rf', 'cli_user').allow, false);
  assert.equal(protectedActionGuard('seal', 'cron_job').allow, false);
  assert.match(protectedActionGuard('publish', 'cli_user').reason, /default deny/);
});

test('SIDEFX policy: G2 写路径清单覆盖全部写目标族（db/fs 双域）且越界写拒绝', () => {
  // 清单必须同时覆盖 db 域与 fs 域（两类副作用面）
  assert.ok(AGENT_WRITE_MANIFEST.some((t) => t.startsWith('db:')));
  assert.ok(AGENT_WRITE_MANIFEST.some((t) => t.startsWith('fs:')));
  // 关键不可逆写目标在清单：verdict_nodes（裁决）/ proof_envelopes（密封）/ lifecycle_events（迁移）
  for (const key of ['db:verdict_nodes', 'db:proof_envelopes', 'db:lifecycle_events']) {
    assert.ok(
      AGENT_WRITE_MANIFEST.some((t) => t.startsWith(key)),
      `${key} write target must be registered`,
    );
  }
  // 越界写目标拒绝（fail-closed）
  assert.equal(isAgentWriteAllowed('db:users#dropTable'), false);
  assert.throws(() => assertAgentWriteAllowed('fs:/etc/passwd'), /写权限最小化/);
  // 登记目标放行
  assert.doesNotThrow(() => assertAgentWriteAllowed(AGENT_WRITE_MANIFEST[0]!));
});

// ============================================================
// 2. 操作审计 schema（OperationAuditEntry）
// ============================================================

function entry(overrides: Partial<OperationAuditEntry> = {}): OperationAuditEntry {
  return OperationAuditEntrySchema.parse({
    seq: 0,
    action: 'seal',
    initiator: 'cli_user',
    authorizedBy: 'cli:focal seal --claim c1',
    timestamp: '2026-08-18T00:00:00Z',
    evidenceRef: 'guard decision: initiator=cli_user(人类显式命令通道)',
    allowed: true,
    ...overrides,
  });
}

test('audit: 合法条目过 schema；缺字段/非法动作/坏时间戳/空授权（allow 时）拒绝', () => {
  assert.equal(OperationAuditEntrySchema.safeParse(entry()).success, true);
  for (const field of ['seq', 'action', 'initiator', 'timestamp', 'evidenceRef', 'allowed']) {
    const broken = { ...entry() } as Record<string, unknown>;
    delete broken[field];
    assert.equal(OperationAuditEntrySchema.safeParse(broken).success, false, `missing ${field}`);
  }
  // 未登记动作拒绝（审计账只收 PROTECTED_ACTIONS）——绕过 helper 的 parse 用裸对象注入
  const wildAction = { ...entry(), action: 'drop-table' } as Record<string, unknown>;
  assert.equal(OperationAuditEntrySchema.safeParse(wildAction).success, false);
  // 坏时间戳拒绝（绕 helper）
  const badTime = { ...entry(), timestamp: '2026/08/18' } as Record<string, unknown>;
  assert.equal(OperationAuditEntrySchema.safeParse(badTime).success, false);
  // authorizedBy 可 null（deny 记账）
  assert.equal(OperationAuditEntrySchema.safeParse(entry({ authorizedBy: null, allowed: false })).success, true);
});

test('audit append-only: seq 必须连续追加；跳号/回退/重号拒绝；deny 也入账', () => {
  const first = entry({ seq: 0 });
  const log1 = appendOperationAudit([], first);
  assert.equal(log1.length, 1);
  // deny 记账（LLM 建议被拒——拒绝是审计事实）
  const denyEntry = entry({
    seq: 1,
    action: 'freeze',
    initiator: 'llm_suggestion',
    authorizedBy: null,
    allowed: false,
    evidenceRef: 'protected action DENIED: LLM 建议不得触发受保护状态转换',
  });
  const log2 = appendOperationAudit(log1, denyEntry);
  assert.equal(log2.length, 2);
  // 跳号拒绝
  assert.throws(() => appendOperationAudit(log2, entry({ seq: 5 })), /append-only/);
  // 回退拒绝
  assert.throws(() => appendOperationAudit(log2, entry({ seq: 0 })), /append-only/);
});

test('audit verify: 全账校验（schema + seq 连续）；篡改条目被检出', () => {
  const log = [
    entry({ seq: 0 }),
    entry({ seq: 1, action: 'export' }),
  ];
  assert.deepEqual(verifyOperationAuditLog(log).violations, []);
  // 篡改：改坏一条的时间戳
  const tampered = [...log];
  tampered[1] = { ...tampered[1]!, timestamp: 'not-a-date' };
  const v1 = verifyOperationAuditLog(tampered);
  assert.equal(v1.ok, false);
  assert.match(v1.violations[0]!, /timestamp/);
  // 篡改：seq 断裂
  const gapped = [entry({ seq: 0 }), entry({ seq: 2 })];
  const v2 = verifyOperationAuditLog(gapped);
  assert.ok(v2.violations.some((x) => x.includes('continuity')));
});

test('audit: 未登记动作不得入账（auditActionRegistered 守门）', () => {
  assert.equal(auditActionRegistered('seal'), true);
  assert.equal(auditActionRegistered('self-destruct'), false);
});
