/**
 * offline_package_branches.test.ts — branch coverage 补强测试
 *
 * 目标：将 src/far_proof/offline_package.ts 的 branch coverage 从 59.26% 提升到 80%+
 *
 * 覆盖目标（按 coverage 报告未覆盖分支）：
 *   resolveTar:
 *     - Windows native tar 路径（98-100）
 *     - GNU tar --force-local（109-111）— 平台依赖（Windows 原生 tar 存在时不可达）
 *     - catch tar --version fail（113-114）— 平台依赖
 *   packageFarProofBundle 错误路径:
 *     - bundleDir 不存在（125-126）
 *     - bundleDir 是文件非目录（125-126）
 *     - archivePath 在 bundleDir 内（130-131）
 *     - preflight fail（135-136）
 *     - integrity self-check fail（149-150）— 防御性分支·需并发 TOCTOU 触发
 *     - TOCTOU staleness（178-181）— 防御性分支·需并发 TOCTOU 触发
 *   detectPostSealStaleness:
 *     - 文件新增（233-234）
 *     - 文件修改（235-237）
 *     - 文件删除（239-242）
 *   snapshotBundleContent:
 *     - 正常快照（回归保护）
 *     - 空目录快照（边界）
 *
 * 策略：
 *   - 真实临时目录（mkdtempSync），finally 里 rmSync 清理
 *   - resolveTar 不 mock execFileSync——真实调用（Windows/Linux tar 均可用）
 *   - packageFarProofBundle 错误路径用不合法 bundle（空目录/缺失文件）触发对应 throw
 *   - detectPostSealStaleness 构造 snapshot + 手动改文件（新增/修改/删除）→ 断言 staleFiles
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  packageFarProofBundle,
  resolveTar,
  snapshotBundleContent,
  detectPostSealStaleness,
} from '../../src/far_proof/offline_package.ts';

// =============================================================================
// resolveTar
// =============================================================================

describe('resolveTar', () => {
  it('returns a valid TarInvocation with non-empty binary string', () => {
    const result = resolveTar();
    assert.ok(typeof result.binary === 'string', 'binary must be a string');
    assert.ok(result.binary.length > 0, 'binary must not be empty');
  });

  it('extraArgs is always an array', () => {
    const result = resolveTar();
    assert.ok(Array.isArray(result.extraArgs), 'extraArgs must be an array');
  });

  it('is idempotent — second call returns same cached reference', () => {
    const first = resolveTar();
    const second = resolveTar();
    assert.strictEqual(first, second, 'resolveTar must cache and return same reference');
  });
});

// =============================================================================
// snapshotBundleContent（detectPostSealStaleness 依赖·回归保护）
// =============================================================================

describe('snapshotBundleContent', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'far-snap-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty hashes map for empty directory', () => {
    const snap = snapshotBundleContent(dir);
    assert.equal(snap.hashes.size, 0);
  });

  it('returns hashes for files in flat directory', () => {
    writeFileSync(join(dir, 'a.json'), '{"x":1}');
    writeFileSync(join(dir, 'b.ttl'), '<x>');
    const snap = snapshotBundleContent(dir);
    assert.equal(snap.hashes.size, 2);
    assert.ok(snap.hashes.has('a.json'));
    assert.ok(snap.hashes.has('b.ttl'));
    // hashes must be 64-char hex (sha256)
    const aHash = snap.hashes.get('a.json');
    assert.ok(aHash !== undefined);
    assert.match(aHash, /^[0-9a-f]{64}$/);
  });

  it('recursively hashes files in subdirectories (POSIX-style path separators)', () => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'nested.txt'), 'nested');
    const snap = snapshotBundleContent(dir);
    assert.equal(snap.hashes.size, 1);
    assert.ok(snap.hashes.has('sub/nested.txt'), 'nested path must use forward slash');
  });

  it('ignores empty subdirectories (no file = no hash entry)', () => {
    mkdirSync(join(dir, 'empty-sub'));
    const snap = snapshotBundleContent(dir);
    assert.equal(snap.hashes.size, 0, 'empty subdirectory must not produce hash entries');
  });
});

// =============================================================================
// detectPostSealStaleness（branches 233-234 / 235-237 / 239-242）
// =============================================================================

describe('detectPostSealStaleness', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'far-stale-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects file ADDED after seal (branch 233-234: current has file, baseline does not)', () => {
    writeFileSync(join(dir, 'a.txt'), 'original');
    const baseline = snapshotBundleContent(dir);
    // Simulate post-seal injection: write a new file
    writeFileSync(join(dir, 'injected.txt'), 'malicious payload');
    const result = detectPostSealStaleness(dir, baseline);
    assert.equal(result.ok, false, 'must detect injected file');
    assert.ok(result.staleFiles.includes('injected.txt'), 'injected.txt must be flagged');
    // Verify ONLY the new file is flagged (not the existing one)
    assert.ok(!result.staleFiles.includes('a.txt'), 'unchanged file must not be flagged');
  });

  it('detects file MODIFIED after seal (branch 235-237: hash mismatch)', () => {
    writeFileSync(join(dir, 'a.txt'), 'original content');
    const baseline = snapshotBundleContent(dir);
    // Simulate post-seal tampering: modify file content
    writeFileSync(join(dir, 'a.txt'), 'tampered content after seal');
    const result = detectPostSealStaleness(dir, baseline);
    assert.equal(result.ok, false, 'must detect modified file');
    assert.ok(result.staleFiles.includes('a.txt'), 'modified file must be flagged');
  });

  it('detects file DELETED after seal (branch 239-242: baseline has file, current does not)', () => {
    writeFileSync(join(dir, 'a.txt'), 'original');
    writeFileSync(join(dir, 'b.txt'), 'also original');
    const baseline = snapshotBundleContent(dir);
    // Simulate post-seal deletion
    rmSync(join(dir, 'b.txt'));
    const result = detectPostSealStaleness(dir, baseline);
    assert.equal(result.ok, false, 'must detect deleted file');
    assert.ok(result.staleFiles.includes('b.txt'), 'deleted file must be flagged');
    // Verify only the deleted file is flagged
    assert.ok(!result.staleFiles.includes('a.txt'), 'remaining file must not be flagged');
  });

  it('returns ok=true when no changes after seal (clean bundle)', () => {
    writeFileSync(join(dir, 'a.txt'), 'original');
    writeFileSync(join(dir, 'b.txt'), 'original');
    const baseline = snapshotBundleContent(dir);
    const result = detectPostSealStaleness(dir, baseline);
    assert.equal(result.ok, true);
    assert.equal(result.staleFiles.length, 0);
  });

  it('detects modification in nested subdirectory files', () => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'nested.txt'), 'nested original');
    writeFileSync(join(dir, 'root.txt'), 'root original');
    const baseline = snapshotBundleContent(dir);
    // Modify only nested file
    writeFileSync(join(dir, 'sub', 'nested.txt'), 'nested tampered');
    const result = detectPostSealStaleness(dir, baseline);
    assert.equal(result.ok, false);
    assert.ok(result.staleFiles.includes('sub/nested.txt'));
    assert.ok(!result.staleFiles.includes('root.txt'));
  });

  it('empty baseline + empty current = ok (no staleness)', () => {
    const baseline = snapshotBundleContent(dir);
    const result = detectPostSealStaleness(dir, baseline);
    assert.equal(result.ok, true);
    assert.equal(result.staleFiles.length, 0);
  });
});

// =============================================================================
// packageFarProofBundle — error paths（branches 125-126 / 130-131 / 135-136）
// =============================================================================

describe('packageFarProofBundle error paths', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'far-pkg-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // branch 125-126: bundleDir 不存在
  it('throws when bundleDir does not exist (branch 125-126)', () => {
    const nonexistent = join(tmpDir, 'nonexistent-dir');
    assert.throws(
      () => packageFarProofBundle({ bundleDir: nonexistent }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return err.message.includes('bundleDir not found or not a directory');
      },
      'must throw for nonexistent bundleDir',
    );
  });

  // branch 125-126: bundleDir 存在但是文件
  it('throws when bundleDir is a file not a directory (branch 125-126)', () => {
    const filePath = join(tmpDir, 'not-a-dir.txt');
    writeFileSync(filePath, 'I am a file');
    assert.throws(
      () => packageFarProofBundle({ bundleDir: filePath }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return err.message.includes('bundleDir not found or not a directory');
      },
      'must throw when bundleDir is a file',
    );
  });

  // branch 130-131: archivePath 在 bundleDir 内
  it('throws when archivePath is inside bundleDir (branch 130-131)', () => {
    const bundleDir = join(tmpDir, 'my-bundle');
    mkdirSync(bundleDir);
    const archiveInside = join(bundleDir, 'output.tar.zst');
    assert.throws(
      () => packageFarProofBundle({ bundleDir, archivePath: archiveInside }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return err.message.includes('archivePath must not be inside bundleDir');
      },
      'must throw when archivePath is inside bundleDir',
    );
  });

  // branch 130-131 边缘：archivePath 包含 bundleDir 前缀但非子路径
  it('accepts archivePath that is sibling (prefix but not subpath)', () => {
    const bundleDir = join(tmpDir, 'my-bundle');
    mkdirSync(bundleDir);
    // my-bundle-archive is a different directory, not inside my-bundle
    const archiveSibling = join(tmpDir, 'my-bundle-archive.tar.zst');
    // Should fail at preflight (missing required files), not at archivePath check
    assert.throws(
      () => packageFarProofBundle({ bundleDir, archivePath: archiveSibling }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        // Must NOT be the "inside bundleDir" error — must be preflight fail
        return !err.message.includes('archivePath must not be inside bundleDir');
      },
      'sibling archivePath (prefix but not subpath) must pass the archivePath check',
    );
  });

  // branch 135-136: preflight fail — verifyFarProofBundle 返回 !ok
  // 空目录缺少所有 10 个必需文件（FAR_PROOF_REQUIRED_FILES），verifyFarProofBundle 返回 !ok
  it('throws when preflight fails — empty bundleDir missing all required files (branch 135-136)', () => {
    const bundleDir = join(tmpDir, 'empty-bundle');
    mkdirSync(bundleDir);
    assert.throws(
      () => packageFarProofBundle({ bundleDir }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return err.message.includes('cannot package invalid bundle');
      },
      'must throw when verifyFarProofBundle returns !ok',
    );
  });

  // branch 135-136: 部分 required files 存在但不足，仍 fail preflight
  it('throws when preflight fails — partial required files present (branch 135-136)', () => {
    const bundleDir = join(tmpDir, 'partial-bundle');
    mkdirSync(bundleDir);
    // Write some but not all required files
    writeFileSync(join(bundleDir, 'ro-crate-metadata.json'), '{}');
    writeFileSync(join(bundleDir, 'prov.ttl'), '<http://example.org/>');
    // Missing: proof_envelopes.jsonl, repro_runs.jsonl, call_records.redacted.jsonl,
    // claim_graph.json, otel-trace.jsonl, data_manifest.json, README_REPLAY.md, manifest
    assert.throws(
      () => packageFarProofBundle({ bundleDir }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return err.message.includes('cannot package invalid bundle');
      },
      'must throw when required files are partially missing',
    );
  });

  // 默认 archivePath（不传时自动 = bundleDir.tar.zst）
  it('uses default archivePath = bundleDir + .tar.zst when not specified', () => {
    // 通过检查 archivePath 不在 bundleDir 内（默认在父目录，因此必不在 bundleDir 内）
    // 然后应在 preflight 阶段失败（空目录）
    const bundleDir = join(tmpDir, 'default-archive');
    mkdirSync(bundleDir);
    // 默认 archivePath = resolve(bundleDir + '.tar.zst')，应该在 bundleDir 的父目录
    assert.throws(
      () => packageFarProofBundle({ bundleDir }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        // 应到达 preflight fail，不是 archivePath 检查失败
        return err.message.includes('cannot package invalid bundle');
      },
      'default archivePath must pass the inside-bundleDir check',
    );
  });

  // Note: branches 149-150 (integrity self-check fail) and 178-181 (TOCTOU staleness)
  // are defensive / canary branches that require actual concurrent modification of
  // bundleDir between the seal snapshot and the post-archive staleness scan.
  // They are NOT triggerable in a synchronous unit test without mocking.
  // See: src/far_proof/offline_package.ts lines 147-150 (self-check) and 175-181 (TOCTOU).
  // These are covered by the seal_window E2E test via exportFarProof → packageFarProofBundle.
});

// =============================================================================
// packageFarProofBundle — success path with valid bundle (回归保护)
// 用 demo_chain + exportFarProof 产出合法 bundle 后 package
// =============================================================================

describe('packageFarProofBundle success path', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'far-pkg-ok-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('packages a valid demo_chain bundle successfully', async () => {
    // Dynamic import to avoid loading better-sqlite3 at module top level
    const Database = (await import('better-sqlite3')).default;
    const { buildDemoChain, computeEnvHash, DEMO_GIT_COMMIT_SHA, DEMO_RUN_ID } =
      await import('../../src/far_proof/demo_chain.ts');
    const { exportFarProof } = await import('../../src/far_proof/index.ts');

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
        exportedAt: '2026-08-07T00:00:00.000Z',
      });

      const result = packageFarProofBundle({
        bundleDir: outputDir,
        generatedAt: '2026-08-07T00:00:00.000Z',
      });

      // Verify result structure
      assert.equal(result.compression, 'zstd');
      assert.match(result.archiveSha256, /^[0-9a-f]{64}$/, 'archiveSha256 must be 64 hex chars');
      assert.ok(result.fileCount > 0, 'must have files');
      assert.ok(result.archivePath.endsWith('.tar.zst'), 'archivePath must end with .tar.zst');
      assert.ok(result.integrityHash.length > 0, 'integrityHash must not be empty');
      assert.equal(result.warnings.length, 1); // V1 format warning
    } finally {
      db.close();
    }
  });
});
