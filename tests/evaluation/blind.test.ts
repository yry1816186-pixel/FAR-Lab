// tests/evaluation/blind.test.ts
// EVAL-BLIND-001：匿名化+盲化检查、种子化洗牌重放稳定、Cohen/Fleiss κ、
// Wilson CI、模型/真人分开报告、裁决清单、真人防伪门。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  agreementReport,
  agreementWilsonCI,
  anonymizeSample,
  blindnessCheck,
  cohenKappa,
  fleissKappa,
  humanClaimGate,
  randomizeOrder,
} from '../../src/evaluation/blind.ts';
import type { RatingRecord } from '../../src/evaluation/blind.ts';

// ---------------------------------------------------------------------------
// 匿名化 + 盲化检查
// ---------------------------------------------------------------------------

test('EVAL-BLIND-001: 匿名化剥离模型自称 + 剥离清单可审计 + 盲化检查双向', () => {
  const samples = [
    { id: 'a1', text: 'As an AI language model, I cannot verify live data.' },
    { id: 'a2', text: 'GPT-4o scored highest on this axis per my training data.' },
    { id: 'a3', text: 'The correlation is positive across all twelve samples.' },
  ];
  const anonymized = anonymizeSample(samples);
  // 命中的标记被替换且剥离清单记录了次数
  const a1 = anonymized.find((s) => s.id === 'a1');
  const a2 = anonymized.find((s) => s.id === 'a2');
  assert.ok(a1?.strippedMarkers.some((m) => m.label === 'first-person-self-ref'));
  assert.ok(a2?.strippedMarkers.some((m) => m.label === 'openai-self-ref'));
  assert.ok(!(a2?.text.includes('GPT-4o') ?? true));
  // 干净样本零剥离
  const a3 = anonymized.find((s) => s.id === 'a3');
  assert.equal(a3?.strippedMarkers.length, 0);
  // 匿名化后盲化检查通过
  const check = blindnessCheck(anonymized);
  assert.equal(check.ok, true);
  assert.equal(check.scanned, 3);

  // 负向：未经匿名化的原始文本 → 盲化检查 FAIL 且残留可定位
  const rawCheck = blindnessCheck(anonymizeSample(samples).map((s, i) => ({
    ...s,
    text: i === 1 ? 'Claude said this first' : s.text,
  })));
  assert.equal(rawCheck.ok, false);
  assert.ok(rawCheck.residues.some((r) => r.id === 'a2' && r.label === 'anthropic-self-ref'));
});

// ---------------------------------------------------------------------------
// 顺序随机化：种子显式 + 确定性重放
// ---------------------------------------------------------------------------

test('EVAL-BLIND-001: 种子化洗牌——同种子同序（重放稳定）/异种子大概率异序/坏种子拒绝', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `item-${i}`);
  const r1 = randomizeOrder(ids, 42);
  const r2 = randomizeOrder(ids, 42);
  assert.deepEqual(r1.order, r2.order, '同种子必须同序（可审计重放）');
  assert.deepEqual([...r1.order].sort(), [...ids].sort(), '洗牌是排列不是采样');
  const r3 = randomizeOrder(ids, 43);
  assert.notDeepEqual(r1.order, r3.order, '异种子应产生不同顺序（20 项碰撞概率极低）');
  // 边界：单元素与空集是恒等排列；坏种子 fail-closed
  assert.deepEqual(randomizeOrder(['x'], 7).order, ['x']);
  assert.deepEqual(randomizeOrder([], 7).order, []);
  assert.throws(() => randomizeOrder(ids, -1), /seed must be a non-negative integer/);
  assert.throws(() => randomizeOrder(ids, 3.5), /seed must be a non-negative integer/);
});

// ---------------------------------------------------------------------------
// 一致性统计
// ---------------------------------------------------------------------------

test('EVAL-BLIND-001: Cohen κ 三档（完美/高随机校正/零判反向）+ Fleiss κ 已知值 + Wilson CI 覆盖点估计', () => {
  // 完美一致 → κ=1
  assert.equal(cohenKappa(['a', 'b', 'a'], ['a', 'b', 'a']), 1);
  // 高于随机的一致：A=4a2b，B=5a1b，一致 5/6 → pe=(4/6)(5/6)+(2/6)(1/6)=11/18
  // κ=(5/6−11/18)/(1−11/18)=4/7 ≈ 0.571（手算对照）
  const ka = ['a', 'a', 'a', 'a', 'b', 'b'];
  const kb = ['a', 'a', 'a', 'a', 'a', 'b'];
  const kappa = cohenKappa(ka, kb);
  assert.ok(Math.abs(kappa - 4 / 7) < 1e-12, `手算对照失败: ${kappa}`);
  assert.ok(kappa > 0.3 && kappa < 1, '介于随机与完美之间');
  // 完全反向且标签平衡（po=0, pe=0.5）→ κ=-1；单标签退化（pe=1）按 0 处理
  assert.equal(cohenKappa(['a', 'a', 'b', 'b'], ['b', 'b', 'a', 'a']), -1);
  assert.equal(cohenKappa(['a', 'a'], ['b', 'b']), 0, '零重叠标签的退化情形 pe=0 → κ 无信号（记 0）');
  // 形状不匹配 fail-closed
  assert.throws(() => cohenKappa(['a'], ['a', 'b']), /same non-empty item set/);

  // Fleiss κ 手算对照：6 raters × 6 items；pj=(15/36,21/36) → pe=37/72；
  // 各项 Pi：五个全一致项=1、一个 3:3 项=0.4 → pbar=0.9；
  // κ=(0.9−37/72)/(1−37/72)=139/175≈0.7943
  const counts = [
    [0, 6],
    [0, 6],
    [0, 6],
    [6, 0],
    [6, 0],
    [3, 3],
  ];
  const fk = fleissKappa(counts);
  assert.ok(Math.abs(fk - 139 / 175) < 1e-12, `Fleiss 手算对照失败: ${fk}`);
  // 完美一致 → 1
  assert.equal(fleissKappa([[6, 0], [0, 6]]), 1);
  // 完全分歧（每项 3:3 平分）→ κ < 0
  assert.ok(fleissKappa([[3, 3], [3, 3], [3, 3]]) < 0);
  // ragged/行和错 → fail-closed
  assert.throws(() => fleissKappa([[1, 2], [1]]), /ragged/);
  assert.throws(() => fleissKappa([[1, 3], [2, 3]]), /row sums/);

  // Wilson CI：点估计落入区间内、0/0 输入与越界输入 fail-closed
  const ci = agreementWilsonCI(8, 10);
  assert.ok(ci.low < 0.8 && ci.high > 0.8);
  assert.ok(ci.low >= 0 && ci.high <= 1);
  const all = agreementWilsonCI(0, 10);
  assert.equal(all.low, 0, '0 一致的下界钳在 0');
  assert.ok(all.high > 0.27 && all.high < 0.28, `Wilson 上界非零（小样本不确定性的诚实呈现）: ${all.high}`);
  assert.throws(() => agreementWilsonCI(0, 0), /total must be positive/);
  assert.throws(() => agreementWilsonCI(11, 10), /out of range/);
});

// ---------------------------------------------------------------------------
// 分组报告（模型/真人分开）+ 裁决清单
// ---------------------------------------------------------------------------

test('EVAL-BLIND-001: 模型组与真人组分开统计（不合并）+ 分歧项进裁决清单 + 无真人数据如实 NULL', () => {
  const ratings: RatingRecord[] = [
    // 模型组：m1 与 m2 高一致（5/6）
    { itemId: 'i1', reviewerId: 'm1', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i2', reviewerId: 'm1', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i3', reviewerId: 'm1', reviewerType: 'model', decision: 'better-b' },
    { itemId: 'i4', reviewerId: 'm1', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i5', reviewerId: 'm1', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i6', reviewerId: 'm1', reviewerType: 'model', decision: 'better-b' },
    { itemId: 'i1', reviewerId: 'm2', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i2', reviewerId: 'm2', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i3', reviewerId: 'm2', reviewerType: 'model', decision: 'better-b' },
    { itemId: 'i4', reviewerId: 'm2', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i5', reviewerId: 'm2', reviewerType: 'model', decision: 'better-a' },
    { itemId: 'i6', reviewerId: 'm2', reviewerType: 'model', decision: 'better-a' },
    // 真人组：h1 与 h2 完全一致
    { itemId: 'i1', reviewerId: 'h1', reviewerType: 'human', decision: 'better-a' },
    { itemId: 'i2', reviewerId: 'h1', reviewerType: 'human', decision: 'better-b' },
    { itemId: 'i1', reviewerId: 'h2', reviewerType: 'human', decision: 'better-a' },
    { itemId: 'i2', reviewerId: 'h2', reviewerType: 'human', decision: 'better-b' },
  ];
  const report = agreementReport(ratings);
  assert.equal(report.groups.length, 2);
  const modelGroup = report.groups.find((g) => g.reviewerType === 'model');
  const humanGroup = report.groups.find((g) => g.reviewerType === 'human');
  assert.equal(modelGroup?.reviewerCount, 2);
  assert.equal(humanGroup?.reviewerCount, 2);
  // 两组分开：模型 5/6、真人 2/2——合并统计会掩盖模型-真人差
  assert.ok(Math.abs((modelGroup?.pairwiseAgreement ?? 0) - 5 / 6) < 1e-12);
  assert.equal(humanGroup?.pairwiseAgreement, 1);
  assert.ok((humanGroup?.meanCohenKappa ?? 0) > (modelGroup?.meanCohenKappa ?? 1));
  assert.ok((humanGroup?.agreementCI?.low ?? 1) <= 1 && (humanGroup?.agreementCI?.high ?? 0) >= 1);
  assert.equal(report.hasHumanData, true);
  // 分歧项：i6（m1=b, m2=a）与 i2（模型双 a vs 真人双 b——跨组系统性分歧）非全一致 → 需裁决
  assert.equal(report.adjudicationRequired, 2);
  const i6 = report.adjudications.find((a) => a.itemId === 'i6');
  assert.equal(i6?.needsAdjudication, true);
  assert.deepEqual(i6?.decisionTally.map((t) => t.decision), ['better-a', 'better-b']);
  const i2 = report.adjudications.find((a) => a.itemId === 'i2');
  assert.equal(i2?.needsAdjudication, true, '模型-真人跨组分歧同样进裁决清单');
  assert.equal(report.adjudications.find((a) => a.itemId === 'i1')?.needsAdjudication, false);

  // 无真人数据：human 组统计如实 NULL（不伪造、不冒充）
  const modelOnly = agreementReport(ratings.filter((r) => r.reviewerType === 'model'));
  const humanEmpty = modelOnly.groups.find((g) => g.reviewerType === 'human');
  assert.equal(modelOnly.hasHumanData, false);
  assert.equal(humanEmpty?.reviewerCount, 0);
  assert.equal(humanEmpty?.pairwiseAgreement, null);
});

test('EVAL-BLIND-001: 真人防伪门——声称真人证据但零真人评分 → 拒绝；模型评分不能冒充真人', () => {
  const modelRatings: RatingRecord[] = [
    { itemId: 'i1', reviewerId: 'm1', reviewerType: 'model', decision: 'a' },
  ];
  const claimed = humanClaimGate(modelRatings, true);
  assert.equal(claimed.ok, false);
  assert.match(claimed.reason, /zero human ratings/);
  const honest = humanClaimGate(modelRatings, false);
  assert.equal(honest.ok, true);
  assert.equal(honest.humanRatings, 0);
  const real: RatingRecord[] = [
    { itemId: 'i1', reviewerId: 'h1', reviewerType: 'human', decision: 'a' },
  ];
  const withHuman = humanClaimGate(real, true);
  assert.equal(withHuman.ok, true);
  assert.equal(withHuman.humanRatings, 1);
});
