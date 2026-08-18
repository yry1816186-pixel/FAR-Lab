// tests/platform/release_supply_chain.test.ts
// REL-SUPPLY-001：SPDX SBOM / SHA256SUMS / Ed25519 签名 bundle / 错误身份与篡改
// 必须 FAIL / 撤销 REVOKED / SLSA-lite provenance / 验证指引。真实 repo + .far 临时目录。

import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createSupplyBundle,
  generateChecksumsManifest,
  generateSbom,
  newSignerKeyPair,
  parseLockfilePackages,
  renderVerificationInstructions,
  revokeArtifact,
  slsaProvenanceLite,
  verifySupplyBundle,
} from '../../src/release/supply_chain.ts';
import { generateBuildManifest } from '../../src/release/build_manifest.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** 临时目录工厂：运行产物根 = .far/（gitignored——repo 卫生门红线）。 */
function makeTempDir(prefix: string): string {
  const farRoot = join(REPO_ROOT, '.far');
  mkdirSync(farRoot, { recursive: true });
  return mkdtempSync(join(farRoot, prefix));
}

test('REL-SUPPLY-001 SBOM: SPDX-2.3-lite 从 package.json+lockfile 真实解析', () => {
  const sbom = generateSbom(REPO_ROOT, { created: '2026-08-17T00:00:00.000Z' });
  assert.equal(sbom.spdxVersion, 'SPDX-2.3');
  assert.equal(sbom.dataLicense, 'CC0-1.0');
  assert.equal(sbom.SPDXID, 'SPDXRef-Document');
  const root = sbom.packages[0];
  assert.equal(root?.name, 'far-lab');
  assert.equal(root?.SPDXID, 'SPDXRef-Package-Root');
  assert.equal(root?.licenseConcluded, 'MIT');
  assert.ok(sbom.packages.length >= 100, `lockfile packages parsed: ${sbom.packages.length}`);
  // 传递依赖 license 诚实 = NOASSERTION（lockfile 不携带 license——不臆造）
  const deps = sbom.packages.slice(1);
  assert.ok(deps.every((p) => p.licenseDeclared === 'NOASSERTION'));
  // 根输入三文件 checksum
  assert.equal(sbom.checksums.length, 3);
  for (const c of sbom.checksums) {
    assert.match(c.checksumValue, /^[0-9a-f]{64}$/);
  }
  // 确定性：created 不进 sbomHash
  const again = generateSbom(REPO_ROOT, { created: '2026-08-19T00:00:00.000Z' });
  assert.equal(sbom.sbomHash, again.sbomHash);
  assert.match(sbom.documentNamespace, /^https:\/\/farlab\.dev\/spdx\/far-lab\//);
});

test('REL-SUPPLY-001 lockfile 解析: scoped 包 name/version 切分正确（last-@ 切分）', () => {
  const lockText = [
    'lockfileVersion: 9.0',
    '',
    'packages:',
    "  '@fastify/cors@11.2.0':",
    '    resolution:',
    '  abort-controller@3.0.0:',
    'snapshots:',
    '  other:',
  ].join('\n');
  const parsed = parseLockfilePackages(lockText);
  assert.deepEqual([...parsed], [
    { name: '@fastify/cors', version: '11.2.0' },
    { name: 'abort-controller', version: '3.0.0' },
  ]);
  // 真实 lockfile 交叉抽验
  const real = parseLockfilePackages(readFileSync(join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8'));
  const cors = real.find((p) => p.name === '@fastify/cors');
  assert.ok(cors !== undefined, '@fastify/cors in real lockfile');
  assert.match(cors.version, /^\d+\.\d+\.\d+/, `version not mangled: ${cors.version}`);
  assert.ok(real.some((p) => p.name === 'zod'), 'zod in lockfile');
});

test('REL-SUPPLY-001 SHA256SUMS: 格式 + 排序确定性 + 逐文件哈希真实', () => {
  const dir = makeTempDir('tmp-sums-');
  try {
    writeFileSync(join(dir, 'b.txt'), 'bravo');
    writeFileSync(join(dir, 'a.txt'), 'alpha');
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'c.bin'), Buffer.from([0, 1, 2]));
    const { text, entries } = generateChecksumsManifest(dir);
    assert.deepEqual([...entries.map((e) => e.path)], ['a.txt', 'b.txt', 'sub/c.bin']);
    for (const line of text.trim().split('\n')) {
      assert.match(line, /^[0-9a-f]{64}  \S+$/, 'GNU sha256sum 行格式');
    }
    assert.ok(text.includes('  a.txt\n'), '行分隔完整');
    const again = generateChecksumsManifest(dir);
    assert.equal(text, again.text, '字节确定性（排序固定）');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REL-SUPPLY-001 bundle: 验签 OK / 错误身份 BAD_SIGNATURE / 篡改 TAMPERED / 删文件 MISSING_FILE / 撤销 REVOKED', () => {
  const dir = makeTempDir('tmp-bundle-');
  try {
    writeFileSync(join(dir, 'trust-receipt.json'), '{"kind":"receipt","v":1}');
    writeFileSync(join(dir, 'verdicts.jsonl'), '{"verdict":"REFUTED"}\n');
    const signer = newSignerKeyPair();
    const wrongIdentity = newSignerKeyPair();
    const bundle = createSupplyBundle(dir, { privateKeyPem: signer.privateKeyPem });
    assert.equal(bundle.signature.algorithm, 'ed25519');
    assert.equal(bundle.signature.manifest.length, 2);

    // 1. 自含公钥验证 OK（独立重算逐文件哈希——不信任内嵌值）
    const ok = verifySupplyBundle(dir, bundle);
    assert.equal(ok.status, 'OK', ok.problems.join('; '));
    assert.equal(ok.ok, true);

    // 2. 错误身份：换外部信任公钥 → BAD_SIGNATURE（必须失败）
    const wrongKey = verifySupplyBundle(dir, bundle, { trustedPublicKeyPem: wrongIdentity.publicKeyPem });
    assert.equal(wrongKey.ok, false, '错误身份必须 FAIL');
    assert.equal(wrongKey.status, 'BAD_SIGNATURE');

    // 3. 篡改：改一字节 → TAMPERED（必须失败）
    const original = readFileSync(join(dir, 'verdicts.jsonl'));
    writeFileSync(join(dir, 'verdicts.jsonl'), original.toString('utf8').replace('REFUTED', 'REFUTEE'));
    const tampered = verifySupplyBundle(dir, bundle);
    assert.equal(tampered.ok, false, '篡改必须 FAIL');
    assert.equal(tampered.status, 'TAMPERED');
    assert.ok(tampered.problems.some((p) => p.includes('verdicts.jsonl')));
    writeFileSync(join(dir, 'verdicts.jsonl'), original);

    // 4. 删文件 → MISSING_FILE（必须失败——删文件逃逸与篡改同罪）
    rmSync(join(dir, 'verdicts.jsonl'));
    const missing = verifySupplyBundle(dir, bundle);
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 'MISSING_FILE');
    writeFileSync(join(dir, 'verdicts.jsonl'), original);

    // 5. 撤销：签名完好但 artifact 被撤销 → REVOKED（必须失败）
    const revokedBundle = revokeArtifact(bundle, 'trust-receipt.json');
    assert.equal(bundle.revoked.length, 0, '原 bundle 不可变（撤销返回新对象）');
    const revoked = verifySupplyBundle(dir, revokedBundle);
    assert.equal(revoked.ok, false, '撤销必须 FAIL');
    assert.equal(revoked.status, 'REVOKED');
    assert.deepEqual([...revoked.revokedHits], ['trust-receipt.json']);
    // 幂等：重复撤销同名不重复
    assert.equal(revokeArtifact(revokedBundle, 'trust-receipt.json').revoked.length, 1);

    // 6. 空目录 → EMPTY
    const emptyDir = join(dir, 'empty');
    mkdirSync(emptyDir);
    assert.equal(verifySupplyBundle(emptyDir, bundle).status, 'EMPTY');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REL-SUPPLY-001 SLSA-lite provenance + 人类可读验证指引', () => {
  const manifest = generateBuildManifest(REPO_ROOT, { rootInputsOnly: true });
  const sbom = generateSbom(REPO_ROOT);
  const provenance = slsaProvenanceLite(manifest, sbom);
  assert.equal(provenance.schema, 'slsa-lite/1');
  assert.equal(provenance.buildManifestHash, manifest.manifestHash);
  assert.equal(provenance.sbomHash, sbom.sbomHash);
  assert.ok(provenance.cannotProve.length >= 1, '边界声明内嵌');

  const signer = newSignerKeyPair();
  const dir = makeTempDir('tmp-instr-');
  try {
    writeFileSync(join(dir, 'a.txt'), 'x');
    const bundle = createSupplyBundle(dir, { privateKeyPem: signer.privateKeyPem });
    const text = renderVerificationInstructions(bundle, provenance);
    assert.ok(text.includes('verification instructions'));
    assert.ok(text.includes(bundle.signature.signatureId));
    assert.ok(/5\. Cross-check provenance/.test(text), 'provenance 交叉核对步骤');
    assert.ok(/6\./.test(text), '失步升级指引');
    assert.ok(text.toLowerCase().includes('revocation'));
    // 未撤销 bundle 的名单渲染为 empty
    assert.ok(text.includes('[empty]'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
