/**
 * FEC V2 mandate gate 单测（03 §2.3 fail-closed 降级 + CI 阻断）。
 *
 * 覆盖：
 *   1. 编译通过 → allowed=true。
 *   2. HARD_FAIL_UNTESTED → allowed=false, verdict=UNTESTED, ciBlocked=false（F1 反 theater）。
 *   3. LLM_FROZEN（CI_BLOCK）→ allowed=false, ciBlocked=true（§2.3 禁静默吞 LLM-as-judge）。
 *   4. allowed=true 时 verdict=fallbackVerdict 占位。
 *   5. assertFecGate：ciBlocked 时 throw，否则不 throw。
 *
 * 权威：。零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFec, computeFecHash } from '../../src/fec/compiler.ts';
import { assertFecGate, enforceFecMandatoryGate } from '../../src/fec/fec_mandate.ts';
import { makeValidFec, baseStatPlan, baseMetric, baseScope } from './fixtures.ts';

test('enforceFecMandatoryGate: 编译通过 → allowed=true, ciBlocked=false', () => {
  const result = compileFec({ fec: makeValidFec() });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, true);
  assert.equal(decision.ciBlocked, false);
});

test('enforceFecMandatoryGate: HARD_FAIL_UNTESTED → allowed=false, verdict=UNTESTED（F1 反 theater）', () => {
  const result = compileFec({ fec: makeValidFec({ measurableImplication: '' }) });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, false);
  assert.equal(decision.verdict, 'UNTESTED');
  assert.equal(decision.ciBlocked, false);
  assert.ok(decision.reason.includes('FEC_NOT_COMPILABLE'), 'reason 须含 reasonCode');
});

test('enforceFecMandatoryGate: LLM_FROZEN → ciBlocked=true（03 §2.3 CI 阻断）', () => {
  // 测试专用：构造非法 frozenBy 绕过字面量类型（frozenBy 字段是 'deterministic_freezer' 字面量）。
  // 单层窄断言配注释：此处刻意制造 LLM_FROZEN 触发条件，非生产代码。
  const fec = makeValidFec();
  const tampered = {
    ...fec,
    freeze: { ...fec.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
  };
  const result = compileFec({ fec: tampered });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, false);
  assert.equal(decision.ciBlocked, true);
  assert.ok(decision.reason.includes('LLM_FROZEN'));
});

test('enforceFecMandatoryGate: 多个 HARD_FAIL 中含 LLM_FROZEN → ciBlocked=true（取最严）', () => {
  const fec = makeValidFec({ measurableImplication: '' }); // 叠加 #1 FEC_NOT_COMPILABLE
  const tampered = {
    ...fec,
    freeze: { ...fec.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
  };
  const result = compileFec({ fec: tampered });
  const decision = enforceFecMandatoryGate(result);
  // 任一 CI_BLOCK error → ciBlocked=true（§2.3：LLM_FROZEN 优先阻断）。
  assert.equal(decision.ciBlocked, true);
});

test('enforceFecMandatoryGate: allowed=true 时 verdict=fallbackVerdict 占位（交 kernel 覆盖）', () => {
  const result = compileFec({ fec: makeValidFec() });
  const decision = enforceFecMandatoryGate(result, 'INCONCLUSIVE');
  assert.equal(decision.allowed, true);
  assert.equal(decision.verdict, 'INCONCLUSIVE');
});

test('assertFecGate: ciBlocked 时 throw（CI 入口阻断）', () => {
  const fec = makeValidFec();
  const tampered = {
    ...fec,
    freeze: { ...fec.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
  };
  const decision = enforceFecMandatoryGate(compileFec({ fec: tampered }));
  assert.throws(() => assertFecGate(decision), /LLM_FROZEN/);
});

test('assertFecGate: 非 ciBlocked 不 throw', () => {
  const decision = enforceFecMandatoryGate(compileFec({ fec: makeValidFec() }));
  assert.doesNotThrow(() => assertFecGate(decision));
});

test('enforceFecMandatoryGate: HARD_FAIL_UNTESTED 不被 ciBlocked（仅 LLM_FROZEN 阻断）', () => {
  const result = compileFec({ fec: makeValidFec({ scope: { ...makeValidFec().scope, population: '' } }) });
  const decision = enforceFecMandatoryGate(result);
  assert.equal(decision.allowed, false);
  assert.equal(decision.ciBlocked, false); // SCOPE_UNBOUNDED 是 UNTESTED 非 CI_BLOCK
  assert.equal(decision.verdict, 'UNTESTED');
});

// ---- mutation_gate 补强（2026-08-17）：存活变异 4 位点的杀变异断言（存活即测试缺口）----

test('computeFecHash: freeze.gitCommitSha 显式提供时参与哈希（T-008 绑定语义）', () => {
  const withoutSha = makeValidFec();
  const withSha = makeValidFec({
    freeze: { ...withoutSha.freeze, gitCommitSha: 'a'.repeat(40) },
  });
  assert.notEqual(computeFecHash(withSha), computeFecHash(withoutSha), 'gitCommitSha 必须改变 fecHash');
  assert.equal(computeFecHash(withSha), computeFecHash(withSha), '同输入同哈希（确定性）');
});

test('#7 MULTIPLE_TESTING: familySize>1 且 correction=none → p_hacking_risk 旗标（WARN 不阻断）', () => {
  const fec = makeValidFec({
    multipleTestingPlan: { correction: 'bonferroni', familySize: 3, adjustedAlpha: 0.0167, preregistered: true },
    statisticalPlan: { ...makeValidFec().statisticalPlan, multipleTestingCorrection: 'none' },
  });
  const result = compileFec({ fec });
  assert.equal(result.ok, true, 'WARN 不得阻断编译');
  if (result.ok) {
    assert.ok(result.plan.integrityFlags.includes('p_hacking_risk'), 'none+family>1 须携带 p_hacking_risk');
  }
});

test('#7 MULTIPLE_TESTING: familySize>1 且已校正 → 无 p_hacking_risk 旗标', () => {
  const fec = makeValidFec({
    multipleTestingPlan: { correction: 'bonferroni', familySize: 3, adjustedAlpha: 0.0167, preregistered: true },
    statisticalPlan: { ...makeValidFec().statisticalPlan, multipleTestingCorrection: 'bonferroni' },
  });
  const result = compileFec({ fec });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(!result.plan.integrityFlags.includes('p_hacking_risk'), '已校正不得携带 p_hacking_risk');
  }
});

test('#10 HARKing: measurementCutoff 缺席（null）时跳过时间线检查（晚 timestamp 不报错）', () => {
  const fec = makeValidFec({ freeze: { ...makeValidFec().freeze, timestamp: '2099-01-01T00:00:00Z' } });
  const result = compileFec({ fec }); // 未注入 measurementCutoff
  assert.equal(result.ok, true, '无 measurement 可比对时 #10 须跳过，不得凭空 HARKING');
});

test('#10 HARKing: freeze.timestamp 晚于 measurementCutoff → HARKING_REVISION_AFTER_RESULT', () => {
  const fec = makeValidFec(); // freeze.timestamp = 2020-01-01
  const result = compileFec({ fec, measurementCutoff: '2019-06-01T00:00:00Z' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((e) => e.code === 'HARKING_REVISION_AFTER_RESULT'),
      '须含 HARKING_REVISION_AFTER_RESULT'
    );
  }
});

test('powerPlan: requirePowerPlan=true 且 powerPlan 缺失 → POWER_PLAN_REQUIRED（F-7-003）', () => {
  const result = compileFec({ fec: makeValidFec({ requirePowerPlan: true }) });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'));
  }
});

test('powerPlan: requirePowerPlan=true 且 powerPlan 完整 → 无 POWER_PLAN_REQUIRED', () => {
  const base = makeValidFec();
  const result = compileFec({
    fec: makeValidFec({
      requirePowerPlan: true,
      powerPlan: {
        targetPower: 0.8,
        minimumDetectableEffect: 0.2,
        sampleSize: 64,
        powerMethod: 'two-sample-t',
        alphaAssumed: base.statisticalPlan.alpha,
      },
    }),
  });
  if (!result.ok) {
    assert.ok(
      !result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'),
      '完整 powerPlan 不得触发 POWER_PLAN_REQUIRED'
    );
  }
});

// ── 2026-08-20 mutation 盲区补杀（边界校验位点：全位点跑出 31.7% 存活的偿还）──
// 根因：既有用例只测「明显非法」值，未测边界值本身（alpha=0/1、sampleSize=1、
// targetPower=0.5、timestamp==cutoff、familySize=1、空白 timeWindow）与
// 「单字段无效」形状（复合 or 条件的支兜底问题）。

test('mutation 边界: alpha 恰为 0 / 1 → 拒（0 < alpha < 1 开区间）', () => {
  for (const badAlpha of [0, 1]) {
    const fec = makeValidFec({ statisticalPlan: { ...baseStatPlan(), alpha: badAlpha } });
    const result = compileFec({ fec });
    assert.ok(
      result.errors.some((e) => e.code === 'STAT_PLAN_MISSING' && e.message.includes(`alpha=${badAlpha}`)),
      `alpha=${badAlpha} 须被拒（边界值本身非法）`,
    );
  }
});

test('mutation 边界: 合法编译的 integrityFlags 不得含 p_hacking_risk（familySize=1）', () => {
  // fixture correction='none' 且无 multipleTestingPlan → familySize=1 → 不加 flag。
  // gt_to_gte 变异（familySize>=1）会让 familySize=1 也打标 → 本断言杀之。
  const result = compileFec({ fec: makeValidFec() });
  assert.equal(result.ok, true, '基线 fixture 必须编译通过');
  if (result.ok) {
    assert.ok(
      !result.plan.integrityFlags.includes('p_hacking_risk'),
      'familySize=1 且 correction=none 不得打 p_hacking_risk',
    );
  }
});

test('mutation 边界: freeze.timestamp == measurementCutoff 不算 HARKing（严格大于）', () => {
  const fec = makeValidFec();
  const result = compileFec({ fec, measurementCutoff: fec.freeze.timestamp });
  if (result.ok) {
    assert.ok(true, '相等不阻断编译（> 严格）');
  } else {
    assert.ok(
      !result.errors.some((e) => e.code === 'HARKING_REVISION_AFTER_RESULT'),
      'timestamp 与 cutoff 相等不得触发 HARKing（> 严格；gt_to_gte 位点）',
    );
  }
  // 对照：晚于 cutoff → 触发
  const later = compileFec({ fec: makeValidFec(), measurementCutoff: '2000-01-01T00:00:00Z' });
  assert.ok(!later.ok && later.errors.some((e) => e.code === 'HARKING_REVISION_AFTER_RESULT'), '晚于必须触发');
});

test('mutation 边界: powerPlan sampleSize=1 / targetPower=0.5 恰好合法（边界含端）', () => {
  // lte_to_lt 变异（sampleSize<1）会拒掉合法的 1；lt_to_lte 变异（<=0.5）会拒掉合法的 0.5。
  const okResult = compileFec({
    fec: makeValidFec({
      workflowRequirements: [{ name: 'w', engine: 'script', requireContainerDigest: false, requireCommandHash: false, expectedNetworkPolicy: 'off', requireFixedSeed: false }],
      metric: { ...baseMetric(), isDeterministic: true },
      requirePowerPlan: true,
      powerPlan: { targetPower: 0.5, sampleSize: 1, alphaAssumed: 0.05 },
    }),
  });
  assert.ok(okResult.ok, `sampleSize=1 + targetPower=0.5 必须通过（端点合法），实际: ${okResult.ok ? '' : JSON.stringify(okResult.errors.map((e) => e.code))}`);
  // 对照：0 / 0.499 仍拒
  const badSize = compileFec({ fec: makeValidFec({ requirePowerPlan: true, powerPlan: { targetPower: 0.8, sampleSize: 0, alphaAssumed: 0.05 } }) });
  assert.ok(!badSize.ok && badSize.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'), 'sampleSize=0 必须拒');
  const badPower = compileFec({ fec: makeValidFec({ requirePowerPlan: true, powerPlan: { targetPower: 0.4999, sampleSize: 64, alphaAssumed: 0.05 } }) });
  assert.ok(!badPower.ok && badPower.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'), 'targetPower<0.5 必须拒');
});

test('mutation 边界: 仅 timeWindow 空白 → SCOPE_UNBOUNDED（复合 or 单支）', () => {
  const fec = makeValidFec({ scope: { ...baseScope(), timeWindow: '   ' } });
  const result = compileFec({ fec });
  assert.ok(
    result.errors.some((e) => e.code === 'SCOPE_UNBOUNDED'),
    '单字段空白必须拦截（or_to_and 变异下单支漏过）',
  );
});

test('mutation 边界: 非确定 metric + 无固定种子要求 + seedPolicy.fixed=false → PROTOCOL_INCOMPLETE', () => {
  // involvesRandomness 的 || 位点：requireFixedSeed=false && isDeterministic=false
  // → some=false || !true=true → 涉及随机 → seedPolicy.fixed=false 须报错。
  const fec = makeValidFec({
    workflowRequirements: [{ name: 'w', engine: 'script', requireContainerDigest: false, requireCommandHash: false, expectedNetworkPolicy: 'off', requireFixedSeed: false }],
    metric: { ...baseMetric(), isDeterministic: false },
    seedPolicy: { fixed: false, seedValue: null, allowCherryPick: false },
  });
  const result = compileFec({ fec });
  assert.ok(
    result.errors.some((e) => e.code === 'PROTOCOL_INCOMPLETE'),
    'metric 非确定性即涉及随机，fixed=false 必须报 PROTOCOL_INCOMPLETE',
  );
});

test('mutation 边界: requireGitCommitShaBinding=true 三向（合法 sha 通过/非法拒/缺省跳过）', () => {
  const GOOD_SHA = 'a'.repeat(40);
  // 合法 40-hex → 通过（neq_to_eq 位点：变异后合法 sha 被拒）
  const good = compileFec({ fec: makeValidFec({ requireGitCommitShaBinding: true, freeze: { ...makeValidFec().freeze, gitCommitSha: GOOD_SHA } }) });
  assert.ok(good.ok, `合法 40-hex sha 必须通过，实际: ${good.ok ? '' : JSON.stringify(good.errors.map((e) => e.code))}`);
  // 非 40-hex → GIT_COMMIT_SHA_UNBOUND（pattern 位点）
  const bad = compileFec({ fec: makeValidFec({ requireGitCommitShaBinding: true, freeze: { ...makeValidFec().freeze, gitCommitSha: 'xyz' } }) });
  assert.ok(!bad.ok && bad.errors.some((e) => e.code === 'GIT_COMMIT_SHA_UNBOUND'), '非法 sha 须拒');
  // 缺省 false → 跳过（!== true 位点：true_to_false 变异会误启用检查→非 binding 的老用例被拒）
  const skipped = compileFec({ fec: makeValidFec({ freeze: { ...makeValidFec().freeze, gitCommitSha: 'not-a-sha' } }) });
  assert.ok(skipped.ok, 'requireGitCommitShaBinding 缺省时不得启用 sha 检查（V1 向后兼容）');
});

test('mutation 边界: datasetRequirements=[] 单空 → EVIDENCE_REQUIREMENT_MISSING（复合 or 单支）', () => {
  const fec = makeValidFec({ datasetRequirements: [] });
  const result = compileFec({ fec });
  assert.ok(
    !result.ok && result.errors.some((e) => e.code === 'EVIDENCE_REQUIREMENT_MISSING'),
    '仅 datasets 空必须拦截（or_to_and 单支变异会漏过）',
  );
  const fecW = makeValidFec({ workflowRequirements: [] });
  const resultW = compileFec({ fec: fecW });
  assert.ok(
    !resultW.ok && resultW.errors.some((e) => e.code === 'EVIDENCE_REQUIREMENT_MISSING'),
    '仅 workflows 空必须拦截',
  );
});

test('mutation 边界: 统计计划单字段 null → STAT_PLAN_MISSING（复合 is-missing 单支）', () => {
  const base = makeValidFec();
  const fecNull = makeValidFec({ statisticalPlan: { ...base.statisticalPlan, nullHypothesis: null as unknown as string } });
  const r1 = compileFec({ fec: fecNull });
  assert.ok(!r1.ok && r1.errors.some((e) => e.code === 'STAT_PLAN_MISSING'), 'nullHypothesis=null 须拒');
  const fecBlank = makeValidFec({ statisticalPlan: { ...base.statisticalPlan, primaryMetric: '   ' } });
  const r2 = compileFec({ fec: fecBlank });
  assert.ok(!r2.ok && r2.errors.some((e) => e.code === 'STAT_PLAN_MISSING'), 'primaryMetric 空白须拒');
});

test('mutation 边界: isDescriptivePhrase 空 key → true（无效占位语义）', async () => {
  const { isDescriptivePhrase } = await import('../../src/fec/compiler.ts');
  assert.equal(isDescriptivePhrase(''), true, '空 key 视为无效（描述性占位）——true_to_false 位点');
  assert.equal(isDescriptivePhrase('   '), true, '空白 key 同理');
});
