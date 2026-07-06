/**
 * fork_types.ts —— M-07 Fork 数据结构：VerdictDelta、ForkManifest、ReplayBranchMetadata。
 *
 * 设计要点：
 *   - 原 run 不可被覆盖；fork 永远产生新 runId。
 *   - fork 输入必须记录 mutation 与 baseEventId。
 *   - VerdictDelta 记录 base→fork 裁决变化，含解释。
 *   - 复用 schema/enums.ts 的 Verdict 类型，不重新定义裁决值。
 *
 * 模型中立：本文件不含任何 provider/model 字面量。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import type { Verdict } from '../schema/enums.ts';
import type { AgentRunEventKind } from './agent_run_event.ts';

// ---------- ForkReason：分叉原因 ----------

export const FORK_REASONS = [
  'source_set_changed',
  'threshold_changed',
  'provider_profile_changed',
  'baseline_ablation',
  'security_attack',
  'human_review',
] as const;

export type ForkReason = (typeof FORK_REASONS)[number];

// ---------- AgentRunFork：分叉清单 ----------

export interface AgentRunFork {
  readonly forkId: string;          // ULID
  readonly baseRunId: string;       // 原 agent_loop 执行 ID
  readonly baseEventId: string;     // 分叉起点的 AgentRunEvent.eventId
  readonly forkReason: ForkReason;
  /** 变更内容：替换的 source set / 收紧的 threshold / 切换的 profile 等。 */
  readonly mutation: Readonly<Record<string, unknown>>;
  readonly createdByRole: string;
  readonly isoTimestamp: string;
}

// ---------- VerdictDelta：裁决差异 ----------

export interface VerdictDelta {
  readonly baseVerdictId: string;
  readonly forkVerdictId: string;
  readonly verdictChanged: boolean;
  readonly from: Verdict;
  readonly to: Verdict;
  /** 自然语言解释裁决为何变化（或未变化）。 */
  readonly explanation: string;
}

// ---------- ReplayBranchMetadata：回放分支元数据 ----------

export interface ReplayBranchMetadata {
  readonly branchId: string;        // ULID
  readonly forkId: string;          // 关联的 fork
  readonly parentBranchId: string | null;
  readonly branchLabel: string;
  /** 分支起点的 checkpoint event kind。 */
  readonly checkpointKind: AgentRunEventKind;
  /** 分支是否已完成回放。 */
  readonly replayCompleted: boolean;
  /** 回放产生的 runId（若 replayCompleted=true）。 */
  readonly replayedRunId: string | null;
  /** 创建时间戳。 */
  readonly isoTimestamp: string;
}

// ---------- 工厂函数 ----------

export function createFork(params: {
  readonly forkId: string;
  readonly baseRunId: string;
  readonly baseEventId: string;
  readonly forkReason: ForkReason;
  readonly mutation: Readonly<Record<string, unknown>>;
  readonly createdByRole: string;
  readonly isoTimestamp: string;
}): AgentRunFork {
  if (params.forkId.trim().length === 0) {
    throw new Error('createFork: forkId must be non-empty');
  }
  if (params.baseRunId.trim().length === 0) {
    throw new Error('createFork: baseRunId must be non-empty');
  }
  if (params.baseEventId.trim().length === 0) {
    throw new Error('createFork: baseEventId must be non-empty');
  }
  if (!(FORK_REASONS as readonly string[]).includes(params.forkReason)) {
    throw new Error(
      `createFork: unknown forkReason "${params.forkReason}", expected one of: ${FORK_REASONS.join(', ')}`,
    );
  }
  if (params.createdByRole.trim().length === 0) {
    throw new Error('createFork: createdByRole must be non-empty');
  }

  return {
    forkId: params.forkId,
    baseRunId: params.baseRunId,
    baseEventId: params.baseEventId,
    forkReason: params.forkReason,
    mutation: params.mutation,
    createdByRole: params.createdByRole,
    isoTimestamp: params.isoTimestamp,
  };
}

export function computeVerdictDelta(params: {
  readonly baseVerdictId: string;
  readonly forkVerdictId: string;
  readonly baseVerdict: Verdict;
  readonly forkVerdict: Verdict;
  readonly explanation: string;
}): VerdictDelta {
  if (params.baseVerdictId.trim().length === 0) {
    throw new Error('computeVerdictDelta: baseVerdictId must be non-empty');
  }
  if (params.forkVerdictId.trim().length === 0) {
    throw new Error('computeVerdictDelta: forkVerdictId must be non-empty');
  }
  if (params.explanation.trim().length === 0) {
    throw new Error('computeVerdictDelta: explanation must be non-empty');
  }

  return {
    baseVerdictId: params.baseVerdictId,
    forkVerdictId: params.forkVerdictId,
    verdictChanged: params.baseVerdict !== params.forkVerdict,
    from: params.baseVerdict,
    to: params.forkVerdict,
    explanation: params.explanation,
  };
}

export function createReplayBranch(params: {
  readonly branchId: string;
  readonly forkId: string;
  readonly parentBranchId: string | null;
  readonly branchLabel: string;
  readonly checkpointKind: AgentRunEventKind;
  readonly isoTimestamp: string;
}): ReplayBranchMetadata {
  if (params.branchId.trim().length === 0) {
    throw new Error('createReplayBranch: branchId must be non-empty');
  }
  if (params.forkId.trim().length === 0) {
    throw new Error('createReplayBranch: forkId must be non-empty');
  }
  if (params.branchLabel.trim().length === 0) {
    throw new Error('createReplayBranch: branchLabel must be non-empty');
  }

  return {
    branchId: params.branchId,
    forkId: params.forkId,
    parentBranchId: params.parentBranchId,
    branchLabel: params.branchLabel,
    checkpointKind: params.checkpointKind,
    replayCompleted: false,
    replayedRunId: null,
    isoTimestamp: params.isoTimestamp,
  };
}
