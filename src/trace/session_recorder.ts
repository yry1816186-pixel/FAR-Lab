/**
 * trace session_recorder —— 运行时 JSONL session 录制/回放（JSONL session format）。
 *
 * 动机：FAR-Lab 已有 22 种 AgentRunEventKind（agent_run_event.ts）与 JSONL 导出（far_proof exporter），
 * 但 agent_loop 主循环（fsm_runner）运行时不产生统一 session 流——审计靠事后导出。
 * 本模块让 run 过程实时落 JSONL session（录、回放、审计一体）
 * "JSONL session format + SessionManager API" 设计。
 *
 * 设计纪律：
 *   - 行格式：每行一个紧凑 JSON `{ seq, ts, kind, runId, stageId?, payload? }`（追加式·append-only）。
 *   - 纯文件层：不参与证据哈希链（与 evidence_log 正交）——是审计观察层，非验证输入。
 *   - 回放不抛错：格式损坏的行跳过并计数（审计查询不应因单行异常中断）。
 *   - 确定性：seq 递增 + 同输入同事件序列。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const PRIVATE_KEY_BLOCK_PATTERN = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/gi;
const PRIVATE_KEY_REMAINDER_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*/gi;
const SECRET_VALUE_PATTERN = /sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|\bBearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const INTERNATIONAL_PHONE_PATTERN = /\+\d(?:[\d .()-]{5,}\d)/g;
const SECRET_KEY_SUFFIX_PATTERN = /(?:token|secret|password|passphrase|apikey|authorization|credential|privatekey|accesskey|cookie|sessionid)(?:value|header)?s?$/;
const PII_KEY_PATTERN = /(?:email|e_mail|phone|mobile|address|full_?name|first_?name|last_?name|ssn|social_security_number)s?$/i;
const REDACTED = '[REDACTED]';
const REDACTED_PII = '[REDACTED_PII]';

function redactText(value: string): string {
  return value
    .replace(PRIVATE_KEY_BLOCK_PATTERN, REDACTED)
    .replace(PRIVATE_KEY_REMAINDER_PATTERN, REDACTED)
    .replace(SECRET_VALUE_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED_PII)
    .replace(INTERNATIONAL_PHONE_PATTERN, REDACTED_PII);
}

function isSecretKey(key: string): boolean {
  const normalized = key.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return normalized === 'auth'
    || normalized === 'authheader'
    || normalized === 'oauth'
    || normalized === 'bearer'
    || SECRET_KEY_SUFFIX_PATTERN.test(normalized);
}

/** 脱敏顶层关联标识：不泄露原值，但保留同值间的稳定关联。 */
function redactIdentifier(value: string): string {
  if (redactText(value) === value) return value;
  const digest = createHash('sha256').update('far-session-redacted-id\0').update(value).digest('hex').slice(0, 16);
  return `redacted-${digest}`;
}

/** 深度脱敏：secret 形状值与敏感键名的值替换为 [REDACTED]（录制路径统一执行——文件永不落密）。 */
export function redactPayload(value: unknown): unknown {
  if (typeof value === 'string') {
    // 只用 replace（内部从 0 扫描且重置 lastIndex）；避免全局正则 .test() 的 lastIndex 状态陷阱。
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPayload(item));
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = redactText(key);
      if (isSecretKey(key)) {
        out[safeKey] = REDACTED;
      } else if (PII_KEY_PATTERN.test(key)) {
        out[safeKey] = REDACTED_PII;
      } else {
        out[safeKey] = redactPayload(item);
      }
    }
    return out;
  }
  return value;
}

export interface SessionRecorderOptions {
  /** 显式关闭（优先于环境变量与采样）。关闭态：不建目录、不落盘、record no-op。 */
  readonly enabled?: boolean;
  /** 确定性采样率 (0,1]，默认 1（全量）。按 runId 整体判定，避免孤儿生命周期事件。 */
  readonly samplingRate?: number;
}

function assertEventContract(event: Omit<SessionEvent, 'seq'>): void {
  if (event.runId.trim().length === 0) {
    throw new Error('session_recorder: runId must be non-empty');
  }
  if (!event.ts.endsWith('Z') || Number.isNaN(Date.parse(event.ts))) {
    throw new Error(`session_recorder: ts must be a valid UTC timestamp, got '${redactText(event.ts)}'`);
  }
  const stageEvent = event.kind === 'stage_started' || event.kind === 'stage_completed';
  if (stageEvent && (event.stageId === undefined || event.stageId.trim().length === 0)) {
    throw new Error(`session_recorder: ${event.kind} requires a non-empty stageId`);
  }
}

function lastSequence(path: string): number {
  if (!existsSync(path)) return 0;
  let maximum = 0;
  for (const event of replaySession(path).events) {
    if (Number.isSafeInteger(event.seq) && event.seq >= 1) {
      maximum = Math.max(maximum, event.seq);
    }
  }
  return maximum;
}

/**
 * 运行时 Session 录制器（追加式 JSONL）。
 * open(path) → record(event) × N → close()。
 * 可观测性三旋钮（ENG-OBS-001）：FAR_SESSION_RECORD=off / opts.enabled=false → 完全关闭；
 * opts.samplingRate ∈ (0,1) → 确定性抽样；录制路径统一 secret 脱敏。
 */
export class SessionRecorder {
  private readonly path: string;
  private readonly enabled: boolean;
  private readonly samplingRate: number;
  private seq: number;
  private events: number;
  private bytes: number;
  private closed: boolean;

  private constructor(path: string, enabled: boolean, samplingRate: number, initialSeq: number) {
    this.path = path;
    this.enabled = enabled;
    this.samplingRate = samplingRate;
    this.seq = initialSeq;
    this.events = 0;
    this.bytes = 0;
    this.closed = false;
  }

  /** 打开录制器（目录自动创建；已有文件继续追加——多 run 可共用 session 文件）。 */
  static open(path: string, options: SessionRecorderOptions = {}): SessionRecorder {
    const enabled = options.enabled ?? process.env.FAR_SESSION_RECORD !== 'off';
    if (!enabled) {
      return new SessionRecorder(path, false, 1, 0);
    }
    const rate = options.samplingRate ?? 1;
    if (!(rate > 0 && rate <= 1)) {
      throw new Error(`session_recorder: samplingRate must be in (0,1], got ${rate}`);
    }
    mkdirSync(dirname(path), { recursive: true });
    return new SessionRecorder(path, true, rate, lastSequence(path));
  }

  /** 采样判定（确定性）：同一 runId 的全部事件共享决策。 */
  private sampled(runId: string): boolean {
    if (this.samplingRate >= 1) return true;
    const prefix = createHash('sha256').update(`run|${runId}`).digest().readUInt32BE(0);
    return prefix / 0x1_0000_0000 < this.samplingRate;
  }

  /** 追加一条事件（kind 校验；已关闭 → 抛错；关闭态/被采样掉 → no-op）。返回写入的事件序号（未写入 = 0）。 */
  record(event: Omit<SessionEvent, 'seq'>): number {
    if (this.closed) {
      throw new Error('session_recorder: recorder is closed');
    }
    if (!this.enabled) {
      return 0;
    }
    assertEventKind(event.kind);
    assertEventContract(event);
    if (!this.sampled(event.runId)) {
      return 0;
    }
    const nextSeq = this.seq + 1;
    const payload = event.payload === undefined ? undefined : (redactPayload(event.payload) as Record<string, unknown>);
    const line = `${serializeEvent({
      seq: nextSeq,
      ts: event.ts,
      kind: event.kind,
      runId: redactIdentifier(event.runId),
      ...(event.stageId !== undefined ? { stageId: redactIdentifier(event.stageId) } : {}),
      ...(payload !== undefined ? { payload } : {}),
    })}\n`;
    appendFileSync(this.path, line, 'utf8');
    this.seq = nextSeq;
    this.events += 1;
    this.bytes += Buffer.byteLength(line, 'utf8');
    return nextSeq;
  }

  /** 关闭录制器（幂等）。 */
  close(): void {
    this.closed = true;
  }

  /** 统计（未关闭也可查）。 */
  stats(): SessionStats {
    return { events: this.events, bytes: this.bytes };
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
