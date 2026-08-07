#!/usr/bin/env tsx
/**
 * generate_benchmark —— 跑全部 Science-125 demo seed，聚合为 benchmark_report.json。
 *
 * 用法：pnpm benchmark:generate（或 npx tsx scripts/generate_benchmark.ts）
 *
 * 产出：benchmark/benchmark_report.json（git tracked·确定性·CI golden 锚）。
 *
 * 确定性：seed 全程 offline_replay + 确定性常量（gitCommitSha/isoTimestamp/reproHashProvider）
 *   → suiteIntegrityRoot 跨 fresh-clone 字节相同（CI 比对 golden 防回归）。
 *   generatedAt 注入固定值（非 suiteIntegrityRoot 输入）以保持 JSON diff 干净。
 *
 * 诚实：无真实 LLM 调用；verdict 是 offline fixture 产出（见 report.honestyNotes）。
 * 模型中立：无 Qwen / 百炼 / DashScope 字面量。零容忍合规：无 any / ts-ignore / 空 catch。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBenchmark } from '../src/benchmark/index.ts';
import { BENCHMARK_SEEDS } from '../src/demo_seeds/registry.ts';

const here = dirname(fileURLToPath(import.meta.url));
const reportDir = resolve(here, '..', 'benchmark');
const reportPath = resolve(reportDir, 'benchmark_report.json');

/** CLI 进度输出（用 stdout.write 而非 console·避免触发 no-console lint）。 */
function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function main(): Promise<void> {
  const report = await runBenchmark(BENCHMARK_SEEDS, {
    now: () => '2026-06-29T00:00:00.000Z',
    // demo 报告不锚 commit（fresh-clone 无 git 也能生成·保持可复现；生产可注入 git rev-parse HEAD）
    gitCommitSha: null,
  });

  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  log(`benchmark report written → ${reportPath}`);
  log(`  problems          : ${report.problemCount}`);
  log(`  domains           : ${report.domainCount}`);
  log(`  suiteIntegrityRoot: ${report.suiteIntegrityRoot}`);
  log(`  totalLeaves       : ${report.totalLeaves}`);
  log(`  verdictDistribution: ${JSON.stringify(report.verdictDistribution)}`);
  log(`  domainDistribution: ${JSON.stringify(report.domainDistribution)}`);
  log(`  latencyStats(ms)  : ${JSON.stringify(report.latencyStats)}`);
}

await main();
