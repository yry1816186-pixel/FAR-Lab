// src/llm_gateway/tape.ts
// 职责：CAMPAIGN-REPLAY-001 第 2 层 —— Model Tape（LIVE 调用录制 → .far/tapes/ → 确定性回放）。
//
// 五层重放中的分工：Retrieval VCR（retrieval/cache.ts，既有）、**Model Tape（本模块）**、
// Orchestration Decision Log（agent_loop/decision_log.ts，本批）、Campaign Replay
// （campaign/replay.ts，既有）、Kernel deterministic replay（far_proof，既有）。
//
// 诚实契约：
//   - Tape 只录制真实 LIVE 调用（entry.mode='LIVE' 是录制事实标记，不是回放标记）；
//     回放产物一律标 mode='RECORDED_REPLAY'——replay 永不冒充 LIVE（宪法红线，
//     与 authenticity-ironlaw R9 同源）。
//   - 写入前脱敏门：复用 retrieval/cache.ts 预留的 detectCachedSecret 密钥形状检测
//     （注释明言「供未来磁带写入器复用」）——检出即拒写（fail-closed，宁可损失一盘
//     tape 不落盘密钥）。
//   - 缺失 tape / 版本漂移 / 部分覆盖都是显式错误与显式报告，绝不静默降级。
//
// Cannot-prove：tape 证明「录制内容逐字节回放一致」；不证明录制之外系统其他分量
// （检索/内核）同时可重放——那是各层各自的重放面，聚合声明见 replay report。

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { detectCachedSecret } from '../retrieval/cache.ts';

/** Tape 存储根（gitignored 运行时产物区）。 */
export const TAPE_ROOT = '.far/tapes';

export const TAPE_SCHEMA_VERSION = 1;

/** 回放模式标签（与 research/schemas.ts 五值执行模式对齐——此处只用到两值）。 */
export type ReplayMode = 'LIVE' | 'RECORDED_REPLAY';

export const TapeEntrySchema = z.object({
  schemaVersion: z.literal(TAPE_SCHEMA_VERSION),
  /** 内容寻址键 = sha256(profile + canonical request)。 */
  requestHash: z.string().length(64),
  stageId: z.string().min(1),
  profile: z.string().min(1),
  /** 录制时的请求载荷（脱敏门后原样保存）。 */
  requestJson: z.string().min(1),
  /** 录制时的响应载荷。 */
  responseJson: z.string().min(1),
  /** 录制来源事实：只有真实 LIVE 调用可入 tape。 */
  mode: z.literal('LIVE'),
  recordedAt: z.string().min(1),
  /** 录制时构建版本（版本漂移检测锚点）。 */
  codeVersion: z.string().min(1),
  /** 脱敏检查结论（passed=false 的 tape 不存在——门在写入前）。 */
  secretScan: z.object({ passed: z.literal(true), detector: z.string().nullable() }),
});

export type TapeEntry = z.infer<typeof TapeEntrySchema>;

/** tape 缺失（fail-closed：缺失 tape 的回放请求不得静默落到网络或空响应）。 */
export class MissingTapeError extends Error {
  readonly stageId: string;
  readonly requestHash: string;
  constructor(stageId: string, requestHash: string) {
    super(`missing tape for stage '${stageId}' (requestHash ${requestHash.slice(0, 12)}…) — no tape, no replay (fail-closed)`);
    this.name = 'MissingTapeError';
    this.stageId = stageId;
    this.requestHash = requestHash;
  }
}

/** tape 版本漂移（录制时构建 ≠ 当前构建——回放结果对当前构建不具代表性，须显式决策）。 */
export class TapeVersionDriftError extends Error {
  readonly recorded: string;
  readonly current: string;
  constructor(recorded: string, current: string) {
    super(`tape version drift: recorded under '${recorded}' but current build is '${current}' — replay invalid without explicit decision`);
    this.name = 'TapeVersionDriftError';
    this.recorded = recorded;
    this.current = current;
  }
}

/** 请求 → 内容寻址哈希（canonical：键排序稳定序列化）。 */
export function tapeRequestHash(profile: string, request: unknown): string {
  return createHash('sha256').update(stableStringify({ profile, request })).digest('hex');
}

/** 确定性序列化（键排序——同请求同哈希，与 fast-json-stable-stringify 同语义的自实现）。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

function tapePath(root: string, stageId: string, requestHash: string): string {
  return join(root, `${stageId}-${requestHash}.json`);
}

export interface RecordTapeInput {
  readonly stageId: string;
  readonly profile: string;
  readonly request: unknown;
  readonly response: unknown;
  readonly codeVersion: string;
  readonly recordedAt?: string;
}

export type RecordTapeResult =
  | { readonly ok: true; readonly entry: TapeEntry; readonly path: string }
  | { readonly ok: false; readonly reason: 'secret-detected'; readonly detector: string };

/**
 * 录制一次 LIVE 调用到 tape（写入前脱敏门：request/response 任一检出密钥形状即拒写）。
 * 调用方必须只在真实 LIVE 调用后调用本函数（mode='LIVE' 是事实声明）。
 */
export function recordTapeCall(root: string, input: RecordTapeInput): RecordTapeResult {
  const requestJson = stableStringify(input.request);
  const responseJson = stableStringify(input.response);
  for (const [label, text] of [['request', requestJson], ['response', responseJson]] as const) {
    const detector = detectCachedSecret(text);
    if (detector !== null) {
      return { ok: false, reason: 'secret-detected', detector: `${label}:${detector}` };
    }
  }
  const entry = TapeEntrySchema.parse({
    schemaVersion: TAPE_SCHEMA_VERSION,
    requestHash: tapeRequestHash(input.profile, input.request),
    stageId: input.stageId,
    profile: input.profile,
    requestJson,
    responseJson,
    mode: 'LIVE',
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    codeVersion: input.codeVersion,
    secretScan: { passed: true, detector: null },
  });
  mkdirSync(root, { recursive: true });
  const path = tapePath(root, entry.stageId, entry.requestHash);
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  return { ok: true, entry, path };
}

export function loadTapeEntry(root: string, stageId: string, profile: string, request: unknown): TapeEntry | null {
  const hash = tapeRequestHash(profile, request);
  const path = tapePath(root, stageId, hash);
  if (!existsSync(path)) return null;
  const parsed = TapeEntrySchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  return parsed.success ? parsed.data : null;
}

export interface ReplayedCall<T> {
  readonly response: T;
  readonly mode: ReplayMode;
  readonly tapeEntry: TapeEntry;
}

/**
 * 从 tape 回放（逐字节一致）：缺失 → MissingTapeError；版本漂移 → TapeVersionDriftError
 * （除非 allowDrift=true 显式放行并记录在返回值）。回放 mode 恒为 RECORDED_REPLAY。
 */
export function replayFromTape<T>(
  root: string,
  stageId: string,
  profile: string,
  request: unknown,
  currentCodeVersion: string,
  options: { readonly allowVersionDrift?: boolean } = {},
): ReplayedCall<T> {
  const entry = loadTapeEntry(root, stageId, profile, request);
  if (entry === null) {
    throw new MissingTapeError(stageId, tapeRequestHash(profile, request));
  }
  if (entry.codeVersion !== currentCodeVersion && options.allowVersionDrift !== true) {
    throw new TapeVersionDriftError(entry.codeVersion, currentCodeVersion);
  }
  return {
    response: JSON.parse(entry.responseJson) as T,
    mode: 'RECORDED_REPLAY', // 回放永不冒充 LIVE（宪法红线）
    tapeEntry: entry,
  };
}

export interface PartialReplayReport {
  readonly requested: readonly { stageId: string; profile: string; request: unknown }[];
  readonly covered: readonly string[];
  readonly missing: readonly string[];
  readonly partial: boolean;
}

/** 部分覆盖报告：哪些 stage 有 tape、哪些缺——部分 replay 必须显式可见，不许静默缩水。 */
export function partialReplayReport(
  root: string,
  requested: readonly { stageId: string; profile: string; request: unknown }[],
): PartialReplayReport {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const r of requested) {
    if (loadTapeEntry(root, r.stageId, r.profile, r.request) !== null) covered.push(r.stageId);
    else missing.push(r.stageId);
  }
  return { requested, covered, missing, partial: missing.length > 0 && covered.length > 0 };
}
