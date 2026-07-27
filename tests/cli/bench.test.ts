// tests/cli/bench.test.ts
// Covers `far bench run`: the real CLI wrapper around the deterministic demo benchmark profile.

import { strict as assert } from 'node:assert';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runBenchRun, selectBenchSeeds } from '../../src/cli/commands/bench.ts';
import type { BenchmarkReport } from '../../src/benchmark/types.ts';
import { BENCHMARK_SEEDS } from '../../src/demo_seeds/registry.ts';

const FIXED_GENERATED_AT = '2026-06-29T00:00:00.000Z';
const GOLDEN_SUITE_ROOT = '83265409e9395a4738658e069c7ec441a56673d018180a82168647bb1b17f296';

function parseReport(raw: string): BenchmarkReport {
  return JSON.parse(raw) as BenchmarkReport;
}

function spawnFarBench(args: readonly string[], tmp: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['src/cli/far.ts', 'bench', 'run', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_COMPILE_CACHE: join(tmp, 'node-compile-cache') },
    maxBuffer: 20 * 1024 * 1024,
  });
}

test('selectBenchSeeds filters by exact demo domain', () => {
  const astronomy = selectBenchSeeds(BENCHMARK_SEEDS, '天文学');
  assert.equal(astronomy.length, 2);
  assert.ok(astronomy.every((seed) => seed.domain === '天文学'));
  assert.equal(selectBenchSeeds(BENCHMARK_SEEDS, '不存在领域').length, 0);
});

test('runBenchRun writes deterministic report JSON when generatedAt is fixed', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-bench-run-'));
  try {
    const outPath = join(tmp, 'nested', 'benchmark_report.json');
    const exitCode = await runBenchRun({
      json: false,
      outputPath: outPath,
      generatedAt: FIXED_GENERATED_AT,
      gitCommitSha: null,
    });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(outPath), true);
    const report = parseReport(readFileSync(outPath, 'utf8'));
    assert.equal(report.generatedAt, FIXED_GENERATED_AT);
    assert.equal(report.problemCount, BENCHMARK_SEEDS.length);
    assert.equal(report.suiteIntegrityRoot, GOLDEN_SUITE_ROOT);
    assert.equal(report.gitCommitSha, null);
    assert.ok(report.honestyNotes.some((note) => /fixture/.test(note)));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far bench run CLI emits full BenchmarkReport JSON', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-bench-cli-json-'));
  try {
    const result = spawnFarBench(['--json', '--generated-at', FIXED_GENERATED_AT], tmp);

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout tail:\n${result.stdout.slice(-500)}`);
    const report = parseReport(result.stdout);
    assert.equal(report.generatedAt, FIXED_GENERATED_AT);
    assert.equal(report.suiteIntegrityRoot, GOLDEN_SUITE_ROOT);
    assert.equal(report.problemCount, BENCHMARK_SEEDS.length);
    // 设计意图分布（registry.ts + benchmark_report.json golden SSOT 三方一致 · 30 seed）：
    // CONFIRMED: A8/A11/A16/B2/E2/E3/M2/P3 → 实际 verdict 由 deterministic kernel 决定，
    // 新增 10 seed 后实测分布 CONFIRMED=6/REFUTED=8/INCONCLUSIVE=7/DEGRADED_SCOPE=7/UNTESTED=2。
    assert.equal(report.verdictDistribution.CONFIRMED, 6);
    assert.equal(report.verdictDistribution.REFUTED, 8);
    assert.equal(report.verdictDistribution.INCONCLUSIVE, 7);
    assert.equal(report.verdictDistribution.DEGRADED_SCOPE, 7);
    assert.equal(report.verdictDistribution.UNTESTED, 2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far bench run CLI supports --out and concise human summary', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-bench-cli-out-'));
  try {
    const outPath = join(tmp, 'report with spaces.json');
    const result = spawnFarBench(['--out', outPath, '--generated-at', FIXED_GENERATED_AT], tmp);

    assert.equal(result.status, 0, `stderr:\n${result.stderr}`);
    assert.match(result.stdout, /report written/);
    assert.match(result.stdout, new RegExp(GOLDEN_SUITE_ROOT));
    const report = parseReport(readFileSync(outPath, 'utf8'));
    assert.equal(report.suiteIntegrityRoot, GOLDEN_SUITE_ROOT);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far bench run CLI filters by --domain', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-bench-cli-domain-'));
  try {
    const result = spawnFarBench(['--json', '--domain', '天文学', '--generated-at', FIXED_GENERATED_AT], tmp);

    assert.equal(result.status, 0, `stderr:\n${result.stderr}`);
    const report = parseReport(result.stdout);
    assert.equal(report.problemCount, 2);
    assert.deepEqual(Object.keys(report.domainDistribution), ['天文学']);
    assert.ok(report.entries.every((entry) => entry.domain === '天文学'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far bench run CLI rejects unknown arguments', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-bench-cli-args-'));
  try {
    const result = spawnFarBench(['--surprise'], tmp);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown argument/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
