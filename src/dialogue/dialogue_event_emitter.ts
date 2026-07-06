/**
 * dialogue_event_emitter.ts —— 对话层内部事件系统（6 个内部事件类型）。
 *
 * 设计要点：
 *   - 6 个事件类型独立于 trace/agent_run_event.ts（任务约束：不修改全局枚举）。
 *   - 事件 append-only（禁静默改状态·反幻觉审计·与 18 §AgentRunEvent 守卫同精神）。
 *   - 事件不进 canonicalHash（39 §0#5）；事件 payload 只含可序列化字段。
 *   - 通道互斥：dialogue 层属主环，事件不进评测环。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

import { ulid } from 'ulid';

export const DIALOGUE_EVENT_KINDS = [
  'session_started',
  'session_finalized',
  'dialogue_turn_started',
  'dialogue_turn_completed',
  'intent_inferred',
  'clarification_asked',
] as const;

export type DialogueEventKind = (typeof DIALOGUE_EVENT_KINDS)[number];

export const DIALOGUE_EVENT_DECISIONS = ['allow', 'skip', 'record'] as const;
export type DialogueEventDecision = (typeof DIALOGUE_EVENT_DECISIONS)[number];

export interface DialogueEvent {
  readonly eventId: string;
  readonly eventKind: DialogueEventKind;
  readonly sessionId: string;
  readonly decision: DialogueEventDecision;
  readonly reason: string;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
  readonly isoTimestamp: string;
}

export interface DialogueEventEmitter {
  emit(event: Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> & {
    readonly isoTimestamp?: string;
  }): DialogueEvent;
  getEvents(): readonly DialogueEvent[];
  getBySession(sessionId: string): readonly DialogueEvent[];
  getByKind(kind: DialogueEventKind): readonly DialogueEvent[];
  count(): number;
}

export class InMemoryDialogueEventEmitter implements DialogueEventEmitter {
  private readonly events: DialogueEvent[] = [];

  emit(input: Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> & {
    readonly isoTimestamp?: string;
  }): DialogueEvent {
    const event: DialogueEvent = {
      eventId: ulid(),
      eventKind: input.eventKind,
      sessionId: input.sessionId,
      decision: input.decision,
      reason: input.reason,
      payload: input.payload,
      isoTimestamp: input.isoTimestamp ?? new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  getEvents(): readonly DialogueEvent[] {
    return [...this.events];
  }

  getBySession(sessionId: string): readonly DialogueEvent[] {
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  getByKind(kind: DialogueEventKind): readonly DialogueEvent[] {
    return this.events.filter((e) => e.eventKind === kind);
  }

  count(): number {
    return this.events.length;
  }
}

export function createDialogueEventEmitter(): DialogueEventEmitter {
  return new InMemoryDialogueEventEmitter();
}

export function sessionStartedEvent(sessionId: string, userId: string | null): Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> {
  return {
    eventKind: 'session_started',
    sessionId,
    decision: 'record',
    reason: 'session created to active',
    payload: { userId },
  };
}

export function sessionFinalizedEvent(sessionId: string, frameworkId: string): Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> {
  return {
    eventKind: 'session_finalized',
    sessionId,
    decision: 'record',
    reason: 'session active to finalized',
    payload: { frameworkId },
  };
}

export function dialogueTurnStartedEvent(sessionId: string, turnNo: number): Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> {
  return {
    eventKind: 'dialogue_turn_started',
    sessionId,
    decision: 'record',
    reason: 'user turn appended',
    payload: { turnNo },
  };
}

export function dialogueTurnCompletedEvent(sessionId: string, turnId: string, intentHypothesisId: string | null): Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> {
  return {
    eventKind: 'dialogue_turn_completed',
    sessionId,
    decision: 'record',
    reason: 'assistant turn appended',
    payload: { turnId, intentHypothesisId },
  };
}

export function intentInferredEvent(sessionId: string, intentLabel: string, confidence: number): Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> {
  return {
    eventKind: 'intent_inferred',
    sessionId,
    decision: 'record',
    reason: 'intent hypothesis produced',
    payload: { intentLabel, confidence },
  };
}

export function clarificationAskedEvent(sessionId: string, questionType: string): Omit<DialogueEvent, 'eventId' | 'isoTimestamp'> {
  return {
    eventKind: 'clarification_asked',
    sessionId,
    decision: 'record',
    reason: 'clarification question generated',
    payload: { questionType },
  };
}
