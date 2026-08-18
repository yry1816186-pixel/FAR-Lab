// tests/security/authz.test.ts
// SEC-AUTHZ-001：最小授权可审计 capability——默认拒绝 / deny 优先 / kind 天花板 /
// 水平+垂直越权 / confused deputy / revocation / deny-loop / prompt 重试不可绕过 /
// 审计链防篡改。纯函数（无 IO·无 mock）——判别力全部来自真实逻辑分支。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  CAPABILITY_MATRIX,
  AuditLog,
  authorizeGrant,
  can,
  requestEscalation,
  verifyAuditChain,
  type Actor,
  type CapabilityGrant,
} from '../../src/security/authz.ts';

const ADMIN: Actor = { kind: 'user', id: 'owner-admin', roles: ['admin', 'researcher'] };
const ALICE: Actor = { kind: 'user', id: 'alice', roles: ['researcher'] };
const BOB: Actor = { kind: 'user', id: 'bob', roles: ['researcher'] };
const MODEL: Actor = { kind: 'model', id: 'qwen-adapter' };

function adminGrant(partial: Partial<CapabilityGrant> & Pick<CapabilityGrant, 'permission' | 'resource' | 'granteeId'>): CapabilityGrant {
  const g = authorizeGrant(ADMIN, {
    granteeId: partial.granteeId,
    granteeKind: partial.granteeKind ?? 'user',
    permission: partial.permission,
    resource: partial.resource,
    grantedAt: partial.grantedAt ?? '2026-08-17T00:00:00.000Z',
  });
  if (!g.ok) {
    throw new Error(`adminGrant fixture failed: ${g.reason}`);
  }
  return g.grant;
}

// ---------------------------------------------------------------------------
// 最小授权矩阵 + 默认拒绝
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001: 6×5 ActorKind×PermissionKind 矩阵完整且最小授权（model 永不持有 secret）', () => {
  const kinds = ['plugin', 'tool', 'model', 'sandbox', 'user', 'agent'] as const;
  const perms = ['network', 'file', 'secret', 'data', 'external-write'] as const;
  assert.equal(kinds.length, 6);
  assert.equal(perms.length, 5);
  for (const k of kinds) {
    assert.ok(Array.isArray(CAPABILITY_MATRIX[k]), `matrix row exists: ${k}`);
    for (const declared of CAPABILITY_MATRIX[k]) {
      assert.ok((perms as readonly string[]).includes(declared), `known permission: ${declared}`);
    }
  }
  // 最小授权断言：模型/插件/工具/沙箱默认天花板不含 secret 与 external-write。
  for (const k of ['plugin', 'tool', 'model', 'sandbox', 'agent'] as const) {
    assert.ok(!CAPABILITY_MATRIX[k].includes('secret'), `${k} ceiling excludes secret`);
    assert.ok(!CAPABILITY_MATRIX[k].includes('external-write'), `${k} ceiling excludes external-write`);
  }
});

test('SEC-AUTHZ-001: 无授权声明 → 默认拒绝（最小授权）', () => {
  const r = can(ALICE, { permission: 'file', resource: 'receipts/alice/r1' }, []);
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /no matching (active )?grant/);
});

test('SEC-AUTHZ-001: 有匹配授权 → allow（resource 精确匹配）', () => {
  const g = adminGrant({ granteeId: 'alice', permission: 'file', resource: 'receipts/alice/r1' });
  const r = can(ALICE, { permission: 'file', resource: 'receipts/alice/r1' }, [g]);
  assert.equal(r.decision, 'allow');
});

// ---------------------------------------------------------------------------
// deny 优先级最高（不可被授权覆盖）
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001: deny 优先于 allow——同一 actor 同时有 grant 与 deny → deny', () => {
  const g = adminGrant({ granteeId: 'alice', permission: 'file', resource: 'receipts/alice/r1' });
  const d = { actorId: 'alice', permission: 'file' as const, resource: 'receipts/alice/r1' };
  const r = can(ALICE, { permission: 'file', resource: 'receipts/alice/r1' }, [g], [d]);
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /deny rule/);
});

test('SEC-AUTHZ-001: 通配 deny（actorId 星号通配）压制一切授权', () => {
  const g = adminGrant({ granteeId: 'alice', permission: 'file', resource: 'receipts/alice/r1' });
  const r = can(
    ALICE,
    { permission: 'file', resource: 'receipts/alice/r1' },
    [g],
    [{ actorId: '*', permission: 'file' as const }],
  );
  assert.equal(r.decision, 'deny');
});

// ---------------------------------------------------------------------------
// 水平越权 / 垂直越权 / confused deputy
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001 水平越权: alice 持有自己 receipt 的授权，访问 bob 的 receipt → deny', () => {
  const g = adminGrant({ granteeId: 'alice', permission: 'file', resource: 'receipts/alice/r1' });
  const r = can(ALICE, { permission: 'file', resource: 'receipts/bob/r9' }, [g]);
  assert.equal(r.decision, 'deny', 'horizontal privilege escalation must be denied');
});

test('SEC-AUTHZ-001 垂直越权: model actor 即便持伪造 secret 授权也被 kind 天花板拒绝', () => {
  // 伪造/越权签发的 grant（authorizeGrant 会拒签——这里直接构造绕过签发层，
  // 验证判定层天花板独立于签发层存在）。
  const forged: CapabilityGrant = {
    granteeId: 'qwen-adapter',
    granteeKind: 'model',
    permission: 'secret',
    resource: 'env/DASHSCOPE',
    grantedBy: 'compromised-admin',
    grantedAt: '2026-08-17T00:00:00.000Z',
  };
  // 签发层防线：合法入口拒签天花板外授权。
  const signed = authorizeGrant(ADMIN, {
    granteeId: 'qwen-adapter',
    granteeKind: 'model',
    permission: 'secret',
    resource: 'env/DASHSCOPE',
    grantedAt: '2026-08-17T00:00:00.000Z',
  });
  assert.equal(signed.ok, false, 'authorizeGrant must refuse ceiling-violating grant');
  // 判定层防线：伪造 grant 也过不了天花板。
  const r = can(MODEL, { permission: 'secret', resource: 'env/DASHSCOPE' }, [forged]);
  assert.equal(r.decision, 'deny', 'kind ceiling is inviolable even by forged grant');
  assert.match(r.reason, /kind ceiling|ceiling/);
});

test('SEC-AUTHZ-001 confused deputy: alice 呈现签发给 bob 的授权 → deny（授权绑定受让人）', () => {
  const g = adminGrant({ granteeId: 'bob', permission: 'file', resource: 'receipts/bob/r9' });
  const r = can(ALICE, { permission: 'file', resource: 'receipts/bob/r9' }, [g]);
  assert.equal(r.decision, 'deny', 'grant issued to bob cannot be replayed by alice');
});

// ---------------------------------------------------------------------------
// 授权来源：只有 admin/owner 能签发；自签发拒绝
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001: 非 admin 不能签发授权（vertical——授权本身是特权操作）', () => {
  const r = authorizeGrant(ALICE, {
    granteeId: 'alice',
    granteeKind: 'user',
    permission: 'file',
    resource: 'receipts/alice/r1',
    grantedAt: '2026-08-17T00:00:00.000Z',
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /admin|owner/);
});

test('SEC-AUTHZ-001: 自签发（granter == grantee 且无 admin 角色）→ 拒绝', () => {
  const r = authorizeGrant(BOB, {
    granteeId: 'bob',
    granteeKind: 'user',
    permission: 'file',
    resource: 'receipts/bob/r1',
    grantedAt: '2026-08-17T00:00:00.000Z',
  });
  assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001: revocation——已撤销的授权立即失效', () => {
  const g = adminGrant({ granteeId: 'alice', permission: 'file', resource: 'receipts/alice/r1' });
  const revoked: CapabilityGrant = { ...g, revokedAt: '2026-08-17T01:00:00.000Z' };
  assert.equal(
    can(ALICE, { permission: 'file', resource: 'receipts/alice/r1' }, [g]).decision,
    'allow',
    'active grant allows',
  );
  assert.equal(
    can(ALICE, { permission: 'file', resource: 'receipts/alice/r1' }, [revoked]).decision,
    'deny',
    'revoked grant must deny',
  );
});

// ---------------------------------------------------------------------------
// requestEscalation：prompt 来源不可绕过 deny；升级只走 REQUIRES_AUTHZ 审计
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001: requestEscalation 永不返回 allow——只产生 REQUIRES_AUTHZ 审计事件', () => {
  const audit = new AuditLog();
  const r = requestEscalation(ALICE, { permission: 'secret', resource: 'env/KEY' }, 'cli', audit);
  assert.notEqual(r.decision, 'allow');
  assert.equal(r.decision, 'require-authz');
  const events = audit.events();
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'REQUIRES_AUTHZ');
});

test('SEC-AUTHZ-001: prompt 来源的升级请求被阻断并审计（prompt 重试不可绕过 deny）', () => {
  const audit = new AuditLog();
  for (let i = 0; i < 3; i++) {
    const r = requestEscalation(MODEL, { permission: 'secret', resource: 'env/KEY' }, 'prompt', audit);
    assert.notEqual(r.decision, 'allow', `attempt ${i}: prompt escalation never allows`);
    assert.equal(r.auditType, 'ESCALATION_BLOCKED_PROMPT_SOURCE', 'blocked event type');
  }
  const blocked = audit.events().filter((e) => e.type === 'ESCALATION_BLOCKED_PROMPT_SOURCE');
  assert.equal(blocked.length, 3, 'every prompt-source attempt is audited');
});

// ---------------------------------------------------------------------------
// deny-loop 检测
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001: 同一 actor 重复被拒 ≥3 次触发 escalation_attempt 审计（deny-loop）', () => {
  const audit = new AuditLog();
  const g = adminGrant({ granteeId: 'bob', permission: 'file', resource: 'receipts/bob/r9' });
  for (let i = 0; i < 3; i++) {
    const r = can(ALICE, { permission: 'file', resource: 'receipts/bob/r9' }, [g], [], audit);
    assert.equal(r.decision, 'deny');
  }
  const loopEvents = audit.events().filter((e) => e.type === 'ESCALATION_ATTEMPT');
  assert.ok(loopEvents.length >= 1, 'deny-loop must record escalation_attempt');
  const flagged = loopEvents[0];
  assert.equal(flagged?.actorId, 'alice');
  assert.ok((flagged?.details.denyCount as number) >= 3, 'deny count recorded');
});

test('SEC-AUTHZ-001 边界: 仅 2 次拒绝不触发 deny-loop（阈值 ≥3）', () => {
  const audit = new AuditLog();
  for (let i = 0; i < 2; i++) {
    can(ALICE, { permission: 'file', resource: 'receipts/bob/r9' }, [], [], audit);
  }
  const loopEvents = audit.events().filter((e) => e.type === 'ESCALATION_ATTEMPT');
  assert.equal(loopEvents.length, 0, 'below threshold: no escalation_attempt');
});

// ---------------------------------------------------------------------------
// append-only 审计链：防篡改
// ---------------------------------------------------------------------------

test('SEC-AUTHZ-001: 审计事件 append-only——id 单调递增 + 内容冻结', () => {
  const audit = new AuditLog();
  requestEscalation(ALICE, { permission: 'file', resource: 'receipts/alice/r1' }, 'cli', audit);
  const first = audit.events()[0];
  assert.equal(first?.seq, 1);
  assert.throws(
    () => {
      (first as { type: string }).type = 'FORGED';
    },
    /Cannot assign|read only|not extensible/i,
    'audit events must be frozen',
  );
});

test('SEC-AUTHZ-001 篡改: 修改任一历史事件字段 → verifyAuditChain 失败', () => {
  const audit = new AuditLog();
  requestEscalation(ALICE, { permission: 'file', resource: 'x' }, 'cli', audit);
  requestEscalation(BOB, { permission: 'file', resource: 'y' }, 'cli', audit);
  const original = audit.events();
  assert.equal(verifyAuditChain(original).ok, true, 'pristine chain verifies');
  const tampered = original.map((e, i) =>
    i === 1 ? { ...e, type: 'REQUIRES_AUTHZ' as const, actorId: 'mallory' } : e,
  );
  const result = verifyAuditChain(tampered);
  assert.equal(result.ok, false, 'tampered event must break chain');
  assert.ok((result.firstBrokenIndex ?? -1) >= 0, 'broken index reported');
});

test('SEC-AUTHZ-001 篡改: 删除中间事件（截断重放）→ verifyAuditChain 失败', () => {
  const audit = new AuditLog();
  requestEscalation(ALICE, { permission: 'file', resource: 'x' }, 'cli', audit);
  requestEscalation(BOB, { permission: 'file', resource: 'y' }, 'cli', audit);
  requestEscalation(MODEL, { permission: 'file', resource: 'z' }, 'cli', audit);
  const truncated = [audit.events()[0], audit.events()[2]].filter(
    (e): e is NonNullable<typeof e> => e !== undefined,
  );
  assert.equal(verifyAuditChain(truncated).ok, false, 'gap in seq must break chain');
});
