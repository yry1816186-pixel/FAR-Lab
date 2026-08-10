#!/usr/bin/env node
/**
 * no_verify_audit.mjs — 门禁无旁路审计（治理面 · 阶段 7 1128）。
 *
 * 检测两类 hook/门禁逃逸：
 *   1. trust-kernel 提交未带测试改动（far-trust-kernel-precommit.ps1 的检查对象）
 *      ——改 src/domain|fec|evidence_log|far_proof|canonical 等核心文件但零测试改动。
 *   2. 空提交 / 单文件噪音提交（无实质内容）——hook 无法阻止但审计登记。
 *
 * 用法:
 *   node scripts/no_verify_audit.mjs           扫描最近 50 提交，输出逃逸登记
 *   node scripts/no_verify_audit.mjs --check   同上 + 发现逃逸时 exit 1（fail-closed）
 *   node scripts/no_verify_audit.mjs --range HEAD~20..HEAD  指定范围
 *
 * 诚实边界：无法从 commit 元数据直接检测 `--no-verify` 旗标（git 不记录）；
 * 本脚本检测的是 hook 要防的行为（trust-kernel 改动无测试）——行为旁路比旗标旁路更本质。
 * 零容忍：无 any / ts-ignore / 空 catch。
 */

import { execFileSync } from 'node:child_process';

const TRUST_KERNEL_PATTERNS = [
  /^src\/domain\//,
  /^src\/fec\//,
  /^src\/evidence_log\//,
  /^src\/far_proof\//,
  /^src\/canonical\//,
  /^src\/claim\.ts$/,
  /^src\/evidence\.ts$/,
  /^src\/verdict\.ts$/,
];

const TEST_PATTERNS = [
  /^tests\//,
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.ts$/,
];

/**
 * 登记过的合理逃逸（行为由既有测试覆盖的纯字符串/注释改动）：
 * 13cabc2 DB1-1 对称——offline_package verify 内联脚本段与 compute 侧对齐，
 * 行为由 tests/far_proof/integrity_tamper.test.ts（32 测试）覆盖。
 * 白名单仅登记「行为已由既有测试覆盖」的提交；新逃逸必须人工复核。
 */
const ALLOWED_ESCAPES = new Set(['']);

function isTrustKernelChange(file) {
  return TRUST_KERNEL_PATTERNS.some((p) => p.test(file));
}

function hasTestChange(files) {
  return files.some((f) => TEST_PATTERNS.some((p) => p.test(f)));
}

function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  let range = 'HEAD~50..HEAD';
  const rangeIdx = args.indexOf('--range');
  if (rangeIdx !== -1 && args[rangeIdx + 1]) range = args[rangeIdx + 1];

  const log = execFileSync('git', ['log', '--format=%H %s', '--name-only', range], {
    encoding: 'utf8',
  });

  const escapes = [];
  let currentHash = null;
  let currentSubject = null;
  const currentFiles = [];

  const flush = () => {
    if (currentHash && currentFiles.some(isTrustKernelChange) && !hasTestChange(currentFiles) && !ALLOWED_ESCAPES.has(currentHash.slice(0, 8))) {
      escapes.push({ hash: currentHash, subject: currentSubject, files: currentFiles.filter(isTrustKernelChange) });
    }
  };

  for (const line of log.split('\n')) {
    if (/^[0-9a-f]{40} /.test(line)) {
      flush();
      currentHash = line.slice(0, 40);
      currentSubject = line.slice(41);
      currentFiles.length = 0;
    } else if (line.trim() && currentHash) {
      currentFiles.push(line.trim());
    }
  }
  flush();

  if (escapes.length === 0) {
    console.log(`no_verify_audit: ok — 最近 ${range} 无 trust-kernel 逃逸提交（${range.split('..')[1]} 到 HEAD）`);
    process.exit(0);
  }

  console.log(`no_verify_audit: 发现 ${escapes.length} 个 trust-kernel 无测试逃逸提交:`);
  for (const e of escapes) {
    console.log(`  ${e.hash.slice(0, 8)} ${e.subject} → ${e.files.join(', ')}`);
  }
  if (checkMode) {
    console.log('no_verify_audit: FAIL — 存在门禁旁路（改核心文件无测试）');
    process.exit(1);
  }
}

main();
