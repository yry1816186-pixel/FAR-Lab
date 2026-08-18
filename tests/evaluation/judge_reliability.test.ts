// tests/evaluation/judge_reliability.test.ts
// SCI-JUDGE-001 LLM Judge 只能作为校准后的参考信号：9 项 bias 检查各有纯函数、
// 达标/降级双态、降级信号不得影响 deterministic verdict（结构性静态断言）。
// 纯函数 + 临时目录 fixture，无 mock。

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ANCHORING_MARGIN,
  DEFAULT_ENGINEERING_BUDGET_THRESHOLDS,
  assessJudgeReliability,
  assertJudgeCannotTouchVerdict,
  checkAnchoring as anchoringCheck,
  degradeJudgeSignal,
  humanAgreement,
  languageBias,
  referenceLeakage,
  sameOriginBias,
  seedOrderReplay,
  selfPreference,
  swapOrderConsistency,
  verbosityBias,
} from '../../src/evaluation/judge_reliability.ts';
import type { JudgeCard } from '../../src/evaluation/judge_reliability.ts';

// ---------------------------------------------------------------------------
// 夹具：健康 judge card（9 项全部无偏）—— 单项扰动逐项验证检出
// ---------------------------------------------------------------------------

function healthyCard(): JudgeCard {
  return {
    swapRounds: [
      { pairId: 'p1', order: 'AB', preferred: 'A' }, { pairId: 'p1', order: 'BA', preferred: 'A' },
      { pairId: 'p2', order: 'AB', preferred: 'B' }, { pairId: 'p2', order: 'BA', preferred: 'B' },
      { pairId: 'p3', order: 'AB', preferred: 'A' }, { pairId: 'p3', order: 'BA', preferred: 'A' },
      { pairId: 'p4', order: 'AB', preferred: 'B' }, { pairId: 'p4', order: 'BA', preferred: 'B' },
      { pairId: 'p5', order: 'AB', preferred: 'A' }, { pairId: 'p5', order: 'BA', preferred: 'A' },
      { pairId: 'p6', order: 'AB', preferred: 'B' }, { pairId: 'p6', order: 'BA', preferred: 'B' },
      { pairId: 'p7', order: 'AB', preferred: 'A' }, { pairId: 'p7', order: 'BA', preferred: 'A' },
      { pairId: 'p8', order: 'AB', preferred: 'B' }, { pairId: 'p8', order: 'BA', preferred: 'B' },
    ],
    verbosityPairs: [ // 长度与评分无相关
      { answerId: 'a1', lengthTokens: 100, score: 0.5 },
      { answerId: 'a2', lengthTokens: 150, score: 0.6 },
      { answerId: 'a3', lengthTokens: 200, score: 0.5 },
      { answerId: 'a4', lengthTokens: 250, score: 0.6 },
      { answerId: 'a5', lengthTokens: 300, score: 0.5 },
      { answerId: 'a6', lengthTokens: 350, score: 0.6 },
      { answerId: 'a7', lengthTokens: 400, score: 0.5 },
      { answerId: 'a8', lengthTokens: 450, score: 0.6 },
    ],
    selfPrefRounds: [ // 无自偏（期望 0.5）
      { roundId: 'r1', judgeOwnAnswer: true, preferredOwn: true },
      { roundId: 'r2', judgeOwnAnswer: true, preferredOwn: false },
      { roundId: 'r3', judgeOwnAnswer: true, preferredOwn: true },
      { roundId: 'r4', judgeOwnAnswer: true, preferredOwn: false },
      { roundId: 'r5', judgeOwnAnswer: true, preferredOwn: true },
      { roundId: 'r6', judgeOwnAnswer: true, preferredOwn: false },
      { roundId: 'r7', judgeOwnAnswer: true, preferredOwn: true },
      { roundId: 'r8', judgeOwnAnswer: true, preferredOwn: false },
    ],
    originPairs: [ // 同源/异源均分差 ~0
      { answerId: 'a1', sameOrigin: true, score: 0.7 },
      { answerId: 'a2', sameOrigin: true, score: 0.72 },
      { answerId: 'a3', sameOrigin: true, score: 0.71 },
      { answerId: 'a4', sameOrigin: true, score: 0.7 },
      { answerId: 'a5', sameOrigin: false, score: 0.71 },
      { answerId: 'a6', sameOrigin: false, score: 0.7 },
      { answerId: 'a7', sameOrigin: false, score: 0.7 },
      { answerId: 'a8', sameOrigin: false, score: 0.72 },
    ],
    anchorRounds: [ // 首位选择率 = 0.5（无锚定）
      { roundId: 'r1', firstPresented: 'A', choseFirst: true },
      { roundId: 'r2', firstPresented: 'B', choseFirst: true },
      { roundId: 'r3', firstPresented: 'A', choseFirst: false },
      { roundId: 'r4', firstPresented: 'B', choseFirst: false },
      { roundId: 'r5', firstPresented: 'A', choseFirst: true },
      { roundId: 'r6', firstPresented: 'B', choseFirst: true },
      { roundId: 'r7', firstPresented: 'A', choseFirst: false },
      { roundId: 'r8', firstPresented: 'B', choseFirst: false },
      { roundId: 'r9', firstPresented: 'A', choseFirst: true },
      { roundId: 'r10', firstPresented: 'B', choseFirst: true },
    ],
    leakJudgments: [ // judge 输出与参考答案无近重复
      { answerId: 'a1', judgeText: 'the answer is forty-two units measured at baseline', referenceAnswer: 'ref discusses cohort selection bias in depth' },
      { answerId: 'a2', judgeText: 'methodology section lacks preregistration detail', referenceAnswer: 'ref covers statistical power analysis notes' },
    ],
    languagePairs: [ // 跨语言均分差 ~0
      { answerId: 'a1', language: 'en', score: 0.7 },
      { answerId: 'a2', language: 'en', score: 0.71 },
      { answerId: 'a3', language: 'en', score: 0.7 },
      { answerId: 'a4', language: 'en', score: 0.72 },
      { answerId: 'a5', language: 'zh', score: 0.71 },
      { answerId: 'a6', language: 'zh', score: 0.7 },
      { answerId: 'a7', language: 'zh', score: 0.71 },
      { answerId: 'a8', language: 'zh', score: 0.7 },
    ],
    humanPairs: [ // 人机一致率 1.0
      { item: 'i1', judgeDecision: 'A', humanDecision: 'A' },
      { item: 'i2', judgeDecision: 'B', humanDecision: 'B' },
      { item: 'i3', judgeDecision: 'A', humanDecision: 'A' },
      { item: 'i4', judgeDecision: 'B', humanDecision: 'B' },
      { item: 'i5', judgeDecision: 'A', humanDecision: 'A' },
      { item: 'i6', judgeDecision: 'B', humanDecision: 'B' },
      { item: 'i7', judgeDecision: 'A', humanDecision: 'A' },
      { item: 'i8', judgeDecision: 'B', humanDecision: 'B' },
      { item: 'i9', judgeDecision: 'A', humanDecision: 'A' },
      { item: 'i10', judgeDecision: 'B', humanDecision: 'B' },
    ],
    replayRuns: [ // 完全稳定的两次重放
      { seed: 1, decisions: ['A', 'B', 'A', 'B'] },
      { seed: 2, decisions: ['A', 'B', 'A', 'B'] },
    ],
  };
}

// ---------------------------------------------------------------------------
// assessJudgeReliability：健康 → CALIBRATED_REFERENCE；单项扰动 → 降级
// ---------------------------------------------------------------------------

test('SCI-JUDGE-001 assess: healthy card passes all 9 checks → CALIBRATED_REFERENCE', () => {
  const report = assessJudgeReliability(healthyCard());
  assert.equal(report.status, 'CALIBRATED_REFERENCE');
  assert.equal(report.failedChecks.length, 0);
  assert.equal(report.checks.length, 9, 'exactly nine bias checks');
});

test('SCI-JUDGE-001 assess: A/B swap inconsistency and verbosity correlation each degrade the judge', () => {
  // 交换顺序后偏好翻转（p1 位置一致而非身份一致 → 一致率 0）
  const base = healthyCard();
  const swapped: JudgeCard = {
    ...base,
    swapRounds: base.swapRounds.map((r) =>
      r.order === 'BA' ? { ...r, preferred: r.preferred === 'A' ? 'B' : 'A' } : r,
    ),
  };
  const r1 = assessJudgeReliability(swapped);
  assert.equal(r1.status, 'UNCALIBRATED_ANNOTATION_ONLY');
  assert.ok(r1.failedChecks.some((c) => c.check === 'swap_consistency'));

  // 长度-评分强正相关（judge 偏爱长答案）
  const vb = healthyCard();
  const verbose: JudgeCard = { ...vb, verbosityPairs: vb.verbosityPairs.map((p, i) => ({ ...p, score: 0.3 + i * 0.08 })) };
  const r2 = assessJudgeReliability(verbose);
  assert.equal(r2.status, 'UNCALIBRATED_ANNOTATION_ONLY');
  assert.ok(r2.failedChecks.some((c) => c.check === 'verbosity_correlation'));
});

test('SCI-JUDGE-001 assess: self-preference and generator/judge same-origin bias each degrade', () => {
  const sp = healthyCard();
  const selfPref: JudgeCard = { ...sp, selfPrefRounds: sp.selfPrefRounds.map((r) => ({ ...r, preferredOwn: true })) }; // 8/8 偏自家
  const r1 = assessJudgeReliability(selfPref);
  assert.ok(r1.failedChecks.some((c) => c.check === 'self_preference'));

  const so = healthyCard();
  const sameOrigin: JudgeCard = { ...so, originPairs: so.originPairs.map((p) => (p.sameOrigin ? { ...p, score: 0.9 } : { ...p, score: 0.5 })) };
  const r2 = assessJudgeReliability(sameOrigin);
  assert.ok(r2.failedChecks.some((c) => c.check === 'same_origin'));
});

test('SCI-JUDGE-001 assess: anchoring and reference-answer leakage each degrade', () => {
  const an = healthyCard();
  const anchored: JudgeCard = { ...an, anchorRounds: an.anchorRounds.map((r) => ({ ...r, choseFirst: true })) }; // 首位 10/10
  const r1 = assessJudgeReliability(anchored);
  assert.ok(r1.failedChecks.some((c) => c.check === 'anchoring'));

  const lk = healthyCard();
  const leaked: JudgeCard = {
    ...lk,
    leakJudgments: [
      { answerId: 'a1', judgeText: 'the answer is forty-two units measured at baseline exactly', referenceAnswer: 'the answer is forty-two units measured at baseline exactly' },
      { answerId: 'a2', judgeText: 'methodology section lacks preregistration detail', referenceAnswer: 'ref covers statistical power analysis notes' },
    ],
  };
  const r2 = assessJudgeReliability(leaked);
  assert.ok(r2.failedChecks.some((c) => c.check === 'leakage'));
});

test('SCI-JUDGE-001 assess: language bias, low human agreement, unstable replay each degrade', () => {
  const lb = healthyCard();
  const langBiased: JudgeCard = { ...lb, languagePairs: lb.languagePairs.map((p) => (p.language === 'en' ? { ...p, score: 0.9 } : { ...p, score: 0.5 })) };
  const r1 = assessJudgeReliability(langBiased);
  assert.ok(r1.failedChecks.some((c) => c.check === 'language_bias'));

  const dg = healthyCard();
  const disagreeing: JudgeCard = { ...dg, humanPairs: dg.humanPairs.map((p, i) => (i < 5 ? { ...p, humanDecision: p.judgeDecision === 'A' ? 'B' : 'A' } : p)) }; // 5/10 分歧
  const r2 = assessJudgeReliability(disagreeing);
  assert.ok(r2.failedChecks.some((c) => c.check === 'human_agreement'));

  const ub = healthyCard();
  const unstable: JudgeCard = {
    ...ub,
    replayRuns: [
      { seed: 1, decisions: ['A', 'B', 'A', 'B'] },
      { seed: 2, decisions: ['A', 'A', 'A', 'B'] }, // 种子/顺序重放翻了一个决策
    ],
  };
  const r3 = assessJudgeReliability(unstable);
  assert.ok(r3.failedChecks.some((c) => c.check === 'replay_stability'));
});

test('SCI-JUDGE-001 assess: insufficient sample fails closed (absence of evidence is not evidence of absence)', () => {
  const full = healthyCard();
  const card: JudgeCard = { ...full, selfPrefRounds: full.selfPrefRounds.slice(0, 2) }; // 样本不足
  const report = assessJudgeReliability(card);
  assert.equal(report.status, 'UNCALIBRATED_ANNOTATION_ONLY');
  assert.ok(report.failedChecks.some((c) => c.reason.includes('insufficient')));
});

// ---------------------------------------------------------------------------
// 单项纯函数：边界值直接验证
// ---------------------------------------------------------------------------

test('SCI-JUDGE-001 pure checks: swap consistency identity-vs-position, verbosity Pearson sign, replay exactness', () => {
  // 双序一致率：身份一致（换序仍选同一答案）= 1；位置一致（换序选同一位置）= 0
  assert.equal(swapOrderConsistency(healthyCard().swapRounds).statistic, 1);
  const positional = [1, 2, 3, 4].flatMap((i) => [
    { pairId: `p${i}`, order: 'AB' as const, preferred: 'A' as const },
    { pairId: `p${i}`, order: 'BA' as const, preferred: 'B' as const },
  ]);
  const pos = swapOrderConsistency(positional);
  assert.equal(pos.statistic, 0);
  assert.equal(pos.flagged, true);

  // Pearson：单调升 → 强正相关；样本 <3 → null + fail-closed
  const rising = [100, 200, 300, 400].map((l, i) => ({ answerId: `a${i}`, lengthTokens: l, score: i }));
  assert.ok((verbosityBias(rising).statistic ?? 0) > 0.99);
  assert.equal(verbosityBias([{ answerId: 'a', lengthTokens: 1, score: 0.5 }]).statistic, null);
  assert.equal(verbosityBias([{ answerId: 'a', lengthTokens: 1, score: 0.5 }]).flagged, true);

  // 重放稳定：两次完全一致 → 1；一次翻案 → <1
  assert.equal(seedOrderReplay(healthyCard().replayRuns).statistic, 1);
  const flip = [
    { seed: 1, decisions: ['A', 'B'] },
    { seed: 2, decisions: ['A', 'A'] },
  ];
  assert.ok((seedOrderReplay(flip).statistic ?? 1) < 1);

  // 自偏好：8/8 偏自家 → 1.0 且 flagged；健康卡 0.5 不 flag
  assert.equal(selfPreference(healthyCard().selfPrefRounds).statistic, 0.5);
  const ownBias = selfPreference(healthyCard().selfPrefRounds.map((r) => ({ ...r, preferredOwn: true })));
  assert.equal(ownBias.statistic, 1);
  assert.equal(ownBias.flagged, true);
});

test('SCI-JUDGE-001 pure checks: human agreement rate and anchoring deviation from 0.5', () => {
  assert.equal(humanAgreement(healthyCard().humanPairs).statistic, 1);
  const anchored = healthyCard().anchorRounds.map((r) => ({ ...r, choseFirst: true }));
  const a = anchoringCheck(anchored);
  assert.ok((a.statistic ?? 0) - 0.5 > ANCHORING_MARGIN, 'first-position rate deviates beyond margin');
  assert.equal(a.flagged, true);

  // 语言偏差：均分差超过阈值
  const biased = healthyCard().languagePairs.map((p) => (p.language === 'en' ? { ...p, score: 0.95 } : { ...p, score: 0.4 }));
  assert.equal(languageBias(biased).flagged, true);

  // 参考答案泄漏：judge 输出逐字复制参考答案 → 命中
  const leak = referenceLeakage([
    { answerId: 'a1', judgeText: 'identical text word for word here', referenceAnswer: 'identical text word for word here' },
  ]);
  assert.equal(leak.statistic, 1);
  assert.equal(leak.flagged, true);

  // 同源偏差：delta 显著 → flagged
  assert.equal(sameOriginBias(
    healthyCard().originPairs.map((p) => (p.sameOrigin ? { ...p, score: 0.95 } : { ...p, score: 0.4 })),
  ).flagged, true);
});

// ---------------------------------------------------------------------------
// 阈值是 engineering budget（非 empirical claim）——结构钉住
// ---------------------------------------------------------------------------

test('SCI-JUDGE-001 thresholds: DEFAULT_ENGINEERING_BUDGET_THRESHOLDS pins all 9 checks explicitly', () => {
  const keys = Object.keys(DEFAULT_ENGINEERING_BUDGET_THRESHOLDS).sort();
  assert.deepEqual(keys, [
    'anchoring', 'human_agreement', 'language_bias', 'leakage', 'replay_stability',
    'same_origin', 'self_preference', 'swap_consistency', 'verbosity_correlation',
  ]);
  // 每项阈值都是有限数（可审计、非魔法默认）
  for (const v of Object.values(DEFAULT_ENGINEERING_BUDGET_THRESHOLDS)) {
    assert.equal(typeof v, 'number');
    assert.ok(Number.isFinite(v));
  }
});

// ---------------------------------------------------------------------------
// 降级语义：judge 信号永不触碰 deterministic verdict
// ---------------------------------------------------------------------------

test('SCI-JUDGE-001 degrade: UNCALIBRATED → annotation only; CALIBRATED → reference signal, never verdict input', () => {
  const degraded = degradeJudgeSignal('UNCALIBRATED_ANNOTATION_ONLY', { score: 0.8, note: 'judge prefers A' });
  assert.equal(degraded.usableAsReference, false);
  assert.equal(degraded.role, 'annotation_only');

  const calibrated = degradeJudgeSignal('CALIBRATED_REFERENCE', { score: 0.8, note: 'judge prefers A' });
  assert.equal(calibrated.usableAsReference, true);
  assert.equal(calibrated.role, 'calibrated_reference');
  // 即便校准通过，judge 信号仍然只是参考——两种状态都声明不进裁决
  assert.match(calibrated.note, /deterministic verdict/i);
  assert.match(degraded.note, /deterministic verdict/i);
});

test('SCI-JUDGE-001 structure: verdict kernel modules never import the judge (static scan)', () => {
  // 真仓库：裁决路径（src/fec、src/statistics 及信任内核层）不 import judge 模块
  const repoRoot = new URL('../../', import.meta.url);
  assert.equal(assertJudgeCannotTouchVerdict(repoRoot).ok, true);

  // fixture：kernel 文件 value-import judge → 必须被抓住（fail-closed 静态断言）
  const tmp = mkdtempSync(join(tmpdir(), 'judge-scan-'));
  try {
    mkdirSync(join(tmp, 'src', 'fec'), { recursive: true });
    writeFileSync(
      join(tmp, 'src', 'fec', 'compiler.ts'),
      "import { assessJudgeReliability } from '../evaluation/judge_reliability.ts';\n",
    );
    const r = assertJudgeCannotTouchVerdict(tmp);
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => v.includes('fec/compiler.ts') && v.includes('judge')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
