// tests/platform/release_rollback_drill.test.ts
// REL-ROLLBACK-001：回滚路径清单绑定真实机制 + 三演练（撤销/迁移失败恢复/staging
// 降级）真实执行 + receipt 哈希。staging 目录 = .far/ 下临时目录（repo 卫生红线）。

import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ROLLBACK_PATHS,
  consumeManifestWithPolicy,
  runRollbackDrill,
  verifyRollbackPaths,
  type RollbackKind,
} from '../../src/release/rollback_drill.ts';
import { BUILD_MANIFEST_SCHEMA } from '../../src/release/build_manifest.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function makeStagingDir(): string {
  const farRoot = join(REPO_ROOT, '.far');
  mkdirSync(farRoot, { recursive: true });
  return mkdtempSync(join(farRoot, 'tmp-rollback-'));
}

test('REL-ROLLBACK-001 路径清单: 六类回滚路径各绑定真实机制资产', () => {
  const kinds: RollbackKind[] = ['code', 'data-schema', 'proof', 'model-config', 'docs', 'public-statement'];
  assert.deepEqual(
    [...ROLLBACK_PATHS.map((p) => p.kind)].sort(),
    [...kinds].sort(),
    '六类全覆盖',
  );
  for (const path of ROLLBACK_PATHS) {
    assert.ok(path.rollbackMechanism.length > 0, `${path.kind} mechanism empty`);
    assert.ok(path.precondition.length > 0, `${path.kind} precondition empty（不可逆操作安全桥）`);
    assert.ok(path.boundAssets.length >= 1, `${path.kind} no bound asset`);
    for (const asset of path.boundAssets) {
      assert.ok(asset.path !== null && asset.path.length > 0, `${path.kind} bound asset path null/empty`);
    }
  }
  // proof 路径绑定真实撤回状态机；schema 路径绑定 forward-only + VACUUM INTO
  const proofPath = ROLLBACK_PATHS.find((p) => p.kind === 'proof');
  assert.ok(proofPath?.boundAssets.some((a) => a.path === 'src/evidence_log/lifecycle.ts'));
  const schemaPath = ROLLBACK_PATHS.find((p) => p.kind === 'data-schema');
  assert.ok(schemaPath?.boundAssets.some((a) => a.path === 'src/cli/commands/backup.ts'));
  assert.ok(schemaPath?.rollbackMechanism.includes('VACUUM INTO') || schemaPath?.boundAssets.some((a) => a.mustContain?.includes('VACUUM INTO')));
});

test('REL-ROLLBACK-001 路径绑定验证: 真实仓库上全部 pass', () => {
  const { checks, pass } = verifyRollbackPaths(REPO_ROOT);
  assert.equal(pass, true, JSON.stringify(checks.filter((c) => !c.ok)));
  assert.equal(checks.length, 6);
});

test('REL-ROLLBACK-001 manifest 消费策略: 当前 schema 接受 / 未知 schema 显式拒绝（fail-closed）', () => {
  const ok = consumeManifestWithPolicy({ schema: BUILD_MANIFEST_SCHEMA }, BUILD_MANIFEST_SCHEMA);
  assert.equal(ok.accepted, true);
  for (const bad of ['far-build-manifest/0', 'far-build-manifest/2', '', 'SPDX-2.3']) {
    const rejected = consumeManifestWithPolicy({ schema: bad }, BUILD_MANIFEST_SCHEMA);
    assert.equal(rejected.accepted, false, `schema '${bad}' must be rejected`);
    assert.ok(rejected.reason.includes('UNSUPPORTED_BUILD_MANIFEST_SCHEMA'), rejected.reason);
  }
});

test('REL-ROLLBACK-001 演练: 撤销 REVOKED / 迁移失败恢复哈希一致 / staging 降级显式拒绝 → receipt', () => {
  const staging = makeStagingDir();
  try {
    const receipt = runRollbackDrill(REPO_ROOT, staging);
    assert.equal(receipt.pass, true, JSON.stringify(receipt.drills.map((d) => ({ n: d.name, e: d.evidence }))));
    assert.equal(receipt.drills.length, 3);
    assert.equal(receipt.pathsBound, true);

    const revocation = receipt.drills.find((d) => d.name === 'artifact-revocation');
    assert.ok(revocation?.pass);
    assert.ok(revocation.evidence.some((e) => e.includes('pre-revocation verify: OK')));
    assert.ok(revocation.evidence.some((e) => e.includes('post-revocation verify: REVOKED')));

    const migration = receipt.drills.find((d) => d.name === 'failed-migration-recovery');
    assert.ok(migration?.pass);
    assert.ok(migration.evidence.some((e) => e.includes('byte-identical to original=true')));

    const stagingRollback = receipt.drills.find((d) => d.name === 'staging-rollback');
    assert.ok(stagingRollback?.pass);
    assert.ok(stagingRollback.evidence.some((e) => e.includes('dispatches to v1')));
    assert.ok(stagingRollback.evidence.some((e) => e.includes('rejected explicitly=true')));

    // receipt 哈希形状 + 可复现（同输入重跑同 drills 结论）
    assert.match(receipt.receiptHash, /^[0-9a-f]{64}$/);
    const rerun = runRollbackDrill(REPO_ROOT, staging);
    assert.equal(rerun.pass, true);
    assert.equal(rerun.drills.length, receipt.drills.length);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
});
