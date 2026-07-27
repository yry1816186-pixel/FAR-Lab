// scripts/depth_evidence.integration.test.mjs
//
// depth_evidence bot 端到端集成测（真实子进程全链路）。
//   单测覆盖纯逻辑；本测覆盖**真实** git worktree 生命周期 + 真实 `node --test` 子进程
//   + 真实 TAP 捕获 + 真实 DEPTH_LEDGER.md 原子写回，含**正向 UPGRADE** 情形（base-FAIL/head-PASS → WIRED_GREEN）。
//   合成 temp git repo（test 仅用 node: 内置，无需 node_modules），不触碰 FAR-Lab 主仓。
//
// 真实依赖：spawnSync('git', [...]) + spawnSync('node', [bot, ...]) + DEPTH_EVIDENCE_ROOT 重定向 bot 到 temp repo。
// 反假绿：断言 exit code + stdout UPGRADE + ledger 字节级 WIRED_GREEN/evidence/closed_by + worktree 无残留。
//
// Authority: scripts/depth_evidence.mjs 康威不变式（WIRED_GREEN 仅凭 proven base-FAIL/head-PASS）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BOT_PATH = fileURLToPath(new URL('./depth_evidence.mjs', import.meta.url));

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败: ${r.stderr}${r.stdout}`);
  return r.stdout.trim();
}

function ledgerText(rowLine) {
  return [
    '# DEPTH_LEDGER',
    '',
    '## §A. next_action',
    '```',
    'next_action = X',
    '```',
    '',
    '## §C. 深度模块接线表',
    '',
    '| id | dep | proof_caller | proof_test | red | status | closed_by |',
    '|----|-----|--------------|------------|-----|--------|-----------|',
    rowLine,
    '',
    '## §D. 机器门',
    '',
    '散文段（含 P0-X 字样，验证写回不腐蚀散文）。',
  ].join('\n');
}

function newRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'depth-ev-int-'));
  // -b bot-test：避开主仓模板钩子「禁止直提 main」。
  git(repo, ['init', '-q', '-b', 'bot-test']);
  // core.hooksPath 指向不存在的目录 → temp 仓不继承/不运行主仓的 commit-msg 模板钩子
  // （这些钩子是 FAR-Lab 的策略，不应作用于隔离的合成测试仓）。
  git(repo, ['config', 'core.hooksPath', '__disabled-no-such-dir__']);
  git(repo, ['config', 'user.email', 'bot@test']);
  git(repo, ['config', 'user.name', 'bot']);
  return repo;
}

// baseCommit: 写入 FAIL/PASS 测试内容，提交，返回 sha。ledgerRow 决定 §C 行。
function commit(repo, testAssert, ledgerRow, msg) {
  mkdirSync(join(repo, 'tests', 'fec'), { recursive: true });
  writeFileSync(
    join(repo, 'tests', 'fec', 't.test.ts'),
    `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('demo_test', () => { assert.equal(${testAssert}); });\n`,
  );
  writeFileSync(join(repo, 'package.json'), '{"name":"x","type":"module"}');
  if (ledgerRow) {
    mkdirSync(join(repo, 'FAR_LAB_MASTER_PLAN'), { recursive: true });
    writeFileSync(join(repo, 'FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'), ledgerText(ledgerRow), 'utf8');
  }
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', msg]);
  return git(repo, ['rev-parse', 'HEAD']);
}

const LEDGER_ROW = '| P0-X | demo dep | src/x.ts:1 | tests/fec/t.test.ts::demo_test | (待 CI) | WIRED_RED | — |';

function runBot(repo, baseSha, headSha) {
  return spawnSync('node', [BOT_PATH, '--base', baseSha, '--head', headSha], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, DEPTH_EVIDENCE_ROOT: repo },
    timeout: 90_000,
  });
}

test('integration: base-FAIL + head-PASS → 真写 WIRED_GREEN + evidence（真实 git worktree + node --test 全链路）', () => {
  const repo = newRepo();
  try {
    const baseSha = commit(repo, '1, 2', null, 'base: failing test');
    const headSha = commit(repo, '1, 1', LEDGER_ROW, 'head: passing test + ledger');

    const r = runBot(repo, baseSha, headSha);
    assert.equal(r.status, 0, `bot 应 exit 0（UPGRADE）。stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /✓ UPGRADE/);

    const ledger = readFileSync(join(repo, 'FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'), 'utf8');
    assert.match(ledger, /WIRED_GREEN/);
    assert.match(ledger, new RegExp(`evidence: ${baseSha} → ${headSha}`));
    assert.match(ledger, new RegExp(headSha)); // closed_by = headSha
    // 散文未被腐蚀（写回按行 id 锚定，非 text.replace）。
    assert.match(ledger, /散文段（含 P0-X 字样/);

    // worktree 无残留（finally 清理生效）。
    const wl = git(repo, ['worktree', 'list']);
    assert.equal(
      wl.split('\n').filter((l) => l.includes('depth-ev-base') || l.includes('depth-ev-head')).length,
      0,
      `worktree 泄漏:\n${wl}`,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('integration: base-PASS + head-PASS（stale）→ INFO 不写，exit 0，ledger 未动', () => {
  const repo = newRepo();
  try {
    const baseSha = commit(repo, '1, 1', null, 'base: passing test');
    const headSha = commit(repo, '1, 1', LEDGER_ROW, 'head: passing test + ledger');
    const before = readFileSync(join(repo, 'FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'), 'utf8');

    const r = runBot(repo, baseSha, headSha);
    assert.equal(r.status, 0, `stale 应 exit 0（INFO 不升级）。stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /○ INFO/);
    assert.match(r.stdout, /aggregate: 0 upgrade/);

    const after = readFileSync(join(repo, 'FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'), 'utf8');
    assert.equal(after, before, 'stale 情形 ledger 须字节级未改');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('integration: head 测试仍红（base-FAIL + head-FAIL）→ INFO 不写，exit 0', () => {
  const repo = newRepo();
  try {
    const baseSha = commit(repo, '1, 2', null, 'base: failing test');
    const headSha = commit(repo, '1, 3', LEDGER_ROW, 'head: still failing + ledger');
    const before = readFileSync(join(repo, 'FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'), 'utf8');

    const r = runBot(repo, baseSha, headSha);
    assert.equal(r.status, 0, `head 仍红应 exit 0（INFO）。stdout:\n${r.stdout}`);
    assert.match(r.stdout, /○ INFO/);
    assert.match(r.stdout, /aggregate: 0 upgrade/);
    assert.equal(readFileSync(join(repo, 'FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'), 'utf8'), before);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('integration: NO_MATCH（账本测试名不存在）→ ERROR fail-closed，exit 1，不写', () => {
  const repo = newRepo();
  try {
    const baseSha = commit(repo, '1, 2', null, 'base');
    // ledger 指向不存在的测试名 demo_test_TYPO
    const badRow = '| P0-X | demo dep | src/x.ts:1 | tests/fec/t.test.ts::demo_test_TYPO | (待 CI) | WIRED_RED | — |';
    const headSha = commit(repo, '1, 1', badRow, 'head + ledger(typo)');

    const r = runBot(repo, baseSha, headSha);
    assert.equal(r.status, 1, `NO_MATCH 应 exit 1（fail-closed）。stdout:\n${r.stdout}`);
    assert.match(r.stdout, /ERROR/);
    assert.match(r.stdout, /NO_MATCH/);
    // ledger 未被改（仍 WIRED_RED，无 evidence）。
    const after = readFileSync(join(repo, 'FAR_LAB_MASTER_PLAN', 'DEPTH_LEDGER.md'), 'utf8');
    assert.match(after, /WIRED_RED/);
    assert.doesNotMatch(after, /evidence:/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
