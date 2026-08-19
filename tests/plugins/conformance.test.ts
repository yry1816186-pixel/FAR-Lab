// tests/plugins/conformance.test.ts
// conformance 套件端到端（OSS-PLUGIN-001 Acceptance 五类探针 + OSS-SDK-001
// clean-room 构建路径）——本文件即「示例代码进入 CI」的接线点。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runConformance, toPlainReport } from '../../src/plugins/conformance.ts';
import { definePlugin } from '../../src/plugins/sdk.ts';
import { canonicalJson } from '../../src/evidence_log/hasher.ts';
import { POSITIVE_ONLY_BASE_PLUGIN } from './fixtures/positive_only_base.ts';

const FIXTURE = POSITIVE_ONLY_BASE_PLUGIN;

test('SDK 示例插件（clean-room 路径构建）conformance 全绿 = REQ Acceptance 通过', () => {
  assert.ok(FIXTURE.ok, `definePlugin 必须成功: ${FIXTURE.ok ? '' : FIXTURE.issues.join('; ')}`);
  const report = runConformance(FIXTURE.manifest, { now: () => '2026-01-01T00:00:00.000Z' });
  const failed = report.checks.filter((c) => c.status === 'FAIL');
  assert.deepEqual(
    failed.map((c) => c.name),
    [],
    `conformance 有 FAIL 项: ${failed.map((c) => `${c.name} — ${c.detail}`).join(' | ')}`,
  );
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.pluginId, 'farlab.sample.positive-only-base');
  // 五类 Acceptance 探针（malicious×4 + permission + version + timeout + schema）+ 目标注册 = 9 项
  assert.equal(report.checks.length, 9);
  const names = report.checks.map((c) => c.name);
  for (const required of ['malicious:require', 'malicious:process', 'malicious:prototype-chain', 'malicious:fetch', 'permission-denial', 'version-mismatch', 'timeout', 'schema-output', 'target:register']) {
    assert.ok(names.includes(required), `缺探针 ${required}`);
  }
});

test('conformance 对恶意插件目标 = FAIL（target:register 必须红）', () => {
  const evil = { ...(FIXTURE.ok ? FIXTURE.manifest : {}), pluginSource: `function evaluate(i){ require('node:fs'); return {findings:[]}; }` };
  const report = runConformance(evil, { now: () => '2026-01-01T00:00:00.000Z' });
  const target = report.checks.find((c) => c.name === 'target:register');
  assert.ok(target?.status === 'FAIL');
  assert.equal(report.verdict, 'FAIL');
  assert.equal(report.pluginId, null);
});

test('toPlainReport canonical 稳定：同输入两次序列化字节相同（报告可锚定）', () => {
  assert.ok(FIXTURE.ok);
  const report = runConformance(FIXTURE.manifest, { now: () => '2026-01-01T00:00:00.000Z' });
  const a = canonicalJson(toPlainReport(report));
  const b = canonicalJson(toPlainReport(runConformance(FIXTURE.manifest, { now: () => '2026-01-01T00:00:00.000Z' })));
  assert.equal(a, b);
});

test('SDK definePlugin：草稿字段错误给出行内修复指引（第三方不猜格式）', () => {
  const bad = definePlugin({ id: 'not-valid', version: '1.0' });
  assert.ok(!bad.ok);
  assert.ok(bad.issues.some((i) => i.startsWith('id:')));
  assert.ok(bad.issues.some((i) => i.startsWith('version:')));
});

test('SDK definePlugin：contentHash 自动回填且与注册器口径一致', () => {
  assert.ok(FIXTURE.ok);
  // 注册（内部重算 contentHash 对账）成功 = definePlugin 填的哈希与注册器口径一致
  const report = runConformance(FIXTURE.manifest);
  assert.equal(report.checks.find((c) => c.name === 'target:register')?.status, 'PASS');
});
