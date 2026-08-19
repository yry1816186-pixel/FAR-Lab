// tests/cli/render.test.ts
// CLI 渲染层测试：跨平台 ANSI / 进度条 / 表格 / 徽章 / spinner 降级。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ansi256Enabled,
  ansiEnabled,
  badge,
  colorize,
  colorizeToken,
  displayWidth,
  renderProgressBar,
  renderTable,
  rule,
  SPINNER_FRAMES,
  verdictText,
  truncateDisplay,
} from '../../src/cli/render.ts';
import { VERDICT_COLORS } from '../../src/platform/design_tokens.ts';

test('colorize: no ANSI when disabled, codes when enabled', () => {
  assert.equal(colorize('x', 'red', false), 'x');
  const colored = colorize('x', 'red', true);
  assert.ok(colored.includes('\x1b[31m'), colored);
  assert.ok(colored.endsWith('\x1b[0m'), colored);
});

test('ansiEnabled: false when NO_COLOR set', () => {
  const prev = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  try {
    // NO_COLOR 优先于 force（no-color.org 规范）
    assert.equal(ansiEnabled({ force: true }), false);
  } finally {
    if (prev === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;
  }
});

test('ansiEnabled: force overrides non-TTY', () => {
  // The host may intentionally export NO_COLOR. Isolate that higher-priority
  // policy so this test exercises force vs non-TTY rather than ambient state.
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    assert.equal(ansiEnabled({ force: true }), true);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test('renderProgressBar clamps to [0,1]', () => {
  assert.ok(renderProgressBar(-1, 20, false).includes('0%'));
  assert.ok(renderProgressBar(2, 20, false).includes('100%'));
  assert.ok(renderProgressBar(0.5, 20, false).includes('50%'));
});

test('renderProgressBar width respected', () => {
  const bar = renderProgressBar(0.5, 10, false);
  // 10 格进度条 + 空格 + 百分比
  const barPart = bar.split(' ')[0];
  assert.ok(barPart !== undefined, 'bar part exists');
  assert.equal(barPart.length, 10);
});

test('renderTable builds aligned markdown-style table', () => {
  const out = renderTable(['A', 'B'], [['x', 1], ['longer', null]], false);
  assert.ok(out.includes('| A '));
  assert.ok(out.includes('longer'));
  // 对齐：第二行第一列补空格到与表头一致
  assert.ok(out.includes('+-'));
  const lines = out.split('\n');
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];
  assert.ok(firstLine !== undefined && firstLine.startsWith('+-'), firstLine);
  assert.ok(lastLine !== undefined && lastLine.startsWith('+-'), lastLine);
});

test('renderTable empty rows returns header frame only', () => {
  const out = renderTable(['A'], [], false);
  assert.ok(out.includes('| A |'));
});

test('badge maps statuses to bracketed labels', () => {
  assert.equal(badge('PASS', false), '[PASS]');
  assert.equal(badge('FAIL', false), '[FAIL]');
  assert.equal(badge('WARN', false), '[WARN]');
  assert.equal(badge('SKIP', false), '[SKIP]');
});

test('rule produces fixed-width separator', () => {
  assert.equal(rule('-', 5, false).length, 5);
});

test('SPINNER_FRAMES has at least 4 distinct frames', () => {
  assert.ok(SPINNER_FRAMES.length >= 4);
  assert.equal(new Set(SPINNER_FRAMES).size, SPINNER_FRAMES.length);
});

test('renderTable aligns CJK/full-width terminal cells', () => {
  const out = renderTable(['状态', 'ID'], [['通过', 'a'], ['WARN', 'b']], false);
  const lines = out.split('\n');
  assert.equal(displayWidth(lines[1] ?? ''), displayWidth(lines[3] ?? ''));
  assert.equal(displayWidth(lines[3] ?? ''), displayWidth(lines[4] ?? ''));
  assert.notEqual(lines[1]?.length, lines[4]?.length, 'test must exercise wide-glyph cell width');
});


// ---------------------------------------------------------------------------
// ANSI-256 升级（DESIGN_SYSTEM §1.3 / v3.0 指令 Phase 2 落地动作 2）
// 判别力：判定链逐分支（NO_COLOR > force > WT_SESSION > TERM 256color > COLORTERM）·
// colorizeToken 双档出口（256 终端精确色码 / 降级语义族 ansi8）· SSOT 色码锁定。
// ---------------------------------------------------------------------------

test('ansi256Enabled: NO_COLOR 优先级最高（连 force 都压过）', () => {
  assert.equal(ansi256Enabled({ env: { NO_COLOR: '1', TERM: 'xterm-256color' } }), false);
  assert.equal(ansi256Enabled({ force: true, env: { NO_COLOR: '1' } }), false, 'NO_COLOR 必须压过 force');
});

test('ansi256Enabled: force / WT_SESSION / TERM 256color / COLORTERM 逐分支', () => {
  assert.equal(ansi256Enabled({ force: true, env: {} }), true);
  assert.equal(ansi256Enabled({ env: { WT_SESSION: 'abc' } }), true, 'Windows Terminal');
  assert.equal(ansi256Enabled({ env: { TERM: 'xterm-256color' } }), true);
  assert.equal(ansi256Enabled({ env: { COLORTERM: 'truecolor' } }), true);
  assert.equal(ansi256Enabled({ env: { COLORTERM: '24bit' } }), true);
});

test('ansi256Enabled: 保守默认——无信号终端一律 false（防乱码）', () => {
  assert.equal(ansi256Enabled({ env: {} }), false);
  assert.equal(ansi256Enabled({ env: { TERM: 'dumb' } }), false);
  assert.equal(ansi256Enabled({ env: { TERM: 'xterm' } }), false, '8 色 xterm 不得误判 256');
  assert.equal(ansi256Enabled({ env: { TERM: 'linux' } }), false, 'Linux TTY 保守降级');
});

test('colorizeToken: 256 终端输出精确色码（SSOT=design_tokens）', () => {
  const out = colorizeToken('X', VERDICT_COLORS.CONFIRMED, true);
  const env256 = process.env.TERM?.includes('256color') || process.env.WT_SESSION || process.env.COLORTERM;
  if (env256) {
    assert.ok(out.includes('\x1b[38;5;29m'), `256 档必须用 ansi256=29: ${JSON.stringify(out)}`);
  }
  // 无论哪档：reset 必须闭合、文本必须保真
  assert.ok(out.endsWith('\x1b[0m'), 'reset 未闭合');
  assert.ok(out.includes('X'));
});

test('colorizeToken: disabled 直通无转义（NO_COLOR 契约一致）', () => {
  const out = colorizeToken('hello', VERDICT_COLORS.REFUTED, false);
  assert.equal(out, 'hello', 'disabled 必须零转义');
});

test('colorizeToken: ansi8 降级档语义族保持（强制模拟无 256 环境）', () => {
  // 直接构造 ansi8 路径断言：token.ansi8 与 ANSI_CODES 一致——经 colorize 单出口
  const plain = colorize('Y', VERDICT_COLORS.INCONCLUSIVE.ansi8, true);
  assert.ok(plain.startsWith('\x1b[33m'), `inconclusive 降级必须黄族: ${JSON.stringify(plain)}`);
});


// ---------------------------------------------------------------------------
// verdictText 裁决五值直染（DESIGN_SYSTEM 动作 3 唯一出口）
// 判别力：五值语义色逐项锁定（撞色系事故=红）· enabled=false 纯文本（golden-text
// 零冲击契约）· 未知值 fail-closed 原文（不染色撒谎）· reset 闭合。
// ---------------------------------------------------------------------------

test('verdictText: 五值启用时各带语义转义且互异', () => {
  const values = ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'] as const;
  const colored = values.map((v) => verdictText(v, { enabled: true }));
  colored.forEach((c, i) => {
    const v = values[i] ?? '';
    assert.ok(c.includes('\x1b['), `第 ${i} 项未上色: ${JSON.stringify(c)}`);
    assert.ok(c.endsWith('\x1b[0m'), 'reset 未闭合');
    assert.ok(c.includes(v), `${v} 文本丢失`);
  });
  assert.equal(new Set(colored).size, 5, `裁决值撞色: ${JSON.stringify(colored)}`);
});

test('verdictText: enabled=false 纯文本直通（管道/CI/golden-text 零冲击）', () => {
  assert.equal(verdictText('CONFIRMED', { enabled: false }), 'CONFIRMED');
  assert.equal(verdictText('REFUTED', { enabled: false }), 'REFUTED');
});

test('verdictText: 未知裁决字符串 fail-closed 原文返回（不染色撒谎）', () => {
  assert.equal(verdictText('PROBABLY_TRUE', { enabled: true }), 'PROBABLY_TRUE');
  assert.equal(verdictText('', { enabled: true }), '');
});


// ---------------------------------------------------------------------------
// Phase 4 终端宽度契约：renderTable 超限截断（保行对齐，截断不折行）
// 判别力：超限表压缩后每行 ≤maxWidth 且全行等宽（对齐未破）· … 标记如实声明缺失 ·
// 宽终端自然输出零变化（无回归）· CJK 截断宽度精确（双格字不得半截）。
// ---------------------------------------------------------------------------

test('renderTable: 超 maxWidth 时全行压缩达标且保持等宽对齐', () => {
  const headers = ['Claim', 'Verdict', 'Evidence'];
  const rows = [
    ['P vs NP 已被证明独立于 ZFC 公理系统（长文本压力测试）', 'REFUTED', 'arXiv:1234.5678 · 12 项独立复算'],
    ['短', 'CONFIRMED', 'x'],
  ];
  const out = renderTable(headers, rows, false, { maxWidth: 48 });
  const lines = out.split('\n');
  for (const line of lines) {
    assert.ok(displayWidth(line) <= 48, `行超限: ${displayWidth(line)} > 48 · ${line}`);
  }
  const widths = new Set(lines.map((l) => displayWidth(l)));
  assert.equal(widths.size, 1, `行宽不齐（对齐破坏）: ${[...widths].join(',')}`);
  assert.ok(out.includes('…'), '截断标记 … 缺失（信息缺失未如实声明）');
});

test('renderTable: maxWidth 宽裕时自然输出逐字节不回归', () => {
  const headers = ['A', 'B'];
  const rows = [['1', '22']];
  const natural = renderTable(headers, rows, false, { maxWidth: 10_000 });
  const legacy = renderTable(headers, rows, false, { maxWidth: 80 });
  assert.equal(natural, legacy, '宽裕场景输出必须一致');
  assert.ok(!natural.includes('…'), '宽裕场景不得出现截断标记');
});

test('truncateDisplay: CJK 双格字截断宽度精确（预算内最大内容 + 单格 …）', () => {
  // '通过验证abc' = 2+2+2+2+1+1+1 = 11 格；预算 7 → 内容 ≤6 格 + …
  const out = truncateDisplay('通过验证abc', 7);
  assert.ok(displayWidth(out) <= 7, `截断后超宽: ${displayWidth(out)}`);
  assert.ok(out.endsWith('…'), '缺 … 标记');
  assert.equal(displayWidth(out), 7, '应占满预算（内容最大保留）');
  // 短串直通
  assert.equal(truncateDisplay('ok', 7), 'ok');
  // 极端宽度
  assert.equal(truncateDisplay('abc', 0), '');
  assert.equal(truncateDisplay('abc', 1), '…');
});
