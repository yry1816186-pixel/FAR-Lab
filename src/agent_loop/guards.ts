/**
 * guards.ts — G1 受保护状态转换闸门 + G2 写权限最小化(IC-02 · ADR-019)。
 *
 * 红线:受保护动作(冻结/批准/seal/导出/迁移/删除)的执行许可由**确定性代码**判定,
 * 永远不经 LLM 判断;LLM 建议或外部内容发起的受保护动作 → 默认 deny。
 * 本模块不声称 fool-proof(OWASP 自承);OS 级沙箱=V2 非目标。
 *
 * 零容忍合规:无 any / @ts-ignore / 空 catch / 双重断言。
 */

export const PROTECTED_ACTIONS = ['freeze', 'approve', 'seal', 'export', 'migrate', 'delete'] as const;
export type ProtectedAction = (typeof PROTECTED_ACTIONS)[number];

/** 发起方:人类通道(cli/api)/确定性代码/LLM 建议/外部内容。后两者永不许可。 */
export type ActionInitiator = 'cli_user' | 'api_user' | 'deterministic_code' | 'llm_suggestion' | 'external_content';

export interface GuardDecision {
  readonly allow: boolean;
  readonly reason: string;
}

const HUMAN_INITIATORS: readonly ActionInitiator[] = ['cli_user', 'api_user'];
const DENIED_INITIATORS: readonly ActionInitiator[] = ['llm_suggestion', 'external_content'];

/**
 * 受保护动作闸门(确定性,无 LLM)。
 * 默认 deny:未知动作、未知发起方、LLM 建议、外部内容一律拒绝。
 */
export function protectedActionGuard(action: string, initiator: string): GuardDecision {
  if (!(PROTECTED_ACTIONS as readonly string[]).includes(action)) {
    return { allow: false, reason: `unknown protected action '${action}'(default deny;须在 PROTECTED_ACTIONS 登记)` };
  }
  if (DENIED_INITIATORS.includes(initiator as ActionInitiator)) {
    return {
      allow: false,
      reason:
        `protected action '${action}' DENIED: initiator='${initiator}' — ` +
        'LLM 建议/外部内容不得触发受保护状态转换(G1;提示词不可信,确定性强制)',
    };
  }
  if (initiator === 'deterministic_code') {
    return { allow: true, reason: `initiator=deterministic_code(内核/orchestrator 受信路径)` };
  }
  if (HUMAN_INITIATORS.includes(initiator as ActionInitiator)) {
    return { allow: true, reason: `initiator=${initiator}(人类显式命令通道)` };
  }
  return { allow: false, reason: `unknown initiator '${initiator}'(default deny)` };
}

/**
 * G2 写权限最小化(P1):agent 写路径清单(即审计面)。
 * 清单即全部允许写目标;任何不在清单的写入须视为违规。
 */
export const AGENT_WRITE_MANIFEST = [
  'db:call_records#appendRecord(LLM 调用证据行)',
  'db:evidence_log#appendEvidenceLog(证据行)',
  'db:verdict_nodes#kernel/orchestrator(裁决节点)',
  'db:proof_envelopes#sealProofEnvelope(密封信封)',
  'db:lifecycle_events#applyLifecycleTransition(生命周期迁移)',
  'fs:export-dir#用户显式 --out 目录(.far-proof 导出)',
  'fs:.far/fsm_state.json#fsm advance(非 dry-run)',
  'fs:stage_receipts#stage_receipt_store(resume 收据+快照落盘,IC-06)',
] as const;

/** 写目标是否在清单内(违规=拒绝)。 */
export function isAgentWriteAllowed(target: string): boolean {
  return (AGENT_WRITE_MANIFEST as readonly string[]).includes(target);
}

/** 清单断言:不在清单 → throw(fail-closed)。 */
export function assertAgentWriteAllowed(target: string): void {
  if (!isAgentWriteAllowed(target)) {
    throw new Error(
      `agent write denied: '${target}' 不在 AGENT_WRITE_MANIFEST(G2 写权限最小化;新增写路径须先登记清单)`,
    );
  }
}
