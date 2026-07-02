// tests/science_harness/hero_a_harness.test.ts
// 测试 hero-A-001 quantitative harness（22 T-W2-06 · 任务 #12 决策 G）。
//
// 设计 verdict（spec 10 §4.4:284-288）：M1 PASS + M2/M3 WARN → mapChecksToVerdict 'mixed' → INCONCLUSIVE。
// RULE-FS-001 不可证伪 rationale：定量基准声称因方差/污染难以干净证伪（见 hero_a_harness.ts 头注释）。
//
// Authority: 22 T-W2-06 + 21 §8 + 任务 #12。
// 零容忍合规：无 any / @ts-ignore / 改测试期望让实现通过。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  HERO_A_001_CLAIM,
  HERO_A_CHECK_IDS,
  HERO_A_DEFAULT_THRESHOLDS,
  buildHeroAChecks,
} from '../../src/science_harness/hero_a_harness.ts';
import { mapChecksToVerdict } from '../../src/science_harness/tess_harness.ts';

// ===== 设计 verdict：M1 PASS + M2/M3 WARN → INCONCLUSIVE（mixed）=====

test('hero-A: 设计 measured（accuracy 达标·方差/污染超标）→ M1 PASS + M2/M3 WARN → INCONCLUSIVE', () => {
  // accuracy=0.75 >= 0.75 PASS；runVariance=0.03 >= 0.02 → 不满足 < 0.02 → WARN；
  // contamination=0.08 >= 0.05 → 不满足 < 0.05 → WARN。
  const checks = buildHeroAChecks({
    accuracy: 0.75,
    runVariance: 0.03,
    contaminationScore: 0.08,
  });
  assert.equal(checks.length, 3);
  assert.equal(checks[0]!.outcome, 'PASS'); // M1 accuracy
  assert.equal(checks[1]!.outcome, 'WARN'); // M2 variance
  assert.equal(checks[2]!.outcome, 'WARN'); // M3 contamination

  // mapChecksToVerdict：hasWarn + hasPass + 无 FAIL → mixed → INCONCLUSIVE。
  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.route, 'mixed');
});

// ===== 确定性（同 measured → 同 checks）=====

test('hero-A: 确定性——同 measured 两次构造产相同 outcome 序列', () => {
  const measured = { accuracy: 0.75, runVariance: 0.03, contaminationScore: 0.08 };
  const a = buildHeroAChecks(measured);
  const b = buildHeroAChecks(measured);
  assert.deepEqual(
    a.map((c) => `${c.id}=${c.outcome}`),
    b.map((c) => `${c.id}=${c.outcome}`),
  );
});

// ===== 阈值注入（F8 预登记·禁 hardcode）=====

test('hero-A: 阈值注入覆盖默认（提高 accuracy 阈值 → 原 PASS 转 WARN）', () => {
  const measured = { accuracy: 0.75, runVariance: 0.01, contaminationScore: 0.02 };
  // 默认阈值 0.72 → accuracy=0.75 PASS。
  const defaultChecks = buildHeroAChecks(measured);
  assert.equal(defaultChecks[0]!.outcome, 'PASS');
  // 覆盖 M1 阈值至 0.80 → accuracy=0.75 不达标 → WARN。
  const overridden = buildHeroAChecks(measured, {
    thresholds: { M1_accuracy: { op: '>=', value: 0.8, unit: 'accuracy' } },
  });
  assert.equal(overridden[0]!.outcome, 'WARN');
  // M2/M3 不受影响（仍用默认）。
  assert.equal(overridden[1]!.threshold.value, HERO_A_DEFAULT_THRESHOLDS.M2_run_variance.value);
});

// ===== harness 非强制 INCONCLUSIVE：干净数据 → all_pass CONFIRMED（诚实：是数据·非硬编码 verdict）=====

test('hero-A: 干净 measured（全达标）→ all_pass CONFIRMED（harness 非硬编码 INCONCLUSIVE·是数据决定）', () => {
  // 全达标：accuracy=0.80>=0.72·variance=0.01<0.02·contamination=0.02<0.05。
  const checks = buildHeroAChecks({
    accuracy: 0.8,
    runVariance: 0.01,
    contaminationScore: 0.02,
  });
  assert.ok(checks.every((c) => c.outcome === 'PASS'));
  const result = mapChecksToVerdict(checks);
  assert.equal(result.verdict, 'CONFIRMED');
  assert.equal(result.route, 'all_pass');
});

// ===== 常量契约 =====

test('hero-A: 常量契约（CLAIM/CHECK_IDS/DEFAULT_THRESHOLDS 形状）', () => {
  assert.ok(HERO_A_001_CLAIM.includes('quantitative'));
  assert.deepEqual([...HERO_A_CHECK_IDS], ['M1_accuracy', 'M2_run_variance', 'M3_contamination']);
  // 每 CHECK_ID 有默认阈值。
  for (const id of HERO_A_CHECK_IDS) {
    assert.ok(HERO_A_DEFAULT_THRESHOLDS[id], `missing default threshold for ${id}`);
  }
});
