// tests/retrieval/multilingual.test.ts
// RET-MULTILINGUAL-001：语言来源记录纪律、覆盖缩域门（不得静默缩域）、
// 实体对齐归一化、回译漂移、原文锚。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  alignEntities,
  backTranslationDrift,
  buildOriginalTextAnchor,
  languageCoverageGate,
  normalizeEntityName,
  validateProvenance,
} from '../../src/retrieval/multilingual.ts';
import type { LanguageProvenance } from '../../src/retrieval/multilingual.ts';

function provenance(overrides: Partial<LanguageProvenance> = {}): LanguageProvenance {
  return {
    documentId: 'W301',
    originalLanguage: 'zh',
    queryLanguage: 'zh',
    translatedQuery: null,
    translationModel: null,
    translationModelVersion: null,
    ...overrides,
  };
}

test('RET-MULTILINGUAL-001: 记录纪律——跨语言查询必须带翻译链（查询串/模型/版本）', () => {
  // 同语言检索：无需翻译链
  assert.equal(validateProvenance(provenance()).ok, true);
  // 跨语言：齐全的翻译链过
  const complete = provenance({
    queryLanguage: 'en',
    translatedQuery: 'selection bias exoplanet survey',
    translationModel: 'mt-service-x',
    translationModelVersion: 'v3.2',
  });
  assert.equal(validateProvenance(complete).ok, true);
  // 跨语言但缺模型/版本 → 拒（翻译链不可审计）
  const noModel = provenance({ queryLanguage: 'en', translatedQuery: 'q', translationModel: null, translationModelVersion: null });
  const v = validateProvenance(noModel);
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.problems.some((p) => p.includes('translationModel')));
  const noVersion = provenance({ queryLanguage: 'en', translatedQuery: 'q', translationModel: 'mt-x', translationModelVersion: ' ' });
  assert.equal(validateProvenance(noVersion).ok, false);
  const noQuery = provenance({ queryLanguage: 'en', translatedQuery: null, translationModel: 'mt-x', translationModelVersion: 'v1' });
  assert.equal(validateProvenance(noQuery).ok, false);
});

test('RET-MULTILINGUAL-001: 覆盖门——计划语言未全查 → 静默缩域违规 + 显式 limitation 文本', () => {
  const shrunk = languageCoverageGate({ plannedLanguages: ['zh', 'ja', 'ko'], executedLanguages: ['en', 'zh'] });
  assert.equal(shrunk.silentNarrowing, true);
  assert.deepEqual(shrunk.uncoveredLanguages, ['ja', 'ko']);
  assert.deepEqual(shrunk.unexpectedLanguages, ['en'], '计划外语种显式列出——超出声明域也要报告');
  assert.match(shrunk.limitationText ?? '', /LANGUAGE SCOPE LIMITATION/);
  assert.match(shrunk.limitationText ?? '', /NOT covered by this evidence base/);

  const full = languageCoverageGate({ plannedLanguages: ['zh', 'de'], executedLanguages: ['de', 'zh'] });
  assert.equal(full.silentNarrowing, false);
  assert.equal(full.uncoveredLanguages.length, 0);
  assert.equal(full.limitationText, null, '全覆盖不出 limitation');
});

test('RET-MULTILINGUAL-001: 实体对齐——归一化（小写/去变音符/去标点）后确定性对齐 + 未对齐如实', () => {
  assert.equal(normalizeEntityName('Alzheimer’s Disease'), normalizeEntityName('alzheimers disease'));
  assert.equal(normalizeEntityName('Müller'), normalizeEntityName('Muller'));
  assert.notEqual(normalizeEntityName('阿耳茨海默病'), normalizeEntityName('Alzheimer disease'), '跨书写系统不强行归一（交人工）');

  const result = alignEntities([
    { sourceText: 'Alzheimer’s Disease', targetText: 'alzheimers disease' },
    { sourceText: 'Müller-Lyer illusion', targetText: 'Muller-Lyer illusion' },
    { sourceText: 'placebo effect', targetText: 'nocebo effect' },
  ]);
  assert.equal(result.alignedCount, 2);
  assert.equal(result.misalignedCount, 1);
  const mis = result.pairs.find((p) => !p.aligned);
  assert.equal(mis?.sourceText, 'placebo effect');
  // 空串实体不判对齐（宁缺毋错）
  const empty = alignEntities([{ sourceText: '', targetText: '' }]);
  assert.equal(empty.alignedCount, 0);
});

test('RET-MULTILINGUAL-001: 回译漂移——忠实回译不漂移 / 语义偏移回译漂移 + 双指纹在场', () => {
  const original = 'The survey oversampled participants with prior coursework in astronomy, inflating the correlation.';
  const faithful = 'The survey oversampled participants with previous astronomy coursework, which inflated the correlation.';
  const shifted = 'Participants later completed additional training sessions during the observation period.';
  const ok = backTranslationDrift(original, faithful);
  assert.equal(ok.drifted, false);
  assert.ok(ok.similarity >= 0.6);
  assert.equal(ok.originalFingerprint.length, 64);
  assert.equal(ok.backTranslatedFingerprint.length, 64);
  const bad = backTranslationDrift(original, shifted);
  assert.equal(bad.drifted, true);
  assert.ok(bad.similarity < 0.6);
  assert.notEqual(bad.originalFingerprint, bad.backTranslatedFingerprint);
});

test('RET-MULTILINGUAL-001: 原文锚——关键非英文证据带原文/译文指纹 + 无翻译链拒绝构造', () => {
  const anchor = buildOriginalTextAnchor({
    documentId: 'W301',
    paragraphIndex: 4,
    originalText: '抽样过程偏向具有天文学课程背景的志愿者。',
    translatedText: 'The sampling process favored volunteers with astronomy coursework.',
    translationModel: 'mt-service-x',
    translationModelVersion: 'v3.2',
  });
  assert.equal(anchor.paragraphIndex, 4);
  assert.equal(anchor.originalFingerprint.length, 64);
  assert.notEqual(anchor.originalFingerprint, anchor.translatedFingerprint, '原文与译文指纹不同（对应关系靠锚记录）');
  // 无翻译链 → fail-closed
  assert.throws(
    () => buildOriginalTextAnchor({ documentId: 'W301', paragraphIndex: 4, originalText: '原文', translatedText: 'translation', translationModel: '', translationModelVersion: 'v1' }),
    /translation chain/,
  );
});
