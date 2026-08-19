// tests/platform/design_tokens.test.ts
// design_tokens.ts 判别测试——每个断言锁定一条真实语义分支，禁浅断言。
//
// 判别力设计：
//   · 色码数值逐项锁定（改任何一项 = 红）——防"随手改色"回归；
//   · 五值色互异——防"两个裁决值撞色"（语义事故：评委无法区分 CONFIRMED/REFUTED）；
//   · Web 同步契约：读取 frontend/src/index.css 真实文本，断言 CSS 生产值 = 本表值
//     （双源漂移 = 红，这正是 SSOT 模块存在的理由）；
//   · fail-closed 分支：未知裁决字符串 → undefined / gray，绝不静默给绿。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  FUNCTIONAL_COLORS,
  FUNCTIONAL_TONES,
  VERDICT_COLORS,
  VERDICT_VALUES,
  verdictAnsi8,
  verdictColor,
} from '../../src/platform/design_tokens.ts';

const INDEX_CSS = fileURLToPath(new URL('../../frontend/src/index.css', import.meta.url));

test('tokens: 裁决五值表完整——恰好五值，不多不少（内核输出空间漂移=红）', () => {
  assert.deepEqual(Object.keys(VERDICT_COLORS).sort(), [...VERDICT_VALUES].sort());
  assert.equal(VERDICT_VALUES.length, 5);
});

test('tokens: 五值 ansi256/ansi8 逐项锁定 DESIGN_SYSTEM §1.1 表', () => {
  assert.equal(VERDICT_COLORS.CONFIRMED.ansi256, 29);
  assert.equal(VERDICT_COLORS.CONFIRMED.ansi8, 'green');
  assert.equal(VERDICT_COLORS.REFUTED.ansi256, 131);
  assert.equal(VERDICT_COLORS.REFUTED.ansi8, 'red');
  assert.equal(VERDICT_COLORS.INCONCLUSIVE.ansi256, 136);
  assert.equal(VERDICT_COLORS.INCONCLUSIVE.ansi8, 'yellow');
  assert.equal(VERDICT_COLORS.DEGRADED_SCOPE.ansi256, 62);
  assert.equal(VERDICT_COLORS.DEGRADED_SCOPE.ansi8, 'magenta');
  assert.equal(VERDICT_COLORS.UNTESTED.ansi256, 242);
  assert.equal(VERDICT_COLORS.UNTESTED.ansi8, 'gray');
});

test('tokens: 五值互异——ansi256 与 ansi8 双轴均无撞色（语义可区分性）', () => {
  const codes256 = VERDICT_VALUES.map((v) => VERDICT_COLORS[v].ansi256);
  const codes8 = VERDICT_VALUES.map((v) => VERDICT_COLORS[v].ansi8);
  assert.equal(new Set(codes256).size, 5, `ansi256 撞色: ${codes256}`);
  assert.equal(new Set(codes8).size, 5, `ansi8 撞色: ${codes8}`);
});

test('tokens: hex 格式合法且明/暗主题不同值（同值=主题切换无意义）', () => {
  const HEX = /^#[0-9a-f]{6}$/;
  for (const v of VERDICT_VALUES) {
    const c = VERDICT_COLORS[v];
    assert.match(c.light, HEX, `${v}.light`);
    assert.match(c.dark, HEX, `${v}.dark`);
    assert.notEqual(c.light, c.dark, `${v} 明暗同值`);
  }
});

test('tokens: 功能色语义统一——ok/danger/warn 与 confirmed/refuted/inconclusive 同值（刻意）', () => {
  assert.equal(FUNCTIONAL_COLORS.ok, VERDICT_COLORS.CONFIRMED);
  assert.equal(FUNCTIONAL_COLORS.danger, VERDICT_COLORS.REFUTED);
  assert.equal(FUNCTIONAL_COLORS.warn, VERDICT_COLORS.INCONCLUSIVE);
  // info/accent 是独立蓝色族，不得与任何裁决色撞 256 码
  const verdict256 = new Set(VERDICT_VALUES.map((v) => VERDICT_COLORS[v].ansi256));
  assert.ok(!verdict256.has(FUNCTIONAL_COLORS.info.ansi256), 'info 与裁决色撞色');
  assert.equal(FUNCTIONAL_TONES.length, 5);
});

test('tokens: fail-closed——未知裁决字符串不得静默给绿', () => {
  assert.equal(verdictColor('confirmed'), undefined, '大小写变体不得命中');
  assert.equal(verdictColor(''), undefined);
  assert.equal(verdictColor('PROBABLY_TRUE'), undefined);
  assert.equal(verdictAnsi8('PROBABLY_TRUE'), 'gray', '未知值兜底必须中性灰');
  assert.equal(verdictAnsi8('CONFIRMED'), 'green');
});

test('tokens: Web 同步契约——frontend/src/index.css 生产值 = 本表（双源漂移=红）', () => {
  const css = readFileSync(INDEX_CSS, 'utf8');
  for (const v of VERDICT_VALUES) {
    const c = VERDICT_COLORS[v];
    assert.ok(
      css.includes(`${c.cssVar}: ${c.light}`),
      `index.css 缺明主题值 ${c.cssVar}: ${c.light}（SSOT 漂移）`,
    );
    assert.ok(
      css.includes(`${c.cssVar}: ${c.dark}`),
      `index.css 缺暗主题值 ${c.cssVar}: ${c.dark}（SSOT 漂移）`,
    );
  }
});
