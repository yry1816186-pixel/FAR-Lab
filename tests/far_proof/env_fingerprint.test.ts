// tests/far_proof/env_fingerprint.test.ts
//
// 环境指纹（评委07 Q3 mitigation）单元测试：计算 + 比对 + 漂移检测。
// 纯逻辑（不 IO bundle）——bundle 集成在 exporter/verifier 侧。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeEnvFingerprint,
  compareEnvFingerprint,
  ENV_FINGERPRINT_SCHEMA_VERSION,
} from '../../src/far_proof/env_fingerprint.ts';

test('computeEnvFingerprint: captures node/platform/arch + a stable sha256 hash', () => {
  const a = computeEnvFingerprint('2026-08-12T00:00:00.000Z');
  const b = computeEnvFingerprint('2026-08-12T00:00:00.000Z');
  assert.equal(a.schemaVersion, ENV_FINGERPRINT_SCHEMA_VERSION);
  assert.equal(a.node, process.version);
  assert.equal(a.platform, process.platform);
  assert.equal(a.arch, process.arch);
  assert.equal(a.fingerprintHash, b.fingerprintHash, 'same env (same capturedAt) → same hash');
  assert.match(a.fingerprintHash, /^[0-9a-f]{64}$/, 'sha256 hex');
});

test('fingerprintHash excludes capturedAt: time changes do NOT signal env drift', () => {
  const t0 = computeEnvFingerprint('2026-08-12T00:00:00.000Z');
  const t1 = computeEnvFingerprint('2026-12-31T23:59:59.000Z');
  assert.equal(t0.fingerprintHash, t1.fingerprintHash, 'different capturedAt, same env → identical hash');
  assert.equal(compareEnvFingerprint(t0, t1).match, true);
});

test('compareEnvFingerprint: same env → match; drifted node → mismatch with human-readable diff', () => {
  const current = computeEnvFingerprint();
  const recorded: typeof current = { ...current, node: 'v99.9.9' };
  const result = compareEnvFingerprint(recorded, current);
  assert.equal(result.match, false);
  assert.ok(result.differences.length === 1 && /node:.*v99\.9\.9.*vs.*current/.test(result.differences[0] ?? ''));
});

test('compareEnvFingerprint: drifted platform + python → both differences reported', () => {
  const current = computeEnvFingerprint();
  const recorded: typeof current = { ...current, platform: 'linux', python: '2.7.18' };
  // adjust fingerprintHash to match the recorded mutated env (so it's internally consistent)
  const result = compareEnvFingerprint(recorded, current);
  assert.equal(result.match, false);
  assert.ok(result.differences.some((d) => d.startsWith('platform:')));
  assert.ok(result.differences.some((d) => d.startsWith('python:')));
});
