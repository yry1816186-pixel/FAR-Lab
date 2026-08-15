// tests/science_harness/exec_fingerprint.test.ts
//
// FUSION-OS-7 端到端 RED→GREEN：sandbox 采集 wall/cpu/peak_rss 三元组 → StatisticalResult.executionFingerprint
// 持久化 → 复算观测三元组与基线比对，任一维度量级差异>10x → R-execution-fingerprint DEGRADED_SCOPE
// （Open Science per-cell resource 三元组范式·非 bit-exact）。
//
// 单一真实依赖（CLAUDE.md §1）：
//   - 真实 decideFiveValueVerdict（verdict_kernel_v2.ts）→ R-execution-fingerprint 规则（R4 后·anti-theater-fail 前）。
//   - 真实 flagExecutionFingerprintMagnitudeMismatch（verdict_kernel_v2.ts）纯函数量级比对（max/min>10x）。
//   - 真实 spawnVenv（sandbox_runner.ts）→ Python time.process_time（CPU·跨平台）+ resource.getrusage（peak_rss·POSIX）
//     真实采集（非 Fake·真起 venv 子进程测真实 CPU/内存）。
//
// RED→GREEN 论证：
//   RED（接线前）：SandboxRunResult 无 cpuMs/peakRssKb；StatisticalResult 无 executionFingerprint；
//     VerdictKernelInput 无 executionFingerprintMismatch；R-execution-fingerprint 规则不存在 →
//     复算资源轮廓发散（60s→0.5s·4GB→1MB）静默通过，非复现结果仍可 CONFIRMED/REFUTED（theater）。
//   GREEN（接线后）：caller pre-compute flagExecutionFingerprintMagnitudeMismatch → executionFingerprintMismatch=true
//     → R-execution-fingerprint DEGRADED_SCOPE（复算不可复现·统计结论不可信）。
//
// 反剧场红线（FUSION-OS-7 + CLAUDE.md §5）：per-cell 资源指纹。声明做重算但复算秒级返回 → 不可信 → 降级。
//
// Authority: archived-plan §C FUSION-OS-7 +
//            archived-plan §4 FUSION-OS-7（per-cell 三元组范式）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideFiveValueVerdict,
  flagExecutionFingerprintMagnitudeMismatch,
} from '../../src/falsifiability/verdict_kernel_v2.ts';
import type {
  ExecutionFingerprint,
  VerdictKernelInput,
  StatisticalResult,
} from '../../src/falsifiability/verdict_kernel_v2.ts';
import { baseMetric, baseStatPlan, makeValidFec } from '../fec/fixtures.ts';
import type { FecContractV2 } from '../../src/fec/fec_contract.ts';
import { spawnVenv, executionFingerprintFromSandboxResult } from '../../src/science_harness/sandbox_runner.ts';
import type { SandboxResourceSpec } from '../../src/science_harness/types.ts';
import { delimiter, resolve } from 'node:path';
import { findPythonCommand } from '../_helpers/python.ts';

// buildKernelInput：GV-01 风格·默认落 CONFIRMED R7（对齐 form_mismatch.test.ts:baseKernelInput 范式）。
function buildKernelInput(): VerdictKernelInput {
  const fec: FecContractV2 = makeValidFec({
    fecId: 'FEC-OS-7',
    claimId: 'C-OS-7',
    measurableImplication: 'Model M achieves BLS power > baseline on dataset D',
    metric: { ...baseMetric(), metricKey: 'bls_power', description: 'BLS power', isDeterministic: false },
    statisticalPlan: {
      ...baseStatPlan(),
      primaryMetric: 'bls_power',
      alpha: 0.0125,
      effectDirection: 'greater',
      multipleTestingCorrection: 'bonferroni',
      nullHypothesis: 'effect <= 0',
      alternativeHypothesis: 'effect > 0',
    },
    direction: 'greater',
    threshold: { value: 0, unit: 'unitless', thresholdSemantics: 'gt', preregistered: true },
    powerPlan: {
      targetPower: 0.8,
      minimumDetectableEffect: 0.2,
      sampleSize: 120,
      powerMethod: 'ttest',
      alphaAssumed: 0.0125,
    },
  });

  const statistics: readonly StatisticalResult[] = [
    {
      testId: 'bls_power',
      status: 'ran',
      effectDirection: 'supports',
      pValue: 0.003,
      adjustedPValue: 0.003,
      effectSizeObserved: 0.62,
      confidenceInterval: [0.21, 0.95],
      assumptionDiagnostics: [],
    },
  ];

  return {
    fec,
    datasetBindings: [
      {
        datasetId: 'D1',
        contentHash: 'a'.repeat(64),
        sourceAnchor: { resolved: true },
        scopeCoverage: { dimension: 'population', value: 'adults 18-65 all sexes', relation: 'within' },
      },
    ],
    statistics,
    protocolDeviations: [],
    antiTheaterFindings: [],
    evidenceSufficiency: { status: 'sufficient', powerStatus: 'adequate' },
    contradictionSet: [],
    integrityFlags: [],
  };
}

// FUSION-OS-7 主证 A：纯函数 flagExecutionFingerprintMagnitudeMismatch——量级差异>10x 检出·0=未测量不误报。
test('flagExecutionFingerprintMagnitudeMismatch_pure_ratio: 量级差异>10x → true·相似/0 → false（FUSION-OS-7）', () => {
  const baseline: ExecutionFingerprint = { wallMs: 60_000, cpuMs: 50_000, peakRssKb: 4_000_000 };
  // 复算秒级返回（60s→0.5s·50s cpu→0.4s·4GB→1MB）——全维度 >10x → theater。
  const theater: ExecutionFingerprint = { wallMs: 500, cpuMs: 400, peakRssKb: 1_000 };
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(baseline, theater),
    true,
    'magnitude divergence >10x on all dims must flag',
  );

  // 相似（同一数量级）→ false（正常复算噪声）。
  const honest: ExecutionFingerprint = { wallMs: 58_000, cpuMs: 49_000, peakRssKb: 3_900_000 };
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(baseline, honest),
    false,
    'similar magnitude (<10x) must not flag',
  );

  // peak_rss=0（Windows 未测量）→ 该维度不可比，但 wall/cpu 仍可比；本例 wall/cpu 相似 → false。
  const windowsUnmeasured: ExecutionFingerprint = { wallMs: 59_000, cpuMs: 49_000, peakRssKb: 0 };
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(baseline, windowsUnmeasured),
    false,
    'unmeasured (0) dim must not flag when other dims are similar',
  );

  // 全 0（类型层 caller 未提供）→ 全不可比 → false（零回归·不误报）。
  const allUnmeasured: ExecutionFingerprint = { wallMs: 0, cpuMs: 0, peakRssKb: 0 };
  assert.equal(
    flagExecutionFingerprintMagnitudeMismatch(baseline, allUnmeasured),
    false,
    'all-zero observed must not flag (incomparable)',
  );
});

// FUSION-OS-7 主证 B（kernel 主证·§C 命名）：executionFingerprintMismatch=true → DEGRADED_SCOPE。
test('recompute_magnitude_mismatch_flagged: executionFingerprintMismatch → DEGRADED_SCOPE（FUSION-OS-7）', () => {
  const base = buildKernelInput();
  const output = decideFiveValueVerdict({ ...base, executionFingerprintMismatch: true });
  assert.equal(output.verdict, 'DEGRADED_SCOPE', 'execution fingerprint mismatch must degrade to DEGRADED_SCOPE');
  assert.equal(output.decisiveRuleId, 'R_EXECUTION_FINGERPRINT_MISMATCH');
  assert.deepEqual(output.reasonCodes, ['R_EXECUTION_FINGERPRINT_MISMATCH']);
  assert.equal(output.scopeReport.isDegraded, true);
  assert.ok(
    output.scopeReport.scopeSlipText !== null && output.scopeReport.scopeSlipText.includes('fingerprint'),
    'scopeSlipText must explain the reproducibility degradation (recordVerdict non-empty requirement)',
  );
});

// FUSION-OS-7 零回归：缺省 executionFingerprintMismatch（undefined）→ R0-R9 cascade 字节不变·仍 CONFIRMED。
test('executionFingerprintMismatch_absent_zero_regression: 无 flag → CONFIRMED（FUSION-OS-7 缺省零回归）', () => {
  const output = decideFiveValueVerdict(buildKernelInput());
  assert.equal(output.verdict, 'CONFIRMED', 'absent executionFingerprintMismatch → zero regression·R7 CONFIRMED');
  assert.equal(output.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
});

// FUSION-OS-7 优先级：mismatch preempt REFUTED（DEGRADED_SCOPE > REFUTED·非复现 refutation 不可信·反剧场）。
test('executionFingerprintMismatch_preempts_refuted: refute + mismatch → DEGRADED_SCOPE（FUSION-OS-7 优先级）', () => {
  const base = buildKernelInput();
  // 显式构造 refute 统计（不 spread base.statistics[0]——noUncheckedIndexedAccess 下它是 T|undefined，
  // spread 会丢 required testId/status/assumptionDiagnostics·exactOptionalPropertyTypes 报 TS2375）。
  const refutingStat: StatisticalResult = {
    testId: 'bls_power',
    status: 'ran',
    effectDirection: 'refutes',
    pValue: 0.003,
    adjustedPValue: 0.003,
    effectSizeObserved: 0.62,
    confidenceInterval: [0.21, 0.95],
    assumptionDiagnostics: [],
  };
  const output = decideFiveValueVerdict({
    ...base,
    statistics: [refutingStat],
    executionFingerprintMismatch: true,
  });
  assert.equal(
    output.verdict,
    'DEGRADED_SCOPE',
    'DEGRADED_SCOPE (priority > REFUTED): non-reproducible refutation is theater-suspect',
  );
  assert.equal(output.decisiveRuleId, 'R_EXECUTION_FINGERPRINT_MISMATCH');
});

// FUSION-OS-7 真采集：真 spawnVenv → SandboxRunResult.cpuMs/peakRssKb 真实非负（Python-gated）。
test('sandbox_collects_cpu_and_peak_rss: 真 venv 子进程采集 cpu/peak_rss（FUSION-OS-7 真采集·Python-gated）', async (t) => {
  if (findPythonCommand() === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const resources: SandboxResourceSpec = {
    cpu: { limitMillicores: 1000 },
    memory: { limitMb: 512 },
    timeoutMs: 15_000,
  };
  const prev = process.env.PYTHONPATH;
  process.env.PYTHONPATH = [resolve('repro'), resolve('.python-deps'), prev ?? ''].filter(Boolean).join(delimiter);
  try {
    // 真实 CPU 工作：累加循环（让 process_time 可测）。
    const result = await spawnVenv(
      {
        script: 's = sum(i*i for i in range(200000)); print(s)',
        seed: 42,
        timeoutMs: 10_000,
      },
      resources,
    );
    assert.equal(result.exitCode, 0, `sandbox must exit 0 (stderr: ${result.stderr})`);
    assert.ok(result.cpuMs >= 0, `cpuMs must be non-negative (got ${result.cpuMs})`);
    assert.ok(result.peakRssKb >= 0, `peakRssKb must be non-negative (got ${result.peakRssKb})`);
    // 执行指纹提取 helper 结构正确。
    const fp = executionFingerprintFromSandboxResult({
      exitCode: result.exitCode,
      stdoutHash: '',
      stderrHash: '',
      artifacts: result.artifacts,
      artifactTreeHash: '',
      wallClockMs: result.wallClockMs,
      timedOut: result.timedOut,
      outputLimitExceeded: result.outputLimitExceeded ?? false,
      networkBlocked: result.networkBlocked,
      seed: 42,
      singleThreaded: true,
      cpuMs: result.cpuMs,
      peakRssKb: result.peakRssKb,
    });
    assert.deepEqual(fp, {
      wallMs: result.wallClockMs,
      cpuMs: result.cpuMs,
      peakRssKb: result.peakRssKb,
    });
  } finally {
    if (prev === undefined) delete process.env.PYTHONPATH;
    else process.env.PYTHONPATH = prev;
  }
});
