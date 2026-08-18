/**
 * campaign/human_loop — SCI-HITL-001 人类输入与机器裁决分层。
 *
 * 宪法条款的机器化：研究者可注入先验、批注、驳回资源投入、请求修订、
 * 暂停/继续 Campaign、接受明确风险——全部作为 HITL 事件写入战役台账的
 * append-only 哈希链（走 store.appendEvent，与调度事件同链同纪律）。
 *
 * 分层铁律（本模块存在的理由）：
 *   1. human prior 恒带 kind='context'，evidenceAdmissibility() 恒拒——
 *      人类输入不得进证据聚合（哪怕被标成 evidence 也拒：铁律看来源不看标签）；
 *   2. applyHumanApproval() 只改 review status，科学状态（verdict/confidence）
 *      位级不变，批准动作夹带科学状态字段 → fail-closed 抛错；
 *   3. 人类 prior 与机器裁决冲突时并排展示两条原文，resolution 恒
 *      UNRESOLVED——human 不能覆盖 machine，反之亦然；
 *   4. 回滚 = 在链上追加 human_event_reverted（引用被回滚 seq）——审计链
 *      保留原事件，绝不删除；调度事件（question_started 等机器事实）
 *      不可被人类回滚。
 *
 * 权限矩阵（canPerform/assertAuthorized）是工程预算式授权表，不是身份
 * 认证——actor 字符串的真实性由调用方（API 会话层）负责。
 *
 * Cannot-prove：本模块证明「人类输入在台账上可审计、且结构性进不了
 * 裁决/证据路径」，不证明 actor 身份未被冒用（无认证层）、不证明人类
 * 判断本身正确（正确性从来不是审计链的属性）、也不证明投影
 * deriveHumanLoopState 覆盖了人类循环的全部语义（它只投影本模块登记
 * 的事件类型）。
 */

import { appendEvent } from './store.ts';
import { readCampaignEvents } from './event_log.ts';
import type { CampaignEvent, CampaignEventPayload } from './types.ts';

// ---------------------------------------------------------------------------
// HITL 事件判别 + 权限矩阵
// ---------------------------------------------------------------------------

/** 8 种 HITL 事件类型（审计层成员；调度事件不属于人类可写入集合）。 */
export const HUMAN_LOOP_EVENT_TYPES: ReadonlySet<string> = new Set([
  'prior_injected',
  'annotation',
  'resource_veto',
  'revision_requested',
  'campaign_paused',
  'campaign_resumed',
  'risk_accepted',
  'human_event_reverted',
]);

/** 人类循环动作（权限矩阵的列）。 */
export type HumanLoopAction =
  | 'inject_prior' | 'annotate' | 'veto_resource' | 'request_revision'
  | 'pause_campaign' | 'resume_campaign' | 'accept_risk' | 'revert_human_event';

/** 角色（权限矩阵的行；授权表是工程预算，身份认证在会话层）。 */
export type HumanLoopRole = 'principal_investigator' | 'researcher' | 'safety_officer' | 'auditor';

const AUTHORITY_MATRIX: Readonly<Record<HumanLoopRole, readonly HumanLoopAction[]>> = {
  principal_investigator: [
    'inject_prior', 'annotate', 'veto_resource', 'request_revision',
    'pause_campaign', 'resume_campaign', 'accept_risk', 'revert_human_event',
  ],
  researcher: ['inject_prior', 'annotate', 'request_revision', 'pause_campaign', 'resume_campaign'],
  safety_officer: ['veto_resource', 'pause_campaign', 'accept_risk'],
  auditor: [], // 只读角色零写入
};

/** 动作 → 载荷类型（recordHumanEvent 前置：动作与载荷必须一致）。 */
const ACTION_TO_EVENT: Readonly<Record<HumanLoopAction, string>> = {
  inject_prior: 'prior_injected',
  annotate: 'annotation',
  veto_resource: 'resource_veto',
  request_revision: 'revision_requested',
  pause_campaign: 'campaign_paused',
  resume_campaign: 'campaign_resumed',
  accept_risk: 'risk_accepted',
  revert_human_event: 'human_event_reverted',
};

export function canPerform(role: HumanLoopRole, action: HumanLoopAction): boolean {
  return AUTHORITY_MATRIX[role].includes(action);
}

/** fail-closed 权限断言：未授权 → 抛错（不静默降级）。 */
export function assertAuthorized(role: HumanLoopRole, action: HumanLoopAction): void {
  if (!canPerform(role, action)) {
    throw new Error(`assertAuthorized: role '${role}' is not authorized for '${action}' (SCI-HITL-001 authority matrix)`);
  }
}

// ---------------------------------------------------------------------------
// 事件写入（走 store.appendEvent —— 与调度事件同一条 append-only 哈希链）
// ---------------------------------------------------------------------------

/**
 * 登记一条 HITL 事件。前置 fail-closed：payload.type 必须属于 HITL 集合
 * （机器调度事件不得经人类通道伪造写入）。
 */
export function recordHumanEvent(
  dir: string,
  payload: CampaignEventPayload,
  now: () => Date = () => new Date(),
): CampaignEvent {
  if (!HUMAN_LOOP_EVENT_TYPES.has(payload.type)) {
    throw new Error(
      `recordHumanEvent: payload type '${payload.type}' is not a human-loop event — machine scheduling events must not be forged through the human channel`,
    );
  }
  return appendEvent(dir, payload, now);
}

// ---------------------------------------------------------------------------
// 分层铁律 1：human prior 恒为 context，证据聚合恒拒
// ---------------------------------------------------------------------------

export interface AdmissibilityVerdict {
  readonly admissible: boolean;
  readonly reason: string;
}

/**
 * 证据可采性裁定（分层铁律的执行点）：对人类输入恒拒——不看 kind 标签
 * （伪装 kind='evidence' 也拒），因为来源是人类判断而非可复核证据链。
 * 调用方（证据聚合/裁决管线）必须把此函数的结果当作硬边界。
 */
export function evidenceAdmissibility(humanInput: { readonly kind: string; readonly statement?: string }): AdmissibilityVerdict {
  return {
    admissible: false,
    reason:
      `human input (kind='${humanInput.kind}') is context, never admissible as evidence — ` +
      'SCI-HITL-001 layering rule: human priors inform prioritization, not adjudication',
  };
}

// ---------------------------------------------------------------------------
// 分层铁律 2：人类批准不改科学状态
// ---------------------------------------------------------------------------

/** 科学状态最小投影（verdict/confidence 由确定性内核产出）。 */
export interface ScienceStateProjection {
  readonly verdict: string;
  readonly confidence: number;
}

/** 批准动作（不得携带任何科学状态字段——夹带即违宪）。 */
export interface HumanApproval {
  readonly approvedBy: string;
  readonly comment?: string;
}

export interface ApprovalOutcome {
  readonly scienceState: ScienceStateProjection;
  readonly reviewStatus: 'HUMAN_APPROVED';
  readonly approvalNote: string;
}

/**
 * 人类批准：只改 review status，科学状态位级不变。批准动作携带
 * verdict/confidence 字段（试图借批准通道改结论）→ fail-closed 抛错。
 */
export function applyHumanApproval(science: ScienceStateProjection, approval: HumanApproval): ApprovalOutcome {
  if ('verdict' in approval || 'confidence' in approval) {
    throw new Error(
      'applyHumanApproval: approval must not carry scientific-state fields (verdict/confidence) — human approval changes review status only (SCI-HITL-001)',
    );
  }
  return {
    scienceState: { ...science }, // 位级拷贝——不触碰裁决语义
    reviewStatus: 'HUMAN_APPROVED',
    approvalNote: `approved by ${approval.approvedBy}${approval.comment !== undefined ? `: ${approval.comment}` : ''} — review status only; verdict untouched`,
  };
}

// ---------------------------------------------------------------------------
// 分层铁律 3：冲突并排展示（human 不覆盖 machine）
// ---------------------------------------------------------------------------

export interface HumanPriorView { readonly priorId: string; readonly statement: string }
export interface MachineVerdictView { readonly claimId: string; readonly verdict: string; readonly basis: string }

export interface HumanMachineConflict {
  readonly humanView: HumanPriorView;
  readonly machineView: MachineVerdictView;
  readonly sideBySide: string;
  readonly resolution: 'UNRESOLVED';
}

/**
 * 登记人类先验与机器裁决的冲突：两条原文并排，resolution 恒 UNRESOLVED
 * ——分层系统里没有「谁覆盖谁」，只有待复核的分歧（复核是新一轮证据
 * 链的职责，不是本层的）。
 */
export function recordConflict(humanView: HumanPriorView, machineView: MachineVerdictView): HumanMachineConflict {
  const sideBySide = [
    `HUMAN PRIOR [${humanView.priorId}]: ${humanView.statement}`,
    '‖',
    `MACHINE VERDICT [${machineView.claimId}]: ${machineView.verdict} — ${machineView.basis}`,
    '(side by side, unresolved — neither side may overwrite the other; resolve with new evidence, not authority)',
  ].join('\n');
  return { humanView, machineView, sideBySide, resolution: 'UNRESOLVED' };
}

// ---------------------------------------------------------------------------
// 分层铁律 4：回滚 = 追加 REVERTED 标记（审计链保留原事件）
// ---------------------------------------------------------------------------

/**
 * 回滚一条 HITL 事件：在链上追加 human_event_reverted（引用被回滚 seq）。
 * 原事件保留在台账上（审计不可删除）；重复回滚与回滚调度事件都拒绝
 * （机器调度事实不可被人类回滚篡改）。
 */
export function revertHumanEvent(
  dir: string,
  revertedSeq: number,
  actor: string,
  reason: string,
  now: () => Date = () => new Date(),
): CampaignEvent {
  const events = readCampaignEvents(dir);
  const target = events.find((e) => e.seq === revertedSeq);
  if (target === undefined) {
    throw new Error(`revertHumanEvent: event seq ${revertedSeq} not found in the ledger at ${dir}`);
  }
  if (!HUMAN_LOOP_EVENT_TYPES.has(target.payload.type)) {
    throw new Error(
      `revertHumanEvent: cannot revert event seq ${revertedSeq} (${target.payload.type}) — machine scheduling facts are not revertible by humans (SCI-HITL-001 layering)`,
    );
  }
  const alreadyReverted = events.some(
    (e) => e.payload.type === 'human_event_reverted' && e.payload.revertedSeq === revertedSeq,
  );
  if (alreadyReverted) {
    throw new Error(`revertHumanEvent: event seq ${revertedSeq} is already reverted — appending a second revert marker would be a no-op audit entry`);
  }
  return appendEvent(dir, { type: 'human_event_reverted', revertedSeq, actor, reason }, now);
}

// ---------------------------------------------------------------------------
// 人类循环投影（独立于 deriveCampaignState 的调度投影）
// ---------------------------------------------------------------------------

export interface HumanPriorProjection {
  readonly priorId: string;
  readonly statement: string;
  readonly actor: string;
  readonly seq: number;
  readonly reverted: boolean;
}

export interface HumanLoopState {
  readonly paused: boolean;
  readonly priors: readonly HumanPriorProjection[];
  /** 台账中的 HITL 事件数（审计面度量）。 */
  readonly eventCount: number;
  /** 被回滚的 seq 集合（对应事件仍在链上——这里只登记标记）。 */
  readonly revertedSeqs: readonly number[];
}

/**
 * 人类循环状态投影：从台账事件纯折叠（暂停/恢复、先验及其回滚标记）。
 * 与 deriveCampaignState 正交——调度器读调度投影，人类回路读本投影，
 * 两层互不越界。
 */
export function deriveHumanLoopState(events: readonly CampaignEvent[]): HumanLoopState {
  let paused = false;
  const priors: HumanPriorProjection[] = [];
  const revertedSeqs = new Set<number>();
  let eventCount = 0;

  for (const event of events) {
    const p = event.payload;
    if (!HUMAN_LOOP_EVENT_TYPES.has(p.type)) continue;
    eventCount += 1;
    if (p.type === 'campaign_paused') paused = true;
    if (p.type === 'campaign_resumed') paused = false;
    if (p.type === 'prior_injected') {
      priors.push({ priorId: p.priorId, statement: p.statement, actor: p.actor, seq: event.seq, reverted: false });
    }
    if (p.type === 'human_event_reverted') revertedSeqs.add(p.revertedSeq);
  }
  return {
    paused,
    priors: priors.map((prior) => ({ ...prior, reverted: revertedSeqs.has(prior.seq) })),
    eventCount,
    revertedSeqs: [...revertedSeqs].sort((a, b) => a - b),
  };
}

// 动作-事件一致性映射导出（供会话层在 UI/CLI 校验动作与载荷匹配）。
export { ACTION_TO_EVENT };
