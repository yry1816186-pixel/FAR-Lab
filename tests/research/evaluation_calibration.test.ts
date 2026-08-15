/**
 * tests/research/evaluation_calibration.test.ts — 2.md §4.5 补遗 R10（T1）
 * 置信度校准评估的验收测试：ECE 计算（与 statistics SSOT 一致性）、分箱
 * 边界、空箱排除、样本量守卫、降级阈值边界（严格大于语义钉死）、探针
 * JSON 提取（含跳过账本）、可靠性图确定性。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCalibration,
  pairsFromProbeJson,
  reliabilityDiagramAscii,
  shouldDegradeToBands,
  DEGRADE_ECE_THRESHOLD,
  INSUFFICIENT_SAMPLE_SIZE,
  PROBE_HIT_MAPPING_NOTE,
  CALIBRATION_CANNOT_PROVE_NOTE,
  type CalibrationPair,
} from '../../src/research/evaluation/calibration.ts';
import { expectedCalibrationError } from '../../src/statistics/calibration.ts';

function pairs(specs: readonly (readonly [number, boolean])[]): CalibrationPair[] {
  return specs.map(([confidence, hit]) => ({ confidence, hit }));
}

// ─── ECE 语义 ────────────────────────────────────────────────────────────────

describe('ECE: perfect / miscalibrated / direction', () => {
  it('perfect calibration (per-bin gap 0) → ECE 0, no degrade, balanced', () => {
    // 用二进制精确值（0.25/0.5/1.0）构造每箱 meanConfidence === hitRate：
    // gap 精确为 0（不是被容差吞掉的 0）。
    const r = computeCalibration(pairs([
      [0.5, true], [0.5, true], [0.5, false], [0.5, false],                     // 0.5 vs 2/4
      [0.25, true], [0.25, true], [0.25, false], [0.25, false], [0.25, false], [0.25, false], [0.25, false], [0.25, false], // 0.25 vs 2/8
      [1.0, true], [1.0, true], [1.0, true], [1.0, true],                       // 1.0 vs 4/4
    ]));
    assert.equal(r.ece, 0);
    assert.equal(r.sampleSize, 16);
    assert.equal(r.degradeToBands, false);
    assert.equal(r.insufficientSample, false);
    assert.equal(r.overconfidenceDirection, 'balanced'); // sumConf 2+2+4=8 === hits 8（二进制精确）
    assert.ok(r.bins.filter((b) => b.count > 0).every((b) => b.gap === 0));
  });

  it('maximal miscalibration → ECE≈0.99, degrade=true, over', () => {
    const r = computeCalibration(pairs(Array.from({ length: 10 }, () => [0.99, false] as const)));
    assert.ok(Math.abs(r.ece - 0.99) < 1e-12);
    assert.equal(r.degradeToBands, true); // 条款降级触发
    assert.equal(r.overconfidenceDirection, 'over'); // 自信 0.99·命中 0
    assert.equal(r.insufficientSample, false);
  });

  it('underconfidence (low confidence, all hits) → direction under', () => {
    const r = computeCalibration(pairs(Array.from({ length: 10 }, () => [0.3, true] as const)));
    assert.ok(r.ece > DEGRADE_ECE_THRESHOLD);
    assert.equal(r.overconfidenceDirection, 'under');
    assert.equal(r.degradeToBands, true); // 降级与方向正交：劣校准即降
  });

  it('empty input → insufficient result, no throw, no degrade', () => {
    const r = computeCalibration([]);
    assert.equal(r.sampleSize, 0);
    assert.equal(r.ece, 0);
    assert.equal(r.overconfidenceDirection, 'insufficient');
    assert.equal(r.degradeToBands, false);
    assert.equal(r.bins.length, 10);
    assert.ok(r.bins.every((b) => b.count === 0));
  });
});

// ─── 分箱边界 ────────────────────────────────────────────────────────────────

describe('bin boundary placement', () => {
  it('0.95 and 0.9 and 1.0 all land in [0.9,1.0]; 0.89 lands in [0.8,0.9)', () => {
    const r = computeCalibration(pairs([[0.95, true], [0.9, true], [1.0, true], [0.89, false]]));
    const last = r.bins[9];
    const ninth = r.bins[8];
    assert.ok(last && ninth);
    assert.equal(last.count, 3); // 0.95 + 0.9（左闭）+ 1.0（末箱右闭）
    assert.equal(ninth.count, 1); // 0.89 < 0.9
    assert.ok(Math.abs(last.lower - 0.9) < 1e-12);
    assert.ok(Math.abs(last.upper - 1.0) < 1e-12);
  });

  it('binCount=4: confidence 0.5 lands in [0.5,0.75)', () => {
    const r = computeCalibration(pairs([[0.5, true]]), { binCount: 4 });
    const b = r.bins[2];
    assert.ok(b);
    assert.equal(b.count, 1);
    assert.ok(Math.abs(b.lower - 0.5) < 1e-12);
    assert.ok(Math.abs(b.upper - 0.75) < 1e-12);
    assert.equal(r.binCount, 4);
  });
});

// ─── 空箱排除 + SSOT 一致性 ─────────────────────────────────────────────────

describe('empty-bin exclusion and SSOT consistency', () => {
  it('empty bins contribute 0; ECE equals hand-computed weighted gaps AND the statistics SSOT', () => {
    // 箱 [0.6,0.7): 3 个 conf 0.65·2 hit → gap=|0.65−2/3|；箱 [0.9,1.0): 2 个 0.95·0 hit → gap=0.95。
    const p = pairs([
      [0.65, true], [0.65, true], [0.65, false],
      [0.95, false], [0.95, false],
    ]);
    const r = computeCalibration(p);
    const gapLow = Math.abs(0.65 - 2 / 3);
    const handEce = (3 * gapLow + 2 * 0.95) / 5;
    assert.ok(Math.abs(r.ece - handEce) < 1e-12, `hand=${String(handEce)} got=${String(r.ece)}`);
    // 与 statistics SSOT 独立重算一致（防两套公式漂移）。
    const ssot = expectedCalibrationError(
      p.map((x) => x.confidence),
      p.map((x) => x.hit),
      10,
    );
    assert.ok(Math.abs(r.ece - ssot) < 1e-12);
    // 8 个空箱计数 0 且不贡献：若错按 binCount 加权，结果会是 handEce×5/10。
    const empty = r.bins.filter((b) => b.count === 0);
    assert.equal(empty.length, 8);
    assert.equal(r.bins[6]?.count, 3);
    assert.equal(r.bins[9]?.count, 2);
  });
});

// ─── 样本量守卫 ──────────────────────────────────────────────────────────────

describe('insufficient-sample rule', () => {
  it('n=9 heavily miscalibrated → ECE computed but flagged insufficient, degrade stays false', () => {
    const r = computeCalibration(pairs(Array.from({ length: 9 }, () => [0.99, false] as const)));
    assert.ok(r.ece > 0.9); // ECE 照算
    assert.equal(r.sampleSize, 9);
    assert.equal(r.insufficientSample, true); // n=9 < 10
    assert.equal(r.overconfidenceDirection, 'insufficient');
    assert.equal(r.degradeToBands, false); // 薄证据不足以支撑降级裁定（文档化决策）
    assert.equal(INSUFFICIENT_SAMPLE_SIZE, 10);
  });

  it('n=10 same data → sufficient, degrade fires', () => {
    const r = computeCalibration(pairs(Array.from({ length: 10 }, () => [0.99, false] as const)));
    assert.equal(r.insufficientSample, false);
    assert.equal(r.degradeToBands, true);
  });
});

// ─── 降级阈值边界（严格大于·钉死） ──────────────────────────────────────────

describe('degrade threshold boundary (strictly greater)', () => {
  it('ECE exactly 0.15 does NOT degrade; just above does; insufficient dominates', () => {
    assert.equal(shouldDegradeToBands(0.15, 100), false); // 等于 → 不降（钉死）
    assert.equal(shouldDegradeToBands(0.1500000001, 100), true); // 严格大于 → 降
    assert.equal(shouldDegradeToBands(0.5, 9), false); // 样本不足压过一切
    assert.equal(shouldDegradeToBands(0.5, 10), true);
    assert.equal(shouldDegradeToBands(Number.NaN, 100), false);
    assert.equal(DEGRADE_ECE_THRESHOLD, 0.15);
  });

  it('pipeline just under / over threshold via synthetic pairs', () => {
    // 10×conf 0.86 全 hit → ECE=0.14 < 0.15 → 不降。
    const under = computeCalibration(pairs(Array.from({ length: 10 }, () => [0.86, true] as const)));
    assert.ok(Math.abs(under.ece - 0.14) < 1e-12);
    assert.equal(under.degradeToBands, false);
    // 10×conf 0.7 全 hit → ECE=0.3 > 0.15 → 降。
    const over = computeCalibration(pairs(Array.from({ length: 10 }, () => [0.7, true] as const)));
    assert.ok(Math.abs(over.ece - 0.3) < 1e-12);
    assert.equal(over.degradeToBands, true);
  });
});

// ─── 输入校验 ────────────────────────────────────────────────────────────────

describe('input validation (malformed rejected, never clamped)', () => {
  it('confidence out of [0,1] or NaN throws; binCount<1 throws', () => {
    assert.throws(() => computeCalibration(pairs([[1.2, true]])), /out of \[0,1\]/);
    assert.throws(() => computeCalibration(pairs([[Number.NaN, true]])), /out of \[0,1\]/);
    assert.throws(() => computeCalibration(pairs([[0.5, true]]), { binCount: 0 }), /binCount/);
    assert.throws(() => computeCalibration(pairs([[0.5, true]]), { binCount: 2.5 }), /binCount/);
  });
});

// ─── 探针 JSON 提取 ─────────────────────────────────────────────────────────

describe('pairsFromProbeJson (both on-disk shapes + skip ledger)', () => {
  it('nested specs[].results[] (b7 shape): known→hit, not_seen→miss, skips counted', () => {
    const json = {
      specs: [
        {
          specId: 's1',
          results: [
            { targetId: 't1', recall: 'known', confidence: 0.98, outcome: 'answered' },
            { targetId: 't2', recall: 'not_seen', confidence: 0.95, outcome: 'answered' },
            { targetId: 't3', recall: 'known', confidence: null, outcome: 'answered' }, // 缺置信
            { targetId: 't4', recall: 'known', confidence: 0.9, outcome: 'skipped' },   // 未作答
          ],
        },
        { specId: 's2', results: [{ targetId: 't5', recall: 'maybe', confidence: 0.9, outcome: 'answered' }] }, // 未知 recall
      ],
    };
    const ex = pairsFromProbeJson(json);
    assert.deepEqual(ex.pairs, [
      { confidence: 0.98, hit: true },
      { confidence: 0.95, hit: false },
    ]);
    assert.equal(ex.totalResults, 5);
    assert.equal(ex.skippedMissingConfidence, 1);
    assert.equal(ex.skippedNonAnswered, 1);
    assert.equal(ex.skippedUnknownRecall, 1);
    assert.equal(ex.skippedMalformed, 0);
  });

  it('flat top-level results[] (b8 shape — directive said uniform, disk says otherwise)', () => {
    const json = {
      results: [
        { targetId: 'a', recall: 'known', confidence: 0.85, outcome: 'answered' },
        { targetId: 'b', recall: 'not_seen', confidence: 0.95, outcome: 'answered' },
        'not-a-record', // 畸形条目
      ],
    };
    const ex = pairsFromProbeJson(json);
    assert.deepEqual(ex.pairs, [
      { confidence: 0.85, hit: true },
      { confidence: 0.95, hit: false },
    ]);
    assert.equal(ex.totalResults, 3);
    assert.equal(ex.skippedMalformed, 1);
  });

  it('non-object input → empty extraction, no throw', () => {
    const ex = pairsFromProbeJson('garbage');
    assert.equal(ex.pairs.length, 0);
    assert.equal(ex.totalResults, 0);
  });
});

// ─── 可靠性图 ────────────────────────────────────────────────────────────────

describe('reliabilityDiagramAscii (deterministic, informative)', () => {
  it('double-run byte-identical; line count = bins + 3; populated vs empty bins differ', () => {
    const r = computeCalibration(pairs([[0.95, true], [0.95, false], [0.85, true], [0.4, false]]));
    const d1 = reliabilityDiagramAscii(r.bins);
    const d2 = reliabilityDiagramAscii(r.bins);
    assert.equal(d1, d2); // 确定性
    const lines = d1.split('\n');
    assert.equal(lines.length, r.binCount + 3); // 头 2 行 + 10 箱 + 尾注 1 行
    // 有数据的箱行含 '#' 填充；空箱行只有 '.'——两者必须可区分。
    const binLines = lines.slice(2, 2 + r.binCount);
    assert.equal(binLines.filter((l) => l.includes('#')).length, 3); // [0.4,0.5), [0.8,0.9), [0.9,1.0)
    // 每个箱行都带两条同宽 bar（confidence-bar 与 hit-rate-bar 对比结构）。
    assert.ok(binLines.every((l) => (l.match(/\|[#.]{20}\|/g) ?? []).length === 2));
    assert.ok(d1.includes('(empty bins: n=0'));
  });

  it('changing the bins changes the diagram (not a constant string)', () => {
    const a = reliabilityDiagramAscii(computeCalibration(pairs([[0.95, true]])).bins);
    const b = reliabilityDiagramAscii(computeCalibration(pairs([[0.15, false]])).bins);
    assert.notEqual(a, b);
  });
});

// ─── 报告文案钉子 ────────────────────────────────────────────────────────────

describe('honesty notes pinned (mapping premise travels with every report)', () => {
  it('mapping note states the known/not_seen premise and its caveat', () => {
    assert.ok(PROBE_HIT_MAPPING_NOTE.includes('known'));
    assert.ok(PROBE_HIT_MAPPING_NOTE.includes('not_seen'));
    assert.ok(PROBE_HIT_MAPPING_NOTE.includes('Caveat'));
  });

  it('cannot-prove note names the 13-target scope and directional-signal status', () => {
    assert.ok(CALIBRATION_CANNOT_PROVE_NOTE.includes('13 probe'));
    assert.ok(CALIBRATION_CANNOT_PROVE_NOTE.includes('directional signal'));
    assert.ok(CALIBRATION_CANNOT_PROVE_NOTE.includes('not a precise diagnostic'));
  });
});
