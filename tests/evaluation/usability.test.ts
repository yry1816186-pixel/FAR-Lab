// tests/evaluation/usability.test.ts
// EVAL-USABILITY-001：参与者协议/任务脚本校验、6 指标会话记录、PII 扫描、
// dogfood 与外部严格分开聚合、问题优先级板、声称门。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  aggregateUsability,
  issuePriorityBoard,
  privacyCheck,
  renderUsabilityReport,
  userValidationClaimGate,
  validateParticipantProtocol,
  validateTaskScript,
} from '../../src/evaluation/usability.ts';
import type { TaskScript, UsabilityIssue, UsabilitySession } from '../../src/evaluation/usability.ts';

function session(overrides: Partial<UsabilitySession> = {}): UsabilitySession {
  return {
    sessionId: 's1',
    participantId: 'p1',
    cohort: 'team-dogfood',
    taskId: 'verify-claim',
    completion: true,
    timeOnTaskMs: 120000,
    errors: 1,
    frictionNotes: ['could not find the evidence column at first'],
    comprehensionMisunderstandings: 0,
    fixesApplied: [],
    ...overrides,
  };
}

test('EVAL-USABILITY-001: 协议门——外部组必须知情同意 + 任务脚本每步必须有成功判据', () => {
  const okDogfood = validateParticipantProtocol({ plannedCount: 3, cohort: 'team-dogfood', roles: ['engineer'], consentRef: null });
  assert.equal(okDogfood.ok, true);
  const noConsent = validateParticipantProtocol({ plannedCount: 5, cohort: 'external-user', roles: ['scientist'], consentRef: null });
  assert.equal(noConsent.ok, false);
  assert.ok(noConsent.problems.some((p) => p.includes('consent')));
  const withConsent = validateParticipantProtocol({ plannedCount: 5, cohort: 'external-user', roles: ['scientist'], consentRef: 'consent-form-v2.pdf' });
  assert.equal(withConsent.ok, true);
  assert.equal(validateParticipantProtocol({ plannedCount: 0, cohort: 'team-dogfood', roles: [], consentRef: null }).ok, false);

  const script: TaskScript = {
    taskId: 'verify-claim',
    steps: [
      { stepId: 'open', instruction: 'open the claim page', successCriterion: 'claim details visible' },
      { stepId: 'trace', instruction: 'trace to evidence', successCriterion: '' },
    ],
  };
  const scriptResult = validateTaskScript(script);
  assert.equal(scriptResult.ok, false);
  assert.ok(scriptResult.problems.some((p) => p.includes('trace')));
});

test('EVAL-USABILITY-001: 聚合——中位数/完成率/均值正确 + 混 cohort/混 task 结构性拒绝', () => {
  const agg = aggregateUsability([
    session({ sessionId: 's1', timeOnTaskMs: 60000, completion: true, errors: 0 }),
    session({ sessionId: 's2', timeOnTaskMs: 100000, completion: false, errors: 2, comprehensionMisunderstandings: 1 }),
    session({ sessionId: 's3', timeOnTaskMs: 200000, completion: true, errors: 1 }),
  ]);
  assert.equal(agg.cohort, 'team-dogfood');
  assert.equal(agg.sessionCount, 3);
  assert.equal(agg.completionRate, 2 / 3);
  assert.equal(agg.medianTimeOnTaskMs, 100000, '3 会话中位数是中间值');
  assert.ok(Math.abs(agg.meanErrorsPerSession - 1) < 1e-12);
  assert.ok(Math.abs(agg.meanComprehensionMisunderstandings - 1 / 3) < 1e-12);
  assert.equal(agg.frictionNotes.length, 3, '摩擦点原始记录不被聚合吞并');

  // 偶数会话中位数取均值
  const even = aggregateUsability([session({ timeOnTaskMs: 60000 }), session({ timeOnTaskMs: 100000 })]);
  assert.equal(even.medianTimeOnTaskMs, 80000);

  // 混 cohort：结构性拒绝（不是警告——分母不可混）
  assert.throws(
    () => aggregateUsability([session({}), session({ cohort: 'external-user' })]),
    /mixed cohorts/,
  );
  // 混 task：拒绝
  assert.throws(() => aggregateUsability([session({}), session({ taskId: 'export-receipt' })]), /mixed tasks/);
  assert.throws(() => aggregateUsability([]), /no sessions/);
});

test('EVAL-USABILITY-001: 报告模板——两组分开渲染 + 缺组如实 NOT CONDUCTED', () => {
  const dogfood = aggregateUsability([session({ sessionId: 's1' }), session({ sessionId: 's2', completion: false })]);
  const rendered = renderUsabilityReport({ dogfood });
  assert.ok(rendered.includes('[team-dogfood]'));
  assert.ok(rendered.includes('[external-user] NOT CONDUCTED'));
  assert.ok(rendered.includes('no claims of user validation may cite this cohort'));
  const both = renderUsabilityReport({
    dogfood,
    external: aggregateUsability([session({ sessionId: 'e1', cohort: 'external-user' })]),
  });
  assert.ok(both.includes('completion=100%'));
  assert.ok(!both.includes('NOT CONDUCTED'));
});

test('EVAL-USABILITY-001: PII 扫描——email/电话/身份证样式命中 + 干净记录通过', () => {
  const clean = privacyCheck(session({ frictionNotes: ['confusing wording on step two'] }));
  assert.equal(clean.ok, true);
  const dirty = privacyCheck(
    session({
      frictionNotes: ['participant said contact me at jane.doe@example.org', 'called from 13800138000 during task'],
    }),
  );
  assert.equal(dirty.ok, false);
  assert.ok(dirty.hits.some((h) => h.label === 'email' && h.noteIndex === 0));
  assert.ok(dirty.hits.some((h) => h.label === 'phone' && h.noteIndex === 1));
});

test('EVAL-USABILITY-001: 问题板——严重度×频率排序 + 未验证修复挂账 + 闭环判定', () => {
  const issues: UsabilityIssue[] = [
    { issueId: 'i-minor-1', description: 'typo in step label', affectedSessions: 5, severity: 'minor', verifiedFixRef: 'fix-101' },
    { issueId: 'i-blocker-1', description: 'cannot submit verdict', affectedSessions: 2, severity: 'blocker', verifiedFixRef: null },
    { issueId: 'i-major-1', description: 'evidence column hidden on scroll', affectedSessions: 4, severity: 'major', verifiedFixRef: 'fix-88' },
    { issueId: 'i-blocker-2', description: 'login loop for new users', affectedSessions: 3, severity: 'blocker', verifiedFixRef: null },
  ];
  const board = issuePriorityBoard(issues);
  // blocker 优先，同严重度按频率降序：i-blocker-2(3) > i-blocker-1(2)
  assert.deepEqual(
    board.ordered.map((i) => i.issueId),
    ['i-blocker-2', 'i-blocker-1', 'i-major-1', 'i-minor-1'],
  );
  assert.equal(board.openBlockers, 2);
  assert.equal(board.unverifiedFixes, 2);
  assert.equal(board.allResolved, false);
  const resolved = issuePriorityBoard(issues.map((i) => (i.issueId === 'i-blocker-1' ? { ...i, verifiedFixRef: 'fix-99' } : i)));
  assert.equal(resolved.openBlockers, 1);
  assert.equal(issuePriorityBoard(issues.map((i) => ({ ...i, verifiedFixRef: 'f' }))).allResolved, true);
  assert.equal(issuePriorityBoard([]).allResolved, false, '空板不算闭环（无事≠验证完成）');
});

test('EVAL-USABILITY-001: 声称门——零外部会话拒绝「用户验证完成」+ dogfood 不冒充', () => {
  const dogfoodOnly = [session({ sessionId: 's1' }), session({ sessionId: 's2' })];
  const claimed = userValidationClaimGate(dogfoodOnly, true);
  assert.equal(claimed.ok, false);
  assert.match(claimed.reason, /0 external-user sessions/);
  assert.match(claimed.reason, /team dogfood is not user validation/);
  // 不声称用户验证的 dogfood 报告合法
  assert.equal(userValidationClaimGate(dogfoodOnly, false).ok, true);
  // 有真实外部会话支撑的声称通过
  const withExternal = [...dogfoodOnly, session({ sessionId: 'e1', cohort: 'external-user' })];
  const passed = userValidationClaimGate(withExternal, true);
  assert.equal(passed.ok, true);
  assert.equal(passed.externalSessions, 1);
  assert.equal(passed.dogfoodSessions, 2);
});
