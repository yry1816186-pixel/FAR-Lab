/**
 * 叙事一致性守护测试。
 *
 * 背景（findings S2）：README.md:5「测谎仪——可被任何人独立验证真假」与
 * README.md:117-118「does not prove scientific truths」110 行内并存——读者 30 秒可抓矛盾。
 * 项目自身已裁定 CLM-002 CONTRADICTED（archived reboot docs:29）但未执行退休。
 * 修复契约（活跃文档，archive/audits 为历史记录豁免）：
 *   1. 「测谎 / lie-detector / 验证真假」叙事零命中（活跃文档）。
 *   2. README 中英 Known limits 条目数一致（SSOT：英文 10 项）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function dirname(p: string): string {
  return p.replace(/[\\/][^\\/]*$/, '');
}

test('P0-4: retired lie-detector narrative has zero hits in active docs', () => {
  // 扫描全部活跃 markdown（排除 archive/audits/.trae/node_modules——历史记录与审查产物豁免）。
  // rg 无命中时 exit 1——视为零命中（非错误）。
  let out = '';
  try {
    out = execFileSync(
      'rg',
      [
        '-l',
        '测谎|lie-detector|验证真假',
        '--glob',
        '*.md',
        '--glob',
        '!node_modules/**',
        '--glob',
        '!.trae/**',
        '--glob',
        '!docs/archive/**',
        '--glob',
        '!docs/audits/**',
        '.',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim();
  } catch {
    // rg exit 1 = zero matches（无命中即通过）。
  }
  assert.equal(
    out,
    '',
    `retired narrative must be zero-hit in active docs, found:\n${out}`,
  );
});

test('P0-4: README Known limits count is aligned between EN and zh-CN (SSOT: 11)', () => {
  const en = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const zh = readFileSync(join(repoRoot, 'README.zh-CN.md'), 'utf8');
  const countItems = (text: string): number => {
    const items = text.match(/^\d+\..+$/gm) ?? [];
    return items.length;
  };
  const enCount = countItems(en.slice(en.indexOf('### Known limits')));
  const zhCount = countItems(zh.slice(zh.indexOf('### 已知边界')));
  assert.equal(zhCount, enCount, `Known limits count must match (en=${enCount}, zh=${zhCount})`);
  assert.equal(enCount, 11, 'EN Known limits SSOT is 11 items');
});
