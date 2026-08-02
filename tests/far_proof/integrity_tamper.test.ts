/**
 * integrity_tamper.test.ts — DEF-17 验收：导出 bundle 含 integrity.json 全分量清单 +
 *   `far verify bundle`(bundle_verifier)机检全分量内容（非仅白名单存在性）。
 *
 * V-09 静默组闭合证据：此前篡改非白名单分量（ro-crate/prov.ttl/claim_graph/otel/
 * data_manifest/README/code-MANIFEST）内容 → tamperStatus:clean（白名单仅查存在性）。
 * DEF-17 接线后：exporter 写 integrity.json（全分量 sha256）+ bundle_verifier 校验 →
 *   任一分量内容变化 → INTEGRITY_FILE_MISMATCH → verify 红。
 *
 * 边界（诚实）：一致伪造（篡改分量 + 重算 integrity.json）仍绕过——属 DEF-18 外部锚定域。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  buildDemoChain,
  computeEnvHash,
  DEMO_GIT_COMMIT_SHA,
  DEMO_RUN_ID,
} from '../../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../../src/far_proof/index.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';

test('DEF-17: 导出 bundle 写 integrity.json + clean bundle 过 verify', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-def17-clean-'));
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const envHash = computeEnvHash({
      schemaVersion: 6,
      nodeVersion: process.version,
      providerProfile: 'offline_replay',
    });
    const outputDir = join(tmp, '.far-proof');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash,
      exportedAt: '2026-08-01T00:00:00.000Z',
    });
    const result = verifyFarProofBundle(outputDir, 'full');
    assert.equal(result.ok, true, `clean bundle 应过 verify: ${result.errors.join('; ')}`);
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('DEF-17: 篡改非白名单分量(prov.ttl)内容 → verify 检出 INTEGRITY_(V-09 静默组闭合)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-def17-tamper-'));
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const envHash = computeEnvHash({
      schemaVersion: 6,
      nodeVersion: process.version,
      providerProfile: 'offline_replay',
    });
    const outputDir = join(tmp, '.far-proof');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash,
      exportedAt: '2026-08-01T00:00:00.000Z',
    });
    // 篡改非白名单内容（prov.ttl 追加一行）—— V-09 此前 tamperStatus:clean
    const provPath = join(outputDir, 'prov.ttl');
    writeFileSync(provPath, readFileSync(provPath, 'utf8') + '\n# DEF-17 TAMPER INJECTION\n', 'utf8');
    const tampered = verifyFarProofBundle(outputDir, 'full');
    assert.equal(tampered.ok, false, 'prov.ttl 内容篡改须被 integrity.json 检出（DEF-17）');
    assert.ok(
      tampered.errors.some((e) => e.includes('INTEGRITY_')),
      `须报 INTEGRITY_ 错误: ${tampered.errors.join('; ')}`,
    );
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('DEF-17: 篡改 claim_graph.json 内容 → 同样检出（多分量覆盖·非单点）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-def17-cg-'));
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const envHash = computeEnvHash({
      schemaVersion: 6,
      nodeVersion: process.version,
      providerProfile: 'offline_replay',
    });
    const outputDir = join(tmp, '.far-proof');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash,
      exportedAt: '2026-08-01T00:00:00.000Z',
    });
    // 篡改 claim_graph.json（V-09 静默组另一分量：删全部边+伪造）
    const cgPath = join(outputDir, 'claim_graph.json');
    const cg = JSON.parse(readFileSync(cgPath, 'utf8')) as { edges?: unknown[] };
    cg.edges = [...(cg.edges ?? []), { tampered: true }];
    writeFileSync(cgPath, JSON.stringify(cg), 'utf8');
    const tampered = verifyFarProofBundle(outputDir, 'full');
    assert.equal(tampered.ok, false, 'claim_graph.json 篡改须检出（DEF-17 多分量覆盖）');
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
