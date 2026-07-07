/**
 * FEC V2 compiler 单测（03 §2.1-2.3 + §5.2）。
 *
 * 覆盖：
 *   1. 合法 FEC → ok=true，FalsificationPlan 含 statLock/verdictMapping/proofChecks（03 §1.4 三产物）。
 *   2. verdictMapping === SSOT §5.2 固定五路径→五 verdict 表。
 *   3. 10 个 CompileErrorCode 逐条触发（#1-6,8,10 → HARD_FAIL_UNTESTED；#9 LLM_FROZEN → CI_BLOCK；#7 → WARN 不阻断）。
 *   4. error collection：多 error 同时报（不 short-circuit · 零容忍 #4）。
 *   5. computeFecHash 稳定性 + 字段敏感性。
 *   6. isDescriptivePhrase / involvesRandomness / mapCompileErrorToSeverity。
 *
 * 权威：FAR_LAB_MASTER_PLAN/03 §2.1（检查表）+ §2.2（伪代码）+ §2.3（降级）+ §5.2（verdict_mapping）。
 * 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。纯函数测试（不读 DB）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFalsificationPlan,
  compileFec,
  computeFecHash,
  involvesRandomness,
  isDescriptivePhrase,
  mapCompileErrorToSeverity,
} from '../../src/fec/compiler.ts';
import type {
  FecContractV2,
  MetricSpec,
  ScopeSpec,
  StatisticalPlan,
} from '../../src/fec/fec_contract.ts';

// ===== 合法 FEC fixture 工厂 =====

function baseScope(): ScopeSpec {
  return {
    population: 'galaxies with redshift z<0.5',
    timeWindow: '2018-01-01..2020-12-31',
    domainConstraint: 'optical photometry',
  };
}

function baseMetric(): MetricSpec {
  return {
    metricKey: 'rmse',
    description: 'root mean squared error',
    unit: 'unitless',
    computationRef: 'metrics/rmse.py',
    isDeterministic: false,
  };
}

function baseStatPlan(): StatisticalPlan {
  return {
    primaryMetric: 'rmse',
    nullHypothesis: 'RMSE >= 0.5',
    alternativeHypothesis: 'RMSE < 0.5',
    alpha: 0.05,
    effectDirection: 'less',
    confidenceIntervalMethod: 'bootstrap-1000',
    multipleTestingCorrection: 'none',
    missingDataPolicy: 'listwise-deletion',
    outlierPolicy: 'none',
    stoppingRule: 'fixed-n',
  };
}

function makeValidFec(overrides: Partial<FecContractV2> = {}): FecContractV2 {
  return {
    fecId: 'FEC-TEST-0001',
    contractVersion: 'FEC/2.0',
    claimId: 'CLAIM-0001',
    measurableImplication: 'Model M achieves RMSE <= 0.5 on dataset D',
    scope: baseScope(),
    requiredEvidence: [
      {
        evidenceId: 'EV-1',
        kind: 'measurement',
        critical: true,
        description: 'RMSE on hold-out D',
        verificationCheckId: 'CHECK-rmse',
      },
    ],
    datasetRequirements: [
      {
        name: 'D',
        contentHashAlgorithm: 'sha256',
        allowSynthetic: false,
        schemaFingerprintRequired: true,
      },
    ],
    workflowRequirements: [
      {
        name: 'train-eval',
        engine: 'script',
        requireContainerDigest: true,
        requireCommandHash: true,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: true,
      },
    ],
    metric: baseMetric(),
    threshold: {
      value: 0.5,
      unit: 'unitless',
      thresholdSemantics: 'lt',
      preregistered: true,
    },
    direction: 'less',
    statisticalPlan: baseStatPlan(),
    seedPolicy: {
      fixed: true,
      seedValue: 42,
      allowCherryPick: false,
    },
    deviationPolicy: {
      criticalCategories: ['alpha_change'],
      nonCriticalHandling: 'tolerate',
      requireExplicitLog: true,
    },
    freeze: {
      fecHash: '0'.repeat(64),
      actor: { actorKind: 'deterministic_freezer', actorId: 'freezer-01' },
      timestamp: '2020-01-01T00:00:00Z',
      environmentPolicy: 'locked-digest',
      deviationPolicyHash: '1'.repeat(64),
      frozenBy: 'deterministic_freezer',
    },
    integrityFlags: [],
    ...overrides,
  };
}

function assertOk(result: ReturnType<typeof compileFec>): asserts result is Extract<typeof result, { ok: true }> {
  assert.equal(result.ok, true, `expected compile ok=true but got errors: ${result.ok === false ? result.errors.map((e) => e.code).join(',') : ''}`);
}

function assertFail(result: ReturnType<typeof compileFec>): asserts result is Extract<typeof result, { ok: false }> {
  assert.equal(result.ok, false, 'expected compile ok=false but got ok=true');
}

function hasError(result: Extract<ReturnType<typeof compileFec>, { ok: false }>, code: string): boolean {
  return result.errors.some((e) => e.code === code);
}

// ===== 合法路径 + verdict_mapping =====

test('compileFec: 合法 FEC → ok=true 产 FalsificationPlan 三产物（03 §1.4）', () => {
  const result = compileFec({ fec: makeValidFec() });
  assertOk(result);
  assert.ok(result.plan.statLock.hash.length === 64, 'statLock.hash 须为 64 hex');
  assert.equal(result.plan.statLock.alpha, 0.05);
  assert.equal(result.plan.statLock.correction, 'none');
  assert.equal(result.plan.statLock.primaryMetric, 'rmse');
  assert.ok(result.plan.proofChecks.length >= 3, 'proofChecks 至少 3 项');
  // 首里程碑未交付产物（诚实声明·非桩）。
  assert.deepEqual(result.plan.testPlan, []);
  assert.deepEqual(result.plan.refutationRoutes, []);
  assert.deepEqual(result.plan.reproSpec, []);
});

test('compileFec: verdictMapping === SSOT 03 §5.2 固定五路径→五 verdict 表', () => {
  const result = compileFec({ fec: makeValidFec() });
  assertOk(result);
  assert.deepEqual(result.plan.verdictMapping, {
    all_pass: 'CONFIRMED',
    any_refute: 'REFUTED',
    data_missing: 'UNTESTED',
    scope_narrow: 'DEGRADED_SCOPE',
    mixed: 'INCONCLUSIVE',
  });
});

test('compileFec: proofChecks 含 seed_policy，涉及随机时 expected=PASS（03 §2.2）', () => {
  const result = compileFec({ fec: makeValidFec() });
  assertOk(result);
  const seedCheck = result.plan.proofChecks.find((c) => c.checkKind === 'seed_policy');
  assert.ok(seedCheck, '须有 seed_policy check');
  // makeValidFec 涉及随机（requireFixedSeed=true + isDeterministic=false）→ PASS。
  assert.equal(seedCheck?.expectedOutcome, 'PASS');
});

test('compileFec: 不涉及随机时 seed_policy expected=SKIP', () => {
  const fec = makeValidFec({
    metric: { ...baseMetric(), isDeterministic: true },
    workflowRequirements: [
      {
        name: 'train-eval',
        engine: 'script',
        requireContainerDigest: true,
        requireCommandHash: true,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: false,
      },
    ],
  });
  const result = compileFec({ fec });
  assertOk(result);
  const seedCheck = result.plan.proofChecks.find((c) => c.checkKind === 'seed_policy');
  assert.equal(seedCheck?.expectedOutcome, 'SKIP');
});

// ===== 10 个 CompileErrorCode 逐条 =====

test('#1 FEC_NOT_COMPILABLE: 空 measurableImplication → fail-closed UNTESTED', () => {
  const result = compileFec({ fec: makeValidFec({ measurableImplication: '   ' }) });
  assertFail(result);
  assert.ok(hasError(result, 'FEC_NOT_COMPILABLE'));
  assert.equal(result.failClosedVerdict, 'UNTESTED');
  assert.equal(result.decisiveVerdictPath, 'data_missing');
});

test('#2 SCOPE_UNBOUNDED: scope 三要素缺一 → UNTESTED', () => {
  const result = compileFec({ fec: makeValidFec({ scope: { ...baseScope(), timeWindow: '' } }) });
  assertFail(result);
  assert.ok(hasError(result, 'SCOPE_UNBOUNDED'));
  assert.equal(result.failClosedVerdict, 'UNTESTED');
});

test('#3a METRIC_MISSING: 空 metricKey → UNTESTED', () => {
  const result = compileFec({ fec: makeValidFec({ metric: { ...baseMetric(), metricKey: '' } }) });
  assertFail(result);
  assert.ok(hasError(result, 'METRIC_MISSING'));
});

test('#3b METRIC_MISSING: 描述性短语 metricKey → UNTESTED（03 §2.2 line 257）', () => {
  const result = compileFec({ fec: makeValidFec({ metric: { ...baseMetric(), metricKey: '显著周期' } }) });
  assertFail(result);
  assert.ok(hasError(result, 'METRIC_MISSING'));
});

test('#4 THRESHOLD_MISSING: threshold.unit != metric.unit → UNTESTED', () => {
  const result = compileFec({
    fec: makeValidFec({ threshold: { value: 0.5, unit: 'meters', thresholdSemantics: 'lt', preregistered: true } }),
  });
  assertFail(result);
  assert.ok(hasError(result, 'THRESHOLD_MISSING'));
});

test('#4b THRESHOLD_MISSING: threshold.value=NaN → UNTESTED', () => {
  const result = compileFec({
    fec: makeValidFec({ threshold: { value: Number.NaN, unit: 'unitless', thresholdSemantics: 'lt', preregistered: true } }),
  });
  assertFail(result);
  assert.ok(hasError(result, 'THRESHOLD_MISSING'));
});

test('#5 EVIDENCE_REQUIREMENT_MISSING: datasetRequirements 空 → UNTESTED', () => {
  const result = compileFec({ fec: makeValidFec({ datasetRequirements: [] }) });
  assertFail(result);
  assert.ok(hasError(result, 'EVIDENCE_REQUIREMENT_MISSING'));
});

test('#6a STAT_PLAN_MISSING: alpha 越界（>=1）→ UNTESTED（03 §4.1）', () => {
  const result = compileFec({
    fec: makeValidFec({ statisticalPlan: { ...baseStatPlan(), alpha: 1.5 } }),
  });
  assertFail(result);
  assert.ok(hasError(result, 'STAT_PLAN_MISSING'));
});

test('#6b STAT_PLAN_MISSING: 缺必填字段（stoppingRule 空）→ UNTESTED', () => {
  const result = compileFec({
    fec: makeValidFec({ statisticalPlan: { ...baseStatPlan(), stoppingRule: '' } }),
  });
  assertFail(result);
  assert.ok(hasError(result, 'STAT_PLAN_MISSING'));
});

test('#7 MULTIPLE_TESTING_UNCORRECTED: familySize>1 + correction=none → WARN 不阻断 + p_hacking_risk flag', () => {
  const fec = makeValidFec({
    statisticalPlan: { ...baseStatPlan(), multipleTestingCorrection: 'none' },
    multipleTestingPlan: {
      correction: 'bonferroni',
      familySize: 3,
      adjustedAlpha: 0.0167,
      preregistered: true,
    },
  });
  const result = compileFec({ fec });
  // #7 是 WARN，不阻断 compile（ok=true）。
  assertOk(result);
  assert.ok(
    result.plan.integrityFlags.includes('p_hacking_risk'),
    'integrityFlags 须含 p_hacking_risk',
  );
});

test('#7: familySize=1 + correction=none → 不触发（无 p_hacking_risk）', () => {
  const result = compileFec({ fec: makeValidFec() }); // 默认无 multipleTestingPlan（familySize=1）
  assertOk(result);
  assert.ok(
    !result.plan.integrityFlags.includes('p_hacking_risk'),
    'familySize=1 不应触发 p_hacking_risk',
  );
});

test('#8 PROTOCOL_INCOMPLETE: 涉及随机 + seedPolicy.fixed=false → UNTESTED', () => {
  const result = compileFec({
    fec: makeValidFec({ seedPolicy: { fixed: false, allowCherryPick: false } }),
  });
  assertFail(result);
  assert.ok(hasError(result, 'PROTOCOL_INCOMPLETE'));
  assert.equal(result.failClosedVerdict, 'UNTESTED');
});

test('#9 LLM_FROZEN: frozenBy != deterministic_freezer → HARD_FAIL_CI_BLOCK（03 §2.3 CI 阻断）', () => {
  // frozenBy 是字面量类型，构造非法值须绕过类型——用整体对象 + as const 字段无法赋非法值。
  // 改用 compiler 内部逻辑：构造 freeze 对象后整体替换 frozenBy（测试专用 cast）。
  const fec = makeValidFec();
  const tampered = {
    ...fec,
    freeze: { ...fec.freeze, frozenBy: 'llm_as_judge' as 'deterministic_freezer' },
  };
  const result = compileFec({ fec: tampered });
  assertFail(result);
  const llmErr = result.errors.find((e) => e.code === 'LLM_FROZEN');
  assert.ok(llmErr, '须有 LLM_FROZEN error');
  assert.equal(llmErr?.severity, 'HARD_FAIL_CI_BLOCK');
});

test('#10 HARKING_REVISION_AFTER_RESULT: freeze.timestamp 晚于 measurement → UNTESTED', () => {
  const result = compileFec({
    fec: makeValidFec(), // freeze.timestamp = 2020-01-01
    measurementCutoff: '2019-06-01T00:00:00Z', // 早于 freeze → HARKing
  });
  assertFail(result);
  assert.ok(hasError(result, 'HARKING_REVISION_AFTER_RESULT'));
  assert.equal(result.failClosedVerdict, 'UNTESTED');
});

test('#10: 无 measurementCutoff → 跳过 HARKing 检查（不报错）', () => {
  const result = compileFec({ fec: makeValidFec() }); // 不传 measurementCutoff
  assertOk(result);
});

test('#10: freeze.timestamp 早于 measurement → 不触发 HARKing', () => {
  const result = compileFec({
    fec: makeValidFec(), // freeze.timestamp = 2020-01-01
    measurementCutoff: '2021-01-01T00:00:00Z', // 晚于 freeze → 合法
  });
  assertOk(result);
});

// ===== error collection（不 short-circuit）=====

test('compileFec: 多 error 同时报（不 short-circuit · 零容忍 #4）', () => {
  const result = compileFec({
    fec: makeValidFec({
      measurableImplication: '', // #1
      scope: { population: '', timeWindow: '', domainConstraint: '' }, // #2
      metric: { ...baseMetric(), metricKey: '' }, // #3
    }),
  });
  assertFail(result);
  assert.ok(hasError(result, 'FEC_NOT_COMPILABLE'));
  assert.ok(hasError(result, 'SCOPE_UNBOUNDED'));
  assert.ok(hasError(result, 'METRIC_MISSING'));
  assert.ok(result.errors.length >= 3, '须同时报 >=3 个 error');
});

// ===== computeFecHash =====

test('computeFecHash: 稳定性 + 64 hex + 字段敏感（03 §1.2）', () => {
  const fec = makeValidFec();
  const h1 = computeFecHash(fec);
  const h2 = computeFecHash(fec);
  assert.equal(h1, h2, '相同输入须相同 hash');
  assert.equal(h1.length, 64, 'sha256 hex = 64 字符');
  const fec2 = makeValidFec({ measurableImplication: 'different implication' });
  assert.notEqual(computeFecHash(fec2), h1, '改字段须变 hash');
});

test('computeFecHash: integrityFlags 不影响 hash（derived · 非契约内容）', () => {
  const fec = makeValidFec({ integrityFlags: ['p_hacking_risk'] });
  const fec2 = makeValidFec({ integrityFlags: [] });
  assert.equal(computeFecHash(fec), computeFecHash(fec2));
});

// ===== 辅助函数 =====

test('isDescriptivePhrase: 稳定 key=false，描述性短语=true（03 §2.1 #3）', () => {
  assert.equal(isDescriptivePhrase('rmse'), false);
  assert.equal(isDescriptivePhrase('f1_score'), false);
  assert.equal(isDescriptivePhrase('log.likelihood'), false);
  assert.equal(isDescriptivePhrase('RMSE_v2'), false);
  assert.equal(isDescriptivePhrase('显著周期'), true);
  assert.equal(isDescriptivePhrase('high performance'), true); // 含空格
  assert.equal(isDescriptivePhrase('很好'), true); // 中文
  assert.equal(isDescriptivePhrase(''), true); // 空
  assert.equal(isDescriptivePhrase('   '), true); // 纯空格
});

test('involvesRandomness: requireFixedSeed 或 非确定性 metric → true', () => {
  assert.equal(involvesRandomness(makeValidFec()), true); // 默认 requireFixedSeed=true + isDeterministic=false
  const deterministic = makeValidFec({
    metric: { ...baseMetric(), isDeterministic: true },
    workflowRequirements: [
      {
        name: 'train-eval',
        engine: 'script',
        requireContainerDigest: true,
        requireCommandHash: true,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: false,
      },
    ],
  });
  assert.equal(involvesRandomness(deterministic), false);
});

test('mapCompileErrorToSeverity: 全 10 code 映射正确（03 §2.3）', () => {
  assert.equal(mapCompileErrorToSeverity('LLM_FROZEN'), 'HARD_FAIL_CI_BLOCK');
  assert.equal(mapCompileErrorToSeverity('MULTIPLE_TESTING_UNCORRECTED'), 'WARN_DOWNGRADE_INCONCLUSIVE');
  const hardFailCodes = [
    'FEC_NOT_COMPILABLE',
    'SCOPE_UNBOUNDED',
    'METRIC_MISSING',
    'THRESHOLD_MISSING',
    'EVIDENCE_REQUIREMENT_MISSING',
    'STAT_PLAN_MISSING',
    'PROTOCOL_INCOMPLETE',
    'HARKING_REVISION_AFTER_RESULT',
  ] as const;
  for (const code of hardFailCodes) {
    assert.equal(mapCompileErrorToSeverity(code), 'HARD_FAIL_UNTESTED', `${code} 须 HARD_FAIL_UNTESTED`);
  }
});

test('buildFalsificationPlan: statLock.hash 稳定 + verdictMapping 固定', () => {
  const fec = makeValidFec();
  const plan = buildFalsificationPlan(fec, []);
  assert.equal(plan.statLock.hash.length, 64);
  assert.equal(plan.verdictMapping.all_pass, 'CONFIRMED');
  assert.equal(plan.verdictMapping.scope_narrow, 'DEGRADED_SCOPE');
});
