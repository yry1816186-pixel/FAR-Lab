// tests/science_harness/thread_limit_attestation.test.ts
//
// 跨语言 SR-7 manifest 信任边界直测：parseThreadLimitAttestation 是 Python runner
// → TS 回执的单一解析口（不受信输入）。本文件锁定：
//   1. 每个 ThreadLimitReason 成员都必须被白名单接受（新 reason 漏登记 = 回退
//      manifest_missing_thread_limit_attestation —— 2026-08-17 macos CI 实证）；
//   2. bool/reason 配对矛盾 → fail-closed；
//   3. 未知 reason → fail-closed。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseThreadLimitAttestation } from '../../src/science_harness/sandbox_runner.ts';
import type { PythonSandboxManifest } from '../../src/science_harness/sandbox_runner.ts';

import type { ThreadLimitReason } from '../../src/science_harness/types.ts';

function manifest(overrides: Partial<PythonSandboxManifest>): PythonSandboxManifest {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    artifacts: [],
    wallClockMs: 1,
    networkBlocked: true,
    singleThreaded: false,
    threadLimitReason: 'not_attested',
    cpuMs: 0,
    peakRssKb: 0,
    ...overrides,
  } satisfies PythonSandboxManifest;
}

test('attestation: every singleThreaded=true reason is accepted with a true pair', () => {
  const trueReasons: ThreadLimitReason[] = ['threadpoolctl_verified', 'threadpoolctl_applied_no_supported_pools'];
  for (const reason of trueReasons) {
    const { singleThreaded, reason: parsed } = parseThreadLimitAttestation(manifest({ singleThreaded: true, threadLimitReason: reason }));
    assert.equal(singleThreaded, true, reason);
    assert.equal(parsed, reason);
  }
});

test('attestation: every singleThreaded=false reason is accepted with a false pair (incl. introspection gap)', () => {
  const falseReasons: ThreadLimitReason[] = [
    'threadpoolctl_unavailable',
    'threadpoolctl_setup_failed',
    'threadpoolctl_verification_failed',
    'threadpool_limit_not_one',
    'threadpool_introspection_gap',
    'execution_not_started',
    'execution_interrupted',
    'not_attested',
  ];
  for (const reason of falseReasons) {
    const { singleThreaded, reason: parsed } = parseThreadLimitAttestation(manifest({ singleThreaded: false, threadLimitReason: reason }));
    assert.equal(singleThreaded, false, reason);
    assert.equal(parsed, reason);
  }
});

test('attestation fail-closed: contradictory bool/reason pairs degrade to manifest-missing', () => {
  // true-class reason 声称 singleThreaded=false → 矛盾
  assert.deepEqual(
    parseThreadLimitAttestation(manifest({ singleThreaded: false, threadLimitReason: 'threadpoolctl_verified' })).reason,
    'manifest_missing_thread_limit_attestation',
  );
  // false-class reason 声称 singleThreaded=true → 矛盾
  assert.deepEqual(
    parseThreadLimitAttestation(manifest({ singleThreaded: true, threadLimitReason: 'threadpool_limit_not_one' })).reason,
    'manifest_missing_thread_limit_attestation',
  );
  assert.equal(
    parseThreadLimitAttestation(manifest({ singleThreaded: true, threadLimitReason: 'threadpool_introspection_gap' })).singleThreaded,
    false,
  );
});

test('attestation fail-closed: unknown reason from a future/foreign runner is rejected', () => {
  const foreign = parseThreadLimitAttestation(manifest({ singleThreaded: false, threadLimitReason: 'totally_new_reason_v9' as ThreadLimitReason }));
  assert.equal(foreign.singleThreaded, false);
  assert.equal(foreign.reason, 'manifest_missing_thread_limit_attestation');
});

test('attestation: whitelist coverage is complete against the ThreadLimitReason union', () => {
  // 类型层穷举：把联合的每个成员喂一遍，除了 manifest_missing_* 兜底成员本身，
  // 任何成员都不应落到兜底（防「加了类型漏了 parser」的再次发生）。
  const allReasons: ThreadLimitReason[] = [
    'threadpoolctl_verified',
    'threadpoolctl_applied_no_supported_pools',
    'threadpoolctl_unavailable',
    'threadpoolctl_setup_failed',
    'threadpoolctl_verification_failed',
    'threadpool_limit_not_one',
    'threadpool_introspection_gap',
    'manifest_missing_thread_limit_attestation',
    'execution_not_started',
    'execution_interrupted',
    'not_attested',
  ];
  for (const reason of allReasons) {
    if (reason === 'manifest_missing_thread_limit_attestation') continue;
    const pair = reason === 'threadpoolctl_verified' || reason === 'threadpoolctl_applied_no_supported_pools';
    const parsed = parseThreadLimitAttestation(manifest({ singleThreaded: pair, threadLimitReason: reason }));
    assert.equal(parsed.reason, reason, `parser whitelist is missing '${reason}' — register it in parseThreadLimitAttestation`);
  }
});
