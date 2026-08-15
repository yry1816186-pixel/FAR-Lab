/**
 * claim_negation_golden.test.ts — claim 语言结构鲁棒性金集（2.md §8.9 后 R10 T1）。
 *
 * 靶子：deriveDirection 的否定感知（否定翻转必须翻转方向——裁决系统最经典翻车模式）、
 * 条件/比较/hedge 结构不破坏方向、双否定与真歧义 fail-closed（null=REFUSED direction_unknown）。
 * 金集 ≥30 条：每条 = 文本 → 预期方向（'positive' | 'negative' | null）。
 *
 * 已知边界（登记）：中文后置否定（"增加不显著"——否定词在关键词之后，不在回看窗口内）
 * 按正向处理——中文否定以置前为主，后置形式多带 hedge 语义；如实登记不假装覆盖。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { derivePredictionDirectionForTest as deriveDirection } from '../../src/discovery/adjudication.ts';

type Expected = 'positive' | 'negative' | null;

const GOLDEN: ReadonlyArray<{ readonly text: string; readonly expected: Expected; readonly why: string }> = [
  // ── 肯定基线（否定感知不得误伤）─────────────────────────────
  { text: 'Stellar activity increases hot Jupiter radii', expected: 'positive', why: 'bare positive keyword' },
  { text: 'Irradiation correlates positively with radius', expected: 'positive', why: 'multi-word positive' },
  { text: 'Metallicity is higher in the inner disk', expected: 'positive', why: 'comparative positive' },
  { text: 'The correlation is negative', expected: 'negative', why: 'bare negative keyword' },
  { text: 'Dose decreases with renal clearance', expected: 'negative', why: 'bare negative keyword' },
  // ── 否定翻转（金集核心）────────────────────────────────────
  { text: 'X does not increase Y', expected: 'negative', why: 'EN negation flips positive' },
  { text: 'X doesn\'t increase Y', expected: 'negative', why: 'contraction negation' },
  { text: 'X never increases Y', expected: 'negative', why: 'never negation' },
  { text: 'X is not positively correlated with Y', expected: 'negative', why: 'negated positive adverb' },
  { text: 'No increase in Y is observed', expected: 'negative', why: 'sentence-initial no' },
  { text: 'Without an increase in flux, the model fails', expected: 'negative', why: 'prepositional negation' },
  { text: 'This mechanism fails to increase the yield', expected: 'negative', why: 'fails-to negation' },
  { text: 'X does not decrease Y', expected: 'positive', why: 'negation flips negative keyword' },
  { text: 'Y is not lower under treatment', expected: 'positive', why: 'negated comparative' },
  { text: 'No decrease in output was found', expected: 'positive', why: 'negated negative noun' },
  { text: '磁场强度不增加行星半径', expected: 'negative', why: 'ZH preposed negation' },
  { text: '辐照与半径并非正相关', expected: 'negative', why: 'ZH 非 negation' },
  { text: '该效应未降低收敛速度', expected: 'positive', why: 'ZH 未 negates 降低' },
  // ── 否定线索不误伤（word-boundary 精度）──────────────────
  { text: 'Notably, the note on notebook production increases nothing here', expected: 'positive', why: 'word-boundary precision: notably/note/notebook/nothing fire no cue; object-position semantic negation out of lexical scope (documented boundary)' },
  { text: 'The northern site shows higher abundance', expected: 'positive', why: '"northern" contains no cue' },
  { text: 'Annotators noted an increase in agreement', expected: 'positive', why: '"noted" is not a negation cue' },
  // ── 条件结构（不翻转方向）──────────────────────────────────
  { text: 'If metallicity exceeds solar, radius increases', expected: 'positive', why: 'conditional antecedent does not negate consequent' },
  { text: 'Provided that cooling is efficient, the envelope contracts and luminosity decreases', expected: 'negative', why: 'conditional + negative consequent' },
  { text: 'Unless the disk dissipates, higher accretion persists', expected: 'positive', why: 'unless-clause cue-free window' },
  // ── 比较结构（关键词即方向）────────────────────────────────
  { text: 'Group A is stronger than group B', expected: 'positive', why: 'comparative positive' },
  { text: 'The treated cohort shows weaker coupling', expected: 'negative', why: 'comparative negative' },
  // ── hedge（不确定性 ≠ 否定）───────────────────────────────
  { text: 'Irradiation may increase the radius slightly', expected: 'positive', why: 'hedge does not flip' },
  { text: 'The effect possibly decreases over time', expected: 'negative', why: 'hedge does not flip' },
  { text: 'We suggest the correlation might be positive', expected: 'positive', why: 'hedged positive stays positive' },
  { text: '可能存在正相关', expected: 'positive', why: 'ZH hedge does not flip' },
  // ── fail-closed 歧义───────────────────────────────────────
  { text: 'X increases Y but decreases Z', expected: null, why: 'both families present → unknown' },
  { text: 'It is not never the case that X increases Y', expected: null, why: 'double negation (≥2 cues) → refuse to guess' },
  { text: 'The apparatus records the measurement', expected: null, why: 'no direction word → unknown' },
  { text: '并不必然增加产出', expected: 'negative', why: '并不 is ONE cue (并 is an intensifier adverb) — hedged negation still negates' },
];

test('claim-structure golden set: all vectors match expected direction (≥30)', () => {
  assert.ok(GOLDEN.length >= 30, `golden set must have ≥30 vectors, got ${GOLDEN.length}`);
  for (const { text, expected, why } of GOLDEN) {
    assert.equal(deriveDirection(text), expected, `"${text}" (${why})`);
  }
});

test('negation flip propagates to verdict semantics: negated-positive prediction + positive r → REFUTED-path direction', () => {
  // The direction value feeds the threshold contract (gt↔lt). A prediction
  // "X does not increase Y" must compile as a NEGATIVE prediction so that a
  // significantly positive r contradicts it (REFUTED), not confirms it.
  assert.equal(deriveDirection('X does not increase Y'), 'negative');
  assert.equal(deriveDirection('X increases Y'), 'positive');
});

test('determinism: repeated derivation is stable', () => {
  for (const { text } of GOLDEN) {
    const first = deriveDirection(text);
    for (let i = 0; i < 5; i += 1) assert.equal(deriveDirection(text), first);
  }
});

test('window calibration: negation within 40 chars before the keyword still flips; beyond does not', () => {
  const padded = 'X does not, under plausible scenarios, increase Y';
  const gap = padded.toLowerCase().indexOf('increase') - (padded.toLowerCase().lastIndexOf('not') + 3);
  assert.ok(gap > 0 && gap <= 40, `realistic insertion gap ${gap} must be inside the window`);
  assert.equal(deriveDirection(padded), 'negative');
  const tooFar = `${'filler text '.repeat(5)}not ${'more filler '.repeat(4)}increase`;
  // cue outside the 40-char window → NOT negated → positive (documented boundary,
  // honest: window is calibrated for precision, not universal — 47+ char poetic
  // insertions are out of scope, registered in the module doc)
  assert.equal(deriveDirection(tooFar), 'positive');
});
