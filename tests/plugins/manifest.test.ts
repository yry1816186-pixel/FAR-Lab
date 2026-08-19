// tests/plugins/manifest.test.ts
// manifest 契约判别测试：schema 拒绝面（未知字段/非法格式/越权声明）与
// 版本兼容语义（OSS-PLUGIN-001 manifest 字段清单的机器化验收）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PluginManifestSchema, reviewManifest, hostVersionInRange, PLUGIN_HOST_API_VERSION } from '../../src/plugins/manifest.ts';
import { POSITIVE_ONLY_BASE_PLUGIN } from './fixtures/positive_only_base.ts';

const BASE = () => {
  const r = POSITIVE_ONLY_BASE_PLUGIN;
  assert.ok(r.ok, `fixture must be valid: ${r.ok ? '' : r.issues.join('; ')}`);
  return JSON.parse(JSON.stringify(r.manifest)) as Record<string, unknown>;
};

test('合法 manifest（SDK 示例插件）通过 schema', () => {
  const parsed = PluginManifestSchema.safeParse(BASE());
  assert.ok(parsed.success, parsed.success ? '' : parsed.error.issues.map((i) => i.message).join('; '));
});

test('未知字段拒绝（strict——manifest 不得有声明面之外的通道）', () => {
  const m = BASE();
  (m as Record<string, unknown>).extraChannel = 'smuggle';
  assert.ok(!PluginManifestSchema.safeParse(m).success);
});

test('permissions 非空拒绝（V1 纯函数宿主零权限——REQ permission denial 的 schema 层）', () => {
  const m = BASE();
  m.permissions = ['read-evidence'];
  const r = reviewManifest(m);
  assert.ok(!r.ok && r.reason === 'SCHEMA_INVALID');
  assert.ok(r.errors.some((e) => e.includes('permissions')));
});

test('networkAccess 非 none 拒绝（声明网络即不兼容 V1 沙箱）', () => {
  const m = BASE();
  m.networkAccess = 'outbound-https';
  assert.ok(!PluginManifestSchema.safeParse(m).success);
});

test('id 必须反向域名式（≥3 段小写）', () => {
  for (const bad of ['Positive-Only', 'farlab.sample', 'x', 'farlab.sample.positive_only!']) {
    const m = BASE();
    m.id = bad;
    assert.ok(!PluginManifestSchema.safeParse(m).success, `id="${bad}" 应被拒绝`);
  }
});

test('version 必须 semver 三段；major 语义不缩小校验（重过检由 conformance 报告披露）', () => {
  const m = BASE();
  m.version = '1.0';
  assert.ok(!PluginManifestSchema.safeParse(m).success);
});

test('resourceLimits 超上限拒绝（maxDurationMs ≤10s / maxOutputBytes ≤1MiB）', () => {
  const m = BASE();
  m.resourceLimits = { maxDurationMs: 60_000, maxOutputBytes: 65536 };
  assert.ok(!PluginManifestSchema.safeParse(m).success);
});

test('goldenVectors 至少 1 条（SPEC 门槛 3：注册即有确定性锚）', () => {
  const m = BASE();
  m.goldenVectors = [];
  assert.ok(!PluginManifestSchema.safeParse(m).success);
});

test('reviewManifest: hostApi major 不符 = HOST_API_MISMATCH（未来 v2 宿主拒 v1 声明）', () => {
  const m = BASE();
  m.compatibility = { hostApi: 'far.plugin-host/v2', hostVersionRange: '^2.0.0' };
  const r = reviewManifest(m);
  assert.ok(!r.ok && r.reason === 'HOST_API_MISMATCH');
});

test('reviewManifest: 版本范围不含宿主 = HOST_VERSION_MISMATCH', () => {
  const m = BASE();
  m.compatibility = { hostApi: 'far.plugin-host/v1', hostVersionRange: '^0.9.0' };
  const r = reviewManifest(m);
  assert.ok(!r.ok && r.reason === 'HOST_VERSION_MISMATCH');
});

test('reviewManifest: 声明签名但校验失败 = SIGNED_BUT_INVALID（fail-closed 非 fail-open）', () => {
  const m = BASE();
  m.signature = { algorithm: 'ed25519', value: 'bm90LXZhbGlk' };
  const r = reviewManifest(m, { verifySignature: () => false });
  assert.ok(!r.ok && r.reason === 'SIGNED_BUT_INVALID');
});

test('hostVersionInRange: 精确匹配与 ^ 语义（同 major 且 ≥ 基线）', () => {
  const host = (PLUGIN_HOST_API_VERSION.split('/')[1] ?? '').replace(/^v/, '');
  const [major = 0, minor = 0] = host.split('.').map(Number);
  assert.ok(hostVersionInRange(host, host));
  assert.ok(hostVersionInRange(host, `^${major}.${Math.max(0, minor - 1)}.0`));
  assert.ok(!hostVersionInRange(host, `^${major + 1}.0.0`));
  assert.ok(!hostVersionInRange(host, `${major}.${minor + 1}.0`));
});
