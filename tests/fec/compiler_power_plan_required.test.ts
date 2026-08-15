// tests/fec/compiler_power_plan_required.test.ts
//
// T-027 · FEC PowerPlan 强制绑定回归测试（2026-07-24 F-7-003 修复）。
//
// T-027 + F-7-003：
//   "FEC spec 质量无强制审计（powerAnalysisN optional）→ FEC 只保证「有 spec」不保证「spec 严格」"。
//   一个垃圾 spec（阈值宽松到永不被证伪）也能过 FEC 门——FEC 的强制力被「宽松 spec」绕过。
//
// 修复机制（V1 边界·诚实登记·与 T-003/T-008 同 opt-in 模式）：
//   - FecContractV2 新增 `requirePowerPlan?: boolean` META 开关（不进 hash·不进 proofHash）；
//   - compiler #12 校验：opt-in 时 powerPlan 须存在且 sampleSize > 0 + targetPower >= 0.5，
//     否则 POWER_PLAN_REQUIRED（HARD_FAIL_UNTESTED · fail-closed UNTESTED · 拒绝落 CONFIRMED）。
//
// 测试覆盖：
//   1. V1 默认（requirePowerPlan 缺省/false）→ 跳过 #12（向后兼容 demo seed / hero pipeline）；
//   2. opt-in + powerPlan 缺失 → POWER_PLAN_REQUIRED（fail-closed）；
//   3. opt-in + powerPlan.sampleSize <= 0（含 0/负数/NaN）→ POWER_PLAN_REQUIRED；
//   4. opt-in + powerPlan.targetPower < 0.5 → POWER_PLAN_REQUIRED；
//   5. opt-in + 合法 powerPlan（sampleSize > 0 + targetPower >= 0.5）→ 通过（合法路径不误伤）；
//   6. orchestrator 集成：opt-in + 缺 powerPlan → fecAppendClaim fail-closed UNTESTED。
//
// Authority: T-027 + F-7-003 +
//            src/fec/compiler.ts（checkPowerPlanRequired · #12）
//            src/fec/fec_contract.ts（FecContractV2.requirePowerPlan）。
//
// 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  compileFec,
} from '../../src/fec/compiler.ts';
import type { FecContractV2, PowerPlan } from '../../src/fec/fec_contract.ts';
import { makeValidFec } from './fixtures.ts';

/** assert.fail narrowing helper：断言 compileFec 返回 ok=false 分支（含 errors 字段）。 */
type CompileFailResult = Extract<ReturnType<typeof compileFec>, { ok: false }>;
function assertCompileFail(result: ReturnType<typeof compileFec>): asserts result is CompileFailResult {
  assert.equal(result.ok, false, 'expected compile ok=false but got ok=true');
}

/** 合法 PowerPlan（sampleSize=120 > 0, targetPower=0.8 >= 0.5 · Cohen 推荐）。 */
function validPowerPlan(): PowerPlan {
  return {
    targetPower: 0.8,
    minimumDetectableEffect: 0.2,
    sampleSize: 120,
    powerMethod: 'ttest',
    alphaAssumed: 0.05,
  };
}

// ===== V1 默认不强制（向后兼容）=====

test('T-027 compiler: V1 默认（requirePowerPlan 缺省）→ 跳过 #12（向后兼容 demo seed）', () => {
  // FEC 完全不携带 powerPlan + 不 opt-in → 须通过（demo seed 现状）
  const fec = makeValidFec();
  const result = compileFec({ fec });
  assert.equal(result.ok, true, 'V1 默认下不强制 powerPlan·demo seed 须通过');
});

test('T-027 compiler: requirePowerPlan=false 显式 + 缺 powerPlan → 跳过 #12（向后兼容）', () => {
  const fec: FecContractV2 = { ...makeValidFec(), requirePowerPlan: false };
  const result = compileFec({ fec });
  assert.equal(result.ok, true, 'requirePowerPlan=false 显式下不强制 powerPlan');
});

test('T-027 compiler: V1 默认 + 已含 powerPlan → 通过（不强制但允许）', () => {
  // 已有 powerPlan 但未 opt-in → 通过（powerPlan optional · 允许但不强制）
  const fec: FecContractV2 = { ...makeValidFec(), powerPlan: validPowerPlan() };
  const result = compileFec({ fec });
  assert.equal(result.ok, true);
});

// ===== opt-in + powerPlan 缺失 → POWER_PLAN_REQUIRED =====

test('T-027 compiler: requirePowerPlan=true + powerPlan 缺失 → POWER_PLAN_REQUIRED（fail-closed）', () => {
  const fec: FecContractV2 = { ...makeValidFec(), requirePowerPlan: true };
  const result = compileFec({ fec });
  assertCompileFail(result);
  const codes = result.errors.map((e) => e.code);
  assert.ok(codes.includes('POWER_PLAN_REQUIRED'), `须报 POWER_PLAN_REQUIRED，实际 codes=${codes.join(',')}`);
  assert.equal(result.failClosedVerdict, 'UNTESTED', 'fail-closed verdict 须为 UNTESTED');
  // 严重性：HARD_FAIL_UNTESTED（F-7-003 方法学修复）
  const ppErr = result.errors.find((e) => e.code === 'POWER_PLAN_REQUIRED')!;
  assert.equal(ppErr.severity, 'HARD_FAIL_UNTESTED');
});

// ===== opt-in + sampleSize 非法 =====

test('T-027 compiler: requirePowerPlan=true + sampleSize=0 → POWER_PLAN_REQUIRED', () => {
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), sampleSize: 0 },
  };
  const result = compileFec({ fec });
  assertCompileFail(result);
  assert.ok(result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'));
});

test('T-027 compiler: requirePowerPlan=true + sampleSize=-10 → POWER_PLAN_REQUIRED', () => {
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), sampleSize: -10 },
  };
  const result = compileFec({ fec });
  assertCompileFail(result);
  assert.ok(result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'));
});

test('T-027 compiler: requirePowerPlan=true + sampleSize=NaN → POWER_PLAN_REQUIRED', () => {
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), sampleSize: Number.NaN },
  };
  const result = compileFec({ fec });
  assertCompileFail(result);
  assert.ok(result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'));
});

test('T-027 compiler: requirePowerPlan=true + sampleSize=Infinity → POWER_PLAN_REQUIRED', () => {
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), sampleSize: Number.POSITIVE_INFINITY },
  };
  const result = compileFec({ fec });
  assertCompileFail(result);
  assert.ok(result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'));
});

// ===== opt-in + targetPower 非法 =====

test('T-027 compiler: requirePowerPlan=true + targetPower=0.3 (< 0.5) → POWER_PLAN_REQUIRED', () => {
  // targetPower < 0.5 = 掷硬币·power analysis 纯装饰（Cohen 1988 推荐 0.8·0.5 是底线）
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), targetPower: 0.3 },
  };
  const result = compileFec({ fec });
  assertCompileFail(result);
  assert.ok(
    result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED' && e.field === 'powerPlan.targetPower'),
    '须报 targetPower 字段错误',
  );
});

test('T-027 compiler: requirePowerPlan=true + targetPower=0.5 (边界) → 通过（>= 0.5 合法）', () => {
  // 边界：targetPower=0.5 合法（>= 0.5·统计学底线）
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), targetPower: 0.5 },
  };
  const result = compileFec({ fec });
  assert.equal(result.ok, true, 'targetPower=0.5 是合法边界（>= 0.5）');
});

test('T-027 compiler: requirePowerPlan=true + targetPower=NaN → POWER_PLAN_REQUIRED', () => {
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), targetPower: Number.NaN },
  };
  const result = compileFec({ fec });
  assertCompileFail(result);
  assert.ok(result.errors.some((e) => e.code === 'POWER_PLAN_REQUIRED'));
});

// ===== opt-in + 合法 powerPlan → 通过（合法路径不误伤）=====

test('T-027 compiler: requirePowerPlan=true + 合法 powerPlan（sampleSize=120, targetPower=0.8）→ 通过', () => {
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: validPowerPlan(),
  };
  const result = compileFec({ fec });
  assert.equal(result.ok, true, '合法 powerPlan 须通过（合法路径不误伤）');
});

test('T-027 compiler: requirePowerPlan=true + sampleSize=1 + targetPower=0.99 (极值)→ 通过', () => {
  // 极值合法：sampleSize=1 + targetPower=0.99（虽然不切实际但数值合法·compiler 不评 methodological soundness）
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: { ...validPowerPlan(), sampleSize: 1, targetPower: 0.99 },
  };
  const result = compileFec({ fec });
  assert.equal(result.ok, true);
});

// ===== 错误信息质量（field 定位 + 修复 hint）=====

test('T-027 compiler: POWER_PLAN_REQUIRED 错误含 field + 修复 hint', () => {
  const fec: FecContractV2 = { ...makeValidFec(), requirePowerPlan: true };
  const result = compileFec({ fec });
  assertCompileFail(result);
  const ppErr = result.errors.find((e) => e.code === 'POWER_PLAN_REQUIRED')!;
  assert.equal(ppErr.field, 'powerPlan');
  assert.ok(ppErr.message.includes('power analysis'), '错误信息须含修复 hint（跑 power analysis）');
  assert.ok(ppErr.message.includes('F-7-003'), '错误信息须含发现编号');
});

// ===== 与其他 opt-in flag 正交（T-003/T-008 同 FEC 不互相干扰）=====

test('T-027 compiler: requirePowerPlan 与 requireGitCommitShaBinding 正交（同 opt-in 互不干扰）', () => {
  // 两个 opt-in 都开 + 都缺对应字段 → 须同时报 POWER_PLAN_REQUIRED + GIT_COMMIT_SHA_UNBOUND（error collection）
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    requireGitCommitShaBinding: true,
    // 不提供 powerPlan，不提供 freeze.gitCommitSha
  };
  const result = compileFec({ fec });
  assertCompileFail(result);
  const codes = result.errors.map((e) => e.code);
  assert.ok(codes.includes('POWER_PLAN_REQUIRED'), '须报 POWER_PLAN_REQUIRED');
  assert.ok(codes.includes('GIT_COMMIT_SHA_UNBOUND'), '须同时报 GIT_COMMIT_SHA_UNBOUND（error collection·非短路）');
});

test('T-027 compiler: requirePowerPlan=true + 合法 powerPlan + 其他字段合法 → ok=true（综合集成）', () => {
  // 综合合法路径：requirePowerPlan=true + 合法 powerPlan + 所有其他字段合法 → 通过
  const fec: FecContractV2 = {
    ...makeValidFec(),
    requirePowerPlan: true,
    powerPlan: validPowerPlan(),
  };
  const result = compileFec({ fec });
  assert.equal(result.ok, true, '所有字段合法 + 合法 powerPlan → 须通过');
});
