/**
 * lint / constraint / score mutation 补杀（2026-08-20 批次 5）。
 *
 * 三文件全位点跑出 77.8% / 19.4% / 31.3% 存活——attack corpus 断言 forced/blockSeal
 * 命中，但编排器输出面（canSealConfirmed 三重条件、warnCount 统计、llmOverrideRejected）
 * 与「只降级」约束的边界（rank 相等/支持度上升/多 forced 取严顺序）未被锁定。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。断言全部精确值（非 includes 弱断言）。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { applyVerdictConstraint } from '../../src/anti_theater/constraint.ts';
import { computeAntiTheaterScore } from '../../src/anti_theater/score.ts';
import type { DetectorFinding } from '../../src/anti_theater/types.ts';
import {
  getGoldenVector,
  makeCleanBaseInput,
} from '../fixtures/anti_theater/golden_vectors.ts';

/** 手工构造最小 DetectorFinding（constraint/score 只读 attackId/outcome/severity/reasonCode）。 */
function finding(
  attackId: string,
  outcome: 'PASS' | 'FAIL' | 'WARN' | 'SKIP',
  severity: 'INFO' | 'WARN' | 'FAIL' | 'BLOCK',
  reasonCode?: string,
): DetectorFinding {
  return {
    stored: {
      findingId: `f-${attackId}`,
      attackKind: 'label-only-evidence',
      outcome,
      hasFail: outcome === 'FAIL',
      evidenceRef: 'e-1',
      message: `fixture ${attackId}`,
    },
    ext: {
      findingId: `f-${attackId}`,
      attackId,
      severity,
      deterministic: true,
      ...(reasonCode !== undefined ? { reasonCode } : {}),
    },
  };
}

function goldenVectorById(id: string) {
  const gv = getGoldenVector(id);
  assert.ok(gv !== undefined, `golden vector ${id} must exist`);
  return gv;
}

// ===== lint.ts：canSealConfirmed 三重条件 + warnCount + llmOverrideRejected =====

test('mutation 补杀: 干净 base → score=100 / canSealConfirmed=true / llmOverrideRejected=true', () => {
  const report = runAntiTheaterLint(makeCleanBaseInput());
  assert.equal(report.findings.length, 0, '干净 base 零 finding（误报率=0 基线）');
  assert.equal(report.antiTheaterScore, 100, '干净 base 满分');
  assert.equal(report.canSealConfirmed, true,
    '三重条件全过：score>=70 且无 BLOCK 且 forcedVerdict===undefined（=== 位点变异会误拒 seal）');
  assert.equal(report.llmOverrideRejected, true,
    'deterministic lint 恒拒 LLM override（true 位点变异即打破 F3 展示契约）');
  assert.equal(report.warnCount, 0);
  assert.equal(report.failCount, 0);
  assert.equal(report.hasFail, false, '干净 base hasFail=false（failCount > 0 位点——>=0 变异会恒 true）');
});

test('mutation 补杀: BLOCK 向量（AT-FAKE-PASS）→ canSealConfirmed=false（score 虽 >=70 仍拒 seal）', () => {
  const gv = goldenVectorById('gv-fake-pass-01');
  const report = runAntiTheaterLint(gv.build());
  assert.ok(report.verdictConstraint?.blockSeal === true, '前置：FAKE-PASS 产 BLOCK');
  assert.ok((report.antiTheaterScore ?? 0) >= 70, `前置：FAKE-PASS 只扣桶 2（score=${report.antiTheaterScore} 仍 >=70）`);
  assert.ok(report.failCount > 0 && report.hasFail === true, '前置：FAIL finding 在场（hasFail=true 侧）');
  assert.equal(report.canSealConfirmed, false,
    'BLOCK 必须否决 seal（score>=TH 与 !hasBlock 的 && 位点变异会让高 score BLOCK 报告误获 seal 权）');
});

test('mutation 补杀: BLOCK + current=REFUTED → forced 被只降级清空·canSeal 仍 false（hasBlock 独立否决）', () => {
  // 构造使第三重条件失效的输入：BLOCK → forced=UNTESTED，但 current=REFUTED 时
  // 只降级原则（1 >= 0）清空 forced → forcedVerdict===undefined——此时 hasBlock 是
  // canSeal 的唯一否决者（=== 'BLOCK' 位点变异会让它误 true）。
  const base = goldenVectorById('gv-fake-pass-01').build();
  const report = runAntiTheaterLint({ ...base, verdict: { ...base.verdict, verdict: 'REFUTED' as const } });
  assert.ok(report.verdictConstraint?.blockSeal === true, '前置：BLOCK finding 在场');
  assert.equal(report.verdictConstraint?.forcedVerdict, undefined,
    '前置：UNTESTED forced 对 REFUTED current 是支持度上升 → 被只降级原则清空');
  assert.equal(report.canSealConfirmed, false, 'hasBlock 必须独立否决 seal');
});

test('mutation 补杀: warnCount 与 findings 逐项重算一致（filter === WARN 位点）', () => {
  // AT-OVERFIT 向量产 1 条 WARN finding（实跑验证的唯一 WARN 向量族）：
  // 变异 filter 谓词后 report.warnCount 必偏离逐项重算值。
  const report = runAntiTheaterLint(goldenVectorById('gv-overfit-01').build());
  const recomputed = report.findings.filter((f) => f.outcome === 'WARN').length;
  assert.ok(recomputed >= 1, `前置：OVERFIT 向量至少 1 条 WARN（实际 ${recomputed}）`);
  assert.equal(report.warnCount, recomputed, 'warnCount 必须逐项等于 outcome===WARN 的 finding 数');
  assert.equal(report.failCount, report.findings.filter((f) => f.outcome === 'FAIL').length);
});

// ===== constraint.ts：只降级模型边界 =====

test('mutation 补杀: 多 forced 取严顺序（REFUTED 揭示优先于后到的 DEGRADED_SCOPE）', () => {
  // 有序 findings：先 REFUTATION_HIDDEN_BY_SCOPE（force REFUTED·D16 揭示），后 AT-DATA-DRIFT
  // （force DEGRADED_SCOPE）。最严者胜——&&→|| 变异会让后到的宽松 forced 覆盖 REFUTED。
  const out = applyVerdictConstraint(
    [
      finding('AT-SCOPE-LAUNDER', 'FAIL', 'FAIL', 'REFUTATION_HIDDEN_BY_SCOPE'),
      finding('AT-DATA-DRIFT', 'WARN', 'WARN'),
    ],
    'CONFIRMED',
  );
  assert.equal(out.forcedVerdict, 'REFUTED', '揭示的隐藏反证（rank 0）不得被后来的宽松 forced 覆盖');
});

test('mutation 补杀: 只降级——forced 支持度高于 current 时不约束（防升级）', () => {
  // AT-DATA-DRIFT → forced DEGRADED_SCOPE(3)；current=UNTESTED(1)：3 >= 1 → 支持度上升 → 不约束。
  // !==→=== 变异会跳过该检查，把 UNTESTED current 升级成 DEGRADED_SCOPE。
  const out = applyVerdictConstraint([finding('AT-DATA-DRIFT', 'WARN', 'WARN')], 'UNTESTED');
  assert.equal(out.forcedVerdict, undefined, 'anti-theater 只降级：UNTESTED 不得被升级为 DEGRADED_SCOPE');
});

test('mutation 补杀: rank 相等（forced=UNTESTED vs current=UNTESTED）不约束（>= 含等号）', () => {
  // AT-MISSING-RAW → forced UNTESTED(1)；current=UNTESTED(1)：1 >= 1 → 不约束。
  // >= → > 变异会把同值约束写回（forcedVerdict 从 undefined 变 'UNTESTED'）。
  const out = applyVerdictConstraint([finding('AT-MISSING-RAW', 'FAIL', 'FAIL')], 'UNTESTED');
  assert.equal(out.forcedVerdict, undefined, 'forced 与 current 支持度相等 → 无约束可施加');
});

test('mutation 补杀: reasonCodes 去重并集不含 undefined（code !== undefined && !seen 双守卫）', () => {
  // 混合 reasonCode 缺省与存在 + 重复 code：&&→|| 变异会把 undefined 也 push 进数组。
  const out = applyVerdictConstraint(
    [
      finding('AT-FAKE-PASS', 'FAIL', 'BLOCK'),
      finding('AT-HARK', 'FAIL', 'FAIL', 'HARKING_RISK'),
      finding('AT-METRIC-SWAP', 'FAIL', 'FAIL', 'HARKING_RISK'),
    ],
    'CONFIRMED',
  );
  assert.deepEqual(out.reasonCodes, ['HARKING_RISK'],
    '去重并集保序且无 undefined 元素（undefined finding 不得混入）');
});

// ===== score.ts：7 桶扣分边界 =====

test('mutation 补杀: 桶 3 hidden_failed_run 精确扣 15（reasonCode === HIDDEN_FAILED_RUN）', () => {
  const fec = makeCleanBaseInput().fec;
  const base = computeAntiTheaterScore([], fec);
  const withHidden = computeAntiTheaterScore(
    [finding('AT-SEED-CHERRY', 'FAIL', 'FAIL', 'HIDDEN_FAILED_RUN')],
    fec,
  );
  assert.equal(withHidden, base - 15, `桶 3 精确扣 15（base=${base}）`);
});

test('mutation 补杀: 桶 4 只扣 AT-DATA-DRIFT 的 WARN（FAIL 不扣·非 DRIFT 不扣）', () => {
  const fec = makeCleanBaseInput().fec;
  const base = computeAntiTheaterScore([], fec);
  // DRIFT + WARN → 扣 10（attackId === 与 outcome === 'WARN' 两个 === 位点任一变异都改变此值）。
  const driftWarn = computeAntiTheaterScore([finding('AT-DATA-DRIFT', 'WARN', 'WARN')], fec);
  assert.equal(driftWarn, base - 10, 'DRIFT WARN → 桶 4 扣 10');
  // DRIFT + FAIL → 不扣（伪代码：WARN 才是 weak_dataset_binding 信号；&&→|| 变异会误扣）。
  const driftFail = computeAntiTheaterScore([finding('AT-DATA-DRIFT', 'FAIL', 'FAIL')], fec);
  assert.equal(driftFail, base, 'DRIFT FAIL 不触发桶 4（扣分语义绑 WARN）');
});

test('mutation 补杀: 桶 6 无 negative control 精确扣 10', () => {
  // clean base FEC 带 negative control（base=100 已证）——去Requirements 构造无对照版本：
  // 直接替换 datasetRequirements 为空数组 → hasNegativeControl=false → 扣 10。
  const input = makeCleanBaseInput();
  const fecNoControl = { ...input.fec, datasetRequirements: [] };
  const score = computeAntiTheaterScore([], fecNoControl);
  assert.equal(score, 90, '无 negative control → 桶 6 精确扣 10');
});
