#!/usr/bin/env node
/**
 * repro_check.mjs — 导出/验证复现性检查（CI repro_check job 的真实语义）。
 *
 * 偿还的占位债：ci.yml repro_check job 曾因 "Makefile 无 repro target" 而用
 * `pnpm run test:py` 兜底（test_py job 已跑过一遍，纯冗余）。本脚本提供该 job
 * 本该有的检查：同一证据 DB 的两次导出必须字节一致，且两个 bundle 的第三方
 * 独立重算结果必须一致。
 *
 * 检查项（离线、确定性、零凭据）：
 *   P1  同 DB 双导出 byte-identical：buildDemoChain 一次，exportFarProof 两次
 *       （固定 exportedAt 注入——exporter 的既定确定性接缝），两个 bundle 的
 *       文件清单与逐文件 sha256 必须完全一致。证明 exporter 不引入任何
 *       非确定性（时间戳、随机数、排序、locale）。
 *   P2  双 bundle 第三方重算一致：verifyFarProofBundle('full') 双跑，结果剔除
 *       bundlePath（各 bundle 的真实磁盘位置，语义上必然不同）后 deep-equal。
 *       证明独立重算结果是导出内容的纯函数。
 *
 * 边界（cannot-prove）：本检查证明「同一 DB 的导出确定性」与「bundle 重算一致性」，
 *   不证明 demo-chain 构建本身的确定性（buildDemoChain 每次生成新 ULID/时间戳，
 *   demo_chain.ts:237 已登记该设计——proofHash 字节级重算不受影响）。
 *
 * 退出码：0 = 全部一致；1 = 任何漂移（逐项打印）。
 */
import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

const FIXED_EXPORTED_AT = '1970-01-01T00:00:00.000Z';

/** 递归列出目录内全部文件的相对路径（排序确定）。 */
export function listBundleFiles(dir) {
  const walk = (d, prefix) =>
    readdirSync(d)
      .sort()
      .flatMap((f) => {
        const p = join(d, f);
        const rel = prefix === '' ? f : `${prefix}/${f}`;
        return statSync(p).isDirectory() ? walk(p, rel) : [rel];
      });
  return walk(dir, '');
}

/** 对比两个 bundle 目录：返回差异描述数组（空 = byte-identical）。 */
export function compareBundleTrees(dirA, dirB) {
  const filesA = listBundleFiles(dirA);
  const filesB = listBundleFiles(dirB);
  const diffs = [];
  if (JSON.stringify(filesA) !== JSON.stringify(filesB)) {
    const onlyA = filesA.filter((f) => !filesB.includes(f));
    const onlyB = filesB.filter((f) => !filesA.includes(f));
    if (onlyA.length > 0) diffs.push(`仅 A 目录有: ${onlyA.join(', ')}`);
    if (onlyB.length > 0) diffs.push(`仅 B 目录有: ${onlyB.join(', ')}`);
  }
  const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  for (const f of filesA) {
    if (!filesB.includes(f)) continue;
    if (sha256(join(dirA, f)) !== sha256(join(dirB, f))) diffs.push(`字节不一致: ${f}`);
  }
  return diffs;
}

/** verify 结果剔除 bundlePath 后 deep-equal 比较（bundlePath 是磁盘位置，语义必然不同）。 */
export function verifyResultsEquivalent(resultA, resultB) {
  const { bundlePath: _a, ...restA } = resultA;
  const { bundlePath: _b, ...restB } = resultB;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
// Windows 下动态 import 绝对路径必须是 file:// URL。
const moduleUrl = (rel) => pathToFileURL(join(ROOT, rel)).href;
const { buildDemoChain } = await import(moduleUrl('src/far_proof/demo_chain.ts'));
const { exportFarProof } = await import(moduleUrl('src/far_proof/exporter.ts'));
const { verifyFarProofBundle } = await import(moduleUrl('src/far_proof/bundle_verifier.ts'));

const dirA = mkdtempSync(join(tmpdir(), 'far-repro-a-'));
const dirB = mkdtempSync(join(tmpdir(), 'far-repro-b-'));
const failures = [];
try {
  const db = new Database(':memory:');
  buildDemoChain(db);
  exportFarProof({ db, outputDir: dirA, exportedAt: FIXED_EXPORTED_AT });
  exportFarProof({ db, outputDir: dirB, exportedAt: FIXED_EXPORTED_AT });

  // P1 · 双导出 byte-identical
  for (const d of compareBundleTrees(dirA, dirB)) failures.push(`P1: ${d}`);

  // P2 · 双 bundle 第三方重算一致
  const verifyA = verifyFarProofBundle(dirA, 'full');
  const verifyB = verifyFarProofBundle(dirB, 'full');
  if (verifyA.ok !== true) failures.push(`P2: bundle A verify 未通过: ${JSON.stringify(verifyA).slice(0, 300)}`);
  if (verifyB.ok !== true) failures.push(`P2: bundle B verify 未通过: ${JSON.stringify(verifyB).slice(0, 300)}`);
  if (!verifyResultsEquivalent(verifyA, verifyB)) {
    failures.push('P2: 两个 bundle 的 verify 重算结果不一致（剔除 bundlePath 后仍不等）');
  }

  const fileCount = listBundleFiles(dirA).length;
  if (fileCount === 0) failures.push('P1: 导出 0 个文件——export 未生效，检查器自身需要同步');

  if (failures.length > 0) {
    console.error(`FAIL — ${failures.length} 项复现性漂移：`);
    for (const f of failures) console.error(`  ✖ ${f}`);
    process.exit(1);
  }
  console.log(`PASS — 同 DB 双导出 ${fileCount} 文件 byte-identical + 双 bundle 第三方重算一致（exportedAt=${FIXED_EXPORTED_AT}）`);
} finally {
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
}
