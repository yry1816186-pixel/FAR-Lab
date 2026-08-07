/**
 * osc_pipeline.test.ts — OSC (2015) real paper pipeline tests.
 *
 * 测试策略：
 *   1. Fisher r→z 变换的纯函数正确性（已知值 + 往返不变量）。
 *   2. OSC 汇总统计的复算正确性（与论文报告数字、Python 轴交叉验证的期望值）。
 *   3. 完整 pipeline 的裁决：必须产出 DEGRADED_SCOPE（R4）——复制效应非零
 *      但范围退化，这是 Bem (UNTESTED/INCONCLUSIVE) 与 Ritchie (REFUTED) 之外
 *      的第四个 5 值裁决。
 */

import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  OSC_ALPHA,
  OSC_CLAIM_ID,
  OSC_METRIC_KEY,
  OSC_ORIGINAL_MEDIAN_R,
  OSC_ORIGINAL_N,
  OSC_REPLICATION_MEDIAN_R,
  OSC_REPLICATION_N,
  buildOscChain,
  buildOscStatistics,
  rToZ,
  zToR,
} from '../../src/science_harness/osc_pipeline.ts';

const TOL = 1e-6;

describe('rToZ / zToR (Fisher transform pure functions)', () => {
  test('known values from OSC 2015', () => {
    // r = 0.403 -> z = 0.5*ln(1.403/0.597) = 0.42723
    assert.ok(Math.abs(rToZ(0.403) - 0.42723) < 1e-4);
    // r = 0.197 -> z = 0.5*ln(1.197/0.803) = 0.19961
    assert.ok(Math.abs(rToZ(0.197) - 0.19961) < 1e-4);
    // r = 0 -> z = 0
    assert.equal(rToZ(0), 0);
  });

  test('round trip zToR(rToZ(r)) === r', () => {
    for (const r of [-0.9, -0.5, -0.1, 0.1, 0.197, 0.403, 0.8]) {
      assert.ok(Math.abs(zToR(rToZ(r)) - r) < TOL);
    }
  });

  test('rejects out-of-range r', () => {
    assert.throws(() => rToZ(-1));
    assert.throws(() => rToZ(1));
    assert.throws(() => rToZ(1.5));
  });
});

describe('buildOscStatistics', () => {
  test('recomputes published OSC (2015) summary statistics', () => {
    const s = buildOscStatistics(OSC_METRIC_KEY);

    // Paper counts.
    assert.equal(s.originalCount, OSC_ORIGINAL_N);
    assert.ok(Math.abs(s.originalSignificantRate - 0.97) < TOL);
    assert.equal(s.replicationCount, OSC_REPLICATION_N);
    assert.ok(Math.abs(s.replicationSignificantRate - 36 / 97) < TOL);
    assert.equal(s.originalMedianR, OSC_ORIGINAL_MEDIAN_R);
    assert.equal(s.replicationMedianR, OSC_REPLICATION_MEDIAN_R);

    // Fisher z on replication r = 0.197, SE = 1/sqrt(94).
    assert.ok(Math.abs(s.replicationEffectZ - 0.19961) < 1e-4);
    assert.ok(Math.abs(s.replicationEffectSe - 0.10314) < 1e-4);
    assert.ok(Math.abs(s.replicationEffectZStat - 1.935) < 0.02);

    // Replication effect p (one-sided) is significant at alpha=0.05.
    assert.ok(s.replicationEffectP > 0);
    assert.ok(s.replicationEffectP < OSC_ALPHA);

    // Rate-drop two-proportion z is decisive (> 8).
    assert.ok(s.rateDropZ > 8);
    assert.ok(s.rateDropP < 1e-10);

    // Shrinkage ≈ 51%.
    assert.ok(Math.abs(s.effectShrinkage - (1 - 0.197 / 0.403)) < 1e-3);

    // BH-FDR family of 2: primary survives.
    assert.equal(s.bhAdjustedPs.length, 2);
    assert.equal(s.survivesFdr, true);
  });

  test('effect direction supports the claim (replication effect > 0)', () => {
    const s = buildOscStatistics(OSC_METRIC_KEY);
    assert.equal(s.effectDirection, 'supports');
    assert.equal(s.statisticalResult.status, 'ran');
    assert.equal(s.statisticalResult.testId, OSC_METRIC_KEY);
    assert.ok(s.statisticalResult.pValue !== undefined);
    assert.ok(s.statisticalResult.pValue < OSC_ALPHA);
  });

  test('statistical diagnostics flag the distribution drift', () => {
    const s = buildOscStatistics(OSC_METRIC_KEY);
    assert.ok(s.statisticalResult.assumptionDiagnostics?.some(
      (d) => d.kind === 'distribution_drift' && d.severity === 'warn',
    ));
  });
});

describe('buildOscChain (end-to-end real paper pipeline)', () => {
  it('produces DEGRADED_SCOPE (R4) for the OSC claim', () => {
    const db = new Database(':memory:');
    try {
      const result = buildOscChain(db);
      assert.equal(result.claimId, OSC_CLAIM_ID);
      assert.equal(result.machineVerdict, 'DEGRADED_SCOPE');
      // 5-value verdict: OSC covers the 4th value distinct from Bem/Ritchie.
      assert.ok(['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].includes(
        result.machineVerdict,
      ));
    } finally {
      db.close();
    }
  });

  it('sealed conclusion matches the machine verdict (needs endorsement)', () => {
    const db = new Database(':memory:');
    try {
      const result = buildOscChain(db);
      assert.equal(result.sealedConclusion, result.machineVerdict);
      // 密封信封携带已知失败声明（DEGRADED_SCOPE 需人类背书）。
      assert.ok(result.sealed.envelope.knownFailures.length > 0);
      assert.ok(result.sealed.envelope.sealedAt);
    } finally {
      db.close();
    }
  });

  it('FEC gate allows the claim with validated statistics', () => {
    const db = new Database(':memory:');
    try {
      const result = buildOscChain(db);
      assert.equal(result.fecGate.allowed, true);
      assert.equal(result.fecGate.ciBlocked, false);
      // R4 家族（非关键 scope 错配）→ DEGRADED_SCOPE。
      assert.equal(result.kernelOutput.decisiveRuleId, 'R4_SCOPE_MISMATCH_NONCRITICAL');
      assert.ok(result.kernelOutput.reasonCodes.includes('R4_SCOPE_MISMATCH_NONCRITICAL'));
    } finally {
      db.close();
    }
  });

  it('anti-theater lint passes on the honest aggregate pipeline', () => {
    const db = new Database(':memory:');
    try {
      const result = buildOscChain(db);
      assert.ok(result.antiTheaterReport);
      assert.equal(result.antiTheaterReport.findings.length, 0);
      assert.equal(result.antiTheaterReport.hasFail, false);
    } finally {
      db.close();
    }
  });
});
