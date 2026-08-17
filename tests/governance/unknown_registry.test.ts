// tests/governance/unknown_registry.test.ts
//
// GOV-UNKNOWN-001 / GOV-REOPEN-001 验收测试（宪法 acceptance 原文）：
//   dependency propagation、stale assumption、resolved-unknown tests 通过；
//   trigger-to-reopen dependency tests 通过。
// 全部为确定性纯函数测试：无 IO、时钟由参数注入。失败路径覆盖状态机非法转换。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  appendReopenLog,
  applyTrigger,
  degradedConclusions,
  findStaleAssumptions,
  GovernanceTransitionError,
  lintRegistry,
} from '../../src/governance/unknown_registry.ts';
import {
  AssumptionEntrySchema,
  GovernanceRegistrySchema,
  UnknownEntrySchema,
} from '../../src/governance/types.ts';
import type { GovernanceRegistry } from '../../src/governance/types.ts';

const TODAY = '2026-08-17';

function makeUnknown(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'UNK-1',
    what: '券额对账是否成立',
    whyUnknown: '控制台对账单未导出',
    impact: '影响所有对外成本声明',
    investigation: '导出控制台账单与累计 token 对拍',
    blocking: ['DEC-cost-claim'],
    owner: 'coordinator',
    targetEvidence: ['控制台对账单 + 累计 token 台账差值 < 5%'],
    status: 'OPEN',
    resolvedAt: null,
    resolutionEvidence: [],
    ...overrides,
  };
}

function makeAssumption(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'ASM-1',
    statement: 'mutation gate 20/20 killed 足以代表当前测试强度',
    evidence: ['mutation_gate.mjs 2026-08-17 实跑 20/20 killed'],
    confidence: 0.75,
    affectedDecisions: ['REQ-ENG-TEST-001', 'DEC-test-strength-claim'],
    invalidationTrigger: '内核新模块纳入变异集后存活率上升',
    reviewDate: '2026-09-01',
    reviewEvent: null,
    status: 'ACTIVE',
    invalidatedAt: null,
    invalidationReason: null,
    ...overrides,
  };
}

function makeRegistry(
  unknownOverrides: Record<string, unknown>[] = [{}],
  assumptionOverrides: Record<string, unknown>[] = [{}],
): GovernanceRegistry {
  return GovernanceRegistrySchema.parse({
    unknowns: unknownOverrides.map((o) => makeUnknown(o)),
    assumptions: assumptionOverrides.map((o) => makeAssumption(o)),
  });
}

// ---------------------------------------------------------------------------
// schema —— SSOT 校验
// ---------------------------------------------------------------------------

test('schema: valid entries parse; malformed fields are rejected (fail-closed)', () => {
  assert.ok(UnknownEntrySchema.safeParse(makeUnknown()).success);
  assert.ok(AssumptionEntrySchema.safeParse(makeAssumption()).success);

  // 置信度越界 → 拒绝
  assert.equal(AssumptionEntrySchema.safeParse(makeAssumption({ confidence: 1.5 })).success, false);
  assert.equal(AssumptionEntrySchema.safeParse(makeAssumption({ confidence: -0.1 })).success, false);
  // 日期格式 → 拒绝
  assert.equal(AssumptionEntrySchema.safeParse(makeAssumption({ reviewDate: '2026/09/01' })).success, false);
  // 非法状态枚举 → 拒绝
  assert.equal(UnknownEntrySchema.safeParse(makeUnknown({ status: 'DONE' })).success, false);
  assert.equal(AssumptionEntrySchema.safeParse(makeAssumption({ status: 'BROKEN' })).success, false);
  // 宪法要求的字段缺失 → 拒绝（whyUnknown / invalidationTrigger 等）
  assert.equal(UnknownEntrySchema.safeParse(makeUnknown({ whyUnknown: undefined })).success, false);
  assert.equal(AssumptionEntrySchema.safeParse(makeAssumption({ invalidationTrigger: undefined })).success, false);
});

// ---------------------------------------------------------------------------
// lint —— 登记完整性（每条规则都有反例测试）
// ---------------------------------------------------------------------------

test('lint: clean registry passes with zero violations', () => {
  const registry = makeRegistry();
  assert.deepEqual(lintRegistry(registry), []);
});

test('lint: duplicate ids (within kind and across kinds) are flagged', () => {
  const sameKind = makeRegistry(
    [{ id: 'UNK-DUP' }, { id: 'UNK-DUP' }],
  );
  const dupWithin = lintRegistry(sameKind).filter((v) => v.rule === 'duplicate_id');
  assert.equal(dupWithin.length, 1);

  const acrossKind = makeRegistry(
    [{ id: 'X-1' }],
    [{ id: 'X-1' }],
  );
  const dupAcross = lintRegistry(acrossKind).filter((v) => v.rule === 'duplicate_id');
  assert.equal(dupAcross.length, 1);
  assert.match(dupAcross[0]!.detail, /assumption/);
});

test('lint: RESOLVED unknown without evidence/date is flagged (no evidence, no resolution)', () => {
  const registry = makeRegistry([{ status: 'RESOLVED', resolutionEvidence: [], resolvedAt: null }]);
  const violations = lintRegistry(registry).filter((v) => v.rule === 'unknown_resolved_without_evidence');
  assert.equal(violations.length, 2); // 缺 evidence + 缺 resolvedAt
});

test('lint: ABANDONED unknown without decision date is flagged', () => {
  const registry = makeRegistry([{ status: 'ABANDONED', resolvedAt: null }]);
  assert.equal(
    lintRegistry(registry).some((v) => v.rule === 'unknown_abandoned_without_reason'),
    true,
  );
});

test('lint: assumption without review anchor (neither date nor event) is flagged', () => {
  const registry = makeRegistry([], [{ reviewDate: null, reviewEvent: null }]);
  assert.equal(
    lintRegistry(registry).some((v) => v.rule === 'assumption_missing_review_anchor'),
    true,
  );
});

test('lint: INVALIDATED without reason, and ACTIVE carrying a reason, are both flagged', () => {
  const bad = lintRegistry(
    makeRegistry([], [{ status: 'INVALIDATED', invalidationReason: null, invalidatedAt: '2026-08-01' }]),
  );
  assert.equal(bad.some((v) => v.rule === 'assumption_invalidated_without_reason'), true);

  const inconsistent = lintRegistry(
    makeRegistry([], [{ status: 'ACTIVE', invalidationReason: 'premature' }]),
  );
  assert.equal(inconsistent.some((v) => v.rule === 'assumption_invalidated_without_reason'), true);
});

test('lint: dangling references are caught only when a known-item set is provided', () => {
  const registry = makeRegistry();
  assert.equal(lintRegistry(registry).length, 0); // 不提供 knownItemIds → 不校验（范围外）

  const violations = lintRegistry(registry, {
    knownItemIds: ['REQ-ENG-TEST-001'], // DEC-test-strength-claim 不在集合 → 悬空
  });
  assert.equal(
    violations.filter((v) => v.rule === 'dangling_reference' && v.detail.includes('DEC-test-strength-claim')).length,
    1,
  );

  const withUnknownDangling = lintRegistry(
    makeRegistry([{ blocking: ['REQ-GHOST'] }], []),
    { knownItemIds: ['REQ-ENG-TEST-001'] },
  );
  assert.equal(
    withUnknownDangling.some((v) => v.rule === 'dangling_reference' && v.detail.includes('REQ-GHOST')),
    true,
  );
});

// ---------------------------------------------------------------------------
// stale —— 过期假设
// ---------------------------------------------------------------------------

test('stale: past reviewDate is stale; today/future/null/event-anchored are not', () => {
  const registry = makeRegistry(
    [],
    [
      { id: 'ASM-PAST', reviewDate: '2026-08-10' },     // 过期 7 天
      { id: 'ASM-TODAY', reviewDate: TODAY },           // 当天不算过期
      { id: 'ASM-FUTURE', reviewDate: '2026-09-01' },   // 未到期
      { id: 'ASM-EVENT', reviewDate: null, reviewEvent: '每次发布前复查' }, // 事件锚定
      { id: 'ASM-PAST-INVALIDATED', reviewDate: '2026-08-10', status: 'INVALIDATED' }, // 已失效不再算 stale
    ],
  );
  const stale = findStaleAssumptions(registry, TODAY);
  assert.deepEqual(stale.map((s) => s.id), ['ASM-PAST']);
  assert.equal(stale[0]!.daysOverdue, 7);
});

test('stale: review boundary is exact (one day overdue → stale)', () => {
  const registry = makeRegistry([], [{ reviewDate: '2026-08-16' }]);
  assert.equal(findStaleAssumptions(registry, TODAY).length, 1);
});

// ---------------------------------------------------------------------------
// degraded conclusions —— 失效语义（GOV-UNKNOWN-001 Failure 分支）
// ---------------------------------------------------------------------------

test('degraded: invalidated and stale assumptions degrade every affected decision', () => {
  const registry = makeRegistry(
    [],
    [
      { id: 'ASM-INV', status: 'INVALIDATED', invalidatedAt: '2026-08-01', invalidationReason: 'r', affectedDecisions: ['D1', 'D2'] },
      { id: 'ASM-STALE', reviewDate: '2026-08-10', affectedDecisions: ['D2', 'D3'] },
      { id: 'ASM-OK', reviewDate: '2027-01-01', affectedDecisions: ['D4'] },
    ],
  );
  const degraded = degradedConclusions(registry, TODAY);
  // D2 出现两次（两个成因），D1/D3 各一次，D4 不出现
  assert.deepEqual(
    degraded.map((d) => `${d.decisionId}:${d.cause}`).sort(),
    ['D1:invalidated', 'D2:invalidated', 'D2:stale', 'D3:stale'],
  );
});

test('degraded: RETIRED assumption does not degrade anything', () => {
  const registry = makeRegistry(
    [],
    [{ status: 'RETIRED', affectedDecisions: ['D9'] }],
  );
  assert.deepEqual(degradedConclusions(registry, TODAY), []);
});

// ---------------------------------------------------------------------------
// dependency propagation —— 假设失效 → 决策重开（GOV-UNKNOWN-001 核心）
// ---------------------------------------------------------------------------

test('propagation: invalidating an assumption reopens every affected decision (direct) and flags dependent assumptions (depth 2)', () => {
  const registry = makeRegistry(
    [],
    [
      { id: 'ASM-ROOT', affectedDecisions: ['D1', 'D2'] },
      // ASM-OTHER 依赖 D1 → D1 被重开后 ASM-OTHER 必须复查（impacted, depth 2）
      { id: 'ASM-OTHER', affectedDecisions: ['D1', 'D5'] },
    ],
  );
  const outcome = applyTrigger(registry, {
    trigger: 'invalidated_assumption',
    at: TODAY,
    assumptionId: 'ASM-ROOT',
    reason: '变异存活率上升',
  });

  // 状态转换：ACTIVE → INVALIDATED，带失效事实
  const root = outcome.registry.assumptions.find((a) => a.id === 'ASM-ROOT')!;
  assert.equal(root.status, 'INVALIDATED');
  assert.equal(root.invalidatedAt, TODAY);
  assert.equal(root.invalidationReason, '变异存活率上升');
  // 输入 registry 不被改动（纯函数）
  assert.equal(registry.assumptions[0]!.status, 'ACTIVE');

  const reopens = outcome.events.filter((e) => e.kind === 'reopen');
  const impacted = outcome.events.filter((e) => e.kind === 'impacted');
  assert.deepEqual(
    reopens.map((e) => e.subjectId).sort(),
    ['D1', 'D2'],
  );
  for (const e of reopens) {
    assert.equal(e.trigger, 'invalidated_assumption');
    assert.equal(e.via, 'direct');
    assert.equal(e.chainDepth, 1);
    assert.equal(e.causeRef, 'ASM-ROOT');
  }
  assert.deepEqual(impacted.map((e) => e.subjectId), ['ASM-OTHER']);
  assert.equal(impacted[0]!.chainDepth, 2);

  // 受影响图：D1 同时被 reopen 命中，ASM-OTHER 在自己的键下
  assert.ok(outcome.affectedGraph.has('D1'));
  assert.ok(outcome.affectedGraph.has('ASM-OTHER'));
});

test('propagation: seq numbering is contiguous and respects existing log base', () => {
  const registry = makeRegistry([], [{ affectedDecisions: ['D1', 'D2'] }]);
  const outcome = applyTrigger(registry, {
    trigger: 'invalidated_assumption',
    at: TODAY,
    assumptionId: 'ASM-1',
    reason: 'r',
  }, 100);
  assert.deepEqual(outcome.events.map((e) => e.seq), [100, 101]);
});

// ---------------------------------------------------------------------------
// resolved-unknown —— 未知项解决 → 阻塞项释放重开
// ---------------------------------------------------------------------------

test('resolved-unknown: resolution reopens blocked items as new evidence; unknown becomes RESOLVED with evidence', () => {
  const registry = makeRegistry([{ blocking: ['D1', 'D2'] }], []);
  const outcome = applyTrigger(registry, {
    trigger: 'new_evidence',
    at: TODAY,
    unknownId: 'UNK-1',
    resolutionEvidence: ['控制台对账单 2026-08-17：差值 1.2%'],
  });

  const unknown = outcome.registry.unknowns[0]!;
  assert.equal(unknown.status, 'RESOLVED');
  assert.equal(unknown.resolvedAt, TODAY);
  assert.deepEqual(unknown.resolutionEvidence, ['控制台对账单 2026-08-17：差值 1.2%']);

  const reopens = outcome.events.filter((e) => e.kind === 'reopen');
  assert.deepEqual(reopens.map((e) => e.subjectId).sort(), ['D1', 'D2']);
  for (const e of reopens) {
    assert.equal(e.trigger, 'new_evidence');
    assert.equal(e.causeRef, 'UNK-1');
  }
  assert.equal(lintRegistry(outcome.registry).length, 0); // 解决后登记仍 lint-clean
});

test('resolved-unknown failure paths: empty evidence / terminal state / unknown id rejected', () => {
  const registry = makeRegistry([{ status: 'RESOLVED', resolvedAt: '2026-08-01', resolutionEvidence: ['e'] }], []);

  assert.throws(
    () => applyTrigger(makeRegistry(), { trigger: 'new_evidence', at: TODAY, unknownId: 'UNK-1', resolutionEvidence: [] }),
    GovernanceTransitionError,
  );
  assert.throws(
    () => applyTrigger(registry, { trigger: 'new_evidence', at: TODAY, unknownId: 'UNK-1', resolutionEvidence: ['e'] }),
    /terminal lifecycle states are immutable/,
  );
  assert.throws(
    () => applyTrigger(makeRegistry(), { trigger: 'new_evidence', at: TODAY, unknownId: 'UNK-GHOST', resolutionEvidence: ['e'] }),
    /not registered/,
  );
});

// ---------------------------------------------------------------------------
// trigger-to-reopen —— 其余宪法触发器（GOV-REOPEN-001 全触发面）
// ---------------------------------------------------------------------------

test('trigger-to-reopen: explicit triggers emit direct reopens and depth-2 propagation', () => {
  const explicitTriggers = [
    'regression',
    'changed_requirement',
    'benchmark_fcs_shift',
    'dependency_security_event',
    'architecture_schema_change',
    'correction_retraction',
    'reproducibility_failure',
  ] as const;
  for (const trigger of explicitTriggers) {
    const registry = makeRegistry(
      [{ blocking: ['D-BLOCKED'] }],
      [{ id: 'ASM-DEP', affectedDecisions: ['D-BLOCKED', 'D-OTHER'] }],
    );
    const outcome = applyTrigger(registry, {
      trigger,
      at: TODAY,
      subjectIds: ['D-BLOCKED'],
      causeRef: 'external-audit',
      reason: '红队复检发现回归',
    });
    const reopen = outcome.events.find((e) => e.kind === 'reopen');
    assert.equal(reopen?.subjectId, 'D-BLOCKED', trigger);
    assert.equal(reopen?.trigger, trigger);
    assert.equal(reopen?.via, 'direct');
    // 依赖 D-BLOCKED 的活跃假设被标记 impacted
    assert.equal(outcome.events.some((e) => e.kind === 'impacted' && e.subjectId === 'ASM-DEP'), true, trigger);
  }
});

test('trigger-to-reopen failure paths: empty subjects / invalidating a non-ACTIVE assumption', () => {
  assert.throws(
    () => applyTrigger(makeRegistry(), {
      trigger: 'regression', at: TODAY, subjectIds: [], causeRef: 'x', reason: 'r',
    }),
    /at least one subjectId/,
  );
  const invalidated = makeRegistry(
    [],
    [{ status: 'INVALIDATED', invalidatedAt: '2026-08-01', invalidationReason: 'r' }],
  );
  assert.throws(
    () => applyTrigger(invalidated, {
      trigger: 'invalidated_assumption', at: TODAY, assumptionId: 'ASM-1', reason: 'again',
    }),
    /only ACTIVE assumptions can be invalidated/,
  );
  assert.throws(
    () => applyTrigger(makeRegistry(), {
      trigger: 'invalidated_assumption', at: TODAY, assumptionId: 'ASM-GHOST', reason: 'r',
    }),
    /not registered/,
  );
});

// ---------------------------------------------------------------------------
// reopen log —— 不可变追加账目
// ---------------------------------------------------------------------------

test('reopen log: append-only; seq overlap is rejected', () => {
  const registry = makeRegistry([], [{ affectedDecisions: ['D1'] }]);
  const first = applyTrigger(registry, {
    trigger: 'invalidated_assumption', at: TODAY, assumptionId: 'ASM-1', reason: 'r',
  });
  const log = appendReopenLog([], first.events);
  assert.equal(log.length, first.events.length);

  const second = applyTrigger(registry, {
    trigger: 'regression', at: TODAY, subjectIds: ['D2'], causeRef: 'audit', reason: 'r',
  }, 0); // 故意用重叠 seq
  assert.throws(() => appendReopenLog(log, second.events), /append-only violated/);

  const legal = applyTrigger(registry, {
    trigger: 'regression', at: TODAY, subjectIds: ['D2'], causeRef: 'audit', reason: 'r',
  }, log.length);
  const grown = appendReopenLog(log, legal.events);
  assert.equal(grown.length, log.length + legal.events.length);
});

// ---------------------------------------------------------------------------
// determinism —— 同输入同输出（可回放账目）
// ---------------------------------------------------------------------------

test('determinism: identical inputs produce byte-identical serialized outcomes', () => {
  const registry = makeRegistry(
    [{ blocking: ['D1'] }],
    [{ id: 'ASM-A', affectedDecisions: ['D1'] }, { id: 'ASM-B', affectedDecisions: ['D2'] }],
  );
  const run = (): string =>
    JSON.stringify(
      applyTrigger(registry, {
        trigger: 'new_evidence', at: TODAY, unknownId: 'UNK-1', resolutionEvidence: ['e1', 'e2'],
      }).events,
    );
  assert.equal(run(), run());
});
