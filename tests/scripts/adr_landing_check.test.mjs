/**
 * adr_landing_check.mjs 测试（阶段 7 1125 · P2-C）。
 *
 * 覆盖：
 *   1. 脚本对全部 22 个 ADR 输出锚点命中（rate=100%）
 *   2. 对不存在的锚点会报未命中（脚本有区分能力，非恒真）
 *   3. 退出码语义：全命中 exit 0
 *
 * 诚实边界：脚本锚点=存在性证据；本测试验证脚本自身行为（区分能力），
 * 不验证 ADR 决策的正确性。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..', '..');
const script = join(repoRoot, 'scripts', 'adr_landing_check.mjs');

// .far-design/ 自 2026-08-14 §20 起 untrack 出公共仓库——fresh clone 无 DECISIONS 目录，
// 脚本对 ENOENT 环境性 skip（exit 0 + skip 输出）。spawn 型断言仅在目录存在时执行；
// ANCHORS 导入型断言（下方两测）不依赖文件系统，无条件执行。
const hasDecisions = existsSync(join(repoRoot, '.far-design', 'DECISIONS'));

test('adr_landing_check: 全部 22 ADR 锚点命中（rate=100%）', { skip: !hasDecisions && '.far-design/DECISIONS not present (untracked from public repo)' }, () => {
  const result = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `exit 0 expected\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.match(result.stdout, /22\/22/, '必须报告 22/22 命中');
  assert.match(result.stdout, /rate=100%/, '必须报告 100% 落地率');
});

test('adr_landing_check: 输出未命中清单格式（存在区分能力）', { skip: !hasDecisions && '.far-design/DECISIONS not present (untracked from public repo)' }, () => {
  const result = spawnSync(process.execPath, [script, '--verbose'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, 'verbose 模式也必须 exit 0');
  assert.match(result.stdout, /命中明细/, 'verbose 必须输出命中明细');
});

test('fresh-clone: script skips gracefully (exit 0 + skip message) when DECISIONS dir absent', { skip: hasDecisions && 'DECISIONS present — skip-path tested only on fresh clones' }, () => {
  const result = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `missing-dir must exit 0 (environmental skip)\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.match(result.stdout, /环境性跳过/, 'must print an explicit skip message, not silently pass');
});

test('adr_landing_check: 锚点映射覆盖全部 22 ADR（无遗漏）', async () => {
  const { ANCHORS } = await import(`file:///${script.replace(/\\/g, '/')}`);
  assert.equal(Object.keys(ANCHORS).length, 22, '必须为全部 22 个 ADR 提供锚点');
  const adrIds = Object.keys(ANCHORS).sort();
  for (let i = 1; i <= 22; i += 1) {
    const id = `ADR-${String(i).padStart(3, '0')}`;
    assert.ok(adrIds.includes(id), `${id} 必须有锚点映射`);
  }
});

test('adr_landing_check: 每个 ADR 至少 1 个非空锚点', async () => {
  const { ANCHORS } = await import(`file:///${script.replace(/\\/g, '/')}`);
  for (const [id, anchors] of Object.entries(ANCHORS)) {
    assert.ok(Array.isArray(anchors) && anchors.length > 0, `${id} 必须有非空锚点数组`);
    for (const a of anchors) {
      assert.ok(typeof a === 'string' && a.length > 0, `${id} 锚点必须为非空字符串`);
    }
  }
});

