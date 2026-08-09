/**
 * ed25519 签名测试（阶段 7 P2 · TK10 签名落地回归载体）。
 *
 * 覆盖：
 *   1. 密钥对生成：PEM 格式（PKCS8/SPKI·可再解析）。
 *   2. sign → verify：正环 PASS。
 *   3. 篡改检测：单文件内容改 → mismatchPaths 命中（逐文件哈希核对）。
 *   4. 清单增减：多/少一个文件 → FAIL（清单不一致）。
 *   5. 外部公钥交叉验证 + 错误公钥 → FAIL。
 *   6. 确定性：同一清单两次签名 → canonical 相同（signature 随机但清单一致）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';

import {
  canonicalManifest,
  generateKeyPair,
  signFileManifest,
  verifyFileManifest,
  sha256Hex,
  type ManifestEntry,
} from '../../src/security/ed25519.ts';

const FIXED_AT = '2026-08-09T00:00:00.000Z';

function sampleManifest(): ManifestEntry[] {
  return [
    { path: 'b.json', sha256: sha256Hex(Buffer.from('{"b":2}')) },
    { path: 'a.txt', sha256: sha256Hex(Buffer.from('hello')) },
  ];
}

test('TK10: generateKeyPair produces re-parsable PEM keys', () => {
  const { privateKeyPem, publicKeyPem } = generateKeyPair();
  assert.match(privateKeyPem, /BEGIN PRIVATE KEY/, 'PKCS8 PEM');
  assert.match(publicKeyPem, /BEGIN PUBLIC KEY/, 'SPKI PEM');
  // 可再解析（createPrivateKey/createPublicKey 不抛）。
  assert.doesNotThrow(() => createPrivateKey(privateKeyPem), 'private PEM parseable');
  assert.doesNotThrow(() => createPublicKey(publicKeyPem), 'public PEM parseable');
});

test('TK10: sign → verify round-trip PASS with self-contained public key', () => {
  const { privateKeyPem } = generateKeyPair();
  const manifest = sampleManifest();
  const sig = signFileManifest(manifest, privateKeyPem, FIXED_AT);
  assert.equal(sig.algorithm, 'ed25519');
  assert.equal(sig.signedAt, FIXED_AT, 'injected timestamp');
  const result = verifyFileManifest(manifest, sig);
  assert.equal(result.ok, true, 'round-trip must PASS');
  assert.equal(result.mismatchPaths.length, 0);
});

test('TK10: tampered file content → FAIL with mismatched path', () => {
  const { privateKeyPem } = generateKeyPair();
  const manifest = sampleManifest();
  const sig = signFileManifest(manifest, privateKeyPem, FIXED_AT);
  // 篡改 a.txt：内容改 → 重算 hash 不同。
  const tampered = sampleManifest().map((e) =>
    e.path === 'a.txt'
      ? { path: e.path, sha256: sha256Hex(Buffer.from('tampered!')) }
      : e,
  );
  const result = verifyFileManifest(tampered, sig);
  assert.equal(result.ok, false, 'tamper must FAIL');
  assert.deepEqual(result.mismatchPaths, ['a.txt'], 'mismatch path must be identified');
});

test('TK10: manifest add/remove entry → FAIL (list inconsistency)', () => {
  const { privateKeyPem } = generateKeyPair();
  const manifest = sampleManifest();
  const sig = signFileManifest(manifest, privateKeyPem, FIXED_AT);
  const removed = manifest.filter((e) => e.path !== 'b.json');
  assert.equal(verifyFileManifest(removed, sig).ok, false, 'removed entry must FAIL');
  const added = [...manifest, { path: 'c.log', sha256: '0'.repeat(64) }];
  assert.equal(verifyFileManifest(added, sig).ok, false, 'added entry must FAIL');
});

test('TK10: external public key verifies; wrong public key FAILs', () => {
  const { privateKeyPem, publicKeyPem } = generateKeyPair();
  const other = generateKeyPair();
  const manifest = sampleManifest();
  const sig = signFileManifest(manifest, privateKeyPem, FIXED_AT);
  assert.equal(
    verifyFileManifest(manifest, sig, publicKeyPem).ok,
    true,
    'matching external public key PASS',
  );
  assert.equal(
    verifyFileManifest(manifest, sig, other.publicKeyPem).ok,
    false,
    'wrong public key FAIL',
  );
});

test('TK10: canonical manifest is deterministic (path-sorted, same content)', () => {
  const a = canonicalManifest(sampleManifest());
  const b = canonicalManifest([...sampleManifest()].reverse());
  assert.equal(a, b, 'canonical independent of input order');
  assert.ok(a.includes('"a.txt"') && a.indexOf('"a.txt"') < a.indexOf('"b.json"'), 'sorted by path');
});
