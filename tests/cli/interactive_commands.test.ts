// End-to-end CLI tests for interactive and workflow commands.
// Offline ask/replay cases are explicit engineering fixtures. Arena and court
// tests assert the new production truth boundary: no canned assessment.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert';

import { RUNTIME_API_KEY_ENV_NAMES } from '../../src/llm_gateway/runtime_gateway.ts';

function runFar(args: readonly string[]): SpawnSyncReturns<string> {
  const env = { ...process.env };
  for (const name of RUNTIME_API_KEY_ENV_NAMES) {
    delete env[name];
  }
  // hermetic 凭据真空：CLI 入口默认水合仓库真实 .env（arena/court 的
  // credential-absence 断言会被开发机真实 key 污染）——显式关闭水合。
  env.FAR_DOTENV = 'off';
  return spawnSync(process.execPath, ['src/cli/far.ts', ...args], {
    encoding: 'utf8',
    timeout: 120000,
    env,
  });
}

function makeTmpDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `far-${label}-`));
}

test('far ask: explicit offline engineering replay runs the six-stage wiring', () => {
  const result = runFar([
    'ask',
    'Does the model improve accuracy',
    '--mode',
    'quick',
    '--profile',
    'offline_replay',
  ]);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /verdict/);
  assert.match(result.stdout, /chain/);
  assert.match(result.stdout, /R7_PRIMARY_TEST_CONFIRMS/);
  assert.match(result.stdout, /offline_replay fixture/);
  assert.match(result.stdout, /OFFLINE REPLAY MODE \(dev\/CI only\)/);
  assert.ok(result.stdout.indexOf('OFFLINE REPLAY MODE') < result.stdout.indexOf('verdict'));
});

test('far ask: --json emits a machine-readable explicit replay result', () => {
  const result = runFar([
    'ask',
    'json mode test',
    '--mode',
    'quick',
    '--json',
    '--profile',
    'offline_replay',
  ]);
  assert.strictEqual(result.status, 0);
  const object = JSON.parse(result.stdout) as {
    verdict: string;
    chainHeadHash: string;
    runId: string;
  };
  assert.strictEqual(object.verdict, 'CONFIRMED');
  assert.ok(/^[0-9a-f]{64}$/.test(object.chainHeadHash));
  assert.ok(object.runId.length > 0);
});

test('far ask --export closes through far verify', () => {
  const directory = makeTmpDir('ask-export');
  try {
    const exported = runFar([
      'ask',
      'export closedloop test',
      '--mode',
      'quick',
      '--export',
      directory,
      '--profile',
      'offline_replay',
    ]);
    assert.strictEqual(exported.status, 0);
    assert.ok(existsSync(join(directory, 'proof_envelopes.jsonl')));

    const verified = runFar(['verify', '--bundle', directory]);
    assert.ok(verified.status === 0 || verified.status === undefined);
    assert.match(verified.stdout, /clean/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('far stream prints each stage', () => {
  const result = runFar(['stream', 'streaming test question', '--mode', 'quick']);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /stage1_understanding/);
  assert.match(result.stdout, /stage6_feedback/);
  assert.match(result.stdout, /verdict/);
});

test('far repl supports multi-turn, fork, and history', () => {
  const result = spawnSync(process.execPath, ['src/cli/far.ts', 'repl'], {
    input: 'first question\n:fork refined\n:history\n:quit\n',
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /feedback_converged/);
  assert.match(result.stdout, /first question refined/);
  assert.match(result.stdout, /history|verdict=CONFIRMED/i);
});

test('far replay --bundle verifies the exported evidence chain', () => {
  const directory = makeTmpDir('replay');
  try {
    runFar([
      'ask',
      'replay source question',
      '--mode',
      'quick',
      '--export',
      directory,
      '--profile',
      'offline_replay',
    ]);
    const result = runFar(['replay', '--bundle', directory]);
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /chain head/);
    assert.match(result.stdout, /stage1_understanding/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('far replay --db verifies a persisted evidence chain', () => {
  const directory = makeTmpDir('replay-db');
  try {
    runFar([
      'ask',
      'db replay question',
      '--mode',
      'quick',
      '--export',
      directory,
      '--profile',
      'offline_replay',
    ]);
    const runDatabase = `${directory}.rundb`;
    assert.ok(existsSync(runDatabase));
    const result = runFar(['replay', '--db', runDatabase]);
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /verified \(hash chain self-consistent\)/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    try {
      rmSync(`${directory}.rundb`, { force: true });
    } catch {
      // Cleanup is best-effort after the primary assertions.
    }
  }
});

test('far court returns NOT_SUPPORTED instead of a fabricated cross-model certificate', () => {
  const result = runFar(['court', 'court test claim', '--models', 'alpha,beta']);
  assert.strictEqual(result.status, 3);
  assert.match(result.stderr, /NOT_SUPPORTED/);
  assert.match(result.stderr, /independently configured model targets/);
  assert.doesNotMatch(result.stdout, /unanimous/);
});

test('far arena without a live key returns REQUIRES_CONFIGURATION and no robustness result', () => {
  const result = runFar(['arena', 'arena test hypothesis', '--refuters', 'attacker1,attacker2']);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /REQUIRES_CONFIGURATION/);
  assert.match(result.stderr, /offline fixtures are test-only/);
  assert.doesNotMatch(result.stdout, /ROBUST|BREACHED/);
});

test('far init generates a four-file DomainPack scaffold', () => {
  const directory = makeTmpDir('init');
  try {
    const result = runFar(['init', 'testdomain', '--out', directory, '--force']);
    assert.strictEqual(result.status, 0);
    assert.ok(existsSync(join(directory, 'domain.config.json')));
    assert.ok(existsSync(join(directory, 'claim.template.json')));
    assert.ok(existsSync(join(directory, 'fec.template.json')));
    assert.ok(existsSync(join(directory, 'README.md')));
    const config = JSON.parse(
      readFileSync(join(directory, 'domain.config.json'), 'utf8'),
    ) as { claimClass: string; name: string };
    assert.strictEqual(config.claimClass, 'TESTDOMAIN');
    assert.strictEqual(config.name, 'testdomain');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
