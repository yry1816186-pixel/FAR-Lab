// tests/gates/open_gate.test.ts
//
// GATE-OPEN-001 验收测试：开源发布门聚合——真实子门聚合、缺一项 FAIL、
// 全绿 fixture（真实仓库 + 真实签名 bundle）PASS、篡改 artifact → FAIL。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openReleaseGate } from '../../src/gates/open_gate.ts';
import { createSupplyBundle } from '../../src/release/supply_chain.ts';
import { generateKeyPair } from '../../src/security/ed25519.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 真实签名 artifact fixture（tmp 目录 + 真密钥 + 真 bundle）。 */
function makeSignedArtifacts(files: Record<string, string> = { 'release.tar.gz': 'payload-bytes' }): {
  artifactDir: string;
  bundle: ReturnType<typeof createSupplyBundle>;
  keyPair: ReturnType<typeof generateKeyPair>;
} {
  const artifactDir = mkdtempSync(join(tmpdir(), 'far-open-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(artifactDir, name), content, 'utf8');
  }
  const keyPair = generateKeyPair();
  const bundle = createSupplyBundle(artifactDir, { privateKeyPem: keyPair.privateKeyPem, signedAt: '2026-08-18T00:00:00.000Z' });
  return { artifactDir, bundle, keyPair };
}

test('all-green fixture: real repo + real signed bundle → PASS with all 8 sub-gates green', () => {
  const artifacts = makeSignedArtifacts();
  const report = openReleaseGate({ repoRoot: REPO_ROOT, supplyBundle: { artifactDir: artifacts.artifactDir, bundle: artifacts.bundle } });
  assert.deepEqual(
    report.subGates.map((g) => `${g.gate}:${g.pass ? 'PASS' : 'FAIL'}`),
    [
      'compliance:PASS',
      'legal-unknowns:PASS',
      'security-policy:PASS',
      'supply-chain:PASS',
      'reproducibility:PASS',
      'compat-rollback:PASS',
      'disclosure:PASS',
      'contributor-path:PASS',
    ],
    JSON.stringify(report.missing, null, 1),
  );
  assert.equal(report.pass, true);
  assert.deepEqual(report.missing, []);
});

test('missing signed bundle → supply-chain sub-gate FAILs the whole gate with explicit problem', () => {
  const report = openReleaseGate({ repoRoot: REPO_ROOT });
  assert.equal(report.pass, false);
  const supply = report.subGates.find((g) => g.gate === 'supply-chain');
  assert.equal(supply?.pass, false);
  assert.ok(supply?.problems.some((p) => p.includes('no signed supply bundle provided')));
  assert.equal(report.missing.length, 1);
});

test('tampered artifact after signing → supply-chain FAIL (TAMPERED surfaces in problems)', () => {
  const artifacts = makeSignedArtifacts();
  appendFileSync(join(artifacts.artifactDir, 'release.tar.gz'), 'extra-bytes-after-signing', 'utf8');
  const report = openReleaseGate({ repoRoot: REPO_ROOT, supplyBundle: { artifactDir: artifacts.artifactDir, bundle: artifacts.bundle } });
  assert.equal(report.pass, false);
  const supply = report.subGates.find((g) => g.gate === 'supply-chain');
  assert.equal(supply?.pass, false);
  assert.ok(supply?.problems.some((p) => p.includes('tampered')));
});

test('wrong signer identity → BAD_SIGNATURE fails the gate (trusted key mismatch)', () => {
  const artifacts = makeSignedArtifacts();
  const otherKey = generateKeyPair();
  const report = openReleaseGate({
    repoRoot: REPO_ROOT,
    supplyBundle: { artifactDir: artifacts.artifactDir, bundle: artifacts.bundle },
    trustedPublicKeyPem: otherKey.publicKeyPem,
  });
  assert.equal(report.pass, false);
  const supply = report.subGates.find((g) => g.gate === 'supply-chain');
  assert.ok(supply?.problems.some((p) => p.includes('signature verification failed') || p.includes('BAD_SIGNATURE')));
});

test('empty repo root → every asset-backed sub-gate FAILs and problems enumerate all gaps', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'far-empty-'));
  // 只放 CLI far.ts 会读失败——空根必然全红：验证聚合器不粉饰。
  const artifacts = makeSignedArtifacts();
  const report = openReleaseGate({ repoRoot: emptyRoot, supplyBundle: { artifactDir: artifacts.artifactDir, bundle: artifacts.bundle } });
  assert.equal(report.pass, false);
  const failed = report.subGates.filter((g) => !g.pass).map((g) => g.gate);
  // compliance/security-policy/reproducibility/compat-rollback/disclosure/contributor-path 必红。
  for (const expected of ['compliance', 'security-policy', 'reproducibility', 'compat-rollback', 'disclosure', 'contributor-path'] as const) {
    assert.ok(failed.includes(expected), `${expected} must fail on an empty repo`);
  }
  assert.ok(report.missing.length > 0);
});

test('legal-unknowns sub-gate delegates to verifyLegalUnknowns (mitigation binding is enforced upstream)', () => {
  // 真实仓库 LEGAL_UNKNOWNS 有 OPEN 项但都有缓解——子门应 PASS；
  // 缓解缺失的拒绝行为已由 release 模块自身测试覆盖（tests/platform/release_compliance.test.ts）。
  const artifacts = makeSignedArtifacts();
  const report = openReleaseGate({ repoRoot: REPO_ROOT, supplyBundle: { artifactDir: artifacts.artifactDir, bundle: artifacts.bundle } });
  const legal = report.subGates.find((g) => g.gate === 'legal-unknowns');
  assert.equal(legal?.pass, true);
});

test('sub-gate result object carries its constitutional coverage note (audit face)', () => {
  const report = openReleaseGate({ repoRoot: REPO_ROOT });
  for (const g of report.subGates) {
    assert.ok(g.covers.trim().length > 0, `${g.gate} must declare what it covers`);
  }
});
