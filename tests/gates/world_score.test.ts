// tests/gates/world_score.test.ts
//
// WORLD-SCORE-001 验收测试：高信号维度评分——真实来源读取、逐维度度量/
// 来源/局限声明、弱项清单、GATES.yaml 解析（含缺失 → null 不可测诚实面）、
// 聚合视图显式标注非目标本身。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeWorldScore,
  parseGatesYamlT0,
  SCORE_BASELINES,
} from '../../src/gates/world_score.ts';
import { BENCHMARK_SEEDS } from '../../src/demo_seeds/registry.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const GATES_YAML_FIXTURE = `# T0 / T1 Gate View — GENERATED
t0:
  total: 125
  byStatus:
    PASS: 121
    FAIL: 4
    BLOCKED_EXTERNAL: 0
    DEFERRED: 0
    NOT_APPLICABLE: 0
t1:
  total: 49
  byStatus:
    PASS: 10
`;

test('parseGatesYamlT0: extracts t0 total/pass from the real compiled format; garbage → null', () => {
  const parsed = parseGatesYamlT0(GATES_YAML_FIXTURE);
  assert.deepEqual(parsed, { total: 125, pass: 121 });
  assert.equal(parseGatesYamlT0('nothing here'), null);
  assert.equal(parseGatesYamlT0('t0:\n  total: 0\n'), null); // 无 PASS 行
});

test('real repo: five dimensions computed from real sources with declared provenance', () => {
  // 注入 GATES fixture 路径（worktree 无 .far/requirements 编译产物——CI 生成物）。
  const tmp = mkdtempSync(join(tmpdir(), 'far-ws-'));
  const yamlPath = join(tmp, 'GATES.yaml');
  writeFileSync(yamlPath, GATES_YAML_FIXTURE, 'utf8');
  const report = computeWorldScore({ repoRoot: REPO_ROOT, gatesYamlPath: yamlPath });

  assert.deepEqual(
    report.dimensions.map((d) => d.dimension),
    ['tests-scale-green', 'gate-pass-rate', 'benchmark-coverage', 'red-team-counter-cases', 'honesty-boundaries'],
  );
  for (const d of report.dimensions) {
    assert.ok(d.score === null || (d.score >= 0 && d.score <= 1), `${d.dimension} score in [0,1] or null`);
    assert.ok(d.measured.length > 0 && d.source.length > 0 && d.limitation.length > 0, `${d.dimension} must declare measured/source/limitation`);
  }

  // 真实数值锚点：benchmark = 30 seeds（registry 真实 import）。
  assert.equal(BENCHMARK_SEEDS.length, SCORE_BASELINES.benchmarkSeeds);
  const bench = report.dimensions.find((d) => d.dimension === 'benchmark-coverage')!;
  assert.equal(bench.score, 1);

  // gate-pass-rate 来自注入 fixture：121/125。
  const gates = report.dimensions.find((d) => d.dimension === 'gate-pass-rate')!;
  assert.ok(gates.score !== null && Math.abs(gates.score - 121 / 125) < 1e-12);

  // 真实仓库红队标记与 Cannot-prove 面应达标（≥1 分）。
  assert.equal(report.dimensions.find((d) => d.dimension === 'red-team-counter-cases')!.score, 1);
  assert.equal(report.dimensions.find((d) => d.dimension === 'honesty-boundaries')!.score, 1);
});

test('missing GATES.yaml → gate-pass-rate is null (unmeasurable, honestly reported) and lands in weak list', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-ws-'));
  const report = computeWorldScore({ repoRoot: REPO_ROOT, gatesYamlPath: join(tmp, 'absent.yaml') });
  const gates = report.dimensions.find((d) => d.dimension === 'gate-pass-rate')!;
  assert.equal(gates.score, null);
  assert.ok(gates.limitation.includes('不可测'));
  assert.ok(report.weakDimensions.some((d) => d.dimension === 'gate-pass-rate'));
  // 聚合视图只在可测维度上平均（null 不混入分母冒充 0）。
  assert.ok(report.aggregateView.value !== null && report.aggregateView.value > 0);
});

test('weak dimension surfaces when a metric regresses below baseline', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-ws-'));
  mkdirSync(join(tmp, 'tests'), { recursive: true });
  mkdirSync(join(tmp, 'src'), { recursive: true });
  writeFileSync(join(tmp, 'tests', 'one.test.ts'), 'export {};', 'utf8');
  writeFileSync(join(tmp, 'src', 'a.ts'), 'export {};', 'utf8');
  // 无 CI 文件 → tests 维度 null（不可测）；其余维度低分。
  const report = computeWorldScore({ repoRoot: tmp });
  const tests = report.dimensions.find((d) => d.dimension === 'tests-scale-green')!;
  assert.equal(tests.score, null);
  assert.ok(report.weakDimensions.length >= 4);
});

test('aggregate view is explicitly marked as navigation overview, not the goal', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-ws-'));
  const yamlPath = join(tmp, 'GATES.yaml');
  writeFileSync(yamlPath, GATES_YAML_FIXTURE, 'utf8');
  const report = computeWorldScore({ repoRoot: REPO_ROOT, gatesYamlPath: yamlPath });
  assert.match(report.aggregateView.note, /NAVIGATION OVERVIEW ONLY/);
  assert.match(report.aggregateView.note, /NOT the goal itself/);
  assert.match(report.aggregateView.note, /scientific utility/);
});
