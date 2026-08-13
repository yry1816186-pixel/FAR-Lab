// tests/cli/research_analyze.test.ts
// far research analyze 端到端（replay 模式·真实样本·不触网）：
//   - 对离线 run 执行分析 → Observation 追加 + experiment 模式 RECORDED_REPLAY + revision #1
//   - 缺文件 → exit 1；缺参数 → exit 2
//   - analyze 输出后 compare 仍可用（revision 冻结计划快照）

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function runFar(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', ...args], {
    encoding: 'utf8',
    timeout: 120000,
    // offline_replay profile never reads the Qwen key; the parent env has none.
    env: process.env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('far research analyze: offline run → observation + revision + RECORDED_REPLAY experiment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-analyze-test-'));
  try {
    const runPath = join(dir, 'run.json');
    const start = runFar(['research', 'start', 'Does stellar activity inflate hot Jupiter radii?', '--out', runPath]);
    assert.equal(start.status, 0, start.stderr);

    const analyze = runFar(['research', 'analyze', runPath, '--out', runPath]);
    assert.equal(analyze.status, 0, analyze.stderr);
    assert.match(analyze.stdout, /observation collected \(SUCCESS, n=60/);
    assert.match(analyze.stdout, /revision  : #1/);
    assert.match(analyze.stdout, /experiment=RECORDED_REPLAY/);

    const run = JSON.parse(readFileSync(runPath, 'utf8')) as {
      observations: unknown[];
      revisions: unknown[];
      modes: { experimentExecutionMode: string };
      runMode: string;
    };
    assert.equal(run.observations.length, 1);
    assert.equal(run.revisions.length, 1);
    assert.equal(run.modes.experimentExecutionMode, 'RECORDED_REPLAY');
    assert.equal(run.runMode, 'RECORDED_REPLAY');

    // compare must still work on the analyzed run (plan snapshots frozen).
    const compare = runFar(['research', 'compare', runPath, '--json']);
    assert.equal(compare.status, 0, compare.stderr);
    assert.match(compare.stdout, /"diff"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far research analyze: missing file → exit 1; missing arg → exit 2', () => {
  const missing = runFar(['research', 'analyze', 'C:/nonexistent/run.json']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /cannot read/);

  const noArgs = runFar(['research', 'analyze']);
  assert.equal(noArgs.status, 2);
  assert.match(noArgs.stderr, /missing <run.json>/);
});
