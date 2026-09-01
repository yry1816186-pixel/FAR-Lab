/**
 * EN-language render smoke (node:test). Must run before any zh-rendering file
 * shares the process — node:test isolates each file in its own process, and
 * this file sets FARLANG before dynamically importing ink.ts so the module-level
 * language resolution lands on 'en'.
 * Run: node --experimental-strip-types --test test/render-en.test.ts
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import React from 'react';
import { render } from 'ink-testing-library';
import type { RunSummary } from '../src/api.ts';

const h = React.createElement;

test('App renders the study list in English under FARLANG=en', async () => {
  process.env.FARLANG = 'en';
  const { App } = await import('../src/ink.ts');
  const fakeRuns: RunSummary[] = [
    { id: 'run_aaa', status: 'completed', currentStage: 'export', createdAt: new Date(Date.now() - 3600_000).toISOString(), questionText: 'Why does daily-dose vitamin D reduce RTI risk?', domain: 'Medicine' },
  ];
  const app = render(h(App, { initialRuns: fakeRuns }));
  await new Promise((r) => setTimeout(r, 80));
  const frame = app.frames[app.frames.length - 1] ?? '';
  assert.match(frame, /Why does daily-dose vitamin D reduce RTI risk\?/);
  assert.match(frame, /Completed/);      // status table resolved to EN
  assert.doesNotMatch(frame, /已完成/);   // no zh leakage on the EN surface
  app.unmount();
});
