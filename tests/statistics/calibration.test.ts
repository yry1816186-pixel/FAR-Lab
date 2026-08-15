/**
 * calibration 评分测试。
 *
 * 契约：
 *   1. brierScore：1/n Σ(pᵢ - oᵢ)²——完美预测（p=o）→ 0；反向预测 → 1。
 *   2. expectedCalibrationError：10 均匀分箱的加权 |accuracy − mean_prediction|。
 *   3. calibrationQuality：n < MIN_SAMPLE 时返回 null（校准弃权·样本不足不产出评级——
 *      N5-E7 的「弃权」语义：宁可无评级也不给低置信评级）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_CALIBRATION_SAMPLE,
  brierScore,
  calibrationQuality,
  expectedCalibrationError,
} from '../../src/statistics/calibration.ts';

test('N5-E7: brierScore is zero for perfect predictions', () => {
  // 完美预测 = p 精确等于 o（1→true·0→false）。
  const preds = [1, 0, 1, 0];
  const outcomes = [true, false, true, false];
  assert.equal(brierScore(preds, outcomes), 0, 'p==o 时每项贡献 0');
});

test('N5-E7: brierScore is 1 for perfectly inverted predictions', () => {
  const preds = [1, 1, 1, 1];
  const outcomes = [false, false, false, false];
  assert.equal(brierScore(preds, outcomes), 1, 'p=1 o=0 时每项贡献 1');
});

test('N5-E7: brierScore validates array length parity and probability range', () => {
  assert.throws(() => brierScore([0.5], [true, false]), /same length/);
  assert.throws(() => brierScore([1.5], [true]), /0.*1|probability/);
});

test('N5-E7: expectedCalibrationError is zero for a perfectly calibrated model', () => {
  // 箱内 mean_pred == 频率 → ECE 0（0/1 边界值使箱内均值为离散频率）。
  const preds = [0, 0, 1, 1];
  const outcomes = [false, false, true, true];
  assert.equal(expectedCalibrationError(preds, outcomes, 2), 0, '箱内均值=频率 → 0');
});

test('N5-E7: expectedCalibrationError is positive for miscalibrated predictions', () => {
  // 全预测 0.9 但只有一半为真 → 箱内 accuracy 0.5 ≠ 0.9 → ECE > 0。
  const preds = [0.9, 0.9, 0.9, 0.9];
  const outcomes = [true, true, false, false];
  const ece = expectedCalibrationError(preds, outcomes, 4);
  assert.ok(ece > 0, 'miscalibration must surface as positive ECE');
  assert.ok(ece < 1, 'ECE bounded by [0,1]');
});

test('N5-E7: calibrationQuality abstains (null) below the minimum sample size', () => {
  const preds = [0.9, 0.8, 0.7];
  const outcomes = [true, true, false];
  assert.equal(
    calibrationQuality(preds, outcomes),
    null,
    `n<${MIN_CALIBRATION_SAMPLE} must abstain (calibration abstention, N5-E7)`,
  );
});

test('N5-E7: calibrationQuality grades good vs bad calibration deterministically', () => {
  // 校准良好：0/1 边界预测与结果完全一致（brier=0·ECE=0）。
  const half = MIN_CALIBRATION_SAMPLE / 2;
  const goodPreds = Array.from({ length: MIN_CALIBRATION_SAMPLE }, (_, i) =>
    i < half ? 0 : 1,
  );
  const goodOutcomes = goodPreds.map((p) => p > 0.5);
  const good = calibrationQuality(goodPreds, goodOutcomes);
  assert.ok(good !== null, 'adequate sample must not abstain');
  assert.ok(good.ece < 0.2, 'well-calibrated sample must have low ECE');
  assert.ok(good.brier < 0.3, 'well-calibrated sample must have low Brier');

  // 校准差：预测 0.9 但结果全反。
  const badPreds = Array.from({ length: MIN_CALIBRATION_SAMPLE }, () => 0.9);
  const badOutcomes = Array.from({ length: MIN_CALIBRATION_SAMPLE }, () => false);
  const bad = calibrationQuality(badPreds, badOutcomes);
  assert.ok(bad !== null);
  assert.ok(bad.brier > 0.6, 'inverted predictions must surface high Brier');
});
