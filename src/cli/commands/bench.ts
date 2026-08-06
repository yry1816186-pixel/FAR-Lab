// src/cli/commands/bench.ts
// `far bench run` exposes the existing offline demo benchmark profile as a real CLI command.
//
// Boundary: this is the deterministic engineering-integrity demo profile backed by
// tests/demo_seeds. It is not a scientific leaderboard and does not call a live LLM.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { runBenchmark, type SeedRunner } from '../../benchmark/index.ts';
import type { BenchmarkReportV2 } from '../../benchmark/report_schema.ts';

/** Input parameters for operations involving bench run options. */
export interface BenchRunOptions {
  readonly json: boolean;
  readonly outputPath?: string;
  readonly generatedAt?: string;
  readonly gitCommitSha?: string | null;
  readonly domain?: string;
}

/**
 * run bench run.
 */
export async function runBenchRun(options: BenchRunOptions): Promise<number> {
  try {
    const seeds = selectBenchSeeds(await loadDemoBenchmarkSeeds(), options.domain);
    if (seeds.length === 0) {
      process.stderr.write(`far bench run: --domain '${options.domain ?? ''}' matched no demo seeds\n`);
      return 2;
    }

    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const report = await runBenchmark(seeds, {
      now: () => generatedAt,
      gitCommitSha: options.gitCommitSha ?? null,
    });

    const jsonOutput = `${JSON.stringify(report, null, 2)}\n`;
    if (options.outputPath !== undefined) {
      mkdirSync(dirname(options.outputPath), { recursive: true });
      writeFileSync(options.outputPath, jsonOutput, 'utf8');
    }

    if (options.json) {
      process.stdout.write(jsonOutput);
    } else {
      process.stdout.write(renderBenchRunSummary(report, options.outputPath));
    }
    return 0;
  } catch (error) {
    process.stderr.write(`far bench run: failed — ${errorMessage(error)}\n`);
    return 1;
  }
}

/**
 * select bench seeds.
 */
export function selectBenchSeeds(
  seeds: readonly SeedRunner[],
  domain: string | undefined,
): readonly SeedRunner[] {
  if (domain === undefined) {
    return seeds;
  }
  return seeds.filter((seed) => seed.domain === domain);
}

async function loadDemoBenchmarkSeeds(): Promise<readonly SeedRunner[]> {
  // Keep ordinary CLI commands light: the test-backed demo seed registry is loaded only
  // when `far bench run` is invoked.
  const module = await import('../../demo_seeds/registry.ts');
  return module.BENCHMARK_SEEDS;
}

function renderBenchRunSummary(report: BenchmarkReportV2, outputPath: string | undefined): string {
  const lines = [
    'FAR-Bench Demo Run (offline fixture · engineering integrity profile)',
    '════════════════════════════════════════════════════════════',
    outputPath !== undefined ? `report written       : ${outputPath}` : undefined,
    `generatedAt          : ${report.generatedAt}`,
    `problems             : ${report.problemCount}`,
    `suiteIntegrityRoot   : ${report.suiteIntegrityRoot}`,
    `totalLeaves          : ${report.totalLeaves}`,
    `verdictDistribution  : ${JSON.stringify(report.verdictDistribution)}`,
    `domainDistribution   : ${JSON.stringify(report.domainDistribution)}`,
    'boundary             : verdicts are offline fixture outputs, not scientific acceptance',
    '════════════════════════════════════════════════════════════',
    '',
  ].filter((line): line is string => line !== undefined);

  return lines.join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
