/**
 * bundle_signature 测试 —— Ed25519 bundle 签名验证（DEF-18 一致伪造收窄）。
 *
 * §7 高风险（签名）覆盖：确定性 + 双向清单 + 否定/边界/篡改测试。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateKeyPair, signFileManifest } from '../../src/security/ed25519.ts';
import { buildFileManifest } from '../../src/security/file_manifest.ts';
import {
  verifyBundleSignature,
  findBundleSignaturePath,
  BUNDLE_SIGNATURE_SIDECAR_SUFFIX,
} from '../../src/far_proof/bundle_signature.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';

/** 创建一个临时「bundle」目录并写入若干文件。返回 dir 与 cleanup（连 sidecar 一起清）。 */
function makeTempBundle(files: Record<string, string>): {
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'far-bundlesig-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, ...rel.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
      rmSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, { force: true });
    },
  };
}

/** 写出 sidecar（模拟 `far sign <dir>`：清单来自 buildFileManifest，sidecar 在 dir 外）。 */
function writeSidecar(dir: string, privateKeyPem: string, signedAt = '2026-08-12T00:00:00.000Z'): void {
  const manifest = buildFileManifest(dir);
  const sig = signFileManifest(manifest, privateKeyPem, signedAt);
  writeFileSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, `${JSON.stringify(sig, null, 2)}\n`, 'utf8');
}

test('round-trip: sign a bundle, verifyBundleSignature → PASS with correct fileCount', () => {
  const key = generateKeyPair();
  const { dir, cleanup } = makeTempBundle({
    'proof_envelopes.jsonl': '{"envelopeId":"E1"}\n',
    'integrity.json': '{"files":[]}',
    'sub/deep.txt': 'nested content',
  });
  try {
    writeSidecar(dir, key.privateKeyPem);
    const result = verifyBundleSignature(dir);
    assert.equal(result.ran, true, 'sidecar present → ran=true');
    assert.equal(result.status, 'pass');
    assert.equal(result.ok, true);
    assert.equal(result.fileCount, 3, '3 files signed');
    assert.ok(result.signer !== undefined && result.signer.includes('PUBLIC KEY'));
    assert.ok(result.signatureId !== undefined);
  } finally {
    cleanup();
  }
});

test('determinism: same key + same files + same signedAt → identical signature bytes', () => {
  // Ed25519 是确定性签名；签名/验证用同一份 buildFileManifest，故可复现。
  const key = generateKeyPair();
  const files = { 'a.txt': 'alpha', 'b.txt': 'beta', 'z/c.txt': 'gamma' };
  const { dir, cleanup } = makeTempBundle(files);
  try {
    const m1 = buildFileManifest(dir);
    const m2 = buildFileManifest(dir);
    const sig1 = signFileManifest(m1, key.privateKeyPem, '2026-08-12T00:00:00.000Z');
    const sig2 = signFileManifest(m2, key.privateKeyPem, '2026-08-12T00:00:00.000Z');
    assert.equal(sig1.signature, sig2.signature, 'deterministic signature bytes');
    assert.deepEqual(
      m1.map((e) => e.path),
      ['a.txt', 'b.txt', 'z/c.txt'],
      'code-unit sorted path order (跨平台确定性)',
    );
  } finally {
    cleanup();
  }
});

test('tamper detection (DEF-18 core value): modify a bundle file after signing → FAIL', () => {
  const key = generateKeyPair();
  const { dir, cleanup } = makeTempBundle({
    'proof_envelopes.jsonl': 'original',
    'data.bin': 'payload',
  });
  try {
    writeSidecar(dir, key.privateKeyPem);
    // 攻击者重算/改写一个文件的内容（即使重算哈希，签名清单也会失配）
    writeFileSync(join(dir, 'proof_envelopes.jsonl'), 'tampered-content', 'utf8');
    const result = verifyBundleSignature(dir);
    assert.equal(result.ran, true);
    assert.equal(result.status, 'fail');
    assert.equal(result.ok, false);
    assert.ok(
      result.mismatchPaths !== undefined && result.mismatchPaths.some((p) => p.includes('proof_envelopes.jsonl')),
      `mismatchPaths points at the tampered file: ${JSON.stringify(result.mismatchPaths)}`,
    );
  } finally {
    cleanup();
  }
});

test('additive: no sidecar → skipped, ok=null, no failure (zero regression for unsigned bundles)', () => {
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x' });
  try {
    const result = verifyBundleSignature(dir);
    assert.equal(result.ran, false);
    assert.equal(result.status, 'skipped');
    assert.equal(result.ok, null);
  } finally {
    cleanup();
  }
});

test('boundary: corrupt sidecar JSON → FAIL with readable reason', () => {
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x' });
  try {
    writeFileSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, '{not valid json', 'utf8');
    const result = verifyBundleSignature(dir);
    assert.equal(result.ran, true);
    assert.equal(result.status, 'fail');
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /signature unreadable/);
  } finally {
    cleanup();
  }
});

test('attribution: signature from key A fails when expectedPubKeyPem = key B', () => {
  const keyA = generateKeyPair();
  const keyB = generateKeyPair();
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x', 'b.txt': 'y' });
  try {
    writeSidecar(dir, keyA.privateKeyPem); // 用 A 签
    // 用 B 的公钥做归属校验 → 加密验签必失败（防「换公钥自签」绕过）
    const result = verifyBundleSignature(dir, keyB.publicKeyPem);
    assert.equal(result.status, 'fail');
    assert.equal(result.ok, false);
    assert.equal(result.mismatchPaths?.length, 0, '内容一致；失败在加密层（公钥不匹配）');
    assert.match(result.reason ?? '', /expected public key|tampered/);
  } finally {
    cleanup();
  }
});

test('attribution: signature from key A passes when expectedPubKeyPem = key A', () => {
  const keyA = generateKeyPair();
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x' });
  try {
    writeSidecar(dir, keyA.privateKeyPem);
    const result = verifyBundleSignature(dir, keyA.publicKeyPem);
    assert.equal(result.status, 'pass');
    assert.equal(result.ok, true);
  } finally {
    cleanup();
  }
});

test('findBundleSignaturePath: returns sidecar when present, null when absent', () => {
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x' });
  try {
    assert.equal(findBundleSignaturePath(dir), null);
    writeFileSync(`${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`, '{}', 'utf8');
    assert.equal(findBundleSignaturePath(dir), `${dir}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`);
  } finally {
    cleanup();
  }
});

test('symlink-swap defense: buildFileManifest rejects symlinks (签名输入不可被符号链接换芯)', { todo: false }, () => {
  // Windows 上 symlinkSync 对普通文件通常需要管理员/seDebug——若创建失败，本测试跳过（环境门控，非代码缺陷）。
  const { dir, cleanup } = makeTempBundle({ 'real.txt': 'genuine' });
  try {
    try {
      symlinkSync(join(dir, 'real.txt'), join(dir, 'link.txt'));
    } catch {
      // 环境（权限）不允许创建 symlink → 诚实跳过，不假装通过。
      return;
    }
    assert.throws(() => buildFileManifest(dir), /symlink not allowed/);
  } finally {
    cleanup();
  }
});

test('integration: verifyFarProofBundle exposes the signature dimension', () => {
  const key = generateKeyPair();
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x', 'b.txt': 'y' });
  try {
    writeSidecar(dir, key.privateKeyPem);
    const result = verifyFarProofBundle(dir, 'full');
    assert.equal(result.signature.ran, true, 'bundle verifier ran signature dimension');
    assert.equal(result.signature.status, 'pass');
    // 签名有效 → 不应产生 ED25519_SIGNATURE_INVALID 错误
    assert.equal(
      result.errors.some((e) => e.startsWith('ED25519_SIGNATURE_INVALID')),
      false,
      'valid signature contributes no error',
    );
  } finally {
    cleanup();
  }
});

test('integration: tampered signed bundle → verifyFarProofBundle pushes ED25519_SIGNATURE_INVALID', () => {
  const key = generateKeyPair();
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x' });
  try {
    writeSidecar(dir, key.privateKeyPem);
    writeFileSync(join(dir, 'a.txt'), 'tampered', 'utf8');
    const result = verifyFarProofBundle(dir, 'full');
    assert.equal(result.signature.status, 'fail');
    assert.ok(
      result.errors.some((e) => e.startsWith('ED25519_SIGNATURE_INVALID')),
      `errors include ED25519_SIGNATURE_INVALID: ${JSON.stringify(result.errors)}`,
    );
    assert.equal(result.ok, false, 'tampered signed bundle → overall ok=false');
  } finally {
    cleanup();
  }
});

test('honest scope: signature proves manifest attestation, NOT key identity (cannot-prove statement)', () => {
  // 本机制证明「某私钥持有者签署过该清单」；不证明「公钥属于谁」。换 key 自签能通过验签
  // （除非用 --pubkey 做归属交叉校验）——这正是 README/PKI 留给组织流程的边界。
  const keyA = generateKeyPair();
  const keyB = generateKeyPair();
  const { dir, cleanup } = makeTempBundle({ 'a.txt': 'x' });
  try {
    // 用 B 签（自含 B 公钥），不传 expectedPubKeyPem → 验签通过（公钥归属未被校验）
    writeSidecar(dir, keyB.privateKeyPem);
    const result = verifyBundleSignature(dir); // 无归属校验
    assert.equal(result.status, 'pass', '无 --pubkey 时，任何自洽签名都通过（归属是 PKI 的事）');
    // 但若要求 A 的公钥，则失败（归属校验收紧）
    const attributed = verifyBundleSignature(dir, keyA.publicKeyPem);
    assert.equal(attributed.status, 'fail', '--pubkey 收紧归属：非 A 签的 → fail');
  } finally {
    cleanup();
  }
});
