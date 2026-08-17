// tests/delegation/brief_contract.test.ts
// AGENT-BRIEF/WRITE/VERIFY-001：委派合同三件套——九字段合同、写所有权、协调者收据。
// 真实依赖：validateDelegationBrief / checkWriteOwnership / adjudicateDelegation /
// pathsOverlap / DelegationBriefSchema（纯函数，无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  CoordinatorReceiptSchema,
  DelegationBriefSchema,
  DelegationResultSchema,
  P4_FORBIDDEN_DEFAULTS,
  adjudicateDelegation,
  checkWriteOwnership,
  pathsOverlap,
  validateDelegationBrief,
} from '../../src/delegation/brief_contract.ts';
import type {
  CoordinatorReceipt,
  DelegationBrief,
  DelegationResult,
} from '../../src/delegation/brief_contract.ts';

function readOnlyBrief(): DelegationBrief {
  return DelegationBriefSchema.parse({
    briefId: 'DEL-R-001',
    objective: '侦察 src/planning 现状并输出映射表',
    contextPack: ['.far/agent/checkpoints/2026-08-18-core-b12-15.md'],
    requirementIds: ['AGENT-BRIEF-001'],
    allowedWriteSet: [],
    forbiddenFiles: ['src/'],
    forbiddenActions: ['any-write'],
    evidenceExpectation: '映射表含 file:line 与导出名',
    acceptanceCommands: ['node --test tests/delegation/brief_contract.test.ts'],
    returnSchema: [{ field: 'mapping', type: 'array<{path,export}>', description: '16 对象映射' }],
    stopConditions: ['无法定位权威定义时'],
    escalation: '协调者（主会话）',
    risk: 'P0',
  });
}

function writeBrief(overrides: Record<string, unknown> = {}): DelegationBrief {
  return DelegationBriefSchema.parse({
    ...readOnlyBrief(),
    briefId: 'DEL-W-001',
    objective: '在 tests/delegation/ 下新增测试',
    allowedWriteSet: ['tests/delegation/**'],
    forbiddenFiles: ['src/'],
    forbiddenActions: [...P4_FORBIDDEN_DEFAULTS],
    risk: 'P2',
    ...overrides,
  });
}

function result(overrides: Partial<DelegationResult> = {}): DelegationResult {
  return DelegationResultSchema.parse({
    briefId: 'DEL-W-001',
    selfReportedStatus: 'DONE',
    evidenceRefs: ['tests/delegation/brief_contract.test.ts all pass'],
    filesWritten: ['tests/delegation/brief_contract.test.ts'],
    ...overrides,
  });
}

function fullReceipt(overrides: Partial<CoordinatorReceipt> = {}): CoordinatorReceipt {
  return CoordinatorReceiptSchema.parse({
    briefId: 'DEL-W-001',
    checks: [
      { kind: 'diff-inspected', item: 'tests/delegation/*.test.ts +58 行，无越界写', pass: true },
      { kind: 'command-rerun', item: 'node --test tests/delegation/ → 15 pass', pass: true },
      { kind: 'evidence-source-checked', item: 'evidenceRefs 指向真实命令输出', pass: true },
      { kind: 'boundary-impact-checked', item: '纯新增文件，零既有行为变更', pass: true },
    ],
    sampleMethod: null,
    verdict: 'VERIFIED',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// AGENT-BRIEF-001：九字段合同
// ---------------------------------------------------------------------------

test('AGENT-BRIEF-001: 九字段合同合法输入通过（只读与写委派各一）', () => {
  const ro = validateDelegationBrief(readOnlyBrief());
  assert.equal(ro.ok, true);
  assert.equal(ro.readOnly, true);

  const w = validateDelegationBrief(writeBrief());
  assert.equal(w.ok, true);
  assert.equal(w.readOnly, false);
});

test('AGENT-BRIEF-001 fail-closed: 九字段任一缺失被 zod 拒（全字段抽验）', () => {
  const fields = ['objective', 'contextPack', 'requirementIds', 'forbiddenActions', 'evidenceExpectation', 'acceptanceCommands', 'returnSchema', 'stopConditions', 'escalation', 'briefId', 'risk'] as const;
  for (const f of fields) {
    const base = readOnlyBrief() as Record<string, unknown>;
    delete base[f];
    const parsed = DelegationBriefSchema.safeParse(base);
    assert.equal(parsed.success, false, `missing '${f}' must fail`);
  }
});

test('AGENT-BRIEF-001 fail-closed: 写委派缺 P4 红线禁止 → 拒（不得委派不受约束的写）', () => {
  const partial = writeBrief({ forbiddenActions: ['history-rewrite'] }); // 只禁了一条
  const r = validateDelegationBrief(partial);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.code === 'WRITE_DELEGATION_MISSING_P4_FORBIDDEN'));
  assert.match(r.violations[0]?.message ?? '', /git-push|missing/);
});

test('AGENT-BRIEF-001 fail-closed: allowedWriteSet 与 forbiddenFiles 同条目 = 自相矛盾拒', () => {
  const bad = writeBrief({ forbiddenFiles: ['tests/delegation/**'] });
  const r = validateDelegationBrief(bad);
  assert.ok(r.violations.some((v) => v.code === 'SCOPE_SELF_CONTRADICTION'));
});

// ---------------------------------------------------------------------------
// AGENT-WRITE-001：写所有权（读并行，写单一 owner）
// ---------------------------------------------------------------------------

test('AGENT-WRITE-001: 同路径多 owner 冲突检出；同 owner 多路径不冲突', () => {
  const conflict = checkWriteOwnership(
    [
      { path: 'src/planning/', owner: 'agent-a', baseHead: 'h1' },
      { path: 'src/planning/', owner: 'agent-b', baseHead: 'h1' },
    ],
    'h1',
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.collisions.length, 1);
  const first = conflict.collisions[0];
  assert.notEqual(first, undefined);
  if (first !== undefined) assert.deepEqual([...first.owners].sort(), ['agent-a', 'agent-b']);

  const fine = checkWriteOwnership(
    [
      { path: 'src/planning/', owner: 'agent-a', baseHead: 'h1' },
      { path: 'tests/planning/', owner: 'agent-b', baseHead: 'h1' },
    ],
    'h1',
  );
  assert.equal(fine.ok, true, `unexpected collisions: ${JSON.stringify(fine.collisions)}`);

  const sameOwner = checkWriteOwnership(
    [
      { path: 'src/a.ts', owner: 'agent-a', baseHead: 'h1' },
      { path: 'src/b.ts', owner: 'agent-a', baseHead: 'h1' },
    ],
    'h1',
  );
  assert.equal(sameOwner.ok, true, 'same owner multiple paths = no inter-agent conflict');
});

test('AGENT-WRITE-001: 子树通配重叠也算冲突（pathsOverlap 四式）', () => {
  assert.equal(pathsOverlap('src/planning/**', 'src/planning/types.ts'), true);
  assert.equal(pathsOverlap('src/planning/types.ts', 'src/planning/**'), true);
  assert.equal(pathsOverlap('src/planning/', 'src/planning/types.ts'), true);
  assert.equal(pathsOverlap('src/planning/types.ts', 'src/planning/'), true);
  assert.equal(pathsOverlap('srcx/a.ts', 'src/a.ts'), false);

  const globConflict = checkWriteOwnership(
    [
      { path: 'src/planning/**', owner: 'a', baseHead: 'h1' },
      { path: 'src/planning/types.ts', owner: 'b', baseHead: 'h1' },
    ],
    'h1',
  );
  assert.equal(globConflict.collisions.length, 1, 'glob ⊂ file overlap must collide');
});

test('AGENT-WRITE-001: stale 声明检出（baseHead ≠ currentHead → 写前必须复核，停写不盲写）', () => {
  const r = checkWriteOwnership(
    [{ path: 'src/a.ts', owner: 'agent-a', baseHead: 'old-head' }],
    'new-head',
  );
  assert.equal(r.ok, false);
  assert.equal(r.staleClaims.length, 1);
  // 基线一致时不 stale
  const fresh = checkWriteOwnership(
    [{ path: 'src/a.ts', owner: 'agent-a', baseHead: 'new-head' }],
    'new-head',
  );
  assert.equal(fresh.ok, true);
});

// ---------------------------------------------------------------------------
// AGENT-VERIFY-001：协调者收据（子代理不得自证完成）
// ---------------------------------------------------------------------------

test('AGENT-VERIFY-001: 自报 DONE + 证据 + 全覆盖收据 → DONE 成立', () => {
  const outcome = adjudicateDelegation(result(), fullReceipt());
  assert.equal(outcome.effectiveStatus, 'DONE');
});

test('AGENT-VERIFY-001 fail-closed: 无收据/无证据/自报未验证 → 一律 IMPLEMENTED_UNVERIFIED', () => {
  const noReceipt = adjudicateDelegation(result(), null);
  assert.equal(noReceipt.effectiveStatus, 'IMPLEMENTED_UNVERIFIED');
  assert.match(noReceipt.reason, /cannot self-certify/);

  const noEvidence = adjudicateDelegation(result({ evidenceRefs: [] }), fullReceipt());
  assert.equal(noEvidence.effectiveStatus, 'IMPLEMENTED_UNVERIFIED');
  assert.match(noEvidence.reason, /assertion/);

  const selfUnverified = adjudicateDelegation(
    result({ selfReportedStatus: 'IMPLEMENTED_UNVERIFIED' }),
    fullReceipt(),
  );
  assert.equal(selfUnverified.effectiveStatus, 'IMPLEMENTED_UNVERIFIED');

  const blocked = adjudicateDelegation(
    result({ selfReportedStatus: 'BLOCKED' }),
    null,
  );
  assert.equal(blocked.effectiveStatus, 'BLOCKED');
});

test('AGENT-VERIFY-001 fail-closed: 收据 briefId 错配 / 检查未过 / 缺检查类 → 降级', () => {
  const mismatch = adjudicateDelegation(result(), fullReceipt({ briefId: 'DEL-OTHER' }));
  assert.equal(mismatch.effectiveStatus, 'IMPLEMENTED_UNVERIFIED');

  const failedCheck = adjudicateDelegation(
    result(),
    fullReceipt({ checks: fullReceipt().checks.map((c, i) => (i === 0 ? { ...c, pass: false } : c)) }),
  );
  assert.equal(failedCheck.effectiveStatus, 'IMPLEMENTED_UNVERIFIED');

  const missingKind = adjudicateDelegation(
    result(),
    fullReceipt({ checks: fullReceipt().checks.slice(0, 3) }),
  );
  assert.equal(missingKind.effectiveStatus, 'IMPLEMENTED_UNVERIFIED');
  assert.match(missingKind.reason, /missing check kinds/);
});

test('AGENT-VERIFY-001: 抽样项必须声明抽样方法（宪法：抽样需说明方法）', () => {
  const sampledNoMethod = fullReceipt({
    checks: [
      ...fullReceipt().checks,
      { kind: 'command-rerun', item: 'sampled: 30/300 断言抽验', pass: true },
    ],
  });
  const noMethod = adjudicateDelegation(result(), sampledNoMethod);
  assert.equal(noMethod.effectiveStatus, 'IMPLEMENTED_UNVERIFIED');
  assert.match(noMethod.reason, /sampleMethod/);

  const withMethod = fullReceipt({
    checks: [
      ...fullReceipt().checks,
      { kind: 'command-rerun', item: 'sampled: 30/300 断言抽验', pass: true },
    ],
    sampleMethod: '均匀分层抽样：每测试文件首/中/尾各一断言',
  });
  assert.equal(adjudicateDelegation(result(), withMethod).effectiveStatus, 'DONE');
});

// ---------------------------------------------------------------------------
// 委派生命周期 e2e（机器侧串联三件）
// ---------------------------------------------------------------------------

test('委派生命周期 e2e: 只读合同 → 写合同门 → 所有权检查 → 收据裁决全链', () => {
  // 1. 只读侦察委派合法并行（无所有权要求）
  const ro = validateDelegationBrief(readOnlyBrief());
  assert.equal(ro.ok && ro.readOnly, true);

  // 2. 写委派完整合同（含 P4 全禁）过门
  const w = validateDelegationBrief(writeBrief());
  assert.equal(w.ok, true);

  // 3. 写前所有权：与他人子树冲突 → 停写
  const ownership = checkWriteOwnership(
    [
      { path: 'tests/delegation/**', owner: 'delegated-agent', baseHead: 'h1' },
      { path: 'tests/delegation/other.test.ts', owner: 'another-agent', baseHead: 'h1' },
    ],
    'h1',
  );
  assert.equal(ownership.ok, false);

  // 4. 冲突解除（another-agent 放弃该路径）后写完成 → 收据裁决 DONE
  const cleared = checkWriteOwnership(
    [{ path: 'tests/delegation/**', owner: 'delegated-agent', baseHead: 'h1' }],
    'h1',
  );
  assert.equal(cleared.ok, true);
  const final = adjudicateDelegation(result(), fullReceipt());
  assert.equal(final.effectiveStatus, 'DONE');
});
