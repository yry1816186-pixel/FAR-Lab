// tests/cli/ground.test.ts
// far ground 参数解析回归测试（2026-08-13 修复两类真实缺陷）：
//   1. `--source value`（空格形式）此前不被识别 → flag 值被静默拼进 question
//      （OpenAlex 搜索词污染 → live 400）。现在两种形式都支持，且未知 flag 报错。
//   2. 搜索词中的 `?` 在 OpenAlex adapter 层被剥离（见 tests/retrieval/openalex.test.ts）。
//
// 全部为纯解析测试（不触网）。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseGroundArgs } from '../../src/cli/commands/ground.ts';

describe('parseGroundArgs', () => {
  test('positional-only: question joined, defaults applied', () => {
    const r = parseGroundArgs(['does', 'dark', 'energy', 'exist?']);
    assert.ok(!('error' in r));
    if ('error' in r) return;
    assert.equal(r.question, 'does dark energy exist?');
    assert.equal(r.source, 'openalex');
    assert.equal(r.maxPerQuery, 5);
    assert.equal(r.includeCounterEvidence, true);
    assert.equal(r.json, false);
  });

  test('space-form flags: --source value / --max-per-query value (regression: value no longer leaks into question)', () => {
    const r = parseGroundArgs([
      'Does light pollution affect insect decline?',
      '--source',
      'openalex',
      '--max-per-query',
      '3',
      '--json',
    ]);
    assert.ok(!('error' in r));
    if ('error' in r) return;
    assert.equal(r.question, 'Does light pollution affect insect decline?');
    assert.equal(r.source, 'openalex');
    assert.equal(r.maxPerQuery, 3);
    assert.equal(r.json, true);
  });

  test('equals-form flags still work', () => {
    const r = parseGroundArgs(['q?', '--source=crossref', '--max-per-query=7']);
    assert.ok(!('error' in r));
    if ('error' in r) return;
    assert.equal(r.source, 'crossref');
    assert.equal(r.maxPerQuery, 7);
  });

  test('unknown flag → error (no silent swallowing)', () => {
    const r = parseGroundArgs(['q?', '--bogus', 'x']);
    assert.ok('error' in r);
    if ('error' in r) assert.match(r.error, /unknown argument '--bogus'/);
  });

  test('--source with missing value → error', () => {
    const r = parseGroundArgs(['q?', '--source']);
    assert.ok('error' in r);
  });

  test('--source with invalid value → error', () => {
    const r = parseGroundArgs(['q?', '--source', 'pubmed']);
    assert.ok('error' in r);
    if ('error' in r) assert.match(r.error, /must be openalex\|arxiv\|crossref/);
  });

  test('--max-per-query out of range → error', () => {
    const r = parseGroundArgs(['q?', '--max-per-query', '0']);
    assert.ok('error' in r);
    if ('error' in r) assert.match(r.error, /\[1,25\]/);
  });

  test('--no-counter-evidence disables adversarial queries', () => {
    const r = parseGroundArgs(['q?', '--no-counter-evidence']);
    assert.ok(!('error' in r));
    if ('error' in r) return;
    assert.equal(r.includeCounterEvidence, false);
  });
});
