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
