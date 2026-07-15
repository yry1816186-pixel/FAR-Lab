// scripts/fresh_clone_smoke.mjs
// 职责：fresh-clone 一键复现集成测试（模拟 fresh-clone 环境·无 secret 跑通 core gate）
// 历史溯源：FAR_CHAIN_DEV_SPEC/22_安装与配置指南_INSTALL_SETUP.md §1（FAR_CHAIN_DEV_SPEC/ 已于 commit 66e2975 归档·见 FINAL_PACKAGE/ PDF 层）·运行时 SSOT 以 package.json scripts + 本脚本为准
// 无 secret 跑通规则（17§7 第 1 条）：competition_qwen_smoke 在 DASHSCOPE_API_KEY 缺失时 graceful skip（exit 0）
// 用法：node scripts/fresh_clone_smoke.mjs
// 退出码：0 = core gate 全绿（skip 项不破坏闭环），1 = 至少一个 hard gate 失败

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// ---- 结果枚举 ----
const PASS = 'PASS';
const FAIL = 'FAIL';
const SKIP = 'SKIP';

/** @type {Array<{ step: string, status: string, detail: string, durationMs: number }>} */
const results = [];

/**
 * 记录一步结果
 */
function record(step, status, detail, durationMs) {
  results.push({ step, status, detail, durationMs });
}

/**
 * 执行 shell 命令：成功返回 true，失败返回 false
 */
function execOk(cmd) {
  try {
    execSync(cmd, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'inherit',
      maxBuffer: 10 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 执行并捕获输出，返回 { ok, output }
 */
function execCapture(cmd) {
  try {
    const stdout = execSync(cmd, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, output: stdout };
  } catch (err) {
    return {
      ok: false,
      output: err.stderr ?? err.stdout ?? String(err),
    };
  }
}

/**
 * 执行 pnpm 脚本并记录结果
 */
function stepPnpm(stepLabel, pnpmScript) {
  const start = Date.now();
  const ok = execOk(`pnpm run ${pnpmScript}`);
  const durationMs = Date.now() - start;
  record(stepLabel, ok ? PASS : FAIL, ok ? `ok (${durationMs}ms)` : `exit ≠ 0`, durationMs);
  return ok;
}

/**
 * 执行 tsx 脚本并记录结果
 */
function stepTsx(stepLabel, tsFile) {
  const start = Date.now();
  const ok = execOk(`pnpm exec tsx ${tsFile}`);
  const durationMs = Date.now() - start;
  record(stepLabel, ok ? PASS : FAIL, ok ? `ok (${durationMs}ms)` : `exit ≠ 0`, durationMs);
  return ok;
}

// ====================================================================
// Phase 0: 前置检查
// ====================================================================
console.log('═══════════════════════════════════════════');
console.log('  FAR-Chain Fresh-Clone Smoke Test');
console.log('═══════════════════════════════════════════');
console.log('');

const hasApiKey = !!env.DASHSCOPE_API_KEY;
if (!hasApiKey) {
  console.log('ℹ  DASHSCOPE_API_KEY 未配置 —— competition_qwen_smoke / snapshot_liveness_smoke 将 graceful skip');
}
console.log('');

// ---- Step 0: 验证 pnpm install 已执行 ----
{
  const start = Date.now();
  const pnpmStoreOk = existsSync(resolve(repoRoot, 'node_modules', 'better-sqlite3'));
  const lockOk = existsSync(resolve(repoRoot, 'pnpm-lock.yaml'));
  const durationMs = Date.now() - start;
  if (pnpmStoreOk && lockOk) {
    record('pnpm install (node_modules check)', PASS, `node_modules 就位 (${durationMs}ms)`, durationMs);
  } else {
    const missing = [];
    if (!pnpmStoreOk) missing.push('node_modules/better-sqlite3');
    if (!lockOk) missing.push('pnpm-lock.yaml');
    record('pnpm install (node_modules check)', FAIL, `缺失: ${missing.join(', ')}`, durationMs);
    console.error('❌ 依赖未安装。请先执行: pnpm install --frozen-lockfile');
    process.exit(1);
  }
}

// ---- Step 1: typecheck ----
console.log('[1/11] typecheck...');
stepPnpm('typecheck (tsc --noEmit)', 'typecheck');

// ---- Step 2: zero-tolerance ----
console.log('[2/11] zero-tolerance...');
stepPnpm('zero-tolerance scan', 'zero-tolerance');

// ---- Step 3: test (主环) ----
console.log('[3/11] test (main ring)...');
stepPnpm('test (main ring)', 'test');

// ---- Step 4: test:agent_loop ----
console.log('[4/11] test:agent_loop...');
stepPnpm('test:agent_loop', 'test:agent_loop');

// ---- Step 5: test:ci ----
console.log('[5/11] test:ci...');
stepPnpm('test:ci', 'test:ci');

// ---- Step 6: test:py (跨平台 Python 回归) ----
console.log('[6/11] test:py...');
{
  const start = Date.now();
  const ok = execOk('pnpm run test:py');
  const durationMs = Date.now() - start;
  record(
    'test:py (Python 回归)',
    ok ? PASS : FAIL,
    ok ? `ok (${durationMs}ms)` : `exit ≠ 0`,
    durationMs,
  );
}

// ---- Step 7: eval_ring_audit ----
console.log('[7/11] eval_ring_audit...');
stepPnpm('eval-ring-audit', 'eval-ring-audit');

// ---- Step 8: verify_chain_smoke ----
console.log('[8/11] verify_chain_smoke...');
stepTsx('verify_chain_smoke', 'ci/verify_chain_smoke.ts');

// ---- Step 9: merkle_integrity_smoke (与 verify_chain_smoke 互补·整链指纹+包含证明+篡改检测) ----
console.log('[9/11] merkle_integrity_smoke...');
stepTsx('merkle_integrity_smoke', 'ci/merkle_integrity_smoke.ts');

// ---- Step 10: competition_qwen_smoke (条件门) ----
console.log('[10/11] competition_qwen_smoke...');
if (!hasApiKey) {
  const start = Date.now();
  record('competition_qwen_smoke', SKIP, 'DASHSCOPE_API_KEY 未配置', Date.now() - start);
  console.log('  [skip] competition_qwen_smoke (DASHSCOPE_API_KEY 未配置)');
} else {
  stepTsx('competition_qwen_smoke', 'ci/competition_qwen_smoke.ts');
}

// ---- Step 11: snapshot_liveness_smoke (条件门) ----
console.log('[11/11] snapshot_liveness_smoke...');
if (!hasApiKey) {
  const start = Date.now();
  record('snapshot_liveness_smoke', SKIP, 'DASHSCOPE_API_KEY 未配置', Date.now() - start);
  console.log('  [skip] snapshot_liveness_smoke (DASHSCOPE_API_KEY 未配置)');
} else {
  stepTsx('snapshot_liveness_smoke', 'ci/snapshot_liveness_smoke.ts');
}

// ====================================================================
// 最终报告
// ====================================================================
console.log('');
console.log('═══════════════════════════════════════════');
console.log('  FAR-Chain Fresh-Clone Smoke Report');
console.log('═══════════════════════════════════════════');

const passCount = results.filter((r) => r.status === PASS).length;
const failCount = results.filter((r) => r.status === FAIL).length;
const skipCount = results.filter((r) => r.status === SKIP).length;
const total = results.length;

for (const r of results) {
  const icon = r.status === PASS ? '✓' : r.status === FAIL ? '✗' : '○';
  const label = r.status === PASS ? 'PASS' : r.status === FAIL ? 'FAIL' : 'SKIP';
  console.log(`  ${icon} [${label}] ${r.step}`);
}

console.log('');
const hardFailCount = failCount;
const coreGatePassed = hardFailCount === 0;
if (coreGatePassed) {
  console.log(`✅ core gate 全绿（${passCount}/${total} 通过，${skipCount} 项 secret-gated 跳过）`);
} else {
  console.log(`❌ core gate 失败（${passCount} PASS / ${hardFailCount} FAIL / ${skipCount} SKIP）`);
}
console.log('');

process.exit(coreGatePassed ? 0 : 1);
