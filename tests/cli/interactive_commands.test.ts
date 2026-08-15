// tests/cli/interactive_commands.test.ts
// 端到端测试：far ask / stream / replay / court / arena / init（spec §9.2 全命令实装验证）。
//
// 真实依赖：每个命令 spawn `src/cli/far.ts` 跑真实 executeLoop（runAgentLoop + ASK-9 密封）
// 离线 fixture 回放。证明「6-stage FSM 端到端 + 证据链工程 + 确定性裁决内核接线」，非桩。
// 诚实边界：offline_replay fixture 固定 → verdict 固定；本测试验证命令可用性 + 输出形状，非科学裁决。

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert';

function runFar(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['src/cli/far.ts', ...args], {
    encoding: 'utf8',
    timeout: 120000,
  });
}

function makeTmpDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `far-${label}-`));
}

test('far ask: 6-stage FSM + verdict + chain（offline quick）', () => {
  const r = runFar(['ask', 'Does the model improve accuracy', '--mode', 'quick', '--profile', 'offline_replay']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /verdict/);
  assert.match(r.stdout, /chain/);
  assert.match(r.stdout, /R7_PRIMARY_TEST_CONFIRMS/);
  assert.match(r.stdout, /offline_replay fixture/); // 诚实标注
  // B-5：offline_replay 必须在 verdict 之前、输出顶部以醒目 banner 披露（不可误读为 live）
  assert.match(r.stdout, /OFFLINE REPLAY MODE \(dev\/CI only\)/);
  assert.ok(
    r.stdout.indexOf('OFFLINE REPLAY MODE') < r.stdout.indexOf('verdict'),
    'offline banner must appear BEFORE the verdict (no fake-demo headline)',
  );
});

test('far ask: --json 产出机器可读结构', () => {
  const r = runFar(['ask', 'json mode test', '--mode', 'quick', '--json', '--profile', 'offline_replay']);
  assert.strictEqual(r.status, 0);
  const obj = JSON.parse(r.stdout) as { verdict: string; chainHeadHash: string; runId: string };
  assert.strictEqual(obj.verdict, 'CONFIRMED');
  assert.ok(/^[0-9a-f]{64}$/.test(obj.chainHeadHash));
  assert.ok(obj.runId.length > 0);
});

test('far ask --export → far verify 闭环（sealed envelope 可重算验证）', () => {
  const dir = makeTmpDir('ask-export');
  try {
    const exp = runFar(['ask', 'export closedloop test', '--mode', 'quick', '--export', dir, '--profile', 'offline_replay']);
    assert.strictEqual(exp.status, 0);
    assert.ok(existsSync(join(dir, 'proof_envelopes.jsonl')), 'bundle 须含 sealed envelope');

    const verify = runFar(['verify', '--bundle', dir]);
    assert.ok(verify.status === 0 || verify.status === undefined);
    assert.match(verify.stdout, /clean/); // tamperStatus clean
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far stream: 实时流式打印每阶段（onArtifact 回调·真流非回放）', () => {
  const r = runFar(['stream', 'streaming test question', '--mode', 'quick']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /stage1_understanding/);
  assert.match(r.stdout, /stage6_feedback/);
  assert.match(r.stdout, /verdict/);
});

test('far repl: 交互式多轮 + fork + history', () => {
  const r = spawnSync(
    process.execPath,
    ['src/cli/far.ts', 'repl'],
    {
      input: 'first question\n:fork refined\n:history\n:quit\n',
      encoding: 'utf8',
      timeout: 120000,
    },
  );
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /feedback_converged/);
  assert.match(r.stdout, /first question refined/); // fork 拼接
  assert.match(r.stdout, /history|verdict=CONFIRMED/i);
});

test('far replay --bundle: 重放证据链 + hash 链 verify', () => {
  const dir = makeTmpDir('replay');
  try {
    runFar(['ask', 'replay source question', '--mode', 'quick', '--export', dir, '--profile', 'offline_replay']);
    const r = runFar(['replay', '--bundle', dir]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /chain head/);
    assert.match(r.stdout, /stage1_understanding/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far replay --db: 从持久化 DB 重放 + verify verified', () => {
  const dir = makeTmpDir('replay-db');
  try {
    runFar(['ask', 'db replay question', '--mode', 'quick', '--export', dir, '--profile', 'offline_replay']);
    const rundb = join(dir + '.rundb');
    assert.ok(existsSync(rundb), 'ask --export 须产出 .rundb');
    const r = runFar(['replay', '--db', rundb]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /verified \(hash chain self-consistent\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    try {
      rmSync(dir + '.rundb', { force: true });
    } catch {
      // ignore
    }
  }
});

test('far court: 多模型法庭 + ReliabilityCertificate（offline 一致）', () => {
  const r = runFar(['court', 'court test claim', '--models', 'alpha,beta']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /agreement : unanimous/);
  assert.match(r.stdout, /alpha.*CONFIRMED/);
  assert.match(r.stdout, /beta.*CONFIRMED/);
  assert.match(r.stdout, /under offline_replay all models replay the same fixture/);
});

test('far arena: 对抗竞技场 + deterministic arbiter（offline ROBUST）', () => {
  const r = runFar(['arena', 'arena test hypothesis', '--refuters', 'attacker1,attacker2']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /original.*CONFIRMED/);
  assert.match(r.stdout, /ROBUST|BREACHED/);
  assert.match(r.stdout, /arbiter is a deterministic rule/);
});

test('far init: DomainPack 脚手架生成（4 文件 + claimClass）', () => {
  const dir = makeTmpDir('init');
  try {
    const r = runFar(['init', 'testdomain', '--out', dir, '--force']);
    assert.strictEqual(r.status, 0);
    assert.ok(existsSync(join(dir, 'domain.config.json')));
    assert.ok(existsSync(join(dir, 'claim.template.json')));
    assert.ok(existsSync(join(dir, 'fec.template.json')));
    assert.ok(existsSync(join(dir, 'README.md')));
    const config = JSON.parse(
      readFileSync(join(dir, 'domain.config.json'), 'utf8'),
    ) as { claimClass: string; name: string };
    assert.strictEqual(config.claimClass, 'TESTDOMAIN');
    assert.strictEqual(config.name, 'testdomain');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
