import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideVerdict } from '../../src/falsifiability/verdict.ts';
import {
  A4_SCOPE_SLIP_TEXT,
  E2_UNTESTED_REASON,
  PLANB_RISK_KINDS,
  applyPlanBGate,
  planbRiskGate,
} from '../../src/falsifiability/planb_gate.ts';
import type {
  PlanBRiskAssessment,
  PlanBRiskKind,
} from '../../src/falsifiability/planb_gate.ts';
import type { EvidenceRecord, SourceAnchor } from '../../src/falsifiability/types.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCE_ANCHOR: SourceAnchor = {
  gitCommitSha: 'b'.repeat(40),
  dashscopeRequestId: null,
  isoTimestamp: '2026-06-27T00:00:00.000Z',
  rawResponseHash: 'c'.repeat(64),
};

function evidence(overrides: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    claim: 'measured accuracy evidence',
    supportsClaim: true,
    refutesClaim: false,
    scopeNarrowerThanClaim: false,
    sourceAnchor: SOURCE_ANCHOR,
    ...overrides,
  };
}

/** 正常评估：所有条件均满足 */
const ALL_CLEAR: PlanBRiskAssessment = {
  gtConstructible: true,
  methodWithinGuardrail: true,
  hasNovelty: true,
};

// ---------------------------------------------------------------------------
// planbRiskGate — 单风险触发
// ---------------------------------------------------------------------------

test('A4 GT不可构造 → DEGRADED_SCOPE + scopeSlipText', () => {
  const result = planbRiskGate({
    gtConstructible: false,
    methodWithinGuardrail: true,
    hasNovelty: true,
  });

  assert.equal(result.triggered, true);
  assert.deepEqual(result.risks, ['A4_GT_NOT_CONSTRUCTIBLE']);
  assert.notEqual(result.degradationVerdict, null);

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'DEGRADED_SCOPE');
  assert.notEqual(dv.scopeSlipText, null);
  assert.match(dv.scopeSlipText!, /PlanB A4/);
  assert.match(dv.scopeSlipText!, /GT不可构造/);
  assert.match(dv.scopeSlipText!, /E&W 2016/);
  assert.match(dv.scopeSlipText!, /WASP-12b.*Kepler-1658b/);
  assert.equal(dv.untestedReason, null);
  assert.equal(dv.conflictingEvidenceCount, 0);
});

test('A16 方法越护栏 → INCONCLUSIVE', () => {
  const result = planbRiskGate({
    gtConstructible: true,
    methodWithinGuardrail: false,
    hasNovelty: true,
  });

  assert.equal(result.triggered, true);
  assert.deepEqual(result.risks, ['A16_METHOD_OUT_OF_GUARDRAIL']);
  assert.notEqual(result.degradationVerdict, null);

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'INCONCLUSIVE');
  assert.equal(dv.scopeSlipText, null);
  assert.equal(dv.untestedReason, null);
  assert.ok(dv.conflictingEvidenceCount > 0, 'INCONCLUSIVE requires conflictingEvidenceCount > 0');
});

test('E2 novelty theater → UNTESTED + untestedReason', () => {
  const result = planbRiskGate({
    gtConstructible: true,
    methodWithinGuardrail: true,
    hasNovelty: false,
  });

  assert.equal(result.triggered, true);
  assert.deepEqual(result.risks, ['E2_NOVELTY_THEATER']);
  assert.notEqual(result.degradationVerdict, null);

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'UNTESTED');
  assert.equal(dv.scopeSlipText, null);
  assert.notEqual(dv.untestedReason, null);
  assert.match(dv.untestedReason!, /PlanB E2/);
  assert.match(dv.untestedReason!, /novelty=0/);
  assert.match(dv.untestedReason!, /IPCC.*GCP.*FLUXNET/);
  assert.match(dv.untestedReason!, /tree-based ML upscaling/);
  assert.equal(dv.conflictingEvidenceCount, 0);
});

// ---------------------------------------------------------------------------
// planbRiskGate — 多风险并行
// ---------------------------------------------------------------------------

test('A4 + A16 同时触发 → A4 DEGRADED_SCOPE 优先', () => {
  const result = planbRiskGate({
    gtConstructible: false,
    methodWithinGuardrail: false,
    hasNovelty: true,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.risks.length, 2);
  assert.ok(result.risks.includes('A4_GT_NOT_CONSTRUCTIBLE'));
  assert.ok(result.risks.includes('A16_METHOD_OUT_OF_GUARDRAIL'));

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'DEGRADED_SCOPE');
  assert.notEqual(dv.scopeSlipText, null);
  assert.equal(dv.crossRiskFlags.length, 0);
});

test('A4 + E2 同时触发 → A4 DEGRADED_SCOPE 优先 + 跨风险联动', () => {
  const result = planbRiskGate({
    gtConstructible: false,
    methodWithinGuardrail: true,
    hasNovelty: false,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.risks.length, 2);
  assert.ok(result.risks.includes('A4_GT_NOT_CONSTRUCTIBLE'));
  assert.ok(result.risks.includes('E2_NOVELTY_THEATER'));

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'DEGRADED_SCOPE');
  assert.notEqual(dv.scopeSlipText, null);
  // 跨风险联动：A4+E2 → A16 必须走 VI
  assert.ok(
    dv.crossRiskFlags.includes('A4_E2_CROSS_RISK_A16_MUST_GO_VI'),
    `expected A4_E2_CROSS_RISK_A16_MUST_GO_VI, got: ${JSON.stringify(dv.crossRiskFlags)}`,
  );
});

test('A16 + E2 同时触发 → E2 UNTESTED 优先', () => {
  const result = planbRiskGate({
    gtConstructible: true,
    methodWithinGuardrail: false,
    hasNovelty: false,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.risks.length, 2);
  assert.ok(result.risks.includes('A16_METHOD_OUT_OF_GUARDRAIL'));
  assert.ok(result.risks.includes('E2_NOVELTY_THEATER'));

  const dv = result.degradationVerdict!;
  // E2 UNTESTED 优先于 A16 INCONCLUSIVE（UNTESTED 更强声明）
  assert.equal(dv.verdict, 'UNTESTED');
  assert.notEqual(dv.untestedReason, null);
  assert.equal(dv.crossRiskFlags.length, 0);
});

test('三风险全触发 → A4 DEGRADED_SCOPE 优先 + 跨风险联动', () => {
  const result = planbRiskGate({
    gtConstructible: false,
    methodWithinGuardrail: false,
    hasNovelty: false,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.risks.length, 3);
  assert.deepEqual(
    result.risks,
    ['A4_GT_NOT_CONSTRUCTIBLE', 'A16_METHOD_OUT_OF_GUARDRAIL', 'E2_NOVELTY_THEATER'],
  );

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'DEGRADED_SCOPE');
  assert.ok(
    dv.crossRiskFlags.includes('A4_E2_CROSS_RISK_A16_MUST_GO_VI'),
    '三风险全触发时应有跨风险联动标记',
  );
});

// ---------------------------------------------------------------------------
// planbRiskGate — 无风险触发
// ---------------------------------------------------------------------------

test('所有条件通过 → 不触发 PlanB', () => {
  const result = planbRiskGate(ALL_CLEAR);

  assert.equal(result.triggered, false);
  assert.deepEqual(result.risks, []);
  assert.equal(result.degradationVerdict, null);
});

// ---------------------------------------------------------------------------
// applyPlanBGate — 集成 deciderVerdict
// ---------------------------------------------------------------------------

test('applyPlanBGate 无风险时委托给 decideVerdict', () => {
  const decision = applyPlanBGate(ALL_CLEAR, () =>
    decideVerdict({
      claim: 'test claim',
      evidences: [evidence({ supportsClaim: true, refutesClaim: false })],
    }),
  );

  assert.equal(decision.planbTriggered, false);
  assert.deepEqual(decision.planbRisks, []);
  assert.deepEqual(decision.planbCrossRiskFlags, []);
  assert.equal(decision.verdict, 'CONFIRMED');
});

test('applyPlanBGate 风险触发时直接降级，不走 decideVerdict', () => {
  let decideVerdictCalled = false;

  const decision = applyPlanBGate(
    { gtConstructible: false, methodWithinGuardrail: true, hasNovelty: true },
    () => {
      decideVerdictCalled = true;
      return decideVerdict({
        claim: 'should not be reached',
        evidences: [evidence({ supportsClaim: true, refutesClaim: false })],
      });
    },
  );

  // decideVerdict 不应被调用——PlanB 降级应短路
  assert.equal(decideVerdictCalled, false);

  assert.equal(decision.planbTriggered, true);
  assert.deepEqual(decision.planbRisks, ['A4_GT_NOT_CONSTRUCTIBLE']);
  assert.equal(decision.verdict, 'DEGRADED_SCOPE');
  assert.notEqual(decision.scopeSlipText, null);
});

test('applyPlanBGate A16 触发 → 短路返回 INCONCLUSIVE', () => {
  let decideVerdictCalled = false;

  const decision = applyPlanBGate(
    { gtConstructible: true, methodWithinGuardrail: false, hasNovelty: true },
    () => {
      decideVerdictCalled = true;
      return decideVerdict({ claim: 'x', evidences: [] });
    },
  );

  assert.equal(decideVerdictCalled, false);
  assert.equal(decision.planbTriggered, true);
  assert.equal(decision.verdict, 'INCONCLUSIVE');
  assert.ok(decision.conflictingEvidenceCount > 0);
});

test('applyPlanBGate E2 触发 → 短路返回 UNTESTED', () => {
  let decideVerdictCalled = false;

  const decision = applyPlanBGate(
    { gtConstructible: true, methodWithinGuardrail: true, hasNovelty: false },
    () => {
      decideVerdictCalled = true;
      return decideVerdict({ claim: 'x', evidences: [] });
    },
  );

  assert.equal(decideVerdictCalled, false);
  assert.equal(decision.planbTriggered, true);
  assert.equal(decision.verdict, 'UNTESTED');
  assert.notEqual(decision.untestedReason, null);
  assert.match(decision.untestedReason!, /novelty=0/);
});

// ---------------------------------------------------------------------------
// HonestyWall 标注验证
// ---------------------------------------------------------------------------

test('DEGRADED_SCOPE 降级必须带非空 scopeSlipText (HonestyWall 标注)', () => {
  const result = planbRiskGate({
    gtConstructible: false,
    methodWithinGuardrail: true,
    hasNovelty: true,
  });

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'DEGRADED_SCOPE');
  assert.ok(
    dv.scopeSlipText !== null && dv.scopeSlipText.trim().length > 0,
    'DEGRADED_SCOPE requires non-empty scopeSlipText for HonestyWall',
  );
});

test('UNTESTED 降级必须带非空 untestedReason (HonestyWall 标注)', () => {
  const result = planbRiskGate({
    gtConstructible: true,
    methodWithinGuardrail: true,
    hasNovelty: false,
  });

  const dv = result.degradationVerdict!;
  assert.equal(dv.verdict, 'UNTESTED');
  assert.ok(
    dv.untestedReason !== null && dv.untestedReason.trim().length > 0,
    'UNTESTED requires non-empty untestedReason for HonestyWall',
  );
});

test('降级文本常量与 HonestyWall 展示对齐', () => {
  // scopeSlipText 必须包含足够信息供 HonestyWall 公开说明
  assert.match(A4_SCOPE_SLIP_TEXT, /E&W 2016/);
  assert.match(A4_SCOPE_SLIP_TEXT, /WASP-12b/);
  assert.match(A4_SCOPE_SLIP_TEXT, /Kepler-1658b/);
  assert.match(A4_SCOPE_SLIP_TEXT, /2颗/);

  // untestedReason 必须包含 novelty=0 声明
  assert.match(E2_UNTESTED_REASON, /novelty\s*=\s*0/);
  assert.match(E2_UNTESTED_REASON, /IPCC/);
  assert.match(E2_UNTESTED_REASON, /tree-based ML upscaling/);
  assert.match(E2_UNTESTED_REASON, /不声称发现/);
});

// ---------------------------------------------------------------------------
// 枚举守卫
// ---------------------------------------------------------------------------

test('PLANB_RISK_KINDS 包含全部三种风险', () => {
  assert.equal(PLANB_RISK_KINDS.length, 3);
  assert.ok((PLANB_RISK_KINDS as readonly string[]).includes('A4_GT_NOT_CONSTRUCTIBLE'));
  assert.ok((PLANB_RISK_KINDS as readonly string[]).includes('A16_METHOD_OUT_OF_GUARDRAIL'));
  assert.ok((PLANB_RISK_KINDS as readonly string[]).includes('E2_NOVELTY_THEATER'));
});

test('planbRiskGate 跨全部 8 种 boolean 组合只产生 PLANB_RISK_KINDS 内 kind（穷尽映射守卫）', () => {
  // 真实不变量：gate 从 boolean 推导 kind，跨 2^3=8 种组合必须满足
  //   (1) 每个 risk 必在 PLANB_RISK_KINDS 权威枚举内；
  //   (2) risk 数 === false boolean 数（映射 1:1，无遗漏无重复）；
  //   (3) 每个 false boolean 精确映射到对应 kind。
  // 替换原「类型守卫阻非法值」用例：原用例是常量自比较（validKinds 字面量数组 vs 自身长度），
  // 且 planbRiskGate 无非法 kind 输入路径——名义与语义错配。此处穷尽覆盖真实行为。
  const COMBOS: { assessment: PlanBRiskAssessment; expectedKinds: PlanBRiskKind[] }[] = [];
  for (const gt of [true, false]) {
    for (const method of [true, false]) {
      for (const novelty of [true, false]) {
        const expectedKinds: PlanBRiskKind[] = [];
        if (!gt) expectedKinds.push('A4_GT_NOT_CONSTRUCTIBLE');
        if (!method) expectedKinds.push('A16_METHOD_OUT_OF_GUARDRAIL');
        if (!novelty) expectedKinds.push('E2_NOVELTY_THEATER');
        COMBOS.push({
          assessment: {
            gtConstructible: gt,
            methodWithinGuardrail: method,
            hasNovelty: novelty,
          },
          expectedKinds,
        });
      }
    }
  }
  assert.equal(COMBOS.length, 8, '应覆盖全部 2^3=8 种组合');

  for (const { assessment, expectedKinds } of COMBOS) {
    const result = planbRiskGate(assessment);
    // (1) 每个 risk 在权威枚举内
    for (const risk of result.risks) {
      assert.ok(
        (PLANB_RISK_KINDS as readonly string[]).includes(risk),
        `combo ${JSON.stringify(assessment)} 产生非枚举内 kind: ${risk}`,
      );
    }
    // (2) 映射 1:1：risk 数 === false boolean 数
    assert.equal(
      result.risks.length,
      expectedKinds.length,
      `combo ${JSON.stringify(assessment)}: 期望 ${expectedKinds.length} 个 risk，实际 ${result.risks.length}`,
    );
    // (3) 每个 false boolean 精确映射到对应 kind（顺序无关·用 includes）
    for (const expected of expectedKinds) {
      assert.ok(
        (result.risks as readonly string[]).includes(expected),
        `combo ${JSON.stringify(assessment)}: 缺少期望 kind ${expected}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// applyPlanBGate — 正常路径不受影响（回归测试）
// ---------------------------------------------------------------------------

test('applyPlanBGate 正常路径保留 decideVerdict 全部字段', () => {
  const decision = applyPlanBGate(ALL_CLEAR, () =>
    decideVerdict({
      claim: 'regression claim',
      evidences: [],
    }),
  );

  // 无 evidence → 正常 UNTESTED
  assert.equal(decision.planbTriggered, false);
  assert.equal(decision.verdict, 'UNTESTED');
  assert.equal(decision.untestedReason, 'no evidence collected for this claim');

  // 有 scopeNarrower evidence → 正常 DEGRADED_SCOPE
  const degraded = applyPlanBGate(ALL_CLEAR, () =>
    decideVerdict({
      claim: 'claim',
      evidences: [
        evidence({
          claim: 'claim only for subset',
          supportsClaim: true,
          refutesClaim: false,
          scopeNarrowerThanClaim: true,
        }),
      ],
    }),
  );

  assert.equal(degraded.planbTriggered, false);
  assert.equal(degraded.verdict, 'DEGRADED_SCOPE');
  assert.notEqual(degraded.scopeSlipText, null);
});

test('applyPlanBGate 正常路径处理混合证据', () => {
  const decision = applyPlanBGate(ALL_CLEAR, () =>
    decideVerdict({
      claim: 'mixed claim',
      evidences: [
        evidence({ claim: 'pro', supportsClaim: true, refutesClaim: false }),
        evidence({ claim: 'con', supportsClaim: false, refutesClaim: true }),
      ],
    }),
  );

  assert.equal(decision.planbTriggered, false);
  assert.equal(decision.verdict, 'INCONCLUSIVE');
  assert.ok(decision.conflictingEvidenceCount > 0);
});
