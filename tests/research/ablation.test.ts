/**
 * ablation tests — R4 编排原语消融聚合的统计与诚实纪律。
 *
 * 覆盖面（每条都是真实逻辑分支，非装饰）：
 *   1. N≥5×2 + 同快照 → REPORTED：均值差/CI/方向三态（不跨0 才给方向）；
 *   2. 确定性：同输入两次聚合字节一致（seed 派生可复算）；
 *   3. N<5 试点 → DIRECTIONAL_PILOT：方向强制 null，报告带降级横幅；
 *   4. 混 runMode → MIXED_RUN_MODE 拒聚合；
 *   5. 空臂 → ARM_EMPTY；
 *   6. 快照不同质（未钉定）→ 不给 REPORTED（DIRECTIONAL_PILOT + 标注漂移混杂）；
 *   7. 指标缺值/布尔指标/缺指标名并集；
 *   8. 边际成本 token bootstrap 存在性与量纲；
 *   9. 渲染：关键行可检索（status/臂配置/cannot-prove）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateAblation,
  renderAblation,
  type AblationArmInput,
  type AblationInput,
} from '../../src/research/evaluation/ablation.ts';
import type { FrozenRunObservation } from '../../src/research/evaluation/frozen_multirun.ts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

/** 构造一条 OK 观测（可覆盖指标/哈希/runMode/tokens）。 */
function obs(
  runIndex: number,
  metrics: ReadonlyArray<{ name: string; value: number | boolean | null }>,
  opts: {
    rootHash?: string;
    runMode?: string;
    tokens?: number;
    status?: 'OK' | 'FAILED';
    errorKind?: string;
  } = {},
): FrozenRunObservation {
  const failed = opts.status === 'FAILED';
  return {
    runIndex,
    runMode: opts.runMode ?? 'LIVE',
    status: failed ? 'FAILED' : 'OK',
    errorKind: failed ? (opts.errorKind ?? 'unknown') : null,
    metrics: failed ? [] : metrics,
    variability: failed
      ? null
      : {
          retrievalSnapshotId: `snap-${runIndex}`,
          retrievalRootHash: opts.rootHash ?? HASH_A,
          retrievalSnapshotCreatedAt: '2026-08-16T00:00:00.000Z',
          corpusDocumentCount: 37,
          modelId: 'qwen3.7-max-test',
          provider: 'dashscope',
          temperature: null,
          samplingSeed: null,
          gitCommit: 'f34f586',
          startedAt: `2026-08-16T0${runIndex % 10}:00:00.000Z`,
          strategyIds: [],
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: opts.tokens ?? 250_000 },
        },
  };
}

function pilot(
  withRuns: readonly FrozenRunObservation[],
  withoutRuns: readonly FrozenRunObservation[],
  extra: Partial<AblationInput> = {},
): AblationInput {
  const withArm: AblationArmInput = { armId: 'with', config: 'default multi_strategy fan-out + tournament', runs: withRuns };
  const withoutArm: AblationArmInput = { armId: 'without', config: '--legacy-generation single-shot', runs: withoutRuns };
  return {
    questionId: 'hero-hot-jupiter-inflation',
    primitive: 'discovery-fanout',
    withArm,
    withoutArm,
    seed: 20260816,
    iterations: 2000,
    generatedAt: '2026-08-16T12:00:00.000Z',
    ...extra,
  };
}

/** N 条同构 run（指标值由函数给出——构造清晰差异/噪声场景）。 */
function arm(n: number, metricFn: (i: number) => number, tokens = 250_000): FrozenRunObservation[] {
  return Array.from({ length: n }, (_, i) =>
    obs(i + 1, [{ name: 'citationBindingRate', value: metricFn(i) }], { tokens }),
  );
}

describe('ablation — REPORTED path (n>=5 x2, shared snapshot)', () => {
  const withRuns = arm(6, (i) => 1 - (i % 3) * 0.05, 300_000); // 高绑定率
  const withoutRuns = arm(6, (i) => 0.8 - (i % 3) * 0.05, 200_000); // 低绑定率
  const report = aggregateAblation(pilot(withRuns, withoutRuns));

  it('status REPORTED with STATISTICAL_SIGNAL evidence grade', () => {
    assert.equal(report.status, 'REPORTED');
    assert.equal(report.evidenceGrade, 'STATISTICAL_SIGNAL');
    assert.equal(report.sharedFrozenSnapshot, true);
  });

  it('delta direction is derived ONLY from CI position (CI excludes 0 here)', () => {
    const row = report.perMetric.find((m) => m.name === 'citationBindingRate')!;
    assert.equal(row.status, 'REPORTED');
    assert.ok(row.deltaCi95 !== null);
    // with (≈0.95) − without (≈0.75)：正差且 CI 远离 0 → FAVORS_WITH。
    assert.equal(row.direction, 'FAVORS_WITH');
    assert.ok(row.deltaMean! > 0.1);
  });

  it('identical input aggregates byte-identically (seeded, recomputable)', () => {
    const again = aggregateAblation(pilot(withRuns, withoutRuns));
    assert.deepEqual(again, report);
  });

  it('marginal token cost carries a two-sample bootstrap CI', () => {
    assert.equal(report.marginalCost.deltaTokensMean, 100_000);
    assert.ok(report.marginalCost.deltaTokensCi95 !== null);
    assert.ok(report.marginalCost.deltaTokensCi95!.lower <= 100_000);
    assert.ok(report.marginalCost.deltaTokensCi95!.upper >= 100_000);
    assert.equal(report.marginalCost.deltaTokensCi95!.method, 'percentile-bootstrap-two-sample-unpaired');
  });

  it('NO_SIGNAL when the CI crosses zero (no separation)', () => {
    const same = arm(6, () => 0.9, 250_000);
    const r2 = aggregateAblation(pilot(same, arm(6, () => 0.9, 250_000)));
    const row = r2.perMetric.find((m) => m.name === 'citationBindingRate')!;
    assert.equal(row.direction, 'NO_SIGNAL');
  });
});

describe('ablation — honesty downgrades', () => {
  it('n<5 → DIRECTIONAL_PILOT: means shown, directions force-null, banner present', () => {
    const r = aggregateAblation(pilot(arm(2, () => 1.0), arm(2, () => 0.5)));
    assert.equal(r.status, 'DIRECTIONAL_PILOT');
    assert.equal(r.evidenceGrade, 'DIRECTIONAL_ONLY');
    const row = r.perMetric.find((m) => m.name === 'citationBindingRate')!;
    // 试点均值照登（规划用途），但状态降级 + 方向不给。
    assert.equal(row.status, 'INSUFFICIENT_N');
    assert.ok(row.withMean !== null && row.withoutMean !== null);
    assert.equal(row.direction, null);
    const text = renderAblation(r);
    assert.match(text, /DIRECTIONAL_PILOT/);
    assert.match(text, /方向性信号非统计确认/);
  });

  it('mixed runMode within an arm → MIXED_RUN_MODE, aggregation refused', () => {
    const mixedWith = [
      obs(1, [{ name: 'x', value: 1 }], { runMode: 'LIVE' }),
      ...arm(5, () => 1),
    ].map((o, i) => (i === 1 ? { ...o, runMode: 'RECORDED_REPLAY' } : o));
    const r = aggregateAblation(pilot(mixedWith, arm(6, () => 1)));
    assert.equal(r.status, 'MIXED_RUN_MODE');
    assert.ok(r.perMetric.every((m) => m.status === 'INSUFFICIENT_N'));
    assert.match(renderAblation(r), /MIXED_RUN_MODE/);
  });

  it('empty arm → ARM_EMPTY', () => {
    const r = aggregateAblation(pilot([], arm(5, () => 1)));
    assert.equal(r.status, 'ARM_EMPTY');
  });

  it('diverged snapshot hashes (no pin) → never REPORTED, confound is named', () => {
    const withR = arm(6, () => 1).map((o, i) => (i === 0 ? obs(99, [{ name: 'x', value: 1 }], { rootHash: HASH_B }) : o));
    const r = aggregateAblation(pilot(withR, arm(6, () => 1)));
    assert.equal(r.status, 'DIRECTIONAL_PILOT');
    assert.equal(r.sharedFrozenSnapshot, false);
    assert.match(renderAblation(r), /DIVERGED SNAPSHOT HASHES/);
  });
});

describe('ablation — metric plumbing', () => {
  it('metric-name union across arms (a metric only present in one arm stays listed)', () => {
    const withR = arm(6, () => 1).map((o) => ({
      ...o,
      metrics: [...o.metrics, { name: 'tournamentOnlyMetric', value: 0.42 }],
    }));
    const r = aggregateAblation(pilot(withR, arm(6, () => 1)));
    const only = r.perMetric.find((m) => m.name === 'tournamentOnlyMetric')!;
    // without 臂 0 个非空观测 → INSUFFICIENT_N 整行不给数。
    assert.equal(only.status, 'INSUFFICIENT_N');
    assert.equal(only.withoutMean, null);
  });

  it('boolean metrics are mapped 1/0 into the delta stats', () => {
    const withR = Array.from({ length: 6 }, (_, i) =>
      obs(i + 1, [{ name: 'passed', value: true }]),
    );
    const withoutR = Array.from({ length: 6 }, (_, i) =>
      obs(i + 1, [{ name: 'passed', value: i % 2 === 0 }]),
    );
    const r = aggregateAblation(pilot(withR, withoutR));
    const row = r.perMetric.find((m) => m.name === 'passed')!;
    assert.equal(row.withMean, 1); // true → 1
    assert.ok(row.withoutMean! > 0.4 && row.withoutMean! < 0.6); // 交替真假 → ≈0.5
    // 1 − 0.5 = 0.5 的恒定差：重采样任何组合都 ≥ 0.5，CI 不跨 0。
    assert.equal(row.direction, 'FAVORS_WITH');
  });

  it('null metric values are excluded (never imputed)', () => {
    const withR = [
      ...arm(5, () => 1),
      obs(99, [{ name: 'flaky', value: null }]),
    ];
    const r = aggregateAblation(pilot(withR, arm(6, () => 0.5)));
    const flaky = r.perMetric.find((m) => m.name === 'flaky')!;
    assert.equal(flaky.status, 'INSUFFICIENT_N'); // with 臂非空仅 0 < 2
  });

  it('CI is a real distribution, not a degenerate point estimate (day-r11 regression)', () => {
    // 2026-08-16 bug: the seed advance ignored the iteration index, so every
    // bootstrap resample was identical and the CI collapsed to one sample's
    // value (exposed live: deltaMean=0 with CI [-0.04,-0.04] excluding 0).
    // Regression contract: with noisy arms the CI has positive width, and a
    // zero-mean-difference pair yields a CI that STRADDLES zero.
    // Both arms alternate 1/0 (same mean 0.5, real resampling variance).
    const alternating = Array.from({ length: 6 }, (_, i) =>
      obs(i + 1, [{ name: 'x', value: i % 2 === 0 ? 1 : 0 }]),
    );
    const alternating2 = Array.from({ length: 6 }, (_, i) =>
      obs(i + 1, [{ name: 'x', value: i % 2 === 0 ? 0 : 1 }]),
    );
    const noisy = aggregateAblation(pilot(alternating, alternating2));
    const row = noisy.perMetric.find((m) => m.name === 'x')!;
    assert.ok(row.deltaCi95 !== null);
    assert.ok(
      row.deltaCi95.upper - row.deltaCi95.lower > 0.05,
      `CI must have positive width under noise, got [${row.deltaCi95.lower}, ${row.deltaCi95.upper}]`,
    );
    // Mean difference is exactly 0 -> the CI must contain 0.
    assert.ok(
      row.deltaCi95.lower <= 0 && 0 <= row.deltaCi95.upper,
      `equal means: CI must straddle 0, got [${row.deltaCi95.lower}, ${row.deltaCi95.upper}]`,
    );
    assert.equal(row.direction, 'NO_SIGNAL');
    // Identical constant arms: degenerate data -> degenerate (but valid) CI at 0.
    const same = aggregateAblation(pilot(arm(5, () => 0.37), arm(5, () => 0.37)));
    const sameRow = same.perMetric.find((m) => m.name === 'citationBindingRate')!;
    assert.ok(sameRow.deltaCi95 !== null);
    assert.equal(sameRow.deltaCi95.lower, 0);
    assert.equal(sameRow.deltaCi95.upper, 0);
  });

  it('single-arm descriptive view: fan-out-only metrics characterize the present arm, labeled not-comparable', () => {
    const withRuns = arm(5, () => 1).map((o) => ({
      ...o,
      metrics: [...o.metrics, { name: 'tournamentEloSpread', value: 105 + o.runIndex }],
    }));
    const r = aggregateAblation(pilot(withRuns, arm(5, () => 1)));
    const row = r.perMetric.find((m) => m.name === 'tournamentEloSpread')!;
    assert.equal(row.status, 'INSUFFICIENT_N', 'comparison stays suppressed');
    assert.equal(row.direction, null, 'descriptive rows never get a direction');
    assert.ok(row.descriptive !== null && row.descriptive !== undefined);
    assert.equal(row.descriptive.armId, 'with');
    assert.equal(row.descriptive.n, 5);
    assert.equal(row.descriptive.mean, (106 + 107 + 108 + 109 + 110) / 5);
    const text = renderAblation(r);
    assert.match(text, /desc with: mean=108[.\d]* n=5 .*not comparable/);
    // A metric absent in BOTH arms stays a plain INSUFFICIENT_N (no descriptive).
    const none = aggregateAblation(pilot(arm(5, () => 1), arm(5, () => 1)));
    const absent = none.perMetric.find((m) => m.name === 'tournamentEloSpread');
    assert.equal(absent, undefined, 'metric absent everywhere is simply not listed');
  });

  it('renderer names both arm configs and the cannot-prove line', () => {
    const r = aggregateAblation(pilot(arm(6, () => 1), arm(6, () => 0.5)));
    const text = renderAblation(r);
    assert.match(text, /arm with:.*multi_strategy fan-out \+ tournament/);
    assert.match(text, /arm without:.*--legacy-generation single-shot/);
    assert.match(text, /cannot-prove: this comparison does not establish causal attribution/);
    assert.match(text, /marginal cost \(with − without\)/);
  });
});
