// tests/research/figure_extraction.test.ts
//
// 图表数据提取 phase 1 契约测试（多模态路线 C · 栅格腿）：
//   - zod 边界：合法记录通过；各类畸形 fail-closed（不部分采纳）
//   - 载荷哈希：provenance 与载荷脱节 → 拒收
//   - 确定性标定：2 点精确 / 3 点 OLS 含残差 / log 轴 / 退化与非法输入 fail-closed
//
// 向量是手工构造的契约样本（SYNTHETIC_TEST 语义）——不是任何真实模型调用的
// 录制物；live VL 录制（RECORDED_REPLAY 磁带）待 DASHSCOPE_API_KEY 恢复（CPS-3）。
// 预期数值（x=6, y=5 等）为手算精确值——本测试同时钉死标定算术的正确性。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  FigureExtractionZod,
  parseFigureExtraction,
  FIGURE_EXTRACTION_PROMPT,
  type FigureExtraction,
} from '../../src/research/adapters/figure_extraction/schema.ts';
import {
  calibrateExtraction,
  fitAxis,
  FigureCalibrationError,
} from '../../src/research/adapters/figure_extraction/calibrate.ts';
import canonicalize from '../../src/vendor/canonicalize.js';

/** 组装一条自洽记录（载荷哈希由记录层口径计算——与 parseFigureExtraction 对拍）。 */
function signedRecord(mutate?: (r: FigureExtraction) => FigureExtraction): string {
  const base: FigureExtraction = {
    chartType: 'scatter',
    xAxis: { axisType: 'linear', ticks: [{ pixel: 10, value: 0 }, { pixel: 110, value: 10 }] },
    yAxis: { axisType: 'linear', ticks: [{ pixel: 10, value: 10 }, { pixel: 110, value: 0 }] },
    series: [{ id: 's1', points: [{ px: 60, py: 60 }] }],
    caveats: ['legend ambiguity: two series share a color'],
    provenance: {
      extractor: 'vlm',
      model: 'qwen3-vl-plus',
      payloadSha256: '0'.repeat(64), // 占位，下方替换为真值
      producedAt: '2026-08-21T12:00:00.000Z',
      mode: 'SYNTHETIC_TEST',
      sourceRef: 'doi:10.0000/contract-vector',
    },
  };
  const record = mutate === undefined ? base : mutate(base);
  const { payloadSha256: _drop, ...provenance } = record.provenance;
  const payload = { ...record, provenance };
  const digest = createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex');
  return JSON.stringify({ ...record, provenance: { ...provenance, payloadSha256: digest } });
}

test('figure_extraction: 合法记录通过 parse（含载荷哈希对拍）', () => {
  const record = parseFigureExtraction(signedRecord());
  assert.equal(record.chartType, 'scatter');
  assert.equal(record.series[0]!.points[0]!.px, 60);
  assert.match(record.provenance.payloadSha256, /^[0-9a-f]{64}$/);
});

test('figure_extraction: 载荷被篡改 → payloadSha256 失配 fail-closed', () => {
  const raw = signedRecord();
  const tampered = JSON.parse(raw) as FigureExtraction;
  tampered.series[0]!.points[0]!.px = 61; // 改载荷不留痕
  assert.throws(() => parseFigureExtraction(JSON.stringify(tampered)), (err: Error) => {
    assert.equal(err.name, 'FigureExtractionParseError');
    assert.match(err.message, /payloadSha256 mismatch/);
    return true;
  });
});

test('figure_extraction: 畸形输入逐类 fail-closed', () => {
  const cases: ReadonlyArray<[string, string, () => string]> = [
    ['非 JSON', 'not valid JSON', () => 'not json {'],
    ['仅 1 个刻度', 'ticks', () => signedRecord((r) => ({ ...r, xAxis: { ...r.xAxis, ticks: [r.xAxis.ticks[0]!] } }))],
    // JSON.stringify(Infinity)→null 会偏离目标；对原文字符串手术注入 1e999 字面量
    ['Infinity 值', 'finite', () => signedRecord().replace('"value":10', '"value":1e999')],
    ['空 series', 'series', () => signedRecord((r) => ({ ...r, series: [] }))],
    ['哈希非 64-hex', 'payloadSha256', () => signedRecord().replace(/"payloadSha256":"[0-9a-f]{64}"/, '"payloadSha256":"deadbeef"')],
    ['未知 chartType', 'chartType', () => signedRecord((r) => ({ ...r, chartType: 'pie' as 'scatter' }))],
  ];
  for (const [name, needle, make] of cases) {
    assert.throws(
      () => parseFigureExtraction(make()),
      (err: Error) => {
        assert.equal(err.name, 'FigureExtractionParseError', name);
        if (name !== '非 JSON') assert.match(err.message, new RegExp(needle), name);
        return true;
      },
      name,
    );
  }
});

test('figure_extraction: 标定算术——2 点精确映射（x=5, y=5 手算钉死）', () => {
  const record = parseFigureExtraction(signedRecord());
  const calibrated = calibrateExtraction(record);
  // x 轴: pixel 10→0, 110→10 ⇒ px60 → 5；y 轴: pixel 10→10, 110→0（倒轴）⇒ py60 → 5
  assert.equal(calibrated.series[0]!.points[0]!.x, 5);
  assert.equal(calibrated.series[0]!.points[0]!.y, 5);
  assert.ok(calibrated.calibration.xAxis.residualMax < 1e-12);
  assert.ok(calibrated.calibration.yAxis.residualMax < 1e-12);
  assert.deepEqual(
    [...calibrated.caveats],
    ['legend ambiguity: two series share a color'],
  );
});

test('figure_extraction: 标定算术——3 点 OLS（非共线，残差进结果）', () => {
  // 刻度 (10,0),(60,5.1),(110,10)：OLS 斜率=0.1，截距=-0.9666…，px35 → 2.5333…；
  // 残差 max = |5.1 - (0.1·60-0.966…)| = 0.0666…
  const record = parseFigureExtraction(
    signedRecord((r) => ({
      ...r,
      xAxis: { ...r.xAxis, ticks: [{ pixel: 10, value: 0 }, { pixel: 60, value: 5.1 }, { pixel: 110, value: 10 }] },
    })),
  );
  const fit = fitAxis(record.xAxis, 'xAxis');
  assert.ok(Math.abs(fit.slope - 0.1) < 1e-12);
  assert.ok(Math.abs(fit.intercept - -0.9666666666666667) < 1e-12);
  assert.ok(Math.abs(fit.toValue(35) - 2.5333333333333332) < 1e-12);
  assert.ok(Math.abs(fit.residualMax - 0.06666666666666666) < 1e-12);
});

test('figure_extraction: log 轴在 log10 域拟合（px60 → 10）', () => {
  // 刻度 (10,1),(110,100)：log10 域斜率 0.02、截距 -0.2 ⇒ px60 → 10^(1.0)=10
  const record = parseFigureExtraction(
    signedRecord((r) => ({
      ...r,
      xAxis: { ...r.xAxis, axisType: 'log' as 'linear', ticks: [{ pixel: 10, value: 1 }, { pixel: 110, value: 100 }] },
    })),
  );
  const fit = fitAxis(record.xAxis, 'xAxis');
  assert.equal(fit.axisType, 'log');
  assert.ok(Math.abs(fit.toValue(60) - 10) < 1e-12);
});

test('figure_extraction: 标定退化/非法输入 fail-closed', () => {
  // 同像素刻度 → 无定义
  const degenerate = signedRecord((r) => ({
    ...r,
    xAxis: { ...r.xAxis, ticks: [{ pixel: 50, value: 0 }, { pixel: 50, value: 10 }] },
  }));
  assert.throws(
    () => calibrateExtraction(parseFigureExtraction(degenerate)),
    /same pixel/,
  );
  // log 轴非正值 → 拒绝
  const negative = signedRecord((r) => ({
    ...r,
    yAxis: { ...r.yAxis, axisType: 'log' as 'linear', ticks: [{ pixel: 10, value: -1 }, { pixel: 110, value: 100 }] },
  }));
  assert.throws(
    () => calibrateExtraction(parseFigureExtraction(negative)),
    /non-positive/,
  );
  // 直接调用 fitAxis 的空刻度防御（绕过 zod 的构造路径）
  assert.throws(
    () => fitAxis({ axisType: 'linear', ticks: [{ pixel: 1, value: 1 }, { pixel: 1, value: 2 }] }, 'xAxis'),
    FigureCalibrationError,
  );
});

test('figure_extraction: 提示词契约——禁模型换算、要 caveats、纯 JSON、VL 无 schema 模式的补偿', () => {
  assert.match(FIGURE_EXTRACTION_PROMPT, /Do NOT convert pixels to data values yourself/);
  assert.match(FIGURE_EXTRACTION_PROMPT, /caveats/);
  assert.match(FIGURE_EXTRACTION_PROMPT, /no markdown fences/);
  assert.match(FIGURE_EXTRACTION_PROMPT, /origin at the TOP-LEFT/);
  // 独立可导出性：zod 边界与提示词同模块发布（导入不炸）
  assert.ok(FigureExtractionZod instanceof Object);
});
