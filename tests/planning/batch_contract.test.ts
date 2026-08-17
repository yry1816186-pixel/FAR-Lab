// tests/planning/batch_contract.test.ts
// CORE-BATCH-001：batch contract 十二字段合同 + closure-evidence-match 引擎。
// 真实依赖：validateBatchContract / matchClosureToContract / writeSetAllows（纯函数，无 mock）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  BATCH_OUTCOME_KINDS,
  BatchClosureSchema,
  BatchContractSchema,
  matchClosureToContract,
  validateBatchContract,
  writeSetAllows,
} from '../../src/planning/batch_contract.ts';
import type { BatchClosure, BatchContract } from '../../src/planning/batch_contract.ts';

function okContract(overrides: Partial<BatchContract> = {}): BatchContract {
  return BatchContractSchema.parse({
    batchId: 'batch-12',
    objective: '每个 batch 成为有界实验单元（CORE-BATCH-001）',
    valueHypothesis: '把宪法 §4.2 十二字段从口头协议变成机检门禁，消除无合同批',
    scope: ['src/planning/batch_contract.ts', 'tests/planning/'],
    nonScope: ['frontend/', 'src/falsifiability/'],
    requirementIds: ['CORE-BATCH-001'],
    verifiedFacts: ['planning 域已有 79 测试（2026-08-17 实跑）'],
    unknowns: ['宪法 12 字段与既有 Checkpoint 价值三元组的边界是否重叠'],
    dependencies: ['PR #64 valueHypothesis 必填已落地'],
    allowedWriteSet: ['src/planning/**', 'tests/planning/**'],
    acceptanceCommands: [
      { id: 'AC-typecheck', command: 'pnpm run typecheck', expected: 'exit 0' },
      { id: 'AC-test', command: 'node --test tests/planning/batch_contract.test.ts', expected: 'all pass' },
    ],
    risk: 'P2',
    rollback: 'git revert 单提交回滚（纯新增模块，零既有文件语义变更）',
    expectedInformationGain: '证明「batch 合同完整性 + 收尾对账」可以确定性机检，不依赖口头声明',
    stopConditions: ['与既有 Checkpoint schema 冲突无法调和', '测试全红且原因不在本模块'],
    ...overrides,
  });
}

function okClosure(overrides: Partial<BatchClosure> = {}): BatchClosure {
  return BatchClosureSchema.parse({
    outcomes: [
      { kind: 'CAPABILITY_INCREMENT', evidence: 'PR #69 合并（main SHA 见 checkpoint）' },
      { kind: 'UNKNOWN_REDUCTION', evidence: '重叠边界问题由 CheckpointSchema 单字段职责划分收窄' },
    ],
    acceptanceResults: {
      'AC-typecheck': { status: 'pass', actual: '0 errors' },
      'AC-test': { status: 'pass', actual: '20 pass / 0 fail' },
    },
    filesWritten: ['src/planning/batch_contract.ts', 'tests/planning/batch_contract.test.ts'],
    unachieved: [],
    unknownsResolved: ['宪法 12 字段与既有 Checkpoint 价值三元组的边界是否重叠'],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 合同完整性（宪法 12 字段缺一不可 = schema fail-closed）
// ---------------------------------------------------------------------------

test('CORE-BATCH-001: 十二字段合同合法输入通过语义门', () => {
  const result = validateBatchContract(okContract());
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test('CORE-BATCH-001 fail-closed: 12 字段任一缺失被 zod 拒（以 4 个代表字段抽验全量）', () => {
  for (const field of ['objective', 'valueHypothesis', 'allowedWriteSet', 'acceptanceCommands', 'rollback', 'stopConditions', 'requirementIds', 'scope'] as const) {
    const base = okContract() as Record<string, unknown>;
    delete base[field];
    const parsed = BatchContractSchema.safeParse(base);
    assert.equal(parsed.success, false, `missing '${field}' must fail schema`);
  }
});

test('CORE-BATCH-001 fail-closed: 空数组字段（scope/requirementIds/writeSet/acceptance/stopConditions）被拒', () => {
  for (const field of ['scope', 'requirementIds', 'allowedWriteSet', 'acceptanceCommands', 'stopConditions'] as const) {
    const parsed = BatchContractSchema.safeParse({ ...okContract(), [field]: [] });
    assert.equal(parsed.success, false, `empty '${field}' must fail schema`);
  }
});

// ---------------------------------------------------------------------------
// 语义门：可枚举违规码
// ---------------------------------------------------------------------------

test('CORE-BATCH-001: rollback=none 被拒（可回滚性是硬约束，§13 rollback:none 拒收）', () => {
  for (const bad of ['none', 'NONE', ' n/a ', '无', '不可逆', 'irreversible']) {
    const result = validateBatchContract(okContract({ rollback: bad }));
    assert.equal(result.ok, false, `rollback '${bad}' must be rejected`);
    assert.ok(result.violations.some((v) => v.code === 'ROLLBACK_NONE'), `rollback '${bad}' → ROLLBACK_NONE`);
  }
});

test('CORE-BATCH-001: 畸形需求 ID 被拒（形状 = UPPER tokens + 三位序号）', () => {
  for (const bad of ['core-batch-001', 'CORE-BATCH', 'CORE-BATCH-1', 'CORE_BATCH_001', 'batch 001']) {
    const result = validateBatchContract(okContract({ requirementIds: [bad] }));
    assert.ok(
      result.violations.some((v) => v.code === 'REQUIREMENT_ID_MALFORMED'),
      `requirement id '${bad}' → REQUIREMENT_ID_MALFORMED`,
    );
  }
  // 真实仓库 ID 形状必须全通过
  for (const good of ['CORE-BATCH-001', 'GOV-UNKNOWN-001', 'UX-VIZ-001', 'ENG-TEST-001', 'EVID-RECORD-001']) {
    const result = validateBatchContract(okContract({ requirementIds: [good] }));
    assert.ok(!result.violations.some((v) => v.code === 'REQUIREMENT_ID_MALFORMED'), `requirement id '${good}' must pass`);
  }
});

test('CORE-BATCH-001: 验收命令 ID 重复被拒（closure 按 id 对账，重复 = 歧义）', () => {
  const contract = okContract();
  const [first] = contract.acceptanceCommands;
  assert.notEqual(first, undefined);
  if (first === undefined) return;
  const result = validateBatchContract({
    ...contract,
    acceptanceCommands: [...contract.acceptanceCommands, first],
  });
  assert.ok(result.violations.some((v) => v.code === 'DUPLICATE_ACCEPTANCE_ID'));
});

test('CORE-BATCH-001: 写集绝对路径/上跳/盘符被拒（写集必须可约束）', () => {
  for (const bad of ['/etc/passwd', 'C:/Users/x', 'src/../../etc', 'src\\planning']) {
    const result = validateBatchContract(okContract({ allowedWriteSet: [bad] }));
    assert.ok(
      result.violations.some((v) => v.code === 'WRITE_SET_ESCAPE'),
      `write set entry '${bad}' → WRITE_SET_ESCAPE`,
    );
  }
});

test('CORE-BATCH-001: scope 与 nonScope 同条目 = 自相矛盾合同被拒', () => {
  const result = validateBatchContract(okContract({ nonScope: ['src/planning/batch_contract.ts'] }));
  assert.ok(result.violations.some((v) => v.code === 'SCOPE_SELF_CONTRADICTION'));
});

// ---------------------------------------------------------------------------
// writeSetAllows 匹配语义
// ---------------------------------------------------------------------------

test('writeSetAllows: 精确 / 目录前缀 / dir/** 通配 / 越界', () => {
  const allowed = ['src/planning/batch_contract.ts', 'tests/planning/', 'docs/**'];
  assert.equal(writeSetAllows('src/planning/batch_contract.ts', allowed), true);
  assert.equal(writeSetAllows('tests/planning/batch_contract.test.ts', allowed), true);
  assert.equal(writeSetAllows('docs/development/PROGRESS.md', allowed), true);
  assert.equal(writeSetAllows('src/falsifiability/kernel.ts', allowed), false);
  assert.equal(writeSetAllows('tests/frontend/app.test.ts', allowed), false);
  assert.equal(writeSetAllows('srcx/planning/evil.ts', allowed), false); // 前缀伪造不成立
});

// ---------------------------------------------------------------------------
// closure-evidence-match
// ---------------------------------------------------------------------------

test('closure-evidence-match: 合同与收尾一致 → ok + 摘要正确', () => {
  const match = matchClosureToContract(okContract(), okClosure());
  assert.equal(match.ok, true);
  assert.equal(match.summary.acceptanceTotal, 2);
  assert.equal(match.summary.acceptancePassed, 2);
  assert.equal(match.summary.outcomesByKind['CAPABILITY_INCREMENT'], 1);
  assert.equal(match.summary.unknownsResolved, 1);
});

test('closure-evidence-match fail-closed: 验收命令缺结果 / fail / not_run 三态各自违规', () => {
  const missing = okClosure();
  delete (missing.acceptanceResults as Record<string, unknown>)['AC-test'];
  const r1 = matchClosureToContract(okContract(), missing);
  assert.ok(r1.violations.some((v) => v.code === 'ACCEPTANCE_RESULT_MISSING'));

  const r2 = matchClosureToContract(okContract(), okClosure({
    acceptanceResults: {
      'AC-typecheck': { status: 'pass', actual: 'ok' },
      'AC-test': { status: 'fail', actual: '1 failing' },
    },
  }));
  assert.ok(r2.violations.some((v) => v.code === 'ACCEPTANCE_FAILED'));

  const r3 = matchClosureToContract(okContract(), okClosure({
    acceptanceResults: {
      'AC-typecheck': { status: 'pass', actual: 'ok' },
      'AC-test': { status: 'not_run', actual: 'CI 中断未跑' },
    },
  }));
  assert.ok(r3.violations.some((v) => v.code === 'ACCEPTANCE_NOT_RUN'), 'not_run 绝不默认通过');
  assert.equal(r3.ok, false);
});

test('closure-evidence-match: 写入越界被拒（写集纪律可机检）', () => {
  const match = matchClosureToContract(okContract(), okClosure({
    filesWritten: ['src/planning/batch_contract.ts', 'src/fec/orchestrator.ts'],
  }));
  assert.ok(match.violations.some((v) => v.code === 'WRITE_OUT_OF_CONTRACT'));
  assert.equal(match.ok, false);
});

test('closure-evidence-match: 声称解决未登记的未知被拒（先登记后解决）', () => {
  const match = matchClosureToContract(okContract(), okClosure({
    unknownsResolved: ['从未在合同中登记的未知'],
  }));
  assert.ok(match.violations.some((v) => v.code === 'UNKNOWN_RESOLUTION_UNDECLARED'));
});

test('closure schema fail-closed: 零产出收尾被拒（宪法四类产出至少其一）', () => {
  const parsed = BatchClosureSchema.safeParse({ ...okClosure(), outcomes: [] });
  assert.equal(parsed.success, false, 'closure with zero outcomes must fail');
});

test('closure schema: 宪法四类产出枚举 = 能力增量/未知消减/否定结论/缺陷修复', () => {
  assert.deepEqual([...BATCH_OUTCOME_KINDS], [
    'CAPABILITY_INCREMENT',
    'UNKNOWN_REDUCTION',
    'NEGATIVE_CONCLUSION',
    'DEFECT_FIX',
  ]);
  const negative = BatchClosureSchema.safeParse({
    ...okClosure(),
    outcomes: [{ kind: 'NEGATIVE_CONCLUSION', evidence: 'X 路线不可行（证据：bench 对比 PR #70）' }],
  });
  assert.equal(negative.success, true, '有证据的否定结论是合法 batch 产出');
});
