/**
 * ci.ts 错误路径分支覆盖（Z16 coverage_gate 修复·2026-08-10）。
 *
 * 背景：statistics 纳入 CORE_DIRS（b7472fc）后，ci.ts branch 覆盖 52.94% < 75% 阈值，
 * coverage_gate 持续 FAIL。快乐路径已由 statistics_math.test.ts 覆盖，本文件补全部
 * 错误路径断言分支（fail-closed 守卫），使 branch 覆盖达标。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalApproximationInterval,
  meanConfidenceInterval,
  differenceInMeansConfidenceInterval,
  wilsonScoreInterval,
} from '../../src/statistics/ci.ts';

test('meanConfidenceInterval: sample < 2 → fail-closed（含空数组）', () => {
  assert.throws(
    () => meanConfidenceInterval([1]),
    /meanConfidenceInterval: sample must contain at least two observations/,
  );
  assert.throws(
    () => meanConfidenceInterval([]),
    /meanConfidenceInterval: sample must contain at least two observations/,
  );
});

test('differenceInMeansConfidenceInterval: 任一样本 < 2 → fail-closed', () => {
  assert.throws(
    () => differenceInMeansConfidenceInterval([1], [1, 2, 3]),
    /differenceInMeansConfidenceInterval: both samples need at least two observations/,
  );
  assert.throws(
    () => differenceInMeansConfidenceInterval([1, 2], [3]),
    /differenceInMeansConfidenceInterval: both samples need at least two observations/,
  );
  assert.throws(
    () => differenceInMeansConfidenceInterval([], []),
    /differenceInMeansConfidenceInterval: both samples need at least two observations/,
  );
});

test('wilsonScoreInterval: trials === 0 → fail-closed', () => {
  assert.throws(
    () => wilsonScoreInterval(0, 0),
    /wilsonScoreInterval: trials must be greater than zero/,
  );
});

test('wilsonScoreInterval: successes > trials → fail-closed', () => {
  assert.throws(
    () => wilsonScoreInterval(11, 10),
    /wilsonScoreInterval: successes cannot exceed trials/,
  );
});

test('wilsonScoreInterval: 非整数 / 负计数 → fail-closed', () => {
  assert.throws(
    () => wilsonScoreInterval(1.5, 10),
    /expected a non-negative integer/,
  );
  assert.throws(
    () => wilsonScoreInterval(-1, 10),
    /expected a non-negative integer/,
  );
  assert.throws(
    () => wilsonScoreInterval(5, 2.5),
    /expected a non-negative integer/,
  );
});

test('confidenceLevel 越界（<=0 或 >=1）→ fail-closed（三个函数共用断言）', () => {
  assert.throws(
    () => normalApproximationInterval(10, 1, 0),
    /confidenceLevel: expected a value strictly between 0 and 1/,
  );
  assert.throws(
    () => normalApproximationInterval(10, 1, 1),
    /confidenceLevel: expected a value strictly between 0 and 1/,
  );
  assert.throws(
    () => meanConfidenceInterval([1, 2, 3], 1.5),
    /confidenceLevel: expected a value strictly between 0 and 1/,
  );
  assert.throws(
    () => wilsonScoreInterval(5, 10, -0.1),
    /confidenceLevel: expected a value strictly between 0 and 1/,
  );
});

test('normalApproximationInterval: standardError 非正 → fail-closed', () => {
  assert.throws(
    () => normalApproximationInterval(10, 0),
    /standardError: expected a positive number/,
  );
  assert.throws(
    () => normalApproximationInterval(10, -1),
    /standardError: expected a positive number/,
  );
});

test('estimate / standardError / confidenceLevel 非有限 → fail-closed', () => {
  assert.throws(
    () => normalApproximationInterval(Number.NaN, 1),
    /estimate: expected a finite number/,
  );
  assert.throws(
    () => normalApproximationInterval(Infinity, 1),
    /estimate: expected a finite number/,
  );
  assert.throws(
    () => normalApproximationInterval(10, Number.NaN),
    /standardError: expected a finite number/,
  );
  assert.throws(
    () => normalApproximationInterval(10, 1, Number.NaN),
    /confidenceLevel: expected a finite number/,
  );
});

test('正常路径回归：三个区间函数边界值仍正确（防错误路径修复破坏快乐路径）', () => {
  const a = normalApproximationInterval(100, 2, 0.9);
  assert.equal(a.estimate, 100);
  assert.ok(a.lower < 100 && a.upper > 100);
  assert.equal(a.confidenceLevel, 0.9);

  const w = wilsonScoreInterval(0, 10, 0.95); // 0 成功边界
  assert.equal(w.estimate, 0);
  assert.equal(w.lower, 0);
  assert.ok(w.upper > 0 && w.upper <= 1);

  const wFull = wilsonScoreInterval(10, 10, 0.95); // 全成功边界
  assert.equal(wFull.estimate, 1);
  assert.equal(wFull.upper, 1);
  assert.ok(wFull.lower >= 0 && wFull.lower < 1);

  const d = differenceInMeansConfidenceInterval([1, 2, 3, 4], [5, 6, 7, 8]);
  assert.ok(d.lower < d.estimate && d.estimate < d.upper);
});
