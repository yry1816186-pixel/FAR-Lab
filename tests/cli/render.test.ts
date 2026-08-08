// tests/cli/render.test.ts
// CLI 渲染层测试：跨平台 ANSI / 进度条 / 表格 / 徽章 / spinner 降级。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ansiEnabled,
  badge,
  colorize,
  renderProgressBar,
  renderTable,
  rule,
  SPINNER_FRAMES,
} from '../../src/cli/render.ts';

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
  // 即使没有真实 TTY，force:true 也启用（测试与管道场景）。
  assert.equal(ansiEnabled({ force: true }), true);
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
