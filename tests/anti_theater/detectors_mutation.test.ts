/**
 * detectors mutation 补杀（2026-08-20 批次 6·抽样清零）。
 *
 * 抽样评估（4 detector）结果：scope_launder 原生 0%；phack_pcurve/fake_pass/dataset_drift
 * 各 1 存活。本文件补杀后两者；phack_pcurve 的 null-guard or→and 为登记等价
 * （null→0 数值转换恒落 [0.040, x) danger zone 之外——见 mutation_gate.mjs 登记）。
 *
 * 构造模式沿用 detector_branches_boost.test.ts 先例：clone clean base → 单点 mutation。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { detect_fake_pass } from '../../src/anti_theater/detectors/fake_pass.ts';
import { detect_dataset_drift } from '../../src/anti_theater/detectors/dataset_drift.ts';
import { makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';

type DeepMutable<T> = T extends object
  ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
  : T;

function cloneMutable<T extends object>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

test('mutation 补杀: fake_pass 空串 requirementId 不得 resolve 任何 required 条目（length > 0 守卫）', () => {
  // 构造：required=[{evidenceId: ''}]（非空清单）+ measurement.requirementId=''。
  // 原版：'' 因 length===0 被滤出 resolvedIds → missing=[''] → REQUIRED_EVIDENCE_MISSING；
  // 变异（>=0 恒真）：'' 入 set → has('') → missing 空 → 无 finding（漏报伪造 PASS）。
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.requiredEvidence = [{
    evidenceId: '',
    kind: 'measurement',
    critical: true,
    description: 'fixture empty-id requirement',
    verificationCheckId: 'VC-EMPTY-ID',
  }];
  input.executionTrace.measurements = [{
    requirementId: '',
    role: 'primary',
    rawArtifactHashes: ['sha256:fixture-empty'],
    runId: 'run-empty',
    metricKey: 'bls_power',
    metricValue: 0.5,
  }];
  const findings = detect_fake_pass(input);
  assert.ok(
    findings.some((f) => f.ext.reasonCode === 'REQUIRED_EVIDENCE_MISSING'),
    '空串 requirementId 不得 resolve required 条目（空串是缺失，不是匹配）',
  );
});

test('mutation 补杀: dataset_drift 空 statsFingerprint 视为未声明·不触发 STATS_MISMATCH（truthy 守卫）', () => {
  // 构造：binding.statsFingerprint=''（未声明）+ frozen.statsFingerprint 非空。
  // 原版：'' 守卫短路 → 无 DATASET_STATS_MISMATCH；变异（!== '' → === ''）会对空指纹误报漂移。
  const input = cloneMutable(makeCleanBaseInput());
  const dsBinding = input.bindings.find((b) => b.kind === 'dataset');
  assert.ok(dsBinding !== undefined, '前置：base 有 dataset binding');
  if ('statsFingerprint' in dsBinding) dsBinding.statsFingerprint = '';
  const findings = detect_dataset_drift(input);
  assert.ok(
    !findings.some((f) => f.ext.reasonCode === 'DATASET_STATS_MISMATCH'),
    '空 statsFingerprint（未声明）不得触发 STATS_MISMATCH（contentHash/schemaHash 同 frozen 无其他 finding）',
  );
  assert.ok(
    findings.every((f) => f.ext.reasonCode !== 'DATASET_HASH_MISMATCH' && f.ext.reasonCode !== 'DATASET_SCHEMA_MISMATCH'),
    '前置完整性：其余两层 hash 一致（本用例只动 statsFingerprint）',
  );
});

// ── 批次 7：effect_p_consistency / hark / label_only 补杀（抽样清零续）──

import { detect_effect_p_consistency } from '../../src/anti_theater/detectors/effect_p_consistency.ts';
import { detect_hark } from '../../src/anti_theater/detectors/hark.ts';
import { detect_label_only } from '../../src/anti_theater/detectors/label_only.ts';
import type { AntiTheaterLintInput } from '../../src/anti_theater/types.ts';

function statInput(overrides: {
  effectDirection?: 'greater' | 'less' | 'two_sided';
  effectiveDirection?: string;
  primaryP?: number | null;
  primaryEffectSize?: number | null;
  primaryCI?: readonly [number, number] | null;
}): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  if (overrides.effectDirection !== undefined) {
    input.fec.statisticalPlan.effectDirection = overrides.effectDirection;
  }
  Object.assign(input.verdict.statisticalReport, {
    ...(overrides.effectiveDirection !== undefined ? { effectiveDirection: overrides.effectiveDirection } : {}),
    ...(overrides.primaryP !== undefined ? { primaryAdjustedPValue: overrides.primaryP } : {}),
    ...(overrides.primaryEffectSize !== undefined ? { primaryEffectSize: overrides.primaryEffectSize } : {}),
    ...(overrides.primaryCI !== undefined ? { primaryConfidenceInterval: overrides.primaryCI } : {}),
  });
  return input;
}

test('mutation 补杀: effect_p 层1 CI 下界=0 边界（ci[0] > 0 严格不含等号）', () => {
  // ci=[0, 0.5]：原版 excludesNull=false（0 不算排除 null）；p 显著 → XOR 矛盾 → finding。
  // 变异 >=0 后 excludesNull=true === significant → 矛盾被掩盖。
  const findings = detect_effect_p_consistency(statInput({
    effectDirection: 'two_sided',
    primaryCI: [0, 0.5],
    primaryP: 0.001,
  }));
  assert.ok(findings.some((f) => f.ext.reasonCode === 'CI_P_INCONSISTENT'),
    'CI 下界恰为 0（不排除 null）+ p 显著 → 数学矛盾必须报');
});

test('mutation 补杀: effect_p 层1 CI 上界=0 边界（ci[1] < 0 严格不含等号）', () => {
  const findings = detect_effect_p_consistency(statInput({
    effectDirection: 'two_sided',
    primaryCI: [-0.5, 0],
    primaryP: 0.001,
  }));
  assert.ok(findings.some((f) => f.ext.reasonCode === 'CI_P_INCONSISTENT'),
    'CI 上界恰为 0（不排除 null）+ p 显著 → 数学矛盾必须报');
});

test('mutation 补杀: effect_p 层1 p 恰等 alpha−tol 边界（p < 严格不含等号）', () => {
  // p = alpha − 1e-9（base alpha=0.0125·精确命中）：原版 not significant；
  // CI 含 null → 无矛盾。变异 <= 后 significant → 对一致报告误报矛盾。
  const edge = 0.0125 - 1e-9;  // base alpha=0.0125（与 kernel 的 alpha - P_ALPHA_TOLERANCE 同一双精度运算）
  const findings = detect_effect_p_consistency(statInput({
    effectDirection: 'two_sided',
    primaryCI: [-1, 1],
    primaryP: edge,
  }));
  assert.ok(!findings.some((f) => f.ext.reasonCode === 'CI_P_INCONSISTENT'),
    `p === alpha − tol（${edge}）为非显著边界 → 与含 null CI 一致 → 不得报矛盾`);
});

test('mutation 补杀: effect_p 层2/3 supports 语义守卫（refutes 是合法反驳·不得按符号矛盾报）', () => {
  // 观测 refutes + 预注册 greater + effectSize<0 + CI 全负：科学上合法（假设被反驳）。
  // 层 2/3 入口的 &&→|| 变异会对该合法反驳误报 SIGN/DIRECTION 矛盾。
  const findings = detect_effect_p_consistency(statInput({
    effectDirection: 'greater',
    effectiveDirection: 'refutes',
    primaryEffectSize: -0.5,
    primaryCI: [-1, -0.5],
  }));
  assert.ok(findings.length === 0,
    'effectiveDirection=refutes 的反号观测是合法反驳，层 2/3 不得触发');
});

test('mutation 补杀: effect_p 层3 greater + CI 上界=0（ci[1] < 0 严格）→ 不报方向矛盾', () => {
  const findings = detect_effect_p_consistency(statInput({
    effectDirection: 'greater',
    effectiveDirection: 'supports',
    primaryEffectSize: 0.5,
    primaryCI: [-1, 0],
  }));
  assert.ok(findings.length === 0, 'CI 上界恰为 0 未整体落在相反区域 → 不报 DIRECTION_CI 矛盾');
});

test('mutation 补杀: effect_p 层3 less + CI 下界=0（ci[0] > 0 严格）→ 不报方向矛盾', () => {
  const findings = detect_effect_p_consistency(statInput({
    effectDirection: 'less',
    effectiveDirection: 'supports',
    primaryEffectSize: -0.5,
    primaryCI: [0, 1],
  }));
  assert.ok(findings.length === 0, 'CI 下界恰为 0 未整体落在相反区域 → 不报 DIRECTION_CI 矛盾');
});

test('mutation 补杀: hark 假设封存时刻 === 实验完成时刻（严格大于才触发）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.preregistrationRecord.hypothesisSealedAt = '2026-01-02T00:00:00Z';
  input.executionTrace.runs = [
    { runId: 'r1', endedAt: '2026-01-02T00:00:00Z', isInterim: false, earlyStopped: false, seed: 42 },
  ];
  const findings = detect_hark(input);
  assert.ok(findings.length === 0, 'seal === finish 是同时发生（合法）——严格 > 才是事后改假设');
});

test('mutation 补杀: hark 空串 endedAt 视为无完成时间（不得参与 max）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.preregistrationRecord.hypothesisSealedAt = '2026-01-02T00:00:00Z';
  input.executionTrace.runs = [
    { runId: 'r1', endedAt: '', isInterim: false, earlyStopped: false, seed: 42 },
  ];
  const findings = detect_hark(input);
  assert.ok(findings.length === 0,
    '全空 endedAt → 无完成时间基线 → 不触发（空串参与 max 会让任何 hypSealed 误判 HARKing）');
});

test('mutation 补杀: label_only 两路径 finding 均非 BLOCK（blockSeal: false 位点）', () => {
  // 路径 1：无 primary 测量。
  const noPrimary = cloneMutable(makeCleanBaseInput());
  noPrimary.executionTrace.measurements = [];
  for (const f of detect_label_only(noPrimary)) {
    assert.notEqual(f.ext.severity, 'BLOCK', 'label-only 是 FAIL 级非 BLOCK 级（blockSeal:false）');
  }
  // 路径 2：primary 测量 rawArtifactHashes 为空。
  const emptyRaw = cloneMutable(makeCleanBaseInput());
  const primary = emptyRaw.executionTrace.measurements.find((m) => m.role === 'primary');
  if (primary !== undefined) primary.rawArtifactHashes = [];
  const findings2 = detect_label_only(emptyRaw);
  assert.ok(findings2.length > 0, '前置：空 rawArtifactHashes 路径触发 finding');
  for (const f of findings2) {
    assert.notEqual(f.ext.severity, 'BLOCK', 'label-only 空 raw 路径同为 FAIL 非 BLOCK');
  }
});

// ── 批次 7 收尾：optional_stopping / overfit 补杀 ──

import { detect_optional_stopping } from '../../src/anti_theater/detectors/optional_stopping.ts';
import { detect_overfit } from '../../src/anti_theater/detectors/overfit.ts';

test('mutation 补杀: optional_stopping group_sequential 无 spending 须触发（=== 位点·kind 归类）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.statisticalPlan.stoppingRule = 'group_sequential design, no spending function declared';
  const findings = detect_optional_stopping(input);
  assert.ok(
    findings.some((f) => f.ext.reasonCode === 'OPTIONAL_STOPPING_NO_SPENDING'),
    'group_sequential 无 spending function → 必须触发（变异 !== 会漏报该类）',
  );
  // 同型第二分支：alpha_spending 无 spending 亦须触发（同行第二个 === 位点）。
  input.fec.statisticalPlan.stoppingRule = 'alpha_spending design, spending function not declared';
  const alphaSpending = detect_optional_stopping(input);
  assert.ok(
    alphaSpending.some((f) => f.ext.reasonCode === 'OPTIONAL_STOPPING_NO_SPENDING'),
    'alpha_spending 无 spending function → 必须触发（第二个 === 位点变异会漏报该类）',
  );
});

test('mutation 补杀: overfit splitName 缺省的 measurement 不得抛 TypeError（&& 守卫短路）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.executionTrace.measurements = [
    { requirementId: 'EV-1', role: 'primary', rawArtifactHashes: ['sha256:x'], runId: 'r1', metricKey: 'bls_power', metricValue: 0.5 },
  ];
  let findings: readonly { ext: { reasonCode?: string } }[] = [];
  assert.doesNotThrow(() => { findings = detect_overfit(input); },
    'splitName===undefined 须被守卫短路（&&→|| 变异会读 undefined.length 抛 TypeError）');
  assert.ok(!findings.some((f) => f.ext.reasonCode === 'PUBLIC_ONLY_OVERFIT'),
    '无 split 声明 → 无 public-only 判定依据 → 不报');
});

test('mutation 补杀: overfit hidden+public 双 split 是良好实践·不报 public-only（&& 位点）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.executionTrace.measurements = [
    { requirementId: 'EV-1', role: 'primary', rawArtifactHashes: ['sha256:x'], runId: 'r1', metricKey: 'bls_power', metricValue: 0.5, splitName: 'hidden' },
    { requirementId: 'EV-1', role: 'primary', rawArtifactHashes: ['sha256:y'], runId: 'r2', metricKey: 'bls_power', metricValue: 0.5, splitName: 'public' },
  ];
  const findings = detect_overfit(input);
  assert.ok(
    !findings.some((f) => f.ext.reasonCode === 'PUBLIC_ONLY_OVERFIT'),
    'hidden holdout 在场 → 非 public-only（&&→|| 变异会对双 split 误报）',
  );
});
