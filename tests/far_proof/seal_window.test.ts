// tests/far_proof/seal_window.test.ts
//
// FUSION-OS-3 端到端 RED→GREEN：packageFarProofBundle seal 承诺点捕获内容快照 +
// archive 后重算比对，缩窄 harvest→archive 间 TOCTOU 窗口（Open Science sentinel 重导出在 tar 后范式）。
//
// 单一真实依赖（CLAUDE.md §1）：
//   - 真实 snapshotBundleContent（src/far_proof/offline_package.ts:snapshotBundleContent）
//     真实 readdirSync({withFileTypes}) 递归 + sha256File 逐文件哈希（非 Fake·真实 fs + crypto）。
//   - 真实 detectPostSealStaleness（offline_package.ts:detectPostSealStaleness）重算比对：新增/改/删 = stale。
//   - 真实 packageFarProofBundle（offline_package.ts:packageFarProofBundle）self-check 后捕获 sealSnapshot、
//     archive 后调 detectPostSealStaleness → !ok 抛错（非桩·真实 harvest→archive TOCTOU 窗口门）。
//   - 真实 exportFarProof（exporter.ts）产出真实 demo_chain bundle（buildDemoChain + 10 产物文件）。
//
// RED→GREEN 论证：
//   RED（接线前）：packageFarProofBundle 在 integrity.json 写入后直接 tar，harvest→archive 间无内容快照比对 →
//     并发进程可在 seal 后注入/改写 bundleDir 文件，tar 捕获篡改内容但 integrity.json 不感知 → 伪造窗口敞开。
//   GREEN（接线后）：sealSnapshot 在所有受控写入（verify.sh + integrity.json + self-check）后捕获；
//     archive 写入后重算比对，任一文件 sha256 变化/新增/删除 → POST_SEAL_CONTENT_CHANGE fail-closed 拒绝。
//
// 设计决策（why 内容哈希非 mtime 墙钟）：NTFS mtime 与 Date.now() 时钟源存在跨毫秒偏移（实测 mtimeMs 常超前
// 墙钟整数刻度），墙钟比较既误报受控写入（jitter）又漏报 backdated touch。内容比对确定性、无时钟依赖。
//
// 反剧场红线（FUSION-OS-3 + CLAUDE.md §5）：收窄伪造窗口。seal 后内容变更检出即拒绝，不静默放过。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-3 +
//            FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-3（sentinel 重导出范式）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { buildDemoChain, computeEnvHash, DEMO_GIT_COMMIT_SHA, DEMO_RUN_ID } from '../../src/far_proof/demo_chain.ts';
import { exportFarProof, packageFarProofBundle } from '../../src/far_proof/index.ts';
import {
  detectPostSealStaleness,
  snapshotBundleContent,
} from '../../src/far_proof/offline_package.ts';

// FUSION-OS-3 主证 A：seal 后修改文件内容 → detectPostSealStaleness 检出（确定性·内容比对）。
test('post_seal_modification_detected_as_stale: seal 后改内容 → stale（FUSION-OS-3）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-seal-mod-'));
  try {
    const fileA = join(dir, 'a.txt');
    const fileB = join(dir, 'b.txt');
    writeFileSync(fileA, 'a-original');
    writeFileSync(fileB, 'b-original');
    const baseline = snapshotBundleContent(dir);

    // 模拟 seal 后篡改：改 a.txt 内容（b.txt 不动）。
    writeFileSync(fileA, 'a-tampered-after-seal');

    const r = detectPostSealStaleness(dir, baseline);
    assert.equal(r.ok, false, 'post-seal content modification must be detected');
    assert.ok(r.staleFiles.includes('a.txt'), 'a.txt (modified) must be in staleFiles');
    assert.ok(!r.staleFiles.includes('b.txt'), 'b.txt (unchanged) must NOT be flagged');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// FUSION-OS-3 主证 B：seal 后新增文件 → detectPostSealStaleness 检出（注入防御）。
test('post_seal_new_file_detected_as_stale: seal 后注入新文件 → stale（FUSION-OS-3）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-seal-new-'));
  try {
    writeFileSync(join(dir, 'a.txt'), 'a');
    const baseline = snapshotBundleContent(dir);

    // 模拟 seal 后注入：写新文件。
    writeFileSync(join(dir, 'INJECTED.txt'), 'injected-after-seal');

    const r = detectPostSealStaleness(dir, baseline);
    assert.equal(r.ok, false, 'post-seal new file must be detected as stale');
    assert.ok(r.staleFiles.includes('INJECTED.txt'), 'INJECTED.txt must be flagged');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// FUSION-OS-3 clean 路径：seal 后无变更 → ok（零误报）。
test('post_seal_clean_bundle_ok: seal 后无变更 → ok（FUSION-OS-3 零误报）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-seal-clean-unit-'));
  try {
    writeFileSync(join(dir, 'x.txt'), 'x');
    writeFileSync(join(dir, 'y.txt'), 'y');
    const baseline = snapshotBundleContent(dir);
    const r = detectPostSealStaleness(dir, baseline);
    assert.equal(r.ok, true, 'unchanged bundle must pass');
    assert.equal(r.staleFiles.length, 0, 'no stale files expected');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// FUSION-OS-3 真实 bundle 端到端：exportFarProof 真实 bundle + seal 后改真实产物 → detectPostSealStaleness 检出。
test('real_bundle_toctou_detected: 真实 exportFarProof bundle + 改产物 → stale（FUSION-OS-3 端到端）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-seal-real-'));
  try {
    const { outputDir } = runExport(tmp);
    const baseline = snapshotBundleContent(outputDir);

    // 模拟 seal→archive 间 TOCTOU：改真实 bundle 产物 proof_envelopes.jsonl 的字节。
    const target = join(outputDir, 'proof_envelopes.jsonl');
    writeFileSync(target, 'TAMPERED-BY-CONCURRENT-PROCESS\n');

    const r = detectPostSealStaleness(outputDir, baseline);
    assert.equal(r.ok, false, 'real bundle post-seal tampering must be detected');
    assert.ok(
      r.staleFiles.includes('proof_envelopes.jsonl'),
      'tampered proof_envelopes.jsonl must be flagged',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// FUSION-OS-3 生产接线零回归：clean bundle → packageFarProofBundle 正常打包（无 stale 误报）。
test('packageFarProofBundle_clean_bundle_ok: clean bundle 正常打包（FUSION-OS-3 生产接线零回归）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-seal-wire-'));
  try {
    const { outputDir } = runExport(tmp);
    const packaged = packageFarProofBundle({
      bundleDir: outputDir,
      generatedAt: '2026-06-28T00:00:00.000Z',
    });
    assert.match(packaged.archiveSha256, /^[0-9a-f]{64}$/, 'clean bundle must package normally');
    assert.ok(packaged.fileCount > 0, 'clean bundle must have files');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function runExport(tmpDir: string): { readonly outputDir: string } {
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const envHash = computeEnvHash({
      schemaVersion: 6,
      nodeVersion: process.version,
      providerProfile: 'offline_replay',
    });
    const outputDir = join(tmpDir, '.far-proof');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash,
      exportedAt: '2026-06-28T00:00:00.000Z',
    });
    return { outputDir };
  } finally {
    db.close();
  }
}
