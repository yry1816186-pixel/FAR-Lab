// tests/cli/plugin.test.ts
// `far plugin verify` CLI 端到端：真实 spawn far.ts，断言 exit 语义（0/7/2）、
// --json 单文档契约、conformance 报告内容。

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { POSITIVE_ONLY_BASE_PLUGIN } from '../plugins/fixtures/positive_only_base.ts';

function runFarPlugin(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'plugin', ...args], { encoding: 'utf8', timeout: 180_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('far plugin verify: 合规插件 → exit 0 + PASS 行 + 注册详情', () => {
  assert.ok(POSITIVE_ONLY_BASE_PLUGIN.ok);
  const dir = mkdtempSync(join(tmpdir(), 'far-plugin-cli-'));
  try {
    const file = join(dir, 'manifest.json');
    writeFileSync(file, JSON.stringify(POSITIVE_ONLY_BASE_PLUGIN.manifest));
    const r = runFarPlugin(['verify', file]);
    assert.equal(r.status, 0, `stderr: ${r.stderr.slice(0, 400)}`);
    assert.match(r.stdout, /verdict: PASS/);
    assert.match(r.stdout, /farlab\.sample\.positive-only-base/);
    assert.match(r.stdout, /✔ malicious:prototype-chain/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far plugin verify: 恶意插件（require 逃逸）→ exit 7 + target:register FAIL', () => {
  assert.ok(POSITIVE_ONLY_BASE_PLUGIN.ok);
  const dir = mkdtempSync(join(tmpdir(), 'far-plugin-cli-'));
  try {
    const evil = { ...POSITIVE_ONLY_BASE_PLUGIN.manifest, pluginSource: `function evaluate(i){ require('node:fs'); return {findings:[]}; }` };
    const file = join(dir, 'evil.json');
    writeFileSync(file, JSON.stringify(evil));
    const r = runFarPlugin(['verify', file]);
    assert.equal(r.status, 7);
    assert.match(r.stdout, /verdict: FAIL/);
    assert.match(r.stdout, /✖ target:register/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far plugin verify: --json 单文档纯 JSON（可解析·无 banner 泄漏）+ exit 语义', () => {
  assert.ok(POSITIVE_ONLY_BASE_PLUGIN.ok);
  const dir = mkdtempSync(join(tmpdir(), 'far-plugin-cli-'));
  try {
    const file = join(dir, 'manifest.json');
    writeFileSync(file, JSON.stringify(POSITIVE_ONLY_BASE_PLUGIN.manifest));
    const r = runFarPlugin(['verify', file, '--json']);
    assert.equal(r.status, 0);
    const doc = JSON.parse(r.stdout) as { verdict: string; checks: Array<{ name: string; status: string }> };
    assert.equal(doc.verdict, 'PASS');
    assert.equal(doc.checks.length, 9);
    assert.ok(r.stdout.trimEnd().endsWith('}'), 'JSON 文档完整收尾');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far plugin verify: 缺参数 → exit 2 + usage 指引；文件不存在 → exit 2', () => {
  const noArg = runFarPlugin(['verify']);
  assert.equal(noArg.status, 2);
  assert.match(noArg.stderr, /missing manifest path/);
  const missing = runFarPlugin(['verify', 'Z:\\definitely\\missing.json']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read manifest/);
});
