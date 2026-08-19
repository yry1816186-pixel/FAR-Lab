/**
 * lifecycle.ts — 撤回/纠正/supersession 生命周期状态机执行(IC-05 · PT-8)。
 *
 * 冻结 SSOT: docs/design/machine-readable/state-machines/retraction_lifecycle.yaml
 *   active → contested(contest:任意,附 CounterEvidence)
 *   contested → active(反驳被驳回) | corrected | retracted | superseded
 *   corrected / retracted / superseded = 终态(不可逆)
 *
 * 语义:
 *   - 墓碑化:迁移以派生记录表达,原记录永不删除;
 *   - 终态不可逆:非法迁移 fail-closed 抛错;
 *   - 审计:每事件 actor+reason+ts + 事件级 hash 链(canonical 输入
 *     targetKind/targetId/fromState/toState/actor/reason/prevHash);
 *   - 幂等:对当前已在目标终态的重复迁移返回 alreadyInState(不重复插入)。
 *
 * ADR-021:审计不落 falsification_audit_events(其 FK/CHECK 为 falsification 专用);
 * 审计等价性=本表 append-only+hash 链+触发器。
 *
 * 模型中立. 零容忍合规: 无 any / @ts-ignore / 空 catch / 双重断言。
 */

import type Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { createHash } from 'node:crypto';
import canonicalize from '../vendor/canonicalize.js';

/** Constant: LIFECYCLE_STATES. */
export const LIFECYCLE_STATES = ['active', 'contested', 'corrected', 'retracted', 'superseded'] as const;
/** Type alias: lifecycle state. */
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Constant: TERMINAL_STATES. */
export const TERMINAL_STATES: readonly LifecycleState[] = ['corrected', 'retracted', 'superseded'];

/** Constant: LIFECYCLE_TARGET_KINDS. */
export const LIFECYCLE_TARGET_KINDS = ['claim', 'verdict_node', 'proof_envelope', 'evidence'] as const;
/** Type alias: lifecycle target kind. */
export type LifecycleTargetKind = (typeof LIFECYCLE_TARGET_KINDS)[number];

/** 冻结状态机迁移表(非法迁移=拒绝);bundle 侧事件链重放复用(IC-05 对抗修复) */
export const ALLOWED_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  active: ['contested'],
  contested: ['active', 'corrected', 'retracted', 'superseded'],
  corrected: [],
  retracted: [],
  superseded: [],
};

/** Interface defining lifecycle event. */
export interface LifecycleEvent {
  readonly eventId: string;
  readonly targetKind: LifecycleTargetKind;
  readonly targetId: string;
  readonly fromState: LifecycleState;
  readonly toState: LifecycleState;
  readonly actor: string;
  readonly reason: string;
  readonly auditRef: string | null;
  readonly prevHash: string;
  readonly currentHash: string;
  readonly createdAt: string;
}

/** Input parameters for operations involving lifecycle transition input. */
export interface LifecycleTransitionInput {
  readonly targetKind: LifecycleTargetKind;
  readonly targetId: string;
  readonly toState: LifecycleState;
  readonly actor: string;
  readonly reason: string;
  readonly auditRef?: string | null;
}

/** Result/output structure for lifecycle transition result. */
export interface LifecycleTransitionResult {
  readonly event: LifecycleEvent | null;
  /** true = 目标已在该终态,幂等命中(未重复插入) */
  readonly alreadyInState: boolean;
}

const GENESIS_HASH = '0'.repeat(64);

/** 零宽字符集(ZWSP/ZWNJ/ZWJ/BOM):可见性校验前先剥离(V05-F6) */
const ZERO_WIDTH_RE = [/\u200B/g, /\u200C/g, /\u200D/g, /\uFEFF/g];

function visibleLength(value: string): number {
  let stripped = value;
  for (const re of ZERO_WIDTH_RE) {
    stripped = stripped.replace(re, '');
  }
  return stripped.trim().length;
}

/** 写入侧 fail-closed:孤对 surrogate 会被存储层改写为 U+FFFD 并永久毁坏审计链(V05-F3) */
function assertWellFormed(field: string, value: string): void {
  if (!value.isWellFormed()) {
    throw new Error(
      `lifecycle: ${field} contains lone surrogate(存储层将改写为 U+FFFD,审计链将永久 BROKEN;写入侧 fail-closed)`,
    );
  }
}

interface LifecycleEventRow {
  readonly event_id: string;
  readonly target_kind: string;
  readonly target_id: string;
  readonly from_state: string;
  readonly to_state: string;
  readonly actor: string;
  readonly reason: string;
  readonly audit_ref: string | null;
  readonly prev_hash: string;
  readonly current_hash: string;
  readonly created_at: string;
}

function rowToEvent(row: LifecycleEventRow): LifecycleEvent {
  return {
    eventId: row.event_id,
    targetKind: row.target_kind as LifecycleTargetKind,
    targetId: row.target_id,
    fromState: row.from_state as LifecycleState,
    toState: row.to_state as LifecycleState,
    actor: row.actor,
    reason: row.reason,
    auditRef: row.audit_ref,
    prevHash: row.prev_hash,
    currentHash: row.current_hash,
    createdAt: row.created_at,
  };
}

/** 事件 canonical hash(bundle 侧 lifecycle_events.jsonl 独立重算复用,IC-05 对抗修复) */
export function computeEventHash(input: {
  readonly targetKind: LifecycleTargetKind;
  readonly targetId: string;
  readonly fromState: LifecycleState;
  readonly toState: LifecycleState;
  readonly actor: string;
  readonly reason: string;
  readonly prevHash: string;
}): string {
  const canonical = canonicalize(input);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** 查询目标当前状态(无事件=active)。 */
export function getLifecycleState(
  db: Database.Database,
  targetKind: LifecycleTargetKind,
  targetId: string,
): LifecycleState {
  const row = db
    .prepare(
      `SELECT to_state FROM lifecycle_events
       WHERE target_kind = ? AND target_id = ?
       ORDER BY rowid DESC LIMIT 1`,
    )
    .get(targetKind, targetId) as { to_state: string } | undefined;
  return row === undefined ? 'active' : (row.to_state as LifecycleState);
}

/** 查询目标全部迁移历史(升序)。 */
export function listLifecycleEvents(
  db: Database.Database,
  targetKind: LifecycleTargetKind,
  targetId: string,
): LifecycleEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM lifecycle_events
       WHERE target_kind = ? AND target_id = ?
       ORDER BY rowid ASC`,
    )
    .all(targetKind, targetId) as LifecycleEventRow[];
  return rows.map(rowToEvent);
}

/**
 * 执行生命周期迁移(状态机执行层)。
 * - 非法迁移(不在迁移表/终态出发)→ fail-closed 抛错;
 * - 重复迁移至当前终态 → 幂等返回 alreadyInState=true(不插入);
 * - 事件 hash 链接到目标最近事件(目标级链)。
 */
export function applyLifecycleTransition(
  db: Database.Database,
  input: LifecycleTransitionInput,
): LifecycleTransitionResult {
  if (visibleLength(input.actor) === 0) {
    throw new Error('lifecycle: actor must be non-empty(签核留痕;零宽字符不计)');
  }
  if (visibleLength(input.reason) === 0) {
    throw new Error('lifecycle: reason must be non-empty(墓碑化须理由;零宽字符不计)');
  }
  if (input.targetId.trim().length === 0) {
    throw new Error('lifecycle: targetId must be non-empty');
  }
  assertWellFormed('actor', input.actor);
  assertWellFormed('reason', input.reason);
  assertWellFormed('targetId', input.targetId);
  if (input.auditRef !== undefined && input.auditRef !== null) {
    assertWellFormed('auditRef', input.auditRef);
  }

  // V05-F1 修复:fromState 读取/幂等判定/迁移表校验全部移入 IMMEDIATE 事务内。
  // BEGIN IMMEDIATE 在事务开启即取写锁,跨进程并发在锁上排队;后到者重读状态,
  // 竞争同一 contested 目标的双终态落库(TOCTOU)被关闭。
  const apply = db.transaction((): LifecycleTransitionResult => {
    const fromState = getLifecycleState(db, input.targetKind, input.targetId);
    if (fromState === input.toState && TERMINAL_STATES.includes(input.toState)) {
      return { event: null, alreadyInState: true };
    }
    const allowed = ALLOWED_TRANSITIONS[fromState];
    if (!allowed.includes(input.toState)) {
      throw new Error(
        `lifecycle: illegal transition ${fromState} → ${input.toState} ` +
          `(allowed from ${fromState}: ${allowed.length > 0 ? allowed.join(', ') : '(terminal, none)'};` +
          ` SSOT=retraction_lifecycle.yaml,终态不可逆)`,
      );
    }
    const last = db
      .prepare(
        `SELECT current_hash FROM lifecycle_events
         WHERE target_kind = ? AND target_id = ?
         ORDER BY rowid DESC LIMIT 1`,
      )
      .get(input.targetKind, input.targetId) as { current_hash: string } | undefined;
    const prevHash = last?.current_hash ?? GENESIS_HASH;
    const eventCore = {
      targetKind: input.targetKind,
      targetId: input.targetId,
      fromState,
      toState: input.toState,
      actor: input.actor,
      reason: input.reason,
      prevHash,
    };
    const currentHash = computeEventHash(eventCore);
    const eventId = ulid();
    db.prepare(
      `INSERT INTO lifecycle_events (
        event_id, target_kind, target_id, from_state, to_state,
        actor, reason, audit_ref, prev_hash, current_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      eventId,
      input.targetKind,
      input.targetId,
      fromState,
      input.toState,
      input.actor,
      input.reason,
      input.auditRef ?? null,
      prevHash,
      currentHash,
    );
    const row = db
      .prepare(`SELECT * FROM lifecycle_events WHERE event_id = ?`)
      .get(eventId) as LifecycleEventRow;
    return { event: rowToEvent(row), alreadyInState: false };
  });
  return apply.immediate();
}

/** Result/output structure for lifecycle chain verify result. */
export interface LifecycleChainVerifyResult {
  readonly ok: boolean;
  readonly checkedCount: number;
  readonly brokenAtEventId: string | null;
  /** 失败原因(hash 断链/状态机非法);ok=true 时为 null(V05-F2) */
  readonly violation: string | null;
}

/**
 * 事件级 hash 链校验 + SSOT 状态机重放(V05-F2 修复)。
 * 除 hash 链接续外,逐事件重放 retraction_lifecycle.yaml 迁移表:
 *   - 首事件 fromState 必须为 active;后续事件 fromState 必须等于前一事件 toState(连续性);
 *   - 每次迁移必须在 ALLOWED_TRANSITIONS 内(终态后任何事件=非法)。
 * 仅重算 hash 的"合法形式伪造"(如复活 retracted 目标)在此被检出。
 */
export function verifyLifecycleChain(
  db: Database.Database,
  targetKind: LifecycleTargetKind,
  targetId: string,
): LifecycleChainVerifyResult {
  const events = listLifecycleEvents(db, targetKind, targetId);
  let expectedPrev = GENESIS_HASH;
  let expectedState: LifecycleState = 'active';
  for (const event of events) {
    if (event.prevHash !== expectedPrev) {
      return { ok: false, checkedCount: 0, brokenAtEventId: event.eventId, violation: 'prev_hash_link_broken' };
    }
    const recomputed = computeEventHash({
      targetKind: event.targetKind,
      targetId: event.targetId,
      fromState: event.fromState,
      toState: event.toState,
      actor: event.actor,
      reason: event.reason,
      prevHash: event.prevHash,
    });
    if (recomputed !== event.currentHash) {
      return { ok: false, checkedCount: 0, brokenAtEventId: event.eventId, violation: 'event_hash_mismatch' };
    }
    if (event.fromState !== expectedState) {
      return {
        ok: false,
        checkedCount: 0,
        brokenAtEventId: event.eventId,
        violation: `state_continuity_broken(expected from=${expectedState}, got ${event.fromState})`,
      };
    }
    if (!ALLOWED_TRANSITIONS[event.fromState].includes(event.toState)) {
      return {
        ok: false,
        checkedCount: 0,
        brokenAtEventId: event.eventId,
        violation: `illegal_transition(${event.fromState} → ${event.toState};SSOT=retraction_lifecycle.yaml)`,
      };
    }
    expectedPrev = event.currentHash;
    expectedState = event.toState;
  }
  return { ok: true, checkedCount: events.length, brokenAtEventId: null, violation: null };
}
