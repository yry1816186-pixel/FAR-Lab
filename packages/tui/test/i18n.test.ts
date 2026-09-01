/**
 * i18n mechanism tests (node:test, deterministic, zero network).
 * Run: node --experimental-strip-types --test test/i18n.test.ts
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { relTimeLabel, resolveLang, STAGE_LABELS, stageLabel, statusLabel } from '../src/i18n.ts';
import { composerLabels } from '../src/composer.ts';

test('resolveLang honors FARLANG variants and defaults to zh', () => {
  const env = (v?: string): Record<string, string | undefined> => ({ FARLANG: v });
  assert.equal(resolveLang(env('en')), 'en');
  assert.equal(resolveLang(env('en-US')), 'en');
  assert.equal(resolveLang(env('zh')), 'zh');
  assert.equal(resolveLang(env('zh_CN')), 'zh');
  assert.equal(resolveLang(env(undefined)), 'zh');
  assert.equal(resolveLang(env('fr')), 'zh'); // unmapped locale: historical default, never blank
});

test('stage and status tables cover the same key sets in both languages', () => {
  assert.deepEqual(Object.keys(STAGE_LABELS.en).sort(), Object.keys(STAGE_LABELS.zh).sort());
  assert.equal(stageLabel('retrieve', 'en'), 'Retrieve');
  assert.equal(stageLabel('retrieve', 'zh'), '文献检索');
  assert.equal(stageLabel('retrieve'), '文献检索');
  // unknown keys fall back to the raw machine value (honest, not blank)
  assert.equal(stageLabel('not_a_stage', 'en'), 'not_a_stage');
  assert.equal(statusLabel('completed', 'en'), 'Completed');
  assert.equal(statusLabel('completed', 'zh'), '已完成');
  assert.equal(statusLabel('weird', 'en'), 'weird');
});

test('relTime formats per language with injected clock', () => {
  const now = Date.parse('2026-09-01T12:00:00Z');
  const at = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString();
  assert.equal(relTimeLabel(at(0), 'zh', () => now), '刚刚');
  assert.equal(relTimeLabel(at(0), 'en', () => now), 'just now');
  assert.equal(relTimeLabel(at(5), 'zh', () => now), '5 分钟前');
  assert.equal(relTimeLabel(at(5), 'en', () => now), '5m ago');
  assert.equal(relTimeLabel(at(90), 'en', () => now), '2h ago');
  assert.equal(relTimeLabel(at(3 * 24 * 60), 'en', () => now), '3d ago');
  // unparseable timestamps pass through verbatim instead of inventing a value
  assert.equal(relTimeLabel('not-a-date', 'en', () => now), 'not-a-date');
});

test('composer labels switch per language for all three flows', () => {
  for (const kind of ['question', 'chat', 'launch'] as const) {
    const zh = composerLabels(kind, 'zh');
    const en = composerLabels(kind, 'en');
    assert.notEqual(zh.header, en.header);
    assert.ok(zh.header.length > 0 && en.header.length > 0);
    assert.ok(en.confirmKeys.includes('y'));
  }
});
