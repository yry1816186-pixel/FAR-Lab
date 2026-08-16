// scripts/coverage_gate.mjs
// 职责：Z16 Core 覆盖率门禁 —— Node 24 原生 --experimental-test-coverage + 阈值断言。
//
// 权威 SSOT：
//   - Core 目录清单：.github/workflows/build-integrity.yml:212 model_neutrality DIRS
//     （核心目录·排除 llm_gateway adapters 竞争适配器命名空间）。
//   - 阈值：Z16 Core ≥85% line / ≥75% branch。
//
// 设计：
//   - 零新依赖：Node 24 内置 test runner coverage（--experimental-test-coverage +
//     --test-coverage-lines/branches 阈值 flag，低于阈值 exit 非 0）。
//   - 仅统计 13 个 Core 目录的覆盖率；llm_gateway/adapters（竞争适配器）、
//     math/*_backend（需外部 CAS/Dafny/SMT 求解器，离线不可测）、profiles（离线 replay）
//     不纳入门禁（与 build-integrity.yml Core 边界一致）。
//   - test glob 与 package.json `test` 保持一致 + agent_loop（覆盖 src/agent_loop Core 代码）。
//
// 用法：node scripts/coverage_gate.mjs   # 低于阈值 exit 1（门禁失败）

import { spawnSync } from 'node:child_process';

// Core 13 目录(build-integrity.yml SSOT;V11-05 修复:evidence_graph 不存在→confounding_gate,
// 与 src/ 实际目录对齐;P1-B-2 修复:statistics 纳入——纯 TS 统计内核无外部求解器依赖)。
const CORE_DIRS = [
  'evidence_log',
  'confounding_gate',
  'falsifiability',
  'anti_theater',
  'proof_envelope',
  'far_proof',
  'agent_loop',
  'fec',
  'report',
  'db',
  'schema',
  'api',
  // P2 TK10：security（src/security 纯 TS：ed25519 签名——信任内核签名完整性）
  // P1-B-2：statistics（src/statistics 纯 TS：p_value/ks_test/effect_size/permutation_test/
  // t_distribution/multiple_testing/bootstrap_ci/ci/index；外部求解器在 src/math/*_backend，
  // 已明确排除，statistics 不涉及）。
  'statistics',
];

// V11-03 修复:与 package.json `test` glob 逐字对齐(SSOT);删除幽灵目录(audit/evidence_graph/dialogue),
// 补齐 api/statistics/golden_vectors/real_backends/benchmark/db/science_harness-adapters/confounding_gate/report/trace/cli/comparison/scripts。
const TEST_GLOBS = [
  'tests/api/*.test.ts',
  'tests/llm_gateway/*.test.ts',
  'tests/schema/*.test.ts',
  'tests/evidence_log/*.test.ts',
  'tests/falsifiability/*.test.ts',
  'tests/fec/*.test.ts',
  'tests/math/*.test.ts',
  'tests/statistics/*.test.ts',
  'tests/golden_vectors/*.test.ts',
  'tests/real_backends/*.test.ts',
  'tests/demo_seeds/*.test.ts',
  'tests/benchmark/*.test.ts',
  'tests/db/*.test.ts',
  'tests/far_proof/*.test.ts',
  'tests/science_harness/*.test.ts',
  'tests/science_harness/adapters/*.test.ts',
  'tests/confounding_gate/*.test.ts',
  'tests/proof_envelope/*.test.ts',
  'tests/proof_envelope/v2/*.test.ts',
  'tests/report/*.test.ts',
  'tests/trace/*.test.ts',
  'tests/cli/*.test.ts',
  'tests/anti_theater/*.test.ts',
  'tests/agent_loop/*.test.ts',
  'tests/comparison/*.test.ts',
  'tests/scripts/*.test.mjs',
];

const includeArgs = CORE_DIRS.flatMap((dir) => [
  '--test-coverage-include',
  `src/${dir}/**`,
]);

const args = [
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-lines=85',
  '--test-coverage-branches=75',
  ...includeArgs,
  ...TEST_GLOBS,
];

console.log('═══════════════════════════════════════════');
console.log('  Z16 Core Coverage Gate (Node 24 native)');
console.log('  阈值: line ≥85% / branch ≥75% (Z16 SSOT)');
console.log('  Core:', CORE_DIRS.join(', '));
console.log('═══════════════════════════════════════════');

// 捕获输出：需要区分「测试失败」与「阈值不达标」两类非零退出（2026-08-16
// PR #49 事故：memory_bounded 性能测试在覆盖率插桩下 flake → 门禁打出误导性的
// 「低于阈值」横幅，排障被带偏）。判别：`fail 0` + 非零退出 = 阈值不达标；
// `fail N>0` = 覆盖率运行内测试失败（可能是插桩下的性能 flake，非覆盖回归）。
const result = spawnSync(process.execPath, args, {
  stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 256 * 1024 * 1024,
});
const output = result.stdout ?? '';
if (output.length > 0) process.stdout.write(output);

const code = result.status ?? 1;
const failMatch = /ℹ fail (\d+)/.exec(output);
const failedTests = failMatch !== null ? Number(failMatch[1]) : null;

if (code === 0) {
  console.log('═══════════════════════════════════════════');
  console.log('✅ Z16 COVERAGE GATE: PASS (Core ≥85% line / ≥75% branch)');
  console.log('═══════════════════════════════════════════');
} else if (failedTests !== null && failedTests > 0) {
  console.error('═══════════════════════════════════════════');
  console.error(`❌ Z16 COVERAGE GATE: TESTS FAILED inside the coverage run (${failedTests} failing) —`);
  console.error('   this is a test failure under instrumentation (perf/memory flake candidates:');
  console.error('   tests/benchmark/memory_bounded 等), NOT a coverage-threshold regression.');
  console.error('   Threshold verdict unknown until the failing test passes. Rerun the job first.');
  console.error('═══════════════════════════════════════════');
} else {
  console.error('═══════════════════════════════════════════');
  console.error('❌ Z16 COVERAGE GATE: FAIL (Core 低于阈值 — tests passed, thresholds breached)');
  console.error('═══════════════════════════════════════════');
}
process.exit(code);
