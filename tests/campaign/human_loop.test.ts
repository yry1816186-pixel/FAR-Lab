// tests/campaign/human_loop.test.ts
// SCI-HITL-001 人类输入与机器裁决分层：HITL 事件走战役台账哈希链（append-only
// 审计）、权限矩阵、human prior 恒为 context（证据聚合恒拒）、人类批准不改
// 科学状态、冲突并排展示、回滚=追加 REVERTED 标记（审计链保留原事件）。

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { saveCampaignStarted, loadCampaign, appendEvent } from '../../src/campaign/store.ts';
import { campaignEventsPath, verifyCampaignEventChain } from '../../src/campaign/event_log.ts';
import {
  applyHumanApproval,
  assertAuthorized,
  canPerform,
  deriveHumanLoopState,
  evidenceAdmissibility,
  recordConflict,
  recordHumanEvent,
  revertHumanEvent,
} from '../../src/campaign/human_loop.ts';

/** 固定时钟（审计测试确定性）。 */
const FIXED_CLOCK = (): Date => new Date('2026-08-17T00:00:00Z');

function newCampaignDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'hitl-'));
  saveCampaignStarted(dir, {
    topic: 'llm hallucination mitigation',
    plannedQuestions: ['q1 about detection'],
    budgetTokens: 100_000,
    now: FIXED_CLOCK,
  });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// 审计：HITL 事件落主台账（append-only 哈希链）
// ---------------------------------------------------------------------------

test('SCI-HITL-001 audit: HITL events append onto the campaign hash chain and survive load', () => {
  const { dir, cleanup } = newCampaignDir();
  try {
    recordHumanEvent(dir, { type: 'prior_injected', priorId: 'prior-1', actor: 'pi@lab', statement: 'expect smaller effect in cohort B', kind: 'context' }, FIXED_CLOCK);
    recordHumanEvent(dir, { type: 'annotation', targetId: 'run-42', actor: 'ra@lab', note: 'sample size looks off' }, FIXED_CLOCK);
    const { events } = loadCampaign(dir); // load = 读 + 验链 + 重放（链断会抛）
    assert.equal(events.length, 3);
    assert.equal(events[1]?.payload.type, 'prior_injected');
    assert.ok(verifyCampaignEventChain(events).valid, 'HITL events are covered by the tamper-evident chain');
    // 调度投影不受 HITL 影响（分层铁律的机器面）
    const { state } = loadCampaign(dir);
    assert.equal(state.cumulativeTokens, 0);
    assert.equal(state.questions[0]?.status, 'pending');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 权限矩阵
// ---------------------------------------------------------------------------

test('SCI-HITL-001 authority: role matrix gates who may do what (and assertAuthorized throws)', () => {
  // PI 全权；researcher 不能驳回资源/接受风险；safety_officer 只管安全三件
  assert.equal(canPerform('principal_investigator', 'accept_risk'), true);
  assert.equal(canPerform('researcher', 'inject_prior'), true);
  assert.equal(canPerform('researcher', 'veto_resource'), false);
  assert.equal(canPerform('researcher', 'accept_risk'), false);
  assert.equal(canPerform('safety_officer', 'pause_campaign'), true);
  assert.equal(canPerform('safety_officer', 'veto_resource'), true);
  assert.equal(canPerform('safety_officer', 'inject_prior'), false);
  assert.equal(canPerform('auditor', 'annotate'), false); // 只读角色零写入
  assert.throws(() => assertAuthorized('researcher', 'accept_risk'), /not authorized/i);
  assert.doesNotThrow(() => assertAuthorized('principal_investigator', 'accept_risk'));
});

// ---------------------------------------------------------------------------
// 分层铁律：human prior 恒为 context，证据聚合恒拒
// ---------------------------------------------------------------------------

test('SCI-HITL-001 layering: evidenceAdmissibility rejects human input unconditionally — even disguised as evidence', () => {
  const asContext = evidenceAdmissibility({ kind: 'context', statement: 'prior text' });
  assert.equal(asContext.admissible, false);
  assert.match(asContext.reason, /context/i);
  // 伪装成 evidence 的 human prior 也恒拒（铁律不看标签看来源）
  const disguised = evidenceAdmissibility({ kind: 'evidence', statement: 'trust me' });
  assert.equal(disguised.admissible, false);
  assert.match(disguised.reason, /never admissible as evidence/i);
});

// ---------------------------------------------------------------------------
// 人类批准不改科学状态
// ---------------------------------------------------------------------------

test('SCI-HITL-001 approval: human approval changes review status only — science state is bit-identical', () => {
  const science = { verdict: 'INCONCLUSIVE' as const, confidence: 0.3 };
  const after = applyHumanApproval(science, { approvedBy: 'pi@lab', comment: 'plan is sound' });
  assert.deepEqual(after.scienceState, science, 'verdict and confidence untouched by human approval');
  assert.equal(after.reviewStatus, 'HUMAN_APPROVED');
  // 批准动作不得夹带科学状态字段（借批准通道改结论 = 违宪）——用变量传递
  // 绕过字面量 excess-property 检查，模拟真实调用方的夹带尝试。
  const sneakyVerdict: { approvedBy: string; verdict?: unknown } = { approvedBy: 'pi@lab', verdict: 'CONFIRMED' };
  assert.throws(() => applyHumanApproval(science, sneakyVerdict), /must not carry/i);
  const sneakyConfidence: { approvedBy: string; confidence?: unknown } = { approvedBy: 'pi@lab', confidence: 0.99 };
  assert.throws(() => applyHumanApproval(science, sneakyConfidence), /must not carry/i);
});

// ---------------------------------------------------------------------------
// 冲突并排：human prior vs machine verdict
// ---------------------------------------------------------------------------

test('SCI-HITL-001 conflict: human prior and machine verdict shown side by side, unresolved (human cannot overwrite machine)', () => {
  const conflict = recordConflict(
    { priorId: 'prior-1', statement: 'cohort B shows a strong effect' },
    { claimId: 'claim-7', verdict: 'REFUTED', basis: 'evidence chain root hash mismatch' },
  );
  assert.equal(conflict.resolution, 'UNRESOLVED');
  assert.ok(conflict.sideBySide.includes('cohort B shows a strong effect'), 'human view verbatim');
  assert.ok(conflict.sideBySide.includes('REFUTED'), 'machine view verbatim');
  assert.match(conflict.sideBySide, /HUMAN.*MACHINE|PRIOR.*MACHINE/s, 'two views rendered side by side');
});

// ---------------------------------------------------------------------------
// 回滚：审计链保留原事件 + REVERTED 标记（非删除）
// ---------------------------------------------------------------------------

test('SCI-HITL-001 revert: original event stays in the ledger, REVERTED marker appends, chain stays valid', () => {
  const { dir, cleanup } = newCampaignDir();
  try {
    const prior = recordHumanEvent(dir, { type: 'prior_injected', priorId: 'prior-1', actor: 'pi@lab', statement: 'effect is larger in cohort B', kind: 'context' }, FIXED_CLOCK);
    revertHumanEvent(dir, prior.seq, 'pi@lab', 'prior was based on a misread table', FIXED_CLOCK);

    const { events } = loadCampaign(dir);
    assert.equal(events.length, 3, 'genesis + prior + revert marker — nothing deleted');
    assert.equal(events[1]?.payload.type, 'prior_injected', 'the reverted prior is still on the ledger (audit trail)');
    const marker = events[2]?.payload;
    assert.equal(marker?.type, 'human_event_reverted');
    if (marker?.type === 'human_event_reverted') assert.equal(marker.revertedSeq, prior.seq);
    assert.ok(verifyCampaignEventChain(events).valid);

    // 投影：被回滚的 prior 标记 reverted，但内容仍可读（历史不消失）
    const loop = deriveHumanLoopState(events);
    assert.equal(loop.priors.length, 1);
    assert.equal(loop.priors[0]?.reverted, true);
    assert.equal(loop.priors[0]?.statement, 'effect is larger in cohort B');

    // 重复回滚同一 seq → 拒绝（幂等防重）
    assert.throws(() => revertHumanEvent(dir, prior.seq, 'pi@lab', 'again', FIXED_CLOCK), /already reverted/i);
    // 回滚调度事件 → 拒绝（调度事实不可被人类回滚篡改）
    const started = recordHumanEvent(dir, { type: 'campaign_paused', actor: 'pi@lab', reason: 'check budget' }, FIXED_CLOCK);
    void started;
    assert.throws(() => revertHumanEvent(dir, 1, 'pi@lab', 'trying to revert genesis', FIXED_CLOCK), /cannot revert/i);
  } finally {
    cleanup();
  }
});

test('SCI-HITL-001 revert: reverting an unknown seq is refused (no phantom reverts)', () => {
  const { dir, cleanup } = newCampaignDir();
  try {
    assert.throws(() => revertHumanEvent(dir, 99, 'pi@lab', 'no such event', FIXED_CLOCK), /not found|unknown/i);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 人类循环投影：paused/resumed
// ---------------------------------------------------------------------------

test('SCI-HITL-001 projection: deriveHumanLoopState tracks pause/resume and prior revert state', () => {
  const { dir, cleanup } = newCampaignDir();
  try {
    recordHumanEvent(dir, { type: 'campaign_paused', actor: 'pi@lab', reason: 'awaiting IRB docs' }, FIXED_CLOCK);
    const paused = deriveHumanLoopState(loadCampaign(dir).events);
    assert.equal(paused.paused, true);

    recordHumanEvent(dir, { type: 'campaign_resumed', actor: 'pi@lab', reason: 'IRB approved' }, FIXED_CLOCK);
    const resumed = deriveHumanLoopState(loadCampaign(dir).events);
    assert.equal(resumed.paused, false);
    assert.equal(resumed.eventCount, 2, 'pause + resume（genesis 是调度事件，不计入人类循环事件数）');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 篡改检测（负向）：改写历史 HITL 事件文本 → 哈希链断裂
// ---------------------------------------------------------------------------

test('SCI-HITL-001 tamper: editing a historical human event breaks the chain (fail-closed)', () => {
  const { dir, cleanup } = newCampaignDir();
  try {
    recordHumanEvent(dir, { type: 'prior_injected', priorId: 'prior-1', actor: 'pi@lab', statement: 'original statement', kind: 'context' }, FIXED_CLOCK);
    const path = campaignEventsPath(dir);
    const tampered = readFileSync(path, 'utf8').replace('original statement', 'retconned statement');
    writeFileSync(path, tampered, 'utf8');
    assert.throws(() => loadCampaign(dir), /corrupt campaign ledger|eventHash/i);
    // 追加路径同样拒绝在坏链上续写
    assert.throws(
      () => appendEvent(dir, { type: 'annotation', targetId: 't', actor: 'a@lab', note: 'n' }, FIXED_CLOCK),
      /refusing to append|corrupt campaign ledger/i,
    );
  } finally {
    cleanup();
  }
});
