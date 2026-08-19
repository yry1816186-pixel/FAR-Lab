// tests/platform/dotenv.test.ts
// src/platform/dotenv.ts 的判别测试——每个用例针对一个真实语义分支：
// 解析（注释/空行/畸形行/export 前缀/引号/CRLF/空值/首次优先）、
// 水合（env 优先/缺失 no-op/值不泄漏）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateEnvFromDotEnv, parseDotEnv } from '../../src/platform/dotenv.ts';

test('parseDotEnv: basic KEY=VALUE pairs', () => {
  assert.deepEqual(parseDotEnv('A=1\nB=two'), { A: '1', B: 'two' });
});

test('parseDotEnv: skips blank lines, comments, and malformed lines', () => {
  const content = '# comment\n\n   \nNO_EQUALS_SIGN\n=missing-key\nOK=yes\n';
  assert.deepEqual(parseDotEnv(content), { OK: 'yes' });
});

test('parseDotEnv: export prefix is accepted', () => {
  assert.deepEqual(parseDotEnv('export TOKEN=abc'), { TOKEN: 'abc' });
});

test('parseDotEnv: one pair of surrounding quotes is stripped (single or double)', () => {
  assert.deepEqual(parseDotEnv('A="quoted"\nB=\'single\'\nC=unquoted'), {
    A: 'quoted',
    B: 'single',
    C: 'unquoted',
  });
});

test('parseDotEnv: CRLF line endings parse identically to LF', () => {
  assert.deepEqual(parseDotEnv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});

test('parseDotEnv: empty value (KEY=) is preserved as empty string', () => {
  assert.deepEqual(parseDotEnv('EMPTY='), { EMPTY: '' });
});

test('parseDotEnv: first occurrence of a duplicate key wins', () => {
  assert.deepEqual(parseDotEnv('K=first\nK=second'), { K: 'first' });
});

test('parseDotEnv: value containing = keeps everything after the first =', () => {
  assert.deepEqual(parseDotEnv('URL=https://x.test?a=b'), { URL: 'https://x.test?a=b' });
});

test('hydrateEnvFromDotEnv: missing file is a complete no-op', () => {
  const env: NodeJS.ProcessEnv = {};
  const result = hydrateEnvFromDotEnv(env, join(tmpdir(), 'far-dotenv-definitely-absent-xyz'));
  assert.deepEqual(result, { loadedKeys: [], filePresent: false });
  assert.deepEqual(env, {});
});

test('hydrateEnvFromDotEnv: loads keys and reports names only (values never returned)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-dotenv-'));
  try {
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'SECRET_KEY=super-secret-value\n# note\n', 'utf8');
    const env: NodeJS.ProcessEnv = {};
    const result = hydrateEnvFromDotEnv(env, envPath);
    assert.equal(env.SECRET_KEY, 'super-secret-value');
    assert.deepEqual(result.loadedKeys, ['SECRET_KEY']);
    assert.equal(result.filePresent, true);
    // 返回值/字符串化结果中绝不包含值（防泄漏契约）
    assert.equal(JSON.stringify(result).includes('super-secret-value'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hydrateEnvFromDotEnv: pre-existing environment variable always wins over .env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-dotenv-'));
  try {
    const envPath = join(dir, '.env');
    // 键名用中性占位（zero_tolerance_scan 禁止测试字面引用真实凭据 env 名）
    writeFileSync(envPath, 'SAMPLE_TOKEN=from-file\nNEW_KEY=from-file\n', 'utf8');
    const env: NodeJS.ProcessEnv = { SAMPLE_TOKEN: 'from-real-env' };
    const result = hydrateEnvFromDotEnv(env, envPath);
    assert.equal(env.SAMPLE_TOKEN, 'from-real-env'); // 未被覆盖
    assert.equal(env.NEW_KEY, 'from-file');
    assert.deepEqual(result.loadedKeys, ['NEW_KEY']); // 只报告实际写入的键
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
