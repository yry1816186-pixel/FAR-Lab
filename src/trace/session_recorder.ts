/**
 * trace session_recorder —— 运行时 JSONL session 录制/回放（批次 3-H·借鉴 pi JSONL session format）。
 *
 * 动机：FAR-Lab 已有 22 种 AgentRunEventKind（agent_run_event.ts）与 JSONL 导出（far_proof exporter），
 * 但 agent_loop 主循环（fsm_runner）运行时不产生统一 session 流——审计靠事后导出。
 * 本模块让 run 过程实时落 JSONL session（录、回放、审计一体），借鉴 pi 的
 * "JSONL session format + SessionManager API" 设计。
 *
 * 设计纪律：
 *   - 行格式：每行一个紧凑 JSON `{ seq, ts, kind, runId, stageId?, payload? }`（追加式·append-only）。
 *   - 纯文件层：不参与证据哈希链（与 evidence_log 正交）——是审计观察层，非验证输入。
 *   - 回放不抛错：格式损坏的行跳过并计数（审计查询不应因单行异常中断）。
 *   - 确定性：seq 递增 + 同输入同事件序列。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AGENT_RUN_EVENT_KINDS } from './agent_run_event.ts';
import type { AgentRunEventKind } from './agent_run_event.ts';

/** 单条 session 事件（紧凑 JSONL 行）。 */
export interface SessionEvent {
  /** 事件序号（1 起·追加式递增）。 */
  readonly seq: number;
  /** ISO-8601 时间戳（UTC）。 */
  readonly ts: string;
  /** 事件类型（22 种 AgentRunEventKind）。 */
  readonly kind: AgentRunEventKind;
  /** 关联 run id。 */
  readonly runId: string;
  /** 可选 stage id（stage_started/stage_completed 必带）。 */
  readonly stageId?: string;
  /** 可选载荷（如 stage 摘要/hash 锚）。 */
  readonly payload?: Record<string, unknown>;
}

/** 录制统计。 */
export interface SessionStats {
  readonly events: number;
  readonly bytes: number;
}

/** 回放结果。 */
export interface SessionReplay {
  readonly events: readonly SessionEvent[];
  /** 跳过行数（损坏行）。 */
  readonly skippedLines: number;
}

const EVENT_KIND_SET: ReadonlySet<string> = new Set(AGENT_RUN_EVENT_KINDS);

/** 校验 kind（无效 → 抛错·防垃圾进 session）。 */
export function assertEventKind(kind: string): asserts kind is AgentRunEventKind {
  if (!EVENT_KIND_SET.has(kind)) {
    throw new Error(`session_recorder: unknown event kind '${kind}'`);
  }
}

/** 序列化单条事件（紧凑 JSON·确定性字段序）。 */
export function serializeEvent(event: Omit<SessionEvent, 'seq'> & { seq?: number }): string {
  const base: SessionEvent = {
    seq: event.seq ?? 0,
    ts: event.ts,
    kind: event.kind,
    runId: event.runId,
    ...(event.stageId !== undefined ? { stageId: event.stageId } : {}),
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
  };
  return JSON.stringify(base);
}

/**
 * 运行时 Session 录制器（追加式 JSONL）。
 * open(path) → record(event) × N → close()。
 */
export class SessionRecorder {
  private readonly path: string;
  private seq: number;
  private bytes: number;
  private closed: boolean;

  private constructor(path: string) {
    this.path = path;
    this.seq = 0;
    this.bytes = 0;
    this.closed = false;
  }

  /** 打开录制器（目录自动创建；已有文件继续追加——多 run 可共用 session 文件）。 */
  static open(path: string): SessionRecorder {
    mkdirSync(dirname(path), { recursive: true });
    return new SessionRecorder(path);
  }

  /** 追加一条事件（kind 校验；已关闭 → 抛错）。返回事件序号。 */
  record(event: Omit<SessionEvent, 'seq'>): number {
    if (this.closed) {
      throw new Error('session_recorder: recorder is closed');
    }
    assertEventKind(event.kind);
    this.seq += 1;
    const line = `${serializeEvent({ ...event, seq: this.seq })}\n`;
    appendFileSync(this.path, line, 'utf8');
    this.bytes += Buffer.byteLength(line, 'utf8');
    return this.seq;
  }

  /** 关闭录制器（幂等）。 */
  close(): void {
    this.closed = true;
  }

  /** 统计（未关闭也可查）。 */
  stats(): SessionStats {
    return { events: this.seq, bytes: this.bytes };
  }
}

function parseEventLine(line: string): SessionEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null; // 空行跳过（不计损坏）
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.seq !== 'number' ||
      typeof record.ts !== 'string' ||
      typeof record.kind !== 'string' ||
      typeof record.runId !== 'string'
    ) {
      return null;
    }
    assertEventKind(record.kind);
    const stageId = record.stageId;
    const payload = record.payload;
    const event: SessionEvent = {
      seq: record.seq,
      ts: record.ts,
      kind: record.kind,
      runId: record.runId,
      ...(typeof stageId === 'string' ? { stageId } : {}),
      ...(typeof payload === 'object' && payload !== null ? { payload: payload as Record<string, unknown> } : {}),
    };
    return event;
  } catch {
    return null; // 损坏行跳过
  }
}

/** 回放 session 文件（损坏行跳过并计数；行按出现顺序返回）。 */
export function replaySession(path: string): SessionReplay {
  if (!existsSync(path)) {
    throw new Error(`session_recorder: session file not found: ${path}`);
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  const events: SessionEvent[] = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const event = parseEventLine(lines[i]!);
    if (event !== null) {
      events.push(event);
    } else if (lines[i]!.trim().length > 0) {
      skipped += 1;
    }
  }
  return { events, skippedLines: skipped };
}

/** 便捷：run 结束后生成标准 session 文件名。 */
export function defaultSessionPath(home: string, runId: string): string {
  return join(home, 'sessions', `${runId}.jsonl`);
}
