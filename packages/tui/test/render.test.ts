/**
 * Ink render-layer tests (ink-testing-library 4.0.0, MIT — renders without a
 * TTY). These upgrade the full-screen path from UNVERIFIED-live to
 * render-verified: component tree, layout text, key handling and the confirm
 * flow are all asserted deterministically. What legitimately remains for a
 * real interactive terminal is only raw-mode feel (latency/focus).
 * Run: node --experimental-strip-types --test test/render.test.ts
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/ink.ts';
import { Composer, type ComposerResult } from '../src/composer.ts';
import type { RunEvent, RunSummary } from '../src/api.ts';

const h = React.createElement;
const tick = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lastFrame = (app: { frames: string[] }): string => app.frames[app.frames.length - 1] ?? '';

const fakeRuns: RunSummary[] = [
  { id: 'run_aaa', status: 'completed', currentStage: 'export', createdAt: new Date(Date.now() - 3600_000).toISOString(), questionText: 'Why does daily-dose vitamin D reduce RTI risk?', domain: 'Medicine' },
  { id: 'run_bbb', status: 'running', currentStage: 'retrieve', createdAt: new Date().toISOString(), questionText: 'Do ensembles beat linear baselines?' },
];

const fakeEvents: RunEvent[] = [
  { seq: 1, at: '2026-08-23T00:00:00Z', type: 'stage_done', stage: 'scope', detail: { summary: 'scope refined: domain="Medicine"' } },
  { seq: 2, at: '2026-08-23T00:01:00Z', type: 'stage_done', stage: 'retrieve', detail: { summary: 'retrieved 12 documents from 9/14 searches' } },
  { seq: 3, at: '2026-08-23T00:02:00Z', type: 'stage_failed', stage: 'generate_hypotheses', detail: { summary: 'provider_error' } },
];

test('App renders study list from injected runs (no network)', () => {
  const app = render(h(App, { initialRuns: fakeRuns }));
  const frame = app.frames[app.frames.length - 1] ?? '';
  assert.match(frame, /FAR-Lab · 我的研究/);
  assert.match(frame, /Why does daily-dose vitamin D reduce RTI risk\?/);
  assert.match(frame, /已完成/);
  assert.match(frame, /1 小时前/);
  assert.match(frame, /n 新问题/);
});

test('App detail view renders the stage narrative from injected events', async () => {
  const app = render(h(App, { initialRuns: fakeRuns, initialEvents: fakeEvents }));
  app.stdin.write('\r'); // Enter on the first study
  await tick(150);
  const frame = lastFrame(app);
  assert.match(frame, /✓ 范围界定/);
  assert.match(frame, /scope refined: domain="Medicine"/);
  assert.match(frame, /✓ 文献检索/);
  assert.match(frame, /retrieved 12 documents/);
  assert.match(frame, /✗ 假设生成/);
  app.unmount();
});

test('Composer: typing, enter → confirm view, y → submitted-ready (no POST path)', async () => {
  let result: ComposerResult | null = null;
  const c = render(h(Composer, { onDone: (r) => { result = r; } }));
  c.stdin.write('Why now?');
  await tick();
  assert.match(lastFrame(c), /Why now\?/);
  assert.doesNotMatch(lastFrame(c), /提交研究问题/);
  c.stdin.write('\r'); // Enter → confirm step
  await tick();
  const confirmFrame = lastFrame(c);
  assert.match(confirmFrame, /提交研究问题/);
  assert.match(confirmFrame, /y 确认就绪/);
  assert.match(confirmFrame, /no-live-API/);
  c.stdin.write('y');
  await tick();
  assert.ok(result !== null, 'onDone fired after y');
  assert.equal(result!.action, 'submitted-ready');
  assert.equal(result!.question, 'Why now?');
  c.unmount();
});

test('Composer: q in confirm cancels; n returns to editing', async () => {
  let result: ComposerResult | null = null;
  const c = render(h(Composer, { onDone: (r) => { result = r; } }));
  c.stdin.write('Q1');
  await tick();
  c.stdin.write('\r');
  await tick();
  assert.match(lastFrame(c), /提交研究问题/);
  c.stdin.write('n'); // back to editing
  await tick();
  assert.doesNotMatch(lastFrame(c), /提交研究问题/);
  c.stdin.write('\r');
  await tick();
  c.stdin.write('q'); // abort
  await tick();
  assert.ok(result !== null, 'onDone fired after q');
  assert.equal(result!.action, 'cancelled');
  c.unmount();
});

test('App "n" opens the composer view', async () => {
  const app = render(h(App, { initialRuns: fakeRuns }));
  app.stdin.write('n');
  await tick();
  const frame = lastFrame(app);
  assert.match(frame, /研究问题输入（多行\/粘贴安全\/IME 安全）/);
  app.unmount();
});
