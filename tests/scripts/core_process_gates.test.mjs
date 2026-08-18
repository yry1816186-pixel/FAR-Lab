// tests/scripts/core_process_gates.test.mjs
//
// CORE 流程族机器层测试：
//   1. secret_scan（CORE-SECRETS-001）——判别力：真泄露命中 / 引用与占位豁免 / 目录免检
//   2. hidden-CoT schema 扫描（CORE-COT-001）——trace/proof schema 无自由形式思维链字段

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execFileSync } from 'node:child_process';

import { scanText } from '../../scripts/secret_scan.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ============================================================
// 1. secret_scan 判别力
// ============================================================

test('secret_scan: 真泄露命中（key 形状 + 高熵赋值）', () => {
  const fakeOpenAiKey = ['sk-', 'abcdefghij', '1234567890', 'abcdefghij12'].join('');
  const keyShape = scanText(`const x = "${fakeOpenAiKey}";`, 'leak.txt');
  assert.equal(keyShape.length >= 1, true);
  assert.match(keyShape[0].kind, /key-shape/);

  const assignment = scanText('const SERVICE_API_KEY = "real-secret-value-123";', 'leak2.txt');
  assert.equal(assignment.some((f) => f.kind === 'assignment:SERVICE_API_KEY'), true);
});

test('secret_scan: 引用/占位/URL/尖括号豁免（不误伤四类合法模式）', () => {
  const clean = scanText([
    'const A = process.env.MY_SERVICE_TOKEN;',
    'const B = "sk-test-placeholder";',
    'const C = "test"; const D = "fake-token-value";',
    '// DOC_TOKEN see https://zenodo.org/account/settings/applications',
    'const E = "<your-token-here>";',
  ].join('\n'), 'safe.txt');
  assert.deepEqual(clean, []);
});

test('secret_scan: 仓库全量扫描零命中（实跑门禁面）', () => {
  const out = execFileSync('node', [join(REPO, 'scripts', 'secret_scan.mjs'), '--root', REPO, '--fail-on-hit'], { encoding: 'utf8' });
  assert.match(out, /PASS — 0 finding/);
});

// ============================================================
// 2. hidden-CoT schema 扫描（CORE-COT-001 锁定）
// ============================================================

/** 自由形式隐藏思维链字段名黑名单（snake/camel 两形）。 */
const COT_FIELD_PATTERNS = [
  /chain[_A-Za-z]*of[_A-Za-z]*thought/i,
  /\bprivateReasoning\b/i,
  /\binternalReasoning\b/i,
  /\bhiddenThoughts?\b/i,
  /\brawThoughts?\b/i,
  /\bscratchpad\b/i,
  /\bmodelThinking\b/i,
];

function scanFileForCoT(path) {
  const text = readFileSync(path, 'utf8');
  const hits = [];
  for (const re of COT_FIELD_PATTERNS) {
    const m = re.exec(text);
    if (m !== null) hits.push(`${path}: ${m[0]}`);
  }
  return hits;
}

function* walkTs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTs(full);
    else if (entry.name.endsWith('.ts')) yield full;
  }
}

test('CORE-COT-001: trace/proof/report schema 层零隐藏思维链字段（属性锁定）', () => {
  const scanRoots = ['src/trace', 'src/proof_envelope', 'src/report', 'src/schema'].map((p) => join(REPO, p));
  const hits = scanRoots.flatMap((root) => [...walkTs(root)].flatMap(scanFileForCoT));
  assert.deepEqual(hits, [], `发现疑似隐藏 CoT 字段：\n${hits.join('\n')}`);
});
