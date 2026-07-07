// tests/scripts/privacy_scan.test.mjs
// 测 scripts/privacy_scan.mjs（W0-7 privacy-scan CI）: 真实泄露→exit 1，env 变量名引用→exit 0，真实仓库→exit 0。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCAN = join(process.cwd(), 'scripts', 'privacy_scan.mjs');

function runScan(cwd) {
  const r = spawnSync('node', [SCAN], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function makeTempRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'privscan-'));
  spawnSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf8' });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
    spawnSync('git', ['-C', dir, 'add', name], { encoding: 'utf8' });
  }
  return dir;
}

test('privacy_scan: 真实仓库零泄露 → exit 0', () => {
  const r = runScan(process.cwd());
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  assert.match(r.stdout, /零疑似密钥泄露/);
});

test('privacy_scan: 真实密钥形状 → exit 1（3 类捕获）', () => {
  const dir = makeTempRepo({
    'leak.ts': [
      'const k = "sk-wsJLabcdefghijklmnopqrst1234567890";',
      'const a = "AKIAIOSFODNN7EXAMPLE";',
      'const g = "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD";',
    ].join('\n'),
  });
  try {
    const r = runScan(dir);
    assert.equal(r.status, 1, '真实密钥形状必须 exit 1');
    assert.match(r.stderr, /dashscope_or_openai_key/);
    assert.match(r.stderr, /aws_access_key_id/);
    assert.match(r.stderr, /github_pat/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('privacy_scan: env 变量名引用 + 占位符 → exit 0（allowlist）', () => {
  const dir = makeTempRepo({
    'safe.ts': [
      'const key = process.env.DASHSCOPE_API_KEY;',
      '// 示例: DASHSCOPE_API_KEY=sk-xxx（占位符，非真实 key）',
      'const placeholder = "sk-test";',
    ].join('\n'),
  });
  try {
    const r = runScan(dir);
    assert.equal(r.status, 0, 'env 变量名引用与占位符不应触发 exit 1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('privacy_scan: private key block → exit 1', () => {
  const dir = makeTempRepo({
    'key.pem': '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\n',
  });
  try {
    const r = runScan(dir);
    assert.equal(r.status, 1, 'private key block 必须 exit 1');
    assert.match(r.stderr, /private_key_block/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
