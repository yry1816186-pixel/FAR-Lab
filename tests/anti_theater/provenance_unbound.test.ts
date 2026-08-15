// tests/anti_theater/provenance_unbound.test.ts
//
// T-003 · AT-PROVENANCE-UNBOUND detector 回归测试（2026-07-24 F-2-005 修复）。
//
// 反剧场最深的洞："系统无法区分真算出来的 metricValue 和编的 metricValue"。
// rawArtifactHashes 仅证明「有原始产物」（产物存在性），不证明「产物是这次执行产出的」
// （执行-产物绑定）。本 detector 填补此空白：fec.requireExecutionProvenance=true 时
// primary measurement 须携带 64-hex executionProvenanceHash。
//
// 测试覆盖：
//   1. V1 默认（requireExecutionProvenance 不设置/false）→ 恒空 finding（向后兼容）；
//   2. requireExecutionProvenance=true + primary 缺 hash → FAIL finding；
//   3. requireExecutionProvenance=true + primary 格式错 hash → FAIL finding；
//   4. requireExecutionProvenance=true + primary 合法 hash → 空 finding；
//   5. requireExecutionProvenance=true + 仅 secondary/control 缺 hash → 空 finding（不强制）；
//   6. 多 primary 部分缺 → 每个 primary 产独立 finding（findingIdSuffix=runId 区分）；
//   7. 集成 runAntiTheaterLint：base input（不 opt-in）→ 报告 hasFail=false（零回归）。
//
// Authority: T-003 + F-2-005 +
//            src/anti_theater/detectors/provenance_unbound.ts 行为契约注释。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detect_provenance_unbound } from '../../src/anti_theater/detectors/provenance_unbound.ts';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { makeCleanBaseInput } from '../fixtures/anti_theater/golden_vectors.ts';
import type { AntiTheaterLintInput } from '../../src/anti_theater/types.ts';

const HEX64 = 'a'.repeat(64);
const INVALID_HASH = 'not-a-hash';

/**
 * 递归把 readonly 修饰符剥为 mutable（仅类型层·运行时无变化）。
 * 镜像 tests/fixtures/anti_theater/golden_vectors.ts 的 Mutable（不导出·本测试局部复用同形）。
 * 仅用于夹具局部 mutation 构造（铁律 #10 不可变操作的反例豁免：夹具构造期允许局部 mutable）。
 *
 * 注：与 golden_vectors.ts 的 cloneMutable 同模式——运行时 structuredClone 产结构相同的值，
 * `as Mutable<T>` 仅在类型层放宽 readonly，不改变运行时形状。
 */
type Mutable<T> = T extends object
  ? { -readonly [K in keyof T]: Mutable<T[K]> }
  : T;

/** structuredClone 深拷贝 + as Mutable<T> 剥 readonly 供夹具局部 mutation（同 golden_vectors.ts 模式）。 */
function cloneMutable<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

/**
 * 构造 opt-in FEC（requireExecutionProvenance=true）的 lint input。
 * 镜像 makeCleanBaseInput 但显式 opt-in，并按需清除 primary measurement 的 executionProvenanceHash。
 */
function makeOptInInput(options?: {
  readonly clearPrimaryHash?: boolean;
  readonly setInvalidPrimaryHash?: boolean;
  readonly setValidPrimaryHash?: boolean;
  readonly clearSecondaryHash?: boolean;
}): AntiTheaterLintInput {
  const input = cloneMutable(makeCleanBaseInput());
  // 显式 opt-in
  input.fec.requireExecutionProvenance = true;

  const primary = input.executionTrace.measurements[0];
  if (primary !== undefined && primary.role === 'primary') {
    if (options?.clearPrimaryHash) {
      delete primary.executionProvenanceHash;
    } else if (options?.setInvalidPrimaryHash) {
      primary.executionProvenanceHash = INVALID_HASH;
    } else if (options?.setValidPrimaryHash) {
      primary.executionProvenanceHash = HEX64;
    }
  }

  // secondary/control 测试：清空 control measurement 的 hash（role='control'·不强制）
  if (options?.clearSecondaryHash) {
    const control = input.executionTrace.measurements[1];
    if (control !== undefined) {
      delete control.executionProvenanceHash;
    }
  }

  return input;
}

// ===== V1 默认不强制（向后兼容）=====

test('detect_provenance_unbound: fec.requireExecutionProvenance 未设置 → 返回 []（V1 默认·零回归）', () => {
  const input = makeCleanBaseInput(); // 不 opt-in
  const findings = detect_provenance_unbound(input);
  assert.equal(findings.length, 0);
});

test('detect_provenance_unbound: fec.requireExecutionProvenance=false → 返回 []（显式 false·零回归）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.requireExecutionProvenance = false;
  const findings = detect_provenance_unbound(input);
  assert.equal(findings.length, 0);
});

// ===== requireExecutionProvenance=true · primary 缺/格式错 hash =====

test('detect_provenance_unbound: opt-in + primary 缺 executionProvenanceHash → 1 FAIL finding（EVIDENCE_PROVENANCE_UNBOUND）', () => {
  const input = makeOptInInput({ clearPrimaryHash: true });
  const findings = detect_provenance_unbound(input);

  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding !== undefined);

  // stored 字段（进 proofHash）
  assert.equal(finding.stored.attackKind, 'execution-provenance-unbound');
  assert.equal(finding.stored.outcome, 'FAIL');
  assert.equal(finding.stored.hasFail, true);
  assert.match(finding.stored.findingId, /AT-PROVENANCE-UNBOUND/);
  assert.match(finding.stored.findingId, /run-001/);
  assert.match(finding.stored.evidenceRef, /runId=run-001/);
  assert.match(finding.stored.message, /executionProvenanceHash/);
  assert.match(finding.stored.message, /requireExecutionProvenance=true/);

  // ext 字段（派生展示）
  assert.equal(finding.ext.attackId, 'AT-PROVENANCE-UNBOUND');
  assert.equal(finding.ext.severity, 'FAIL');
  assert.equal(finding.ext.reasonCode, 'EVIDENCE_PROVENANCE_UNBOUND');
  assert.equal(finding.ext.deterministic, true);
  assert.ok(finding.ext.remediation !== undefined);
  assert.match(finding.ext.remediation!, /computeSandboxRunResult/);
  assert.ok(finding.ext.affectedProofHashInputs !== undefined);
  assert.ok(finding.ext.affectedProofHashInputs!.some((p) => p.includes('executionProvenanceHash')));
});

test('detect_provenance_unbound: opt-in + primary 格式错 hash → 1 FAIL finding', () => {
  const input = makeOptInInput({ setInvalidPrimaryHash: true });
  const findings = detect_provenance_unbound(input);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.stored.outcome, 'FAIL');
  assert.equal(findings[0]!.ext.reasonCode, 'EVIDENCE_PROVENANCE_UNBOUND');
});

// ===== requireExecutionProvenance=true · primary 合法 hash =====

test('detect_provenance_unbound: opt-in + primary 合法 64-hex hash → 返回 []（无误报）', () => {
  const input = makeOptInInput({ setValidPrimaryHash: true });
  const findings = detect_provenance_unbound(input);
  assert.equal(findings.length, 0, 'primary 合法 hash 不应触发 detector');
});

// ===== secondary/control 不强制 =====

test('detect_provenance_unbound: opt-in + primary 合法 + control 缺 hash → 返回 []（secondary/control 不强制）', () => {
  const input = makeOptInInput({
    setValidPrimaryHash: true,
    clearSecondaryHash: true,
  });
  const findings = detect_provenance_unbound(input);
  assert.equal(findings.length, 0, 'control measurement 缺 hash 不应触发（仅 primary 强制）');
});

// ===== 多 primary 部分缺 =====

test('detect_provenance_unbound: opt-in + 多 primary 部分缺 → 每个 primary 产独立 finding（findingIdSuffix=runId）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.requireExecutionProvenance = true;
  // 添加第二个 primary：第一个缺 hash，第二个有合法 hash
  const measurements = input.executionTrace.measurements;
  if (measurements[0] !== undefined) {
    delete measurements[0].executionProvenanceHash; // 第一个 primary 缺
  }
  measurements.push({
    requirementId: 'EV-PRIMARY-2',
    role: 'primary',
    rawArtifactHashes: ['sha256:primary-raw-artifact-002'],
    runId: 'run-primary-002',
    splitName: 'hidden',
    metricKey: 'bls_power',
    metricValue: 0.92,
    executionProvenanceHash: HEX64, // 第二个 primary 合法
  });

  const findings = detect_provenance_unbound(input);
  assert.equal(findings.length, 1, '仅第一个 primary 缺 hash → 1 finding');
  assert.match(findings[0]!.stored.findingId, /run-001$/);
  assert.match(findings[0]!.stored.evidenceRef, /runId=run-001/);
});

test('detect_provenance_unbound: opt-in + 多 primary 都缺 → 多 finding（每 primary 一条）', () => {
  const input = cloneMutable(makeCleanBaseInput());
  input.fec.requireExecutionProvenance = true;
  const measurements = input.executionTrace.measurements;
  if (measurements[0] !== undefined) {
    delete measurements[0].executionProvenanceHash;
  }
  measurements.push({
    requirementId: 'EV-PRIMARY-2',
    role: 'primary',
    rawArtifactHashes: ['sha256:primary-raw-artifact-002'],
    runId: 'run-primary-002',
    splitName: 'hidden',
    metricKey: 'bls_power',
    metricValue: 0.92,
    // 缺 executionProvenanceHash
  });

  const findings = detect_provenance_unbound(input);
  assert.equal(findings.length, 2, '两个 primary 都缺 → 2 findings');
  const runIds = findings.map((f) => f.stored.findingId);
  assert.ok(runIds.some((id) => id.includes('run-001')));
  assert.ok(runIds.some((id) => id.includes('run-primary-002')));
});

// ===== 集成 runAntiTheaterLint · 零回归（base 不 opt-in → 报告 hasFail=false）=====

test('runAntiTheaterLint 集成: base input 不 opt-in → AT-PROVENANCE-UNBOUND 不触发（零回归）', () => {
  const baseInput = makeCleanBaseInput(); // 不 opt-in
  const report = runAntiTheaterLint(baseInput);

  // base 须仍通过全部 detector（误报率=0 基准）
  assert.equal(
    report.hasFail,
    false,
    'base input 须通过全部 detector（含新增 AT-PROVENANCE-UNBOUND）·零回归',
  );

  // 验证 AT-PROVENANCE-UNBOUND 未产 finding
  const provenanceFindings = report.findings.filter(
    (f) => f.attackKind === 'execution-provenance-unbound',
  );
  assert.equal(provenanceFindings.length, 0);
});

test('runAntiTheaterLint 集成: opt-in + primary 缺 hash → 报告 hasFail=true + AT-PROVENANCE-UNBOUND finding', () => {
  const input = makeOptInInput({ clearPrimaryHash: true });
  const report = runAntiTheaterLint(input);

  assert.equal(report.hasFail, true, 'opt-in + primary 缺 hash 须产 FAIL');
  assert.ok(report.failCount >= 1);

  const provenanceFindings = report.findings.filter(
    (f) => f.attackKind === 'execution-provenance-unbound',
  );
  assert.ok(
    provenanceFindings.length >= 1,
    '须含至少 1 条 AT-PROVENANCE-UNBOUND finding',
  );
  assert.equal(provenanceFindings[0]!.outcome, 'FAIL');
});
