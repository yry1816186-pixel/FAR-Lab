// tests/research/question.test.ts
// SCI-QUESTION-001 研究问题结构化边界：11 字段 schema 全必填、确定性范围分类
// 启发式（well_formed/too_broad/unfalsifiable/ambiguous）、路由（CLARIFY/
// DECOMPOSE/UNDECIDABLE）、不可判定问题的结论状态强制 NOT_IMPLEMENTED。
// 纯函数，无 mock；对抗样本覆盖伪装良性皮肤的多目标堆叠。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ResearchQuestionSchema,
  allowedConclusionStatuses,
  capConclusionForUndecidableRoute,
  classifyQuestionScope,
  decomposeQuestion,
  routeQuestion,
} from '../../src/science/research_question.ts';
import type { ResearchQuestion } from '../../src/science/research_question.ts';

// ---------------------------------------------------------------------------
// 夹具（11 字段全填 = 合法基准；四类案例在此基准上单字段扰动）
// ---------------------------------------------------------------------------

function wellFormed(overrides: Partial<ResearchQuestion> = {}): ResearchQuestion {
  return ResearchQuestionSchema.parse({
    question: 'Does daily aspirin intake reduce 12-month recurrent stroke risk in adults aged 60-70?',
    targetPhenomenon: '12-month recurrent stroke incidence rate',
    populationSystem: 'adults aged 60-70 with a first ischemic stroke',
    temporalSpatialScope: '2020-2025, multi-center hospitals in one country',
    knownConstraints: ['aspirin contraindication excludes participants', 'self-report adherence is unreliable'],
    decisionRelevance: 'determines whether low-dose aspirin should be part of secondary prevention guidelines',
    successCriteria: ['hazard ratio of recurrence measurable from the registry with 95% CI', 'predefined threshold HR < 0.9 counts as reduction'],
    exclusions: ['hemorrhagic stroke patients', 'participants under 60'],
    safetyClassification: 'low-risk observational cohort analysis',
    initialUnknowns: ['baseline adherence distribution', 'competing-risk adjustment quality'],
    requiredEvidenceStandard: 'prospective cohort or RCT with ≥1000 participants and preregistered analysis',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// schema：11 字段全必填
// ---------------------------------------------------------------------------

test('SCI-QUESTION-001 schema: 11 fields all required — dropping any one fails parse', () => {
  const full = wellFormed();
  const requiredFields = [
    'question', 'targetPhenomenon', 'populationSystem', 'temporalSpatialScope',
    'knownConstraints', 'decisionRelevance', 'successCriteria', 'exclusions',
    'safetyClassification', 'initialUnknowns', 'requiredEvidenceStandard',
  ] as const;
  assert.equal(requiredFields.length, 11);
  for (const field of requiredFields) {
    const mutilated: Record<string, unknown> = { ...full };
    delete mutilated[field];
    const result = ResearchQuestionSchema.safeParse(mutilated);
    assert.equal(result.success, false, `dropping '${field}' must fail validation`);
  }
  // 空串 / 空数组同样不合法（“填了但没填”不是边界）
  assert.equal(ResearchQuestionSchema.safeParse({ ...full, question: '' }).success, false);
  assert.equal(ResearchQuestionSchema.safeParse({ ...full, successCriteria: [] }).success, false);
  assert.equal(ResearchQuestionSchema.safeParse({ ...full, exclusions: [] }).success, false);
});

// ---------------------------------------------------------------------------
// classifyQuestionScope：四类案例各 ≥2
// ---------------------------------------------------------------------------

test('SCI-QUESTION-001 scope: well_formed ×2 — bounded population + measurable criteria', () => {
  const a = wellFormed();
  const b = wellFormed({
    question: 'Does sleep restriction impair motor-skill consolidation in healthy adults aged 18-30 over two weeks?',
    targetPhenomenon: 'overnight motor-skill consolidation score delta',
    populationSystem: 'healthy adults aged 18-30',
    temporalSpatialScope: 'two-week in-lab protocol, single site',
    successCriteria: ['consolidation score delta comparable between restricted and control nights at p<0.05'],
  });
  assert.equal(classifyQuestionScope(a).scope, 'well_formed');
  assert.equal(classifyQuestionScope(b).scope, 'well_formed');
});

test('SCI-QUESTION-001 scope: too_broad ×2 — breadth-word density and goal stacking', () => {
  // 案例1：范围词密度（all/every/in general 堆叠于同一个问题）
  const breadth = wellFormed({
    question: 'How do all drugs interact with every protein in general across any organism universally?',
    temporalSpatialScope: 'all time and all species, in general any context',
  });
  // 案例2：多目标堆叠（≥3 个 and-连接目标）
  const stacked = wellFormed({
    question: 'Does aspirin reduce stroke risk and improve cognition and lower cancer incidence and extend lifespan in adults?',
  });
  assert.equal(classifyQuestionScope(breadth).scope, 'too_broad');
  assert.equal(classifyQuestionScope(stacked).scope, 'too_broad');
  // 信号可解释：报告里必须点名触发原因（不是黑箱分类）
  assert.ok(classifyQuestionScope(breadth).signals.length >= 1);
  assert.ok(classifyQuestionScope(stacked).signals.some((s) => s.includes('goal')));
});

test('SCI-QUESTION-001 scope: unfalsifiable ×2 — no falsification marker / no observable object', () => {
  // 案例1：successCriteria 全部不可测量（无可证伪标记）
  const noFalsifier = wellFormed({
    question: 'Is the universe fundamentally harmonious?',
    targetPhenomenon: 'fundamental harmony of the universe',
    successCriteria: ['it should feel coherent', 'the answer resonates with theory'],
  });
  // 案例2：目标现象是不可操作化对象（无可观察对象）
  const noObservable = wellFormed({
    question: 'Does the human soul obey thermodynamic destiny?',
    targetPhenomenon: 'the destiny of the human soul',
    successCriteria: ['soul entropy measurable against destiny predictions'], // 有 measurable 词，但对象不可操作化
  });
  assert.equal(classifyQuestionScope(noFalsifier).scope, 'unfalsifiable');
  assert.equal(classifyQuestionScope(noObservable).scope, 'unfalsifiable');
});

test('SCI-QUESTION-001 scope: ambiguous ×2 — vague qualifier without anchor / leading pronoun', () => {
  // 案例1：模糊量词无比较锚（better…better than what?）
  const vague = wellFormed({
    question: 'Is the new treatment significantly better?',
    successCriteria: ['treatment outcome measurable in the trial population'],
  });
  // 案例2：指代不明（句首代词无先行词）
  const pronoun = wellFormed({
    question: 'It improves memory consolidation in older adults — does the effect hold?',
  });
  assert.equal(classifyQuestionScope(vague).scope, 'ambiguous');
  assert.equal(classifyQuestionScope(pronoun).scope, 'ambiguous');
});

test('SCI-QUESTION-001 scope: adversarial benign-skin stacking and boundary below threshold', () => {
  // 对抗：良性皮肤（天文学词汇）下的多目标堆叠 —— 皮肤换不掉结构信号
  const adversarial = wellFormed({
    question: 'Does exoplanet radius correlate with insolation and with metallicity and with host-star age across all systems?',
    targetPhenomenon: 'radius-insolation-metallicity-star-age relation',
    populationSystem: 'confirmed exoplanets with measured radii',
  });
  assert.equal(classifyQuestionScope(adversarial).scope, 'too_broad');
  // 边界：恰好两个目标 + 无范围词 = 不触发（阈值下必须放行，否则 FP）
  const twoGoals = wellFormed({
    question: 'Does aspirin reduce stroke risk and bleeding risk in adults aged 60-70?',
  });
  assert.equal(classifyQuestionScope(twoGoals).scope, 'well_formed');
});

// ---------------------------------------------------------------------------
// routeQuestion：CLARIFY / DECOMPOSE / UNDECIDABLE
// ---------------------------------------------------------------------------

test('SCI-QUESTION-001 route: too_broad → DECOMPOSE with deterministic per-goal subquestions', () => {
  const q = wellFormed({
    question: 'Does aspirin reduce stroke risk and improve cognition and lower cancer incidence in adults?',
  });
  const route = routeQuestion(q);
  assert.equal(route.action, 'DECOMPOSE');
  assert.ok(route.subQuestions !== undefined && route.subQuestions.length === 3, 'one subquestion per stacked goal');
  // 每个子问题聚焦单一目标且继承 population（按 population/目标切分）
  for (const sub of route.subQuestions ?? []) {
    assert.ok(sub.question.includes('adults'), 'subquestion inherits the population');
    assert.ok(!/ and /.test(sub.question), 'subquestion carries exactly one goal');
  }
  // 确定性：同输入两次路由逐字节一致
  assert.deepEqual(routeQuestion(q), route);
});

test('SCI-QUESTION-001 route: ambiguous → CLARIFY; unfalsifiable → UNDECIDABLE', () => {
  const ambiguous = routeQuestion(wellFormed({ question: 'Is the new treatment significantly better?' }));
  assert.equal(ambiguous.action, 'CLARIFY');
  assert.equal(ambiguous.subQuestions, undefined);

  const undecidable = routeQuestion(wellFormed({
    question: 'Is the universe fundamentally harmonious?',
    targetPhenomenon: 'fundamental harmony of the universe',
    successCriteria: ['it should feel coherent'],
  }));
  assert.equal(undecidable.action, 'UNDECIDABLE');
  assert.equal(undecidable.subQuestions, undefined);
});

test('SCI-QUESTION-001 route: well_formed → PROCEED (no gate friction on bounded questions)', () => {
  assert.equal(routeQuestion(wellFormed()).action, 'PROCEED');
});

test('SCI-QUESTION-001 decompose: fallback to successCriteria split when question has no list separator', () => {
  const q = wellFormed({
    question: 'How do aspirin outcomes vary across the full adult risk spectrum in general?',
    successCriteria: ['stroke HR measurable at 12 months', 'cognition score measurable at 12 months'],
  });
  const subs = decomposeQuestion(q);
  assert.equal(subs.length, 2, 'no separator → split by success criteria (each criterion = one adjudicable unit)');
  assert.deepEqual(decomposeQuestion(q), subs, 'deterministic');
});

// ---------------------------------------------------------------------------
// Failure 路径：UNDECIDABLE 不得产生高置信结论
// ---------------------------------------------------------------------------

test('SCI-QUESTION-001 cap: UNDECIDABLE forbids CONFIRMED/REFUTED — NOT_IMPLEMENTED is the honest ceiling', () => {
  const route = { action: 'UNDECIDABLE' as const, reason: 'no falsification marker', signals: ['no-measurable-criterion'] };
  // 高置信裁决 → fail-closed 抛错（不得静默放行）
  assert.throws(
    () => capConclusionForUndecidableRoute(route, { verdict: 'CONFIRMED', confidence: 0.9 }),
    /NOT_IMPLEMENTED/,
  );
  assert.throws(
    () => capConclusionForUndecidableRoute(route, { verdict: 'REFUTED', confidence: 0.8 }),
    /NOT_IMPLEMENTED/,
  );
  // NOT_IMPLEMENTED / UNKNOWN（含 INCONCLUSIVE——不知就是不知）放行
  assert.deepEqual(
    capConclusionForUndecidableRoute(route, { verdict: 'NOT_IMPLEMENTED', confidence: 0 }),
    { verdict: 'NOT_IMPLEMENTED', confidence: 0 },
  );
  assert.deepEqual(
    capConclusionForUndecidableRoute(route, { verdict: 'UNKNOWN', confidence: 0 }),
    { verdict: 'UNKNOWN', confidence: 0 },
  );
});

test('SCI-QUESTION-001 cap: CLARIFY/DECOMPOSE also exclude CONFIRMED/REFUTED until the question is repaired', () => {
  assert.deepEqual(allowedConclusionStatuses('PROCEED'), ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED', 'NOT_IMPLEMENTED', 'UNKNOWN']);
  assert.ok(!allowedConclusionStatuses('CLARIFY').includes('CONFIRMED'));
  assert.ok(!allowedConclusionStatuses('DECOMPOSE').includes('REFUTED'));
  assert.ok(allowedConclusionStatuses('CLARIFY').includes('NOT_IMPLEMENTED'));
});
