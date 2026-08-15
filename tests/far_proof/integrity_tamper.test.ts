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
import { verifyFarProofPackageIntegrity } from '../../src/far_proof/offline_package.ts';

/** 导出一个 clean demo bundle 到 tmp/.far-proof，返回 outputDir（db 在导出后关闭）。 */
function exportDemoBundle(tmp: string): string {
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
    return outputDir;
  } finally {
    db.close();
  }
}

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

test('DEF-17: integrity.json 损坏(不可解析) → INTEGRITY_UNREADABLE（此前未测错误路径）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-def17-unread-'));
  try {
    const outputDir = exportDemoBundle(tmp);
    // 损坏 integrity.json 为非法 JSON → parseIntegrity 抛错 → INTEGRITY_UNREADABLE
    writeFileSync(join(outputDir, 'integrity.json'), '{ not valid json }}}', 'utf8');
    const result = verifyFarProofBundle(outputDir, 'full');
    assert.equal(result.ok, false, '损坏的 integrity.json 须导致 verify 红');
    assert.ok(
      result.errors.some((e) => e.includes('INTEGRITY_UNREADABLE')),
      `须报 INTEGRITY_UNREADABLE: ${result.errors.join('; ')}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('DEF-17: 清单文件被删 → INTEGRITY_MISSING_FILE（分量缺失检测）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-def17-missing-'));
  try {
    const outputDir = exportDemoBundle(tmp);
    // 删除一个 integrity.json 清单中追踪的分量 → 内容存在性检测须检出
    rmSync(join(outputDir, 'ro-crate-metadata.json'));
    const result = verifyFarProofBundle(outputDir, 'full');
    assert.equal(result.ok, false, '清单追踪的分量被删须导致 verify 红');
    assert.ok(
      result.errors.some((e) => e.includes('INTEGRITY_MISSING_FILE') || e.includes('MISSING_REQUIRED_FILE')),
      `须报 INTEGRITY_MISSING_FILE 或 MISSING_REQUIRED_FILE: ${result.errors.join('; ')}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('DEF-17: bundle 含清单外多余文件 → INTEGRITY_UNEXPECTED_FILE（注入检测）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-def17-unexpected-'));
  try {
    const outputDir = exportDemoBundle(tmp);
    // 注入一个 integrity.json 清单未追踪的文件 → 须检出（防悄悄追加分量）
    writeFileSync(join(outputDir, 'injected-payload.json'), '{"evil": true}', 'utf8');
    const result = verifyFarProofPackageIntegrity(outputDir);
    assert.equal(result.ok, false, '清单外多余文件须被直接 integrity 校验检出');
    assert.ok(
      result.errors.some((e) => e.includes('INTEGRITY_UNEXPECTED_FILE')),
      `须报 INTEGRITY_UNEXPECTED_FILE: ${result.errors.join('; ')}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('DEF-17: 无 integrity.json → verifyFarProofPackageIntegrity 早返 MISSING_INTEGRITY_FILE（additive 边界）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-def17-nomanifest-'));
  try {
    const outputDir = exportDemoBundle(tmp);
    // 删 integrity.json 后直接调 verifyFarProofPackageIntegrity → 早返 MISSING_INTEGRITY_FILE
    rmSync(join(outputDir, 'integrity.json'));
    const direct = verifyFarProofPackageIntegrity(outputDir);
    assert.equal(direct.ok, false, '无 integrity.json 直接校验须红');
    assert.ok(
      direct.errors.some((e) => e.includes('MISSING_INTEGRITY_FILE')),
      `须报 MISSING_INTEGRITY_FILE: ${direct.errors.join('; ')}`,
    );
    // 边界：bundle_verifier 的 additive 设计——无 integrity.json 时跳过全分量校验（不回归），
    // 仅失全分量内容校验。即 verify 仍可过（白名单 + 链 + envelope 校验独立运行）。
    // 重导出（重新生成 integrity.json）以测 additive 路径：
    const outputDir2 = exportDemoBundle(tmp + '-2');
    rmSync(join(outputDir2, 'integrity.json'));
    const viaBundle = verifyFarProofBundle(outputDir2, 'full');
    assert.equal(viaBundle.ok, true, '无 integrity.json 时 bundle_verifier additive 跳过全分量校验（不回归）');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(tmp + '-2', { recursive: true, force: true });
  }
});

test('DEF-17: 聚合 integrity 错误 — HASH_MISMATCH(内容篡改) + FILE_COUNT_MISMATCH(文件数变)·此前未测', () => {
  // 聚合校验与逐文件校验同发(additive)：内容篡改→逐文件 MISMATCH + 聚合 HASH_MISMATCH；
  // 加/删文件→逐文件 UNEXPECTED/MISSING + 聚合 FILE_COUNT_MISMATCH。此前测仅断言逐文件码。
  const tmp1 = mkdtempSync(join(tmpdir(), 'far-def17-hash-'));
  const tmp2 = mkdtempSync(join(tmpdir(), 'far-def17-count-'));
  try {
    // 内容篡改 → 聚合 integrityHash(全文件 sha256 派生)变 → INTEGRITY_HASH_MISMATCH
    const out1 = exportDemoBundle(tmp1);
    const prov1 = join(out1, 'prov.ttl');
    writeFileSync(prov1, readFileSync(prov1, 'utf8') + '\n# AGG HASH TAMPER\n', 'utf8');
    const r1 = verifyFarProofPackageIntegrity(out1);
    assert.ok(
      r1.errors.some((e) => e.includes('INTEGRITY_HASH_MISMATCH')),
      `内容篡改须报聚合 INTEGRITY_HASH_MISMATCH: ${r1.errors.join('; ')}`,
    );

    // 加文件 → fileCount 变 → INTEGRITY_FILE_COUNT_MISMATCH
    const out2 = exportDemoBundle(tmp2);
    writeFileSync(join(out2, 'injected-extra.json'), '{}', 'utf8');
    const r2 = verifyFarProofPackageIntegrity(out2);
    assert.ok(
      r2.errors.some((e) => e.includes('INTEGRITY_FILE_COUNT_MISMATCH')),
      `加文件须报聚合 INTEGRITY_FILE_COUNT_MISMATCH: ${r2.errors.join('; ')}`,
    );
  } finally {
    rmSync(tmp1, { recursive: true, force: true });
    rmSync(tmp2, { recursive: true, force: true });
  }
});

test('DEF-17: integrity.json 可解析但 schema 非法 → INTEGRITY_UNREADABLE(parseJson schema 守卫)', () => {
  // parseIntegrity (offline_package.ts:361) 对可解析但结构非法的 integrity.json fail-closed：
  // 根非对象 / schemaVersion 错 / files 非数组 / files[i] 形状错 / generatedAt-integrityHash 非串。
  // 这些 throw 被 verifyFarProofPackageIntegrity 的 try/catch 捕为 INTEGRITY_UNREADABLE。
  // 此前测仅覆盖了不可解析 JSON(语法坏),未覆盖可解析但 schema 坏(语义坏)。
  const cases = [
    { label: '根非对象', json: '[1,2,3]' },
    { label: 'schemaVersion 错', json: JSON.stringify({ schemaVersion: 'evil.v9', files: [], generatedAt: 't', integrityHash: 'h' }) },
    { label: 'files 非数组', json: JSON.stringify({ schemaVersion: 'far.proof_bundle.integrity.v1', files: 'x', generatedAt: 't', integrityHash: 'h' }) },
    { label: 'files[0] 非对象', json: JSON.stringify({ schemaVersion: 'far.proof_bundle.integrity.v1', files: [123], generatedAt: 't', integrityHash: 'h' }) },
    { label: 'generatedAt 非串', json: JSON.stringify({ schemaVersion: 'far.proof_bundle.integrity.v1', files: [], generatedAt: 5, integrityHash: 'h' }) },
  ];
  for (const { label, json } of cases) {
    const tmp = mkdtempSync(join(tmpdir(), `far-def17-schema-${label.replace(/[^a-z0-9]/gi, '')}-`));
    try {
      const outputDir = exportDemoBundle(tmp);
      writeFileSync(join(outputDir, 'integrity.json'), json, 'utf8');
      const result = verifyFarProofBundle(outputDir, 'full');
      assert.equal(result.ok, false, `[${label}] schema 非法须导致 verify 红`);
      assert.ok(
        result.errors.some((e) => e.includes('INTEGRITY_UNREADABLE')),
        `[${label}] 须报 INTEGRITY_UNREADABLE: ${result.errors.join('; ')}`,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// DB1-1：generatedAt 纳入 integrityHash——时间戳篡改检测回归
// ---------------------------------------------------------------------------

test('DB1-1: 篡改 generatedAt → INTEGRITY_HASH_MISMATCH（修复前可静默回填）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-db11-'));
  try {
    const outputDir = exportDemoBundle(tmp);
    const integrityPath = join(outputDir, 'integrity.json');
    const original = JSON.parse(readFileSync(integrityPath, 'utf8'));
    // 仅改 generatedAt（时间戳回填攻击：伪装旧导出时间），文件内容不动
    const tampered = { ...original, generatedAt: '1970-01-01T00:00:00.000Z' };
    writeFileSync(integrityPath, JSON.stringify(tampered), 'utf8');
    const result = verifyFarProofBundle(outputDir, 'full');
    assert.equal(result.ok, false, 'generatedAt 篡改必须导致 verify 红');
    assert.ok(
      result.errors.some((e) => e.includes('INTEGRITY_HASH_MISMATCH')),
      `须报 INTEGRITY_HASH_MISMATCH: ${result.errors.join('; ')}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('DB1-1: 未篡改 bundle → verify 仍绿（generatedAt 纳入 hash 不破坏正常路径）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-db11-ok-'));
  try {
    const outputDir = exportDemoBundle(tmp);
    const result = verifyFarProofBundle(outputDir, 'full');
    assert.equal(result.ok, true, 'clean bundle 必须通过完整性校验');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});