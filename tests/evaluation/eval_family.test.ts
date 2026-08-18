// tests/evaluation/eval_family.test.ts
// EVAL 族五项机器层：矩阵覆盖/聚合掩盖、失败分类学分布/回归榜/代表例、
// Brier/分组校准/展示门、近重复/污染/元数据剥离/记忆度分层、鲁棒性清单。
// 纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  EVAL_MATRIX_AXES,
  FAILURE_MODES,
  ROBUSTNESS_INVENTORY,
  ROBUSTNESS_SCENARIOS,
  brierScore,
  contaminationScan,
  failureDistribution,
  groupedCalibration,
  matrixCoverageReport,
  memorabilityStratification,
  nearDuplicatePairs,
  presentationGate,
  robustnessCoverage,
  shingleJaccard,
  stripAnswerCueMetadata,
} from '../../src/evaluation/eval_family.ts';
import type { FailureRecord, MatrixCell } from '../../src/evaluation/eval_family.ts';

// ---------------------------------------------------------------------------
// EVAL-MATRIX-001
// ---------------------------------------------------------------------------

test('EVAL-MATRIX-001: 14 轴清单 + 全覆盖通过 + 缺轴/空格/聚合掩盖各自检出', () => {
  assert.equal(EVAL_MATRIX_AXES.length, 14);
  const cells: MatrixCell[] = EVAL_MATRIX_AXES.map((axis) => ({
    axis, value: 'primary', sampleSize: 10, t0Failures: 0,
  }));
  assert.equal(matrixCoverageReport(cells).ok, true);

  // 缺轴：抽掉一个轴的全部格
  const missingAxis = cells.filter((c) => c.axis !== 'language');
  const r1 = matrixCoverageReport(missingAxis);
  assert.equal(r1.ok, false);
  assert.deepEqual(r1.missingAxes, ['language']);

  // 空格：声明覆盖但 sampleSize=0
  const withEmpty = [...cells, { axis: 'language' as const, value: 'zh', sampleSize: 0, t0Failures: 0 }];
  assert.ok(matrixCoverageReport(withEmpty).emptyCells.some((c) => c.value === 'zh'));

  // 聚合掩盖：某格 T0 失败但总体声明 lead → 违规（宪法：聚合不得掩盖关键 T0 失败）
  const withFail = cells.map((c) => (c.axis === 'task-domain' ? { ...c, t0Failures: 3 } : c));
  const r3 = matrixCoverageReport(withFail, 'lead');
  assert.equal(r3.ok, false);
  assert.ok(r3.maskingViolations.some((v) => v.includes('masks 3 T0 failure')));
  // 不声明聚合时同一数据不算掩盖（只有声明才可被掩盖）
  assert.equal(matrixCoverageReport(withFail, 'none').maskingViolations.length, 0);
});

// ---------------------------------------------------------------------------
// EVAL-FAILURE-001
// ---------------------------------------------------------------------------

test('EVAL-FAILURE-001: 14 类分类学 + 分布/回归榜前 3/每类代表例', () => {
  assert.equal(FAILURE_MODES.length, 14);
  const failures: FailureRecord[] = [
    { mode: 'retrieval-miss', runId: 'r1', detail: 'no docs', regressionDelta: 2 },
    { mode: 'retrieval-miss', runId: 'r2', detail: 'empty corpus', regressionDelta: 1 },
    { mode: 'schema-violation', runId: 'r3', detail: 'bad json', regressionDelta: 5 },
    { mode: 'truncation', runId: 'r4', detail: 'cut', regressionDelta: 0 },
    { mode: 'budget-exhaustion', runId: 'r5', detail: 'over', regressionDelta: 3 },
    { mode: 'kernel-rejection', runId: 'r6', detail: 'R7 block' },
  ];
  const report = failureDistribution(failures);
  assert.equal(report.totalFailures, 6);
  assert.equal(report.distribution['retrieval-miss'], 2);
  // 回归榜：schema 5 > budget 3 > retrieval 3（合并 r1+r2=3）→ 前 3
  assert.deepEqual(
    report.topRegressions.map((t) => t.mode),
    ['schema-violation', 'budget-exhaustion', 'retrieval-miss'],
  );
  // 每类至多 1 代表例
  assert.ok(report.representativeExamples.some((e) => e.mode === 'retrieval-miss' && e.runId === 'r1'));
  assert.equal(report.representativeExamples.filter((e) => e.mode === 'retrieval-miss').length, 1);
});

// ---------------------------------------------------------------------------
// EVAL-CALIBRATION-001（Brier/分组/展示门；ECE 面在既有 calibration.ts 互补）
// ---------------------------------------------------------------------------

test('EVAL-CALIBRATION-001: Brier 完美=0 最差→高；分组校准暴露子群漂移；展示门拒裸概率', () => {
  const perfect = [
    { confidence: 1, hit: true },
    { confidence: 0, hit: false },
  ];
  assert.equal(brierScore(perfect), 0);
  const bad = [
    { confidence: 1, hit: false },
    { confidence: 0.9, hit: false },
  ];
  assert.ok(brierScore(bad) > 0.8);

  // 分组：A 组校准好（0.8 vs 0.8），B 组严重过信（0.9 vs 0.2）——漂移可见
  const pairs = [
    { confidence: 0.8, hit: true, group: 'A' },
    { confidence: 0.8, hit: false, group: 'A' },
    { confidence: 0.9, hit: false, group: 'B' },
    { confidence: 0.9, hit: false, group: 'B' },
    { confidence: 0.9, hit: false, group: 'B' },
    { confidence: 0.9, hit: true, group: 'B' }, // B: 0.9 vs 0.25
  ];
  const groups = groupedCalibration(pairs);
  const groupB = groups.find((g) => g.group === 'B');
  assert.ok((groupB?.meanConfidence ?? 0) - (groupB?.observedRate ?? 1) > 0.5, 'B 组过信被暴露');

  // 展示门：probability 无校准证据 → 拒；补证据 → 过；ordinal 恒过
  assert.equal(presentationGate({ label: 'probability', calibrationEvidenceRef: null }).ok, false);
  assert.equal(presentationGate({ label: 'probability', calibrationEvidenceRef: 'cal-report-2026-08-19' }).ok, true);
  assert.equal(presentationGate({ label: 'ordinal', calibrationEvidenceRef: null }).ok, true);
});

// ---------------------------------------------------------------------------
// EVAL-LEAKAGE-001
// ---------------------------------------------------------------------------

test('EVAL-LEAKAGE-001: 近重复 shingle（相似/不相似双向）+ 阈值上下', () => {
  const a = 'The correlation between exoplanet radius and insolation is positive across the sample';
  const b = 'The correlation between exoplanet radius and insolation is positive across all samples';
  const c = 'Retracted studies should be excluded from the evidence base before adjudication';
  assert.ok(shingleJaccard(a, b) > 0.7, '近重复对高相似');
  assert.ok(shingleJaccard(a, c) < 0.2, '无关对低相似');

  const pairs = nearDuplicatePairs([
    { id: 'q1', text: a },
    { id: 'q2', text: b },
    { id: 'q3', text: c },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]?.a, 'q1');

  const none = nearDuplicatePairs([
    { id: 'q1', text: a },
    { id: 'q3', text: c },
  ]);
  assert.equal(none.length, 0);
});

test('EVAL-LEAKAGE-001: 污染扫描（答案串在场命中/不在场干净）+ 元数据剥离 + 记忆度分层', () => {
  const hits = contaminationScan(
    [
      { docId: 'doc-1', text: 'prior work suggests the answer is 42 parsecs for the distance' },
      { docId: 'doc-2', text: 'unrelated content entirely about methodology' },
    ],
    [{ id: 'ans-1', answer: 'the answer is 42 parsecs' }],
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.docId, 'doc-1');

  const stripped = stripAnswerCueMetadata({
    text: 'answer located at C:\\Users\\secret\\bench\\q7.md maybe',
    metadata: { filename: 'q7-answer.txt', source_url: 'https://internal/answers/q7', dataset_name: 'private-bench', ok_field: 'keep' },
  });
  assert.ok(stripped.strippedFields.includes('filename'));
  assert.ok(stripped.strippedFields.includes('source_url'));
  assert.ok(!stripped.text.includes('C:\\\\Users'));
  assert.ok(stripped.text.includes('[stripped-path]'));

  const strat = memorabilityStratification([
    { id: 't1', memorability: 'low' },
    { id: 't2', memorability: 'high' },
  ]);
  assert.equal(strat.evidencePreferenceSatisfied, true);
  const allHigh = memorabilityStratification([{ id: 't2', memorability: 'high' }]);
  assert.equal(allHigh.evidencePreferenceSatisfied, false, '全高记忆度目标不满足发现力证据优先约束');
});

// ---------------------------------------------------------------------------
// EVAL-ROBUST-001
// ---------------------------------------------------------------------------

test('EVAL-ROBUST-001: 14 场景全册 + 缺口如实（不为翻绿伪装覆盖）', () => {
  assert.equal(ROBUSTNESS_SCENARIOS.length, 14);
  assert.equal(ROBUSTNESS_INVENTORY.length, 14);
  const cov = robustnessCoverage();
  assert.equal(cov.total, 14);
  // 缺口如实存在：移动无障碍与低资源设备未覆盖（UI/硬件层职责——不假装）
  assert.ok(cov.gaps.includes('mobile-accessibility'));
  assert.ok(cov.gaps.includes('low-resource-device'));
  assert.ok(cov.covered >= 12, `已映射 ${cov.covered}/14`);
  // 每个已映射场景的映射非空
  for (const e of ROBUSTNESS_INVENTORY) {
    if (e.coveredBy !== null) assert.ok(e.coveredBy.length > 0 && e.note.length > 0);
  }
});
