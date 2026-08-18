// tests/gates/milestone_gates.test.ts
// 批 28 六项：三里程碑门聚合 + EVID-ALIGN 弱对齐 + EXEC-SANDBOX 边界 + EXP-OBS 完整性。
// 真实依赖：门聚合器对真实仓库文件做存在性/标记断言；对齐与完整性为纯函数。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LEXICAL_BASELINE_TOLERANCE,
  adversarialRewriteDrift,
  assessAlignment,
  kernelGate,
  lexicalOverlap,
  observationIntegrity,
  productGate,
  realityGate,
  sandboxBoundaryReport,
} from '../../src/gates/milestone_gates.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// 三里程碑门（对真实仓库资产的存在性/标记断言）
// ---------------------------------------------------------------------------

test('GATE-KERNEL-001: 内核门七证据面在场且全绿', () => {
  const gate = kernelGate(REPO_ROOT);
  const failed = gate.checks.filter((c) => !c.ok);
  assert.equal(failed.length, 0, failed.map((f) => `${f.claim}: ${f.problem}`).join('; '));
  assert.equal(gate.pass, true);
  assert.equal(gate.checks.length, 7);
});

test('GATE-PRODUCT-001: 产品链门十环节在场且全绿', () => {
  const gate = productGate(REPO_ROOT);
  const failed = gate.checks.filter((c) => !c.ok);
  assert.equal(failed.length, 0, failed.map((f) => `${f.claim}: ${f.problem}`).join('; '));
  assert.equal(gate.checks.length, 10);
});

test('GATE-REALITY-001: 现实门六条件在场且全绿', () => {
  const gate = realityGate(REPO_ROOT);
  const failed = gate.checks.filter((c) => !c.ok);
  assert.equal(failed.length, 0, failed.map((f) => `${f.claim}: ${f.problem}`).join('; '));
  assert.equal(gate.checks.length, 6);
});

test('GATE 门 fail-closed: 幽灵根下三门全红（聚合器不假装）', () => {
  const phantom = 'C:/definitely-not-a-repo';
  assert.equal(kernelGate(phantom).pass, false);
  assert.equal(productGate(phantom).pass, false);
  assert.equal(realityGate(phantom).pass, false);
});

// ---------------------------------------------------------------------------
// EVID-ALIGN-001
// ---------------------------------------------------------------------------

test('EVID-ALIGN-001: 词法基线三档 + WEAK/MISALIGNED 保留入账不静默丢弃 + 范围错配', () => {
  const claim = 'exoplanet radius correlates with insolation level';
  const strongEvidence = 'we measure exoplanet radius and insolation across 392 planets finding a correlation';
  const weakEvidence = 'stars have planets with various radius distributions';
  const misaligned = 'the telescope mirror alignment procedure requires careful calibration';

  const s = assessAlignment(claim, strongEvidence);
  assert.equal(s.level, 'STRONG');
  assert.ok(s.overlap >= 0.5);
  assert.equal(s.flag, null);
  assert.equal(s.retained, true, '任何对齐档位都保留入账——丢弃只能显式标记不能静默');

  const w = assessAlignment(claim, weakEvidence);
  assert.ok(w.level === 'WEAK' || w.level === 'MISALIGNED');
  assert.equal(w.retained, true, '弱对齐证据必须保留入账（不静默丢弃）');

  const m = assessAlignment(claim, misaligned);
  assert.ok(m.overlap < 0.2);
  assert.equal(m.flag, 'WEAK_ALIGNMENT');

  // 范围错配：scope 词缺席
  const scope = assessAlignment(claim, strongEvidence, ['mars']);
  assert.equal(scope.flag, 'SCOPE_MISMATCH');
  assert.equal(scope.level, 'MISALIGNED');
});

test('EVID-ALIGN-001: 对抗改写漂移——同义改写不应大幅改变对齐', () => {
  const claim = 'coffee reduces liver disease risk';
  const original = 'coffee consumption reduces the risk of liver disease in cohort studies';
  const synonymRewrite = 'caffeine intake lowers liver illness probability in cohort analyses';
  const drift = adversarialRewriteDrift(original, synonymRewrite, claim);
  assert.ok(drift <= LEXICAL_BASELINE_TOLERANCE, `同义改写漂移 ${drift.toFixed(2)} 在词法基线容忍度内（基线非语义理解——更大漂移触发人工复核而非直接拒绝）`);
  // 无关改写漂移大（可检出）
  const unrelated = 'quantum computing qubits achieve error correction thresholds';
  const drift2 = adversarialRewriteDrift(original, unrelated, claim);
  assert.ok(drift2 > 0.2 || lexicalOverlap(claim, unrelated) < 0.15, '无关文本对齐极低可检');
});

// ---------------------------------------------------------------------------
// EXEC-SANDBOX-001
// ---------------------------------------------------------------------------

test('EXEC-SANDBOX-001: 十二边界全映射且证据资产在场', () => {
  const report = sandboxBoundaryReport(REPO_ROOT);
  const failed = report.boundaries.filter((b) => !b.evidence.ok);
  assert.equal(failed.length, 0, failed.map((f) => `${f.boundary}: ${f.evidence.problem}`).join('; '));
  assert.equal(report.pass, true);
  assert.equal(report.boundaries.length, 12);
});

// ---------------------------------------------------------------------------
// EXP-OBS-001
// ---------------------------------------------------------------------------

test('EXP-OBS-001: 单位换算记录 + 缺失显式 + IQR 离群标记 + 重复列 + 报告完整', () => {
  const report = observationIntegrity({
    units: { pl_rade: 'R_JUPITER', pl_orbper: 'days' },
    expectedUnits: { pl_rade: 'R_EARTH', pl_orbper: 'days' },
    missingColumns: ['pl_rade'],
    values: {
      normal: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      spiky: [1, 2, 2, 3, 3, 3, 4, 100],
      dupA: [1, 2, 3],
      dupB: [1, 2, 3],
    },
    transformations: ['radius-to-earth-units'],
  });
  assert.deepEqual(report.unitConversions, [{ column: 'pl_rade', from: 'R_JUPITER', to: 'R_EARTH' }]);
  assert.deepEqual(report.missing, ['pl_rade']);
  assert.ok(report.outliers.some((o) => o.column === 'spiky' && o.count >= 1), 'IQR 检出离群');
  assert.ok(!report.outliers.some((o) => o.column === 'normal'), '正常列无离群');
  assert.equal(report.duplicateRows, 1, '重复值列对检出');
  assert.equal(report.ok, true, '报告完整（转换/缺失/离群/重复全显式——诚实记录不删数据）');
});
