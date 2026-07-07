// scripts/ci_all.mjs
// 职责：CI 全量检查入口——串联所有 CI gate，失败即停（fail-fast）
// 历史溯源：FAR_CHAIN_DEV_SPEC/10_CI_pipeline.md §1（FAR_CHAIN_DEV_SPEC/ 已于 commit 66e2975 归档·见 FINAL_PACKAGE/ PDF 层）·运行时 SSOT 以 package.json ci-all + 本脚本为准
// 等价于 package.json `ci-all` 脚本，但作为独立 .mjs 提供：
//   - 每步独立报告 PASS/FAIL
//   - 失败时打印排障指引（回 10_CI_pipeline.md §10）
//   - exit 0 = 全绿（skip 项不破坏闭环）
// 用法：
//   node scripts/ci_all.mjs
//   set DASHSCOPE_API_KEY=sk-xxx && node scripts/ci_all.mjs   # 激活 competition_qwen_smoke

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const hasApiKey = !!env.DASHSCOPE_API_KEY;

/**
 * 执行命令，throw on failure
 * @param {string} cmd 完整命令行（通过 shell 执行）
 */
function execOrThrow(cmd) {
  execSync(cmd, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * @param {string} label
 * @param {string} cmd
 * @returns {boolean} ok
 */
function run(label, cmd) {
  console.log(`\n── ${label} ──`);
  try {
    execOrThrow(cmd);
    console.log(`  ✓ PASS`);
    return true;
  } catch (_err) {
    console.error(`  ✗ FAIL`);
    return false;
  }
}

// ====================================================================
// 11 步串行 gate（本地等价版）
// ====================================================================
console.log('═══════════════════════════════════════════');
console.log('  FAR-Chain CI-ALL');
console.log('═══════════════════════════════════════════');
if (!hasApiKey) {
  console.log('ℹ  DASHSCOPE_API_KEY 未配置 —— competition_qwen_smoke / snapshot_liveness_smoke 将 skip');
}

let failed = false;

// STEP 1: zero-tolerance
if (!run('zero-tolerance scan', 'pnpm run zero-tolerance')) {
  failed = true;
  console.error('\n→ 排障指引：10_CI_pipeline.md §10「typecheck / lint」');
}

// STEP 1b: ci-04 no_llm_final_judge_scan (anti-theater F1 + AT-04 honest marker coverage)
//          硬门：src 出现 LLM-as-judge → exit 1；诚实标注 4 LANDED + 2 V2-pending（spec 0020 verdict_protocols）。
if (!failed && !run('ci-04 no_llm_final_judge_scan', 'pnpm run no-llm-judge-scan')) {
  failed = true;
  console.error('\n→ 排障指引：23_CI_AND_VALIDATION.md §6.6.2（ci-04 · no LLM final judge）+ AT-04 审计裁决');
}

// STEP 1c: ci-at anti_theater_deterministic_scan (anti-theater F3·APPENDIX_E §6 第 2 grep gate)
//          硬门：src/anti_theater 出现 LLM-client-usage（openai/dashscope/chat.completions）→ exit 1；
//          deterministic 标记 + runAntiTheaterLint 编排器 regression 守卫。
if (!failed && !run('ci-at anti_theater_deterministic_scan', 'pnpm run anti-theater-scan')) {
  failed = true;
  console.error('\n→ 排障指引：APPENDIX_E_ANTI_THEATER.md §6（ci-at · anti_theater F3 deterministic）');
}

// STEP 1d: ci-cg confounding_gate_deterministic_scan (F6 因果红线·03 §7.5.1:1133 CG-1/2/5/6)
//          硬门：src/confounding_gate 出现 LLM-client-usage（CG-1）或 generateConfounders/askLLM（CG-5）→ exit 1；
//          CG-2 acyclic + CG-6 rationale template + adjudicateConfounding 编排器 regression 守卫。
//          与 ci-at 互补（APPENDIX_E:1171 anti-theater 不重复混杂检测·defer to §7.5.1）。
if (!failed && !run('ci-cg confounding_gate_deterministic_scan', 'pnpm run confounding-gate-scan')) {
  failed = true;
  console.error('\n→ 排障指引：03_EVIDENCE_CONTRACT_AND_VERDICT.md §7.5.1:1133（ci-cg · F6 deterministic）');
}

// STEP 1e: lint (eslint src --max-warnings 0 · 10_CI_pipeline.md §10「typecheck / lint」)
//          零容忍：no-explicit-any / ban-ts-comment / no-unused-vars / no-empty / prefer-const
if (!failed && !run('lint (eslint src --max-warnings 0)', 'pnpm run lint')) {
  failed = true;
  console.error('\n→ 排障指引：10_CI_pipeline.md §10「typecheck / lint」+ CLAUDE.md 零容忍表');
}

// STEP 2: typecheck
if (!failed && !run('typecheck (tsc --noEmit)', 'pnpm run typecheck')) {
  failed = true;
}

// STEP 3: test (main ring)
if (!failed && !run('test (main ring)', 'pnpm run test')) {
  failed = true;
}

// STEP 4: test:agent_loop
if (!failed && !run('test:agent_loop', 'pnpm run test:agent_loop')) {
  failed = true;
}

// STEP 5: test:ci
if (!failed && !run('test:ci', 'pnpm run test:ci')) {
  failed = true;
}

// STEP 6: test:py (cross-platform)
if (!failed && !run('test:py (Python)', 'pnpm run test:py')) {
  failed = true;
}

// STEP 7: eval-ring-audit
if (!failed && !run('eval-ring-audit', 'pnpm run eval-ring-audit')) {
  failed = true;
}

// STEP 8: verify_chain_smoke
if (!failed && !run('verify_chain_smoke', 'pnpm exec tsx ci/verify_chain_smoke.ts')) {
  failed = true;
}

// STEP 9: Z16 Core coverage gate (unconditional · Node 24 native coverage)
//         Core 11 目录 ≥85% line / ≥75% branch。零新依赖。
if (!failed && !run('coverage (Z16 Core ≥85% line / ≥75% branch)', 'pnpm run coverage')) {
  failed = true;
}

// STEP 10: competition_qwen_smoke (conditional gate)
if (!failed) {
  if (hasApiKey) {
    if (!run('competition_qwen_smoke', 'pnpm exec tsx ci/competition_qwen_smoke.ts')) {
      failed = true;
    }
  } else {
    console.log('\n── competition_qwen_smoke ──');
    console.log('  ○ SKIP (DASHSCOPE_API_KEY 未配置)');
  }
}

// STEP 11: snapshot_liveness_smoke (conditional gate)
if (!failed) {
  if (hasApiKey) {
    if (!run('snapshot_liveness_smoke', 'pnpm exec tsx ci/snapshot_liveness_smoke.ts')) {
      failed = true;
    }
  } else {
    console.log('\n── snapshot_liveness_smoke ──');
    console.log('  ○ SKIP (DASHSCOPE_API_KEY 未配置)');
  }
}

// STEP 12: depth-gate (深度接线门 · anti-skim 结构性硬核 · CLAUDE.md §1/§4)
//          硬门：深度功能（decideFiveValueVerdict / executeFallbackChain / fecV2 必选形参 /
//          src/statistics/ / golden_vectors/cases/ / tests/real_backends/）须真接到生产路径，
//          非「已建零接线」（BUILT_UNWIRED）或「可选死分支」（WIRED_OPT_IN）。
//          当前态确定 RED——这是特性不是 bug：ci-all green ⟺ 深度功能已接线。
//          排障路径不是「修测试让门绿」，是读 FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §A 取 next_action 做真实接线。
if (!failed && !run('depth-gate (深度接线 · 见 DEPTH_LEDGER §A)', 'pnpm run depth-gate')) {
  failed = true;
  console.error('\n→ 这不是测试失败，是深度功能未接生产路径。读 FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §A (next_action) + .agent/AGENT_ENTRY_PROTOCOL.md');
}

// ====================================================================
// 结论
// ====================================================================
console.log('');
console.log('═══════════════════════════════════════════');
if (failed) {
  console.log('❌ CI-ALL: FAIL');
  console.log('→ 回到 10_CI_pipeline.md §10 排错矩阵排查');
} else {
  console.log('✅ CI-ALL: PASS (core gate 全绿)');
}
console.log('═══════════════════════════════════════════');

process.exit(failed ? 1 : 0);
