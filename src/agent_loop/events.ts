/**
 * agent_loop 运行时事件流（P0-3：灵活动态 agent 调度的"进度事件流"层）。
 *
 * 与 SessionRecorder（持久化 JSONL·审计观察层）正交：
 *   - SessionRecorder：落盘·审计·可复算（sessionPath 驱动）
 *   - AgentEventBus：内存·订阅者推送·SSE/CLI/前端实时显示（onEvent 驱动）
 *
 * 事件为判别联合（discriminated union）纯数据对象，可直接 JSON 序列化
 * （SSE 端点逐事件发送）。ADDITIVE ONLY：runAgentLoop 不传 onEvent 时零行为
 * （字节等同基线）。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { StageId, TerminationReason } from './types.ts';
import type { PayloadKind, Verdict } from '../schema/enums.ts';

/**
 * 运行时事件判别联合。全部字段纯数据可 JSON 序列化（SSE 传输安全）。
 */
export type AgentLoopEvent =
  | {
      readonly type: 'run_started';
      readonly runId: string;
      readonly ts: string;
      readonly researchInputHash: string;
      readonly maxIterations: number;
      readonly verdictDriven: boolean;
    }
  | {
      readonly type: 'stage_started';
      readonly runId: string;
      readonly iteration: number;
      readonly stageId: StageId;
      readonly ts: string;
    }
  | {
      readonly type: 'stage_completed';
      readonly runId: string;
      readonly iteration: number;
      readonly stageId: StageId;
      readonly payloadKind: PayloadKind;
      readonly degraded: boolean;
      readonly tokens: number;
      readonly contentHash: string;
      readonly ts: string;
    }
  | {
      readonly type: 'iteration_completed';
      readonly runId: string;
      readonly iteration: number;
      readonly tokensConsumed: number;
      readonly continueIteration: boolean;
      readonly verdict: Verdict | null;
      readonly decisiveRuleId: string | null;
      readonly ts: string;
    }
  | {
      readonly type: 'run_completed';
      readonly runId: string;
      readonly reason: TerminationReason;
      readonly iterations: number;
      readonly artifactCount: number;
      readonly verdict: Verdict | null;
      readonly decisiveRuleId: string | null;
      readonly ts: string;
    }
  | {
      readonly type: 'run_error';
      readonly runId: string;
      readonly code: string;
      readonly message: string;
      readonly iterations: number;
      readonly artifactCount: number;
      readonly ts: string;
    }
  | {
      readonly type: 'stage_held';
      readonly runId: string;
      readonly iteration: number;
      readonly stageId: StageId;
      readonly ts: string;
    }
  | {
      readonly type: 'stage_resumed';
      readonly runId: string;
      readonly iteration: number;
      readonly stageId: StageId;
      readonly ts: string;
    };

/** 事件处理器签名。 */
export type AgentLoopEventHandler = (evt: AgentLoopEvent) => void;

/** 事件名 → payload 的收窄映射（R10 discriminatedUnion narrow·供类型安全 emit）。 */
export type AgentEventMap = {
  [K in AgentLoopEvent['type']]: Extract<AgentLoopEvent, { readonly type: K }>;
};

/**
 * AgentEventBus —— 类型安全的运行时事件总线。
 *
 * - on/once/off：订阅/退订（返回退订函数·防泄漏）
 * - emit：发布（同步顺序调用·与 runAgentLoop 单线程语义一致）
 * - snapshot：历史快照（SSE 重连 / CLI 回放用）
 * - clear：清空历史（不通知订阅者）
 *
 * 历史容量：保留最近 MAX_HISTORY=4096 条（防长期运行内存膨胀）；
 * snapshot 返回副本（事件对象不可变 readonly·无共享突变风险）。
 */
export class AgentEventBus {
  static readonly MAX_HISTORY: number = 4096;

  private readonly handlers: AgentLoopEventHandler[] = [];
  private readonly history: AgentLoopEvent[] = [];

  /** 订阅。返回退订函数（幂等·重复退订安全）。 */
  on(handler: AgentLoopEventHandler): () => void {
    if (this.handlers.includes(handler)) {
      return () => this.off(handler);
    }
    this.handlers.push(handler);
    return () => this.off(handler);
  }

  /** 订阅一次（触发后自动退订）。 */
  once(handler: AgentLoopEventHandler): () => void {
    const wrapped: AgentLoopEventHandler = (evt) => {
      this.off(wrapped);
      handler(evt);
    };
    return this.on(wrapped);
  }

  /** 退订。幂等。 */
  off(handler: AgentLoopEventHandler): void {
    const idx = this.handlers.indexOf(handler);
    if (idx >= 0) {
      this.handlers.splice(idx, 1);
    }
  }

  /** 发布事件：追加历史 + 顺序通知全部订阅者。 */
  emit(evt: AgentLoopEvent): void {
    if (this.history.length >= AgentEventBus.MAX_HISTORY) {
      this.history.shift();
    }
    this.history.push(evt);
    // 顺序快照：订阅者增减不影响本轮派发（防回调中 on/off 改数组下标）
    for (const handler of [...this.handlers]) {
      handler(evt);
    }
  }

  /** 类型安全发布（按 type 收窄 payload）。 */
  emitTyped<K extends AgentLoopEvent['type']>(evt: AgentEventMap[K]): void {
    this.emit(evt);
  }

  /** 历史快照（不可变副本）。 */
  snapshot(): readonly AgentLoopEvent[] {
    return [...this.history];
  }

  /** 按 runId 过滤的历史（SSE 单 run 订阅用）。 */
  snapshotFor(runId: string): readonly AgentLoopEvent[] {
    return this.history.filter((e) => e.runId === runId);
  }

  /** 清空历史（不通知订阅者）。 */
  clear(): void {
    this.history.length = 0;
  }

  /** 当前订阅者数量（测试/诊断用）。 */
  get subscriberCount(): number {
    return this.handlers.length;
  }

  /** 历史条数（测试/诊断用）。 */
  get historyLength(): number {
    return this.history.length;
  }
}

/**
 * 事件筛选器：按 type 过滤（SSE 客户端可订阅子集）。
 * 返回 [type, predicate] 对，配合 AgentEventBus.on 使用。
 */
export function isEventType<T extends AgentLoopEvent['type']>(
  evt: AgentLoopEvent,
  type: T,
): evt is AgentEventMap[T] {
  return evt.type === type;
}
