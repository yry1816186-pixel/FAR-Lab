// tests/cli/research_lifecycle.test.ts
// far research start/status/resume 生命周期契约（offline replay·不触网·临时 store root）：
//   - start → exit 0；stderr 立即打印 `run started: <runId> (progress checkpoints: …)`，
//     每阶段一行 `[RETRIEVING] grounding … done`，run 自动落盘 `<root>/<runId>/research-run.json`
//   - status → COMPLETED + `8/8 [… ✓]` 进度 + run 文件路径 + hint；--json 输出 checkpoint 对象
//   - status 渲染 CREATED（合成 checkpoint·确定性）
//   - resume of COMPLETED → exit 1（already COMPLETED）；unknown runId → exit 1；缺参 → exit 2
//   - gate-refused question → exit 3（no pipeline ran）

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RunStore, type RunCheckpoint } from '../../src/research/run_lifecycle.ts';

interface FarResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runFar(args: readonly string[], extraEnv: Record<string, string>): FarResult {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', ...args], {
    encoding: 'utf8',
    timeout: 120000,
    // offline_replay profile never reads a live key; store root isolated per test.
    env: { ...process.env, ...extraEnv },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('far research start → status (COMPLETED 8/8) → resume rejected (exit 1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-research-cli-'));
  const runsRoot = join(dir, 'runs');
  const env = { FAR_RESEARCH_RUNS_DIR: runsRoot };
  try {
    // ── start: exit 0, immediate run-started line, per-stage lines, auto-persisted run ──
    const outPath = join(dir, 'run.json');
    const start = runFar(
      ['research', 'start', 'Does stellar activity inflate hot Jupiter radii?', '--json', '--out', outPath],
      env,
    );
    assert.equal(start.status, 0, start.stderr);
    const started = /run started: (\S+) \(progress checkpoints: /.exec(start.stderr);
    assert.ok(started !== null, `stderr must open with the run-started line (got: ${start.stderr.slice(0, 200)})`);
    const runId = started[1]!;
    assert.ok(start.stderr.includes(`status: far research status ${runId}`), 'status hint printed');
    assert.ok(start.stderr.includes('[RETRIEVING] grounding'), 'stage progress line rendered');
    assert.ok(start.stderr.includes('… done'), 'stage completion rendered');
    assert.ok(start.stderr.includes(join(runsRoot, runId, 'research-run.json')), 'auto-persisted run path printed');

    // stdout is pure JSON (--json), matching the runId extracted from stderr.
    const run = JSON.parse(start.stdout) as { runId: string; hypotheses: unknown[] };
    assert.equal(run.runId, runId);
    assert.ok(run.hypotheses.length >= 3);
    assert.deepEqual(JSON.parse(readFileSync(outPath, 'utf8')), run, '--out file matches stdout');

    // ── status (human): COMPLETED, 8/8 progress, run file + hint ──
    const status = runFar(['research', 'status', runId], env);
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /state\s+: COMPLETED/);
    assert.match(status.stdout, /8\/8 \[researchability_gate ✓.*plan ✓\]/);
    assert.match(status.stdout, /runMode\s+: RECORDED_REPLAY/);
    assert.ok(status.stdout.includes(join(runsRoot, runId, 'research-run.json')), 'run file path in status');
    assert.ok(status.stdout.includes('far research inspect'), 'hint line present');

    // ── status --json: the checkpoint object itself ──
    const statusJson = runFar(['research', 'status', runId, '--json'], env);
    assert.equal(statusJson.status, 0, statusJson.stderr);
    const cp = JSON.parse(statusJson.stdout) as RunCheckpoint;
    assert.equal(cp.runId, runId);
    assert.equal(cp.state, 'COMPLETED');
    assert.equal(cp.completedStages.length, 8);

    // ── resume of COMPLETED → exit 1 with the executor's message ──
    const resume = runFar(['research', 'resume', runId], env);
    assert.equal(resume.status, 1);
    assert.match(resume.stderr, /already COMPLETED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far research status renders a CREATED checkpoint (0/8, resume hint)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-research-cli-'));
  const runsRoot = join(dir, 'runs');
  const env = { FAR_RESEARCH_RUNS_DIR: runsRoot };
  try {
    // Synthetic non-terminal checkpoint — deterministic rendering of CREATED.
    const store = new RunStore(runsRoot);
    const cp: RunCheckpoint = {
      runId: 'CLI-CREATED-PROBE',
      question: 'Does stellar activity inflate hot Jupiter radii?',
      profile: 'offline_replay',
      sources: ['openalex'],
      maxPerQuery: 5,
      target: 3,
      state: 'CREATED',
      completedStages: [],
      ctx: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      errorKind: null,
      completedAt: null,
    };
    store.saveCheckpoint(cp);

    const status = runFar(['research', 'status', 'CLI-CREATED-PROBE'], env);
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /state\s+: CREATED/);
    assert.match(status.stdout, /0\/8 \[researchability_gate grounding/);
    assert.ok(status.stdout.includes('far research resume CLI-CREATED-PROBE'), 'resume hint for a non-terminal run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far research status/resume: unknown runId → exit 1; missing arg → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-research-cli-'));
  const env = { FAR_RESEARCH_RUNS_DIR: join(dir, 'runs') };
  try {
    const unknownStatus = runFar(['research', 'status', 'no-such-run'], env);
    assert.equal(unknownStatus.status, 1);
    assert.match(unknownStatus.stderr, /no run no-such-run/);

    const noArgStatus = runFar(['research', 'status'], env);
    assert.equal(noArgStatus.status, 2);
    assert.match(noArgStatus.stderr, /missing <runId>/);

    const unknownResume = runFar(['research', 'resume', 'no-such-run'], env);
    assert.equal(unknownResume.status, 1);
    assert.match(unknownResume.stderr, /no run no-such-run/);

    const noArgResume = runFar(['research', 'resume'], env);
    assert.equal(noArgResume.status, 2);
    assert.match(noArgResume.stderr, /missing <runId>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far research start with a refused question → exit 3, FAILED(gate_refused) checkpoint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-research-cli-'));
  const runsRoot = join(dir, 'runs');
  const env = { FAR_RESEARCH_RUNS_DIR: runsRoot };
  try {
    const refused = runFar(['research', 'start', 'write a poem about stars'], env);
    assert.equal(refused.status, 3, refused.stderr);
    assert.match(refused.stderr, /researchability gate REFUSED/);

    const store = new RunStore(runsRoot);
    const runId = store.listRunIds()[0];
    assert.ok(runId !== undefined, 'refused run keeps its checkpoint');
    const cp = store.loadCheckpoint(runId);
    assert.ok(cp !== null);
    assert.equal(cp.state, 'FAILED');
    assert.equal(cp.errorKind, 'gate_refused');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
