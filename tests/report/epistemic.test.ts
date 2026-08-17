// tests/report/epistemic.test.ts
// CORE-EPISTEMIC-001：认知类型标注层——九值标签 SSOT、判断校验 fail-closed、
// UNKNOWN 传播对拍（不得无证据消失）、裁决→标签中央映射。
// 真实依赖：validateEpistemicStatements / unknownPersistenceReport / projectVerdictsToStatements
// （纯函数，无 mock）。EPISTEMIC_TAGS 与宪法九值字母表逐字对齐。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  EPISTEMIC_TAGS,
} from '../../src/schema/enums.ts';
import {
  EpistemicStatementSchema,
  projectVerdictsToStatements,
  unknownPersistenceReport,
  validateEpistemicStatements,
  verdictToEpistemicTag,
} from '../../src/report/epistemic.ts';
import type {
  EpistemicStatement,
  RegisteredUnknownProjection,
  VerdictProjection,
} from '../../src/report/epistemic.ts';

function st(overrides: Partial<EpistemicStatement> = {}): EpistemicStatement {
  return EpistemicStatementSchema.parse({
    id: 's1',
    text: '某判断',
    tag: 'FACT',
    confidence: null,
    evidenceRefs: ['run-123:report'],
    unknownId: null,
    assumptionId: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 九值字母表 = 宪法原文逐字
// ---------------------------------------------------------------------------

test('CORE-EPISTEMIC-001: EPISTEMIC_TAGS 九值与宪法 §科学输出 逐字对齐', () => {
  assert.deepEqual([...EPISTEMIC_TAGS], [
    'FACT',
    'OBSERVATION',
    'EVIDENCE',
    'ASSUMPTION',
    'HYPOTHESIS',
    'INFERENCE',
    'UNKNOWN',
    'RISK',
    'DECISION',
  ]);
});

test('CORE-EPISTEMIC-001: 九标签全部是合法输入（枚举完备可标注）', () => {
  for (const tag of EPISTEMIC_TAGS) {
    // 需要登记回指的标签给足回指后应合法；不带回指则触发对应违规（负例由专测覆盖）
    const needsUnknown = tag === 'UNKNOWN';
    const needsAssumption = tag === 'ASSUMPTION';
    const r = validateEpistemicStatements([
      st({
        id: `s-${tag}`,
        tag,
        unknownId: needsUnknown ? 'UNK-T-001' : null,
        assumptionId: needsAssumption ? 'ASM-T-001' : null,
      }),
    ]);
    assert.equal(r.ok, true, `tag '${tag}' must be accepted when fully anchored: ${JSON.stringify(r.violations)}`);
  }
});

// ---------------------------------------------------------------------------
// 判断校验 fail-closed
// ---------------------------------------------------------------------------

test('CORE-EPISTEMIC-001 fail-closed: FACT/EVIDENCE 无证据引用被拒', () => {
  const r1 = validateEpistemicStatements([st({ tag: 'FACT', evidenceRefs: [] })]);
  assert.ok(r1.violations.some((v) => v.code === 'FACT_WITHOUT_EVIDENCE'));

  const r2 = validateEpistemicStatements([st({ tag: 'EVIDENCE', evidenceRefs: [] })]);
  assert.ok(r2.violations.some((v) => v.code === 'EVIDENCE_WITHOUT_REFS'));
});

test('CORE-EPISTEMIC-001 fail-closed: 置信度无证据锚被拒（宪法：置信度必须与证据匹配）', () => {
  const r = validateEpistemicStatements([st({ tag: 'INFERENCE', confidence: 0.9, evidenceRefs: [] })]);
  assert.ok(r.violations.some((v) => v.code === 'CONFIDENCE_WITHOUT_EVIDENCE'));
  assert.equal(r.ok, false);

  // 带证据锚的置信判断合法
  const ok = validateEpistemicStatements([st({ tag: 'INFERENCE', confidence: 0.9, evidenceRefs: ['a'] })]);
  assert.equal(ok.ok, true);
});

test('CORE-EPISTEMIC-001 fail-closed: UNKNOWN/ASSUMPTION 无登记回指被拒', () => {
  const r1 = validateEpistemicStatements([st({ tag: 'UNKNOWN', evidenceRefs: [], unknownId: null })]);
  assert.ok(r1.violations.some((v) => v.code === 'UNKNOWN_WITHOUT_REGISTRY_ID'));

  const r2 = validateEpistemicStatements([st({ tag: 'ASSUMPTION', assumptionId: null })]);
  assert.ok(r2.violations.some((v) => v.code === 'ASSUMPTION_WITHOUT_REGISTRY_ID'));

  // 回指后即合法
  const ok = validateEpistemicStatements([
    st({ id: 'u1', tag: 'UNKNOWN', evidenceRefs: [], unknownId: 'UNK-R-001' }),
    st({ id: 'a1', tag: 'ASSUMPTION', assumptionId: 'ASM-MUT-001' }),
  ]);
  assert.equal(ok.ok, true, JSON.stringify(ok.violations));
});

test('CORE-EPISTEMIC-001 fail-closed: 重复判断 ID / 非法标签被拒', () => {
  const dup = validateEpistemicStatements([st({ id: 'x' }), st({ id: 'x' })]);
  assert.ok(dup.violations.some((v) => v.code === 'DUPLICATE_STATEMENT_ID'));

  const badTag = EpistemicStatementSchema.safeParse({ ...st(), tag: 'VIBE' });
  assert.equal(badTag.success, false, 'illegal tag must fail schema');
});

// ---------------------------------------------------------------------------
// UNKNOWN 传播对拍
// ---------------------------------------------------------------------------

function uk(id: string, status: RegisteredUnknownProjection['status'] = 'OPEN', resolutionEvidence: readonly string[] = []): RegisteredUnknownProjection {
  return { id, status, resolutionEvidence };
}

test('CORE-EPISTEMIC-001: 未解决未知从判断集消失 → SILENTLY_DROPPED（不得无证据消失）', () => {
  const unknowns = [uk('UNK-1'), uk('UNK-2')];
  const statements = [st({ id: 'a', tag: 'UNKNOWN', evidenceRefs: [], unknownId: 'UNK-1' })];
  const report = unknownPersistenceReport(unknowns, statements);
  assert.equal(report.ok, false);
  assert.equal(report.checked, 2);
  assert.equal(report.present, 1);
  assert.ok(report.violations.some((v) => v.code === 'UNKNOWN_SILENTLY_DROPPED' && v.unknownId === 'UNK-2'));
});

test('CORE-EPISTEMIC-001: 全部在场 → ok；ABANDONED 豁免；RESOLVED 无证据被拒', () => {
  const okCase = unknownPersistenceReport(
    [uk('UNK-1'), uk('UNK-2', 'ABANDONED'), uk('UNK-3', 'RESOLVED', ['resolution receipt'])],
    [st({ id: 'a', tag: 'UNKNOWN', evidenceRefs: [], unknownId: 'UNK-1' })],
  );
  assert.equal(okCase.ok, true, `violations: ${JSON.stringify(okCase.violations)}`);

  const badResolved = unknownPersistenceReport(
    [uk('UNK-3', 'RESOLVED', [])],
    [],
  );
  assert.ok(badResolved.violations.some((v) => v.code === 'UNKNOWN_RESOLVED_WITHOUT_EVIDENCE'));
});

// ---------------------------------------------------------------------------
// 裁决 → 标签中央映射 + 投影自洽
// ---------------------------------------------------------------------------

test('CORE-EPISTEMIC-001: 裁决→认知标签中央映射全覆盖（五裁决 × 证据有无）', () => {
  const cases: readonly [VerdictProjection, string][] = [
    [{ claimId: 'c1', verdict: 'CONFIRMED', evidenceCount: 3 }, 'EVIDENCE'],
    [{ claimId: 'c2', verdict: 'CONFIRMED', evidenceCount: 0 }, 'UNKNOWN'], // 防御性（内核 R7 已挡）
    [{ claimId: 'c3', verdict: 'REFUTED', evidenceCount: 2 }, 'EVIDENCE'],
    [{ claimId: 'c4', verdict: 'INCONCLUSIVE', evidenceCount: 5 }, 'UNKNOWN'],
    [{ claimId: 'c5', verdict: 'UNTESTED', evidenceCount: 0 }, 'UNKNOWN'],
    [{ claimId: 'c6', verdict: 'DEGRADED_SCOPE', evidenceCount: 2 }, 'INFERENCE'],
    [{ claimId: 'c7', verdict: 'DEGRADED_SCOPE', evidenceCount: 0 }, 'UNKNOWN'],
  ];
  for (const [v, expected] of cases) {
    assert.equal(verdictToEpistemicTag(v), expected, `${v.verdict}(e=${v.evidenceCount}) → ${expected}`);
  }
});

test('CORE-EPISTEMIC-001: 投影产物自通过校验（report 抽验机器侧闭环）', () => {
  const statements = projectVerdictsToStatements([
    { claimId: 'c1', verdict: 'CONFIRMED', evidenceCount: 3 },
    { claimId: 'c2', verdict: 'REFUTED', evidenceCount: 1 },
    { claimId: 'c3', verdict: 'INCONCLUSIVE', evidenceCount: 0 },
    { claimId: 'c4', verdict: 'DEGRADED_SCOPE', evidenceCount: 2 },
  ]);
  assert.equal(statements.length, 4);
  const validation = validateEpistemicStatements(statements);
  assert.equal(validation.ok, true, `violations: ${JSON.stringify(validation.violations)}`);
  // INCONCLUSIVE 投影带 unknownId（kernel-verdict 前缀，区别于登记未知）
  const unknownStmt = statements.find((s) => s.tag === 'UNKNOWN');
  assert.notEqual(unknownStmt, undefined);
  assert.match((unknownStmt as EpistemicStatement).unknownId ?? '', /^verdict-unknown-/);
});
