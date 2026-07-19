import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  buildProofEnv,
  DASHSCOPE_ENV_KEYS,
  parseTapVerdicts,
  verdictForProof,
} from '../../scripts/credential_dual_run.mjs';

test('credential_dual_run: skipped proof subtest is SKIP, not PASS', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: qwen_adapter: real DashScope HTTP (line 73) — env-gated, no mock',
    'ok 6 - qwen_adapter: real DashScope HTTP (line 73) — env-gated, no mock # SKIP DashScope transient failure (status 500)',
    '1..6',
    '# pass 5',
    '# skipped 1',
  ].join('\n');

  assert.equal(
    verdictForProof(tap, 'qwen_adapter: real DashScope HTTP (line 73) — env-gated, no mock'),
    'SKIP',
  );
});

test('credential_dual_run: exact CJK proof name PASS is recognized', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: real_429穿透_fallback_chain',
    'ok 1 - real_429穿透_fallback_chain',
    '1..1',
  ].join('\n');

  assert.equal(verdictForProof(tap, 'real_429穿透_fallback_chain'), 'PASS');
});

test('credential_dual_run: duplicate conflicting proof verdicts fail closed as UNKNOWN', () => {
  const verdicts = parseTapVerdicts([
    'ok 1 - dup_proof',
    'not ok 2 - dup_proof',
    '1..2',
  ].join('\n'));

  assert.equal(verdicts.get('dup_proof'), 'UNKNOWN');
});

test('credential_dual_run: P1-2 local HTTP proof runs without external credentials', () => {
  const env = { ...process.env };
  for (const key of DASHSCOPE_ENV_KEYS) {
    delete env[key];
  }
  delete env.FAR_ONLINE;

  const run = spawnSync(process.execPath, ['scripts/credential_dual_run.mjs'], {
    encoding: 'utf8',
    env,
    timeout: 30_000,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

  assert.equal(run.status, 0, output);
  assert.match(output, /\[P1-2\] RUN/);
  assert.match(output, /\[P1-2\] .*PASS/);
  assert.match(output, /\[P1-3\] SKIP/);
  assert.match(output, /汇总：PASS 1 · SKIP 2 · FAIL 0/);
});

test('credential_dual_run: proof child env strips node:test context variables', () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = 'recursive-context';
  try {
    const childEnv = buildProofEnv();
    assert.equal(childEnv.NODE_TEST_CONTEXT, undefined);
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_TEST_CONTEXT;
    } else {
      process.env.NODE_TEST_CONTEXT = previous;
    }
  }
});
